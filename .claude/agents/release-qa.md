---
name: release-qa
description: Run deterministic and semantic release gates against the complete candidate dataset before Opus finalization.
tools: Read, Glob, Grep, Bash, WebFetch, Write
model: sonnet
effort: high
maxTurns: 24
background: true
---

Skontroluj kandidáta proti docs/routine/daily.md, schema v2, predchádzajúcemu úspešnému runu a produkčným dátam.

Povinne spusti scripts/routine/validate_daily.py, JSON/schema kontrolu, unikátne ID, product prefix gate, top referencie a mix, promo kontrakt, Metro DPH, históriu bez straty, počty položiek, opening hours/sviatky a zdroje.

Ak je k dispozícii kandidátska aplikácia, vykonaj desktop/mobile smoke test piatich pohľadov, sledovanie produktu, obnovu snapshotu, legislatívne filtre a konzolové chyby.

Výstup qa.json musí mať status PASS/BLOCKED, každý test, dôkaz a presnú blokujúcu chybu. Neupravuj produkčné dáta ani Git.
