// Sledované produkty: rozhodovací dashboard nad porovnateľnou cenovou
// históriou, potvrdenými nákupmi a používateľom zadanou zásobou.

import { state } from '../state.js';
import { activeRecords } from '../tracking.js';
import { records as purchaseRecords } from '../purchases.js';
import { visibleItems, finalPrice } from '../data.js';
import { analyseTrackedProduct, compareTrackedAnalyses } from '../tracked-analytics.js';
import { pageHead, renderStoreTabs, storeLogo, validityHtml, circleAddButton, watchButton } from './shared.js';
import { svg } from '../lib/icons.js';
import { esc, fmtDate, fmtPrice, norm } from '../lib/util.js';

const SIGNAL_LABELS = {
  buy: 'Kúpiť',
  stock: 'Do zásoby',
  wait: 'Počkať',
  upcoming: 'Budúca ponuka',
  observe: 'Sledovať cenu',
  nooffer: 'Bez ponuky',
  needsdata: 'Doplniť dáta',
};

function analyse(record) {
  return analyseTrackedProduct(record, {
    offers: visibleItems(),
    purchases: purchaseRecords,
    selectedStore: state.store,
    generatedDate: state.data?.generated,
  });
}

function needsBetterData(analysis) {
  return analysis.quality.key === 'low';
}

function signalBadge(analysis) {
  return `<span class="track-signal ${esc(analysis.signal)}">${esc(SIGNAL_LABELS[analysis.signal] || analysis.title)}</span>`;
}

function confirmedPurchasesLabel(count) {
  if (count === 1) return '1 potvrdený nákup';
  if (count >= 2 && count <= 4) return `${count} potvrdené nákupy`;
  return `${count} potvrdených nákupov`;
}

function pricePointsLabel(count) {
  if (count === 1) return '1 cenový bod';
  if (count >= 2 && count <= 4) return `${count} cenové body`;
  return `${count} cenových bodov`;
}

function compactEvidenceLabel(analysis) {
  const prices = analysis.price.count;
  const purchases = analysis.purchases.count;
  const priceWord = prices === 1 ? 'cena' : prices >= 2 && prices <= 4 ? 'ceny' : 'cien';
  const purchaseWord = purchases === 1 ? 'nákup' : purchases >= 2 && purchases <= 4 ? 'nákupy' : 'nákupov';
  return `${prices} ${priceWord} · ${purchases} ${purchaseWord}`;
}

function presentedPrice(analysis) {
  if (analysis.best) return finalPrice(analysis.best);
  return state.settings.dph === 'platca'
    ? (analysis.record.lastPrice ?? analysis.record.lastPriceVat)
    : (analysis.record.lastPriceVat ?? analysis.record.lastPrice);
}

function presentedBasisLabel(analysis) {
  const hasExplicitPair = analysis.best
    ? analysis.best.priceVat != null && analysis.best.price != null
    : analysis.record.lastPriceVat != null && analysis.record.lastPrice != null;
  return state.settings.dph === 'platca' && hasExplicitPair
    ? 'zobrazená cena bez DPH · analytika porovnáva s DPH'
    : 'cena s DPH';
}

function presentedBasisShortLabel(analysis) {
  const hasExplicitPair = analysis.best
    ? analysis.best.priceVat != null && analysis.best.price != null
    : analysis.record.lastPriceVat != null && analysis.record.lastPrice != null;
  return state.settings.dph === 'platca' && hasExplicitPair ? 'bez DPH' : 's DPH';
}

function recordAction(analysis, wide = false) {
  if (analysis.best) return watchButton(analysis.best, wide);
  return `<button class="watch-btn ${wide ? 'wide' : ''} tracked" data-action="untrack-record" data-product-id="${esc(analysis.record.productId)}" aria-label="Prestať sledovať ${esc(analysis.record.name)}" title="Prestať sledovať">${svg('bookmark')}${wide ? '<span>Sledované</span>' : ''}</button>`;
}

function pricePosition(analysis) {
  const { price, metric } = analysis;
  if (!price.count || price.percentile == null) return '<strong>Bez histórie</strong><span>Na porovnanie treba ďalšie merania</span>';
  const compared = metric.key === 'unit' && price.comparisonPrice != null
    ? `${fmtPrice(price.comparisonPrice)} / ${esc(metric.unit)}`
    : pricePointsLabel(price.count);
  return `<strong>${esc(price.positionLabel)}</strong><span>${Math.round(price.percentile)}. cenový percentil · ${compared}</span>`;
}

