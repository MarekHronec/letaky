// Vstupný bod aplikácie: prepája stav, dáta, pohľady a synchronizáciu.
// Všetky mutácie prechádzajú cez ACTIONS registry (data-action atribúty),
// takže tok „klik → zmena stavu → uloženie → render → sync" je na jednom mieste.

import { VIEWS, DEALS_PAGE_SIZE, SEARCH_DEBOUNCE_MS } from './config.js';
import { state, setLegState, saveSettings, setListMode, addSavedList, deleteSavedList } from './state.js';
import { loadWeek, loadArchiveWeeks, loadLegislativa, loadReference, offerByKey } from './data.js';
import * as shopping from './shopping.js';
import * as purchases from './purchases.js';
import * as tracking from './tracking.js';
import { initSync, schedulePush, login, logout } from './sync.js';
import { shareList, consumeSharedLink, exportList, importList, startVoice } from './share.js';
import { openDetail, closeDetail, isDetailOpen, trapFocus } from './detail.js';
import { renderOverview } from './views/overview.js';
import { renderDeals, filterItems } from './views/deals.js';
import { renderList } from './views/list.js';
import { renderTracked } from './views/tracked.js';
import { renderLegislativa } from './views/legislativa.js';
import { renderProfil } from './views/profil.js';
import { initIcons, svg } from './lib/icons.js';
import { showToast, announce } from './lib/toast.js';
import { $, esc } from './lib/util.js';

const app = $('#app');

// ---------------------------------------------------------------------------
// Render so zachovaním fokusu (innerHTML by inak zhodil fokus na <body>,
// čo rozbíja ovládanie klávesnicou)
// ---------------------------------------------------------------------------

function captureFocus() {
  const el = document.activeElement;
  if (!el || el === document.body || !app.contains(el)) return null;
  return { elId: el.id || '', action: el.dataset?.action || '', id: el.dataset?.id || '', key: el.dataset?.key || '' };
}

function restoreFocus(saved) {
  if (!saved) return;
  let selector = '';
  if (saved.elId) {
    selector = `#${CSS.escape(saved.elId)}`;
  } else if (saved.action) {
    selector = `[data-action="${CSS.escape(saved.action)}"]`;
    if (saved.id) selector += `[data-id="${CSS.escape(saved.id)}"]`;
    if (saved.key) selector += `[data-key="${CSS.escape(saved.key)}"]`;
  }
  if (!selector) return;
  app.querySelector(selector)?.focus();
}

export function render() {
  const focus = captureFocus();
  document.body.classList.toggle('shopping-simple-active', state.view === 'list' && state.listMode === 'simple');
  document.body.classList.toggle('tracked-view-active', state.view === 'tracked');
  document.body.classList.toggle('has-active-query', Boolean(state.query));
  if (state.view === 'legislativa') {
    app.innerHTML = renderLegislativa();
  } else if (state.view === 'profil') {
    app.innerHTML = renderProfil();
  } else if (state.view === 'tracked') {
    if (!state.data) return;
    app.innerHTML = renderTracked();
  } else {
    if (!state.data) return; // dáta sa ešte len načítavajú
    app.innerHTML = state.view === 'overview' ? renderOverview() : state.view === 'deals' ? renderDeals() : renderList();
  }
  updateNav();
  restoreFocus(focus);
}

