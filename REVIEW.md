# Komplexný review aplikácie Letákový prehľad

> **STAV: IMPLEMENTOVANÉ (16. 7. 2026).** Všetkých 5 fáz odporúčaných prác bolo zrealizovaných – appka je rozdelená na ES moduly (js/, styles.css), chyby opravené, README a schéma aktualizované. Po refaktore prebehol samostatný regresný review (7 porovnávacích agentov + adverzariálna verifikácia), ktorý našiel 8 regresií – všetky boli opravené. Tento dokument ostáva ako záznam pôvodného auditu.

*Vygenerované 16. 7. 2026 multi-agentovým review procesom (6 nezávislých pohľadov, každý nález adverzariálne overený 1–2 nezávislými verifikátormi, ktorí čítali reálny kód). 66 kandidátskych nálezov → 65 potvrdených, 1 vyvrátený.*

---

## Celkové hodnotenie

Aplikácia je **funkčne premyslená a na rodinný projekt nadpriemerne kvalitná** — escapovanie XSS je (až na jednu výnimku) disciplinované, sync nákupného zoznamu má korektný tombstone merge, dátová schéma v2 je dobre navrhnutá. Hlavné problémy sú:

1. **Balenie, nie architektúra** — 116 KB monolit `index.html` s celými funkciami na jednom riadku (najhorší riadok má 2 754 znakov). Logika vnútri je v poriadku; nedá sa však ručne editovať a každá AI úprava stojí zbytočne veľa tokenov.
2. **Service worker má 3 reálne chyby** (offline zobrazuje mesiace staré dáta, cache rastie donekonečna, 1,1 MB sa sťahuje pri každom otvorení).
3. **Cloud sync legislatívy a histórie nákupov resuscituje zmazané dáta** — na rozdiel od nákupného zoznamu nemajú tombstones.
4. **`product_id` v dátach má prefix obchodu** — tým je potichu vypnuté porovnanie cien medzi obchodmi, čo je hlavná pridaná hodnota appky. Treba opraviť v routine.
5. **README je zastarané** — tvrdí „žiadne účty", pričom appka má Supabase login a cloud sync. README je zároveň špecifikácia pre Claude routine, takže zastarané údaje aktívne kazia automatizáciu.

---

## Odporúčanie k frameworku: NIE Astro — natívne ES moduly bez build stepu

Porovnané boli 4 možnosti: (A) rozdelenie na natívne ES moduly bez buildu, (B) Astro, (C) Vite + GitHub Actions, (D) malá runtime knižnica (Preact/petite-vue/lit).

**Verdikt: Možnosť A.** Dôvody:

- **Astro nič nekupuje.** Hodnota Astra je build-time rendering obsahu do HTML. Ale obsah (latest.json, archív) komituje routine a klient ho sťahuje za behu — keby ho Astro zapiekol do stránok, každý commit dát by potreboval Actions rebuild (nový bod zlyhania; dnes je JSON commit živý za sekundy). Ak by fetch ostal runtime, Astro renderuje prázdny shell a celá appka žije v jednom veľkom client-side islande = dnešná architektúra + kompilátor + node_modules + závislosti na update.
- **Aj Vite je zbytočná daň** — zdroják by vyzeral skoro rovnako ako pri A, ale pribudne lockfile, ročné major verzie, hашovanie názvov súborov rozbíjajúce sw.js, a `npm ci` ktoré o 2 roky môže spadnúť.
- **Kód už dnes používa runtime ESM** (`import('https://esm.sh/@supabase/supabase-js@2')`), takže moduly nie sú krok bokom, ale dotiahnutie existujúceho vzoru.
- Dve kľúčové vlastnosti projektu — *dáta živé okamžite po commite routiny* a *needituje profesionál to, čo reálne beží v prehliadači* — sú obe argumenty **proti** build stepu.

K frameworku sa vráť len pri konkrétnom spúšťači (potreba npm-only balíkov, TypeScript, viacstránkový rast) — vtedy Vite, nikdy Astro pre túto runtime-data SPA.

### Cieľová štruktúra súborov

