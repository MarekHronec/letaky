// Nákupný zoznam: položky, tombstones zmazaných položiek (kvôli syncu medzi
// zariadeniami) a operácie nad zoznamom. Modul NErenderuje a NEpushuje do
// cloudu – to orchestruje app.js po každej mutácii.

import { KEYS, STORE_ORDER, TOMBSTONE_TTL_MS } from './config.js';
import { state } from './state.js';
import { storeId } from './data.js';
import { arr, num, uid, isoValue, readJSON, writeJSON } from './lib/util.js';

// Aktívne položky zoznamu a záznamy o zmazaní. Live bindings – importujúce
// moduly vidia vždy aktuálny stav, prepisovať ich smie len tento modul.
export let items = loadList();
export let deleted = loadTombstones();

// Monotónna časová pečiatka mutácií – dve rýchle zmeny po sebe nedostanú
// rovnaký čas, takže merge medzi zariadeniami vie určiť poradie.
let lastMutationMs = 0;
export function nextUpdatedAt() {
  const t = Math.max(Date.now(), lastMutationMs + 1);
  lastMutationMs = t;
  return new Date(t).toISOString();
}

// ---------------------------------------------------------------------------
// Sanitizácia – jediné miesto, kadiaľ vchádzajú položky zvonka
// (localStorage, cloud, zdieľací link, JSON import).
// ---------------------------------------------------------------------------

export function sanitizeListItem(x) {
  if (!x || !String(x.name || '').trim()) return null;
  const addedAt = isoValue(x.addedAt, new Date().toISOString());
  const updatedAt = isoValue(x.updatedAt || x.checkedAt || addedAt, addedAt);
  const deletedAt = isoValue(x.deletedAt, '') || null;
  return {
    id: String(x.id || uid()),
    source: x.source === 'manual' ? 'manual' : 'deal',
    offerId: x.offerId || '',
    productId: x.productId || null,
    name: String(x.name).trim(),
    amount: x.amount || null,
    store: x.store || null,
    price: num(x.price),
    priceVat: num(x.priceVat),
    originalPrice: num(x.originalPrice),
    originalPriceVat: num(x.originalPriceVat),
    unitPrice: num(x.unitPrice),
    condition: x.condition || '',
    validFrom: x.validFrom || '',
    validTo: x.validTo || '',
    quantity: Math.max(1, Number(x.quantity) || 1),
    checked: Boolean(x.checked),
    addedAt,
    checkedAt: isoValue(x.checkedAt, '') || null,
    updatedAt,
    deletedAt,
  };
}

export function sanitizeTombstone(x) {
  if (!x || !x.id) return null;
  const deletedAt = isoValue(x.deletedAt || x.updatedAt, '');
  if (!deletedAt) return null;
  const rawUpdated = isoValue(x.updatedAt, deletedAt);
  const updatedAt = Date.parse(rawUpdated) >= Date.parse(deletedAt) ? rawUpdated : deletedAt;
  return { id: String(x.id), updatedAt, deletedAt };
}

// Najnovšia časová pečiatka záznamu – rozhoduje, ktorá verzia vyhrá pri merge.
export function versionTime(x) {
  return Math.max(
    Date.parse(x?.updatedAt || '') || 0,
    Date.parse(x?.deletedAt || '') || 0,
    Date.parse(x?.checkedAt || '') || 0,
    Date.parse(x?.addedAt || '') || 0,
  );
}

function loadList() {
  const stored = readJSON(KEYS.list);
  if (Array.isArray(stored)) {
    return stored
      .map(sanitizeListItem)
      .filter(Boolean)
      .filter(x => !x.deletedAt);
  }
  return [];
}

function loadTombstones() {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  return arr(readJSON(KEYS.listDeleted))
    .map(sanitizeTombstone)
    .filter(Boolean)
    .filter(t => versionTime(t) >= cutoff);
}

export function persist() {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  deleted = deleted.map(sanitizeTombstone).filter(t => t && versionTime(t) >= cutoff);
  writeJSON(KEYS.list, items);
  writeJSON(KEYS.listDeleted, deleted);
}

// ---------------------------------------------------------------------------
// Merge medzi zariadeniami: pre každé id vyhráva verzia s novšou pečiatkou;
// pri zhode časov má prednosť zmazanie.
// ---------------------------------------------------------------------------