function updateNav() {
  const unchecked = shopping.items.filter(i => !i.checked).reduce((sum, i) => sum + i.quantity, 0);
  document.querySelectorAll('.list-count').forEach(el => {
    el.textContent = unchecked;
    el.hidden = shopping.items.length === 0;
  });
  const trackedCount = tracking.activeRecords().length;
  document.querySelectorAll('.tracked-count').forEach(el => {
    el.textContent = trackedCount;
    el.hidden = trackedCount === 0;
  });
  document.querySelectorAll('[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === state.view));
  $('.topbar-profile')?.classList.toggle('logged', Boolean(state.user));
}

function switchView(view, pushHash = true) {
  if (!VIEWS.includes(view)) return;
  state.view = view;
  if (pushHash && location.hash.slice(1) !== view) history.pushState(null, '', '#' + view);
  render();
  scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------------------------------------------------------------------------
// Mutácie zoznamu – spoločná dohra po každej zmene
// ---------------------------------------------------------------------------

function afterListChange() {
  render();
  schedulePush();
  const { count } = shopping.listTotals();
  const word = count === 1 ? 'kus' : count >= 2 && count <= 4 ? 'kusy' : 'kusov';
  announce(`${count} ${word} v zozname`);
}

// Prepnutie ponuky v zozname. Vo view „Všetky akcie" neprekresľujeme stovky
// kariet – aktualizujú sa len tlačidlá dotknutej ponuky (vrátane detailu).
function toggleDeal(key) {
  const item = offerByKey(key);
  if (!item) return;
  let message;
  if (shopping.inShopping(key)) {
    shopping.removeDeal(item);
    message = 'Odstránené zo zoznamu';
  } else {
    message = shopping.addDeal(item) === 'increased' ? 'Zvýšené množstvo v zozname' : 'Pridané do nákupného zoznamu';
  }
  if (state.view === 'deals') {
    refreshDealButtons(item);
    updateNav();
  } else {
    render();
    refreshDealButtons(item); // detail sheet je mimo #app, render ho neobnoví
  }
  schedulePush();
  showToast(message);
}

function refreshDealButtons(item) {
  const active = shopping.inShopping(item.key);
  document.querySelectorAll(`[data-action="toggle-deal"][data-key="${CSS.escape(item.key)}"]`).forEach(btn => {
    btn.classList.toggle('in', active);
    if (btn.classList.contains('circle-add')) {
      btn.innerHTML = svg(active ? 'check' : 'plus');
      btn.setAttribute('aria-label', `${active ? 'Odobrať' : 'Pridať'} ${item.name}`);
    } else if (btn.classList.contains('add-wide')) {
      btn.textContent = active ? '✓ V zozname' : '+ Do zoznamu';
    } else {
      btn.innerHTML = active ? svg('check') + ' V zozname' : svg('plus') + ' Pridať do zoznamu';
    }
  });
}

function refreshTrackButtons(item) {
  const active = tracking.isTracked(item);
  document.querySelectorAll(`[data-action="toggle-track"][data-key="${CSS.escape(item.key)}"]`).forEach(btn => {
    btn.classList.toggle('tracked', active);
    btn.setAttribute('aria-label', `${active ? 'Prestať sledovať' : 'Sledovať produkt'} ${item.name}`);
    btn.title = active ? 'Prestať sledovať' : 'Sledovať produkt';
    btn.innerHTML = svg('bookmark') + (btn.classList.contains('wide') ? `<span>${active ? 'Sledované' : 'Sledovať'}</span>` : '');
  });
}

function toggleTrackedProduct(key) {
  const item = offerByKey(key);
  if (!item) return;
  const active = tracking.toggle(item);
  if (state.view === 'tracked') render();
  else refreshTrackButtons(item);
  updateNav();
  schedulePush();
  showToast(active ? 'Produkt pridaný medzi sledované' : 'Produkt už nesleduješ');
}

function saveCurrentList() {
  if (!shopping.items.length) {
    showToast('Zoznam je prázdny');
    return;
  }
  const defaultName =
    'Zoznam ' + new Intl.DateTimeFormat('sk-SK', { day: 'numeric', month: 'numeric', year: 'numeric' }).format(new Date());
  let name = defaultName;
  try {
    const input = prompt('Názov uloženého zoznamu:', defaultName);
    if (input === null) return;
    name = input.trim() || defaultName;
  } catch {
    // prompt nemusí byť dostupný (napr. v PWA na niektorých systémoch)
  }
  const status = addSavedList(shopping.snapshotForHistory(name));
  schedulePush();
  render();
  showToast(status === 'updated' ? 'Šablóna s týmto názvom bola aktualizovaná' : 'Zoznam uložený ako šablóna');
}

function restoreList(id) {
  const saved = state.savedLists.find(x => x.id === id);
  if (!saved) return;
  if (shopping.items.length) {
    let replace = false;
    try {
      replace = confirm(`Načítanie šablóny „${saved.name}“ nahradí aktuálny zoznam. Pokračovať?`);
    } catch {
      replace = false;
    }
    if (!replace) {
      render();
      return;
    }
  }
  const restored = shopping.restoreSavedItems(saved);
  afterListChange();
  showToast(`Obnovený uložený zoznam · ${restored} položiek`);
}

function setSetting(key, value) {
  state.settings[key] = value;
  saveSettings();
  schedulePush();
  render();
}

// ---------------------------------------------------------------------------
// Action registry – každé data-action tlačidlo má tu svoju obsluhu
// ---------------------------------------------------------------------------

const ACTIONS = {
  store: b => {
    state.store = b.dataset.store;
    state.dealsLimit = DEALS_PAGE_SIZE;
    switchView(['overview', 'tracked'].includes(state.view) ? state.view : 'deals', false);
  },
  'toggle-promo': () => {
    state.promoOpen = !state.promoOpen;
    render();
  },
  filter: b => {
    state.filter = b.dataset.filter;
    state.dealsLimit = DEALS_PAGE_SIZE;
    render();
    announce(`${filterItems().length} položiek`);
  },
  'tracked-filter': b => {
    state.trackedFilter = b.dataset.filter;
    render();
  },
  'tracked-mode': b => {
    state.trackedMode = b.dataset.mode === 'list' ? 'list' : 'dashboard';
    render();
  },
  'list-mode': b => {
    setListMode(b.dataset.mode);
    render();
  },
  'untrack-record': b => {
    if (!tracking.untrack(b.dataset.productId)) return;
    render();
    updateNav();
    schedulePush();
    showToast('Produkt už nesleduješ');
  },
  'tracked-stock-down': b => {
    if (!tracking.adjustOnHand(b.dataset.productId, -1)) return;
    schedulePush();
    render();
  },
  'tracked-stock-up': b => {
    if (!tracking.adjustOnHand(b.dataset.productId, 1)) return;
    schedulePush();
    render();
  },
  'more-deals': () => {
    state.dealsLimit += DEALS_PAGE_SIZE;
    render();
  },
  'leg-state': b => {
    setLegState(b.dataset.key, b.dataset.st);
    schedulePush();
    render();
  },
  'set-dph': b => setSetting('dph', b.dataset.val),
  'set-dphperiod': b => setSetting('dphPeriod', b.dataset.val),
  'save-list': () => saveCurrentList(),
  'restore-list': b => restoreList(b.dataset.id),
  'delete-list': b => {
    deleteSavedList(b.dataset.id);
    schedulePush();
    render();
    showToast('Uložená šablóna zmazaná');
  },
  detail: b => openDetail(offerByKey(b.dataset.key)),
  'toggle-deal': b => toggleDeal(b.dataset.key),
  'toggle-track': b => toggleTrackedProduct(b.dataset.key),
  'toggle-check': b => {
    shopping.toggleChecked(b.dataset.id);
    afterListChange();
  },
  'qty-up': b => {
    shopping.changeQuantity(b.dataset.id, +1);
    afterListChange();
  },
  'qty-down': b => {
    shopping.changeQuantity(b.dataset.id, -1);
    afterListChange();
  },
  'remove-item': b => {
    if (shopping.removeById(b.dataset.id)) {
      afterListChange();
      showToast('Položka odstránená');
    }
  },
  'complete-purchase': () => {
    const transaction = purchases.recordPurchase(shopping.checkedItemsForPurchase());
    if (!transaction) {
      showToast('Najprv označ zakúpené položky');
      return;
    }
    shopping.removeChecked();
    afterListChange();
    showToast('Nákup potvrdený a uložený do histórie');
  },
  'uncheck-all': () => {
    shopping.uncheckAll();
    afterListChange();
  },
  voice: b => startVoice(b),
  logout: async () => {
    await logout();
    updateNav();
    render();
  },
  share: () => shareList(),
  export: () => exportList(),
  import: () => $('#import-file').click(),
};

// ---------------------------------------------------------------------------
// Globálne listenery
// ---------------------------------------------------------------------------

document.addEventListener('click', e => {
  const viewBtn = e.target.closest('[data-view]');
  if (viewBtn) {
    switchView(viewBtn.dataset.view);
    return;
  }
  const actionBtn = e.target.closest('[data-action]');
  if (!actionBtn) return;
  ACTIONS[actionBtn.dataset.action]?.(actionBtn);
});

app.addEventListener('change', e => {
  if (e.target.id === 'sort') {
    state.sort = e.target.value;
    render();
  } else if (e.target.id === 'tracked-sort') {
    state.trackedSort = e.target.value;
    render();
  } else if (e.target.id === 'list-template-select') {
    if (e.target.value) restoreList(e.target.value);
  } else if (e.target.id === 'leg-category') {
    state.legCat = e.target.value;
    render();
  } else if (e.target.id === 'leg-visibility') {
    state.legVisibility = e.target.value;
    render();
  } else if (e.target.dataset?.action === 'toggle-setting') {
    setSetting(e.target.dataset.key, e.target.checked);
  }
});

app.addEventListener('submit', async e => {
  if (e.target.dataset?.form === 'tracked-settings') {
    e.preventDefault();
    const form = new FormData(e.target);
    const productId = String(form.get('productId') || '');
    const updated = tracking.updatePreferences(productId, {
      onHand: form.get('onHand'),
      minStock: form.get('minStock'),
      targetPrice: form.get('targetPrice'),
      targetBasis: form.get('targetBasis'),
      stockProfile: form.get('stockProfile'),
      shelfLifeDays: form.get('shelfLifeDays'),
      manualCadenceDays: form.get('manualCadenceDays'),
    });
    if (!updated) return;
    schedulePush();
    render();
    showToast('Nastavenie produktu uložené');
    return;
  }
  if (e.target.id === 'manual-form') {
    e.preventDefault();
    const form = new FormData(e.target);
    const name = String(form.get('name') || '').trim();
    if (!name) return;
    shopping.addManual({ name, quantity: form.get('quantity'), store: String(form.get('store') || '') });
    afterListChange();
    showToast('Vlastná položka pridaná');
    return;
  }
  if (e.target.id === 'login-form') {
    e.preventDefault();
    const form = new FormData(e.target);
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    if (!email || !password) return;
    state.loginErr = '';
    state.loginBusy = true;
    render();
    const { error } = await login(email, password);
    state.loginBusy = false;
    if (error) {
      state.loginErr = error === 'Invalid login credentials' ? 'Nesprávny e-mail alebo heslo.' : error;
      render();
    } else {
      state.loginErr = '';
      showToast('Prihlásený');
    }
  }
});

let searchTimer;
$('#search').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = e.target.value.trim();
    state.dealsLimit = DEALS_PAGE_SIZE;
    if (state.query && !['deals', 'tracked'].includes(state.view)) switchView('deals');
    else render();
    if (state.view === 'deals') announce(`${filterItems().length} položiek`);
  }, SEARCH_DEBOUNCE_MS);
});

