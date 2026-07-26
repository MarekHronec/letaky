// Voliteľné prihlásenie a synchronizácia cez Supabase. Osobné lokálne dáta
// sú oddelené podľa user_id; guest ani iný účet sa nikdy implicitne nemerguje.

import { SUPABASE, PUSH_DEBOUNCE_MS } from './config.js';
import {
  state,
  sanitizeSettings,
  saveSettings,
  mergeLegStates,
  mergeSavedLists,
  reloadProfileState,
} from './state.js';
import { setActiveProfile } from './profile-storage.js';
import * as shopping from './shopping.js';
import * as purchases from './purchases.js';
import * as tracking from './tracking.js';

let client = null;
let authSubscription = null;
let onlineHandlerAttached = false;
let pushTimer = null;
let pushBusyContext = null;
let pushQueuedContext = null;
let syncReady = false;
let syncDirty = false;
let identityEpoch = 0;
let authSerial = Promise.resolve();
let onChange = () => {};

async function getClient() {
  if (client) return client;
  if (!SUPABASE.url || !SUPABASE.key) return null;
  try {
    // Konfiguračná cesta je relatívna ku koreňu stránky. Dynamic import by ju
    // inak vyhodnotil voči tomuto súboru a hľadal neexistujúce js/js/vendor/.
    const moduleUrl = new URL(SUPABASE.clientUrl, document.baseURI).href;
    const mod = await import(moduleUrl);
    client = mod.createClient(SUPABASE.url, SUPABASE.key, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    state.syncUnavailable = false;
    return client;
  } catch {
    state.syncUnavailable = true;
    return null;
  }
}

function contextForCurrentUser() {
  return state.user ? { userId: state.user.id, epoch: identityEpoch } : null;
}

function sameContext(context) {
  return Boolean(
    context
    && state.user
    && context.userId === state.user.id
    && context.epoch === identityEpoch,
  );
}

function cancelScheduledPush() {
  clearTimeout(pushTimer);
  pushTimer = null;
  pushQueuedContext = null;
  syncDirty = false;
}

function reloadActiveProfile(userId) {
  setActiveProfile(userId);
  reloadProfileState();
  shopping.reloadProfile();
  purchases.reloadProfile();
  tracking.reloadProfile();
}

// Jediný vstup pre INITIAL_SESSION, login, logout aj prepnutie účtu.
// Rehydratácia prebehne skôr než UI uvidí novú identitu.
export async function activateSession(session) {
  const nextId = session?.user?.id || null;
  const previousId = state.user?.id || null;

  if (state.identityReady && nextId === previousId) {
    state.user = session
      ? { id: nextId, email: session.user.email || state.user?.email || '' }
      : null;
    onChange({ authOnly: true });
    return contextForCurrentUser();
  }

  identityEpoch += 1;
  cancelScheduledPush();
  syncReady = !nextId;
  state.user = session ? { id: nextId, email: session.user.email || '' } : null;
  reloadActiveProfile(nextId);
  state.identityReady = true;
  state.sync = '';
  onChange();

  const context = contextForCurrentUser();
  // Pull beží mimo auth callback/serial queue. Ďalší auth event tak môže
  // okamžite zvýšiť epoch a oneskorenú odpoveď bezpečne zneplatniť.
  if (context) cloudPull(context);
  return context;
}

function queueSession(session) {
  authSerial = authSerial.catch(() => {}).then(() => activateSession(session));
  return authSerial;
}

function remoteMatchesOwner(remote, context) {
  return !remote?.owner_id || remote.owner_id === context.userId;
}

function mergeCloudData(remote, { includeSettings }) {
  if (!remote || typeof remote !== 'object') return;
  shopping.mergeRemote(remote.shopping, remote.shoppingDeleted);
  purchases.mergeRemote(remote.purchases);
  mergeLegStates(remote.legStates);
  mergeSavedLists(remote.savedLists, remote.savedListsDeleted);
  tracking.mergeRemote(remote.trackedProducts);
  if (includeSettings && remote.settings && typeof remote.settings === 'object') {
    state.settings = sanitizeSettings(remote.settings);
    saveSettings();
  }
}

export async function cloudPull(context = contextForCurrentUser()) {
  const c = await getClient();
  if (!c || !sameContext(context)) return;
  state.sync = 'syncing';
  if (state.view === 'profil') onChange();
  try {
    const { data, error } = await c
      .from('user_data')
      .select('data')
      .eq('user_id', context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!sameContext(context)) return;
    const remote = data?.data || null;
    if (!remoteMatchesOwner(remote, context)) throw new Error('Cloud profil patrí inému účtu.');
    mergeCloudData(remote, { includeSettings: true });
    if (!sameContext(context)) return;
    syncReady = true;
    syncDirty = true; // uloží union a doplní owner_id/sync_version
    state.sync = 'saved';
    onChange();
    schedulePush(context);
  } catch {
    if (!sameContext(context)) return;
    syncReady = false;
    state.sync = 'error';
    if (state.view === 'profil') onChange();
  }
}

export async function cloudPush(context = contextForCurrentUser()) {
  const c = await getClient();
  if (!c || !sameContext(context)) return;
  if (!syncReady) {
    syncDirty = true;
    return;
  }
  if (pushBusyContext) {
    syncDirty = true;
    pushQueuedContext = context;
    return;
  }

  pushBusyContext = context;
  syncDirty = false;
  state.sync = 'syncing';
  if (state.view === 'profil') onChange();
  try {
    const { data: current, error: readError } = await c
      .from('user_data')
      .select('data')
      .eq('user_id', context.userId)
      .maybeSingle();
    if (readError) throw readError;
    if (!sameContext(context)) return;
    const remote = current?.data || null;
    if (!remoteMatchesOwner(remote, context)) throw new Error('Cloud profil patrí inému účtu.');
    if (remote) {
      mergeCloudData(remote, { includeSettings: false });
      if (!sameContext(context)) return;
      onChange();
    }

    const payload = {
      sync_version: 5,
      owner_id: context.userId,
      shopping: shopping.items,
      shoppingDeleted: shopping.deleted,
      purchases: purchases.records,
      settings: state.settings,
      legStates: state.legStates,
      savedLists: state.savedLists,
      savedListsDeleted: state.savedListsDeleted,
      trackedProducts: tracking.records,
    };
    if (!sameContext(context)) return;
    const { error } = await c
      .from('user_data')
      .upsert({ user_id: context.userId, data: payload }, { onConflict: 'user_id' });
    if (error) throw error;
    if (!sameContext(context)) return;
    state.sync = 'saved';
  } catch {
    if (sameContext(context)) {
      syncDirty = true;
      state.sync = 'error';
    }
  } finally {
    if (pushBusyContext === context) pushBusyContext = null;
    const queued = pushQueuedContext;
    pushQueuedContext = null;
    if (queued && sameContext(queued)) schedulePush(queued);
    if (sameContext(context) && state.view === 'profil') onChange();
  }
}

// Odloží push, ale kontext účtu zachytí už pri plánovaní. Timer účtu A sa po
// prepnutí nikdy nesmie spustiť nad dátami účtu B.
export function schedulePush(context = contextForCurrentUser()) {
  if (!sameContext(context)) return;
  syncDirty = true;
  if (!syncReady) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    cloudPush(context);
  }, PUSH_DEBOUNCE_MS);
}

