// Dátová vrstva: načítanie týždenných JSON súborov a ich normalizácia na
// kanonické objekty. Všetko mapovanie kľúčov zo schémy v2 (slovenské názvy)
// sa deje TU – zvyšok aplikácie číta už len kanonické anglické kľúče.

import { STORE_ORDER, TOP_COUNT, HISTORY_MAX_POINTS } from './config.js';
import { state } from './state.js';
import { arr, num, norm, slug, safeUrl, daysTo } from './lib/util.js';

// Akcie viazané na vernostnú kartu (nastavenie „Skryť kartové akcie").
export const CARD_CONDITION_RE = /karta|card|xtra|lidl ?plus/i;

export function storeId(name) {
  const n = norm(name);
  return STORE_ORDER.find(k => n.includes(k)) || slug(n || 'other');
}

export function extractAmount(name) {
  return String(name || '').match(/\b\d+(?:[,.]\d+)?\s?(?:kg|g|l|ml|ks)\b/i)?.[0] || '';
}

// Ak routine omylom vygeneruje product_id s prefixom obchodu (kaufland-maslo…),
// prefix odstránime – inak by porovnanie rovnakého produktu medzi obchodmi
// nikdy nenašlo zhodu. Správne product_id je bez obchodu (viď README).
function stripStorePrefix(productId, sid) {
  return productId.startsWith(sid + '-') && productId.length > sid.length + 1
    ? productId.slice(sid.length + 1)
    : productId;
}

// ---------------------------------------------------------------------------
// Normalizácia (schéma v2 → kanonické objekty)
// ---------------------------------------------------------------------------

function normalizeStore(raw) {
  const name = raw.nazov || raw.id || 'Ostatné';
  return {
    id: raw.id || storeId(name),
    name,
    validFrom: raw.plati_od || '',
    validTo: raw.plati_do || '',
    flyerUrl: safeUrl(raw.letak_url),
    itemsRaw: arr(raw.polozky),
  };
}

export function normalizeItem(raw, store) {
  const name = raw.nazov || 'Položka';
  const sid = store?.id || storeId(raw.obchod || '');
  const productId = stripStorePrefix(String(raw.product_id || slug(name)), sid);
  const id = String(raw.id || `${sid}-${productId}`);
  return {
    id,
    key: `${sid}|${id}`,
    productId,
    name,
    storeId: sid,
    store: raw.obchod || store?.name || 'Ostatné',
    amount: raw.mnozstvo || extractAmount(name),
    price: num(raw.cena),
    priceVat: num(raw.cena_s_dph),
    oldPrice: num(raw.cena_povodna),
    oldPriceVat: num(raw.cena_povodna_s_dph),
    flyerDiscount: num(raw.zlava_letak_pct),
    realDiscount: num(raw.zlava_realna_pct),
    verdict: raw.verdikt || 'neoverene',
    verdictReason: raw.dovod_verdiktu || null,
    condition: raw.podmienka || '',
    validFrom: raw.plati_od || store?.validFrom || '',
    validTo: raw.plati_do || store?.validTo || '',
    note: raw.poznamka || '',
    image: raw.obrazok_url || '',
    unitPrice: num(raw.jednotkova_cena),
    unit: raw.jednotka || '',
    category: raw.kategoria || '',
    ref60: num(raw.bezna_cena_60d),
    history: arr(raw.historia_cien),
  };
}

function normalizePromo(raw) {
  const storeName = raw.obchod || 'Ostatné';
  return {
    id: raw.id || '',
    store: storeName,
    storeId: storeId(storeName),
    text: raw.text || '',
    condition: raw.podmienka || '',
    validFrom: raw.plati_od || '',
    validTo: raw.plati_do || '',
    priority: num(raw.priorita) ?? 3,
    sourceUrl: safeUrl(raw.zdroj_url),
  };
}

function normalizePlan(raw) {
  if (!raw || !arr(raw.zastavky).length) return null;
  return {
    stops: arr(raw.zastavky).map((z, i) => ({
      order: z.poradie ?? i + 1,
      name: z.nazov || '',
      day: z.den || '',
      note: z.poznamka || '',
      estimate: num(z.odhad_eur),
    })),
    mapsUrl: safeUrl(raw.maps_url),
  };
}

function normalizeOpeningHours(raw) {
  if (!raw || !arr(raw.predajne).length) return null;
  return {
    period: raw.obdobie || '',
    location: raw.lokalita || '',
    holidayNote: raw.poznamka_sviatky || '',
    holidaySourceUrl: safeUrl(raw.zdroj_sviatky_url),
    stores: arr(raw.predajne).map(store => ({
      id: store.id || storeId(store.nazov || ''),
      name: store.nazov || 'Predajňa',
      address: store.adresa || '',
      verified: store.overene || '',
      sourceUrl: safeUrl(store.zdroj_url),
      hours: arr(store.hodiny).map(row => ({ days: row.dni || '', time: row.cas || '' })),
      exceptions: arr(store.vynimky).map(row => ({
        date: row.datum || '',
        name: row.nazov || '',
        time: row.cas || '',
      })),
    })),
  };
}

// Dve rovnako pomenované ponuky bez vlastného id by dostali rovnaký kľúč –
// doplníme poradové číslo, aby sa tlačidlá a detail nepreplietli.
function dedupeKeys(items) {
  const seen = new Map();
  items.forEach(item => {
    const n = seen.get(item.key) || 0;
    seen.set(item.key, n + 1);
    if (n) {
      item.id = `${item.id}-${n + 1}`;
      item.key = `${item.storeId}|${item.id}`;
    }
  });
}

