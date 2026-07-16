// Detail produktu (bočný sheet): obsah, referenčná cena, porovnanie obchodov
// a správa fokusu, aby dialóg fungoval aj s klávesnicou a čítačkou.

import { state } from './state.js';
import { finalPrice, oldFinalPrice, discountOf } from './data.js';
import { inShopping } from './shopping.js';
import { priceChartHtml } from './charts.js';
import { mediaHtml, storeLogo, validityMeta, validityHtml, watchButton } from './views/shared.js';
import { svg } from './lib/icons.js';
import { $, esc, arr, norm, fmtPrice } from './lib/util.js';

let lastFocused = null;

const sheet = () => $('#detail-sheet');

export function isDetailOpen() {
  return sheet()?.classList.contains('open') ?? false;
}

// ---------------------------------------------------------------------------
// Referenčná cena a dôveryhodnosť
// ---------------------------------------------------------------------------

// Nájde externú referenčnú komoditu podľa kľúčových slov (data/referencne-ceny.json).
function refFor(item) {
  const ref = state.refData;
  if (!ref || !Array.isArray(ref.komodity)) return null;
  const haystack = norm((item.category || '') + ' ' + (item.name || ''));
  return (
    ref.komodity.find(k =>
      arr(k.klice || (k.klic ? [k.klic] : [])).some(word => word && haystack.includes(norm(word))),
    ) || null
  );
}

function referenceBlock(item) {
  const final = finalPrice(item);
  const old = oldFinalPrice(item);
  const ref60 = item.ref60;
  const ext = refFor(item);
  const rows = [];

  if (ref60 != null) {
    rows.push(`<div class="detail-row"><span>Bežná cena (60 dní)</span><span>${fmtPrice(ref60)}</span></div>`);
    if (final != null && ref60 > 0) {
      const save = Math.round(((ref60 - final) / ref60) * 100);
      if (save > 0) {
        rows.push(
          `<div class="detail-row"><span>Úspora oproti bežnej cene</span><span style="color:var(--green)">−${save} %</span></div>`,
        );
      }
    }
  }

  if (ext && ext.cena != null) {
    const typeLabel =
      ext.typ === 'vyrobna' ? 'Výrobná cena' : ext.typ === 'maloobchod' ? 'Trhová cena' : 'Referenčná cena';
    rows.push(
      `<div class="detail-row"><span>${esc(typeLabel)} · ${esc(ext.zdroj_nazov || 'zdroj')}</span><span>${fmtPrice(ext.cena)}${ext.jednotka ? ' /' + esc(ext.jednotka) : ''}</span></div>`,
    );
  }

  const warn =
    old != null && ref60 != null && old > ref60 * 1.12
      ? `<div class="ref-warn">${svg('alert')}<span>Pôvodná cena z letáku (${fmtPrice(old)}) je vyššia než bežná cena za 60 dní (${fmtPrice(ref60)}) – zľava môže byť nadhodnotená.</span></div>`
      : '';

  if (!rows.length && !warn) {
    return `<div class="detail-section"><h3>Referenčná cena</h3>
      <p class="ref-hint">Referenčná „bežná cena“ sa buduje z vlastnej cenovej histórie (<code>bezna_cena_60d</code>) týždeň po týždni; reálnosť zľavy sa počíta oproti nej, nie oproti prečiarknutej cene z letáku.</p>
    </div>`;
  }

  const attribution =
    ext && state.refData?.atribucia
      ? `<p class="ref-hint" style="margin-top:8px">${esc(state.refData.atribucia)}</p>`
      : '';

  return `<div class="detail-section"><h3>Referenčná cena a dôveryhodnosť</h3>${rows.join('')}${warn}${attribution}</div>`;
}

// ---------------------------------------------------------------------------
// Obsah detailu
// ---------------------------------------------------------------------------

