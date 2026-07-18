import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: key => memory.delete(key),
};
globalThis.location = { hash: '', href: 'http://localhost/' };
globalThis.matchMedia = query => ({ matches: query === '(max-width: 720px)' });

const { state, setListMode } = await import('../js/state.js');
const { KEYS } = await import('../js/config.js');
const { renderList } = await import('../js/views/list.js');

assert.equal(state.listMode, 'simple', 'telefón má pri prvom otvorení dostať jednoduchý zoznam');
state.data = { period: '15. – 22. júl 2026', stores: [] };

const simple = renderList();
assert.match(simple, /list-mode-simple/);
assert.match(simple, /data-action="list-mode"/);
assert.match(simple, /id="list-template-select"/);
assert.doesNotMatch(simple, /id="manual-form"/);
assert.doesNotMatch(simple, /data-action="share"/);
assert.doesNotMatch(simple, /Potvrdené nákupy/);

setListMode('full');
assert.equal(state.listMode, 'full');
assert.equal(JSON.parse(memory.get(KEYS.listViewMode)), 'full', 'voľba sa má pamätať iba v tomto zariadení');

const full = renderList();
assert.match(full, /list-mode-full/);
assert.match(full, /id="manual-form"/);
assert.match(full, /Potvrdené nákupy/);

console.log('list modes: OK');