```text
index.html          ~120 riadkov: head, shell markup, <link styles.css>, <script type=module src=js/app.js>
styles.css          celé CSS (konsolidované, viď nález CSS nižšie)
js/app.js           boot, routing (hash), event delegation / action registry, registrácia SW
js/state.js         zdieľaný state objekt + konštanty (STORE_ORDER, storage kľúče, magické čísla)
js/lib/util.js      esc, safeUrl, norm, slug, uid, num, arr, dateFrom, daysTo, fmtDate, fmtPrice
js/lib/icons.js     ICONS + svg()
js/data.js          load*/normalizeData/normalizeItem/normalizePromo/normalizeStore, discountOf, finalPrice, historySeries
js/shopping.js      zoznam + tombstone merge (sanitize*, mergeVersionedShopping, addDeal…)
js/sync.js          celý Supabase blok (zvyšok appky nevie, že Supabase existuje — túto čistú hranicu zachovať)
js/views.js         render* funkcie (prípadne rozdeliť na overview/deals/list/legislativa/profil)
js/detail.js        detail sheet + priceChart/sparkline (zdieľaná chart matematika)
js/share.js         share/export/import/voice
```

### Migračný postup (~10–14 h, každý krok samostatný commit s overením)

1. **(1 h)** Vytiahnuť CSS do `styles.css`, pridať do `sw.js` SHELL, bump cache na `v9`. Nasadiť, overiť.
2. **(1 h)** `<script>` → `<script type="module" src="js/app.js">`, presunúť telo IIFE bez zmien (modul má vlastný scope, IIFE wrapper preč). Overiť klikanie (event delegation našťastie už existuje — inline onclick sa nepoužíva), PWA, offline.
3. **(1 h)** Prehnať kód Prettierom (printWidth ~100) — jednorazovo cez `npx prettier`, žiadna závislosť v repe. Toto samo o sebe zmení ručnú editovateľnosť.
4. **(4–6 h)** Rozdeliť na moduly podľa štruktúry vyššie, jeden commit na súbor. Pozor na kruhové importy shopping↔views↔sync — vyriešiť tak, že `render()` vlastní app.js a odovzdá sa cez malý `init(deps)`.
5. **(1 h)** Aktualizovať `sw.js` SHELL o všetky js/ súbory (chýbajúci súbor funguje online, ale offline sa rozbije potichu!), bump cache, otestovať inštaláciu + letecký režim na telefóne.
6. **(1–2 h)** README: mapa modulov, pravidlo „pri zmene súborov bumpni sw.js cache", lokálny vývoj. Otestovať: prepnutie týždňa, archív, share link, import/export, login sync medzi 2 zariadeniami, hlas.
7. **(voliteľné neskôr)** Vendornúť Supabase ESM bundle do `js/vendor/` (same-origin, cachovateľné SW, imúnne voči zmenám CDN).

---

## KRITICKÉ CHYBY (opraviť čo najskôr)

### 1. Offline režim navždy zobrazuje dáta z času inštalácie PWA
**Kde:** `sw.js:27-37` (networkFirst) + `sw.js:2-11` (SHELL) + `index.html:674` (load)
`load()` fetchuje `data/latest.json?v=<timestamp>`; SW každú odpoveď uloží pod unikátnou URL (query je súčasť kľúča), ale offline fallback `cache.match(request,{ignoreSearch:true})` vracia **prvý** záznam v poradí vloženia — a to je navždy bezquery `./data/latest.json` z install-time precache. Používateľ, ktorý si nainštaluje PWA v júli a otvorí ju offline v októbri, vidí júlové akcie/legislatívu. (Dôkaz mechanizmu: `archive/index.json` sa fetchuje bez `?v=` a prepisuje sa správne.)
**Fix:** zrušiť `?v=` buster (SW je network-first, čerstvosť je zaručená aj bez neho) a/alebo v SW normalizovať kľúč: `const u=new URL(request.url); u.search=''; cache.put(u.href, resp.clone())`.

