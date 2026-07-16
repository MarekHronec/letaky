// Pohľad Môj zoznam: súhrn, formulár na vlastnú položku, položky podľa
// obchodov, bočný panel (dokončenie nákupu, prenos zoznamu) a história nákupov.

import { state } from '../state.js';
import { sortedStores } from '../data.js';
import * as shopping from '../shopping.js';
import { pageHead, storeLogo, validityMeta } from './shared.js';
import { svg } from '../lib/icons.js';
import { esc, fmtPrice, fmtDate, arr } from '../lib/util.js';

function listItem(i) {
  const meta = [i.amount, i.condition, i.source === 'manual' ? 'vlastná položka' : null].filter(Boolean).join(' · ');
  const validity = i.source === 'deal' && i.validTo ? ` · ${esc(validityMeta(i).text)}` : '';
  const price = shopping.itemPrice(i);
  return `<div class="list-item ${i.checked ? 'checked' : ''}">
    <button class="check-btn" data-action="toggle-check" data-id="${esc(i.id)}" aria-label="${i.checked ? 'Zrušiť označenie' : 'Označiť ako kúpené'} ${esc(i.name)}">${i.checked ? svg('check') : ''}</button>
    <div>
      <div class="item-name">${esc(i.name)}</div>
      <div class="item-meta">${esc(meta)}${validity}</div>
    </div>
    <div class="qty">
      <button data-action="qty-down" data-id="${esc(i.id)}" aria-label="Znížiť množstvo">−</button>
      <span>${i.quantity}</span>
      <button data-action="qty-up" data-id="${esc(i.id)}" aria-label="Zvýšiť množstvo">+</button>
    </div>
    <div class="item-price">${price != null ? fmtPrice(price * i.quantity) : '—'}</div>
    <button class="remove-btn" data-action="remove-item" data-id="${esc(i.id)}" aria-label="Odstrániť ${esc(i.name)}">${svg('close')}</button>
  </div>`;
}

function listGroup([storeName, items]) {
  const hasPrices = items.some(i => shopping.itemPrice(i) != null);
  const subtotal = items.reduce((sum, i) => sum + (shopping.itemPrice(i) || 0) * i.quantity, 0);
  return `<section class="list-group">
    <div class="group-head">${storeLogo(storeName)}<span class="subtotal">${hasPrices ? fmtPrice(subtotal) : '—'}</span></div>
    ${items.map(listItem).join('')}
  </section>`;
}

function historySection() {
  if (!state.savedLists.length) return '';
  const rows = state.savedLists
    .map(
      l => `<div class="hist-row">
        <div class="hist-info">
          <div class="hist-name">${esc(l.name)}</div>
          <div class="hist-meta">${esc(fmtDate(l.savedAt, true))} · ${l.count || arr(l.items).length} ks · ${fmtPrice(l.total || 0)}${l.savings > 0 ? ` · ušetrené ${fmtPrice(l.savings)}` : ''}</div>
        </div>
        <div class="hist-actions">
          <button class="secondary-btn" data-action="restore-list" data-id="${esc(l.id)}">Obnoviť</button>
          <button class="remove-btn" data-action="delete-list" data-id="${esc(l.id)}" aria-label="Zmazať uložený nákup">${svg('close')}</button>
        </div>
      </div>`,
    )
    .join('');
  return `<section class="panel hist-panel">
    <div class="panel-head">
      <div><h2>História nákupov</h2><p>Uložené nákupy${state.user ? ' · synchronizované' : ' · v tomto zariadení'}</p></div>
      ${svg('cart')}
    </div>
    <div class="hist-list">${rows}</div>
  </section>`;
}

