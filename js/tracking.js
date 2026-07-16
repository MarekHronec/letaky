// Sledované produkty: lokálna perzistencia, tombstones pre synchronizáciu
// a posledný známy snapshot produktu. Identita je stabilné productId, nie
// týždenné ID konkrétnej ponuky.

import { KEYS, TOMBSTONE_TTL_MS } from './config.js';
import { arr, isoValue, num, readJSON, slug, writeJSON } from './lib/util.js';

export let records = load();

function productKey(item) {
  return String(item?.productId || slug(item?.name || 'produkt'));
}

function cleanHistory(value) {
  return arr(value)
    .map(point => ({
      datum: String(point?.datum || point?.date || '').slice(0, 10),
      cena: num(point?.cena_s_dph ?? point?.cena ?? point?.price),
    }))
    .filter(point => /^\d{4}-\d{2}-\d{2}$/.test(point.datum) && point.cena != null)
    .slice(-16);
}

export function sanitizeTrackedRecord(value) {
  if (!value || !String(value.productId || value.id || '').trim()) return null;
  const updatedAt = isoValue(value.updatedAt, '');
  if (!updatedAt) return null;
  return {
    id: String(value.productId || value.id),
    productId: String(value.productId || value.id),
    name: String(value.name || 'Produkt').slice(0, 120),
    amount: value.amount ? String(value.amount).slice(0, 60) : '',
    category: value.category ? String(value.category).slice(0, 80) : '',
    lastStore: value.lastStore ? String(value.lastStore).slice(0, 60) : '',
    lastPrice: num(value.lastPrice),
    lastPriceVat: num(value.lastPriceVat),
    lastUnitPrice: num(value.lastUnitPrice),
    unit: value.unit ? String(value.unit).slice(0, 20) : '',
    lastSeen: String(value.lastSeen || '').slice(0, 10),
    history: cleanHistory(value.history),
    active: value.active !== false,
    createdAt: isoValue(value.createdAt, updatedAt),
    updatedAt,
  };
}

function load() {
  return arr(readJSON(KEYS.trackedProducts)).map(sanitizeTrackedRecord).filter(Boolean);
}

export function persist() {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  records = records.filter(record => record.active || Date.parse(record.updatedAt) >= cutoff);
  writeJSON(KEYS.trackedProducts, records);
}

export function activeRecords() {
  return records.filter(record => record.active);
}

export function isTracked(itemOrId) {
  const id = typeof itemOrId === 'string' ? itemOrId : productKey(itemOrId);
  return records.some(record => record.productId === id && record.active);
}

function snapshot(item, previous = {}) {
  const now = new Date().toISOString();
  return sanitizeTrackedRecord({
    ...previous,
    id: productKey(item),
    productId: productKey(item),
    name: item.name || previous.name,
    amount: item.amount || previous.amount,
    category: item.category || previous.category,
    lastStore: item.store || previous.lastStore,
    lastPrice: item.price ?? previous.lastPrice,
    lastPriceVat: item.priceVat ?? previous.lastPriceVat,
    lastUnitPrice: item.unitPrice ?? previous.lastUnitPrice,
    unit: item.unit || previous.unit,
    lastSeen: item.lastSeen || previous.lastSeen,
    history: item.history?.length ? item.history : previous.history,
    active: true,
    createdAt: previous.createdAt || now,
    updatedAt: now,
  });
}

export function toggle(item) {
  const id = productKey(item);
  const index = records.findIndex(record => record.productId === id);
  if (index >= 0) {
    const current = records[index];
    records[index] = current.active
      ? { ...current, active: false, updatedAt: new Date().toISOString() }
      : snapshot(item, current);
  } else {
    records.push(snapshot(item));
  }
  persist();
  return isTracked(id);
}

export function untrack(productId) {
  const index = records.findIndex(record => record.productId === String(productId));
  if (index < 0 || !records[index].active) return false;
  records[index] = { ...records[index], active: false, updatedAt: new Date().toISOString() };
  persist();
  return true;
}

// Po načítaní týždňa obnovíme poslednú známu cenu a históriu aktívnych
// produktov. Neaktívne tombstones nemeníme.
export function refreshFromOffers(offers, generated = '') {
  let changed = false;
  records = records.map(record => {
    if (!record.active) return record;
    const matches = arr(offers).filter(item => item.productId === record.productId);
    if (!matches.length) return record;
    const best = matches
      .slice()
      .sort((a, b) => (a.priceVat ?? a.price ?? Infinity) - (b.priceVat ?? b.price ?? Infinity))[0];
    const next = snapshot({ ...best, lastSeen: generated }, record);
    changed = true;
    return next;
  });
  if (changed) persist();
}

export function mergeRemote(remoteRecords) {
  const byId = new Map(records.map(record => [record.productId, record]));
  arr(remoteRecords)
    .map(sanitizeTrackedRecord)
    .filter(Boolean)
    .forEach(incoming => {
      const local = byId.get(incoming.productId);
      if (!local || Date.parse(incoming.updatedAt) > Date.parse(local.updatedAt)) {
        byId.set(incoming.productId, incoming);
      }
    });
  records = [...byId.values()];
  persist();
}