### 2. Cache SW rastie bez limitu — ~1,1 MB pri každom otvorení appky, navždy
**Kde:** `sw.js:31` + `index.html:674-677`
Každé otvorenie pridá 3 nové unikátne `?v=` záznamy (latest 1,14 MB + legislativa + referencne) a nič ich nemaže. Denné používanie = ~400 MB/rok/zariadenie; pri tlaku na úložisko môže prehliadač zmazať celý origin **vrátane localStorage s nákupným zoznamom**. Navyše `cache:'no-store'` + query obchádza ETag, takže 1,1 MB sa reálne sťahuje pri každom otvorení aj keď sa nezmenil (mobilné dáta).
**Fix:** zrušiť `?v=`, použiť `fetch(path,{cache:'no-cache'})` (ETag → 304), normalizovať cache kľúč v SW, bump `CACHE` na `letaky-app-v9` (zmaže staré nafúknuté cache).

### 3. Zmazané stavy legislatívy a zmazané uložené nákupy sa cez sync večne vracajú
**Kde:** `index.html:461-467` (mergeOtherCloudData, cloudPull, cloudPush)
`legStates` sa merguje `{...local,...remote}` a `savedLists` úniou podľa id — čisto aditívne, bez tombstones; cloudPull na konci spúšťa `schedulePush()`. Scenár: zariadenie A odznačí „Hotové" → cloud kľúč stratí; zariadenie B pri štarte spraví pull-merge (kľúč prežije lokálne) a push ho vráti do cloudu; A si ho stiahne späť. Mazanie sa **nikdy** nepresadí. Nákupný zoznam je imúnny len preto, že má tombstones (`mergeVersionedShopping`).
**Fix:** verzovať rovnako ako zoznam — `legStates` ako `{key:{st,updatedAt}}` + tombstone, `savedLists` s tombstone poľom; `mergeVersionedShopping` je znovupoužiteľný.

### 4. Detail sheet (dialog) nemá focus management a je dostupný klávesnicou aj zatvorený
**Kde:** `index.html:651-652` (openDetail/closeDetail), markup `:403-406`
Dialog má `role="dialog" aria-modal="true"`, ale otvorenie nepresunie fokus, Tab nie je uväznený, zatvorenie nevráti fokus (opener sa ani nepamätá a re-render ho zničí). Zatvorený sheet je len `transform`+`aria-hidden` — klávesnicou sa doň stále dá dostať.
**Fix:** pri otvorení uložiť `document.activeElement` a fokusnúť zatváracie tlačidlo, trap Tab v `#detail-sheet`, pri zatvorení fokus vrátiť; zatvorený sheet označiť `inert`.

---

## STREDNE ZÁVAŽNÉ CHYBY

