# Letákový prehľad

Nezávislá statická aplikácia na vlastné plánovanie nákupov z verejne dostupných ponúk, s cenovou analýzou z dostupnej histórie, nákupným zoznamom a orientačným legislatívnym checklistom.

**Live:** https://marekhronec.github.io/letaky/

## Čo aplikácia robí

- **Prehľad:** ponuky s najsilnejším dostupným dátovým podkladom, špeciálne akcie, stav zdrojov a otváracie hodiny pobočiek vrátane sviatočných výnimiek. Každá pobočka rozlišuje dnešné overenie, posledný dobrý stav a potrebu kontroly.
- **Všetky akcie:** vyhľadávanie, obchodné filtre, hodnotenie podľa histórie aplikácie, triedenie a vývoj ceny z dostupných pozorovaní. V aktuálnom týždni zobrazuje iba ešte platné ponuky; staršie ostávajú v archíve a cenovej histórii.
- **Sledované produkty:** vlastný core sortiment s dashboardom/zoznamom, filtrami a vysvetliteľným odporúčaním. Karta predvolene ukazuje iba rozhodnutie, cenu, cenový trend a odporúčané množstvo; zásoba, cenová pozícia, kvalita podkladov, dôkazy a nastavenia sú rozbaliteľné. Oddeľuje aktívnu a budúcu ponuku a zohľadňuje iba potvrdené nákupy.
- **Môj zoznam:** má režim **V obchode** s celoplošným zoznamom, 44 px odškrtávaním, odstránením položky a načítaním šablóny; na mobile je predvolený. Režim **Správa zoznamu** pridáva množstvá, ručné/hlasové zadanie, ceny, zdieľanie, import, šablóny a históriu. Až výslovné potvrdenie označených položiek vytvorí nemenný záznam nákupu.
- **Legislatíva:** prehľad povinností a termínov pre maloobchod s potravinami a drogériou (eKasa, dane, hygiena, chémia, zálohy, ceny/spotrebiteľ) z `data/legislativa.json`, s odkazmi na oficiálne zdroje. Orientačné, nie právne poradenstvo. Položky s `confidence: "low"` sú v UI označené „orientačné – overiť“; ostatné hodnoty poľa `confidence` sa nezobrazujú.
- **Detail produktu:** vlastná kategóriová ikona, graf vývoja ceny, jednotková cena, podmienky akcie, porovnanie rovnakého `product_id` medzi obchodmi a odkaz na oficiálny leták.
- **PWA/offline:** stránku možno pridať na plochu mobilu; posledné načítané dáta a nákupný zoznam fungujú aj bez signálu. Pri novej verzii appky sa zobrazí banner „Obnoviť“.
- **Transparentnosť dát:** týždenný výber uvádza začiatok dostupného archívu a globálny indikátor „Dáta“ vysvetľuje stav pipeline, archívu, obchodov a review backlogu. Legislatíva samostatne uvádza dátum poslednej obsahovej právnej kontroly a signál zmeny oficiálneho zdroja.

## Súkromie a účty

- Appka funguje **bez účtu**: zoznam, šablóny, potvrdené nákupy, sledované produkty, nastavenia a stavy legislatívy sa ukladajú iba do `localStorage` tohto prehliadača. Zdieľací link prenáša iba snapshot nákupného zoznamu, nie potvrdenú históriu ani analytické preferencie.
- **Rodinné prihlásenie (Supabase):** účty sú určené výlučne vlastníkovi aplikácie a jeho bratovi na osobné/domáce používanie. Verejná registrácia nie je dostupná. Po prihlásení e-mailom a heslom sa nákupný zoznam, jeho šablóny, append-only potvrdené nákupy, sledované produkty, nastavenia a stavy legislatívy synchronizujú medzi zariadeniami. Izolácia účtov vyžaduje, aby živý projekt mal aplikované Row Level Security pravidlá zo [`supabase/schema.sql`](supabase/schema.sql) a vypnutú verejnú registráciu; repozitár sám stav dashboardu negarantuje.
- Účtová synchronizácia je vedená ako výlučne osobná alebo domáca činnosť podľa čl. 2 ods. 2 písm. c) GDPR. Pred pridaním ďalších používateľov, verejným prístupom alebo profesijným či komerčným použitím sa musí toto posúdenie zopakovať.
- Žiadna analytika ani cookies tretích strán.
- Podrobnosti sú v [`PRIVACY.md`](PRIVACY.md); bezpečné hlásenie zraniteľností a hranice dôvery opisuje [`SECURITY.md`](SECURITY.md).

