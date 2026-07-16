// Pohľad Prehľad: špeciálne akcie, top príležitosti, praktický tip,
// otváracie hodiny predajní, stav zdrojov a súhrnný pásik.

import { PROMO_PREVIEW_COUNT, STORE_ORDER, TOP_COUNT, ENDING_SOON_DAYS } from '../config.js';
import { state } from '../state.js';
import { visibleItems, rankByDiscount, finalPrice, oldFinalPrice } from '../data.js';
import * as shopping from '../shopping.js';
import { sparklineHtml } from '../charts.js';
import {
  archiveNote,
  renderStoreTabs,
  storeLogo,
  storeStyle,
  validityMeta,
  validityHtml,
  discountBadge,
  circleAddButton,
  primaryToggleButton,
  watchButton,
} from './shared.js';
import { svg } from '../lib/icons.js';
import { esc, daysTo, fmtDate, fmtPrice } from '../lib/util.js';

// ---------------------------------------------------------------------------
// Špeciálne akcie (kupóny, mechaniky, súťaže)
// ---------------------------------------------------------------------------

function promoCard(promo, index) {
  const meta = validityMeta(promo);
  const store = state.data.stores.find(s => s.id === promo.storeId);
  const linkUrl = promo.sourceUrl || store?.flyerUrl || '';
  const linkLabel = promo.sourceUrl ? 'Detail akcie' : 'Aktuálny leták';
  return `<article class="promo-card ${index === 0 ? 'featured' : ''} ${meta.cls === 'expired' ? 'ended' : ''}" style="${storeStyle(promo.store)}">
    ${index === 0 ? `<span class="promo-rank">${svg('bookmark')} Top akcia</span>` : ''}
    <span class="promo-store">${esc(promo.store)}</span>
    <div class="promo-body">
      <strong>${esc(promo.text)}</strong>
      <div class="meta">${validityHtml(promo, meta)}${promo.condition ? `<span class="condition-note">${esc(promo.condition)}</span>` : ''}</div>
    </div>
    ${linkUrl ? `<a class="promo-flyer-link" href="${esc(linkUrl)}" target="_blank" rel="noopener noreferrer">${linkLabel} ${svg('external')}</a>` : ''}
  </article>`;
}

function renderPromoSection() {
  let promos = state.data.promos;
  if (state.week === 'latest') promos = promos.filter(promo => validityMeta(promo).cls !== 'expired');
  if (state.store !== 'all') promos = promos.filter(p => p.storeId === state.store);
  if (!promos.length) return '';

  const orderOf = sid => {
    const i = STORE_ORDER.indexOf(sid);
    return i < 0 ? 99 : i;
  };
  promos = promos.slice().sort((a, b) => a.priority - b.priority || orderOf(a.storeId) - orderOf(b.storeId));

  const hidden = Math.max(0, promos.length - PROMO_PREVIEW_COUNT);
  const shown = state.promoOpen ? promos : promos.slice(0, PROMO_PREVIEW_COUNT);
  const moreButton = hidden
    ? `<button class="promo-more" data-action="toggle-promo">${state.promoOpen ? 'Skryť ďalšie akcie ▲' : `Zobraziť ďalšie akcie (${hidden}) ▼`}</button>`
    : '';

  return `<section class="promo-section">
    <div class="section-head">
      <div>
        <div class="section-kicker">Dôležité pred nákupom</div>
        <h2>Špeciálne akcie</h2>
        <p>Mechaniky, súťaže a kupóny, ktoré menia výslednú cenu.</p>
      </div>
    </div>
    <div class="promo-grid">${shown.map((promo, index) => promoCard(promo, index)).join('')}</div>
    ${moreButton}
  </section>`;
}

// ---------------------------------------------------------------------------
// Aktuálne otváracie hodiny konkrétnych pobočiek
// ---------------------------------------------------------------------------

function renderOpeningHours() {
  const opening = state.data.openingHours;
  if (!opening) return '';
  const hasExceptions = opening.stores.some(store => store.exceptions.length);
  const stores = opening.stores
    .map(store => {
      const hours = store.hours
        .map(row => `<div class="hours-row"><span>${esc(row.days)}</span><strong>${esc(row.time)}</strong></div>`)
        .join('');
      const exceptions = store.exceptions
        .map(row => `<div class="hours-exception">${svg('alert')}<span><strong>${esc([fmtDate(row.date, true), row.name].filter(Boolean).join(' · '))}</strong>${row.time ? ` · ${esc(row.time)}` : ''}</span></div>`)
        .join('');
      const title = store.sourceUrl
        ? `<a href="${esc(store.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(store.name)} ${svg('external')}</a>`
        : esc(store.name);
      return `<article class="hours-store" style="${storeStyle(store.id)}">
        <div class="hours-store-head"><i class="store-dot"></i><div><h3>${title}</h3><p>${esc(store.address)}</p></div></div>
        <div class="hours-table">${hours}</div>
        ${exceptions}
        ${store.verified ? `<div class="hours-verified">Overené ${esc(fmtDate(store.verified, true))}</div>` : ''}
      </article>`;
    })
    .join('');
  const holidayLink = opening.holidaySourceUrl
    ? `<a href="${esc(opening.holidaySourceUrl)}" target="_blank" rel="noopener noreferrer">Kalendár sviatkov ${svg('external')}</a>`
    : '';
  return `<section class="panel opening-card">
    <div class="panel-head"><div><h2>Otváracie hodiny tento týždeň</h2><p>${esc([opening.location, opening.period].filter(Boolean).join(' · '))}</p></div>${svg('calendar')}</div>
    <div class="holiday-status ${hasExceptions ? 'has-exception' : ''}">${svg(hasExceptions ? 'alert' : 'check')}<span>${esc(opening.holidayNote || (hasExceptions ? 'Počas sviatkov platia výnimky nižšie.' : 'Bez sviatočných výnimiek.'))}</span>${holidayLink}</div>
    <div class="hours-list">${stores}</div>
  </section>`;
}

