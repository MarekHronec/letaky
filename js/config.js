// Konštanty a nastavenia aplikácie na jednom mieste.
// Pozor: pri pridaní/premenovaní súboru v js/ treba súbor doplniť do SHELL
// zoznamu v sw.js a bumpnúť tam verziu CACHE.

export const STORE_ORDER = ['metro', 'kaufland', 'lidl', 'tesco', 'billa', 'coop', 'dm', 'teta'];

export const STORE_COLORS = {
  metro: 'var(--metro)',
  kaufland: 'var(--kaufland)',
  lidl: 'var(--lidl)',
  tesco: 'var(--tesco)',
  billa: 'var(--billa)',
  coop: 'var(--coop)',
  dm: 'var(--dm)',
  teta: 'var(--teta)',
  other: 'var(--brand)',
};

export const VIEWS = ['overview', 'deals', 'list', 'legislativa', 'profil'];

// Kľúče v localStorage. Všetky dáta appky žijú pod prefixom "letaky.".
export const KEYS = {
  list: 'letaky.shoppingList.v2',
  listDeleted: 'letaky.shoppingDeleted.v1',
  settings: 'letaky.settings.v1',
  legStates: 'letaky.legStates.v2', // v2: { klucPolozky: { st, updatedAt } }
  legStatesV1: 'letaky.legStates.v1', // stará podoba, číta sa už len pri migrácii
  savedLists: 'letaky.savedLists.v1',
  savedListsDeleted: 'letaky.savedListsDeleted.v1',
};

// Časy a limity (predtým magické čísla roztrúsené po kóde).
export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // ako dlho si pamätáme zmazanie kvôli syncu
export const TOAST_MS = 2100; // ako dlho svieti toast
export const SEARCH_DEBOUNCE_MS = 120; // odklad vyhľadávania počas písania
export const PUSH_DEBOUNCE_MS = 800; // odklad odoslania zmien do cloudu
export const SHARE_URL_MAX = 14000; // dlhší zdieľací link odmietneme vytvoriť
export const SHARE_HASH_MAX = 20000; // dlhší prijatý #share= fragment odmietneme čítať
export const SHARE_ITEMS_MAX = 200; // max položiek prijatých z linku alebo importu
export const HISTORY_MAX_POINTS = 16; // max bodov cenovej histórie v grafe
export const PROMO_PREVIEW_COUNT = 4; // koľko špeciálnych akcií vidno bez rozbalenia
export const TOP_COUNT = 10; // veľkosť rebríčka Top príležitostí
export const DEALS_PAGE_SIZE = 120; // koľko kariet katalógu sa vykreslí naraz
export const ENDING_SOON_DAYS = 2; // "končí čoskoro" = platí ešte 0 až N dní
export const URGENT_DEADLINE_DAYS = 14; // termín legislatívy zvýrazníme, ak je do N dní
export const VOICE_LANG = 'sk-SK';

// Supabase – voliteľné prihlásenie a synchronizácia medzi zariadeniami.
// Publishable kľúč je určený do prehliadača; dáta chráni Row Level Security
// (presné policies sú zdokumentované v supabase/schema.sql).
export const SUPABASE = {
  url: 'https://ihtwxmxmkwigbbkcgubs.supabase.co',
  key: 'sb_publishable_4BCQJlSVTq-cfFAAgTvs1Q_WbEY57_7',
  // Presne pripnutá verzia klienta – zmena verzie je vedomé rozhodnutie, nie náhoda.
  clientUrl: 'https://esm.sh/@supabase/supabase-js@2.45.4',
};