| # | Chyba | Kde | Podstata + fix |
|---|-------|-----|----------------|
| 5 | **Graf mieša ceny s DPH a bez DPH** | `historySeries` :547 | História preferuje `cena_s_dph`, ale vstreknutý aktuálny bod používa `finalPrice()` — pre platcu DPH je to cena bez DPH → graf Metro položky ukáže falošný pokles. Fix: aktuálny bod vždy `i.priceVat ?? i.price`. |
| 6 | **cloudPush prepíše cudzie settings/legStates/savedLists** | :467 | Merguje sa len shopping; zvyšok payloadu je last-writer-wins bez optimistic locku. Fix: volať `mergeOtherCloudData(remote)` aj v pushi; ideálne revision stĺpec. |
| 7 | **Back tlačidlo na prvú (bezhashovú) položku histórie nefunguje** | `handleLocationHash` :689 | Prázdny hash nie je vo VIEWS → UI ostane, ďalší Back zavrie appku. Fix: `location.hash.slice(1)||'overview'`. |
| 8 | **Kolízie fallback ID ponúk** | `normalizeItem` :494-501 | Bez `id` v dátach dostanú 2 rovnomenné ponuky v obchode rovnaký kľúč → tlačidlá +/− sa prepletú, detail otvorí zlú ponuku. Fix: do fallbacku pridať cenu/platnosť alebo deduplikovať indexom. |
| 9 | **Stored XSS cez stav legislatívy** | :612 | `st-${st}` ide do class atribútu bez `esc()`; hodnota sa načítava z localStorage/cloudu bez validácie. Fix: whitelist `['done','irrelevant','ignored']` pri load/merge + `esc(st)` pri renderi. |
| 10 | **PWA update bez reload promptu** | `sw.js:15,24` | `skipWaiting`+`clients.claim` prevezmú bežiacu stránku potichu — otvorená appka beží starý kód nad novou cache. Fix: toast „Nová verzia — obnoviť" na `controllerchange`. |
| 11 | **Tichý fail Supabase importu** | `sbClient` :458 | Pri výpadku esm.sh/adblocku `sbClient()` vráti null, `sbInit` skončí — prihlásený používateľ vyzerá odhlásene, bez chybovej hlášky, zmeny sa nesyncujú. Fix: stav „synchronizácia nedostupná" v profile + retry na `online` event. |
| 12 | **Supabase z CDN s plávajúcou verziou, bez CSP** | :458, head | `@2` bez pinu, dynamic import nemôže mať SRI, žiadna CSP meta. Fix: pin presnej verzie alebo vendor do repa; pridať CSP (`script-src 'self' https://esm.sh https://*.supabase.co; connect-src 'self' https://*.supabase.co; …`). |
| 13 | **RLS predpoklad nie je nikde overiteľný** | :456,466-467 | Klientsky kód je správny (všetko cez `user_id`), ale jediná ochrana dát pri verejnom kľúči je RLS policy, ktorá nie je zdokumentovaná v repe. Fix: overiť v dashboarde `auth.uid() = user_id` na SELECT/INSERT/UPDATE + vypnuté verejné registrácie; pridať `supabase/schema.sql` do repa. |
| 14 | **1,1 MB JSON sa parsuje nanovo pri každom otvorení** | `load` :674 | Súvisí s #2; navyše žiadne in-memory/IndexedDB cache parsovaných dát. Fix: ETag + prípadne cache normalizovaného výsledku. |
| 15 | **Full re-render ničí fokus a je nemý pre čítačky** | `render` :647-650 | Každé kliknutie prestavia celý view cez innerHTML → fokus padne na body, qty tlačidlá sa klávesnicou nedajú stláčať opakovane; bez aria-live. Fix: cielené DOM úpravy pre toggle akcie + aria-live pre počty/sumy. |
| 16 | **Full re-render 1 119 kariet na každé kliknutie +** | `persistOnly` :536, `renderDeals` :592 | Vzor „rerender everything" je pri tejto veľkosti inak správna voľba; bolí len katalóg. Fix (~15 riadkov): pri toggle-deal v deals/overview upraviť len dotknuté tlačidlo; stránkovať katalóg (100 + „Zobraziť ďalšie"); v openDetail zachovať scrollTop. |

## MENEJ ZÁVAŽNÉ CHYBY

| # | Chyba | Kde | Fix |
|---|-------|-----|-----|
| 17 | „Skryť kartové akcie" neplatí na Prehľade | `renderOverview` :583 vs `filterItems` :589 | hideCard predikát vytiahnuť do helpera a aplikovať aj na overview items/top. |
| 18 | Ceny v zozname zamrznú na DPH režime z času pridania | `addDeal` :534 | Ukladať obe bázy (price aj priceVat) a vyberať pri renderi. |
| 19 | Úspora počíta celú originalPrice keď chýba price | `listTotals` :593 | `if(i.price!=null&&i.originalPrice!=null)…` |
| 20 | Záporná reálna zľava renderuje „−-3 %" | :580,590,651 | Formátovať podľa znamienka alebo skryť/označiť „drahšie o X %". |
| 21 | aria-label grafu bez esc() (dnes bezpečné, jediná nekonzistencia) | `priceChart` :578 | Obaliť esc() pre konzistenciu. |

---

## ARCHITEKTÚRA A ČISTOTA KÓDU

### A1. Monolit (high) — hlavný nález, viď odporúčanie hore
Konkrétne náklady: plný Read súboru ~35 000 tokenov; bežná AI úprava 50–100k tokenov namiesto 5–10k pri moduloch; jeden preklep v 2 000-znakovom riadku zabije celú appku bez izolácie.

### A2. Formátovanie (high)
30+ riadkov cez 500 znakov, 8 cez 1 000: `openDetail` (2 128 zn.), click handler (1 979), `renderList` (1 903), `renderPromo` (1 856), CSS media query :227 (2 754). Git diffy sú nepoužiteľné — zmena atribútu prepíše celý riadok. **Fix: Prettier, printWidth ~100, vnorené .map callbacky vytiahnuť do pomenovaných funkcií (renderPromoCard, renderLegItem…).**