function mergeVersioned(localItems, localDeleted, remoteItems, remoteDeleted) {
  const versions = new Map();
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  const consider = v => {
    if (!v) return;
    const prev = versions.get(v.id);
    const vt = versionTime(v);
    const pt = versionTime(prev);
    if (!prev || vt > pt || (vt === pt && v.deletedAt && !prev.deletedAt)) versions.set(v.id, v);
  };
  const considerItem = x => {
    const v = sanitizeListItem(x);
    consider(v?.deletedAt ? sanitizeTombstone(v) : v);
  };
  arr(localItems).forEach(considerItem);
  arr(remoteItems).forEach(considerItem);
  arr(localDeleted).forEach(x => consider(sanitizeTombstone(x)));
  arr(remoteDeleted).forEach(x => consider(sanitizeTombstone(x)));

  const active = [];
  const tombstones = [];
  versions.forEach(v => {
    if (v.deletedAt) {
      if (versionTime(v) >= cutoff) tombstones.push(sanitizeTombstone(v));
    } else {
      active.push(v);
    }
  });
  return { active, deleted: tombstones };
}

export function mergeRemote(remoteItems, remoteDeleted) {
  const merged = mergeVersioned(items, deleted, remoteItems, remoteDeleted);
  items = merged.active;
  deleted = merged.deleted;
  persist();
}

// ---------------------------------------------------------------------------
// Mutácie
// ---------------------------------------------------------------------------

function touchItem(item, at = nextUpdatedAt()) {
  item.updatedAt = at;
  item.deletedAt = null;
  deleted = deleted.filter(t => t.id !== item.id);
  return item;
}

// Odstráni položky spĺňajúce podmienku a zapíše im tombstone. Vracia počet.
export function deleteWhere(test) {
  const at = nextUpdatedAt();
  const removed = [];
  items = items.filter(item => {
    if (!test(item)) return true;
    removed.push(item);
    return false;
  });
  removed.forEach(item => {
    const tomb = { id: item.id, updatedAt: at, deletedAt: at };
    const old = deleted.find(t => t.id === item.id);
    if (!old || versionTime(tomb) >= versionTime(old)) {
      deleted = deleted.filter(t => t.id !== item.id);
      deleted.push(tomb);
    }
  });
  if (removed.length) persist();
  return removed.length;
}

// Nahradí celý zoznam (import zo súboru alebo zo zdieľacieho linku).
export function replaceAll(newItems) {
  const at = nextUpdatedAt();
  const incoming = new Map();
  arr(newItems)
    .map(sanitizeListItem)
    .filter(Boolean)
    .forEach(item => {
      item.updatedAt = at;
      item.deletedAt = null;
      incoming.set(item.id, item);
    });
  deleteWhere(item => !incoming.has(item.id));
  items = [...incoming.values()];
  deleted = deleted.filter(t => !incoming.has(t.id));
  persist();
}

// Pridá akciu z letáku. Ukladáme obe cenové bázy (s DPH aj bez), aby prepnutie
// nastavenia Platca DPH neskôr nemiešalo v súčtoch rôzne základy.
// Vracia 'added' alebo 'increased' (položka už v zozname bola).
export function addDeal(offer) {
  const found = items.find(x => x.source === 'deal' && x.offerId === offer.key && !x.checked);
  const at = nextUpdatedAt();
  if (found) {
    found.quantity += 1;
    touchItem(found, at);
    persist();
    return 'increased';
  }
  items.push({
    id: uid(),
    source: 'deal',
    offerId: offer.key,
    productId: offer.productId,
    name: offer.name,
    amount: offer.amount || null,
    store: offer.store,
    price: offer.price,
    priceVat: offer.priceVat,
    originalPrice: offer.oldPrice,
    originalPriceVat: offer.oldPriceVat,
    unitPrice: offer.unitPrice,
    condition: offer.condition,
    validFrom: offer.validFrom,
    validTo: offer.validTo,
    quantity: 1,
    checked: false,
    addedAt: at,
    checkedAt: null,
    updatedAt: at,
    deletedAt: null,
  });
  persist();
  return 'added';
}

export function removeDeal(offer) {
  return deleteWhere(x => x.source === 'deal' && x.offerId === offer.key && !x.checked) > 0;
}

