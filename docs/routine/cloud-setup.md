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
7. Ak má routine publikovať stránku bez denného ručného merge, v nastavení repozitára povoľ Allow unrestricted branch pushes. Bez toho Cloud Routine môže pushovať iba claude/ vetvy a výsledok bude NEEDS_MERGE.

## 2. Odporúčané cloud environment

Routine potrebuje:

- Python 3 pre scripts/routine/validate_daily.py a migráciu ID,
- Poppler/pdftotext na textové PDF,
- renderer PDF strán,
- voliteľne OCR pre skenované strany,
- Git a sieťový prístup k zdrojom.

Príklad setup scriptu pre Debian/Ubuntu prostredie:

    apt-get update
    apt-get install -y poppler-utils tesseract-ocr tesseract-ocr-slk

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

- Bez unrestricted pushes: finalizer vytvorí claude/routine-{run-id}, pushne vetvu a výsledok označí NEEDS_MERGE. GitHub Pages sa nezmení, kým sa vetva nemergne do main.
- S unrestricted pushes: finalizer po PASS môže pushnúť priamo main a GitHub Pages sa nasadí automaticky.
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
2. Očakávaj, že prvý beh vykoná alebo pripraví product_id migráciu.
3. Skontroluj outcome, QA a diff.
4. Over, že subagenti použili Haiku/Sonnet a daily-finalizer Opus.
5. Až potom povoľ opakovanie a prípadne unrestricted push.
