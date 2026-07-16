// Zdieľaný stav aplikácie + lokálna perzistencia nastavení, stavov legislatívy
// a histórie nákupov. Nákupný zoznam má vlastný modul (shopping.js).

import { KEYS, VIEWS, DEALS_PAGE_SIZE, TOMBSTONE_TTL_MS } from './config.js';
import { arr, num, isoValue, readJSON, writeJSON, removeStored } from './lib/util.js';

export const LEG_STATE_VALUES = ['done', 'irrelevant', 'ignored'];

function initialView() {
  const v = location.hash.slice(1);
  return VIEWS.includes(v) ? v : 'overview';
}

export const state = {
  // dáta aktuálneho týždňa (normalizované v data.js)
  data: null,
  items: [],
  top: [],
  week: 'latest',

  // UI stav
  view: initialView(),
  store: 'all',
  filter: 'all',
  sort: 'discount',
  query: '',
  dealsLimit: DEALS_PAGE_SIZE,
  promoOpen: false,

  // legislatíva a referenčné ceny
  legData: null, // null = načítava sa, false = zlyhalo
  legCat: 'all',
  legHide: false,
  refData: null,

  // účet a synchronizácia
  user: null,
  sync: '', // '' | 'syncing' | 'saved' | 'error'
  syncUnavailable: false, // nepodarilo sa načítať Supabase klienta (offline / blokované CDN)
  loginErr: '',
  loginBusy: false,

  // perzistentné používateľské dáta
  settings: loadSettings(),
  legStates: loadLegStates(),
  savedLists: loadSavedLists(),
  savedListsDeleted: loadSavedListsDeleted(),
};

// ---------------------------------------------------------------------------
// Nastavenia
// ---------------------------------------------------------------------------

export function sanitizeSettings(raw) {
  const v = raw && typeof raw === 'object' ? raw : {};
  return {
    dph: v.dph === 'platca' ? 'platca' : 'neplatca',
    hideCard: Boolean(v.hideCard),
    dphPeriod: ['mesacne', 'stvrtrocne'].includes(v.dphPeriod) ? v.dphPeriod : '',
  };
}

function loadSettings() {
  return sanitizeSettings(readJSON(KEYS.settings));
}

export function saveSettings() {
  writeJSON(KEYS.settings, state.settings);
}

// ---------------------------------------------------------------------------
// Stavy položiek legislatívy: { kluc: { st, updatedAt } }
// st je 'done' | 'irrelevant' | 'ignored'; prázdne st je tombstone po odznačení
// (vďaka časovej pečiatke sa odznačenie presadí aj cez cloud sync).
// ---------------------------------------------------------------------------

export function sanitizeLegStates(rawObj) {
  const out = {};
  if (!rawObj || typeof rawObj !== 'object' || Array.isArray(rawObj)) return out;
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  for (const [key, value] of Object.entries(rawObj)) {
    // stará podoba (plochý string) – z migrácie alebo zo staršieho cloud záznamu
    if (typeof value === 'string') {
      if (LEG_STATE_VALUES.includes(value)) out[key] = { st: value, updatedAt: new Date(0).toISOString() };
      continue;
    }
    if (!value || typeof value !== 'object') continue;
    const st = LEG_STATE_VALUES.includes(value.st) ? value.st : '';
    const updatedAt = isoValue(value.updatedAt, '');
    if (!updatedAt) continue;
    if (!st && Date.parse(updatedAt) < cutoff) continue; // starý tombstone už netreba držať
    out[key] = { st, updatedAt };
  }
  return out;
}

function loadLegStates() {
  const v2 = readJSON(KEYS.legStates);
  if (v2) return sanitizeLegStates(v2);
  const v1 = readJSON(KEYS.legStatesV1); // jednorazová migrácia zo starého formátu
  if (v1) {
    const migrated = sanitizeLegStates(v1);
    writeJSON(KEYS.legStates, migrated);
    removeStored(KEYS.legStatesV1);
    return migrated;
  }
  return {};
}

