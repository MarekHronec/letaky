// Detail produktu (bočný sheet): obsah, cenová história, porovnanie obchodov
// a správa fokusu, aby dialóg fungoval aj s klávesnicou a čítačkou.

import { state } from './state.js';
import { finalPrice, oldFinalPrice, discountOf } from './data.js';
import { inShopping } from './shopping.js';
import { priceChartHtml } from './charts.js';
import { mediaHtml, storeLogo, validityMeta, validityHtml, watchButton } from './views/shared.js';
import { svg } from './lib/icons.js';
import { $, esc, fmtPrice } from './lib/util.js';

let lastFocused = null;

const sheet = () => $('#detail-sheet');

export function isDetailOpen() {
  return sheet()?.classList.contains('open') ?? false;
}

// ---------------------------------------------------------------------------
// Referenčná cena a dôveryhodnosť
// ---------------------------------------------------------------------------

function referenceBlock(item) {
  const final = finalPrice(item);
  const old = oldFinalPrice(item);
  const ref60 = item.ref60;
  const rows = [];

  if (ref60 != null) {
    rows.push(`<div class="detail-row"><span>Referenčná cena aplikácie (60 dní)</span><span>${fmtPrice(ref60)}</span></div>`);
    if (final != null && ref60 > 0) {
      const save = Math.round(((ref60 - final) / ref60) * 100);
      if (save > 0) {
        rows.push(
          `<div class="detail-row"><span>Rozdiel oproti referenčnej cene</span><span style="color:var(--green)">−${save} %</span></div>`,
        );
      }
    }
  }

  const warn =
    old != null && ref60 != null && old > ref60 * 1.12
      ? `<div class="ref-warn">${svg('alert')}<span>Pôvodná cena uvedená v letáku (${fmtPrice(old)}) je vyššia než referenčná cena aplikácie za 60 dní (${fmtPrice(ref60)}). Letákové percento preto nepotvrdzuje naša história.</span></div>`
      : '';

  if (!rows.length && !warn) {
    return `<div class="detail-section"><h3>Referenčná cena</h3>
      <p class="ref-hint">Referenčná cena sa buduje z dostupnej cenovej histórie aplikácie (<code>bezna_cena_60d</code>) týždeň po týždni. Nie je to zákonná predchádzajúca cena konkrétneho obchodníka.</p>
    </div>`;
  }

  return `<div class="detail-section"><h3>Referenčná cena a dôveryhodnosť</h3>${rows.join('')}${warn}</div>`;
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
              <div>${storeLogo(x.store)}${i === 0 ? '<br><span style="color:var(--green)">Najnižšia z aktuálne porovnaných ponúk</span>' : ''}<br>${validityHtml(x)}</div>
              <strong>${fmtPrice(finalPrice(x))}</strong>
            </div>`,
          )
          .join('')}</div>`
      : '';

  const discountRow =
    d != null
      ? `<div class="detail-row"><span>${item.realDiscount != null ? 'Rozdiel oproti referenčnej cene aplikácie' : 'Zľava uvedená v letáku'}</span><span>${d < 0 ? '+' : '−'}${Math.abs(Math.round(d))} %</span></div>`
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
      ${old != null ? `<div class="price-old">Pôvodná cena v letáku ${fmtPrice(old)}</div>` : ''}
      <div style="margin-top:9px">${validityHtml(item)}</div>
    </div>
    <div class="detail-product-actions">
      <button class="primary-btn full" data-action="toggle-deal" data-key="${esc(item.key)}">
        ${active ? svg('check') + ' V zozname' : svg('plus') + ' Pridať do zoznamu'}
      </button>
      ${watchButton(item, true)}
    </div>
    ${item.sourceUrl ? `<a class="secondary-btn full detail-source-link" href="${esc(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">Overiť v oficiálnom letáku ${svg('external')}</a>` : ''}
    ${priceChartHtml(item)}
    ${referenceBlock(item)}
    <div class="detail-section"><h3>Informácie o akcii</h3>
      ${discountRow}
      <div class="detail-row"><span>Hodnotenie aplikácie</span><span>${item.verdict === 'realna' ? 'Priaznivá podľa dostupnej histórie' : item.verdict === 'umela' ? 'Letáková zľava nepodporená históriou' : 'Nedostatok cenovej histórie'}</span></div>
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
