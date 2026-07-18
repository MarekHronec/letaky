# Letákový prehľad — Design specification

Redizajn na seriózny osobný analytický a nákupný nástroj. Nie promo landing page, nie generický AI dashboard, nie letáková estetika.

## 1. Referencie (len štrukturálne, nie vizuálne)

- **IBM Carbon** — informačná hierarchia, husté analytické rozloženia, dátové tabuľky, filtre, kompozícia dashboardu, jasné stavy komponentov.
- **GitHub Primer** — kompaktná aplikačná navigácia, nástrojový vzhľad, zdržanlivé bordery a povrchy, jasné indikátory stavu, formuláre a nastavenia.
- **GOV.UK** — použiteľnosť formulárov, prístupnosť, jasné chybové hlásenia, mobilná použiteľnosť, jednoduchý task-oriented jazyk.

Žiadna paleta, logo, kompozícia ani branding z týchto systémov sa nepreberá. Identita je nová.

## 2. Vizuálny smer

- Zdržanlivá **neutrálna sivá plocha** + **jeden akcent** (indigová modrá) pre interaktívne/primárne prvky. Tmavé aplikačné plochy používajú tlmenú navy, nie čiernu.
- Farba inak nesie **iba význam**: zelená = reálna zľava, jantárová = podozrivá, červená = urgentné/chyba. Identita obchodu = malý 3 px indikátor, nie plocha.
- **Ploché povrchy**, hairline separátory namiesto kariet všade. Tiene minimálne (len sheet a sticky lišty).
- Silná **dátová tabuľka** pre katalóg akcií (desktop) → riadky (mobil).
- Kompaktné, ale pohodlné rozostupy; jasná typografická hierarchia; tabulárne číslice pre ceny.
- Zmysluplné stavy: prázdny, načítava, úspech (toast), chyba (inline).

**Vyhýbame sa:** shadcn default, prehnané zaoblenia, farebný eyebrow nad každým nadpisom, žiariace bordery, glassmorphism, dekoratívne gradienty, obrie hero sekcie, karta okolo každého obsahu, prehnané tiene, dekoratívne grafy, letáková farebnosť.

## 3. Dizajnové tokeny

### Farba
```
Plocha    --bg #f4f5f6 · --surface #ffffff · --surface-2 #eef0f2 (inset)
Text      --text #171a1f · --muted #59616b · --faint #79818b
Linky/sep --line #e4e7eb (hairline) · --line-strong #cfd4da
Akcent    --brand #2f56d0 · --brand-strong #21409e · --brand-soft #eef2fd
Navigácia --nav #24345f · --nav-2 #2d4275 · --nav-text #dbe4f5
Stav      --green #1c7a4d · --amber #8a6100 · --red #c23934 (+ *-soft)
Obchody   desaturované indikátory (--metro, --kaufland, --lidl, …)
```
Jeden akcent, statusové farby len pre význam. Svetlá schéma (dark je mimo rozsah tejto iterácie, zámerne).

### Typografia
Systémový font stack (bez externých fontov — CSP a výkon). Škála:
`11 · 12 · 13 (základ) · 14 · 16 · 20 · 26 · 32`. Váhy 400/500/600/700.
Nadpisy tesný `letter-spacing`, prehľadové číslo veľké. Ceny/tabuľky `font-variant-numeric: tabular-nums`.

### Spacing
4-bodová škála: `4 · 8 · 12 · 16 · 24 · 32`. Kompaktné, nie stiesnené.

### Rádiusy
`--radius 8px` (kontajnery), `--radius-sm 6px` (chips, inputy, malé prvky). Žiadne pill/kruhové karty (okrem okrúhleho +/✓ a avatara).

### Bordery a povrchy
1 px hairline `--line`. Panely = plocha + hairline, bez tieňa. Sticky lišty a sheet = jemný tieň `--shadow`. Oddelenie sekcií hairline, nie vnorené karty.

### Layout
Sidebar `236px` (desktop), topbar `56px` (Primer-kompaktná). Obsah max šírka ~1180 px. Breakpointy: **1120** (2→1 stĺpec), **860** (sidebar→topbar+bottom-nav), **620** (mobil, tabuľka→riadky).

## 4. Komponenty — vytvorené / nahradené