## Architektúra

Projekt nemá build step ani npm závislosti – GitHub Pages servuje priamo tieto súbory. Jediná runtime závislosť je auditovaný, presne pripnutý bundle `@supabase/supabase-js` uložený v `js/vendor/supabase-js.mjs`; prehliadač nespúšťa JavaScript z CDN. Bez klienta alebo pripojenia appka beží ďalej, len bez prihlásenia a synchronizácie.

```text
index.html                  # HTML shell bez inline skriptov + obmedzujúca CSP
styles.css                  # všetky štýly vrátane responzívnych breakpointov
sw.js                       # offline cache (network-first) + update flow
manifest.webmanifest        # PWA manifest
icons/app-icon.svg          # ikona aplikácie

js/app.js                   # vstupný bod: action registry, routing, render, SW registrácia
js/config.js                # konštanty (obchody, kľúče úložiska, limity, Supabase)
js/profile-storage.js       # oddelené úložiská hosťa a jednotlivých účtov
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
scripts/test_account_isolation.mjs   # oddelenie hosťa/účtov a ochrana pred oneskoreným syncom
scripts/test_input_hardening.mjs     # limity a sanitizácia importu/zdieľania
scripts/test_pipeline_status.mjs     # pravdivé zobrazenie degraded/stale stavu
scripts/test_static_security.mjs     # CSP, vendoring a statické bezpečnostné invarianty
scripts/test_legal_copy.mjs          # disclaimer, opatrné labely, zdrojové odkazy a oddelenie cenových báz
scripts/routine/validate_daily.py    # deterministická publish brána používaná pipeline
scripts/routine/validate_pipeline_status.py # kontrakt verejného zdravotného statusu
scripts/routine/validate_legislativa.py # tvar checklistu + allowlist oficiálnych zdrojov
scripts/routine/scan_secrets.py      # blokovanie secrets a podpísaných URL pred publishom

data/latest.json            # aktuálny týždeň (schema v2)
data/schema-v2.json         # JSON Schema pre dátovú pipeline a validator
data/legislativa.json       # obsah pohľadu Legislatíva
data/pipeline-status.json   # verejný stav posledného behu súkromnej pipeline
data/archive/index.json     # zoznam archívnych týždňov
data/archive/<tyzden>.json  # archívne kópie týždňov

docs/routine/review.md      # read-only Codex cloud kontrola zdravia a malej review dávky
docs/routine/codex-cloud-setup.md # cloudové nastavenie bez závislosti od lokálneho PC

supabase/schema.sql         # DDL + RLS policies pre tabuľku user_data
```

CI používa pri commitnutom `latest.json` režim `--snapshot`: schému, väzby,
platnosti a týždeň posudzuje k dátumu generovania, pričom stále odmietne
timestamp z budúcnosti. Živú zastaranosť voči dnešnému dňu zámerne kontroluje
`data/pipeline-status.json` a read-only monitor; opätovný CI beh historického
commitu preto časom nezačne zlyhávať iba plynutím času.

GitHub Pages je nastavený na deploy z `main`, root `/`. Každý push do `main` sa nasadí automaticky.

Pred produkčným používaním musí vlastník manuálne overiť:

- ruleset pre `main`, ktorý blokuje priame ľudské pushy a vyžaduje zelený `validate`; úzky bypass smie mať iba validovaný data-only pipeline writer,
- GitHub Secret Scanning Push Protection a Private Vulnerability Reporting,
- Dependabot alerts/security updates (týždenné version PR už konfiguruje `.github/dependabot.yml`),
- aplikovanie `supabase/schema.sql`, vypnutý signup a auth rate/session/recovery nastavenia,
- dvojúčtový test, v ktorom účet A nedokáže čítať ani meniť riadok účtu B.

**Dôležité pravidlo údržby:** pri pridaní, premenovaní alebo zmazaní súboru aplikácie treba upraviť zoznam `SHELL` v [`sw.js`](sw.js) a bumpnúť tam verziu `CACHE` (`letaky-app-vX`). Inak nainštalované PWA ostanú offline na starej verzii.

