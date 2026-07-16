# Letákový prehľad

Responzívna statická aplikácia na prehľad potravinových akcií, rozlíšenie reálnych a podozrivých zliav, nákupný zoznam a prehľad legislatívy pre rodinný obchod.

**Live:** https://marekhronec.github.io/letaky/

## Čo aplikácia robí

- **Prehľad:** najlepšie overené ponuky, špeciálne akcie, stav zdrojov a aktuálne otváracie hodiny pobočiek vrátane sviatočných výnimiek.
- **Všetky akcie:** vyhľadávanie, obchodné filtre, verdikt zľavy, triedenie a vývoj ceny z overenej histórie. V aktuálnom týždni zobrazuje iba ešte platné ponuky; staršie ostávajú v archíve a cenovej histórii.
- **Sledované produkty:** vlastný core sortiment s dashboardom/zoznamom, filtrami a vysvetliteľným nákupným skóre z ceny, rytmu uložených nákupov a skladovateľnosti.
- **Môj zoznam:** položky z akcií aj ručne zadané položky, množstvo, odškrtávanie bez presúvania a rozdelenie podľa obchodov. Ručnú položku sa dá aj **nadiktovať hlasom** (Web Speech API, `sk-SK`, s fallbackom na písanie). Nákup sa dá uložiť do histórie a neskôr obnoviť.
- **Legislatíva:** prehľad povinností a termínov pre maloobchod s potravinami a drogériou (eKasa, dane, hygiena, chémia, zálohy, ceny/spotrebiteľ) z `data/legislativa.json`, s odkazmi na oficiálne zdroje. Orientačné, nie právne poradenstvo. Položky s `confidence: "low"` sú v UI označené „orientačné – overiť“; ostatné hodnoty poľa `confidence` sa nezobrazujú.
- **Detail produktu:** obrázok položky (`obrazok_url`, s kategóriovým emoji ako fallback), graf vývoja ceny, jednotková cena, podmienky akcie a porovnanie rovnakého `product_id` medzi obchodmi.
- **PWA/offline:** stránku možno pridať na plochu mobilu; posledné načítané dáta a nákupný zoznam fungujú aj bez signálu. Pri novej verzii appky sa zobrazí banner „Obnoviť“.

## Súkromie a účty

- Appka funguje **bez účtu**: zoznam, nastavenia a stavy legislatívy sa ukladajú iba do `localStorage` tohto prehliadača a dajú sa jednorazovo preniesť linkom.
- **Voliteľné prihlásenie (Supabase):** po prihlásení e-mailom a heslom sa nákupný zoznam, história nákupov, nastavenia a stavy legislatívy synchronizujú medzi zariadeniami. Účty vytvára správca; verejné registrácie sú vypnuté. Dáta každého používateľa chráni Row Level Security – presné pravidlá sú v [`supabase/schema.sql`](supabase/schema.sql).
- Žiadna analytika ani cookies tretích strán.

## Architektúra

Projekt nemá build step ani npm závislosti – GitHub Pages servuje priamo tieto súbory. Jediná externá runtime závislosť je `@supabase/supabase-js`, importovaná za behu z esm.sh (presne pripnutá verzia v `js/config.js`); bez pripojenia appka beží ďalej, len bez prihlásenia a synchronizácie.

```text
index.html                  # HTML shell (bez inline skriptov a štýlov) + CSP
styles.css                  # všetky štýly (sekcie + presne 3 media bloky)
sw.js                       # offline cache (network-first) + update flow
manifest.webmanifest        # PWA manifest
icons/app-icon.svg          # ikona aplikácie

js/app.js                   # vstupný bod: action registry, routing, render, SW registrácia
js/config.js                # konštanty (obchody, kľúče úložiska, limity, Supabase)
js/state.js                 # zdieľaný stav + nastavenia, stavy legislatívy, história nákupov
js/data.js                  # fetch + normalizácia dát (JEDINÉ miesto, kde sa čítajú kľúče schémy)
js/shopping.js              # nákupný zoznam + tombstone merge pre sync
js/tracking.js              # sledované produkty + lokálna/cloud perzistencia
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
| `letaky.savedLists.v1` | história uložených nákupov |
| `letaky.savedListsDeleted.v1` | tombstones zmazaných nákupov (TTL 30 dní) |
| `letaky.trackedProducts.v1` | sledované produkty, posledný snapshot a tombstones pre sync |

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

## Ako routine aktualizuje dáta

Kompletný týždenný update vytvorí alebo upraví tri súbory cez GitHub Contents API:

1. `data/latest.json` — nový týždeň.
2. `data/archive/<tyzden>.json` — identická archívna kópia.
3. `data/archive/index.json` — pridanie nového týždňa do poľa.

Pri aktualizácii existujúceho súboru treba najprv načítať jeho aktuálne `sha` a poslať ho v `PUT` požiadavke:

```text
GET /repos/MarekHronec/letaky/contents/data/latest.json

PUT /repos/MarekHronec/letaky/contents/data/latest.json
{
  "message": "data: týždeň 2026-W30",
  "content": "<base64 JSON>",
  "sha": "<sha z GET odpovede>"
}
```

Po commite netreba samostatný deploy – GitHub Pages nasadí nový obsah z `main` automaticky. Dáta sa čítajú za behu, takže update dát **nevyžaduje** zásah do kódu ani bump service worker cache.

## Token pre automatizáciu

Použi fine-grained GitHub token obmedzený iba na tento repozitár:

- **Repository access:** iba `letaky`
- **Repository permissions:** Contents — Read and write
- token patrí do secrets automatizácie, nikdy do repozitára
- po expirácii ho treba v routine vymeniť

## Referenčné ceny (voliteľné)

`data/referencne-ceny.json` môže obsahovať externé referenčné ceny komodít (`komodity[]` s poľami `klice`, `nazov`, `cena`, `jednotka`, `typ`, `zdroj_nazov`, `zdroj`, `datum`). Detail produktu zobrazí typ ceny, zdroj a hodnotu; reálna úspora sa však vždy počíta primárne z `bezna_cena_60d`. Kým je `komodity` prázdne, sekcia sa v UI nezobrazuje.

## Lokálne spustenie

Kvôli ES modulom, `fetch()` a service workeru neotváraj `index.html` cez `file://`. Spusti v koreňovom priečinku jednoduchý HTTP server:

```powershell
python -m http.server 8000
```

Potom otvor `http://127.0.0.1:8000/`.
