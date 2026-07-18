import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: key => memory.delete(key),
};
globalThis.location = { hash: '', href: 'http://localhost/' };

const purchases = await import('../js/purchases.js');

const first = purchases.recordPurchase([
  { checked: true, productId: 'mydlo-100-g', name: 'Mydlo', quantity: 2, purchasePrice: 1.2, priceBasis: 's_dph' },
  { checked: false, productId: 'ryza-1-kg', name: 'Ryža', quantity: 5, purchasePrice: 0.9, priceBasis: 's_dph' },
], '2026-06-01T10:00:00.000Z');
assert.ok(first, 'potvrdený nákup musí vzniknúť');
assert.equal(first.items.length, 1, 'nezaškrtnutá položka sa nesmie uložiť ako nákup');
assert.equal(first.items[0].productId, 'mydlo-100-g');
assert.throws(() => first.items.push({}), TypeError, 'potvrdená transakcia musí byť nemenná');

purchases.recordPurchase([
  { checked: true, productId: 'mydlo-100-g', name: 'Mydlo', quantity: 3, purchasePrice: 1.1, priceBasis: 's_dph' },
], '2026-07-01T10:00:00.000Z');
const purchaseStats = purchases.statsForProduct('mydlo-100-g');
assert.equal(purchaseStats.count, 2);
assert.equal(purchaseStats.typicalIntervalDays, 30);
assert.equal(purchaseStats.typicalQuantity, 2.5);
assert.equal(purchases.statsForProduct('ine-mydlo').count, 0, 'názov nesmie nahradiť product_id');

const tracking = await import('../js/tracking.js');
const legacy = tracking.sanitizeTrackedRecord({
  id: 'mydlo-100-g',
  name: 'Mydlo',
  history: [{ datum: '2026-05-01', cena: 1.4 }],
  updatedAt: '2026-05-01T10:00:00.000Z',
});
assert.equal(legacy.priceHistory[0].priceVat, 1.4, 'stará história sa migruje do bezpečnej VAT bázy');
assert.equal(legacy.priceHistory[0].priceNet, null, 'net cena sa nesmie spätne domýšľať');

tracking.toggle({
  productId: 'mydlo-100-g', name: 'Mydlo', amount: '100 g', category: 'Drogéria',
  storeId: 'metro', store: 'Metro', price: 1, priceVat: 1.2,
});
tracking.updatePreferences('mydlo-100-g', {
  onHand: 2, minStock: 1, targetPrice: 1.05, targetBasis: 'vat',
  stockProfile: 'durable', shelfLifeDays: 365, manualCadenceDays: 30,
});
tracking.refreshFromOffers([
  {
    productId: 'mydlo-100-g', name: 'Mydlo', amount: '100 g', category: 'Drogéria',
    storeId: 'metro', store: 'Metro', price: 1, priceVat: 1.2, validFrom: '2026-07-15', validTo: '2026-07-21', verdict: 'realna',
    history: [{ datum: '2026-06-15', cena: 1.1, cena_s_dph: 1.32, obchod: 'Metro' }],
  },
  {
    productId: 'mydlo-100-g', name: 'Mydlo', amount: '100 g', category: 'Drogéria',
    storeId: 'kaufland', store: 'Kaufland', price: 1.25, priceVat: null, validFrom: '2026-07-16', validTo: '2026-07-22', verdict: 'realna',
    history: [{ datum: '2026-06-15', cena: 1.3, obchod: 'Kaufland' }],
  },
  {
    productId: 'mydlo-100-g', name: 'Mydlo', amount: '100 g', category: 'Drogéria',
    storeId: 'lidl', store: 'Lidl', price: 0.8, priceVat: null, validFrom: '2026-07-20', validTo: '2026-07-26', verdict: 'realna', history: [],
  },
], '2026-07-18');

let record = tracking.activeRecords().find(value => value.productId === 'mydlo-100-g');
assert.equal(record.onHand, 2, 'refresh ponúk nesmie zahodiť používateľskú zásobu');
assert.deepEqual(new Set(record.priceHistory.map(point => point.storeId)), new Set(['metro', 'kaufland']));
assert.ok(record.priceHistory.some(point => point.priceVat === 1.2 && point.priceNet === 1));
assert.equal(record.lastStore, 'Metro', 'budúca lacnejšia ponuka nesmie prepísať aktuálny snapshot');
const version = record.updatedAt;
const points = JSON.stringify(record.priceHistory);

tracking.refreshFromOffers([
  {
    productId: 'mydlo-100-g', name: 'Mydlo', amount: '100 g', category: 'Drogéria',
    storeId: 'metro', store: 'Metro', price: 1, priceVat: 1.2, validFrom: '2026-07-15', validTo: '2026-07-21', verdict: 'realna',
    history: [{ datum: '2026-06-15', cena: 1.1, cena_s_dph: 1.32, obchod: 'Metro' }],
  },
  {
    productId: 'mydlo-100-g', name: 'Mydlo', amount: '100 g', category: 'Drogéria',
    storeId: 'kaufland', store: 'Kaufland', price: 1.25, priceVat: null, validFrom: '2026-07-16', validTo: '2026-07-22', verdict: 'realna',
    history: [{ datum: '2026-06-15', cena: 1.3, obchod: 'Kaufland' }],
  },
  {
    productId: 'mydlo-100-g', name: 'Mydlo', amount: '100 g', category: 'Drogéria',
    storeId: 'lidl', store: 'Lidl', price: 0.8, priceVat: null, validFrom: '2026-07-20', validTo: '2026-07-26', verdict: 'realna', history: [],
  },
], '2026-07-18');
record = tracking.activeRecords().find(value => value.productId === 'mydlo-100-g');
assert.equal(record.updatedAt, version, 'rovnaký refresh musí byť idempotentný');
assert.equal(JSON.stringify(record.priceHistory), points, 'rovnaký refresh nesmie duplikovať históriu');

tracking.refreshFromOffers([{
  productId: 'mydlo-100-g', name: 'Mydlo', storeId: 'metro', store: 'Metro', price: 0.5, priceVat: 0.6, history: [],
}], '2026-01-01');
record = tracking.activeRecords().find(value => value.productId === 'mydlo-100-g');
assert.equal(record.lastSeen, '2026-07-18', 'starší archív nesmie prepísať posledný stav');

tracking.mergeRemote([{ ...record, active: false }]);
assert.equal(tracking.isTracked('mydlo-100-g'), false, 'pri rovnakom čase musí tombstone vyhrať');

console.log('tracked foundations: OK');
