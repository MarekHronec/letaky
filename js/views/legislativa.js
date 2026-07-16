// Pohľad Legislatíva: najbližšie termíny, povinnosti podľa kategórií
// a portály, kde sledovať zmeny. Číta data/legislativa.json (slovenské kľúče
// sú tu zámerne – ide o dátový kontrakt súboru).

import { URGENT_DEADLINE_DAYS } from '../config.js';
import { state, legStateOf } from '../state.js';
import { pageHead } from './shared.js';
import { svg } from '../lib/icons.js';
import { esc, arr, slug, daysTo, dateFrom, fmtDate, safeUrl } from '../lib/util.js';

// Bodky závažnosti 1–5 (dopad/pokuta).
function sevDots(n) {
  n = Math.max(0, Math.min(5, Math.round(Number(n)) || 0));
  if (!n) return '';
  const level = n >= 4 ? 'hi' : n === 3 ? 'mid' : 'lo';
  let dots = '';
  for (let k = 1; k <= 5; k++) dots += `<i class="${k <= n ? 'on' : ''}"></i>`;
  return `<span class="sev sev-${level}" title="Závažnosť ${n}/5 (dopad/pokuta)" aria-label="Závažnosť ${n} z 5">${dots}</span>`;
}

const header = () =>
  pageHead({
    eyebrow: 'Pre obchodníka',
    title: 'Legislatíva a povinnosti',
    desc: 'Dôležité termíny, zmeny a povinnosti pre predajňu potravín a drogérie na jednom mieste.',
    large: true,
  });

// Filtrovanie podľa nastavenia Platca DPH: položky označené dph:'platca'
// vidí len platca, dph:'neplatca' len neplatca, bez označenia všetci.
const dphOk = x => !x.dph || x.dph === state.settings.dph;

function renderTimeline(L) {
  const deadlines = arr(L.terminy)
    .filter(dphOk)
    .filter(t => {
      // štvrťročné DPH termíny nezobrazujeme mesačným platcom a naopak
      if (t.dph !== 'platca' || !state.settings.dphPeriod) return true;
      const isQuarterly = /štvrťrok|štvrťroč|kvart/i.test(t.nazov);
      return state.settings.dphPeriod === 'stvrtrocne' ? isQuarterly : !isQuarterly;
    })
    .map(t => ({ ...t, d: daysTo(t.datum) }))
    .filter(t => t.d == null || t.d >= -7)
    .sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9))
    .slice(0, 8);

  if (!deadlines.length) return '';

  const monthFmt = new Intl.DateTimeFormat('sk-SK', { month: 'short' });
  const rows = deadlines
    .map(t => {
      const date = dateFrom(t.datum);
      const urgent = t.d != null && t.d >= 0 && t.d <= URGENT_DEADLINE_DAYS;
      const relative =
        t.d == null ? '' : t.d < 0 ? 'termín prešiel' : t.d === 0 ? 'dnes' : t.d === 1 ? 'zajtra' : t.d <= 31 ? `o ${t.d} dní` : '';
      return `<div class="leg-deadline ${urgent ? 'urgent' : ''}">
        <div class="leg-date"><b>${date ? date.getDate() : '—'}</b><span>${date ? esc(monthFmt.format(date).replace('.', '')) : ''}</span></div>
        <div>
          <div class="d-title">${esc(t.nazov)}</div>
          <div class="d-sub">${esc([t.detail, relative].filter(Boolean).join(' · '))}</div>
        </div>
      </div>`;
    })
    .join('');

  return `<section class="leg-timeline">
    <h2>Najbližšie termíny</h2>
    <p>Zoradené podľa dátumu. Presné lehoty over v oficiálnych zdrojoch alebo s účtovníkom.</p>
    <div class="leg-deadlines">${rows}</div>
  </section>`;
}

function renderLegItem(category, p) {
  const stateKey = category.id + ':' + slug(p.nazov);
  const st = legStateOf(stateKey);
  if (state.legHide && st) return '';

  const sourceLink = safeUrl(p.zdroj)
    ? `<a class="leg-src" href="${esc(safeUrl(p.zdroj))}" target="_blank" rel="noopener noreferrer">${esc(p.zdroj_nazov || 'Zdroj')} ${svg('external')}</a>`
    : '';

  const tags = [
    p.ucinne_od ? `<span class="leg-tag since">účinné od ${esc(fmtDate(p.ucinne_od, true))}</span>` : '',
    p.kedy ? `<span class="leg-tag when">${esc(p.kedy)}</span>` : '',
    p.koho ? `<span class="leg-tag who">${esc(p.koho)}</span>` : '',
    p.confidence === 'low' ? '<span class="leg-tag conf-low">orientačné – overiť</span>' : '',
  ].join('');

  const actions = [
    ['done', 'Hotové'],
    ['irrelevant', 'Nerelevantné'],
    ['ignored', 'Ignorovať'],
  ]
    .map(
      ([value, label]) =>
        `<button class="leg-st-btn ${st === value ? 'on ' + value : ''}" data-action="leg-state" data-key="${esc(stateKey)}" data-st="${value}">${label}</button>`,
    )
    .join('');

  return `<div class="leg-item st-${esc(st)}">
    <div class="leg-item-head">
      <h3>${esc(p.nazov)}</h3>
      <div class="leg-head-right">${sevDots(p.zavaznost)}${sourceLink}</div>
    </div>
    ${p.detail ? `<p class="detail">${esc(p.detail)}</p>` : ''}
    <div class="leg-tags">${tags}</div>
    <div class="leg-actions">${actions}</div>
  </div>`;
}

