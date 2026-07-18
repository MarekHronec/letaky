// Pohľad Môj zoznam: súhrn, formulár na vlastnú položku, položky podľa
// obchodov, bočný panel, uložené šablóny a pravdivá história potvrdených nákupov.

import { state } from '../state.js';
import { sortedStores } from '../data.js';
import * as shopping from '../shopping.js';
import * as purchases from '../purchases.js';
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

function listModeSwitch() {
  return `<div class="list-mode-switch" role="group" aria-label="Zobrazenie nákupného zoznamu">
    <button id="list-mode-simple" type="button" class="${state.listMode === 'simple' ? 'active' : ''}" data-action="list-mode" data-mode="simple" aria-pressed="${state.listMode === 'simple'}">V obchode</button>
    <button id="list-mode-full" type="button" class="${state.listMode === 'full' ? 'active' : ''}" data-action="list-mode" data-mode="full" aria-pressed="${state.listMode === 'full'}">Správa zoznamu</button>
  </div>`;
}

function simpleTemplateSwitcher() {
  const options = state.savedLists.map(list => {
    const count = list.count || arr(list.items).length;
    return `<option value="${esc(list.id)}">${esc(list.name)} · ${count} ks</option>`;
  }).join('');
  return `<section class="simple-list-templates" aria-labelledby="simple-list-templates-title">
    <label id="simple-list-templates-title" for="list-template-select">Načítať uloženú šablónu</label>
    <select id="list-template-select" ${state.savedLists.length ? '' : 'disabled'}>
      <option value="">${state.savedLists.length ? 'Vybrať šablónu…' : 'Nemáš uloženú šablónu'}</option>
      ${options}
    </select>
  </section>`;
}

function simpleListItem(item) {
  const details = [item.amount, item.quantity > 1 ? `${item.quantity} ks` : null].filter(Boolean).join(' · ');
  return `<div class="simple-list-item ${item.checked ? 'checked' : ''}">
    <button class="check-btn" data-action="toggle-check" data-id="${esc(item.id)}" aria-label="${item.checked ? 'Vrátiť medzi nenakúpené' : 'Označiť ako kúpené'} ${esc(item.name)}">${item.checked ? svg('check') : ''}</button>
    <div class="simple-list-item-main">
      <div class="item-name">${esc(item.name)}</div>
      ${details ? `<div class="item-meta">${esc(details)}</div>` : ''}
    </div>
    <button class="remove-btn" data-action="remove-item" data-id="${esc(item.id)}" aria-label="Odstrániť ${esc(item.name)}">${svg('close')}</button>
  </div>`;
}

function simpleListGroup([storeName, items]) {
  const remaining = items.filter(item => !item.checked).length;
  return `<section class="simple-list-group">
    <div class="simple-list-group-head">${storeLogo(storeName)}<span>${remaining ? `Zostáva ${remaining}` : 'hotovo'}</span></div>
    <div class="simple-list-items">${items.map(simpleListItem).join('')}</div>
  </section>`;
}

function renderSimpleList(totals, groups) {
  const remaining = shopping.items.length - totals.checked;
  const emptyState = `<div class="empty-state simple-list-empty">
    <div aria-hidden="true" style="font-size:38px;margin-bottom:8px">🛒</div>
    <strong>Aktuálny zoznam je prázdny.</strong><br>
    Obnov si uložený zoznam vyššie alebo pridaj produkty z akcií.<br>
    <button class="primary-btn" data-view="deals" style="margin-top:15px">Vybrať z akcií</button>
  </div>`;
  const confirmation = totals.checked
    ? `<section class="simple-purchase-confirm" aria-label="Potvrdenie nákupu">
        <div><strong>Označené: ${totals.checked}</strong><span>Do histórie sa uložia až po potvrdení.</span></div>
        <button class="primary-btn" data-action="complete-purchase">${svg('check')} Potvrdiť nákup</button>
      </section>`
    : '';

  return `<div class="shopping-view list-mode-simple">
    <header class="simple-list-header">
      <div><h1>Môj zoznam</h1><p>${shopping.items.length ? `Zostáva ${remaining} z ${shopping.items.length}` : 'Pripravený na nákup'}</p></div>
      ${listModeSwitch()}
    </header>
    ${simpleTemplateSwitcher()}
    ${shopping.items.length ? `<div class="simple-list-groups">${groups.map(simpleListGroup).join('')}</div>` : emptyState}
    ${confirmation}
  </div>`;
}