export function normalizeData(raw) {
  const stores = arr(raw.obchody).map(normalizeStore);
  const items = [];
  stores.forEach(store => store.itemsRaw.forEach(x => items.push(normalizeItem(x, store))));
  dedupeKeys(items);
  stores.forEach(s => delete s.itemsRaw);

  const top = arr(raw.top_ids)
    .map(id => items.find(i => i.id === id))
    .filter(Boolean);

  return {
    week: raw.tyzden || '',
    period: raw.obdobie || raw.tyzden || '',
    generated: String(raw.generovane || '').slice(0, 10),
    stores,
    items,
    promos: arr(raw.promo).map(normalizePromo),
    plan: normalizePlan(raw.plan),
    openingHours: normalizeOpeningHours(raw.otvaracie_hodiny),
    sources: arr(raw.zdroje_stav).map(s => ({ name: s.zdroj || '', ok: s.ok !== false })),
    top: top.length ? top : rankByDiscount(items.filter(i => i.verdict === 'realna')),
  };
}

// ---------------------------------------------------------------------------
// Ceny a zľavy
// ---------------------------------------------------------------------------

// Platca DPH vidí ako hlavnú cenu bez DPH (Metro), ostatní cenu s DPH.
export function finalPrice(i) {
  return state.settings.dph === 'platca' ? (i.price ?? i.priceVat) : (i.priceVat ?? i.price);
}

export function oldFinalPrice(i) {
  return state.settings.dph === 'platca' ? (i.oldPrice ?? i.oldPriceVat) : (i.oldPriceVat ?? i.oldPrice);
}

// Reálna zľava má prednosť pred letákovou; ako posledná možnosť sa dopočíta
// z prečiarknutej ceny. Môže byť aj záporná (tovar zdražel oproti norme).
export function discountOf(i) {
  if (i.realDiscount != null) return i.realDiscount;
  if (i.flyerDiscount != null) return i.flyerDiscount;
  const p = finalPrice(i);
  const o = oldFinalPrice(i);
  return p != null && o != null && o > p ? Math.round(((o - p) / o) * 100) : null;
}

export function rankByDiscount(items, count = TOP_COUNT) {
  return items
    .slice()
    .sort((a, b) => (discountOf(b) || 0) - (discountOf(a) || 0))
    .slice(0, count);
}

export function offerByKey(key) {
  return state.items.find(i => i.key === key) || state.top.find(i => i.key === key);
}

// Položky po aplikovaní nastavenia „Skryť kartové akcie" – používa sa všade,
// kde sa zobrazujú ponuky (prehľad aj katalóg), aby nastavenie platilo jednotne.
export function visibleItems(items = state.items) {
  let out = state.week === 'latest'
    ? items.filter(i => {
        const remaining = daysTo(i.validTo);
        return remaining == null || remaining >= 0;
      })
    : items;
  if (state.settings.hideCard) out = out.filter(i => !CARD_CONDITION_RE.test(i.condition || ''));
  return out;
}

export function sortedStores() {
  return state.data.stores.slice().sort((a, b) => {
    const ai = STORE_ORDER.indexOf(a.id);
    const bi = STORE_ORDER.indexOf(b.id);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
}

// História cien: overené body z dát + aktuálna cena tohto týždňa.
// Vždy preferujeme cenu s DPH, aby sa v grafe nemiešali cenové bázy
// (aktuálny bod preto NEZÁVISÍ od nastavenia Platca DPH).
export function historySeries(i) {
  const points = new Map();
  arr(i.history).forEach(p => {
    const date = String(p.datum || '').slice(0, 10);
    const price = num(p.cena_s_dph ?? p.cena);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && price != null) points.set(date, { date, price });
  });
  const generated = state.data?.generated || '';
  const current = i.priceVat ?? i.price;
  if (/^\d{4}-\d{2}-\d{2}$/.test(generated) && current != null) {
    points.set(generated, { date: generated, price: current });
  }
  return [...points.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-HISTORY_MAX_POINTS);
}

// ---------------------------------------------------------------------------
// Načítanie dát
// Bez ?v= cache-busterov: service worker je network-first, takže čerstvosť je
// zaručená, a cache:'no-cache' nechá server odpovedať 304, keď sa nič nezmenilo.
// ---------------------------------------------------------------------------

export async function loadWeek(week) {
  state.week = week;
  const path = week === 'latest' ? 'data/latest.json' : `data/archive/${encodeURIComponent(week)}.json`;
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = normalizeData(await res.json());
  state.data = data;
  state.items = data.items;
  state.top = data.top;
}

export async function loadArchiveWeeks() {
  try {
    const res = await fetch('data/archive/index.json', { cache: 'no-cache' });
    const weeks = await res.json();
    return Array.isArray(weeks) ? weeks.slice().sort().reverse() : [];
  } catch {
    return [];
  }
}

export async function loadLegislativa() {
  try {
    const res = await fetch('data/legislativa.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error();
    state.legData = await res.json();
  } catch {
    state.legData = false;
  }
}

export async function loadReference() {
  try {
    const res = await fetch('data/referencne-ceny.json', { cache: 'no-cache' });
    if (res.ok) state.refData = await res.json();
  } catch {
    // referenčné ceny sú voliteľné – bez nich sa len nezobrazí externá kotva
  }
}
