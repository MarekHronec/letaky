// Sledované produkty: lokálna perzistencia, tombstones pre synchronizáciu
// a posledný známy snapshot produktu. Identita je stabilné productId, nie
// týždenné ID konkrétnej ponuky.

import { KEYS, TOMBSTONE_TTL_MS, TRACKING_HISTORY_MAX_POINTS } from './config.js';
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

// Analytická história drží cenovú bázu aj obchod. Staré body `{ datum, cena }`
// boli v aplikácii interpretované ako spotrebiteľská cena, preto ich bezpečne
// migrujeme iba do `priceVat` a nevymýšľame k nim cenu bez DPH.
function cleanPriceHistory(value) {
  const points = new Map();
  arr(value).forEach(raw => {
    const date = String(raw?.date || raw?.datum || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const explicitVat = num(raw?.priceVat ?? raw?.cena_s_dph);
    const explicitNet = num(raw?.priceNet);
    const legacy = num(raw?.price ?? raw?.cena);
    const priceVat = explicitVat ?? (explicitNet == null ? legacy : null);
    const priceNet = explicitNet ?? (explicitVat != null ? num(raw?.cena) : null);
    if (priceVat == null && priceNet == null) return;
    const storeId = String(raw?.storeId || '').slice(0, 40);
    const store = String(raw?.store || raw?.obchod || '').slice(0, 60);
    const key = `${date}|${storeId || store}|${priceVat ?? ''}|${priceNet ?? ''}`;
    points.set(key, {
      date,
      priceVat,
      priceNet,
      storeId,
      store,
      validFrom: String(raw?.validFrom || raw?.plati_od || '').slice(0, 10),
      validTo: String(raw?.validTo || raw?.plati_do || '').slice(0, 10),
      verdict: ['realna', 'umela', 'neoverene'].includes(raw?.verdict) ? raw.verdict : 'neoverene',
      source: String(raw?.source || 'routine').slice(0, 30),
    });
  });
  return [...points.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.storeId.localeCompare(b.storeId))
    .slice(-TRACKING_HISTORY_MAX_POINTS);
}

function nonNegativeInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
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
    priceHistory: cleanPriceHistory(value.priceHistory?.length ? value.priceHistory : value.history),
    onHand: nonNegativeInt(value.onHand),
    minStock: nonNegativeInt(value.minStock),
    targetPrice: num(value.targetPrice),
    targetBasis: value.targetBasis === 'net' ? 'net' : 'vat',
    stockProfile: ['auto', 'durable', 'medium', 'perishable'].includes(value.stockProfile) ? value.stockProfile : 'auto',
    shelfLifeDays: nonNegativeInt(value.shelfLifeDays),
    manualCadenceDays: nonNegativeInt(value.manualCadenceDays),
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
    priceHistory: item.priceHistory?.length ? item.priceHistory : previous.priceHistory,
    onHand: previous.onHand,
    minStock: previous.minStock,
    targetPrice: previous.targetPrice,
    targetBasis: previous.targetBasis,
    stockProfile: previous.stockProfile,
    shelfLifeDays: previous.shelfLifeDays,
    manualCadenceDays: previous.manualCadenceDays,
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

export function updatePreferences(productId, patch = {}) {
  const index = records.findIndex(record => record.productId === String(productId) && record.active);
  if (index < 0) return null;
  const current = records[index];
  const next = sanitizeTrackedRecord({
    ...current,
    onHand: patch.onHand ?? current.onHand,
    minStock: patch.minStock ?? current.minStock,
    targetPrice: patch.targetPrice === '' ? null : (patch.targetPrice ?? current.targetPrice),
    targetBasis: patch.targetBasis ?? current.targetBasis,
    stockProfile: patch.stockProfile ?? current.stockProfile,
    shelfLifeDays: patch.shelfLifeDays ?? current.shelfLifeDays,
    manualCadenceDays: patch.manualCadenceDays ?? current.manualCadenceDays,
    updatedAt: new Date().toISOString(),
  });
  if (!next) return null;
  records[index] = next;
  persist();
  return next;
}

export function adjustOnHand(productId, delta) {
  const record = records.find(entry => entry.productId === String(productId) && entry.active);
  if (!record) return null;
  return updatePreferences(productId, { onHand: Math.max(0, record.onHand + Number(delta || 0)) });
}

function observationPoints(matches, generated) {
  const date = String(generated || '').slice(0, 10);
  const out = [];
  matches.forEach(offer => {
    arr(offer.history).forEach(point => {
      const hasExplicitVat = num(point?.cena_s_dph) != null;
      out.push({
        date: point?.datum,
        // Pri histórii bez explicitnej DPH ceny zachováme doterajšiu bezpečnú
        // interpretáciu ako spotrebiteľskú cenu. Net cenu nevyrábame odhadom.
        priceVat: num(point?.cena_s_dph ?? point?.cena),
        priceNet: hasExplicitVat ? num(point?.cena) : null,
        storeId: offer.storeId,
        store: point?.obchod || offer.store,
        validFrom: offer.validFrom,
        validTo: offer.validTo,
        verdict: offer.verdict,
        source: 'dataset-history',
      });
    });
    const activeOnObservationDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
      && (!offer.validFrom || offer.validFrom <= date)
      && (!offer.validTo || offer.validTo >= date);
    if (activeOnObservationDate) {
      out.push({
        date,
        priceVat: num(offer.priceVat ?? offer.price),
        priceNet: offer.priceVat != null ? num(offer.price) : null,
        storeId: offer.storeId,
        store: offer.store,
        validFrom: offer.validFrom,
        validTo: offer.validTo,
        verdict: offer.verdict,
        source: 'routine-observation',
      });
    }
  });
  return out;
}

function sameRecordContent(a, b) {
  const withoutVersion = value => {
    const { updatedAt: _updatedAt, ...rest } = value;
    return rest;
  };
  return JSON.stringify(withoutVersion(a)) === JSON.stringify(withoutVersion(b));
}

// Po načítaní týždňa obnovíme poslednú známu cenu a históriu aktívnych
// produktov. Neaktívne tombstones nemeníme.
export function refreshFromOffers(offers, generated = '') {
  let changed = false;
  records = records.map(record => {
    if (!record.active) return record;
    const observationDate = String(generated || '').slice(0, 10);
    // Archív ani oneskorene doručené dáta nesmú vrátiť posledný známy stav
    // produktu do minulosti.
    if (record.lastSeen && observationDate && observationDate < record.lastSeen) return record;
    const matches = arr(offers).filter(item => item.productId === record.productId);
    if (!matches.length) return record;
    const current = matches.filter(item =>
      (!observationDate || !item.validFrom || item.validFrom <= observationDate)
      && (!observationDate || !item.validTo || item.validTo >= observationDate),
    );
    const upcoming = matches.filter(item => observationDate && item.validFrom && item.validFrom > observationDate);
    const best = (current.length ? current : upcoming)
      .slice()
      .sort((a, b) => (a.priceVat ?? a.price ?? Infinity) - (b.priceVat ?? b.price ?? Infinity))[0];
    if (!best) return record;
    const priceHistory = cleanPriceHistory([
      ...arr(record.priceHistory),
      ...observationPoints(matches, generated),
    ]);
    const next = snapshot({ ...best, lastSeen: generated, priceHistory }, record);
    if (sameRecordContent(record, next)) return record;
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
      const incomingTime = Date.parse(incoming.updatedAt);
      const localTime = Date.parse(local?.updatedAt || '');
      if (!local || incomingTime > localTime || (incomingTime === localTime && !incoming.active && local.active)) {
        byId.set(incoming.productId, incoming);
      }
    });
  records = [...byId.values()];
  persist();
}
