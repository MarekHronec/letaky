# 🛒 letaky — týždenný prehľad potravinových akcií

Statická stránka (GitHub Pages) s prehľadom akcií z letákov: promo akcie, TOP zľavy týždňa,
položky po obchodoch s verdiktom **reálna / umelá / neoverená zľava**, plán nákupu s trasou
a archív starších týždňov.

**Live:** https://marekhronec.github.io/letaky/

## Architektúra

- **Žiadny build step, žiadne frameworky, žiadne npm.** Celá aplikácia je jeden súbor
  [`index.html`](index.html) (vanilla JS + CSS), ktorý fetchne `./data/latest.json`
  a vyrenderuje obsah čisto na klientovi.
- **Dáta aktualizuje externá automatizácia** (Claude routine) commitom cez GitHub API.
  Stránka sa vyrenderuje z akéhokoľvek validného JSON podľa schémy nižšie — chýbajúce
  polia/sekcie sa jednoducho vynechajú.
- **GitHub Pages:** deploy from branch `main`, root (`/`). Každý commit = automatické
  prenasadenie (typicky do ~1 minúty).

```
index.html                  # celá aplikácia (HTML + CSS + JS)
data/latest.json            # aktuálny týždeň
data/archive/index.json     # zoznam archívnych týždňov, napr. ["2026-W29"]
data/archive/2026-W29.json  # archívna kópia daného týždňa
```

## Funkcie stránky

- mobile-first, automatický dark mode (`prefers-color-scheme`), systémové fonty
- filtre: **Všetko / ✅ Reálne / ❌ Umelé / ⏰ Končí čoskoro** (platí ≤ 2 dni)
- fulltextové hľadanie a triedenie (poradie v letáku / najväčšia zľava / najnižšia cena / názov)
- zbaliteľné sekcie obchodov, Metro ceny bez DPH + s DPH
- prepínač archívu (dropdown z `data/archive/index.json`)
- žiadne CDN, analytics ani cookies

## JSON schéma (`data/latest.json`)

```json
{
  "tyzden": "2026-W29",
  "obdobie": "20.–26. júl 2026",
  "generovane": "2026-07-22T07:00:00+02:00",
  "promo": [
    {"obchod": "Metro", "text": "Sekt Hubert zdarma k nákupu nad 150 € bez DPH",
     "plati_do": "2026-07-26", "podmienka": "1× na zákazníka"}
  ],
  "top": [
    {"nazov": "Bravčové karé bez kosti 1 kg", "obchod": "Kaufland", "cena": 3.49,
     "cena_povodna": 5.99, "zlava_pct": 42, "verdikt": "realna", "podmienka": null,
     "plati_do": "2026-07-22", "poznamka": "najnižšia cena za 6 mesiacov"}
  ],
  "obchody": [
    {
      "id": "kaufland", "nazov": "Kaufland",
      "letak_url": "https://...", "poznamka": null,
      "polozky": [
        {"nazov": "…", "cena": 3.49, "cena_povodna": 5.99, "zlava_pct": 42,
         "verdikt": "realna", "podmienka": null, "plati_do": "2026-07-22",
         "cena_s_dph": null, "poznamka": null}
      ]
    }
  ],
  "plan": {
    "zastavky": [
      {"poradie": 1, "nazov": "Metro – Ivanská cesta", "den": "PO–UT",
       "poznamka": "objemný nákup", "odhad_eur": 87}
    ],
    "maps_url": "https://www.google.com/maps/dir/?api=1&origin=...&waypoints=...&destination=...&travelmode=driving",
    "spolu_eur": 123, "uspora_eur": 41
  },
  "zdroje_stav": [{"zdroj": "idemnanakup.sk", "ok": true}]
}
```

Pravidlá:

- `verdikt`: `"realna"` | `"umela"` | `"neoverene"`
- Metro položky: `cena` a `cena_povodna` sú **bez DPH** a `cena_s_dph` je vyplnené;
  ostatné obchody majú `cena_s_dph: null`
- dátumy `plati_do` vo formáte `YYYY-MM-DD`, `generovane` ako ISO 8601 s časovou zónou
- akékoľvek pole môže chýbať alebo byť `null` — stránka danú informáciu/sekciu vynechá

## Ako automatizácia commituje nové dáta

Routine každý týždeň zapíše tri súbory cez [GitHub Contents API](https://docs.github.com/en/rest/repos/contents).
Update existujúceho súboru **vyžaduje `sha` aktuálnej verzie** — najprv GET, potom PUT:

```
# 1) zisti sha existujúceho súboru
GET /repos/{owner}/letaky/contents/data/latest.json
→ response.sha

# 2) zapíš nový obsah (base64)
PUT /repos/{owner}/letaky/contents/data/latest.json
{
  "message": "data: týždeň 2026-W30",
  "content": "<base64 nového JSON>",
  "sha": "<sha z kroku 1>"
}
```

Kompletný týždenný update = 3 zápisy:

1. **`data/latest.json`** — nový týždeň (PUT so `sha` starej verzie)
2. **`data/archive/<tyzden>.json`** — kópia nového latest, napr. `data/archive/2026-W30.json`
   (nový súbor ⇒ PUT bez `sha`)
3. **`data/archive/index.json`** — pridať nový týždeň do poľa, napr. `["2026-W29","2026-W30"]`
   (PUT so `sha` starej verzie)

Príklad s `curl`:

```bash
SHA=$(curl -s -H "Authorization: Bearer $TOKEN" \
  https://api.github.com/repos/MarekHronec/letaky/contents/data/latest.json | jq -r .sha)

curl -X PUT -H "Authorization: Bearer $TOKEN" \
  https://api.github.com/repos/MarekHronec/letaky/contents/data/latest.json \
  -d "{\"message\":\"data: týždeň 2026-W30\",\"content\":\"$(base64 -w0 latest.json)\",\"sha\":\"$SHA\"}"
```

Po commite GitHub Pages stránku automaticky prenasadí — netreba nič ďalšie.

## Token pre automatizáciu (fine-grained PAT)

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
2. **Repository access:** *Only select repositories* → vyber **len `letaky`**
3. **Permissions → Repository permissions → Contents: Read and write** (nič iné)
4. **Expiration:** 90 dní (po expirácii vygeneruj nový a vymeň ho v automatizácii)
5. Token ulož do secrets automatizácie — nikdy ho necommituj do repa.
