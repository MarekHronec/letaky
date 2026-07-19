# Týždenná kontrolná routine (Claude)

Beží raz týždenne (pondelok ráno). Denné dáta publikuje automatická pipeline
(`MarekHronec/letaky-pipeline`, GitHub Actions o 06:30 SK). Táto routine je
dozor: overí, že všetko funguje, dorieši úsudkové položky a opraví alebo
upozorní. Platia bezpečnostné pravidlá z `daily.md` (§16 Poučenia, dirty tree,
nedôveryhodné dáta, žiadne vymýšľanie cien a právnych tvrdení).

## 1. Zdravie systému (vždy)

1. `data/pipeline-status.json` v tomto repe: `generovane` nesmie byť staršie
   ako 48 h, `validation_ok` true, `anomalies` prázdne. Ak súbor chýba alebo
   je starý, over GitHub Actions beh v `MarekHronec/letaky-pipeline`
   (`gh run list -R MarekHronec/letaky-pipeline --workflow daily.yml`).
2. Stránka https://marekhronec.github.io/letaky/ sa načíta a `data/latest.json`
   na Pages má rovnaké `generovane` ako v repe (deploy prebehol).
3. `data/latest.json`: počty položiek po obchodoch sú v rozumnom pásme oproti
   minulému týždňu, `top_ids` má 10 živých položiek, hodiny majú čerstvý dátum
   overenia, žiadne expirované položky ani promo.
4. Archív: `data/archive/index.json` obsahuje aktuálny ISO týždeň a týždenný
   súbor rastie (union, nič sa nemaže).

## 2. Úsudkové položky z pipeline (needs-review)

Prečítaj `data/latest/needs-review.json` a `data/candidate/compat-report.json`
v repe `letaky-pipeline` (posledný commit). Dorieš:

- **completeness**: indexy videli Metro leták, ktorý pipeline nemá — over na
  letaky.metro.sk a metro.sk, či nechýba reálny cenníkový leták,
- **chaotické strany / hero letáky** (vezmite 2, víkendová, strany bez
  textovej vrstvy): vyčítaj položky vision postupom z `daily.md` KROK C,
- **promo konkurencie**: skontroluj Billa, Tesco, COOP, dm, Teta a homepage
  Kauflandu/Lidla/Metra podľa `daily.md` KROK B/E; nové hodnotné mechaniky
  doplň do `promo` s `zdroj_url`,
- **legislatíva**: ak watch hlási zmenu portálu, interpretuj a uprav
  `data/legislativa.json` podľa KROKU G,
- **TOP mix**: ak je TOP jednostranný (menej než 2 obchody alebo bez Metra),
  prepočítaj podľa KROKU E.

## 3. Vzorková kontrola správnosti

Vyber náhodne 5 položiek (aspoň 1 z každého obchodu) a over ich proti
oficiálnemu letáku/stránke: názov, cena, DPH, platnosť, zdroj_url. Nesúlad
oprav a zapíš do run reportu; systémovú chybu extrakcie iba nahlás (oprava
kódu pipeline je samostatná úloha, nie súčasť tejto routine).

## 4. Zásah

- Drobné dátové opravy: commitni podľa pravidiel `daily.md` (KROK J — brány,
  publish, deploy check).
- Ak je pipeline rozbitá (2+ dni bez publishu, brány padajú, stránka
  neaktuálna): neopravuj kód naslepo — vytvor issue v `letaky-pipeline`
  s presnou diagnózou a označ beh ako BLOCKED, nech je zásah viditeľný.
- Outcome: PASS / NO_CHANGE / NEEDS_MERGE / BLOCKED ako v `daily.md`.