function purchaseFact(analysis) {
  const purchases = analysis.purchases;
  if (!purchases.count && purchases.cadenceSource !== 'manual') {
    return '<strong>Bez potvrdených nákupov</strong><span>Rytmus sa zatiaľ nepočíta</span>';
  }
  const last = purchases.lastDate ? `Naposledy ${fmtDate(purchases.lastDate, true)}` : 'Ručne nastavený rytmus';
  const cadence = purchases.cadence ? ` · približne každých ${Math.round(purchases.cadence)} dní` : '';
  return `<strong>${confirmedPurchasesLabel(purchases.count)}</strong><span>${esc(last + cadence)}</span>`;
}

function inventoryControl(analysis) {
  const id = esc(analysis.record.productId);
  return `<div class="track-inventory track-inventory-quick" aria-label="Domáca zásoba">
    <span>Zásoba doma</span>
    <div class="track-stock-stepper">
      <button type="button" data-action="tracked-stock-down" data-product-id="${id}" aria-label="Znížiť zásobu ${esc(analysis.record.name)}">−</button>
      <strong>${analysis.stock.onHand} ks</strong>
      <button type="button" data-action="tracked-stock-up" data-product-id="${id}" aria-label="Zvýšiť zásobu ${esc(analysis.record.name)}">+</button>
    </div>
    ${analysis.stock.minStock ? `<small>Minimum ${analysis.stock.minStock} ks</small>` : '<small>Minimum nenastavené</small>'}
  </div>`;
}

function pricePositionVisual(analysis) {
  const { price } = analysis;
  if (!price.count || price.percentile == null) {
    return `<div class="track-compact-metric track-price-visual is-empty">
      <div><span>Cenová pozícia</span><strong>Bez histórie</strong></div>
      <span class="track-price-bar" role="img" aria-label="Cenová pozícia sa zatiaľ nedá určiť"></span>
      <small>Treba ďalšie merania</small>
    </div>`;
  }
  const percentile = Math.max(0, Math.min(100, Math.round(price.percentile)));
  const pointLabel = pricePointsLabel(price.count);
  return `<div class="track-compact-metric track-price-visual position-${esc(price.position)}">
    <div><span>Cenová pozícia</span><strong>${esc(price.positionLabel)}</strong></div>
    <span class="track-price-bar" role="img" aria-label="${esc(price.positionLabel)}, ${percentile}. cenový percentil; nižšie je výhodnejšie">
      <i class="track-price-marker" style="--track-position:${percentile}%"></i>
    </span>
    <small>${pointLabel} · nižšie je výhodnejšie</small>
  </div>`;
}

function qualityVisual(analysis) {
  const levels = { low: 1, medium: 2, high: 3 };
  const active = levels[analysis.quality.key] || 1;
  const dots = [1, 2, 3]
    .map(level => `<i class="${level <= active ? 'is-filled' : ''}"></i>`)
    .join('');
  return `<div class="track-compact-metric track-quality-visual quality-${esc(analysis.quality.key)}">
    <div><span>Kvalita podkladov</span><strong>${esc(analysis.quality.label)}</strong></div>
    <span class="track-quality-dots" role="img" aria-label="Kvalita podkladov: ${esc(analysis.quality.label)}">${dots}</span>
    <small>Slovné hodnotenie dát</small>
  </div>`;
}

function savingsFact(analysis) {
  const { price } = analysis;
  if (price.median == null || price.displayPrice == null) {
    return '<strong>Úsporu zatiaľ nemožno spočítať</strong><span>Chýba porovnateľná cenová kotva</span>';
  }
  const headline = analysis.expectedSavings > 0
    ? `Odhad úspory ${fmtPrice(analysis.expectedSavings)}${analysis.quantity > 1 ? ` pri ${analysis.quantity} ks` : ''}`
    : 'Bez preukázanej úspory';
  return `<strong>${esc(headline)}</strong><span>Robustný medián ${fmtPrice(price.median)}</span>`;
}

