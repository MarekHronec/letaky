# Letákový prehľad — Design specification

Redizajn na seriózny osobný analytický a nákupný nástroj. Nie promo landing page, nie generický AI dashboard, nie letáková estetika.

## 1. Referencie (len štrukturálne, nie vizuálne)

- **IBM Carbon** — informačná hierarchia, husté analytické rozloženia, dátové tabuľky, filtre, kompozícia dashboardu, jasné stavy komponentov.
- **GitHub Primer** — kompaktná aplikačná navigácia, nástrojový vzhľad, zdržanlivé bordery a povrchy, jasné indikátory stavu, formuláre a nastavenia.
- **GOV.UK** — použiteľnosť formulárov, prístupnosť, jasné chybové hlásenia, mobilná použiteľnosť, jednoduchý task-oriented jazyk.

Žiadna paleta, logo, kompozícia ani branding z týchto systémov sa nepreberá. Identita je nová.

## 2. Vizuálny smer

- Zdržanlivá **neutrálna sivá plocha** + **jeden akcent** (indigová modrá) len pre interaktívne/primárne prvky.
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
| **Page header** | Nahradený: preč farebný eyebrow; čistý nadpis + meta riadok (obdobie/aktualizované) |
| **App navigácia** | Reskin: kompaktný sidebar (desktop) / topbar + bottom-nav (mobil), nástrojový vzhľad |
| **Filter obchodov** | Segmentovaná lišta s jemnými indikátormi obchodov (nie farebné taby) |
| **Katalóg akcií** | Nahradený: karta-grid → **hustá dátová tabuľka** (názov · obchod · cena · zľava · verdikt · platnosť · akcia); na mobile štruktúrované riadky |
| **Top príležitosti** | Rebríček ako tabuľkový list s poradím, cenou, zľavou |
| **Špeciálne akcie (promo)** | Kompaktný list, jemný ľavý indikátor obchodu, priorita → top 4 + rozbalenie |
| **Panely/sekcie** | Ploché sekcie oddelené hairline namiesto tieňových kariet |
| **Tlačidlá** | primary (akcent) · secondary (hairline) · ghost/text · okrúhle +/✓ |
| **Odznaky** | verdikt (reálna/podozrivá/neoverená), zľava, status — jemné, nie balónové |
| **KPI pásik** | Prehľadový status ako kompaktný riadok metrík |
| **Detail sheet** | Prepracovaný: sekcie definičných riadkov, graf, porovnanie obchodov |
| **Formuláre** | GOV.UK vzor: jasné labely, chybové hlásenia, dostatočné ciele dotyku (login, vlastná položka, nastavenia) |
| **Legislatíva** | Timeline termínov + list povinností so závažnosťou; filtre chips |
| **Stavy** | Prázdny / načítava / chyba (inline retry) / úspech (toast) — jednotné |

## 5. Prístupnosť
Viditeľný `:focus-visible`, kontrast textu ≥ 4.5:1, ciele dotyku ≥ 40 px na mobile, `aria-label` na ikonových tlačidlách, `role="dialog"`+focus-trap v detaile, redukcia pohybu rešpektovaná.

## 6. Závislosti
Bez build-stepu, natívne ES moduly. Jediná runtime závislosť: `@supabase/supabase-js` (MIT) cez esm.sh. Grafy sú ručne písané SVG (bez React/Tremor — nekompatibilné s vanilla architektúrou; rozhodnutie zdokumentované). Licencie v `THIRD_PARTY_NOTICES.md`.
