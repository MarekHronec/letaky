// Pohľad Všetky akcie: vyhľadávanie, filtre, triedenie a katalóg kariet.
// Katalóg sa vykresľuje po stránkach (DEALS_PAGE_SIZE), aby prekreslenie
// stoviek kariet nebrzdilo mobil.

import { DEALS_PAGE_SIZE, ENDING_SOON_DAYS } from '../config.js';
import { state } from '../state.js';
import { visibleItems, finalPrice, oldFinalPrice, discountOf } from '../data.js';
import { pageHead, renderStoreTabs, validityMeta, validityHtml, storeLogo, discountBadge, circleAddButton } from './shared.js';
import { esc, norm, daysTo, fmtPrice } from '../lib/util.js';

const VERDICT_LABEL = { realna: 'Reálna', umela: 'Podozrivá', neoverene: 'Neoverená' };

const FILTERS = [
  ['all', 'Všetko'],
  ['realna', 'Reálne výhodné'],
  ['neoverene', 'Neoverené'],
  ['umela', 'Podozrivé'],
  ['ending', 'Končí čoskoro'],
];

export function filterItems() {
  let out = visibleItems().filter(
    i =>
      (state.store === 'all' || i.storeId === state.store) &&
      (!state.query || norm(i.name + ' ' + i.store + ' ' + i.note).includes(norm(state.query))),
  );
  if (['realna', 'neoverene', 'umela'].includes(state.filter)) {
    out = out.filter(i => i.verdict === state.filter);
  }
  if (state.filter === 'ending') {
    out = out.filter(i => {
      const d = daysTo(i.validTo);
      return d != null && d >= 0 && d <= ENDING_SOON_DAYS;
    });
  }
  return out.sort((a, b) =>
    state.sort === 'price'
      ? (finalPrice(a) ?? Infinity) - (finalPrice(b) ?? Infinity)
      : state.sort === 'name'
        ? a.name.localeCompare(b.name, 'sk')
        : (discountOf(b) || 0) - (discountOf(a) || 0),
  );
}

// Riadok dátovej tabuľky akcií (desktop tabuľka → mobil štruktúrované riadky).
function dealRow(i) {
  const price = finalPrice(i);
  const old = oldFinalPrice(i);
  const meta = validityMeta(i);
  const verdictPill = `<span class="verdict-pill ${i.verdict}">${VERDICT_LABEL[i.verdict] || 'Neoverená'}</span>`;
  return `<div class="drow ${i.verdict === 'umela' ? 'suspicious' : ''} ${meta.cls === 'expired' ? 'expired' : ''}">
    <div class="dc-name">
      <button class="dname" data-action="detail" data-key="${esc(i.key)}">${esc(i.name)}</button>
      <div class="dmeta">
        ${storeLogo(i.store)}
        ${i.amount ? `<span>${esc(i.amount)}</span>` : ''}
        ${verdictPill}
        ${i.condition ? `<span class="condition-note">${esc(i.condition)}</span>` : ''}
      </div>
    </div>
    <div class="dc-price">
      <div class="price-now">${fmtPrice(price)}</div>
      ${old != null ? `<div class="price-old">${fmtPrice(old)}</div>` : ''}
    </div>
    <div class="dc-disc">${discountBadge(i)}</div>
    <div class="dc-valid">${validityHtml(i, meta)}</div>
    <div class="dc-act">${circleAddButton(i)}</div>
  </div>`;
}

function countLabel(n) {
  return `${n} ${n === 1 ? 'položka' : n < 5 && n > 0 ? 'položky' : 'položiek'}`;
}

export function renderDeals() {
  const items = filterItems();
  const shown = items.slice(0, state.dealsLimit);
  const remaining = items.length - shown.length;

  const filterChips = FILTERS.map(
    ([key, label]) =>
      `<button class="chip ${state.filter === key ? 'active' : ''}" data-action="filter" data-filter="${key}">${label}</button>`,
  ).join('');

  const dphChips = [
    ['neplatca', 's DPH'],
    ['platca', 'bez DPH'],
  ]
    .map(
      ([value, label]) =>
        `<button class="chip ${state.settings.dph === value ? 'active' : ''}" data-action="set-dph" data-val="${value}">${label}</button>`,
    )
    .join('');

  const sortOptions = [
    ['discount', 'Najväčšia zľava'],
    ['price', 'Najnižšia cena'],
    ['name', 'Podľa názvu'],
  ]
    .map(([value, label]) => `<option value="${value}" ${state.sort === value ? 'selected' : ''}>${label}</option>`)
    .join('');

  const moreButton = remaining > 0
    ? `<button class="promo-more" data-action="more-deals" style="margin-top:12px">Zobraziť ďalšie (${remaining})</button>`
    : '';

  const table = shown.length
    ? `<div class="dtable" role="table" aria-label="Akcie">
        <div class="dtable-head" role="row">
          <span role="columnheader">Produkt</span>
          <span class="dth-r" role="columnheader">Cena</span>
          <span class="dth-r" role="columnheader">Zľava</span>
          <span role="columnheader">Platnosť</span>
          <span role="columnheader"><span class="sr-only">Do zoznamu</span></span>
        </div>
        ${shown.map(dealRow).join('')}
      </div>${moreButton}`
    : '<div class="empty-state"><strong>Nič sme nenašli.</strong><br>Skús iný obchod, filter alebo výraz vo vyhľadávaní.</div>';

  return `${pageHead({ eyebrow: state.data.period || 'Aktuálny týždeň', title: 'Všetky akcie', desc: 'Cena, platnosť a podmienky každej ponuky na jednom mieste.', withArchiveNote: true })}
    ${renderStoreTabs()}
    <div class="catalog-toolbar">
      <div class="filter-row">${filterChips}</div>
      <div class="filter-row">
        <span class="result-count">${countLabel(items.length)}</span>
        <span class="dph-mini" title="Zobrazenie cien pri Metre">${dphChips}</span>
        <select class="sort-select" id="sort" aria-label="Triedenie">${sortOptions}</select>
      </div>
    </div>
    ${table}`;
}
