// Sledované produkty: analytický dashboard a kompaktný zoznam. Odporúčanie
// je vysvetliteľný heuristický model, ktorý kombinuje cenovú históriu,
// nákupný rytmus z uložených nákupov a skladovateľnosť produktu.

import { state } from '../state.js';
import { activeRecords } from '../tracking.js';
import { visibleItems, finalPrice, discountOf } from '../data.js';
import { pageHead, renderStoreTabs, storeLogo, validityHtml, circleAddButton, watchButton } from './shared.js';
import { svg } from '../lib/icons.js';
import { arr, esc, fmtDate, fmtPrice, norm } from '../lib/util.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function median(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function historyFor(record, offers) {
  const points = new Map();
  const add = (date, price) => {
    const day = String(date || '').slice(0, 10);
    const value = Number(price);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(value)) points.set(day, value);
  };
  arr(record.history).forEach(point => add(point.datum, point.cena));
  offers.forEach(offer => {
    arr(offer.history).forEach(point => add(point.datum, point.cena_s_dph ?? point.cena));
    add(state.data?.generated, offer.priceVat ?? offer.price);
  });
  if (!offers.length) add(record.lastSeen, record.lastPriceVat ?? record.lastPrice);
  return [...points.entries()]
    .map(([date, price]) => ({ date, price }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-16);
}

