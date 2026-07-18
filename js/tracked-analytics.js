// Čistý, vysvetliteľný analytický model pre sledované produkty.
// Dôležité pravidlo: odporúčanie nikdy nemieša ceny s DPH a bez DPH.
// Model nevracia falošnú percentuálnu "istotu", ale kvalitu vstupných dát.

const DAY_MS = 86_400_000;
const STRONG_PRICE_POINTS = 3;

const arr = value => Array.isArray(value) ? value : [];
const finite = value => {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function median(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function dayKey(value) {
  const raw = String(value || '');
  const direct = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : '';
}

function todayKey(value = new Date()) {
  if (typeof value === 'string') return dayKey(value);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(+date)) return dayKey(new Date());
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function daysBetween(from, to) {
  const start = Date.parse(`${dayKey(from)}T00:00:00Z`);
  const end = Date.parse(`${dayKey(to)}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / DAY_MS) : null;
}

function addDays(value, amount) {
  const parsed = Date.parse(`${dayKey(value)}T00:00:00Z`);
  return Number.isFinite(parsed) ? new Date(parsed + amount * DAY_MS).toISOString().slice(0, 10) : '';
}

export function classifyOfferPeriod(offer, today = new Date()) {
  const now = todayKey(today);
  const from = dayKey(offer?.validFrom);
  const to = dayKey(offer?.validTo);
  if (to && to < now) return 'expired';
  if (from && from > now) return 'upcoming';
  return 'active';
}

function normalizedText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function amountMeasure(value) {
  // Prefix nemusí byť oddelený medzerou (`cena za1kg` sa v letákoch vyskytuje).
  const match = normalizedText(value).match(/(\d+(?:[,.]\d+)?)\s*(kg|g|l|ml|ks)(?:\b|$)/i);
  if (!match) return null;
  const amount = Number(match[1].replace(',', '.'));
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(amount)) return null;
  if (unit === 'kg') return { family: 'mass', value: amount * 1000 };
  if (unit === 'g') return { family: 'mass', value: amount };
  if (unit === 'l') return { family: 'volume', value: amount * 1000 };
  if (unit === 'ml') return { family: 'volume', value: amount };
  return { family: 'pieces', value: amount };
}

export function packageCompatibility(record, offer) {
  const recordAmount = amountMeasure(record?.amount);
  const offerAmount = amountMeasure(offer?.amount);
  if (recordAmount && offerAmount) {
    const same = recordAmount.family === offerAmount.family
      && Math.abs(recordAmount.value - offerAmount.value) <= Math.max(0.01, recordAmount.value * 0.005);
    return same ? 'exact' : 'mismatch';
  }
  const left = normalizedText(record?.amount);
  const right = normalizedText(offer?.amount);
  if (!left || !right) return 'uncertain';
  return left === right ? 'exact' : 'uncertain';
}

function normalizedUnit(value) {
  const unit = normalizedText(value).replace(/[^a-z0-9]/g, '');
  if (['kg', 'g', 'l', 'ml', 'ks'].includes(unit)) return unit;
  return '';
}

function offerPrice(offer, basis, metric = 'package') {
  if (!offer) return null;
  if (metric === 'unit') return basis === 'vat' ? finite(offer.unitPrice) : null;
  // Ak `priceVat` chýba, normalizované `price` je spotrebiteľská cena
  // (Kaufland/Lidl). Net cenu poznáme iba pri explicitnom VAT páre (Metro).
  if (basis === 'vat') return finite(offer.priceVat ?? offer.price);
  return finite(offer.priceVat) != null ? finite(offer.price) : finite(offer.priceNet);
}

function chooseBestOffer(offers) {
  return offers
    .filter(offer => offerPrice(offer, 'vat') != null)
    .slice()
    .sort((a, b) => offerPrice(a, 'vat') - offerPrice(b, 'vat'))[0] || null;
}

function chooseMetric(record, offers, selectedStore) {
  // Jednotkovú cenu používame iba pri skutočnom porovnaní viacerých obchodov,
  // ak všetky porovnávané ponuky deklarujú tú istú jednotku. Inak zostávame
  // na cene presného balenia a nepredstierame prepočet, ktorý v dátach nie je.
  // Dataset ešte nedáva jednotkovej cene samostatnú VAT/net bázu. Kým ju
  // schéma nedodá, bezpečne porovnávame cenu presného balenia.
  void offers;
  void selectedStore;
  return { key: 'package', unit: normalizedUnit(record?.unit) };
}

function pointPrice(raw, basis, metric) {
  if (metric === 'unit') {
    if (basis !== 'vat') return null;
    return finite(raw?.unitPriceVat ?? raw?.jednotkova_cena_s_dph ?? raw?.unitPrice ?? raw?.jednotkova_cena);
  }
  if (basis === 'vat') {
    return finite(raw?.priceVat ?? raw?.cena_s_dph ?? raw?.consumerPrice);
  }
  return finite(raw?.priceNet ?? raw?.cena_bez_dph ?? raw?.netPrice);
}

function legacyVatPrice(raw) {
  // `record.history` je migrovaná história, ktorú tracking vždy ukladal ako
  // spotrebiteľskú cenu. Používame ju len vo VAT vetve.
  return finite(raw?.cena ?? raw?.price);
}

function verifiedVerdict(value) {
  return ['realna', 'realna_zlava', 'overena', 'verified'].includes(normalizedText(value).replace(/\s+/g, '_'));
}

function historyPoint(raw, defaults, basis, metric, legacy = false) {
  const date = dayKey(raw?.date ?? raw?.datum);
  const price = legacy && basis === 'vat' && metric === 'package'
    ? legacyVatPrice(raw)
    : pointPrice(raw, basis, metric);
  if (!date || price == null || price < 0) return null;
  return {
    date,
    price,
    storeId: String(raw?.storeId || defaults.storeId || ''),
    store: String(raw?.store || raw?.obchod || defaults.store || ''),
    verified: verifiedVerdict(raw?.verdict ?? defaults.verdict),
    source: String(raw?.source || defaults.source || 'history'),
  };
}

export function buildPriceHistories(record, offers, options = {}) {
  const basis = options.basis === 'net' ? 'net' : 'vat';
  const metric = options.metric === 'unit' ? 'unit' : 'package';
  const selectedStore = options.selectedStore || 'all';
  const generatedDate = dayKey(options.generatedDate) || todayKey(options.today);
  const points = new Map();
  const add = point => {
    if (!point) return;
    // Jedno meranie za obchod a deň. Cena je súčasťou kľúča až pre body bez
    // identity obchodu, aby sa anonymné pozorovania navzájom nestratili.
    const storeKey = point.storeId || normalizedText(point.store);
    const key = storeKey ? `${point.date}|${storeKey}` : `${point.date}|unknown|${point.price}`;
    points.set(key, point);
  };

  arr(record?.priceHistory).forEach(raw => {
    const observed = dayKey(raw?.date ?? raw?.datum);
    const starts = dayKey(raw?.validFrom ?? raw?.plati_od);
    // Staršia verzia refreshu mohla zapísať budúcu letákovú cenu v deň
    // generovania. Taký bod nie je historické pozorovanie, kým akcia nezačne.
    if (observed && starts && observed < starts) return;
    add(historyPoint(raw, {}, basis, metric));
  });
  if (!arr(record?.priceHistory).length) {
    arr(record?.history).forEach(raw => add(historyPoint(raw, {}, basis, metric, true)));
  }

  offers.forEach(offer => {
    arr(offer.history).forEach(raw => add(historyPoint(raw, {
      storeId: offer.storeId,
      store: offer.store,
      verdict: offer.verdict,
      source: 'dataset-history',
    }, basis, metric, basis === 'vat' && metric === 'package' && raw?.cena_s_dph == null)));
    if (classifyOfferPeriod(offer, options.today) === 'active') {
      const price = offerPrice(offer, basis, metric);
      if (price != null) add({
        date: generatedDate,
        price,
        storeId: String(offer.storeId || ''),
        store: String(offer.store || ''),
        verified: verifiedVerdict(offer.verdict),
        source: 'current-observation',
      });
    }
  });

  const market = [...points.values()].sort((a, b) => a.date.localeCompare(b.date) || a.storeId.localeCompare(b.storeId));
  const store = selectedStore === 'all'
    ? market
    : market.filter(point => point.storeId === selectedStore);
  return { market, store, selected: selectedStore === 'all' ? market : store };
}

export function robustPriceStats(points, currentPrice = null) {
  const values = arr(points).map(point => finite(point?.price)).filter(value => value != null && value >= 0);
  if (!values.length) {
    return {
      count: 0, distinctDates: 0, median: null, low: null, high: null, percentile: null,
      rawPercentile: null, position: 'unknown', positionLabel: 'bez cenovej histórie',
    };
  }
  const centre = median(values);
  const mad = median(values.map(value => Math.abs(value - centre)));
  const robustValues = values.length >= 5 && mad > 0
    ? values.filter(value => Math.abs(value - centre) <= mad * 4.4478)
    : values;
  const usual = median(robustValues);
  const current = finite(currentPrice);
  const below = current == null ? 0 : robustValues.filter(value => value < current).length;
  const equal = current == null ? 0 : robustValues.filter(value => Math.abs(value - current) < 0.00001).length;
  const rawPercentile = current == null ? null : ((below + equal * 0.5) / robustValues.length) * 100;
  // Malá vzorka sa zmrští k neutrálnej 50. pozícii; tri body už môžu ukázať
  // smer, ale nie extrémnu "istotu".
  const weight = robustValues.length / (robustValues.length + 2);
  const percentile = rawPercentile == null ? null : 50 + (rawPercentile - 50) * weight;
  let position = 'unknown';
  let positionLabel = 'bez cenovej histórie';
  if (percentile != null) {
    if (robustValues.length < STRONG_PRICE_POINTS) {
      position = 'insufficient';
      positionLabel = 'málo meraní';
    } else if (percentile <= 25) {
      position = 'exceptional';
      positionLabel = 'medzi najnižšími cenami';
    } else if (percentile <= 40) {
      position = 'favourable';
      positionLabel = 'pod bežnou cenou';
    } else if (percentile <= 65) {
      position = 'usual';
      positionLabel = 'na bežnej úrovni';
    } else {
      position = 'expensive';
      positionLabel = 'nad bežnou cenou';
    }
  }
  return {
    count: robustValues.length,
    distinctDates: new Set(arr(points).map(point => point?.date).filter(Boolean)).size,
    median: usual,
    low: Math.min(...robustValues),
    high: Math.max(...robustValues),
    mad,
    percentile,
    rawPercentile,
    position,
    positionLabel,
  };
}

export function confirmedPurchaseStats(record, transactions, today = new Date()) {
  const productId = String(record?.productId || '');
  const events = arr(transactions)
    .filter(transaction => dayKey(transaction?.purchasedAt))
    .map(transaction => {
      const items = arr(transaction.items).filter(item => item?.productId != null && String(item.productId) === productId);
      if (!items.length) return null;
      const quantity = items.reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1), 0);
      const paid = items.reduce((sum, item) => {
        const price = finite(item.purchasePrice ?? item.priceVat);
        return price == null ? sum : sum + price * Math.max(1, Number(item.quantity) || 1);
      }, 0);
      return { date: dayKey(transaction.purchasedAt), quantity, paid: paid || null };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Viac položiek rovnakého produktu v jednej transakcii je jeden nákupný bod.
  const byDate = new Map();
  events.forEach(event => {
    const previous = byDate.get(event.date);
    byDate.set(event.date, previous
      ? { date: event.date, quantity: previous.quantity + event.quantity, paid: (previous.paid || 0) + (event.paid || 0) }
      : event);
  });
  const purchases = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const intervals = purchases.slice(1)
    .map((purchase, index) => daysBetween(purchases[index].date, purchase.date))
    .filter(days => days > 0);
  const observedCadence = median(intervals);
  const manualCadence = finite(record?.manualCadenceDays);
  const cadence = manualCadence > 0 ? manualCadence : observedCadence;
  const lastDate = purchases.at(-1)?.date || '';
  const todayDate = todayKey(today);
  const daysSince = lastDate ? Math.max(0, daysBetween(lastDate, todayDate)) : null;
  const dueIn = cadence != null && daysSince != null ? Math.round(cadence - daysSince) : null;
  return {
    count: purchases.length,
    events: purchases,
    lastDate,
    observedCadence,
    cadence,
    cadenceSource: manualCadence > 0 ? 'manual' : observedCadence != null ? 'observed' : 'unknown',
    daysSince,
    dueIn,
    nextDueDate: cadence != null && lastDate ? addDays(lastDate, Math.round(cadence)) : '',
    typicalQuantity: Math.max(1, Math.round(median(purchases.map(purchase => purchase.quantity)) || 1)),
  };
}

function shelfProfile(record) {
  const explicit = record?.stockProfile && record.stockProfile !== 'auto';
  const shelfLifeDays = Math.max(0, Math.round(finite(record?.shelfLifeDays) || 0));
  const text = normalizedText(`${record?.category || ''} ${record?.name || ''}`);
  const guessed = /droger|cist|prac|papier|konzerv|ryz|cestovin|muk|cukor|sol|olej|kav|caj|trvanliv|plien|mydl|sampon|zubn/.test(text)
    ? 'durable'
    : /cerstv|ovoc|zelen|maso|ryb|peciv|jogurt|mliec|smotan|lahodk|salat/.test(text)
      ? 'perishable'
      : 'medium';
  const key = explicit ? record.stockProfile : guessed;
  const labels = {
    durable: 'dlhá trvanlivosť',
    medium: 'stredná trvanlivosť',
    perishable: 'krátka trvanlivosť',
  };
  return {
    key,
    label: labels[key] || labels.medium,
    explicit,
    shelfLifeDays,
    stockable: (explicit && key === 'durable') || shelfLifeDays >= 60,
  };
}

function qualityTier({ priceStats, verified, packageState, basis, purchases, hasOffer }) {
  const issues = [];
  if (priceStats.count < STRONG_PRICE_POINTS || priceStats.distinctDates < 2) issues.push('Málo nezávislých cenových meraní');
  if (hasOffer && !verified) issues.push('Ponuka nie je overená ako reálna zľava');
  if (packageState === 'mismatch' || (hasOffer && packageState !== 'exact')) issues.push('Balenie nie je spoľahlivo zhodné');
  if (basis === 'net') issues.push('Chýba spotrebiteľská cena s DPH');
  if (purchases.count < 2 && purchases.cadenceSource !== 'manual') issues.push('Chýba potvrdený nákupný rytmus');
  const strongPriceEvidence = priceStats.count >= STRONG_PRICE_POINTS && priceStats.distinctDates >= 2;
  const key = (!hasOffer || verified) && (!hasOffer || packageState === 'exact') && priceStats.count >= 6 && purchases.count >= 3
    ? 'high'
    : (!hasOffer || verified) && (!hasOffer || packageState === 'exact') && strongPriceEvidence
      ? 'medium'
      : 'low';
  return {
    key,
    label: key === 'high' ? 'Silné dáta' : key === 'medium' ? 'Stredné dáta' : 'Slabé dáta',
    issues,
    strongPriceEvidence,
  };
}

function stockQuantity(record, purchases, shelf, signal) {
  const onHand = Math.max(0, Math.round(finite(record?.onHand) || 0));
  const minStock = Math.max(0, Math.round(finite(record?.minStock) || 0));
  const typical = purchases.typicalQuantity || 1;
  let desired = Math.max(minStock, typical);
  if (signal === 'stock') {
    const cadence = purchases.cadence || 30;
    const possibleCycles = shelf.shelfLifeDays > 0 ? Math.floor(shelf.shelfLifeDays / cadence) : 2;
    const cycles = clamp(possibleCycles, 2, 3);
    desired = Math.max(desired, typical * cycles + minStock);
  }
  return clamp(Math.ceil(desired - onHand), 0, 24);
}

function basisForOffer(offer, record) {
  if (finite(offer?.priceVat ?? offer?.price) != null) return 'vat';
  if (finite(record?.lastPriceVat ?? record?.lastPrice) != null) return 'vat';
  return 'net';
}

export function analyseTrackedProduct(record, options = {}) {
  const today = options.today || new Date();
  const selectedStore = options.selectedStore || 'all';
  const rawOffers = arr(options.offers).filter(offer => offer?.productId === record?.productId);
  const liveRawOffers = rawOffers.filter(offer => classifyOfferPeriod(offer, today) !== 'expired');
  const scopedRawOffers = selectedStore === 'all'
    ? liveRawOffers
    : liveRawOffers.filter(offer => offer.storeId === selectedStore);
  const compatible = rawOffers.map(offer => ({ offer, packageState: packageCompatibility(record, offer) }));
  const eligibleOffers = compatible.filter(entry => entry.packageState !== 'mismatch').map(entry => entry.offer);
  const scopedOffers = selectedStore === 'all'
    ? eligibleOffers
    : eligibleOffers.filter(offer => offer.storeId === selectedStore);
  const activeOffers = scopedOffers.filter(offer => classifyOfferPeriod(offer, today) === 'active');
  const upcomingOffers = scopedOffers.filter(offer => classifyOfferPeriod(offer, today) === 'upcoming');
  const bestActive = chooseBestOffer(activeOffers);
  const bestUpcoming = chooseBestOffer(upcomingOffers);
  const focalOffer = bestActive || bestUpcoming;
  const offerState = bestActive ? 'active' : bestUpcoming ? 'upcoming' : 'none';
  const basis = basisForOffer(focalOffer, record);
  const relevantOffers = activeOffers.length ? activeOffers : upcomingOffers;
  const metric = chooseMetric(record, relevantOffers, selectedStore);
  const scopedCompatibleCount = scopedRawOffers.filter(offer => packageCompatibility(record, offer) !== 'mismatch').length;
  const hasScopedPackageMismatch = scopedRawOffers.length > 0 && scopedCompatibleCount === 0;
  const focalPackageState = focalOffer ? packageCompatibility(record, focalOffer) : hasScopedPackageMismatch ? 'mismatch' : 'uncertain';
  const displayPrice = focalOffer
    ? offerPrice(focalOffer, basis, 'package')
    : basis === 'vat' ? finite(record?.lastPriceVat ?? record?.lastPrice) : finite(record?.lastPrice);
  const comparisonPrice = focalOffer ? offerPrice(focalOffer, basis, metric.key) : displayPrice;
  const histories = buildPriceHistories(record, eligibleOffers, {
    basis,
    metric: metric.key,
    selectedStore,
    generatedDate: options.generatedDate,
    today,
  });
  const price = robustPriceStats(histories.selected, comparisonPrice);
  const purchases = confirmedPurchaseStats(record, options.purchases, today);
  const shelf = shelfProfile(record);
  const verified = Boolean(focalOffer && verifiedVerdict(focalOffer.verdict));
  const quality = qualityTier({ priceStats: price, verified, packageState: focalPackageState, basis, purchases, hasOffer: Boolean(focalOffer) });
  const targetBasis = record?.targetBasis === 'net' ? 'net' : 'vat';
  const targetObservedPrice = targetBasis === 'vat'
    ? displayPrice
    : focalOffer
      ? offerPrice(focalOffer, 'net', 'package')
      : finite(record?.lastPriceVat) != null ? finite(record?.lastPrice) : null;
  const targetMet = finite(record?.targetPrice) != null
    && targetObservedPrice != null
    && targetObservedPrice <= finite(record.targetPrice);
  const onHand = Math.max(0, Math.round(finite(record?.onHand) || 0));
  const minStock = Math.max(0, Math.round(finite(record?.minStock) || 0));
  const lowStock = minStock > 0 && onHand <= minStock;
  const dueSoon = purchases.dueIn != null && purchases.dueIn <= 7;
  const favourable = ['exceptional', 'favourable'].includes(price.position)
    || (price.median != null && comparisonPrice != null && comparisonPrice <= price.median * 0.9);
  const expensive = price.position === 'expensive'
    || (price.median != null && comparisonPrice != null && comparisonPrice > price.median * 1.08);
  const strongAllowed = verified && quality.strongPriceEvidence && focalPackageState === 'exact';
  const upcomingCheaper = bestActive && bestUpcoming
    && offerPrice(bestUpcoming, basis, 'package') != null
    && offerPrice(bestActive, basis, 'package') != null
    && offerPrice(bestUpcoming, basis, 'package') < offerPrice(bestActive, basis, 'package') * 0.97;

  let signal = 'observe';
  let title = 'Sledovať cenu';
  let detail = 'Cena je blízko dostupnej bežnej úrovne.';
  if (!focalOffer) {
    signal = hasScopedPackageMismatch ? 'needsdata' : 'nooffer';
    title = hasScopedPackageMismatch ? 'Skontrolovať balenie' : 'Bez platnej ponuky';
    detail = hasScopedPackageMismatch
      ? 'Ponuka má rovnakú identitu produktu, ale nesedí jej balenie.'
      : 'Produkt zostáva sledovaný a čaká na ďalšiu ponuku.';
  } else if (offerState === 'upcoming') {
    signal = 'upcoming';
    title = `Počkať do ${dayKey(bestUpcoming.validFrom) || 'začiatku akcie'}`;
    detail = 'Táto cena ešte neplatí; ponuka je označená ako budúca.';
  } else if (upcomingCheaper) {
    signal = 'wait';
    title = `Počkať do ${dayKey(bestUpcoming.validFrom)}`;
    detail = 'Najbližšia známa ponuka bude lacnejšia než dnešná.';
  } else if (expensive) {
    signal = 'wait';
    title = 'Počkať na lepšiu cenu';
    detail = price.median != null ? 'Aktuálna cena je nad robustným mediánom histórie.' : detail;
  } else if (!strongAllowed && (favourable || targetMet || lowStock || dueSoon)) {
    signal = 'needsdata';
    title = 'Potrebné lepšie dáta';
    detail = !verified
      ? 'Cena môže vyzerať dobre, no ponuka nie je overená.'
      : 'Na silné nákupné odporúčanie treba aspoň 3 cenové body z 2 dátumov a presné balenie.';
  } else if (strongAllowed && favourable && shelf.stockable && (dueSoon || lowStock || targetMet)) {
    signal = 'stock';
    title = 'Doplniť zásobu';
    detail = 'Overená priaznivá cena, použiteľná história a dostatočná trvanlivosť.';
  } else if (strongAllowed && (
    (favourable && (dueSoon || lowStock || targetMet || price.position === 'exceptional'))
    || ((dueSoon || lowStock) && price.median != null && comparisonPrice <= price.median * 1.03)
  )) {
    signal = 'buy';
    title = 'Kúpiť teraz';
    detail = dueSoon || lowStock
      ? 'Cena je priaznivá a produkt sa blíži k doplneniu.'
      : 'Cena patrí medzi najlepšie porovnateľné merania.';
  }

  let quantity = ['buy', 'stock'].includes(signal) ? stockQuantity(record, purchases, shelf, signal) : 0;
  if (['buy', 'stock'].includes(signal) && quantity === 0) {
    signal = 'observe';
    title = 'Zásoba zatiaľ postačuje';
    detail = 'Cena je priaznivá, ale podľa zadanej domácej zásoby netreba prikupovať.';
    quantity = 0;
  }
  const savingPerUnit = price.median != null && comparisonPrice != null
    ? Math.max(0, price.median - comparisonPrice)
    : 0;
  const expectedSavings = quantity ? savingPerUnit * quantity : 0;
  const timing = offerState === 'upcoming'
    ? `Od ${dayKey(focalOffer.validFrom)}`
    : offerState === 'active' && focalOffer.validTo
      ? `Teraz · do ${dayKey(focalOffer.validTo)}`
      : offerState === 'active' ? 'Teraz' : 'Pri ďalšej ponuke';
  const reasons = [
    price.count
      ? `${price.positionLabel}; ${price.count} porovnateľných bodov`
      : 'Bez porovnateľnej cenovej histórie',
    purchases.count
      ? `${purchases.count} ${purchases.count === 1 ? 'potvrdený nákup' : purchases.count <= 4 ? 'potvrdené nákupy' : 'potvrdených nákupov'}${purchases.cadence ? ` · rytmus ${Math.round(purchases.cadence)} dní` : ''}`
      : purchases.cadenceSource === 'manual' ? `Ručný rytmus ${Math.round(purchases.cadence)} dní` : 'Bez potvrdených nákupov',
    focalOffer ? (verified ? 'Ponuka je overená' : 'Ponuka nie je overená') : 'Bez platnej ponuky',
  ];
  if (!shelf.explicit) reasons.push(`Skladovateľnosť je iba odhad: ${shelf.label}`);
  if (focalPackageState !== 'exact') reasons.push('Treba potvrdiť zhodu balenia');

  const signalPriority = { stock: 100, buy: 90, wait: 75, upcoming: 60, needsdata: 50, observe: 35, nooffer: 10 }[signal] || 0;
  const dueBoost = purchases.dueIn == null ? 0 : clamp(14 - purchases.dueIn, 0, 20);
  return {
    record,
    allOffers: rawOffers,
    eligibleOffers,
    activeOffers,
    upcomingOffers,
    bestActive,
    bestUpcoming,
    best: focalOffer,
    offerState,
    basis: {
      key: basis,
      label: basis === 'vat' ? 'cena s DPH' : 'cena bez DPH – náhradná báza',
      fallback: basis !== 'vat',
    },
    metric,
    histories,
    price: {
      ...price,
      displayPrice,
      comparisonPrice,
      savingPerUnit,
      targetMet,
    },
    purchases,
    shelf,
    quality: { ...quality, verified, packageState: focalPackageState },
    stock: { onHand, minStock, low: lowStock },
    signal,
    title,
    detail,
    timing,
    quantity,
    expectedSavings,
    reasons,
    urgency: signalPriority + dueBoost,
  };
}

export function compareTrackedAnalyses(a, b, sort = 'urgency') {
  if (sort === 'savings') return (b.expectedSavings || 0) - (a.expectedSavings || 0) || b.urgency - a.urgency;
  if (sort === 'price-position') return (a.price.percentile ?? 101) - (b.price.percentile ?? 101) || b.urgency - a.urgency;
  if (sort === 'name') return String(a.record.name).localeCompare(String(b.record.name), 'sk');
  return b.urgency - a.urgency || (a.price.percentile ?? 101) - (b.price.percentile ?? 101);
}
