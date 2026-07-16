// Malé čisté pomôcky bez závislostí na zvyšku aplikácie.

export const $ = selector => document.querySelector(selector);

// Odstráni diakritiku a zmenší na malé písmená – základ vyhľadávania a slugov.
export const norm = s =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export const slug = s =>
  norm(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'polozka';

export const uid = () =>
  globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);

export const arr = value => (Array.isArray(value) ? value : []);

// Prevedie hodnotu na číslo; null/undefined/prázdny reťazec vracia ako null
// (pozor: Number(null) je 0, preto explicitná kontrola).
export const num = value => {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

// Escapovanie do HTML. Každá hodnota pochádzajúca z dát musí prejsť cez esc()
// skôr, než skončí v innerHTML – vrátane hodnôt v atribútoch.
export const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Povolí iba http(s) odkazy – všetko ostatné (javascript:, file: …) zahodí.
export function safeUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url, location.href);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

// Ako safeUrl, ale pre obrázky navyše povolí data:image URI.
export function safeImg(url) {
  if (!url) return '';
  const s = String(url).trim();
  if (/^data:image\//i.test(s)) return s;
  return safeUrl(s);
}

const eur = new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' });

export const fmtPrice = n =>
  n == null || n === '' || !Number.isFinite(Number(n)) ? '' : eur.format(Number(n));

export function dateFrom(value) {
  if (!value) return null;
  const d = new Date(String(value).length === 10 ? value + 'T00:00:00' : value);
  return Number.isNaN(+d) ? null : d;
}

// Počet dní odo dneška do daného dátumu (0 = dnes, záporné = v minulosti).
export function daysTo(value) {
  const d = dateFrom(value);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

export function fmtDate(value, withYear = false) {
  const d = dateFrom(value);
  if (!d) return '';
  const opts = withYear
    ? { day: 'numeric', month: 'numeric', year: 'numeric' }
    : { day: 'numeric', month: 'numeric' };
  return new Intl.DateTimeFormat('sk-SK', opts).format(d);
}

// Normalizuje ľubovoľný dátumový vstup na ISO reťazec, inak vráti fallback.
export function isoValue(value, fallback = '') {
  const t = Date.parse(value || '');
  return Number.isFinite(t) ? new Date(t).toISOString() : fallback;
}

export function measurementWord(n) {
  return n === 1 ? 'meranie' : n >= 2 && n <= 4 ? 'merania' : 'meraní';
}

// localStorage môže chýbať (private mode) alebo byť plný – všetky prístupy
// idú cez tieto tri funkcie, aby try/catch nebolo rozkopírované po kóde.
export function readJSON(key, fallback = null) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // plné/nedostupné úložisko – appka beží ďalej, len bez perzistencie
  }
}

export function removeStored(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignorujeme – kľúč buď neexistuje, alebo úložisko nie je dostupné
  }
}