export function inShopping(offerKey) {
  return items.some(x => x.source === 'deal' && x.offerId === offerKey && !x.checked);
}

export function addManual({ name, quantity, store }) {
  const at = nextUpdatedAt();
  items.push({
    id: uid(),
    source: 'manual',
    offerId: '',
    productId: null,
    name,
    amount: null,
    store: store || null,
    price: null,
    priceVat: null,
    originalPrice: null,
    originalPriceVat: null,
    unitPrice: null,
    condition: '',
    validFrom: '',
    validTo: '',
    quantity: Math.max(1, Number(quantity) || 1),
    checked: false,
    addedAt: at,
    checkedAt: null,
    updatedAt: at,
    deletedAt: null,
  });
  persist();
}

export function toggleChecked(id) {
  const item = items.find(x => x.id === id);
  if (!item) return;
  const at = nextUpdatedAt();
  item.checked = !item.checked;
  item.checkedAt = item.checked ? at : null;
  touchItem(item, at);
  persist();
}

export function changeQuantity(id, delta) {
  const item = items.find(x => x.id === id);
  if (!item) return;
  item.quantity = Math.max(1, item.quantity + delta);
  touchItem(item);
  persist();
}

export function removeById(id) {
  return deleteWhere(x => x.id === id) > 0;
}

export function removeChecked() {
  return deleteWhere(x => x.checked) > 0;
}

export function uncheckAll() {
  const at = nextUpdatedAt();
  items.forEach(item => {
    if (item.checked) {
      item.checked = false;
      item.checkedAt = null;
      touchItem(item, at);
    }
  });
  persist();
}

// ---------------------------------------------------------------------------
// Ceny a súčty
// ---------------------------------------------------------------------------

// Cena položky podľa aktuálneho nastavenia Platca DPH. Staršie položky majú
// len jednu bázu – použije sa tá, ktorá existuje.
export function itemPrice(i) {
  return state.settings.dph === 'platca' ? (i.price ?? i.priceVat) : (i.priceVat ?? i.price);
}

export function itemOriginalPrice(i) {
  return state.settings.dph === 'platca'
    ? (i.originalPrice ?? i.originalPriceVat)
    : (i.originalPriceVat ?? i.originalPrice);
}

export function listTotals() {
  return items.reduce(
    (acc, i) => {
      acc.count += i.quantity;
      const price = itemPrice(i);
      const original = itemOriginalPrice(i);
      if (price != null) acc.total += price * i.quantity;
      // úspora sa počíta len keď poznáme OBE ceny – inak by položka bez ceny
      // prispela celou pôvodnou cenou ako falošná úspora
      if (price != null && original != null) acc.savings += (original - price) * i.quantity;
      if (i.checked) acc.checked += 1;
      return acc;
    },
    { count: 0, total: 0, savings: 0, checked: 0 },
  );
}

export function groupByStore() {
  const groups = new Map();
  items.forEach(i => {
    const key = i.store || 'Ostatné';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  });
  const orderOf = name => {
    const i = STORE_ORDER.indexOf(storeId(name));
    return i < 0 ? 99 : i;
  };
  return [...groups.entries()].sort(([a], [b]) => orderOf(a) - orderOf(b) || a.localeCompare(b, 'sk'));
}

// ---------------------------------------------------------------------------
// História nákupov (snapshoty zoznamu)
// ---------------------------------------------------------------------------

export function snapshotForHistory(name, totals = listTotals()) {
  return {
    id: uid(),
    name: String(name).slice(0, 80),
    savedAt: new Date().toISOString(),
    total: totals.total,
    savings: totals.savings,
    count: totals.count,
    items: items.map(x => ({ ...x })),
  };
}

// Vráti počet položiek pridaných späť do zoznamu.
export function restoreSavedItems(saved) {
  const have = new Set(items.map(x => x.id));
  const at = nextUpdatedAt();
  let added = 0;
  arr(saved.items)
    .map(sanitizeListItem)
    .filter(Boolean)
    .forEach(x => {
      if (have.has(x.id)) return;
      x.checked = false;
      x.checkedAt = null;
      touchItem(x, at);
      items.push(x);
      added++;
    });
  if (added) persist();
  return added;
}