function finishCard(totals) {
  const checkedLabel =
    totals.checked === 1
      ? 'Jednu označenú položku'
      : totals.checked < 5
        ? `${totals.checked} označené položky`
        : `${totals.checked} označených položiek`;
  return `<section class="finish-card">
    <h2>${totals.checked ? 'Dokončiť nákup' : 'Tip pri nákupe'}</h2>
    <p>${totals.checked ? `${checkedLabel} môžeš po nákupe odstrániť. Položky zostávajú na svojom mieste.` : 'Odškrtnuté položky zostanú viditeľné presne tam, kde boli.'}</p>
    <div class="finish-actions">
      <button class="secondary-btn full" data-action="save-list">${svg('list')} Uložiť ako nákup</button>
      ${
        totals.checked
          ? `<button class="primary-btn full" data-action="remove-checked">${svg('check')} Odstrániť nakúpené</button>
             <button class="secondary-btn full" data-action="uncheck-all">Ponechať a odškrtnúť všetko</button>`
          : ''
      }
    </div>
  </section>`;
}

export function renderList() {
  const totals = shopping.listTotals();
  const groups = shopping.groupByStore();
  const stores = sortedStores();

  const summary = `<div class="list-summary">
    <div class="summary-main">
      <div class="cart-icon">${svg('cart')}</div>
      <div>
        <div class="label">Celkový odhad</div>
        <div class="value">${fmtPrice(totals.total)}</div>
        <div class="label">${totals.count} ks v zozname</div>
      </div>
    </div>
    <div class="summary-card">
      <div class="label">Odhadovaná úspora</div>
      <div class="value" style="color:var(--green)">${totals.savings > 0 ? '−' + fmtPrice(totals.savings) : '—'}</div>
    </div>
    <div class="summary-card">
      <div class="label">Nakúpené</div>
      <div class="value">${totals.checked} / ${shopping.items.length}</div>
    </div>
  </div>`;

  const manualForm = `<form class="manual-form" id="manual-form">
    <div class="name-wrap">
      <input id="manual-name" name="name" required maxlength="100" placeholder="Pridať položku – napíš alebo diktuj…" autocomplete="off" aria-label="Názov vlastnej položky">
      <button type="button" class="mic-btn" data-action="voice" aria-label="Diktovať názov položky" title="Diktovať">${svg('mic')}</button>
    </div>
    <input name="quantity" type="number" min="1" max="99" value="1" aria-label="Množstvo">
    <select name="store" aria-label="Obchod">
      <option value="">Ľubovoľný obchod</option>
      ${stores.map(s => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('')}
    </select>
    <button class="primary-btn" type="submit">${svg('plus')} Pridať</button>
  </form>`;

  const emptyState = `<div class="empty-state">
    <div style="font-size:38px;margin-bottom:8px">🛒</div>
    <strong>Zoznam je zatiaľ prázdny.</strong><br>
    Pridaj vlastnú položku vyššie alebo si vyber niečo vo Všetkých akciách.<br>
    <button class="primary-btn" data-view="deals" style="margin-top:15px">Pozrieť akcie</button>
  </div>`;

  const layout = `<div class="shopping-layout">
    <div class="list-groups">${groups.map(listGroup).join('')}</div>
    <aside class="list-side">
      ${finishCard(totals)}
      <section class="backup-card">
        <h2>Preniesť zoznam</h2>
        <p>Link otvor na telefóne; obsah zoznamu je uložený priamo v ňom.</p>
        <div class="backup-actions">
          <button class="primary-btn share-btn" data-action="share">${svg('share')} Zdieľať link</button>
          <button class="secondary-btn" data-action="export">${svg('download')} JSON</button>
          <button class="secondary-btn" data-action="import">${svg('upload')} Import</button>
        </div>
      </section>
    </aside>
  </div>`;

  return `${pageHead({ eyebrow: state.data.period || 'Aktuálny týždeň', title: 'Môj nákupný zoznam', desc: 'Pridávaj akcie aj vlastné položky, v obchode ich odškrtávaj. Zoznam si tento mobil zapamätá.', withArchiveNote: true })}
    ${summary}
    ${manualForm}
    ${shopping.items.length ? layout : emptyState}
    ${historySection()}`;
}
