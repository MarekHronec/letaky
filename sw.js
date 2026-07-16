// Service worker: offline cache pre app shell aj dáta.
//
// Stratégia: network-first – online sa vždy zobrazia čerstvé dáta, offline
// posledná úspešne stiahnutá verzia. Cache kľúč sa normalizuje bez query
// stringu, takže každý súbor má v cache PRÁVE JEDEN záznam, ktorý sa
// prepisuje (žiadny nekonečný rast, offline vždy najnovšia verzia).
//
// Pri KAŽDEJ zmene súborov aplikácie (index.html, styles.css, js/**) bumpni
// číslo verzie v CACHE – inak si nainštalované PWA nechajú starú verziu.

const CACHE = "letaky-app-v12";

const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./icons/app-icon.svg",
  "./js/app.js",
  "./js/config.js",
  "./js/state.js",
  "./js/data.js",
  "./js/shopping.js",
  "./js/charts.js",
  "./js/sync.js",
  "./js/share.js",
  "./js/detail.js",
  "./js/lib/util.js",
  "./js/lib/icons.js",
  "./js/lib/toast.js",
  "./js/views/shared.js",
  "./js/views/overview.js",
  "./js/views/deals.js",
  "./js/views/list.js",
  "./js/views/legislativa.js",
  "./js/views/profil.js",
  "./data/latest.json",
  "./data/archive/index.json",
  "./data/legislativa.json",
  "./data/referencne-ceny.json"
];

// Cache kľúč bez query stringu – jeden súbor = jeden záznam.
function cacheKey(request) {
  const url = new URL(request.url);
  url.search = "";
  return url.href;
}

self.addEventListener("install", event => {
  // cache:'reload' obíde HTTP cache prehliadača – nová verzia service workera
  // si tak vždy stiahne čerstvé súbory, nie odložené kópie.
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL.map(url => new Request(url, { cache: "reload" }))))
  );
  // Zámerne BEZ skipWaiting(): nová verzia prevezme stránku až keď
  // používateľ potvrdí banner „Obnoviť" (viď message listener nižšie),
  // alebo po zavretí všetkých kariet.
});

self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const key = cacheKey(request);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(key, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(key);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const shell = await cache.match("./index.html");
      if (shell) return shell;
    }
    throw error;
  }
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  if (new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(networkFirst(event.request));
});
