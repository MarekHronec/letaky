# Letákový prehľad

Responzívna statická aplikácia na prehľad potravinových akcií, rozlíšenie reálnych a podozrivých zliav, nákupný zoznam a prehľad legislatívy pre rodinný obchod.

**Live:** https://marekhronec.github.io/letaky/

## Čo aplikácia robí

- **Prehľad:** najlepšie overené ponuky, špeciálne akcie, stav zdrojov a aktuálne otváracie hodiny pobočiek vrátane sviatočných výnimiek.
- **Všetky akcie:** vyhľadávanie, obchodné filtre, verdikt zľavy, triedenie a vývoj ceny z overenej histórie. V aktuálnom týždni zobrazuje iba ešte platné ponuky; staršie ostávajú v archíve a cenovej histórii.
- **Sledované produkty:** vlastný core sortiment s dashboardom/zoznamom, filtrami a vysvetliteľným odporúčaním. Kompaktná karta ukazuje najprv rozhodnutie, cenu, zásobu, cenovú pozíciu a slovnú kvalitu dát; dôkazy a nastavenia sú rozbaliteľné. Oddeľuje aktívnu a budúcu ponuku a zohľadňuje iba potvrdené nákupy.
- **Môj zoznam:** má režim **V obchode** s celoplošným zoznamom, 44 px odškrtávaním, odstránením položky a načítaním šablóny; na mobile je predvolený. Režim **Správa zoznamu** pridáva množstvá, ručné/hlasové zadanie, ceny, zdieľanie, import, šablóny a históriu. Až výslovné potvrdenie označených položiek vytvorí nemenný záznam nákupu.
- **Legislatíva:** prehľad povinností a termínov pre maloobchod s potravinami a drogériou (eKasa, dane, hygiena, chémia, zálohy, ceny/spotrebiteľ) z `data/legislativa.json`, s odkazmi na oficiálne zdroje. Orientačné, nie právne poradenstvo. Položky s `confidence: "low"` sú v UI označené „orientačné – overiť“; ostatné hodnoty poľa `confidence` sa nezobrazujú.
- **Detail produktu:** obrázok položky (`obrazok_url`, s kategóriovým emoji ako fallback), graf vývoja ceny, jednotková cena, podmienky akcie a porovnanie rovnakého `product_id` medzi obchodmi.
- **PWA/offline:** stránku možno pridať na plochu mobilu; posledné načítané dáta a nákupný zoznam fungujú aj bez signálu. Pri novej verzii appky sa zobrazí banner „Obnoviť“.

## Súkromie a účty

- Appka funguje **bez účtu**: zoznam, šablóny, potvrdené nákupy, sledované produkty, nastavenia a stavy legislatívy sa ukladajú iba do `localStorage` tohto prehliadača. Zdieľací link prenáša iba snapshot nákupného zoznamu, nie potvrdenú históriu ani analytické preferencie.
- **Voliteľné prihlásenie (Supabase):** po prihlásení e-mailom a heslom sa nákupný zoznam, jeho šablóny, append-only potvrdené nákupy, sledované produkty, nastavenia a stavy legislatívy synchronizujú medzi zariadeniami. Účty vytvára správca; verejné registrácie sú vypnuté. Dáta každého používateľa chráni Row Level Security – presné pravidlá sú v [`supabase/schema.sql`](supabase/schema.sql).
- Žiadna analytika ani cookies tretích strán.

## Architektúra

Projekt nemá build step ani npm závislosti – GitHub Pages servuje priamo tieto súbory. Jediná externá runtime závislosť je `@supabase/supabase-js`, importovaná za behu z esm.sh (presne pripnutá verzia v `js/config.js`); bez pripojenia appka beží ďalej, len bez prihlásenia a synchronizácie.

