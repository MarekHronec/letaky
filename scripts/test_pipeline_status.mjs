import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: key => memory.delete(key),
};
globalThis.location = { hash: '', pathname: '/letaky/', search: '' };
globalThis.matchMedia = () => ({ matches: false });

const { normalizeItem, normalizePipelineStatus } = await import('../js/data.js');
const { state } = await import('../js/state.js');
const { renderOverview } = await import('../js/views/overview.js');
const { renderLegislativa } = await import('../js/views/legislativa.js');

const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);

const status = normalizePipelineStatus({
  generovane: new Date().toISOString(),
  run_id: 'run-1',
  outcome: 'DEGRADED_SAFE',
  validation_ok: true,
  fresh: { lidl: 0 },
  carry_forward: { lidl: 12 },
  needs_review_items: 2,
  warnings: ['<b>nedôveryhodný text</b>'],
  freshness: {
    opening_hours: [{ id: 'lidl', status: 'stale', verified_at: twoDaysAgo }],
    legislation: { status: 'success', checked_at: new Date().toISOString().slice(0, 10), changed_portals: ['soi'] },
  },
});
assert.equal(status.outcome, 'DEGRADED_SAFE');
assert.equal(status.carryForward.lidl, 12);
assert.equal(status.freshness.openingHours[0].status, 'stale');
assert.deepEqual(status.freshness.legislation.changedPortals, ['soi']);

const unknown = normalizePipelineStatus({
  outcome: 'EVERYTHING_IS_FINE',
  validation_ok: true,
  counts: { lidl: Number.POSITIVE_INFINITY },
});
assert.equal(unknown.outcome, 'BLOCKED');
assert.equal(unknown.counts.lidl, 0);

const store = { id: 'lidl', name: 'Lidl', validFrom: '', validTo: '' };
const item = normalizeItem({
  id: 'lidl-test-2026-w30',
  product_id: 'test',
  nazov: 'Neoverená ponuka',
  cena: 1.5,
  verdikt: 'neoverene',
}, store);
state.week = 'latest';
state.store = 'all';
state.pipelineStatus = status;
state.items = [item];
state.top = [item];
state.data = {
  stores: [store],
  items: [item],
  top: [item],
  promos: [],
  openingHours: {
    period: 'Tento týždeň',
    location: 'Test',
    holidayNote: '',
    holidaySourceUrl: '',
    stores: [{
      id: 'lidl',
      name: 'Lidl test',
      address: '',
      verified: twoDaysAgo,
      verificationStatus: 'stale',
      verificationNote: '',
      sourceUrl: '',
      hours: [{ days: 'Po – Ne', time: '08:00 – 20:00' }],
      exceptions: [],
    }],
  },
  sources: [{ name: 'legislatívny watch', ok: true, note: 'bez zmien', url: '' }],
};

const html = renderOverview();
assert.match(html, /Časť dát používa posledný validný stav/);
assert.match(html, /lidl: 12 prenesených/);
assert.match(html, /Nedostatok cenovej histórie/);
assert.doesNotMatch(html, /<b>nedôveryhodný text<\/b>/);
assert.match(html, /&lt;b&gt;nedôveryhodný text&lt;\/b&gt;/);
assert.match(html, /posledné dobré pred 2 dňami/);

state.legData = {
  aktualizovane: '2026-07-26',
  popis: 'Testovací orientačný prehľad.',
  upozornenie: 'Nie je to právne poradenstvo.',
  terminy: [],
  kategorie: [{
    id: 'test',
    nazov: 'Test',
    ikona: 'doc',
    popis: 'Test',
    polozky: [{
      nazov: 'Testovacia povinnosť',
      detail: 'Detail',
      kedy: 'priebežne',
      koho: 'test',
      zdroj: '',
      zdroj_nazov: '',
      confidence: 'low',
      zavaznost: 1,
    }],
  }],
  portaly: [],
};
const legislationHtml = renderLegislativa();
assert.match(legislationHtml, /Naposledy právne skontrolované/);
assert.match(legislationHtml, /Oficiálny zdroj sa zmenil/);
assert.match(legislationHtml, /soi/);

console.log('pipeline status transparency: OK');