// ---------------------------------------------------------------------------
// Riadok ponuky v Top príležitostiach
// ---------------------------------------------------------------------------

function dealRow(i, index) {
  return `<div class="deal-row v-${i.verdict}">
    <div class="rank">${index + 1}</div>
    <div class="deal-info">
      <button class="deal-name" data-action="detail" data-key="${esc(i.key)}">${esc(i.name)}</button>
      <div class="meta-line">
        ${storeLogo(i.store)}
        ${i.amount ? `<span>${esc(i.amount)}</span>` : ''}
        ${sparklineHtml(i)}
        ${validityHtml(i)}
        ${i.condition ? `<span class="condition-note">${esc(i.condition)}</span>` : ''}
        ${i.note ? `<span>· ${esc(i.note)}</span>` : ''}
      </div>
    </div>
    <div class="deal-price">
      <div class="price-now">${fmtPrice(finalPrice(i))}</div>
      ${oldFinalPrice(i) != null ? `<div class="price-old">${fmtPrice(oldFinalPrice(i))}</div>` : ''}
    </div>
    ${discountBadge(i) || '<span></span>'}
    <div class="product-actions">${watchButton(i)}${circleAddButton(i)}</div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Celý pohľad
// ---------------------------------------------------------------------------

export function renderOverview() {
  // rešpektujeme filter obchodu aj nastavenie „Skryť kartové akcie"
  const items = visibleItems().filter(i => state.store === 'all' || i.storeId === state.store);
  const real = items.filter(i => i.verdict === 'realna');
  const suspicious = items.filter(i => i.verdict === 'umela');
  const ending = items.filter(i => {
    const d = daysTo(i.validTo);
    return d != null && d >= 0 && d <= ENDING_SOON_DAYS;
  });

  let top = visibleItems(state.top)
    .filter(i => state.store === 'all' || i.storeId === state.store)
    .slice(0, TOP_COUNT);
  // fallback pre obchod bez zástupcu v top zozname: najväčšie zľavy bez
  // ohľadu na verdikt (rovnaké správanie ako pôvodná verzia appky)
  if (!top.length) top = rankByDiscount(items);

  const best = top[0];
  const sources = state.data.sources;

  const tipCard = best
    ? `<section class="panel insight-card">
        <div class="icon-wrap">${svg('shield')}</div>
        <h2>Praktický tip</h2>
        <p><strong>${esc(best.name)}</strong> v ${esc(best.store)} za ${fmtPrice(finalPrice(best))}. ${esc(best.note || validityMeta(best).text + '.')}</p>
        ${primaryToggleButton(best, 'margin-top:13px')}
        ${watchButton(best, true)}
      </section>`
    : '';

  const sourcesCard = `<section class="panel panel-pad">
    <h2 style="font-size:14px;margin:0">Dôveryhodnosť dát</h2>
    <p style="font-size:11px;color:var(--muted);margin:5px 0 0">Reálna zľava porovnáva akciovú cenu s bežnou cenou, nie iba s prečiarknutou cenou z letáku.</p>
    <div class="source-list">${sources
      .map(
        s => `<div class="source-row"><i class="source-ok" style="${s.ok ? '' : 'background:var(--red)'}"></i>${esc(s.name)}${s.ok ? '' : ' – nedostupný'}</div>`,
      )
      .join('')}</div>
  </section>`;

  const kpiStrip = `<div class="status-strip">
      <span class="status-label">Stav prehľadu</span>
      <span><strong>${items.length}</strong> ponúk</span>
      <span><strong>${real.length}</strong> reálne výhodných</span>
      <span><strong>${ending.length}</strong> končia do ${ENDING_SOON_DAYS} dní</span>
      <span><strong>${suspicious.length}</strong> podozrivých</span>
      <span><strong>${shopping.items.reduce((sum, i) => sum + i.quantity, 0)}</strong> v zozname</span>
    </div>`;

  const overviewSummary = `<section class="overview-summary" aria-label="Stav prehľadu a výber obchodov">
    ${kpiStrip}
    <div class="store-filter-row">
      <span class="store-filter-label">Obchody</span>
      ${renderStoreTabs('overview-store-tabs')}
    </div>
  </section>`;

  return `${overviewSummary}
    ${archiveNote()}
    ${renderPromoSection()}
    <div class="overview-layout">
      <div class="column">
        <section class="panel">
          <div class="panel-head">
            <div><h2>Top príležitosti</h2><p>Najväčší rozdiel oproti bežnej cene</p></div>
            <button class="text-btn" data-view="deals">Všetky akcie →</button>
          </div>
          ${top.map(dealRow).join('') || '<div class="empty-state">Pre tento obchod zatiaľ nie sú dáta.</div>'}
        </section>
      </div>
      <div class="column">
        ${tipCard}
        ${renderOpeningHours()}
        ${sourcesCard}
      </div>
    </div>`;
}
