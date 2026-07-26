import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: key => memory.delete(key),
};
globalThis.location = {
  href: 'http://localhost/letaky/',
  hash: '',
  pathname: '/letaky/',
  search: '',
};
globalThis.matchMedia = () => ({ matches: false });
globalThis.document = { querySelector: () => null };
let replacedUrl = '';
globalThis.history = {
  replaceState(_state, _title, url) {
    replacedUrl = url;
  },
};
let confirmAnswer = false;
let confirmCalls = 0;
globalThis.confirm = () => {
  confirmCalls += 1;
  return confirmAnswer;
};

const { IMPORT_FILE_MAX_BYTES, LIST_ITEM_LIMITS, SHARE_ITEMS_MAX } = await import('../js/config.js');
const { normalizeItem } = await import('../js/data.js');
const shopping = await import('../js/shopping.js');
const { consumeSharedLink, importList } = await import('../js/share.js');
const { state } = await import('../js/state.js');

const injection = 'realna"><style>body{display:none}</style><span class="';
const normalized = normalizeItem(
  { id: 'metro-test', product_id: 'test', nazov: 'Test', verdikt: injection },
  { id: 'metro', name: 'Metro' },
);
assert.equal(normalized.verdict, 'neoverene', 'neznámy verdikt musí spadnúť na bezpečný enum');

state.data = { period: 'Test', stores: [{ id: 'metro', name: 'Metro' }] };
state.items = [normalized];
state.top = [];
const { renderDeals } = await import('../js/views/deals.js');
const rendered = renderDeals();
assert.match(rendered, /v-neoverene/);
assert.doesNotMatch(rendered, /<style>body/, 'vstupný verdikt sa nesmie dostať do HTML');

const bounded = shopping.sanitizeListItem({
  id: ` id\u0000${'x'.repeat(300)} `,
  name: `  Veľmi   dlhý\n${'n'.repeat(300)}  `,
  amount: 'a'.repeat(300),
  store: 's'.repeat(300),
  condition: 'c'.repeat(800),
  quantity: Number.POSITIVE_INFINITY,
});
assert.ok(bounded);
assert.ok(bounded.id.length <= LIST_ITEM_LIMITS.id);
assert.ok(bounded.name.length <= LIST_ITEM_LIMITS.name);
assert.ok(bounded.amount.length <= LIST_ITEM_LIMITS.short);
assert.ok(bounded.store.length <= LIST_ITEM_LIMITS.short);
assert.ok(bounded.condition.length <= LIST_ITEM_LIMITS.condition);
assert.equal(bounded.quantity, 1, 'nečíselné alebo nekonečné množstvo nesmie prejsť');
assert.equal(/[\u0000-\u001f\u007f]/.test(bounded.id + bounded.name), false);
assert.equal(
  shopping.sanitizeListItem({ name: 'Test', quantity: LIST_ITEM_LIMITS.quantity + 100 }).quantity,
  LIST_ITEM_LIMITS.quantity,
);

shopping.addManual({ name: 'Pôvodná položka', quantity: 1, store: '' });
const originalId = shopping.items[0].id;

function jsonFile(value, overrides = {}) {
  const text = JSON.stringify(value);
  return {
    name: 'zoznam.json',
    type: 'application/json',
    size: new TextEncoder().encode(text).byteLength,
    text: async () => text,
    ...overrides,
  };
}

let textCalled = false;
assert.equal(await importList(jsonFile([], {
  size: IMPORT_FILE_MAX_BYTES + 1,
  text: async () => {
    textCalled = true;
    return '[]';
  },
})), false);
assert.equal(textCalled, false, 'príliš veľký súbor sa nesmie ani načítať do pamäte');
assert.equal(shopping.items[0].id, originalId);

const tooMany = Array.from({ length: SHARE_ITEMS_MAX + 1 }, (_, i) => ({ id: `i-${i}`, name: `Položka ${i}` }));
assert.equal(await importList(jsonFile({ version: 3, items: tooMany })), false);
assert.equal(shopping.items[0].id, originalId);

assert.equal(await importList(jsonFile({ version: 3, items: [
  { id: 'valid', name: 'Platná' },
  { id: 'invalid', name: '   ' },
] })), false, 'chybná položka musí odmietnuť celý import');
assert.equal(shopping.items[0].id, originalId);

assert.equal(await importList(jsonFile({ version: 3, items: [
  { id: 'duplicate', name: 'Prvá' },
  { id: 'duplicate', name: 'Druhá' },
] })), false, 'duplicitné identity sa nesmú potichu zlúčiť');
assert.equal(shopping.items[0].id, originalId);

assert.equal(await importList(jsonFile({ version: 99, items: [] })), false, 'neznáma verzia sa odmietne');
assert.equal(await importList(jsonFile([], { type: 'text/html' })), false, 'zjavne nesprávny MIME typ sa odmietne');

const validImport = jsonFile({ version: 3, items: [{ id: 'new', name: 'Nová položka', quantity: 2 }] });
confirmAnswer = false;
assert.equal(await importList(validImport), false, 'zrušenie potvrdenia nesmie zmeniť zoznam');
assert.equal(shopping.items[0].id, originalId);
assert.equal(confirmCalls, 1);

confirmAnswer = true;
assert.equal(await importList(validImport), true);
assert.deepEqual(shopping.items.map(item => item.id), ['new']);

const sharedPayload = Buffer.from(JSON.stringify({ v: 2, items: [{ id: 'shared', name: 'Z linku' }] }))
  .toString('base64url');
location.hash = `#share=${sharedPayload}`;
confirmAnswer = false;
assert.equal(consumeSharedLink(), false, 'zrušený share link nesmie hlásiť mutáciu ani spustiť sync');
assert.deepEqual(shopping.items.map(item => item.id), ['new']);
assert.equal(replacedUrl, '/letaky/#list', 'citlivý share fragment sa musí odstrániť z adresy');

location.hash = `#share=${sharedPayload}`;
confirmAnswer = true;
assert.equal(consumeSharedLink(), true);
assert.deepEqual(shopping.items.map(item => item.id), ['shared']);

console.log('input hardening: OK');