## Úložisko v prehliadači (localStorage)

Tabuľka uvádza logické kľúče. Osobné dáta sa fyzicky ukladajú do obálky pod `letaky.profile.v1.guest.<kľúč>` alebo `letaky.profile.v1.user.<uuid>.<kľúč>`. Hosť a každý účet majú oddelený namespace; prepnutie účtu ich automaticky nezlučuje. `listViewMode` je iba neosobná lokálna voľba zobrazenia a ostáva spoločná pre daný browser profil.

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
3. Cenová pozícia je robustná voči ojedinelým extrémom. Silné odporúčanie vyžaduje hodnotenie podporené cenovou históriou a dostatočný počet porovnateľných pozorovaní; inak UI otvorene uvedie nedostatok cenovej histórie.
4. Frekvencia a typické množstvo vychádzajú len z potvrdených nákupov. Pri nedostatočnej histórii môže používateľ zadať vlastný interval, no systém si ho nesmie zameniť za naučenú predikciu.
5. Odporúčanie množstva zohľadňuje evidovanú zásobu, minimálnu zásobu, cieľovú cenu, skladovateľnosť a používateľský profil produktu. Bez týchto vstupov zostáva konzervatívne.
6. UI používa zrozumiteľné štítky kvality dát (napríklad hodnotenie podporené cenovou históriou alebo nedostatok cenovej histórie), nie falošnú „istotu 68 %“ ani zmiešané skóre 55/25/20.

Hranice a pravidlá sú zámerne pevné, kontrolovateľné a deterministicky testované. Pokročilejší predikčný model má zmysel až po nazbieraní dostatočnej, pravdivej histórie potvrdených nákupov; dovtedy sa README ani UI nesmú tváriť, že aplikácia používa ML.

## Dátová schéma v2

Aplikácia číta **iba** `schema_version: 2` podľa [`data/schema-v2.json`](data/schema-v2.json) – slovenské kľúče (`nazov`, `cena`, `plati_od`…). Spätná kompatibilita s pôvodným návrhom v1 bola odstránená; v repozitári žiadne v1 dáta nie sú.

Najdôležitejšie zásady:

1. `id` jednoznačne identifikuje konkrétnu ponuku. Praktický formát je `<obchod>-<product_id>-<tyzden>`.
2. `product_id` zostáva rovnaké pre ten istý produkt naprieč obchodmi a týždňami; vďaka nemu funguje porovnanie cien. **Nesmie obsahovať prefix obchodu** – `maslo-82-250g`, nie `lidl-maslo-82-250g`. (Appka známy prefix obchodu defenzívne odstráni, ale správne je negenerovať ho.) Variant s inou gramážou má iné `product_id`.
3. `top_ids` odkazuje na položky v `obchody[].polozky` a neduplikuje celé objekty.
4. `zlava_letak_pct` a `zlava_realna_pct` sú oddelené. Marketingové percento z letáku sa nesmie zameniť za rozdiel oproti referenčnej cene aplikácie. `zlava_realna_pct` môže byť aj záporná (tovar je drahší než táto referencia) – UI vtedy odznak zľavy nezobrazí.
5. `mnozstvo`, `jednotkova_cena` a `jednotka` sú v publish kontrakte povinné kľúče, ale ich hodnota môže byť `null`. Vyplnené hodnoty zlepšia porovnávanie; jednotková cena sa zobrazuje v detaile. `kategoria` riadi vlastnú emoji skratku.
6. Metro môže mať cenu bez DPH v `cena` a spotrebiteľskú cenu v `cena_s_dph`; UI uprednostní cenu podľa nastavenia Platca DPH. Graf histórie vždy používa cenu s DPH, aby sa nemiešali bázy.
7. `obchody[].plati_od` a `obchody[].plati_do` určujú spoločnú platnosť letáka. Produkt ich zdedí; vlastné dátumy uvádzaj len pri odlišnej platnosti.
8. `historia_cien` obsahuje iba skutočne pozorované ceny rovnakého `product_id` v rovnakom obchode. UI vykreslí graf až od dvoch meraní; prečiarknutá cena nie je historické meranie.
9. Každá položka `promo[]` má povinnú `priorita` (1 = jediná Top akcia, 2 alebo 3 = ostatné poradie) a `zdroj_url` (odkaz „Detail akcie“).
10. `otvaracie_hodiny` obsahuje konkrétne pobočky, bežné hodiny, dátum overenia, first-party zdroj a `vynimky[]`. Dátová pipeline musí pri každom týždni skontrolovať sviatky/dni pracovného pokoja a každú výnimku uviesť explicitne; UI ich zvýrazní na Prehľade.