### A3. Obrí click handler (high)
Jeden riadok :678 dispatchuje **22 akcií** if/else-if reťazou, s inline mutáciami (toggle-check, uncheck-all). **Fix: action registry** — `const ACTIONS={store:b=>…, 'toggle-deal':b=>toggleDeal(b.dataset.key), …}; ACTIONS[b.dataset.action]?.(b)`.

### A4. Dvojschémové mapovanie kľúčov presakuje z normalizeItem (high)
`p.obchod||p.store`, `plati_od||valid_from` a pod. sa opakujú v `validityMeta`, `renderPromo` (2× v jednom callbacku!), `historySeries`, `sortedStores`, `renderList`… Pri premenovaní kľúča v schéme v3 treba zmeniť 6+ miest a chyba sa prejaví ako ticho prázdne UI. **Fix: normalizovať všetko raz pri načítaní — pridať normalizePromo/normalizeStore/normalizeHistoryPoint/normalizeSource vedľa normalizeItem; renderery čítajú len kanonické kľúče.** (Po odstránení v1 kompatibility — viď D1 — sa toto výrazne zjednoduší.)

### A5. CSS narastané vo vrstvách (medium)
Breakpoint 620px definovaný 4× (:226, :243, :341, :370), 860px 2×. `.product-card` je na :164 flex, ale blok :230 ho bez media query predefinuje na grid → flex deklarácie sú mŕtve. Prvý 620px blok je takmer celý zatienený druhým (živé výnimky: `::after` glyfy `+`/`✓` mobilného tlačidla a `gap:8px`!). `aspect-ratio:16/9` na :370 je dvojnásobne mŕtvy. **Fix: reštruktúrovať na sekcie (tokens → shell → komponenty → presne 3 media bloky), zlúčiť override bloky, pozor na živé výnimky.**

### A6. Duplikácie (medium)
- `sparklineHtml` vs `priceChart` — duplicitná chart matematika aj doslovný trend-label. → zdieľaný helper.
- `pageHeader`/`overviewHeader`/`legHeader`/profil hlavička — 4× rovnaká štruktúra, archívne varovanie copy-paste na 2 miestach. → jeden `pageHead({eyebrow,title,desc,archiveNote})`.
- Top-10 fallback duplicitný v `normalizeData` (:509, filtruje verdikt `realna`) vs `renderOverview` (:583, nefiltruje!) — aj behaviorálna nekonzistencia.
- Add/remove tlačidlo v 4 variantoch (circle-add, add-wide, primary-btn v tipe, primary-btn v detaile). → `addButtonHtml(item, variant)`.
- `try{localStorage}catch{}` 12×. → `readJson(key)`/`writeJson(key,val)` helpery (pozor: inline kópie v mergeOtherCloudData zámerne nepushujú — zachovať sémantiku).

### A7. Pomenovanie (medium)
Perzistentná trojica je mätúca: `persistShoppingLocal` (len uloží), `saveShopping` (uloží + render len na list view), `persistOnly` (uloží + **vždy** render + push — názov tvrdí opak!). Mix jazykov: `loadLegislativa` vs `loadReference`, `histSection` vs `legHeader`. **Fix: pri splite premenovať — napr. `saveList()`, `saveListAndRender()`, a render* prefix všade.**

### A8. Magické čísla (medium)
Minimálne 14: share limity 14000/20000, história 16 bodov, toast 2100 ms, push debounce 800 ms, TOMBSTONE_TTL 30 dní, promo preview 4, top 10, limit importu 200 položiek… **Fix: pomenované konštanty so stručným komentárom v state.js.**

---

## MŔTVY KÓD (všetko overené grep-om, bezpečné zmazať)