```text
index.html                  # HTML shell (bez inline skriptov a štýlov) + CSP
styles.css                  # všetky štýly vrátane responzívnych breakpointov
sw.js                       # offline cache (network-first) + update flow
manifest.webmanifest        # PWA manifest
icons/app-icon.svg          # ikona aplikácie

js/app.js                   # vstupný bod: action registry, routing, render, SW registrácia
js/config.js                # konštanty (obchody, kľúče úložiska, limity, Supabase)
js/state.js                 # zdieľaný stav + nastavenia, legislatíva, uložené zoznamy/šablóny
js/data.js                  # fetch + normalizácia dát (JEDINÉ miesto, kde sa čítajú kľúče schémy)
js/shopping.js              # nákupný zoznam + tombstone merge pre sync
js/purchases.js             # potvrdené nákupy: append-only udalosti + štatistiky spotreby
js/tracking.js              # sledované produkty + lokálna/cloud perzistencia
js/tracked-analytics.js     # deterministická vysvetliteľná analytika a dátové brány
js/charts.js                # sparkline + veľký graf ceny (zdieľaná matematika)
js/sync.js                  # Supabase login a synchronizácia (zvyšok appky o Supabase nevie)
js/share.js                 # zdieľací link, JSON export/import, hlasové zadávanie
js/detail.js                # detail produktu (dialóg s focus managementom)
js/lib/util.js              # esc, safeUrl, formátovanie, localStorage helpery
js/lib/icons.js             # SVG ikony
js/lib/toast.js             # toast + aria-live oznámenia
js/views/shared.js          # hlavička stránky, logá obchodov, platnosť, badge, tlačidlá
js/views/overview.js        # Prehľad
js/views/deals.js           # Všetky akcie
js/views/tracked.js         # Sledované produkty + analytický dashboard
js/views/list.js            # Môj zoznam
js/views/legislativa.js     # Legislatíva
js/views/profil.js          # Profil a nastavenia

scripts/test_tracked_foundations.mjs # deterministický test nákupov, histórie a sync základov
scripts/test_tracked_analytics.mjs   # rozhodovacie brány, ceny, balenie, ponuky a zásoba
scripts/test_list_mode.mjs           # mobilný nákupný režim a skrytý obsah plnej správy

data/latest.json            # aktuálny týždeň (schema v2)
data/schema-v2.json         # JSON Schema pre routine
data/legislativa.json       # obsah pohľadu Legislatíva
data/referencne-ceny.json   # voliteľná externá referenčná cena
data/archive/index.json     # zoznam archívnych týždňov
data/archive/<tyzden>.json  # archívne kópie týždňov

supabase/schema.sql         # DDL + RLS policies pre tabuľku user_data
```

GitHub Pages je nastavený na deploy z `main`, root `/`. Každý push do `main` sa nasadí automaticky.

**Dôležité pravidlo údržby:** pri pridaní, premenovaní alebo zmazaní súboru aplikácie treba upraviť zoznam `SHELL` v [`sw.js`](sw.js) a bumpnúť tam verziu `CACHE` (`letaky-app-vX`). Inak nainštalované PWA ostanú offline na starej verzii.

## Úložisko v prehliadači (localStorage)

| Kľúč | Obsah |
|------|-------|
| `letaky.shoppingList.v2` | aktívne položky nákupného zoznamu |
| `letaky.shoppingDeleted.v1` | tombstones zmazaných položiek (TTL 30 dní, kvôli syncu) |
| `letaky.settings.v1` | nastavenia: `dph`, `hideCard`, `dphPeriod` |
| `letaky.legStates.v2` | stavy legislatívy: `{ kluc: { st, updatedAt } }`; prázdne `st` je tombstone |
| `letaky.savedLists.v1` | obnoviteľné zoznamy/šablóny; nie dôkaz uskutočneného nákupu |
| `letaky.savedListsDeleted.v1` | tombstones zmazaných šablón (TTL 30 dní) |
| `letaky.purchases.v1` | nemenné potvrdené nákupy; append-only union podľa ID pri syncu |
| `letaky.trackedProducts.v1` | sledované produkty, používateľská zásoba/preferencie, cenové pozorovania podľa obchodu a tombstones pre sync |
| `letaky.listViewMode.v1` | lokálna voľba `simple`/`full` pre zobrazenie nákupného zoznamu |

Cloudový sync prenáša potvrdené nákupy ako samostatnú časť payloadu: zariadenia ich zlučujú append-only unionom podľa nemenného ID. Šablóny a sledované produkty si zachovávajú svoje existujúce merge/tombstone pravidlá. Odvodený výstup z `js/tracked-analytics.js` sa neukladá ani nesynchronizuje; po merge sa vždy deterministicky prepočíta z rovnakých podkladov.

Položka zoznamu (úplný tvar, ktorý zapisuje `sanitizeListItem`):

```json
{
  "id": "lokalne-uuid",
  "source": "deal",
  "offerId": "lidl|lidl-maslo-82-250g-2026-w30",
  "productId": "maslo-82-250g",
  "name": "Maslo 82 %",
  "amount": "250 g",
  "store": "Lidl",
  "price": 1.59,
  "priceVat": 1.59,
  "originalPrice": 2.39,
  "originalPriceVat": 2.39,
  "unitPrice": 6.36,
  "condition": "od 2 ks",
  "validFrom": "2026-07-27",
  "validTo": "2026-08-02",
  "quantity": 2,
  "checked": false,
  "addedAt": "2026-07-13T18:20:00.000Z",
  "checkedAt": null,
  "updatedAt": "2026-07-13T18:20:00.000Z",
  "deletedAt": null
}
```