Skrátený ilustračný výrez:

> Tento výrez zámerne neobsahuje desať `top_ids`, všetky tri obchody, úplné povinné polia ponuky ani `otvaracie_hodiny`, a preto sa **nesmie publikovať samostatne**. Ako plný validný fixture používaj `data/latest.json`; záväzný tvar je `data/schema-v2.json` spolu so sémantickou bránou `scripts/routine/validate_daily.py`.

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
      "plati_od": "2026-07-27",
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
          "poznamka": "najnižšie z dostupných 90-dňových meraní aplikácie"
        }
      ]
    }
  ],
  "zdroje_stav": [
    { "zdroj": "lidl.sk", "ok": true }
  ]
}
```

### Pravidlá pre dátovú pipeline

- `verdikt` je presne `realna`, `umela` alebo `neoverene`.
- `id` musí byť unikátne v celom týždennom súbore.
- `product_id` sa nemení iba preto, že sa zmenila cena, obchod alebo týždeň – a **nikdy nezačína id obchodu** (`metro-`, `kaufland-`, `lidl-`, `tesco-`, `billa-`, `coop-`, `dm-`, `teta-`). Kontrola pred commitom: žiadne `product_id` nesmie začínať niektorým z týchto prefixov.
- Peňažné hodnoty sú JSON čísla bez symbolu meny; mena je vždy EUR.
- Dátumy používajú `YYYY-MM-DD`, `generovane` ISO 8601 s časovou zónou.
- Pri každom obchode uveď spoločnú platnosť letáka cez `plati_od` a `plati_do`. Na produkte dátumy opakuj iba pri odlišnej platnosti.
- Množstevné, kartové a aplikačné obmedzenia zapisuj ako presné fakty do `podmienka`, napríklad `od 3 ks`, `len s Kaufland Card` alebo `cena za kus, od 1 balenia`. Nekopíruj slogan ani kreatívnu marketingovú vetu.
- Vypĺňaj `kategoria`, aby mala položka stabilnú vlastnú emoji skratku.
- Do `historia_cien` prenes najviac posledných 16 pozorovaných meraní toho istého produktu a obchodu. Deduplikuj podľa dátumu; pri Metro doplň aj `cena_s_dph`.
- Pri METRO publikuj iba vecné polia potrebné na porovnanie: identitu produktu, balenie, cenu s jasnou DPH bázou, číselnú podmienku, platnosť, pobočku a odkaz na zdroj. `promo.text`, `poznamka` a `dovod_verdiktu` musia byť nová stručná analytická formulácia; nekopíruj slogan, výzvu na nákup, kreatívny názov kampane ani vetu z letáka.
- Ak história nestačí na hodnotenie podľa referenčnej ceny aplikácie, použi `verdikt: "neoverene"` a `zlava_realna_pct: null`.
- `top_ids` má obsahovať len existujúce `id` z `obchody[].polozky`.
- Chýbajúce voliteľné hodnoty majú byť `null`, nie vymyslené.

## Automatická dátová pipeline a read-only dozor

Globálne dáta a personalizovaná analytika majú oddelené vlastníctvo:

- súkromná automatická pipeline je **jediný zapisovateľ** ponúk, histórie, TOP/promo, otváracích hodín, sviatkov, archívu a verejného `pipeline-status`,
- prehliadač počíta používateľské Sledované produkty zo stabilného `product_id`, cenovej histórie podľa obchodu, potvrdených nákupov, evidovanej zásoby a používateľských preferencií,
- analytika používa deterministické dátové brány a vysvetliteľné pravidlá; uložené zoznamy/šablóny sa do spotreby nepočítajú a nejde o trénované ML,
- Codex scheduled task vo webovom prostredí môže každé dva dni urobiť nezávislú read-only kontrolu a pripraviť návrhy pre malú dávku review položiek. Dáta necommitne ani nepushuje.

Pipeline publikuje:

1. `data/latest.json` — aktívne a jasne datované blízke ponuky.
2. `data/archive/<tyzden>.json` — kumulatívny týždenný snapshot; expirované pozorované ponuky sa z neho nemažú.
3. `data/archive/index.json` — každý ISO týždeň najviac raz.
4. `data/pipeline-status.json` — verejný zdravotný kontrakt s výsledkom, čerstvosťou, validáciou, anomáliami, carry-forward a veľkosťou review fronty; UI z neho odvodzuje iba vysvetliteľné stavy, nie vlastné skóre.

`data/legislativa.json` nie je automaticky prepisovaný monitorom ani extrakčnou pipeline. Pole `aktualizovane` znamená dátum poslednej ľudskej obsahovej/právnej kontroly. Pipeline iba signalizuje zmenu oficiálneho portálu do súkromnej review fronty a verejného stavu zdrojov; tento signál nie je právnym záverom a obsahový update vyžaduje samostatnú skontrolovanú zmenu.

Kanonický monitor je v [`docs/routine/review.md`](docs/routine/review.md) a jeho cloudové nastavenie v [`docs/routine/codex-cloud-setup.md`](docs/routine/codex-cloud-setup.md). Beží bez subagentov, s pevnými limitmi a technicky read-only GitHub oprávneniami. Okrem zdravia dát kontroluje disclaimer, first-party odkazy, cenové bázy a neutrálnu formuláciu METRO textov. Ak dostane read-only prístup aj k súkromnej pipeline, smie z nej načítať iba malé prevádzkové metadáta a maximálne šesť pending review položiek; pripraví návrh rozhodnutia, ale nič nezapíše. Právne signály vždy eskaluje na ľudskú kontrolu.

Stavy monitora sú úmyselne prísne: `HEALTHY` znamená čerstvé validné dáta bez carry-forward a backlogu, `DEGRADED` znamená použitie posledných validných, ale neúplných/stale dát alebo čakajúce review a `BLOCKED` znamená nedôveryhodnú čerstvosť, validáciu, deploy či kritické prevádzkové údaje. `DEGRADED` nie je zelený úspech.

Dáta sa čítajú za behu, takže čisto dátový update nevyžaduje bump service worker cache. Pri zmene HTML/CSS/JS alebo app shell súborov bump povinný zostáva.

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
node scripts/test_account_isolation.mjs
node scripts/test_input_hardening.mjs
node scripts/test_pipeline_status.mjs
node scripts/test_static_security.mjs
node scripts/test_legal_copy.mjs
```

