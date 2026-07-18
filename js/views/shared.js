// Komponenty zdieľané viacerými pohľadmi: hlavička stránky, logá obchodov,
// platnosť akcie, obrázok/emoji položky, odznaky a tlačidlá do zoznamu.

import { STORE_COLORS } from '../config.js';
import { state } from '../state.js';
import { storeId, sortedStores, discountOf } from '../data.js';
import { inShopping } from '../shopping.js';
import { isTracked } from '../tracking.js';
import { svg } from '../lib/icons.js';
import { esc, daysTo, fmtDate, safeImg, norm } from '../lib/util.js';

// ---------------------------------------------------------------------------
// Hlavička stránky (jedno miesto pre eyebrow/nadpis/popis aj archívnu poznámku)
// ---------------------------------------------------------------------------

export function archiveNote() {
  return state.week !== 'latest'
    ? `<div class="archive-note">Prezeráš archív ${esc(state.week)}. Tieto akcie už nemusia platiť.</div>`
    : '';
}

// options: { eyebrow, title, desc, large, withArchiveNote }
export function pageHead({ eyebrow, title, desc = '', large = false, withArchiveNote = false }) {
  return `<div class="page-head${large ? ' period-head' : ''}">
    <div>
      <div class="eyebrow">${esc(eyebrow)}</div>
      <h1>${esc(title)}</h1>
      ${desc ? `<p>${esc(desc)}</p>` : ''}
    </div>
  </div>${withArchiveNote ? archiveNote() : ''}`;
}

// ---------------------------------------------------------------------------
// Obchody
// ---------------------------------------------------------------------------

export function storeStyle(name) {
  return `--store-color:${STORE_COLORS[storeId(name)] || 'var(--brand)'}`;
}

export function storeLogo(name) {
  return `<span class="store-logo" style="${storeStyle(name)}"><i class="store-dot"></i>${esc(name || 'Ostatné')}</span>`;
}

export function renderStoreTabs(className = '') {
  const tabs = sortedStores()
    .map(s => {
      const active = state.store === s.id ? 'active' : '';
      return `<button class="store-tab ${active}" data-action="store" data-store="${esc(s.id)}" style="${storeStyle(s.id)}" aria-pressed="${active ? 'true' : 'false'}"><i class="store-dot"></i>${esc(s.name)}</button>`;
    })
    .join('');
  return `<div class="store-tabs${className ? ` ${esc(className)}` : ''}" role="group" aria-label="Filtrovať podľa obchodu">
    <button class="store-tab ${state.store === 'all' ? 'active' : ''}" data-action="store" data-store="all" aria-pressed="${state.store === 'all' ? 'true' : 'false'}">Všetky obchody</button>
    ${tabs}
  </div>`;
}

// ---------------------------------------------------------------------------
// Platnosť akcie
// ---------------------------------------------------------------------------

export function validityMeta(i) {
  const from = i?.validFrom || '';
  const to = i?.validTo || '';
  const d = daysTo(to);
  if (to && d != null && d < 0) return { text: `Skončilo ${fmtDate(to)}`, cls: 'expired' };
  if (to && d === 0) return { text: 'Platí už len dnes', cls: 'urgent' };
  if (to && d === 1) return { text: 'Zostáva 1 deň', cls: 'urgent' };
  if (to && d === 2) return { text: 'Zostávajú 2 dni', cls: 'urgent' };
  if (from && to) return { text: `Platí ${fmtDate(from)} – ${fmtDate(to)}`, cls: '' };
  if (to) return { text: `Platí do ${fmtDate(to)}`, cls: '' };
  if (from) return { text: `Platí od ${fmtDate(from)}`, cls: '' };
  return { text: 'Platnosť neuvedená', cls: '' };
}

export function validityHtml(i, meta = validityMeta(i)) {
  return `<span class="validity ${meta.cls}">${svg('clock')}${esc(meta.text)}</span>`;
}

// ---------------------------------------------------------------------------
// Obrázok položky s emoji fallbackom podľa kategórie/názvu
// ---------------------------------------------------------------------------