$('#week').addEventListener('change', e => showWeek(e.target.value));

$('#sheet-close').addEventListener('click', closeDetail);
$('#modal-backdrop').addEventListener('click', closeDetail);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeDetail();
  else trapFocus(e);
});

$('#import-file').addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (file && (await importList(file))) afterListChange();
  e.target.value = '';
});

// Hash routing: #overview/#deals/#list/#legislativa/#profil (+ #share= linky).
// Prázdny hash (návrat na prvú položku histórie) znamená prehľad.
function handleLocationHash() {
  if (location.hash.startsWith('#share=')) {
    if (consumeSharedLink()) schedulePush();
    updateNav();
    if (state.data) render();
    return;
  }
  const view = location.hash.slice(1) || 'overview';
  if (VIEWS.includes(view) && view !== state.view) {
    state.view = view;
    render();
  }
}
addEventListener('hashchange', handleLocationHash);

// ---------------------------------------------------------------------------
// Service worker + ponuka na obnovenie pri novej verzii
// ---------------------------------------------------------------------------

function watchForUpdate(registration) {
  // reload robíme LEN keď ho používateľ vyžiadal tlačidlom Obnoviť –
  // controllerchange totiž vystrelí aj pri úplne prvej inštalácii SW
  // (clients.claim), kde by reload zbytočne blikol stránkou
  let reloadRequested = false;
  const offerReload = worker => {
    const banner = $('#update-banner');
    banner.hidden = false;
    $('#update-reload').onclick = () => {
      reloadRequested = true;
      worker.postMessage('SKIP_WAITING');
    };
  };
  if (registration.waiting && navigator.serviceWorker.controller) offerReload(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) offerReload(worker);
    });
  });
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloadRequested || reloaded) return;
    reloaded = true;
    location.reload();
  });
}