## Licencia, zdroje a zodpovednosť

Repozitár zatiaľ nemá zvolenú projektovú open-source licenciu. Verejná dostupnosť zdrojového kódu preto sama osebe neudeľuje všeobecné právo na jeho ďalšie použitie; licencie vendornutých komponentov sú uvedené v [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

Projekt slúži na vlastné informačné a plánovacie účely a nesprostredkúva predaj. Nie je prevádzkovaný v mene uvedených obchodníkov ani nimi schválený a nenahrádza ich oficiálne letáky. Obchodné názvy a ochranné známky sa používajú iba na identifikáciu zdroja ponuky.

Pipeline publikuje obmedzený súbor faktických údajov potrebných na porovnanie a odkaz na pôvodný zdroj; nemá reprodukovať grafickú úpravu, slogany ani kreatívne marketingové texty obchodníka. Osobitne pri METRO sa propagačné formulácie vždy nahradia suchým opisom ceny, množstva, podmienky a platnosti. Verejná dostupnosť zdroja sama osebe nie je právnym záverom o oprávnení na automatizované spracovanie; zmeny podmienok zdroja sa preto monitorujú a eskalujú na samostatnú ľudskú kontrolu.

Údaje sa získavajú a vyhodnocujú automaticky, preto môžu byť neúplné, oneskorené alebo nesprávne. Pred nákupom treba v odkazovanom oficiálnom zdroji alebo priamo v predajni overiť cenu, DPH, podmienky, platnosť, dostupnosť a otváracie hodiny. Cenové označenia a nákupné odporúčania vychádzajú iba z dostupnej histórie aplikácie; nie sú garanciou úspory, právnym posúdením zľavy ani spotrebiteľským overením. Legislatívna časť je iba orientačný rozcestník, môže byť neúplná, neaktuálna alebo nepresná a nenahrádza aktuálne znenie predpisu ani odborné poradenstvo.