const CATEGORY_EMOJI = [
  ['syr', '🧀'], ['maslo', '🧈'], ['tvaroh', '🧀'], ['niva', '🧀'], ['smotan', '🥛'], ['jogurt', '🥛'],
  ['acidko', '🥛'], ['mlie', '🥛'], ['muller', '🥛'], ['trio dez', '🍮'], ['dezert', '🍮'], ['pagac', '🥐'],
  ['tasti', '🥐'], ['pizz', '🍕'], ['rozok', '🥖'], ['chlieb', '🍞'], ['bageta', '🥖'], ['pec', '🥖'],
  ['kava', '☕'], ['caj', '🍵'], ['schogetten', '🍫'], ['cokolad', '🍫'], ['sladk', '🍬'], ['cukrik', '🍬'],
  ['cukor', '🧂'], ['sol', '🧂'], ['pivo', '🍺'], ['mineral', '💧'], ['lubovni', '💧'], ['voda', '💧'],
  ['dzus', '🧃'], ['nealko', '🍺'], ['napoj', '🥤'], ['krkovic', '🥩'], ['panenk', '🥩'], ['svieckov', '🥩'],
  ['rebr', '🍖'], ['koleno', '🍖'], ['maso', '🥩'], ['uden', '🥓'], ['salam', '🥓'], ['klobas', '🌭'],
  ['kurac', '🍗'], ['ryb', '🐟'], ['paradaj', '🍅'], ['uhork', '🥒'], ['cuket', '🥒'], ['sampin', '🍄'],
  ['huby', '🍄'], ['cibul', '🧅'], ['karfiol', '🥦'], ['brokoli', '🥦'], ['salat', '🥬'], ['redkov', '🥬'],
  ['kukuric', '🌽'], ['hrasok', '🫛'], ['marhul', '🍑'], ['jablk', '🍎'], ['banan', '🍌'], ['citron', '🍋'],
  ['pomaranc', '🍊'], ['hrozno', '🍇'], ['zelenin', '🥬'], ['ovoci', '🍎'], ['muka', '🌾'], ['ryza', '🍚'],
  ['cestovin', '🍝'], ['olej', '🫙'], ['ocot', '🫙'], ['med', '🍯'], ['konzerv', '🥫'], ['trvanl', '🥫'],
  ['prac', '🧴'], ['avivaz', '🧴'], ['cist', '🧴'], ['mydl', '🧼'], ['sampon', '🧴'], ['zubn', '🪥'],
  ['toalet', '🧻'], ['papier', '🧻'], ['plien', '🧷'], ['drog', '🧴'],
];

function mediaEmoji(item) {
  const haystack = norm((item.category || '') + ' ' + (item.name || ''));
  for (const [keyword, emoji] of CATEGORY_EMOJI) {
    if (haystack.includes(keyword)) return emoji;
  }
  return '🛒';
}

// kind: 'card' (predvolené) | 'detail'
export function mediaHtml(item, kind = 'card') {
  const img = safeImg(item.image);
  const cls = kind === 'detail' ? 'detail-media' : 'product-media';
  // Bez inline onerror (blokuje ho CSP) – nefunkčné obrázky odstraňuje
  // globálny error listener v app.js, aby presvitlo emoji pod nimi.
  const imgTag = img ? `<img src="${esc(img)}" alt="${esc(item.name)}" loading="lazy">` : '';
  return `<div class="${cls}"><span class="ph">${mediaEmoji(item)}</span>${imgTag}</div>`;
}

// ---------------------------------------------------------------------------
// Odznaky a tlačidlá
// ---------------------------------------------------------------------------

// Odznak zľavy. Zápornú alebo nulovú „zľavu" nezobrazujeme – tovar nezlacnel.
export function discountBadge(i) {
  const d = discountOf(i);
  if (d == null || Math.round(d) <= 0) return '';
  return `<span class="discount ${i.verdict === 'umela' ? 'suspicious' : ''}">−${Math.round(d)} %</span>`;
}

export function cardBadges(i) {
  const verdictBadge =
    i.verdict === 'realna'
      ? `<span class="badge good">${svg('check')} Reálna</span>`
      : i.verdict === 'umela'
        ? `<span class="badge warn">${svg('alert')} Podozrivá</span>`
        : '<span class="badge good">Neoverená</span>';
  return `<div class="top-badges">${verdictBadge}${discountBadge(i)}${storeLogo(i.store)}</div>`;
}

// Okrúhle tlačidlo +/✓ v riadku ponuky.
export function circleAddButton(i) {
  const active = inShopping(i.key);
  return `<button class="circle-add ${active ? 'in' : ''}" data-action="toggle-deal" data-key="${esc(i.key)}" aria-label="${active ? 'Odobrať' : 'Pridať'} ${esc(i.name)}">${svg(active ? 'check' : 'plus')}</button>`;
}

// Sekundárna produktová akcia. V kompaktných riadkoch je ikonová, v detaile
// a analytike môže mať textový label.
export function watchButton(i, wide = false) {
  const active = isTracked(i);
  const label = active ? 'Prestať sledovať' : 'Sledovať produkt';
  return `<button class="watch-btn ${wide ? 'wide' : ''} ${active ? 'tracked' : ''}" data-action="toggle-track" data-key="${esc(i.key)}" aria-label="${label} ${esc(i.name)}" title="${label}">
    ${svg('bookmark')}${wide ? `<span>${active ? 'Sledované' : 'Sledovať'}</span>` : ''}
  </button>`;
}

// Široké tlačidlo na karte produktu.
export function addWideButton(i) {
  const active = inShopping(i.key);
  return `<button class="add-wide ${active ? 'in' : ''}" data-action="toggle-deal" data-key="${esc(i.key)}">${active ? '✓ V zozname' : '+ Do zoznamu'}</button>`;
}

// Veľké primárne tlačidlo (praktický tip, detail produktu).
export function primaryToggleButton(i, extraStyle = '') {
  const active = inShopping(i.key);
  return `<button class="primary-btn full" data-action="toggle-deal" data-key="${esc(i.key)}"${extraStyle ? ` style="${extraStyle}"` : ''}>${active ? svg('check') + ' V zozname' : svg('plus') + ' Pridať do zoznamu'}</button>`;
}