function purchaseStats(record) {
  const purchases = state.savedLists
    .map(list => {
      const items = arr(list.items).filter(item =>
        item.productId ? item.productId === record.productId : norm(item.name) === norm(record.name),
      );
      if (!items.length) return null;
      return {
        date: String(list.savedAt).slice(0, 10),
        quantity: items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));

  const uniqueDates = [...new Set(purchases.map(purchase => purchase.date))];
  const intervals = uniqueDates
    .slice(1)
    .map((date, index) => Math.round((Date.parse(date) - Date.parse(uniqueDates[index])) / 86400000))
    .filter(days => days > 0);
  const cadence = median(intervals);
  const lastDate = uniqueDates.at(-1) || '';
  const daysSince = lastDate ? Math.max(0, Math.round((Date.now() - Date.parse(lastDate)) / 86400000)) : null;
  return {
    count: purchases.length,
    cadence,
    lastDate,
    daysSince,
    dueIn: cadence != null && daysSince != null ? Math.round(cadence - daysSince) : null,
    typicalQuantity: Math.max(1, Math.round(median(purchases.map(purchase => purchase.quantity)) || 1)),
  };
}

function shelfProfile(record) {
  const text = norm(`${record.category} ${record.name}`);
  const durable = /droger|cisti|praci|papier|konzerv|ryz|cestovin|muk|cukor|sol|olej|kav|caj|napoj|voda|pivo|vino|trvanliv|mrazen|plien|mydl|sampon|zubn/;
  const perishable = /cerstv|ovoc|zelen|maso|ryb|peciv|jogurt|mliec|smotan|lahodk|salat/;
  if (durable.test(text)) return { factor: 1, label: 'vhodné do zásoby' };
  if (perishable.test(text)) return { factor: 0.2, label: 'krátka trvanlivosť' };
  return { factor: 0.58, label: 'stredná skladovateľnosť' };
}

function analyse(record) {
  const allOffers = visibleItems().filter(offer => offer.productId === record.productId);
  const scopedOffers = state.store === 'all' ? allOffers : allOffers.filter(offer => offer.storeId === state.store);
  const best = scopedOffers
    .slice()
    .sort((a, b) => (finalPrice(a) ?? Infinity) - (finalPrice(b) ?? Infinity))[0] || null;
  const history = historyFor(record, allOffers);
  const prices = history.map(point => point.price);
  const current = best ? finalPrice(best) : (state.settings.dph === 'platca' ? record.lastPrice : record.lastPriceVat ?? record.lastPrice);
  const low = prices.length ? Math.min(...prices) : null;
  const high = prices.length ? Math.max(...prices) : null;
  const usual = median(prices);
  const discount = best ? Math.max(0, discountOf(best) || 0) : 0;
  const purchases = purchaseStats(record);
  const shelf = shelfProfile(record);

  const valueScore = current == null
    ? 0
    : prices.length >= 2 && high > low
      ? clamp(((high - current) / (high - low)) * 100, 0, 100)
      : clamp(45 + discount * 1.6, 25, 100);
  const needScore = purchases.dueIn == null ? 45 : clamp(75 - purchases.dueIn * 4, 10, 100);
  const score = best ? Math.round(valueScore * 0.55 + needScore * 0.25 + shelf.factor * 100 * 0.2) : 12;
  const confidence = clamp(10 + history.length * 14 + purchases.count * 16, 10, 96);

  let signal = 'observe';
  let title = 'Sledovať cenu';
  let detail = history.length < 2 ? 'Zatiaľ chýba dlhšia cenová história.' : 'Cena je blízko bežnej úrovne.';
  let quantity = 1;
  if (!best) {
    signal = 'nooffer';
    title = 'Bez aktuálnej akcie';
    detail = 'Produkt zostáva sledovaný; čakáme na ďalšie meranie.';
  } else if (shelf.factor >= 0.8 && ((low != null && current <= low * 1.01 && history.length >= 2) || discount >= 25)) {
    signal = 'stock';
    title = 'Nakúpiť do zásoby';
    quantity = clamp(purchases.typicalQuantity + 1 + Math.round(discount / 12), 2, 8);
    detail = `Silná cena a ${shelf.label}; odporúčaný rozsah približne ${quantity} ks.`;
  } else if (discount >= 18 || (usual != null && current <= usual * 0.9) || (purchases.dueIn != null && purchases.dueIn <= 7 && current <= (usual ?? current) * 1.03)) {
    signal = 'buy';
    title = 'Kúpiť tento týždeň';
    quantity = clamp(purchases.typicalQuantity, 1, 4);
    detail = purchases.dueIn != null && purchases.dueIn <= 7
      ? `Blíži sa obvyklý termín doplnenia; odporúčanie ${quantity} ks.`
      : 'Cena je priaznivá voči dostupným meraniam.';
  } else if (usual != null && current > usual * 1.08) {
    signal = 'wait';
    title = 'Počkať na lepšiu cenu';
    detail = `Aktuálna cena je nad mediánom ${fmtPrice(usual)}.`;
  }

  return {
    record,
    allOffers,
    best,
    history,
    purchases,
    shelf,
    current,
    low,
    usual,
    discount,
    score,
    confidence,
    signal,
    title,
    detail,
    quantity,
  };
}

function signalBadge(analysis) {
  return `<span class="track-signal ${analysis.signal}">${esc(analysis.title)}</span>`;
}

function recordAction(analysis, wide = false) {
  if (analysis.best) return watchButton(analysis.best, wide);
  return `<button class="watch-btn ${wide ? 'wide' : ''} tracked" data-action="untrack-record" data-product-id="${esc(analysis.record.productId)}" aria-label="Prestať sledovať ${esc(analysis.record.name)}" title="Prestať sledovať">${svg('bookmark')}${wide ? '<span>Sledované</span>' : ''}</button>`;
}

function dashboardCard(analysis) {
  const { record, best, purchases } = analysis;
  const priceMeta = best
    ? `${storeLogo(best.store)}${validityHtml(best)}`
    : `<span class="muted-line">Naposledy ${record.lastStore ? esc(record.lastStore) : 'bez obchodu'}${record.lastSeen ? ` · ${esc(fmtDate(record.lastSeen, true))}` : ''}</span>`;
  return `<article class="tracked-card signal-${analysis.signal}">
    <div class="tracked-card-head">
      <div><div class="tracked-kicker">${esc(record.category || 'Sledovaný produkt')}</div><h2>${esc(record.name)}</h2>${record.amount ? `<p>${esc(record.amount)}</p>` : ''}</div>
      ${recordAction(analysis)}
    </div>
    <div class="tracked-price-row"><strong>${analysis.current != null ? fmtPrice(analysis.current) : '—'}</strong><div>${priceMeta}</div></div>
    <div class="track-score-row">
      <div class="track-score" style="--score:${analysis.score}"><strong>${analysis.score}</strong><span>/100</span></div>
      <div><div class="track-recommendation">${signalBadge(analysis)}</div><p>${esc(analysis.detail)}</p></div>
    </div>
    <div class="track-meter"><i style="width:${analysis.confidence}%"></i></div>
    <div class="track-facts">
      <span>${analysis.history.length} cenových meraní</span>
      <span>${purchases.count ? `${purchases.count} nákupov v histórii` : 'bez nákupnej histórie'}</span>
      <span>${esc(analysis.shelf.label)}</span>
    </div>
    ${best ? `<div class="tracked-card-actions"><button class="secondary-btn" data-action="detail" data-key="${esc(best.key)}">Detail a história</button><div class="product-actions">${circleAddButton(best)}</div></div>` : ''}
  </article>`;
}

function listRow(analysis) {
  const best = analysis.best;
  return `<div class="tracked-list-row">
    <div><strong>${esc(analysis.record.name)}</strong><span>${esc(analysis.record.amount || analysis.record.category || '')}</span></div>
    <div>${signalBadge(analysis)}<span class="track-row-note">${analysis.history.length} meraní · istota ${analysis.confidence} %</span></div>
    <div class="tracked-list-price"><strong>${analysis.current != null ? fmtPrice(analysis.current) : '—'}</strong>${best ? storeLogo(best.store) : '<span>bez ponuky</span>'}</div>
    <div class="product-actions">${recordAction(analysis)}${best ? circleAddButton(best) : ''}</div>
  </div>`;
}

export function renderTracked() {
  const records = activeRecords();
  let analyses = records.map(analyse);
  analyses = analyses.filter(analysis => {
    const queryOk = !state.query || norm(`${analysis.record.name} ${analysis.record.category}`).includes(norm(state.query));
    const storeOk = state.store === 'all' || analysis.allOffers.some(offer => offer.storeId === state.store);
    const filterOk = state.trackedFilter === 'all' || analysis.signal === state.trackedFilter;
    return queryOk && storeOk && filterOk;
  });
  analyses.sort((a, b) => {
    if (state.trackedSort === 'price') return (a.current ?? Infinity) - (b.current ?? Infinity);
    if (state.trackedSort === 'name') return a.record.name.localeCompare(b.record.name, 'sk');
    if (state.trackedSort === 'confidence') return b.confidence - a.confidence;
    return b.score - a.score;
  });

  const allAnalyses = records.map(analyse);
  const withOffer = allAnalyses.filter(analysis => analysis.best).length;
  const stock = allAnalyses.filter(analysis => analysis.signal === 'stock').length;
  const avgConfidence = allAnalyses.length
    ? Math.round(allAnalyses.reduce((sum, analysis) => sum + analysis.confidence, 0) / allAnalyses.length)
    : 0;
  const summary = `<div class="tracked-summary">
    <span><strong>${records.length}</strong> sledovaných</span>
    <span><strong>${withOffer}</strong> v aktuálnej akcii</span>
    <span><strong>${stock}</strong> vhodných do zásoby</span>
    <span><strong>${avgConfidence} %</strong> priemerná istota</span>
  </div>`;

  const filters = [
    ['all', 'Všetky'], ['buy', 'Kúpiť'], ['stock', 'Do zásoby'], ['wait', 'Počkať'], ['nooffer', 'Bez akcie'],
  ].map(([key, label]) => `<button class="chip ${state.trackedFilter === key ? 'active' : ''}" data-action="tracked-filter" data-filter="${key}">${label}</button>`).join('');

  const toolbar = `<div class="tracked-toolbar">
    <div class="view-switch" role="group" aria-label="Spôsob zobrazenia">
      <button class="${state.trackedMode === 'dashboard' ? 'active' : ''}" data-action="tracked-mode" data-mode="dashboard">Dashboard</button>
      <button class="${state.trackedMode === 'list' ? 'active' : ''}" data-action="tracked-mode" data-mode="list">Zoznam</button>
    </div>
    <div class="filter-row">${filters}</div>
    <select class="sort-select" id="tracked-sort" aria-label="Triedenie sledovaných produktov">
      <option value="priority" ${state.trackedSort === 'priority' ? 'selected' : ''}>Najlepší nákupný signál</option>
      <option value="confidence" ${state.trackedSort === 'confidence' ? 'selected' : ''}>Najvyššia istota</option>
      <option value="price" ${state.trackedSort === 'price' ? 'selected' : ''}>Najnižšia cena</option>
      <option value="name" ${state.trackedSort === 'name' ? 'selected' : ''}>Podľa názvu</option>
    </select>
  </div>`;

  const method = `<details class="tracking-method"><summary>Ako vzniká odporúčanie</summary><p>Transparentný model kombinuje cenovú pozíciu (55 %), rytmus uložených nákupov (25 %) a skladovateľnosť (20 %). Pri malej histórii zámerne znižuje istotu; nejde o neoveriteľnú ML predpoveď.</p></details>`;

  const content = !records.length
    ? `<div class="empty-state"><strong>Zatiaľ nič nesleduješ.</strong><br>Pri produktoch použi ikonu záložky a postupne sa tu začne skladať cenová aj nákupná analytika.<br><button class="primary-btn" data-view="deals" style="margin-top:14px">Vybrať produkty</button></div>`
    : !analyses.length
      ? '<div class="empty-state"><strong>Filtru nič nezodpovedá.</strong><br>Skús iný obchod, stav alebo vyhľadávanie.</div>'
      : state.trackedMode === 'dashboard'
        ? `<div class="tracked-grid">${analyses.map(dashboardCard).join('')}</div>`
        : `<div class="tracked-list"><div class="tracked-list-head"><span>Produkt</span><span>Odporúčanie</span><span>Cena</span><span>Akcie</span></div>${analyses.map(listRow).join('')}</div>`;

  return `${pageHead({ eyebrow: 'Core sortiment', title: 'Sledované produkty', desc: 'Tovar, ktorý chceš mať pod kontrolou: aktuálna cena, história, nákupný rytmus a odporúčanie k zásobe.' })}
    ${summary}
    ${renderStoreTabs()}
    ${toolbar}
    ${method}
    ${content}`;
}