function evidenceDetails(analysis) {
  const best = analysis.best;
  const issueList = analysis.quality.issues.length
    ? `<div class="track-detail-issues"><strong>Čo znižuje kvalitu dát</strong><ul>${analysis.quality.issues.map(issue => `<li>${esc(issue)}</li>`).join('')}</ul></div>`
    : '';
  return `<details class="tracked-insights-panel">
    <summary><span>Viac informácií</span><small>${compactEvidenceLabel(analysis)}</small></summary>
    <div class="tracked-insights-body">
      <p class="track-detail-summary">${esc(analysis.detail)}</p>
      <div class="track-evidence-grid track-evidence-details">
        <div>${pricePosition(analysis)}</div>
        <div>${savingsFact(analysis)}</div>
        <div>${purchaseFact(analysis)}</div>
        <div><strong>${esc(analysis.shelf.label)}</strong><span>${analysis.shelf.explicit ? 'Zadaná skladovateľnosť' : 'Iba automatický odhad skladovateľnosti'}</span></div>
      </div>
      <div class="track-reasons"><strong>Prečo toto odporúčanie</strong><ul>${analysis.reasons.map(reason => `<li>${esc(reason)}</li>`).join('')}</ul></div>
      ${issueList}
      ${best ? `<button class="secondary-btn track-history-btn" data-action="detail" data-key="${esc(best.key)}">Detail a cenová história</button>` : ''}
      ${settingsForm(analysis)}
    </div>
  </details>`;
}

function settingsForm(analysis) {
  const record = analysis.record;
  const id = esc(record.productId);
  return `<details class="tracked-settings-panel">
    <summary>${svg('settings')} Nastaviť zásobu a pravidlá</summary>
    <form id="tracked-settings-${id}" class="tracked-settings-form" data-form="tracked-settings" data-product-id="${id}">
      <input type="hidden" name="productId" value="${id}">
      <label><span>Máme doma</span><input type="number" name="onHand" min="0" max="999" step="1" value="${record.onHand ?? 0}"><small>ks</small></label>
      <label><span>Minimálna zásoba</span><input type="number" name="minStock" min="0" max="999" step="1" value="${record.minStock ?? 0}"><small>ks</small></label>
      <label><span>Cieľová cena</span><input type="number" name="targetPrice" min="0" step="0.01" inputmode="decimal" value="${record.targetPrice ?? ''}" placeholder="napr. 2,49"><small>€</small></label>
      <label><span>Báza cieľovej ceny</span><select name="targetBasis"><option value="vat" ${record.targetBasis !== 'net' ? 'selected' : ''}>s DPH</option><option value="net" ${record.targetBasis === 'net' ? 'selected' : ''}>bez DPH</option></select></label>
      <label><span>Skladovateľnosť</span><select name="stockProfile">
        <option value="auto" ${record.stockProfile === 'auto' ? 'selected' : ''}>Automatický odhad</option>
        <option value="durable" ${record.stockProfile === 'durable' ? 'selected' : ''}>Dlhá trvanlivosť</option>
        <option value="medium" ${record.stockProfile === 'medium' ? 'selected' : ''}>Stredná trvanlivosť</option>
        <option value="perishable" ${record.stockProfile === 'perishable' ? 'selected' : ''}>Krátka trvanlivosť</option>
      </select></label>
      <label><span>Trvanlivosť</span><input type="number" name="shelfLifeDays" min="0" max="3650" step="1" value="${record.shelfLifeDays ?? 0}"><small>dní</small></label>
      <label><span>Vlastný rytmus</span><input type="number" name="manualCadenceDays" min="0" max="3650" step="1" value="${record.manualCadenceDays ?? 0}"><small>dní</small></label>
      <button class="primary-btn" type="submit">Uložiť nastavenia</button>
    </form>
  </details>`;
}

function offerMeta(analysis) {
  const offer = analysis.best;
  if (!offer) {
    const record = analysis.record;
    return `<span class="muted-line">Naposledy ${record.lastStore ? esc(record.lastStore) : 'bez obchodu'}${record.lastSeen ? ` · ${esc(fmtDate(record.lastSeen, true))}` : ''}</span>`;
  }
  return `${storeLogo(offer.store)}${validityHtml(offer)}`;
}