export function legStateOf(key) {
  return state.legStates[key]?.st || '';
}

// Klik na už aktívny stav ho zruší (zapíše tombstone).
export function setLegState(key, st) {
  const next = legStateOf(key) === st ? '' : st;
  state.legStates[key] = { st: next, updatedAt: new Date().toISOString() };
  saveLegStates();
}

export function saveLegStates() {
  state.legStates = sanitizeLegStates(state.legStates);
  writeJSON(KEYS.legStates, state.legStates);
}

// Zlúči vzdialené stavy s lokálnymi – pre každý kľúč vyhráva novší zápis.
export function mergeLegStates(remote) {
  const incoming = sanitizeLegStates(remote);
  for (const [key, value] of Object.entries(incoming)) {
    const local = state.legStates[key];
    if (!local || Date.parse(value.updatedAt) > Date.parse(local.updatedAt)) state.legStates[key] = value;
  }
  saveLegStates();
}

// ---------------------------------------------------------------------------
// História nákupov (uložené zoznamy) + tombstones pre sync mazania.
// Uložený nákup sa nikdy needituje, len vzniká a maže sa – preto pri merge
// tombstone vždy vyhráva nad záznamom s rovnakým id.
// ---------------------------------------------------------------------------

export function sanitizeSavedList(x) {
  if (!x || !x.id || !Array.isArray(x.items)) return null;
  return {
    id: String(x.id),
    name: String(x.name || 'Nákup').slice(0, 80),
    savedAt: isoValue(x.savedAt, new Date(0).toISOString()),
    total: num(x.total) ?? 0,
    savings: num(x.savings) ?? 0,
    count: num(x.count) ?? x.items.length,
    items: x.items,
  };
}

function sanitizeSavedTombstone(x) {
  if (!x || !x.id) return null;
  const deletedAt = isoValue(x.deletedAt, '');
  return deletedAt ? { id: String(x.id), deletedAt } : null;
}

function loadSavedLists() {
  return arr(readJSON(KEYS.savedLists)).map(sanitizeSavedList).filter(Boolean);
}

function loadSavedListsDeleted() {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  return arr(readJSON(KEYS.savedListsDeleted))
    .map(sanitizeSavedTombstone)
    .filter(Boolean)
    .filter(t => Date.parse(t.deletedAt) >= cutoff);
}

export function saveSavedLists() {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  state.savedListsDeleted = state.savedListsDeleted.filter(t => Date.parse(t.deletedAt) >= cutoff);
  writeJSON(KEYS.savedLists, state.savedLists);
  writeJSON(KEYS.savedListsDeleted, state.savedListsDeleted);
}

export function addSavedList(entry) {
  state.savedLists.unshift(entry);
  state.savedListsDeleted = state.savedListsDeleted.filter(t => t.id !== entry.id);
  saveSavedLists();
}

export function deleteSavedList(id) {
  state.savedLists = state.savedLists.filter(x => x.id !== id);
  state.savedListsDeleted.push({ id: String(id), deletedAt: new Date().toISOString() });
  saveSavedLists();
}

export function mergeSavedLists(remoteLists, remoteDeleted) {
  const tombs = new Map(state.savedListsDeleted.map(t => [t.id, t]));
  arr(remoteDeleted)
    .map(sanitizeSavedTombstone)
    .filter(Boolean)
    .forEach(t => {
      const existing = tombs.get(t.id);
      if (!existing || Date.parse(t.deletedAt) > Date.parse(existing.deletedAt)) tombs.set(t.id, t);
    });

  const byId = new Map(state.savedLists.map(l => [l.id, l]));
  arr(remoteLists)
    .map(sanitizeSavedList)
    .filter(Boolean)
    .forEach(l => {
      if (!byId.has(l.id)) byId.set(l.id, l);
    });

  state.savedListsDeleted = [...tombs.values()];
  const deletedIds = new Set(state.savedListsDeleted.map(t => t.id));
  state.savedLists = [...byId.values()]
    .filter(l => !deletedIds.has(l.id))
    .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  saveSavedLists();
}
