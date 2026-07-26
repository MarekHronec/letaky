// Izolovaná lokálna perzistencia osobných dát. Anonymný profil a každý
// Supabase účet majú vlastný namespace; prechod medzi profilmi nikdy dáta
// automaticky nezlučuje.

import { KEYS } from './config.js';
import { readJSON, writeJSON, removeStored } from './lib/util.js';

const PROFILE_SCHEMA = 1;
const GUEST_OWNER = 'guest';
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PERSONAL_KEYS = [
  KEYS.list,
  KEYS.listDeleted,
  KEYS.settings,
  KEYS.legStates,
  KEYS.legStatesV1,
  KEYS.savedLists,
  KEYS.savedListsDeleted,
  KEYS.purchases,
  KEYS.trackedProducts,
];

let owner = GUEST_OWNER;
let legacyChecked = false;

function ownerForUser(userId) {
  if (userId == null || userId === '') return GUEST_OWNER;
  const id = String(userId).trim().toLowerCase();
  if (!USER_ID.test(id)) throw new TypeError('Neplatná identita lokálneho profilu.');
  return `user:${id}`;
}

function suffixFor(baseKey) {
  return String(baseKey).replace(/^letaky\./, '');
}

export function profileStorageKey(baseKey, profileOwner = owner) {
  if (profileOwner !== GUEST_OWNER) {
    if (!profileOwner.startsWith('user:') || !USER_ID.test(profileOwner.slice('user:'.length))) {
      throw new TypeError('Neplatný namespace lokálneho profilu.');
    }
  }
  const segment = profileOwner === GUEST_OWNER
    ? GUEST_OWNER
    : `user.${profileOwner.slice('user:'.length)}`;
  return `${KEYS.profilePrefix}.${segment}.${suffixFor(baseKey)}`;
}

function validEnvelope(value, expectedOwner) {
  return value
    && typeof value === 'object'
    && value.schema === PROFILE_SCHEMA
    && value.owner === expectedOwner
    && Object.prototype.hasOwnProperty.call(value, 'data');
}

// Staré globálne kľúče nemajú preukázateľného vlastníka. Jediná bezpečná
// automatická migrácia je do anonymného lokálneho profilu; prihlásenie ho
// nikdy samo neodošle do cloudu.
export function migrateLegacyToGuest() {
  if (legacyChecked) return;
  legacyChecked = true;

  let complete = true;
  for (const baseKey of PERSONAL_KEYS) {
    let raw = null;
    try {
      raw = localStorage.getItem(baseKey);
    } catch {
      complete = false;
      continue;
    }
    if (raw == null) continue;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Poškodený legacy záznam by pôvodná aplikácia aj tak ignorovala.
      // Nemažeme ho, aby zostala možná ručná obnova.
      complete = false;
      continue;
    }

    const target = profileStorageKey(baseKey, GUEST_OWNER);
    const existing = readJSON(target, null);
    if (validEnvelope(existing, GUEST_OWNER)) {
      // Pri súbehu starej a novej otvorenej verzie radšej legacy kľúč
      // ponecháme na ručnú obnovu, než by sme dve rozdielne identity spojili
      // alebo jednu z nich zahodili.
      if (JSON.stringify(existing.data) === JSON.stringify(parsed)) removeStored(baseKey);
      else complete = false;
      continue;
    } else {
      writeJSON(target, { schema: PROFILE_SCHEMA, owner: GUEST_OWNER, data: parsed });
    }
    const verified = readJSON(target, null);
    if (validEnvelope(verified, GUEST_OWNER)) removeStored(baseKey);
    else complete = false;
  }

  if (complete) {
    writeJSON(KEYS.profileMigration, {
      complete: true,
      migratedTo: GUEST_OWNER,
      version: PROFILE_SCHEMA,
    });
  }
}

export function activeProfileOwner() {
  return owner;
}

export function setActiveProfile(userId = null) {
  migrateLegacyToGuest();
  owner = ownerForUser(userId);
  return owner;
}

export function readProfileJSON(baseKey, fallback = null) {
  migrateLegacyToGuest();
  const value = readJSON(profileStorageKey(baseKey), null);
  return validEnvelope(value, owner) ? value.data ?? fallback : fallback;
}

export function writeProfileJSON(baseKey, data) {
  migrateLegacyToGuest();
  writeJSON(profileStorageKey(baseKey), { schema: PROFILE_SCHEMA, owner, data });
}

export function removeProfileStored(baseKey) {
  removeStored(profileStorageKey(baseKey));
}

export function resetProfileStorageForTests() {
  owner = GUEST_OWNER;
  legacyChecked = false;
}
