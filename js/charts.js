// Grafy vývoja ceny: malý sparkline v zoznamoch a veľký graf v detaile.
// Zdieľajú výpočet súradníc aj text trendu, aby sa logika neduplikovala.

import { historySeries } from './data.js';
import { esc, fmtPrice, fmtDate, measurementWord } from './lib/util.js';

// Slovný popis zmeny ceny medzi prvým a posledným meraním.
function trendLabel(series) {
  const change = series.at(-1).price - series[0].price;
  if (Math.abs(change) < 0.005) return 'bez zmeny';
  return change < 0 ? `klesla o ${fmtPrice(Math.abs(change))}` : `stúpla o ${fmtPrice(change)}`;
}

// Prevod série meraní na súradnice v SVG ploche.
function chartCoords(series, { w, h, padL, padR, padT, padB }) {
  const values = series.map(p => p.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const X = n => padL + (w - padL - padR) * (series.length === 1 ? 0.5 : n / (series.length - 1));
  const Y = v => (max === min ? padT + (h - padT - padB) / 2 : padT + (h - padT - padB) * (1 - (v - min) / range));
  return { min, max, pts: series.map((p, n) => [X(n), Y(p.price)]) };
}

const fx = n => n.toFixed(1);

// Malý sparkline do riadku ponuky. Vracia '' pri menej ako dvoch meraniach.
export function sparklineHtml(item) {
  const series = historySeries(item);
  if (series.length < 2) return '';
  const dims = { w: 72, h: 24, padL: 2, padR: 2, padT: 2, padB: 2 };
  const { pts } = chartCoords(series, dims);
  const points = pts.map(p => `${fx(p[0])},${fx(p[1])}`).join(' ');
  const last = pts.at(-1);
  const label = `Zaznamenaná cena: ${trendLabel(series)} za ${series.length} ${measurementWord(series.length)}`;
  return `<span class="price-sparkline" role="img" aria-label="${esc(label)}" title="${esc(label)}">
    <svg viewBox="0 0 ${dims.w} ${dims.h}" aria-hidden="true" focusable="false">
      <polyline points="${points}"></polyline>
      <circle cx="${fx(last[0])}" cy="${fx(last[1])}" r="2"></circle>
    </svg>
  </span>`;
}

// Veľký graf vývoja ceny v detaile produktu.
export function priceChartHtml(item) {
  const series = historySeries(item);
  if (series.length < 2) {
    return `<div class="price-chart"><h3>Vývoj ceny</h3>
      <p class="sub">Zatiaľ ${series.length} ${measurementWord(series.length)}. Graf sa objaví po druhom meraní rovnakého produktu v tomto obchode — cenová história sa buduje týždeň po týždni.</p>
    </div>`;
  }

  const dims = { w: 320, h: 120, padL: 8, padR: 8, padT: 16, padB: 20 };
  const { min, max, pts } = chartCoords(series, dims);
  const line = pts.map(p => `${fx(p[0])},${fx(p[1])}`).join(' ');
  const baseline = fx(dims.h - dims.padB);
  const area = `${fx(pts[0][0])},${baseline} ${line} ${fx(pts.at(-1)[0])},${baseline}`;
  const trend = trendLabel(series);
  const trendArrow = trend === 'bez zmeny' ? trend : (trend.startsWith('klesla') ? '↓ ' : '↑ ') + trend;

  const dots = pts
    .map((p, n) => {
      const isLow = Math.abs(series[n].price - min) < 0.005;
      const style = isLow ? ' style="stroke:var(--green);fill:var(--green)"' : '';
      return `<circle class="pt" cx="${fx(p[0])}" cy="${fx(p[1])}" r="${isLow ? 3.4 : 2.6}"${style}></circle>`;
    })
    .join('');

  const gridTop = `<line class="grid-line" x1="${dims.padL}" y1="${fx(dims.padT)}" x2="${dims.w - dims.padR}" y2="${fx(dims.padT)}"></line>`;
  const gridBottomY = max === min ? fx(dims.padT + (dims.h - dims.padT - dims.padB) / 2) : baseline;
  const gridBottom = `<line class="grid-line" x1="${dims.padL}" y1="${gridBottomY}" x2="${dims.w - dims.padR}" y2="${gridBottomY}"></line>`;

  const first = series[0];
  const last = series.at(-1);
  const firstPt = pts[0];
  const lastPt = pts.at(-1);
  const ariaLabel = `Graf vývoja ceny za ${series.length} ${measurementWord(series.length)}, ${trend}`;

  return `<div class="price-chart"><h3>Vývoj ceny</h3>
    <p class="sub">${series.length} ${measurementWord(series.length)} · ${esc(trendArrow)}</p>
    <svg viewBox="0 0 ${dims.w} ${dims.h}" role="img" aria-label="${esc(ariaLabel)}">
      <polygon class="area" points="${area}"></polygon>
      ${gridTop}${gridBottom}
      <text class="lbl" x="${dims.padL}" y="${fx(dims.padT - 3)}" text-anchor="start">max ${esc(fmtPrice(max))}</text>
      <polyline class="pl" points="${line}"></polyline>
      ${dots}
      <text class="val" x="${fx(firstPt[0])}" y="${fx(firstPt[1] - 6)}" text-anchor="start">${esc(fmtPrice(first.price))}</text>
      <text class="val" x="${fx(lastPt[0])}" y="${fx(lastPt[1] - 6)}" text-anchor="end">${esc(fmtPrice(last.price))}</text>
      <text class="lbl" x="${dims.padL}" y="${fx(dims.h - 6)}" text-anchor="start">${esc(fmtDate(first.date))}</text>
      <text class="lbl" x="${dims.w - dims.padR}" y="${fx(dims.h - 6)}" text-anchor="end">${esc(fmtDate(last.date))}</text>
    </svg>
    <div class="price-chart-legend"><span class="lo">● najnižšia zaznamenaná: ${esc(fmtPrice(min))}</span></div>
  </div>`;
}