Ukladajú sa **obe cenové bázy** (`price` bez DPH, `priceVat` s DPH), takže prepnutie nastavenia „Platca DPH“ nemieša v súčtoch rôzne základy. `updatedAt`/`deletedAt` riadia merge pri synchronizácii – ručne vytvorené položky bez týchto polí sa pri merge považujú za najstaršie.

Ručné položky majú `source: "manual"` a môžu mať `store` aj ceny prázdne. Tlačidlo **Zdieľať link** vloží snapshot zoznamu do URL fragmentu `#share=…`; fragment sa neposiela serveru. Kto má link, môže jeho obsah načítať – zdieľaj ho ako nákupný zoznam, nie ako tajnú informáciu. Export/import JSON zostáva ako záloha a riešenie pre veľmi dlhé zoznamy.

Uložený zoznam je šablóna: môže obsahovať plánované aj nezaškrtnuté položky, dá sa obnoviť a šablóna s rovnakým názvom sa môže aktualizovať. Načítanie šablóny do neprázdneho aktívneho zoznamu vyžaduje potvrdenie, pretože snapshot aktuálny zoznam nahradí. Potvrdený nákup je samostatná append-only udalosť. Vznikne iba explicitným potvrdením označených položiek, zachová cenu v báze, ktorú používateľ pri nákupe videl, a nikdy sa podľa názvu zoznamu neprepíše. Rytmus spotreby v Sledovaných produktoch používa výhradne tieto potvrdené udalosti so zhodným `product_id`; podobnosť názvu nie je náhradou identity.

## Analytika sledovaných produktov

Analytika beží lokálne v prehliadači ako deterministický a vysvetliteľný rozhodovací modul. Nie je to trénované ML a číslo v rozhraní sa neprezentuje ako kalibrovaná pravdepodobnosť. Výstup oddeľuje odporúčanú akciu, cenovú pozíciu, potrebu doplnenia a kvalitu dát.

Zásady rozhodovania:

1. Aktívna ponuka a ponuka, ktorá ešte len začne platiť, sú samostatné stavy. Budúca cena sa nesmie označiť ako dnešná ani viesť k pokynu kúpiť ihneď.
2. Jedno porovnanie používa vždy koherentnú cenovú bázu (s DPH alebo bez DPH). História uchováva bázu aj obchod; cenová pozícia pre konkrétnu predajňu sa nemieša s iným obchodom a samostatne možno ukázať trhové porovnanie.
3. Cenová pozícia je robustná voči ojedinelým extrémom. Silné odporúčanie vyžaduje overenú ponuku a dostatočný počet porovnateľných pozorovaní; inak UI otvorene uvedie, že dát je málo.
4. Frekvencia a typické množstvo vychádzajú len z potvrdených nákupov. Pri nedostatočnej histórii môže používateľ zadať vlastný interval, no systém si ho nesmie zameniť za naučenú predikciu.
5. Odporúčanie množstva zohľadňuje evidovanú zásobu, minimálnu zásobu, cieľovú cenu, skladovateľnosť a používateľský profil produktu. Bez týchto vstupov zostáva konzervatívne.
6. UI používa zrozumiteľné štítky kvality dát (napríklad málo/stredne/dosť údajov a overená/neoverená ponuka), nie falošnú „istotu 68 %“ ani zmiešané skóre 55/25/20.

Hranice a pravidlá sú zámerne pevné, kontrolovateľné a deterministicky testované. Pokročilejší predikčný model má zmysel až po nazbieraní dostatočnej, pravdivej histórie potvrdených nákupov; dovtedy sa README ani UI nesmú tváriť, že aplikácia používa ML.

## Dátová schéma v2

Aplikácia číta **iba** `schema_version: 2` podľa [`data/schema-v2.json`](data/schema-v2.json) – slovenské kľúče (`nazov`, `cena`, `plati_od`…). Spätná kompatibilita s pôvodným návrhom v1 bola odstránená; v repozitári žiadne v1 dáta nie sú.

Najdôležitejšie zásady:

1. `id` jednoznačne identifikuje konkrétnu ponuku. Praktický formát je `<obchod>-<product_id>-<tyzden>`.
2. `product_id` zostáva rovnaké pre ten istý produkt naprieč obchodmi a týždňami; vďaka nemu funguje porovnanie cien. **Nesmie obsahovať prefix obchodu** – `maslo-82-250g`, nie `lidl-maslo-82-250g`. (Appka známy prefix obchodu defenzívne odstráni, ale správne je negenerovať ho.) Variant s inou gramážou má iné `product_id`.
3. `top_ids` odkazuje na položky v `obchody[].polozky` a neduplikuje celé objekty.
4. `zlava_letak_pct` a `zlava_realna_pct` sú oddelené. Marketingové percento z letáku sa nesmie zameniť za reálnu úsporu oproti historickej cene. `zlava_realna_pct` môže byť aj záporná (tovar je drahší než jeho bežná cena) – UI vtedy odznak zľavy nezobrazí.
5. `mnozstvo`, `jednotkova_cena` a `jednotka` sú voliteľné, ale zlepšia porovnávanie; jednotková cena sa zobrazuje v detaile. `kategoria` riadi emoji fallback obrázka a párovanie s referenčnými cenami – vypĺňaj ju. `obrazok_url` prijíma absolútnu URL, relatívnu cestu v repozitári alebo `data:` obrázok.
6. Metro môže mať cenu bez DPH v `cena` a spotrebiteľskú cenu v `cena_s_dph`; UI uprednostní cenu podľa nastavenia Platca DPH. Graf histórie vždy používa cenu s DPH, aby sa nemiešali bázy.
7. `obchody[].plati_od` a `obchody[].plati_do` určujú spoločnú platnosť letáka. Produkt ich zdedí; vlastné dátumy uvádzaj len pri odlišnej platnosti.
8. `historia_cien` obsahuje iba skutočne pozorované ceny rovnakého `product_id` v rovnakom obchode. UI vykreslí graf až od dvoch meraní; prečiarknutá cena nie je historické meranie.
9. `promo[]` podporuje `priorita` (1 = najdôležitejšie, default 3 – určuje poradie) a `zdroj_url` (odkaz „Detail akcie“).
10. `otvaracie_hodiny` obsahuje konkrétne pobočky, bežné hodiny, dátum overenia, first-party zdroj a `vynimky[]`. Routine musí pri každom týždni skontrolovať sviatky/dni pracovného pokoja a každú výnimku uviesť explicitne; UI ich zvýrazní na Prehľade.
11. Staré `plan` môže zostať v historických súboroch kvôli spätnej čitateľnosti schémy, nové behy ho už negenerujú.

Minimálny odporúčaný príklad:

```json
{
  "schema_version": 2,
  "tyzden": "2026-W30",
  "obdobie": "27. júl – 2. august 2026",
  "generovane": "2026-07-27T07:00:00+02:00",
  "top_ids": ["lidl-maslo-82-250g-2026-w30"],
  "promo": [
    {
      "id": "lidl-plus-5-eur-w30",
      "obchod": "Lidl",
      "text": "Kupón −5 € pri nákupe nad 40 €",
      "plati_do": "2026-08-02",
      "podmienka": "Lidl Plus",
      "priorita": 1,
      "zdroj_url": "https://www.lidl.sk/c/letaky"
    }
  ],
  "obchody": [
    {
      "id": "lidl",
      "nazov": "Lidl",
      "plati_od": "2026-07-27",
      "plati_do": "2026-08-02",
      "letak_url": "https://www.lidl.sk/c/letaky",
      "polozky": [
        {
          "id": "lidl-maslo-82-250g-2026-w30",
          "product_id": "maslo-82-250g",
          "nazov": "Maslo 82 %",
          "mnozstvo": "250 g",
          "kategoria": "mliečne výrobky",
          "obrazok_url": null,
          "cena": 1.59,
          "cena_povodna": 2.39,
          "jednotkova_cena": 6.36,
          "jednotka": "kg",
          "zlava_letak_pct": 33,
          "zlava_realna_pct": 24,
          "bezna_cena_60d": 2.09,
          "verdikt": "realna",
          "dovod_verdiktu": "24 % pod 60-dňovým priemerom",
          "plati_od": "2026-07-27",
          "plati_do": "2026-08-02",
          "podmienka": null,
          "poznamka": "najnižšia cena za 90 dní"
        }
      ]
    }
  ],
  "zdroje_stav": [
    { "zdroj": "lidl.sk", "ok": true }
  ]
}
```

### Pravidlá pre routine

