import assert from 'node:assert/strict';
import {
  analyseTrackedProduct,
  buildPriceHistories,
  classifyOfferPeriod,
  packageCompatibility,
} from '../js/tracked-analytics.js';

const today = '2026-07-18';

function baseRecord(overrides = {}) {
  return {
    productId: 'mydlo-100-g',
    name: 'Mydlo',
    amount: '100 g',
    category: 'Drogéria',
    priceHistory: [
      { date: '2026-04-01', priceVat: 1.7, storeId: 'kaufland', store: 'Kaufland', verdict: 'realna' },
      { date: '2026-05-01', priceVat: 1.6, storeId: 'kaufland', store: 'Kaufland', verdict: 'realna' },
      { date: '2026-06-01', priceVat: 1.5, storeId: 'kaufland', store: 'Kaufland', verdict: 'realna' },
    ],
    onHand: 0,
    minStock: 2,
    targetPrice: null,
    targetBasis: 'vat',
    stockProfile: 'durable',
    shelfLifeDays: 365,
    manualCadenceDays: 0,
    ...overrides,
  };
}

function offer(overrides = {}) {
  return {
    key: 'kaufland|mydlo',
    productId: 'mydlo-100-g',
    name: 'Mydlo',
    amount: '100 g',
    category: 'Drogéria',
    storeId: 'kaufland',
    store: 'Kaufland',
    price: 1.1,
    priceVat: null,
    verdict: 'realna',
    validFrom: '2026-07-16',
    validTo: '2026-07-22',
    history: [],
    ...overrides,
  };
}

const purchases = [
  { id: 'p1', purchasedAt: '2026-05-01T10:00:00Z', items: [{ productId: 'mydlo-100-g', quantity: 2, purchasePrice: 1.5 }] },
  { id: 'p2', purchasedAt: '2026-06-01T10:00:00Z', items: [{ productId: 'mydlo-100-g', quantity: 2, purchasePrice: 1.4 }] },
  { id: 'p3', purchasedAt: '2026-07-01T10:00:00Z', items: [{ productId: 'mydlo-100-g', quantity: 2, purchasePrice: 1.3 }] },
];

assert.equal(classifyOfferPeriod(offer({ validFrom: '2026-07-20' }), today), 'upcoming');
assert.equal(classifyOfferPeriod(offer(), today), 'active');
assert.equal(classifyOfferPeriod(offer({ validTo: '2026-07-17' }), today), 'expired');
assert.equal(packageCompatibility(baseRecord(), offer()), 'exact');
assert.equal(packageCompatibility(baseRecord(), offer({ amount: '1 kg' })), 'mismatch');

const kaufland = analyseTrackedProduct(baseRecord(), {
  today,
  generatedDate: today,
  selectedStore: 'all',
  offers: [offer()],
  purchases,
});
assert.equal(kaufland.basis.key, 'vat', 'Kaufland/Lidl price fallback je spotrebiteľská VAT báza');
assert.equal(kaufland.price.displayPrice, 1.1);
assert.equal(kaufland.signal, 'stock', 'silné dáta + nízka zásoba + trvanlivosť môžu odporučiť zásobu');
assert.ok(kaufland.quantity > 0);

const enoughAtHome = analyseTrackedProduct(baseRecord({ onHand: 20 }), {
  today,
  generatedDate: today,
  selectedStore: 'all',
  offers: [offer()],
  purchases,
});
assert.equal(enoughAtHome.quantity, 0);
assert.equal(enoughAtHome.signal, 'observe', 'rast zásoby nesmie zosilniť nákupné odporúčanie');

const unverified = analyseTrackedProduct(baseRecord({
  priceHistory: [{ date: '2026-06-01', priceVat: 2, storeId: 'kaufland', verdict: 'neoverene' }],
  stockProfile: 'durable',
}), {
  today,
  generatedDate: today,
  offers: [offer({ price: 1, verdict: 'neoverene' })],
  purchases: [],
});
assert.equal(unverified.quality.key, 'low');
assert.equal(unverified.signal, 'needsdata');
assert.equal(unverified.quantity, 0, 'neoverená ponuka nesmie odporučiť zásobu');

const future = analyseTrackedProduct(baseRecord(), {
  today,
  generatedDate: today,
  offers: [offer({ validFrom: '2026-07-20', validTo: '2026-07-26', price: 0.9 })],
  purchases,
});
assert.equal(future.offerState, 'upcoming');
assert.equal(future.signal, 'upcoming');
assert.match(future.title, /2026-07-20/);

const metro = analyseTrackedProduct(baseRecord(), {
  today,
  generatedDate: today,
  offers: [offer({ storeId: 'metro', store: 'Metro', price: 1, priceVat: 1.2 })],
  purchases,
});
assert.equal(metro.basis.key, 'vat');
assert.equal(metro.price.displayPrice, 1.2, 'Metro sa nesmie porovnať net cenou proti VAT histórii');

const mismatch = analyseTrackedProduct(baseRecord(), {
  today,
  generatedDate: today,
  offers: [offer({ amount: '1 kg' })],
  purchases,
});
assert.equal(mismatch.signal, 'needsdata');
assert.equal(mismatch.best, null);

const noOffer = analyseTrackedProduct(baseRecord(), { today, offers: [], purchases });
assert.equal(noOffer.signal, 'nooffer');

const storePoints = [
  { date: '2026-06-01', priceVat: 1.2, storeId: 'metro', store: 'Metro' },
  { date: '2026-06-01', priceVat: 1.3, storeId: 'kaufland', store: 'Kaufland' },
];
const histories = buildPriceHistories(baseRecord({ priceHistory: storePoints }), [], {
  basis: 'vat', selectedStore: 'all', today,
});
assert.equal(histories.market.length, 2, 'rovnaký dátum v dvoch obchodoch musí zostať ako dva body');
assert.equal(buildPriceHistories(baseRecord({ priceHistory: storePoints }), [], {
  basis: 'vat', selectedStore: 'metro', today,
}).selected.length, 1, 'filter obchodu musí používať jeho vlastnú históriu');

console.log('tracked analytics: OK');