**JS:**
- **Celá v1/anglická kompatibilná vrstva** (medium) — `raw.top` s plnými objektmi + byExact merge v `normalizeData`, anglické fallbacky (`raw.name`, `raw.store`, `raw.price`, `price_history`, `top_offer_ids`, `sources_status`…) v `normalizeItem`/`historySeries`/`validityMeta`. V repe neexistujú žiadne v1 dáta (obe JSON sú v2 so slovenskými kľúčmi). Zmazanie zúži najhustejšie riadky súboru zhruba o polovicu. *(Pozor: anglické kľúče v `sanitizeListItem` sú iný, živý kontrakt — share/import — tie nechať.)*
- `historyDetail()` :550 — nikdy nevolaná; s ňou zomiera `.history-mini` CSS aj `sparklineHtml(i,true)` „large" variant a `.price-sparkline.large`.
- `metric()` :543 + celá `.metric*` CSS rodina (~10 pravidiel vrátane media queries) — overview používa `.status-strip`.
- No-op listener `$('#sort')?.addEventListener('change',()=>{})` :683 — #sort v čase registrácie neexistuje, callback prázdny; reálne triedenie rieši delegovaný listener :684.
- Parameter `renderStoreTabs(target='filter')` — nikdy nečítaný. Parameter `svg(name, cls)` — cls vždy default.
- `ICONS.minus` a `ICONS.calendar` — nikdy nerenderované (qty stepper používa textové − a +).
- `state.finishOpen` — len sa zapisuje (:475, :540), nikdy nečíta.
- `unitPrice`/`unit` — normalizuje sa a ukladá na každú položku, ale UI ich nikde nezobrazuje (jednotková cena by pritom bola užitočná — buď zobraziť v detaile, alebo vyhodiť).
- `raw` property na normalizovaných itemoch — nikdy nečítaná (drží 34k-riadkový JSON v pamäti 2×).
- `image:null` na manuálnych položkách; snake_case + `savedAt` fallbacky vo `versionTime()` ktoré nemôžu nastať; `OLD_LIST_KEY` migrácia (jednorazový shim, pravdepodobne už spotrebovaný — zvážiť vyhodenie).
- `mediaHtml(i,'thumb')` vetva + `.deal-thumb` CSS — nedosiahnuteľné.
- `normalizeItem` číta fantómové pole `bezna_cena_60d_s_dph` — neexistuje v schéme, README ani dátach.

**CSS:** `.danger-btn` (žiadny markup), `.leg-hide-chip` (trieda sa emituje, ale nemá CSS ani JS hook — vyhodiť z templatu), `grid-template-columns` na `.promo-grid` v 1120px query (element je flex), `validity` triedy `urgent`/`expired` na `.deal-row` (:580 ich nastavuje, žiadne CSS pravidlo nematchuje — buď doštylovať, alebo nezapisovať).

---

## DÁTA A DOKUMENTÁCIA

### D1. README vs realita (high)
- **Súkromie:** „žiadne účty, cookies ani analytika" + sidebar „Bez účtu… iba v tomto zariadení" je **nepravda** — appka má Supabase e-mail/heslo login, `persistSession:true`, a syncuje zoznam, tombstones, settings, legStates aj savedLists do tabuľky `user_data`. Rodina má právo vedieť, kde jej dáta sú; a keďže README číta aj routine/Claude, zastarané tvrdenia kazia automatizáciu. **Fix: prepísať Súkromie sekciu (local-first + voliteľný sync), pridať sekciu Prihlásenie a synchronizácia, upraviť side-note v UI.**
- **„Žiadne npm závislosti"** — pravda pre hosting, ale beží runtime import `@supabase/supabase-js@2` z esm.sh (nedokumentované; offline sync nefunguje — tiež nedokumentované).
- **Nákupný zoznam:** README dokumentuje len `letaky.shoppingList.v2`; chýbajú `letaky.shoppingDeleted.v1` (tombstones, TTL 30 dní), `letaky.settings.v1`, `letaky.legStates.v1`, `letaky.savedLists.v1` a polia `unitPrice/updatedAt/checkedAt/deletedAt` (ručný import podľa README príkladu vyrobí položky bez verzií → sync ich považuje za najstaršie).
- **`plan` (odporúčaný plán nákupu)** existuje v schéme, dátach aj UI, ale README kontrakt ho nespomína.

### D2. product_id s prefixom obchodu (medium — dôležité pre analýzu!)
Routine generuje `product_id` v tvare `kaufland-mata-pieporna…` — README pravidlo 2 pritom vyžaduje rovnaké `product_id` naprieč obchodmi. Dôsledok: **„Porovnanie obchodov" v detaile sa nemôže nikdy zobraziť** a viacobchodová cenová história nefunguje. Nič nehlási chybu. **Fix v routine:** emitovať store-agnostické id (`mata-pieporna-100g`) + validácia „product_id nesmie začínať id obchodu"; defenzívne môže appka známy prefix odstrihnúť v `normalizeItem`.

