// Pravdivá história dokončených nákupov. Na rozdiel od uložených zoznamov
// obsahuje iba položky, ktoré používateľ výslovne potvrdil ako zakúpené.
// Transakcie sú nemenné: oprava vytvorí nový nákup, existujúci záznam sa
// nikdy potichu neprepíše podľa názvu zoznamu.

import { KEYS } from './config.js';
import { arr, isoValue, num, readJSON, uid, writeJSON } from './lib/util.js';

function finiteMoney(value) {
  const parsed = num(value);
  return parsed == null ? null : Math.round(parsed * 10000) / 10000;
}

export function sanitizePurchaseItem(value) {
  if (!value || !String(value.name || '').trim()) return null;
  const quantity = Math.max(1, Math.min(999, Math.round(Number(value.quantity) || 1)));
  const purchasePrice = finiteMoney(value.purchasePrice ?? value.priceVat ?? value.price);
  const originalPurchasePrice = finiteMoney(
    value.originalPurchasePrice ?? value.originalPriceVat ?? value.originalPrice,
  );

  return Object.freeze({
    source: value.source === 'manual' ? 'manual' : 'deal',
    offerId: String(value.offerId || ''),
    productId: value.productId ? String(value.productId) : null,
    name: String(value.name).trim().slice(0, 160),
    amount: value.amount ? String(value.amount).slice(0, 120) : null,
    store: value.store ? String(value.store).slice(0, 80) : null,
    quantity,
    purchasePrice,
    originalPurchasePrice,
    priceBasis: value.priceBasis === 'bez_dph' ? 'bez_dph' : 's_dph',
    checkedAt: isoValue(value.checkedAt, '') || null,
  });
}

function transactionTotals(items) {
  return items.reduce(
    (totals, item) => {
      if (item.purchasePrice != null) totals.total += item.purchasePrice * item.quantity;
      if (item.purchasePrice != null && item.originalPurchasePrice != null) {
        totals.savings += Math.max(0, item.originalPurchasePrice - item.purchasePrice) * item.quantity;
      }
      totals.count += item.quantity;
      return totals;
    },
    { total: 0, savings: 0, count: 0 },
  );
}

function freezeTransaction(value, { allowGeneratedId = false } = {}) {
  if (!value || !Array.isArray(value.items)) return null;
  const id = value.id ? String(value.id) : allowGeneratedId ? uid() : '';
  if (!id) return null;
  const items = Object.freeze(value.items.map(sanitizePurchaseItem).filter(Boolean));
  if (!items.length) return null;
  const purchasedAt = isoValue(value.purchasedAt, '');
  if (!purchasedAt) return null;
  const calculated = transactionTotals(items);
  const total = finiteMoney(value.total) ?? calculated.total;
  const savings = finiteMoney(value.savings) ?? calculated.savings;

  return Object.freeze({
    id,
    purchasedAt,
    total: Math.max(0, total),
    savings: Math.max(0, savings),
    items,
  });
}

function sortNewest(values) {
  return values.slice().sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt) || a.id.localeCompare(b.id));
}

function loadRecords() {
  const byId = new Map();
  arr(readJSON(KEYS.purchases))
    .map(value => freezeTransaction(value))
    .filter(Boolean)
    .forEach(record => {
      if (!byId.has(record.id)) byId.set(record.id, record);
    });
  return Object.freeze(sortNewest([...byId.values()]));
}

function persist() {
  writeJSON(KEYS.purchases, records);
}

// Live binding: importujúce moduly vždy vidia aktuálne pole. Samotné pole,
// transakcie aj položky sú zmrazené, takže históriu nemožno omylom editovať.
export let records = loadRecords();

export function recordPurchase(items, purchasedAt = new Date().toISOString()) {
  const checked = arr(items).filter(item => item?.checked === true);
  const record = freezeTransaction(
    { id: uid(), purchasedAt, items: checked },
    { allowGeneratedId: true },
  );
  if (!record) return null;
  records = Object.freeze(sortNewest([record, ...records]));
  persist();
  return record;
}

// Dokončené nákupy sú append-only. Pri synchronizácii preto stačí bezpečný
// union podľa nemenného id; lokálna verzia rovnakého id sa nikdy neprepíše.
export function mergeRemote(remote) {
  const byId = new Map(records.map(record => [record.id, record]));
  arr(remote)
    .map(value => freezeTransaction(value))
    .filter(Boolean)
    .forEach(record => {
      if (!byId.has(record.id)) byId.set(record.id, record);
    });
  records = Object.freeze(sortNewest([...byId.values()]));
  persist();
  return records;
}

export function itemsForProduct(productId) {
  const id = String(productId || '');
  if (!id) return [];
  return records.flatMap(record => {
    const matching = record.items.filter(item => item.productId === id);
    if (!matching.length) return [];
    return [{
      purchaseId: record.id,
      purchasedAt: record.purchasedAt,
      quantity: matching.reduce((sum, item) => sum + item.quantity, 0),
      total: matching.reduce((sum, item) => sum + (item.purchasePrice ?? 0) * item.quantity, 0),
      items: matching,
    }];
  });
}

function median(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function statsForProduct(productId) {
  const purchases = itemsForProduct(productId).sort((a, b) => a.purchasedAt.localeCompare(b.purchasedAt));
  const intervals = purchases.slice(1).map((purchase, index) =>
    Math.round((Date.parse(purchase.purchasedAt) - Date.parse(purchases[index].purchasedAt)) / 86400000),
  ).filter(days => days >= 0);
  const last = purchases.at(-1) || null;
  return {
    count: purchases.length,
    lastPurchasedAt: last?.purchasedAt || null,
    typicalIntervalDays: median(intervals),
    typicalQuantity: median(purchases.map(purchase => purchase.quantity)),
    purchases,
  };
}