async function bootstrapClient() {
  const c = await getClient();
  if (!c) {
    await queueSession(null);
    return;
  }

  if (!authSubscription) {
    const result = c.auth.onAuthStateChange((_event, session) => {
      // Auth callback nesmie čakať na ďalšiu Supabase operáciu. Serializovaný
      // prechod spustíme v ďalšom microtasku.
      queueMicrotask(() => {
        queueSession(session).catch(() => {});
      });
    });
    authSubscription = result?.data?.subscription || result || true;
  }

  try {
    const { data, error } = await c.auth.getSession();
    if (error) throw error;
    state.syncUnavailable = false;
    await queueSession(data?.session || null);
  } catch {
    await queueSession(null);
    state.syncUnavailable = true;
  }
}

export async function initSync(onChangeCallback) {
  onChange = onChangeCallback;
  await bootstrapClient();
  if (!onlineHandlerAttached) {
    onlineHandlerAttached = true;
    addEventListener('online', () => {
      if (state.syncUnavailable) {
        bootstrapClient();
        return;
      }
      const context = contextForCurrentUser();
      if (!context) return;
      if (!syncReady) cloudPull(context);
      else if (syncDirty) schedulePush(context);
    });
  }
}

export async function login(email, password) {
  const c = await getClient();
  if (!c) return { error: 'Prihlásenie je momentálne nedostupné – skontroluj pripojenie a skús znova.' };
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (!error && data?.session) await queueSession(data.session);
  return { error: error ? error.message : null };
}

export async function logout() {
  // Účtové dáta skryjeme okamžite. Aj keď sieťový signOut zlyhá, guest nikdy
  // neuvidí cache účtu; tá zostane bezpečne v jeho vlastnom namespace.
  const c = client;
  await queueSession(null);
  if (c) {
    try {
      await c.auth.signOut();
    } catch {
      // Lokálny profil je už guest; serverový token sa skúsi zrušiť neskôr.
    }
  }
}

export function syncLabel() {
  return state.sync === 'syncing'
    ? 'Synchronizujem…'
    : state.sync === 'saved'
      ? 'Synchronizované ✓'
      : state.sync === 'error'
        ? 'Synchronizácia zlyhala – skúsim znova'
        : '';
}

// Test seam bez vplyvu na produkčný tok.
export function setSyncClientForTests(value) {
  client = value;
  authSubscription = null;
}

export function syncDebugStateForTests() {
  return { identityEpoch, syncReady, syncDirty, pushBusy: Boolean(pushBusyContext) };
}