function dashboardCard(analysis) {
  const { record, best } = analysis;
  const shownPrice = presentedPrice(analysis);
  const timingClass = analysis.offerState === 'upcoming' ? ' upcoming' : '';
  return `<article class="tracked-card tracked-card-compact signal-${esc(analysis.signal)}">
    <header class="tracked-card-head tracked-card-primary">
      <div class="tracked-card-title"><div class="tracked-kicker">${esc(record.category || 'Sledovaný produkt')}</div><h2>${esc(record.name)}</h2>${record.amount ? `<p>${esc(record.amount)}</p>` : ''}</div>
      <div class="tracked-card-controls product-actions">${recordAction(analysis)}${best ? circleAddButton(best) : ''}</div>
    </header>
    <div class="tracked-price-row tracked-price-compact${timingClass}">
      <div><span>${esc(analysis.offerState === 'upcoming' ? 'Budúca cena' : analysis.offerState === 'active' ? 'Aktuálna cena' : 'Posledná známa cena')}</span><strong>${shownPrice != null ? fmtPrice(shownPrice) : '—'}</strong><small title="${esc(presentedBasisLabel(analysis))}">${esc(presentedBasisShortLabel(analysis))}</small></div>
      <div class="tracked-offer-meta">${offerMeta(analysis)}</div>
    </div>
    <section class="track-decision track-decision-compact">
      <div class="track-decision-main">
        <div class="track-decision-head">${signalBadge(analysis)}<span class="track-timing">${esc(analysis.timing)}</span></div>
        <h3>${esc(analysis.title)}</h3><p>${esc(analysis.detail)}</p>
      </div>
      ${analysis.quantity ? `<div class="track-quantity track-quantity-compact"><strong>${analysis.quantity} ks</strong><span>odporúčané</span></div>` : ''}
    </section>
    <div class="tracked-quick-grid">
      ${inventoryControl(analysis)}
      ${pricePositionVisual(analysis)}
      ${qualityVisual(analysis)}
    </div>
    ${evidenceDetails(analysis)}
  </article>`;
}

function listRow(analysis) {
  const best = analysis.best;
  const shownPrice = presentedPrice(analysis);
  const priceNote = analysis.price.count
    ? `${analysis.price.positionLabel} · ${analysis.quality.label}`
    : analysis.quality.label;
  return `<div class="tracked-list-row signal-${esc(analysis.signal)}">
    <div class="tracked-list-product"><strong>${esc(analysis.record.name)}</strong><span>${esc(analysis.record.amount || analysis.record.category || '')}</span></div>
    <div class="tracked-list-decision">${signalBadge(analysis)}<span class="track-row-note">${esc(analysis.title)} · ${esc(analysis.timing)}</span></div>
    <div class="tracked-list-stock">${inventoryControl(analysis)}</div>
    <div class="tracked-list-price"><strong>${shownPrice != null ? fmtPrice(shownPrice) : '—'}</strong><span>${esc(priceNote)}</span>${best ? storeLogo(best.store) : ''}</div>
    <div class="product-actions">${recordAction(analysis)}${best ? circleAddButton(best) : ''}</div>
  </div>`;
}

function normalizedSort() {
  if (state.trackedSort === 'priority' || state.trackedSort === 'confidence') return 'urgency';
  if (state.trackedSort === 'price') return 'price-position';
  return ['urgency', 'savings', 'price-position', 'name'].includes(state.trackedSort) ? state.trackedSort : 'urgency';
}

