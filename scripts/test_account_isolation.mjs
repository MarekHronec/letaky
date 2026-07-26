import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: key => memory.delete(key),
};
globalThis.location = { hash: '', href: 'http://localhost/' };
globalThis.matchMedia = () => ({ matches: false });
const browserListeners = new Map();
globalThis.addEventListener = (name, handler) => browserListeners.set(name, handler);

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_C = '33333333-3333-4333-8333-333333333333';

// Legacy dáta pred account-scoped verziou nemajú dokázateľného vlastníka.
// Migrujú sa iba do guest profilu a login ich nesmie odoslať.
memory.set('letaky.shoppingList.v2', JSON.stringify([{
  id: 'guest-item', source: 'manual', name: 'GUEST_ONLY', quantity: 1,
  checked: false, addedAt: '2026-07-01T10:00:00.000Z', updatedAt: '2026-07-01T10:00:00.000Z',
}]));
memory.set('letaky.settings.v1', JSON.stringify({ dph: 'platca', hideCard: true, dphPeriod: 'mesacne' }));

const { KEYS } = await import('../js/config.js');
const profileStorage = await import('../js/profile-storage.js');
const stateModule = await import('../js/state.js');
const shopping = await import('../js/shopping.js');
const purchases = await import('../js/purchases.js');
const tracking = await import('../js/tracking.js');
const sync = await import('../js/sync.js');
const { state } = stateModule;

assert.equal(shopping.items[0]?.name, 'GUEST_ONLY');
assert.equal(memory.has(KEYS.list), false, 'legacy osobný kľúč sa po overenom presune odstráni');
assert.ok(memory.has(profileStorage.profileStorageKey(KEYS.list, 'guest')));

function purchase(prefix) {
  return {
    id: `${prefix}-purchase`,
    purchasedAt: '2026-07-10T10:00:00.000Z',
    items: [{
      source: 'manual', name: `${prefix}_PURCHASE`, quantity: 1,
      purchasePrice: 1, priceBasis: 's_dph', checkedAt: '2026-07-10T10:00:00.000Z',
    }],
  };
}

function cloudProfile(userId, prefix) {
  return {
    sync_version: 5,
    owner_id: userId,
    shopping: [{
      id: `${prefix}-item`, source: 'manual', name: `${prefix}_ITEM`, quantity: 1,
      checked: false, addedAt: '2026-07-11T10:00:00.000Z', updatedAt: '2026-07-11T10:00:00.000Z',
    }],
    shoppingDeleted: [],
    purchases: [purchase(prefix)],
    settings: { dph: 'neplatca', hideCard: prefix === 'B', dphPeriod: '' },
    legStates: { [`${prefix}-law`]: { st: 'done', updatedAt: '2026-07-11T10:00:00.000Z' } },
    savedLists: [{
      id: `${prefix}-saved`, name: `${prefix}_SAVED`, savedAt: '2026-07-11T10:00:00.000Z',
      total: 1, savings: 0, count: 1, items: [{ name: `${prefix}_SAVED_ITEM` }],
    }],
    savedListsDeleted: [],
    trackedProducts: [{
      id: `${prefix}-product`, productId: `${prefix}-product`, name: `${prefix}_TRACKED`,
      active: true, createdAt: '2026-07-11T10:00:00.000Z', updatedAt: '2026-07-11T10:00:00.000Z',
    }],
  };
}