function savedListsSection() {
  if (!state.savedLists.length) return '';
  const rows = state.savedLists
    .map(
      l => `<div class="hist-row">
        <div class="hist-info">
          <div class="hist-name">${esc(l.name)}</div>
          <div class="hist-meta">${esc(fmtDate(l.savedAt, true))} · ${l.count || arr(l.items).length} ks · ${fmtPrice(l.total || 0)}${l.savings > 0 ? ` · ušetrené ${fmtPrice(l.savings)}` : ''}</div>
        </div>
        <div class="hist-actions">
          <button class="secondary-btn" data-action="restore-list" data-id="${esc(l.id)}" title="Nahradí aktuálny zoznam týmto uloženým snapshotom">Obnoviť</button>
          <button class="remove-btn" data-action="delete-list" data-id="${esc(l.id)}" aria-label="Zmazať uloženú šablónu">${svg('close')}</button>
        </div>
      </div>`,
    )
    .join('');
  return `<section class="panel hist-panel">
    <div class="panel-head">
      <div><h2>Uložené zoznamy/šablóny</h2><p>Obnoviteľné snapshoty na opakované použitie · neznamenajú uskutočnený nákup${state.user ? ' · synchronizované' : ' · v tomto zariadení'}</p></div>
      ${svg('list')}
    </div>
    <div class="hist-list">${rows}</div>
  </section>`;
}

function confirmedPurchasesSection() {
  const rows = purchases.records.map(record => {
    const purchasedAt = new Intl.DateTimeFormat('sk-SK', {
      day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(record.purchasedAt));
    const count = record.items.reduce((sum, item) => sum + item.quantity, 0);
    const hasPrice = record.items.some(item => item.purchasePrice != null);
    const names = record.items.slice(0, 3).map(item => item.name);
    const remaining = record.items.length - names.length;
    const itemSummary = names.join(', ') + (remaining > 0 ? ` a ďalšie ${remaining}` : '');
    const bases = new Set(record.items.map(item => item.priceBasis));
    const priceBasis = bases.size === 1
      ? (bases.has('bez_dph') ? 'ceny bez DPH' : 'ceny s DPH')
      : 'zmiešaná cenová báza';
    return `<div class="hist-row">
      <div class="hist-info">
        <div class="hist-name">Nákup ${esc(purchasedAt)}</div>
        <div class="hist-meta">${count} ks · ${hasPrice ? fmtPrice(record.total) : 'bez evidovanej ceny'}${record.savings > 0 ? ` · ušetrené ${fmtPrice(record.savings)}` : ''} · ${esc(priceBasis)}</div>
        <div class="hist-meta" title="${esc(itemSummary)}">${esc(itemSummary)}</div>
      </div>
      <div class="hist-actions"><span class="badge good">${svg('check')} Potvrdené</span></div>
    </div>`;
  }).join('');

  return `<section class="panel hist-panel">
    <div class="panel-head">
      <div><h2>Potvrdené nákupy</h2><p>Iba položky, ktoré si výslovne označil a potvrdil ako zakúpené${state.user ? ' · synchronizované' : ' · v tomto zariadení'}</p></div>
      ${svg('check')}
    </div>
    <div class="hist-list">${rows || '<div class="hist-row"><div class="hist-info"><div class="hist-meta">Zatiaľ tu nie je žiadny potvrdený nákup.</div></div></div>'}</div>
  </section>`;
}

function finishCard(totals) {
  return `<section class="finish-card">
    <h2>${totals.checked ? 'Potvrdiť nákup' : 'Ako dokončiť nákup'}</h2>
    <p>${totals.checked ? `Označené: ${totals.checked}. Po potvrdení sa výber uloží do histórie dokončených nákupov a odstráni z aktívneho zoznamu.` : 'Zakúpené položky najprv označ. Potom ich jedným krokom potvrdíš a uložíš do nákupnej histórie.'}</p>
    <div class="finish-actions">
      <button class="secondary-btn full" data-action="save-list">${svg('list')} Uložiť zoznam ako šablónu</button>
      ${
        totals.checked
          ? `<button class="primary-btn full" data-action="complete-purchase">${svg('check')} Potvrdiť označené ako nakúpené</button>
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

  if (state.listMode === 'simple') return renderSimpleList(totals, groups);

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
      <div class="value" style="color:var(--green)">${totals.savings > 0 ? fmtPrice(totals.savings) : '—'}</div>
    </div>
    <div class="summary-card">
      <div class="label">Označené</div>
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

  return `<div class="shopping-view list-mode-full">
    ${pageHead({ eyebrow: state.data.period || 'Aktuálny týždeň', title: 'Môj nákupný zoznam', desc: 'Pridávaj akcie aj vlastné položky, v obchode ich odškrtávaj. Zoznam si tento mobil zapamätá.', withArchiveNote: true })}
    <div class="list-mode-toolbar">${listModeSwitch()}</div>
    ${summary}
    ${manualForm}
    ${shopping.items.length ? layout : emptyState}
    ${confirmedPurchasesSection()}
    ${savedListsSection()}
  </div>`;
}