export function renderTracked() {
  const records = activeRecords();
  const allAnalyses = records.map(analyse);
  let analyses = allAnalyses.filter(analysis => {
    const queryOk = !state.query || norm(`${analysis.record.name} ${analysis.record.category}`).includes(norm(state.query));
    const storeOk = state.store === 'all' || analysis.allOffers.some(offer => offer.storeId === state.store);
    const filterOk = state.trackedFilter === 'all'
      || (state.trackedFilter === 'needsdata'
        ? needsBetterData(analysis)
        : analysis.signal === state.trackedFilter);
    return queryOk && storeOk && filterOk;
  });
  const sort = normalizedSort();
  analyses.sort((a, b) => compareTrackedAnalyses(a, b, sort));

  const activeOffers = allAnalyses.filter(analysis => analysis.bestActive).length;
  const actionable = allAnalyses.filter(analysis => ['buy', 'stock'].includes(analysis.signal)).length;
  const needsData = allAnalyses.filter(needsBetterData).length;
  const summary = `<div class="tracked-summary">
    <span><strong>${records.length}</strong> sledovaných</span>
    <span><strong>${activeOffers}</strong> s aktuálnou ponukou</span>
    <span><strong>${actionable}</strong> odporúčaných nákupov</span>
    <span><strong>${needsData}</strong> so slabými dátami</span>
  </div>`;

  const filters = [
    ['all', 'Všetky'], ['buy', 'Kúpiť'], ['stock', 'Do zásoby'], ['wait', 'Počkať'],
    ['upcoming', 'Budúce'], ['observe', 'Sledovať cenu'], ['needsdata', 'Doplniť dáta'], ['nooffer', 'Bez ponuky'],
  ].map(([key, label]) => `<button class="chip ${state.trackedFilter === key ? 'active' : ''}" data-action="tracked-filter" data-filter="${key}" aria-pressed="${state.trackedFilter === key}">${label}</button>`).join('');

  const toolbar = `<div class="tracked-toolbar">
    <div class="view-switch" role="group" aria-label="Spôsob zobrazenia">
      <button class="${state.trackedMode === 'dashboard' ? 'active' : ''}" data-action="tracked-mode" data-mode="dashboard" aria-pressed="${state.trackedMode === 'dashboard'}">Dashboard</button>
      <button class="${state.trackedMode === 'list' ? 'active' : ''}" data-action="tracked-mode" data-mode="list" aria-pressed="${state.trackedMode === 'list'}">Zoznam</button>
    </div>
    <div class="filter-row">${filters}</div>
    <select class="sort-select" id="tracked-sort" aria-label="Triedenie sledovaných produktov">
      <option value="urgency" ${sort === 'urgency' ? 'selected' : ''}>Najnaliehavejšie</option>
      <option value="savings" ${sort === 'savings' ? 'selected' : ''}>Najvyššia očakávaná úspora</option>
      <option value="price-position" ${sort === 'price-position' ? 'selected' : ''}>Najlepšia cenová pozícia</option>
      <option value="name" ${sort === 'name' ? 'selected' : ''}>Podľa názvu</option>
    </select>
  </div>`;

  const method = `<details class="tracking-method"><summary>Ako vzniká odporúčanie</summary><p>Model porovnáva ceny vždy na rovnakej báze, oddeľuje aktuálne a budúce ponuky a používa iba potvrdené nákupy. Silné odporúčanie Kúpiť alebo Do zásoby vznikne až pri overenej ponuke, presnom balení a aspoň troch cenových bodoch z dvoch dátumov. Kvalita dát je označená slovne, nejde o predstieranú pravdepodobnosť.</p></details>`;

  const content = !records.length
    ? `<div class="empty-state"><strong>Zatiaľ nič nesleduješ.</strong><br>Pri produktoch použi ikonu záložky. Odporúčania sa zlepšujú potvrdenými nákupmi, cenovými meraniami a nastavením domácej zásoby.<br><button class="primary-btn" data-view="deals" style="margin-top:14px">Vybrať produkty</button></div>`
    : !analyses.length
      ? '<div class="empty-state"><strong>Filtru nič nezodpovedá.</strong><br>Skús iný obchod, stav alebo vyhľadávanie.</div>'
      : state.trackedMode === 'dashboard'
        ? `<div class="tracked-grid">${analyses.map(dashboardCard).join('')}</div>`
        : `<div class="tracked-list"><div class="tracked-list-head"><span>Produkt</span><span>Odporúčanie</span><span>Zásoba</span><span>Cena</span><span>Akcie</span></div>${analyses.map(listRow).join('')}</div>`;

  return `<div class="tracked-view">${pageHead({ eyebrow: 'Core sortiment', title: 'Sledované produkty', desc: 'Pravdivá cenová pozícia, potvrdený nákupný rytmus a odporúčanie podľa tvojej zásoby.' })}
    ${summary}
    ${renderStoreTabs()}
    ${toolbar}
    ${method}
    ${content}</div>`;
}