| Komponent | Zmena |
|---|---|
| **Page header** | Na Prehľade bez duplicitného nadpisu obdobia; obdobie je súčasťou výberu týždňa v topbare |
| **App navigácia** | Kompaktný tlmený navy sidebar (desktop) / topbar + bottom-nav (mobil), profil vždy na pravom okraji |
| **Filter obchodov** | Segmentovaná lišta s indigovým aktívnym stavom a jemnými indikátormi obchodov, priamo pod KPI pásom |
| **Sledované produkty** | Samostatný core-sortiment: produktová záložka v každom riadku, dashboard/list prepínač, filtre a vysvetliteľná akcia. Karta oddeľuje aktívnu/budúcu ponuku, cenovú pozíciu, potrebu, zásobu a kvalitu dát; nepoužíva falošnú percentuálnu istotu ani zmiešané skóre 55/25/20 |
| **Môj zoznam a nákupy** | Uložený zoznam je obnoviteľná šablóna. Až explicitné potvrdenie označených položiek vytvorí samostatnú nemennú nákupnú udalosť, z ktorej môže analytika počítať rytmus spotreby |
| **Katalóg akcií** | Nahradený: karta-grid → **hustá dátová tabuľka** (názov · obchod · cena · zľava · verdikt · platnosť · akcia); na mobile štruktúrované riadky |
| **Top príležitosti** | Rebríček ako tabuľkový list s poradím, cenou, zľavou |
| **Špeciálne akcie (promo)** | Kompaktný list bez dekoratívneho ľavého akcentu; prvá akcia má dátový TOP badge, priorita → top 4 + rozbalenie |
| **Otváracie hodiny** | Týždenný panel konkrétnych pobočiek s first-party zdrojom, dátumom overenia a výraznou sviatočnou výnimkou |
| **Panely/sekcie** | Ploché sekcie oddelené hairline namiesto tieňových kariet |
| **Tlačidlá** | primary (akcent) · secondary (hairline) · ghost/text · okrúhle +/✓ |
| **Odznaky** | verdikt (reálna/podozrivá/neoverená), zľava, status — jemné, nie balónové |
| **KPI pásik** | Prvý blok pod topbarom; kompaktný riadok metrík spojený s filtrom obchodov |
| **Detail sheet** | Prepracovaný: sekcie definičných riadkov, graf, porovnanie obchodov |
| **Formuláre** | GOV.UK vzor: jasné labely, chybové hlásenia, dostatočné ciele dotyku (login, vlastná položka, nastavenia) |
| **Legislatíva** | Timeline termínov + list povinností so závažnosťou |
| **Legislatívne filtre** | Oblasť a stav sú kompaktné selecty; stav podporuje nevyriešené, hotové aj skrytie ignorovaných/nerelevantných |
| **Stavy** | Prázdny / načítava / chyba (inline retry) / úspech (toast) — jednotné |

### Sledované produkty — rozhodovacia hierarchia

Rozhranie má používateľovi najprv povedať **čo spraviť a kedy**, potom ukázať dôvody. Akcia „kúpiť teraz“ nesmie vychádzať z ponuky, ktorá ešte nezačala; budúca ponuka má vlastný stav a dátum začiatku. Silná akcia je dostupná iba pri overenej ponuke a splnenom minime porovnateľných dát. Pri slabých dátach je správny výstup „sledovať cenu“ alebo „doplniť údaje“, nie sebavedomé odporúčanie.

Cena sa porovnáva vždy v jednej báze a história zachováva obchod. Cenová pozícia má byť robustná voči extrémom a UI má rozlíšiť pozíciu v konkrétnom obchode od porovnania trhu. Rytmus spotreby používa iba potvrdené append-only nákupy so stabilným `product_id`; uložené zoznamy a podobné názvy produktov nie sú nákupnou históriou.

Na karte majú byť podľa dostupnosti viditeľné:

- odporúčaná akcia a jej časovanie,
- aktuálna alebo najbližšia cena a robustná cenová pozícia,
- posledný potvrdený nákup, typický interval a odhad potreby,
- stav zásoby, minimum, cieľová cena a profil skladovateľnosti,
- stručné dôvody a štítky kvality vstupov namiesto neodôvodneného percenta istoty.

Odporúčané množstvo je konzervatívne a rešpektuje zásobu, minimum, skladovateľnosť a používateľské nastavenia. Dizajn nesmie naznačovať ML predikciu, kým aplikácia nemá dostatok pravdivých udalostí na tréning a spätné vyhodnotenie; aktuálne pravidlá sú pevné, vysvetliteľné a deterministicky testovateľné.

## 5. Prístupnosť
Viditeľný `:focus-visible`, kontrast textu ≥ 4.5:1, ciele dotyku ≥ 40 px na mobile, `aria-label` na ikonových tlačidlách, `role="dialog"`+focus-trap v detaile, redukcia pohybu rešpektovaná.

## 6. Závislosti
Bez build-stepu, natívne ES moduly. Jediná runtime závislosť: `@supabase/supabase-js` (MIT) cez esm.sh. Grafy sú ručne písané SVG (bez React/Tremor — nekompatibilné s vanilla architektúrou; rozhodnutie zdokumentované). Licencie v `THIRD_PARTY_NOTICES.md`.