if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then(watchForUpdate)
      .catch(() => {
        // bez service workera appka funguje, len nie offline
      });
  });
}

// ---------------------------------------------------------------------------
// Štart
// ---------------------------------------------------------------------------

async function initWeekSelect() {
  const weeks = await loadArchiveWeeks();
  const select = $('#week');
  weeks.forEach(week => {
    const option = document.createElement('option');
    option.value = week;
    option.textContent = week;
    select.appendChild(option);
  });
}

function updateWeekSelectLabel() {
  const select = $('#week');
  const option = select?.selectedOptions?.[0];
  if (!option || !state.data) return;
  const context = state.week === 'latest' ? 'Tento týždeň' : 'Archív';
  option.textContent = `(${context}) ${state.data.period || state.data.week || state.week}`;
  select.title = option.textContent;
}

async function showWeek(week) {
  app.innerHTML = '<div class="empty-state">Načítavam aktuálne akcie…</div>';
  try {
    await loadWeek(week);
    // Archív je iba na prezeranie. Sledovanému produktu nesmie prepísať
    // poslednú cenu ani dátum starším snapshotom.
    if (state.week === 'latest') tracking.refreshFromOffers(state.items, state.data.generated);
    state.dealsLimit = DEALS_PAGE_SIZE;
    updateWeekSelectLabel();
    render();
  } catch (e) {
    app.innerHTML = `<div class="empty-state"><strong>Dáta sa nepodarilo načítať.</strong><br>${esc(e.message)}<br><button class="primary-btn" id="retry" style="margin-top:14px">Skúsiť znova</button></div>`;
    $('#retry')?.addEventListener('click', () => showWeek(week));
  }
}

// Nefunkčné obrázky (hotlink ochrana, expirované URL) odstraňujeme globálnym
// listenerom, aby presvitlo emoji – inline onerror atribúty blokuje CSP.
// Event 'error' nebublá, preto capture fáza.
const removeBrokenImage = e => {
  if (e.target?.tagName === 'IMG') e.target.remove();
};
app.addEventListener('error', removeBrokenImage, true);
$('#sheet-body').addEventListener('error', removeBrokenImage, true);

initIcons();
if (consumeSharedLink()) schedulePush();
updateNav();
initWeekSelect();
loadLegislativa().then(() => {
  if (state.view === 'legislativa') render();
});
loadReference();
showWeek('latest');
initSync(({ authOnly } = {}) => {
  updateNav();
  // pri tichých auth eventoch (obnova tokenu) stačí indikátor v topbare;
  // celý view prekresľujeme len na profile alebo po merge dát z cloudu
  if (!authOnly || state.view === 'profil') render();
});
