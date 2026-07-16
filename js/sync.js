// Voliteľné prihlásenie a synchronizácia cez Supabase. Zvyšok aplikácie
// o Supabase nevie – komunikuje sa cez initSync(onChange) a schedulePush().
//
// Bezpečnostný model: publishable kľúč je verejný, dáta chráni Row Level
// Security na tabuľke user_data (každý používateľ vidí len svoj riadok).
// Presné policies sú v supabase/schema.sql – pri zmene projektu ich over.

import { SUPABASE, PUSH_DEBOUNCE_MS } from './config.js';
import { state, sanitizeSettings, saveSettings, mergeLegStates, mergeSavedLists } from './state.js';
import * as shopping from './shopping.js';

let client = null;
let pushTimer = null;
let pushBusy = false;
let pushQueued = false;
let onChange = () => {};

async function getClient() {
  if (client) return client;
  if (!SUPABASE.url || !SUPABASE.key) return null;
  try {
    const mod = await import(SUPABASE.clientUrl);
    client = mod.createClient(SUPABASE.url, SUPABASE.key, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    state.syncUnavailable = false;
    return client;
  } catch {
    // esm.sh nedostupné alebo blokované – appka beží ďalej lokálne,
    // profil zobrazí vysvetlenie namiesto prihlasovacieho formulára
    state.syncUnavailable = true;
    return null;
  }
}

async function connect() {
  const wasUnavailable = state.syncUnavailable;
  const c = await getClient();
  if (!c) {
    if (state.view === 'profil') onChange();
    return;
  }
  if (wasUnavailable && state.view === 'profil') onChange();
  try {
    c.auth.onAuthStateChange((_event, session) => {
      const prevId = state.user?.id;
      state.user = session ? { id: session.user.id, email: session.user.email } : null;
      // authOnly: stačí obnoviť indikátor prihlásenia, netreba prekresliť
      // celý view (auth eventy chodia aj pri tichom obnovení tokenu)
      onChange({ authOnly: true });
      if (state.user && state.user.id !== prevId) {
        cloudPull();
      } else if (!state.user) {
        state.sync = '';
      }
    });
  } catch {
    // bez auth eventov sa sync jednoducho nespustí
  }
}

export function initSync(onChangeCallback) {
  onChange = onChangeCallback;
  connect();
  // po návrate pripojenia skúsime klienta načítať znova
  addEventListener('online', () => {
    if (state.syncUnavailable) connect();
  });
}

// Zlúči vzdialené dáta do lokálnych. Nastavenia sa preberajú len pri pulle
// (nemajú časové pečiatky) – pri pushi by prepísali práve vykonanú zmenu.
function mergeCloudData(remote, { includeSettings }) {
  if (!remote || typeof remote !== 'object') return;
  shopping.mergeRemote(remote.shopping, remote.shoppingDeleted);
  mergeLegStates(remote.legStates);
  mergeSavedLists(remote.savedLists, remote.savedListsDeleted);
  if (includeSettings && remote.settings && typeof remote.settings === 'object') {
    state.settings = sanitizeSettings(remote.settings);
    saveSettings();
  }
}

export async function cloudPull() {
  const c = await getClient();
  if (!c || !state.user) return;
  state.sync = 'syncing';
  if (state.view === 'profil') onChange();
  try {
    const { data, error } = await c.from('user_data').select('data').eq('user_id', state.user.id).maybeSingle();
    if (error) throw error;
    mergeCloudData(data?.data || null, { includeSettings: true });
    state.sync = 'saved';
    onChange();
    schedulePush(); // po merge nahráme zjednotený stav späť
  } catch {
    state.sync = 'error';
    if (state.view === 'profil') onChange();
  }
}

export async function cloudPush() {
  const c = await getClient();
  if (!c || !state.user) return;
  if (pushBusy) {
    pushQueued = true;
    return;
  }
  pushBusy = true;
  state.sync = 'syncing';
  if (state.view === 'profil') onChange();
  try {
    // read–merge–write: pred zápisom zlúčime, čo medzitým zapísalo iné
    // zariadenie, aby sme mu neprepísali stavy legislatívy či históriu
    const { data: current, error: readError } = await c
      .from('user_data')
      .select('data')
      .eq('user_id', state.user.id)
      .maybeSingle();
    if (readError) throw readError;
    const remote = current?.data || null;
    if (remote) {
      mergeCloudData(remote, { includeSettings: false });
      onChange();
    }
    const payload = {
      sync_version: 3,
      shopping: shopping.items,
      shoppingDeleted: shopping.deleted,
      settings: state.settings,
      legStates: state.legStates,
      savedLists: state.savedLists,
      savedListsDeleted: state.savedListsDeleted,
    };
    const { error } = await c
      .from('user_data')
      .upsert({ user_id: state.user.id, data: payload }, { onConflict: 'user_id' });
    if (error) throw error;
    state.sync = 'saved';
  } catch {
    state.sync = 'error';
  } finally {
    pushBusy = false;
    if (pushQueued) {
      pushQueued = false;
      schedulePush();
    }
    if (state.view === 'profil') onChange();
  }
}

// Odloží push, aby séria rýchlych zmien skončila jedným zápisom.
export function schedulePush() {
  if (!state.user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(cloudPush, PUSH_DEBOUNCE_MS);
}

export async function login(email, password) {
  const c = await getClient();
  if (!c) return { error: 'Prihlásenie je momentálne nedostupné – skontroluj pripojenie a skús znova.' };
  const { error } = await c.auth.signInWithPassword({ email, password });
  return { error: error ? error.message : null };
}

export async function logout() {
  const c = await getClient();
  if (c) {
    try {
      await c.auth.signOut();
    } catch {
      // session zmažeme lokálne aj keď server nedopovedal
    }
  }
  state.user = null;
  state.sync = '';
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
