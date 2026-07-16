# Nasadenie dennej Claude Cloud Routine

Cloud Routine pri každom behu vytvorí čerstvý klon defaultnej vetvy. Vidí preto iba commitnuté súbory. Lokálny gitignore obsah ani súbory mimo repozitára nie sú dostupné.

## 1. Jednorazové nastavenie v Claude Code on the web

1. Otvor claude.ai/code/routines a vytvor Remote routine.
2. Pripoj GitHub repozitár MarekHronec/letaky a default branch main.
3. Nastav denný trigger približne na 06:30 Europe/Bratislava.
4. Do promptu vlož:

       Execute docs/routine/daily.md as the sole workflow source.
       Use the committed project subagents in .claude/agents.
       Store temporary artifacts only in .routine-work.
       Wait for release-qa, then invoke daily-finalizer exactly once.
       Return only an explicit PASS, NO_CHANGE, NEEDS_MERGE or BLOCKED outcome.

5. Odober všetky nepotrebné konektory. Routine nepotrebuje Gmail ani iný write konektor; e-mail iba draftuje do reportu.
6. Povoľ sieť aspoň pre GitHub/GitHub Pages a povinné first-party domény obchodov a štátnych portálov.
7. Ponechaj predvolený bezpečný režim: routine pushuje `claude/routine-*` vetvu a výsledok `NEEDS_MERGE` sa najprv skontroluje. Priamy publish do `main` zapni až vedome po stabilných testovacích behoch; nie je potrebný na samotné fungovanie routine.

## 2. Odporúčané cloud environment

Routine potrebuje:

- Python 3 pre scripts/routine/validate_daily.py a recovery audit migrácie ID,
- `jsonschema` pre povinnú Draft 2020-12 schema validáciu,
- Poppler/pdftotext na textové PDF,
- renderer PDF strán,
- voliteľne OCR pre skenované strany,
- Git a sieťový prístup k zdrojom.

Príklad setup scriptu pre Debian/Ubuntu prostredie:

    apt-get update
    apt-get install -y poppler-utils tesseract-ocr tesseract-ocr-slk python3-jsonschema

Ak environment nepovoľuje apt alebo nástroje už obsahuje, setup uprav podľa jeho obrazu. Výsledok setupu Cloud Routine cacheuje.

## 3. Sieťové domény

Minimálny zoznam:

- github.com, raw.githubusercontent.com, marekhronec.github.io,
- kaufland.sk a predajne.kaufland.sk,
- lidl.sk,
- metro.sk,
- storage.googleapis.com iba pre konkrétne zdrojové strany letákov,
- vlada.gov.sk,
- slov-lex.sk,
- financnasprava.sk,
- soi.sk,
- svps.sk, uvzsr.sk,
- economy.gov.sk,
- slovenskozalohuje.sk, minzp.sk,
- socpoist.sk, slovensko.sk.

Agregátory povoľ iba vtedy, keď sú potrebné ako index URL strán. Nie sú autoritatívnym zdrojom položiek.

## 4. Vetvy a publish

- Predvolený režim: finalizer vytvorí `claude/routine-{run-id}`, pushne vetvu a výsledok označí `NEEDS_MERGE`. GitHub Pages sa zmení až po review a merge do `main`.
- Voliteľný direct-publish režim: iba po explicitnom povolení môže finalizer po PASS pushnúť priamo `main`; rovnaké validačné, secret-scan a deploy brány zostávajú povinné.
- BLOCKED nikdy nič nepublikuje.
- NO_CHANGE nevytvára commit.

## 5. Perzistencia medzi cloudovými behmi

.routine-work je iba dočasný priestor jedného behu a po skončení VM sa stratí.

Stav potrebný pre ďalší beh sa zapisuje do:

- data/routine-state.json — posledný úspešný beh, zdrojové fingerprinty a quality baseline,
- produkčných archive JSON — historické pozorovania cien,
- Git histórie — audit zmien a migrácií.

Do repozitára ani environment premenných nedávaj osobné heslá, Supabase service role key alebo routine API bearer token.

## 6. Prvý test

Pred zapnutím denného triggera:

1. Spusti Run now.
2. Očakávaj, že routine načíta stav dokončenej `product_id` migrácie a iba overí regresnú bránu; migráciu už znovu nezapisuje.
3. Skontroluj outcome, QA a diff.
4. Over, že subagenti použili Haiku/Sonnet a daily-finalizer Opus.
5. Až potom povoľ opakovanie; direct-publish zapni iba ak vedome akceptuješ publish bez review.

## 7. Čo musí byť v repozitári

Cloudový beh vidí iba commitnuté súbory. Potrebuje `docs/routine/`, `scripts/routine/`, `data/routine-state.json`, `.claude/CLAUDE.md` a `.claude/agents/`. Samostatný `.agents` priečinok tento workflow nepoužíva. `.routine-work` ostáva zámerne ignorovaný, pretože je to dočasný scratch jedného behu.