function renderGroups(categories) {
  return `<div class="leg-groups">${categories
    .map(
      c => `<section class="leg-group">
        <div class="leg-group-head">
          <div class="leg-ic">${svg(c.ikona || 'doc')}</div>
          <div><h2>${esc(c.nazov)}</h2>${c.popis ? `<p>${esc(c.popis)}</p>` : ''}</div>
        </div>
        <div class="leg-items">${arr(c.polozky).filter(dphOk).map(p => renderLegItem(c, p)).join('')}</div>
      </section>`,
    )
    .join('')}</div>`;
}

function renderPortals(L) {
  const portals = arr(L.portaly);
  if (!portals.length) return '';
  const rows = portals
    .map(pt => {
      const title = safeUrl(pt.url)
        ? `<a class="leg-src" href="${esc(safeUrl(pt.url))}" target="_blank" rel="noopener noreferrer">${esc(pt.nazov)} ${svg('external')}</a>`
        : esc(pt.nazov);
      return `<div class="leg-item">
        <div class="leg-item-head"><h3>${title}</h3>${pt.newsletter && /áno/i.test(pt.newsletter) ? '<span class="leg-tag who">newsletter</span>' : ''}</div>
        <p class="detail">${esc(pt.co)}${pt.newsletter ? ` · <em>${esc(pt.newsletter)}</em>` : ''}</p>
      </div>`;
    })
    .join('');
  return `<section class="leg-group" style="margin-top:14px">
    <div class="leg-group-head">
      <div class="leg-ic">${svg('external')}</div>
      <div><h2>Kde sledovať zmeny</h2><p>Oficiálne portály a newslettre pre obchodníka</p></div>
    </div>
    <div class="leg-items">${rows}</div>
  </section>`;
}

export function renderLegislativa() {
  const L = state.legData;
  if (L === null) return `${header()}<div class="empty-state">Načítavam prehľad povinností…</div>`;
  if (L === false || !arr(L.kategorie).length) {
    return `${header()}<div class="empty-state"><strong>Prehľad povinností sa nepodarilo načítať.</strong><br>Skontroluj súbor <code>data/legislativa.json</code>.</div>`;
  }

  const categories = arr(L.kategorie);
  const shown = state.legCat === 'all' ? categories : categories.filter(c => c.id === state.legCat);

  const chips = `<div class="leg-cats">
    <button class="chip ${state.legCat === 'all' ? 'active' : ''}" data-action="leg-cat" data-cat="all">Všetko</button>
    ${categories.map(c => `<button class="chip ${state.legCat === c.id ? 'active' : ''}" data-action="leg-cat" data-cat="${esc(c.id)}">${esc(c.nazov)}</button>`).join('')}
    <button class="chip ${state.legHide ? 'active' : ''}" data-action="leg-hide">${state.legHide ? 'Zobraziť vybavené' : 'Skryť vybavené'}</button>
  </div>`;

  const intro = `<div class="leg-intro">
    <p>${esc(L.popis || 'Prehľad hlavných povinností a termínov pre maloobchod s potravinami a drogériou v SR.')}</p>
    <div class="leg-disclaimer">${svg('alert')}<span>${esc(L.upozornenie || 'Ide o orientačný prehľad, nie právne poradenstvo. Konkrétne termíny, sadzby a povinnosti si over v oficiálnych zdrojoch alebo s účtovníkom/právnikom.')}</span></div>
    <div class="sev-legend"><span>Guličky = závažnosť / dopad:</span> ${sevDots(1)} <span>malé (napr. platí roky)</span> · ${sevDots(5)} <span>vysoké (veľká pokuta / dopad)</span></div>
  </div>`;

  const updated = L.aktualizovane
    ? `<div class="updated" style="margin:-8px 0 14px"><i class="dot"></i>Aktualizované ${esc(fmtDate(L.aktualizovane, true))}</div>`
    : '';

  return `${header()}${updated}${intro}${renderTimeline(L)}${chips}${renderGroups(shown)}${state.legCat === 'all' ? renderPortals(L) : ''}`;
}