### D3. Schéma v2 vs kód
- Chýba `obrazok_url` v `$defs.offer` (README ho dokumentuje, dáta obsahujú, kód číta — prežíva len cez `additionalProperties:true`). Doplniť aj s popisom akceptovaných foriem.
- Chýbajú `priorita` a `zdroj_url` v `$defs.promo` — dáta ich majú, `renderPromo` podľa nich triedi a linkuje; routine regenerovaná striktne podľa schémy ich stratí. Doplniť do schémy aj README príkladu.
- Polia v schéme, ktoré UI nečíta: `zdroje_stav[].url/poznamka`, `offer.zdroj_url`, `historia_cien[].obchod/zdroj_url`, `plan.spolu_eur/uspora_eur` — buď zobraziť (zdroj_url ako link v detaile má hodnotu), alebo označiť v schéme ako informatívne.
- README minimálny príklad neobsahuje `kategoria` (riadi emoji fallback a refFor matching) ani `obrazok_url` — routine nasledujúca README vyrobí degradované dáta. Doplniť do príkladu a Pravidiel.

### D4. legislativa.json / referencne-ceny.json
- `confidence: medium/high` sú v UI no-op (renderuje sa len `low` → „orientačné – overiť"). Buď zobrazovať aj ostatné úrovne, alebo z dát vyhodiť.
- `referencne-ceny.json` je spiaci kontrakt: `komodity:[]`, takže `refFor` vždy vráti null; poznamka tvrdí že appka referenčnú cenu zobrazuje; navod vyžaduje `zdroj`/`datum`, ktoré UI nikdy nezobrazí; nezdokumentovaný singular `klic` fallback v kóde. Zosúladiť súbor s kódom (alebo naplniť routinou).

---

## VYVRÁTENÝ NÁLEZ (pre úplnosť)

- ~~„Týždenné archívy nafúknu git repo na stovky MB"~~ — byte-identická archívna kópia má v gite rovnaký blob SHA (deduplikuje sa) a 1,14 MB JSON sa komprimuje ~13:1. Rast repa je zanedbateľný. Archívna stratégia je OK.

---

## ODPORÚČANÉ PORADIE PRÁC

**Fáza 1 — rýchle opravy (2–3 h, ešte pred refaktorom):**
sw.js prepis (#1, #2, #10 — jeden zásah), legStates XSS whitelist (#9), handleLocationHash fallback (#7), listTotals guard (#19), double-minus (#20), historySeries VAT báza (#5), hideCard na overview (#17), esc v aria-label (#21). Bump cache v9.

**Fáza 2 — reštrukturalizácia (10–14 h):**
Migračný postup vyššie (CSS von → modul → Prettier → split). Počas presunu: zmazať mŕtvy kód (v1 vrstva ako prvá — zjednoduší normalizery), action registry (#A3), normalize* mapovacia vrstva (#A4), konsolidácia CSS (#A5), konštanty (#A8), zlúčenie duplicít (#A6), premenovanie perzistencie (#A7).

**Fáza 3 — sync robustnosť (3–4 h):**
Tombstones pre legStates/savedLists (#3), merge v cloudPush (#6), overiť + zdokumentovať RLS (`supabase/schema.sql`) (#13), pin/vendor Supabase + CSP (#12), stav „sync nedostupný" (#11).

**Fáza 4 — dátový kontrakt a routine (2–3 h, koordinovať s úpravou routiny):**
product_id bez prefixu obchodu (#D2 — najvyššia hodnota!), doplniť schému (obrazok_url, priorita, zdroj_url), prepísať README (súkromie/Supabase/localStorage kľúče/plan/kategoria), zosúladiť referencne-ceny a confidence.

**Fáza 5 — UX/a11y (2–3 h):**
Focus management dialógu (#4), cielené re-rendery + aria-live (#15, #16), fallback ID kolízie (#8), DPH bázy v zozname (#18), zamyslieť sa nad zobrazením jednotkovej ceny (dnes mŕtve pole s reálnou hodnotou pre porovnávanie).