function createFakeClient() {
  const cloud = new Map([
    [USER_A, cloudProfile(USER_A, 'A')],
    [USER_B, cloudProfile(USER_B, 'B')],
  ]);
  const reads = [];
  const upserts = [];
  const held = [];
  let authHandler = null;
  let nextHeldUser = null;

  const sessionFor = email => {
    const id = email.startsWith('a@') ? USER_A : USER_B;
    return { user: { id, email } };
  };

  return {
    cloud,
    reads,
    upserts,
    auth: {
      onAuthStateChange(handler) {
        authHandler = handler;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async getSession() {
        return { data: { session: null }, error: null };
      },
      async signInWithPassword({ email }) {
        return { data: { session: sessionFor(email) }, error: null };
      },
      async signOut() {
        authHandler?.('SIGNED_OUT', null);
        return { error: null };
      },
    },
    holdNextRead(userId) {
      nextHeldUser = userId;
    },
    releaseHeld(userId) {
      const entry = held.find(value => value.userId === userId && !value.released);
      assert.ok(entry, `očakávaný held read pre ${userId}`);
      entry.released = true;
      entry.resolve({ data: entry.data, error: null });
    },
    from() {
      let selectedUser = null;
      const query = {
        select() { return query; },
        eq(_column, userId) { selectedUser = userId; return query; },
        maybeSingle() {
          reads.push(selectedUser);
          const data = cloud.has(selectedUser) ? { data: cloud.get(selectedUser) } : null;
          if (nextHeldUser === selectedUser) {
            nextHeldUser = null;
            return new Promise(resolve => held.push({ userId: selectedUser, data, resolve, released: false }));
          }
          return Promise.resolve({ data, error: null });
        },
        upsert(row) {
          upserts.push(structuredClone(row));
          cloud.set(row.user_id, structuredClone(row.data));
          return Promise.resolve({ error: null });
        },
      };
      return query;
    },
  };
}

const fake = createFakeClient();
sync.setSyncClientForTests(fake);
await sync.initSync(() => {});
assert.equal(state.identityReady, true);
assert.equal(state.user, null);

const waitFor = async (test, message, timeoutMs = 1000) => {
  const started = Date.now();
  while (!test()) {
    if (Date.now() - started > timeoutMs) assert.fail(message);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};

await sync.login('a@example.test', 'x');
await waitFor(() => state.sync === 'saved', 'A pull sa nedokončil');
assert.equal(state.user.id, USER_A);
assert.deepEqual(shopping.items.map(item => item.name), ['A_ITEM']);
assert.equal(shopping.items.some(item => item.name === 'GUEST_ONLY'), false, 'guest sa nesmie auto-importovať do A');

// Osobné rodiny účtu A musia ostať spolu a iba v A scope.
shopping.addManual({ name: 'A_LOCAL', quantity: 1, store: '' });
purchases.recordPurchase([{
  checked: true, source: 'manual', name: 'A_LOCAL_PURCHASE', quantity: 1,
  purchasePrice: 2, priceBasis: 's_dph', checkedAt: '2026-07-12T10:00:00.000Z',
}], '2026-07-12T10:00:00.000Z');
state.settings = { dph: 'platca', hideCard: false, dphPeriod: 'mesacne' };
stateModule.saveSettings();
stateModule.setLegState('A-local-law', 'done');
stateModule.addSavedList({
  id: 'A-local-saved', name: 'A_LOCAL_SAVED', savedAt: '2026-07-12T10:00:00.000Z',
  total: 0, savings: 0, count: 1, items: [{ name: 'A' }],
});
tracking.toggle({ productId: 'A-local-product', name: 'A_LOCAL_TRACKED' });
await sync.cloudPush();
assert.ok(fake.cloud.get(USER_A).shopping.some(item => item.name === 'A_LOCAL'));
assert.equal(fake.cloud.get(USER_A).shopping.some(item => item.name === 'GUEST_ONLY'), false);

await sync.logout();
assert.equal(state.user, null);
assert.deepEqual(shopping.items.map(item => item.name), ['GUEST_ONLY'], 'logout musí okamžite obnoviť guest');
assert.equal(purchases.records.some(record => record.items.some(item => item.name.startsWith('A_'))), false);

await sync.login('b@example.test', 'x');
await waitFor(() => state.sync === 'saved', 'B pull sa nedokončil');
assert.deepEqual(shopping.items.map(item => item.name), ['B_ITEM']);
assert.equal(purchases.records[0].items[0].name, 'B_PURCHASE');
assert.equal(state.savedLists[0].name, 'B_SAVED');
assert.equal(tracking.activeRecords()[0].name, 'B_TRACKED');
assert.equal(state.legStates['B-law'].st, 'done');
assert.equal(state.settings.hideCard, true);

await sync.login('a@example.test', 'x');
await waitFor(() => state.sync === 'saved' && state.user?.id === USER_A, 'návrat do A sa nedokončil');
assert.ok(shopping.items.some(item => item.name === 'A_LOCAL'), 'A lokálna cache sa má po návrate obnoviť');
assert.ok(purchases.records.some(record => record.items.some(item => item.name === 'A_LOCAL_PURCHASE')));
assert.ok(state.savedLists.some(list => list.name === 'A_LOCAL_SAVED'));
assert.ok(tracking.activeRecords().some(record => record.name === 'A_LOCAL_TRACKED'));
assert.equal(shopping.items.some(item => item.name === 'B_ITEM'), false);

// Oneskorený pull A nesmie po prepnutí kontaminovať B.
fake.holdNextRead(USER_A);
const delayedPull = sync.cloudPull();
await waitFor(() => fake.reads.at(-1) === USER_A, 'A delayed pull nezačal');
await sync.login('b@example.test', 'x');
await waitFor(() => state.user?.id === USER_B && shopping.items.some(item => item.name === 'B_ITEM'), 'switch na B zlyhal');
fake.releaseHeld(USER_A);
await delayedPull;
assert.deepEqual(shopping.items.map(item => item.name), ['B_ITEM']);

// Oneskorený read fázy pushu A musí použiť captured A alebo sa abortnúť;
// nikdy nesmie upsertovať A payload pod B user_id.
await sync.login('a@example.test', 'x');
await waitFor(() => state.user?.id === USER_A && state.sync === 'saved', 'A nie je pripravený na race test');
fake.holdNextRead(USER_A);
const upsertsBeforeRace = fake.upserts.length;
const delayedPush = sync.cloudPush();
await waitFor(() => fake.reads.at(-1) === USER_A, 'A delayed push read nezačal');
await sync.login('b@example.test', 'x');
await waitFor(() => state.user?.id === USER_B, 'switch na B počas pushu zlyhal');
fake.releaseHeld(USER_A);
await delayedPush;
const raceWrites = fake.upserts.slice(upsertsBeforeRace);
assert.equal(
  raceWrites.some(call => call.user_id === USER_B && call.data.shopping.some(item => item.name === 'A_LOCAL')),
  false,
  'oneskorený A push nesmie zapísať A dáta účtu B',
);

// Rovnaký auth user (napr. refresh tokenu) nesmie meniť epoch ani rehydratovať.
const epochBeforeRefresh = sync.syncDebugStateForTests().identityEpoch;
const bItemsBeforeRefresh = shopping.items;
await sync.activateSession({ user: { id: USER_B, email: 'b+refreshed@example.test' } });
assert.equal(sync.syncDebugStateForTests().identityEpoch, epochBeforeRefresh);
assert.equal(shopping.items, bItemsBeforeRefresh);

// Envelope s nesprávnym ownerom sa nesmie načítať ani pri správnom key namespace.
profileStorage.setActiveProfile(USER_C);
const cKey = profileStorage.profileStorageKey(KEYS.list);
memory.set(cKey, JSON.stringify({ schema: 1, owner: `user:${USER_A}`, data: [{ id: 'foreign', name: 'FOREIGN' }] }));
shopping.reloadProfile();
assert.deepEqual(shopping.items, []);

// listViewMode je zámerne device-global, nie osobný údaj účtu.
stateModule.setListMode('full');
profileStorage.setActiveProfile(null);
stateModule.reloadProfileState();
shopping.reloadProfile();
assert.equal(state.listMode, 'full');
assert.deepEqual(shopping.items.map(item => item.name), ['GUEST_ONLY']);

// Upratať naplánované push timery, aby test skončil deterministicky.
await sync.activateSession(null);

console.log('account isolation: OK');