- `verdikt` je presne `realna`, `umela` alebo `neoverene`.
- `id` musí byť unikátne v celom týždennom súbore.
- `product_id` sa nemení iba preto, že sa zmenila cena, obchod alebo týždeň – a **nikdy nezačína id obchodu** (`metro-`, `kaufland-`, `lidl-`, `tesco-`, `billa-`, `coop-`, `dm-`, `teta-`). Kontrola pred commitom: žiadne `product_id` nesmie začínať niektorým z týchto prefixov.
- Peňažné hodnoty sú JSON čísla bez symbolu meny; mena je vždy EUR.
- Dátumy používajú `YYYY-MM-DD`, `generovane` ISO 8601 s časovou zónou.
- Pri každom obchode uveď spoločnú platnosť letáka cez `plati_od` a `plati_do`. Na produkte dátumy opakuj iba pri odlišnej platnosti.
- Množstevné, kartové a aplikačné obmedzenia zapisuj doslovne do `podmienka`, napríklad `od 3 ks`, `len s Kaufland Card` alebo `cena za kus, od 1 balenia`.
- Vypĺňaj `kategoria` (a keď je k dispozícii, aj `obrazok_url`) – bez kategórie sa zhorší emoji fallback aj párovanie referenčných cien.
- Do `historia_cien` prenes najviac posledných 16 overených meraní toho istého produktu a obchodu. Deduplikuj podľa dátumu; pri Metro doplň aj `cena_s_dph`.
- Ak história nestačí na reálnu zľavu, použi `verdikt: "neoverene"` a `zlava_realna_pct: null`.
- `top_ids` má obsahovať len existujúce `id` z `obchody[].polozky`.
- Chýbajúce voliteľné hodnoty majú byť `null`, nie vymyslené.

## Ako denná routine aktualizuje dáta

Claude Code routine beží denne s change detection; celé nezmenené letáky znovu nečíta. Globálne dáta a personalizovaná analytika majú oddelené vlastníctvo:

- routine zbiera a overuje ponuky, ceny, históriu, verdikty, TOP/promo, otváracie hodiny, sviatky a legislatívu,
- prehliadač počíta používateľské Sledované produkty zo stabilného `product_id`, cenovej histórie podľa obchodu, potvrdených nákupov, evidovanej zásoby a používateľských preferencií,
- analytika používa deterministické dátové brány a vysvetliteľné pravidlá; uložené zoznamy/šablóny sa do spotreby nepočítajú a nejde o trénované ML.

Denný update upravuje:

1. `data/latest.json` — iba aktívne a jasne datované blízke ponuky.
2. `data/archive/<tyzden>.json` — kumulatívny týždenný snapshot; expirované pozorované ponuky sa z neho nemažú.
3. `data/archive/index.json` — každý ISO týždeň najviac raz.
4. `data/legislativa.json` — iba po skutočnej kontrole oficiálnych zdrojov.
5. `data/routine-state.json` — trvalý source manifest, posledný úspešný beh, metriky a audit dokončenej jednorazovej migrácie.

Kanonický workflow je v `docs/routine/daily.md`, cloudové nastavenie v `docs/routine/cloud-setup.md` a projektoví subagenti v `.claude/agents/`. V Claude Cloud Routine sa repozitár pri každom behu klonuje nanovo, preto sú tieto súbory trackované. GitHub Contents API ani PAT nie sú súčasťou workflow.

Predvolený cloudový publish vytvorí `claude/routine-<run_id>` a outcome `NEEDS_MERGE`, aby zmena prešla reviewom. Priamy push do `main` je voliteľný explicitný režim až po PASS validačných, bezpečnostných a deploy bránach.

Dáta sa čítajú za behu, takže čisto dátový update nevyžaduje bump service worker cache. Pri zmene HTML/CSS/JS alebo app shell súborov bump povinný zostáva.

## Referenčné ceny (voliteľné)

`data/referencne-ceny.json` môže obsahovať externé referenčné ceny komodít (`komodity[]` s poľami `klice`, `nazov`, `cena`, `jednotka`, `typ`, `zdroj_nazov`, `zdroj`, `datum`). Detail produktu zobrazí typ ceny, zdroj a hodnotu; reálna úspora sa však vždy počíta primárne z `bezna_cena_60d`. Kým je `komodity` prázdne, sekcia sa v UI nezobrazuje.

## Lokálne spustenie

Kvôli ES modulom, `fetch()` a service workeru neotváraj `index.html` cez `file://`. Spusti v koreňovom priečinku jednoduchý HTTP server:

```powershell
python -m http.server 8000
```

Potom otvor `http://127.0.0.1:8000/`.

Deterministické základy potvrdených nákupov, cenových pozorovaní, používateľských preferencií a merge správania možno overiť bez servera:

```powershell
node scripts/test_tracked_foundations.mjs
node scripts/test_tracked_analytics.mjs
node scripts/test_list_mode.mjs
```
