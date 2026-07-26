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
  const openingSource = state.data.sources.find(source => /otváracie hodiny/i.test(source.name));
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
      const publishedFreshness = state.pipelineStatus?.freshness?.openingHours.find(item => item.id === store.id);
      const verificationStatus = publishedFreshness?.status === 'stale'
        ? 'stale'
        : publishedFreshness?.status === 'failed'
          ? 'unavailable'
          : store.verificationStatus;
      const verifiedAt = publishedFreshness?.verifiedAt || store.verified;
      const verifiedAge = verifiedAt ? Math.max(0, -(daysTo(verifiedAt) ?? 999)) : 999;
      let freshness = { cls: 'check', text: 'vyžaduje kontrolu' };
      if (verificationStatus === 'stale' && verifiedAge <= 7) {
        freshness = {
          cls: 'warn',
          text: verifiedAge === 0
            ? 'posledné dobré dnes'
            : verifiedAge === 1
              ? 'posledné dobré pred 1 dňom'
              : `posledné dobré pred ${verifiedAge} dňami`,
        };
      } else if (
        verificationStatus === 'verified'
        && (publishedFreshness
          ? ['success', 'no_change'].includes(publishedFreshness.status)
          : openingSource?.ok !== false)
        && verifiedAge <= 2
      ) {
        freshness = {
          cls: verifiedAge === 0 ? 'ok' : 'warn',
          text: verifiedAge === 0
            ? 'overené dnes'
            : verifiedAge === 1
              ? 'overené pred 1 dňom'
              : `overené pred ${verifiedAge} dňami`,
        };
      }
      const verification = `<div class="hours-verified ${freshness.cls}">
        <i></i><span>${esc(freshness.text)}${freshness.cls !== 'ok' && verifiedAt ? ` · ${esc(fmtDate(verifiedAt, true))}` : ''}${store.verificationNote ? ` · ${esc(store.verificationNote)}` : ''}</span>
      </div>`;
      return `<article class="hours-store" style="${storeStyle(store.id)}">
        <div class="hours-store-head"><i class="store-dot"></i><div><h3>${title}</h3><p>${esc(store.address)}</p></div></div>
        <div class="hours-table">${hours}</div>
        ${exceptions}
        ${verification}
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

function renderPipelineNotice() {
  if (state.week !== 'latest') return '';
  const status = state.pipelineStatus;
  if (!status) {
    return `<section class="pipeline-notice warning" role="status">
      ${svg('alert')}<div><strong>Aktuálnosť automatickej aktualizácie sa nepodarilo overiť.</strong>
      <span>Zobrazené sú posledné lokálne dostupné dáta.</span></div>
    </section>`;
  }

  const generatedAt = Date.parse(status.generated);
  const ageHours = Number.isFinite(generatedAt) ? (Date.now() - generatedAt) / 3600000 : Infinity;
  const carry = Object.entries(status.carryForward).filter(([, count]) => count > 0);
  const critical = status.outcome === 'BLOCKED'
    || !status.validationOk
    || status.anomalies.length > 0
    || ageHours < -1
    || ageHours > 48;
  const degraded = critical
    || !['PASS', 'NO_CHANGE'].includes(status.outcome)
    || carry.length > 0
    || status.reviewItems > 0
    || ageHours > 36;
  if (!degraded) return '';

  const details = [];
  if (Number.isFinite(generatedAt)) details.push(`aktualizované ${fmtDate(status.generated.slice(0, 10), true)}`);
  carry.forEach(([store, count]) => details.push(`${store}: ${count} prenesených`));
  if (status.reviewItems) details.push(`${status.reviewItems} čaká na kontrolu`);
  const warning = status.warnings[0] || status.anomalies[0];
  return `<section class="pipeline-notice ${critical ? 'critical' : 'warning'}" role="status">
    ${svg('alert')}<div><strong>${critical ? 'Aktuálnosť dát nie je potvrdená.' : 'Časť dát používa posledný validný stav.'}</strong>
    <span>${esc(details.join(' · ') || 'Automatická pipeline hlási zníženú kvalitu.')}${warning ? ` · ${esc(warning)}` : ''}</span></div>
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

  const best = top.find(item => item.verdict === 'realna');
  const sources = state.data.sources;

  const tipCard = best
    ? `<section class="panel insight-card">
        <div class="icon-wrap">${svg('shield')}</div>
        <h2>Praktický tip</h2>
        <p><strong>${esc(best.name)}</strong> v ${esc(best.store)} za ${fmtPrice(finalPrice(best))}. ${esc(best.note || validityMeta(best).text + '.')}</p>
        ${primaryToggleButton(best, 'margin-top:13px')}
        ${watchButton(best, true)}
      </section>`
    : `<section class="panel insight-card neutral">
        <div class="icon-wrap">${svg('clock')}</div>
        <h2>Nedostatok cenovej histórie</h2>
        <p>Aktuálne ponuky nemajú dosť vlastnej cenovej histórie na poctivé označenie za výhodný nákup.</p>
      </section>`;

  const sourcesCard = `<section class="panel panel-pad">
    <h2 style="font-size:14px;margin:0">Dôveryhodnosť dát</h2>
    <p style="font-size:11px;color:var(--muted);margin:5px 0 0">Hodnotenie porovnáva ponuku iba s dostupnou cenovou históriou aplikácie; nejde o právne overenie zľavy.</p>
    <div class="source-list">${sources
      .map(
        s => `<div class="source-row"><i class="source-ok" style="${s.ok ? '' : 'background:var(--red)'}"></i><span>${esc(s.name)}${s.ok ? '' : ' – nedostupný'}${s.note ? `<small>${esc(s.note)}</small>` : ''}</span></div>`,
      )
      .join('')}</div>
  </section>`;

  const kpiStrip = `<div class="status-strip">
      <span class="status-label">Stav prehľadu</span>
      <span><strong>${items.length}</strong> ponúk</span>
      <span><strong>${real.length}</strong> priaznivých podľa dostupnej histórie</span>
      <span><strong>${ending.length}</strong> končia do ${ENDING_SOON_DAYS} dní</span>
      <span><strong>${suspicious.length}</strong> letákových zliav nepodporených históriou</span>
      <span><strong>${shopping.items.reduce((sum, i) => sum + i.quantity, 0)}</strong> v zozname</span>
    </div>`;

  const overviewSummary = `<section class="overview-summary" aria-label="Stav prehľadu a výber obchodov">
    ${kpiStrip}
    <div class="store-filter-row">
      <span class="store-filter-label">Obchody</span>
      ${renderStoreTabs('overview-store-tabs')}
    </div>
  </section>`;

  return `${renderPipelineNotice()}${overviewSummary}
    ${archiveNote()}
    ${renderPromoSection()}
    <div class="overview-layout">
      <div class="column">
        <section class="panel">
          <div class="panel-head">
            <div><h2>Top príležitosti</h2><p>Výber podľa dostupných dát; verdikt pri každej ponuke ukazuje silu dôkazu</p></div>
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