function detailHtml(item) {
  const d = discountOf(item);
  const active = inShopping(item.key);
  const old = oldFinalPrice(item);

  const matches = state.items
    .filter(x => x.productId === item.productId)
    .sort((a, b) => (finalPrice(a) ?? Infinity) - (finalPrice(b) ?? Infinity));

  const compare =
    matches.length > 1
      ? `<div class="detail-section"><h3>Porovnanie obchodov</h3>${matches
          .map(
            (x, i) => `<div class="compare-row">
              <div>${storeLogo(x.store)}${i === 0 ? '<br><span style="color:var(--green)">Najlepšia cena</span>' : ''}<br>${validityHtml(x)}</div>
              <strong>${fmtPrice(finalPrice(x))}</strong>
            </div>`,
          )
          .join('')}</div>`
      : '';

  const discountRow =
    d != null
      ? `<div class="detail-row"><span>${item.realDiscount != null ? 'Reálna zľava' : 'Zľava v letáku'}</span><span>${d < 0 ? '+' : '−'}${Math.abs(Math.round(d))} %</span></div>`
      : '';

  const unitRow =
    item.unitPrice != null
      ? `<div class="detail-row"><span>Jednotková cena</span><span>${fmtPrice(item.unitPrice)}${item.unit ? ' / ' + esc(item.unit) : ''}</span></div>`
      : '';

  return `${mediaHtml(item, 'detail')}
    <div class="detail-hero">
      ${storeLogo(item.store)}
      <h2>${esc(item.name)}</h2>
      <div class="detail-price">${fmtPrice(finalPrice(item))}</div>
      ${old != null ? `<div class="price-old">Bežne ${fmtPrice(old)}</div>` : ''}
      <div style="margin-top:9px">${validityHtml(item)}</div>
    </div>
    <div class="detail-product-actions">
      <button class="primary-btn full" data-action="toggle-deal" data-key="${esc(item.key)}">
        ${active ? svg('check') + ' V zozname' : svg('plus') + ' Pridať do zoznamu'}
      </button>
      ${watchButton(item, true)}
    </div>
    ${priceChartHtml(item)}
    ${referenceBlock(item)}
    <div class="detail-section"><h3>Informácie o akcii</h3>
      ${discountRow}
      <div class="detail-row"><span>Hodnotenie</span><span>${item.verdict === 'realna' ? 'Reálne výhodná' : item.verdict === 'umela' ? 'Podozrivá zľava' : 'Neoverená'}</span></div>
      ${item.verdictReason ? `<div class="detail-row"><span>Prečo</span><span style="max-width:75%">${esc(item.verdictReason)}</span></div>` : ''}
      ${unitRow}
      ${item.condition ? `<div class="detail-row"><span>Podmienka</span><span>${esc(item.condition)}</span></div>` : ''}
      ${item.validFrom || item.validTo ? `<div class="detail-row"><span>Platnosť</span><span>${esc(validityMeta(item).text)}</span></div>` : ''}
      ${item.note ? `<div class="detail-row"><span>Poznámka</span><span>${esc(item.note)}</span></div>` : ''}
    </div>
    ${compare}`;
}

// ---------------------------------------------------------------------------
// Otváranie a zatváranie so správou fokusu
// ---------------------------------------------------------------------------

export function openDetail(item) {
  if (!item) return;
  lastFocused = document.activeElement;
  $('#sheet-body').innerHTML = detailHtml(item);
  const s = sheet();
  s.inert = false;
  s.classList.add('open');
  s.setAttribute('aria-hidden', 'false');
  $('#modal-backdrop').classList.add('open');
  document.body.style.overflow = 'hidden';
  $('#sheet-close')?.focus();
}

export function closeDetail() {
  const s = sheet();
  if (!s || !s.classList.contains('open')) return;
  s.classList.remove('open');
  s.setAttribute('aria-hidden', 'true');
  s.inert = true; // zatvorený sheet nesmie byť dosiahnuteľný klávesnicou
  $('#modal-backdrop').classList.remove('open');
  document.body.style.overflow = '';
  if (lastFocused?.isConnected) lastFocused.focus();
  lastFocused = null;
}

// Udrží Tab vnútri otvoreného dialógu. Volá sa z globálneho keydown v app.js.
export function trapFocus(event) {
  if (event.key !== 'Tab' || !isDetailOpen()) return;
  const focusables = sheet().querySelectorAll('button, a[href], input, select, [tabindex]:not([tabindex="-1"])');
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    last.focus();
    event.preventDefault();
  } else if (!event.shiftKey && document.activeElement === last) {
    first.focus();
    event.preventDefault();
  }
}
