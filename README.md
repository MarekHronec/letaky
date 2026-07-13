# Letákový prehľad

Responzívna statická aplikácia na prehľad potravinových akcií, rozlíšenie reálnych a podozrivých zliav a praktický nákupný zoznam.

**Live:** https://marekhronec.github.io/letaky/

## Čo aplikácia robí

- **Prehľad:** najlepšie overené ponuky, špeciálne akcie, stav zdrojov a odporúčaný plán nákupu.
- **Všetky akcie:** vyhľadávanie, obchodné filtre, verdikt zľavy a triedenie.
- **Môj zoznam:** položky z akcií aj ručne zadané položky, množstvo, odškrtávanie bez presúvania a rozdelenie podľa obchodov.
- **Detail produktu:** podmienky akcie a porovnanie rovnakého `product_id` medzi obchodmi.
- **PWA/offline:** stránku možno pridať na plochu mobilu; posledné načítané dáta a nákupný zoznam fungujú aj bez signálu.
- **Súkromie:** žiadne účty, cookies ani analytika. Zoznam sa ukladá iba do `localStorage` daného prehliadača; medzi zariadeniami sa dá jednorazovo preniesť linkom.

## Architektúra

Projekt nemá build step, framework ani npm závislosti. GitHub Pages servuje priamo tieto súbory:

```text
index.html                  # UI, štýly a aplikačná logika
manifest.webmanifest        # PWA manifest
sw.js                       # offline cache
icons/app-icon.svg          # ikona aplikácie
data/latest.json            # aktuálny týždeň
data/schema-v2.json         # odporúčaná schéma pre routine
data/archive/index.json     # zoznam archívnych týždňov
data/archive/2026-W29.json  # archívna kópia týždňa
```

GitHub Pages je nastavený na deploy z `main`, root `/`. Každý push do `main` spustí automatické prenasadenie.

## Nákupný zoznam

Zoznam sa ukladá pod kľúčom `letaky.shoppingList.v2`. Pri pridaní akcie sa uloží snapshot produktu, nie iba referencia na aktuálny JSON. Položka preto zostane čitateľná aj po výmene týždenných dát.

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
  "originalPrice": 2.39,
  "condition": "od 2 ks",
  "validFrom": "2026-07-27",
  "validTo": "2026-08-02",
  "quantity": 2,
  "checked": false,
  "addedAt": "2026-07-13T18:20:00.000Z"
}
```

Ručné položky majú `source: "manual"` a môžu mať `store` aj `price` prázdne. Tlačidlo **Zdieľať link** vloží snapshot zoznamu do URL fragmentu `#share=…`; fragment sa neposiela GitHub Pages serveru. Po otvorení na inom zariadení aplikácia zoznam uloží do jeho `localStorage`. Kto má link, môže jeho obsah načítať, preto ho treba zdieľať ako nákupný zoznam, nie ako tajnú informáciu. Export/import JSON zostáva ako záloha a riešenie pre veľmi dlhé zoznamy.

## Odporúčaná dátová schéma v2

Aplikácia zostáva spätne kompatibilná s pôvodným JSON-om v repozitári. Nové Claude routines by však mali generovať `schema_version: 2` podľa [`data/schema-v2.json`](data/schema-v2.json).

Najdôležitejšie zmeny oproti pôvodnému návrhu:

1. `id` jednoznačne identifikuje konkrétnu ponuku.
2. `product_id` zostáva rovnaké pre ten istý produkt naprieč obchodmi a týždňami; vďaka nemu funguje porovnanie cien.
3. `top_ids` odkazuje na položky v `obchody[].polozky` a neduplikuje celé objekty.
4. `zlava_letak_pct` a `zlava_realna_pct` sú oddelené. Marketingové percento z letáku sa nesmie zameniť za reálnu úsporu oproti historickej cene.
5. `mnozstvo`, `jednotkova_cena` a `jednotka` sú voliteľné, ale výrazne zlepšia porovnávanie cien. Produktové obrázky UI zámerne nepoužíva.
6. Metro môže mať cenu bez DPH v `cena` a spotrebiteľskú cenu v `cena_s_dph`; UI uprednostní cenu s DPH.
7. `obchody[].plati_od` a `obchody[].plati_do` určujú spoločnú platnosť letáka. Produkt ich zdedí; vlastné `polozky[].plati_od` alebo `plati_do` použije iba vtedy, keď má kratšiu či odlišnú platnosť.

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
      "podmienka": "Lidl Plus"
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
- `id` musí byť unikátne v celom týždennom súbore. Praktický formát je `<obchod>-<product_id>-<tyzden>`.
- `product_id` sa nemení iba preto, že sa zmenila cena, obchod alebo týždeň. Variant s inou gramážou má iné `product_id`.
- Peňažné hodnoty sú JSON čísla bez symbolu meny; mena je vždy EUR.
- Dátumy používajú `YYYY-MM-DD`, `generovane` ISO 8601 s časovou zónou.
- Pri každom obchode uveď spoločnú platnosť letáka cez `plati_od` a `plati_do`. Na produkte dátumy opakuj iba pri odlišnej platnosti.
- Množstevné, kartové a aplikačné obmedzenia zapisuj doslovne do `podmienka`, napríklad `od 3 ks`, `len s Kaufland Card` alebo `cena za kus, od 1 balenia`.
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

Po commite nie je potrebný samostatný deploy príkaz. GitHub Pages nasadí nový obsah z `main` automaticky.

## Token pre automatizáciu

Použi fine-grained GitHub token obmedzený iba na tento repozitár:

- **Repository access:** iba `letaky`
- **Repository permissions:** Contents — Read and write
- token patrí do secrets automatizácie, nikdy do repozitára
- po expirácii ho treba v routine vymeniť

## Lokálne spustenie

Kvôli `fetch()` a service workeru neotváraj `index.html` priamo cez `file://`. Spusti v koreňovom priečinku jednoduchý HTTP server, napríklad:

```powershell
python -m http.server 8000
```

Potom otvor `http://127.0.0.1:8000/`.
