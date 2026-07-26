# Aktualizácia vendornutého Supabase klienta

`js/vendor/supabase-js.mjs` je runtime kód aplikácie. Nesmie sa meniť automatickým Dependabot PR ani kopírovaním náhodného CDN výstupu.

## Trust boundary

- Zdrojom je iba oficiálny npm balík `@supabase/supabase-js`.
- Verzia klienta aj bundlera musí byť presná, bez `^`, `~`, `latest` alebo Git URL.
- Pred inštaláciou skontroluj npm provenance/Sigstore attestáciu, upstream release notes, bezpečnostné advisories a tarball integrity.
- Build rob v novom dočasnom priečinku mimo repozitára s prázdnym npm cache/configom, `--ignore-scripts` a bez secrets.
- Do repozitára sa kopíruje iba výsledný ESM bundle; `node_modules`, cache, tokeny a npm konfigurácia sem nepatria.

## Aktuálny snapshot

| Položka | Hodnota |
|---|---|
| `@supabase/supabase-js` | `2.110.7` |
| esbuild | `0.25.12` |
| npm integrita hlavného balíka | `sha512-AnfO3A230Shy6RMO7cya3Wl1OcXnABJrzH8vP+fY7/RFjhzcchB7DjKkkTIAntlwekD+GkSFzEvt2tC+D4Fp8w==` |
| SHA-256 výsledného bundle | `f062acafbd5a643abba691ade8ff808cb34d1bcb1a5e102195f4431d2bb7c4e7` |

Úplný zoznam komponentov a licencií je v `THIRD_PARTY_NOTICES.md`.

## Povinný update postup

1. V dočasnom priečinku vytvor minimálny `package.json` s presnými verziami klienta a esbuild.
2. Vygeneruj a manuálne skontroluj lockfile. Over, že všetky zdroje smerujú na npm registry cez HTTPS, verzie sú nemenné a strom neobsahuje neočakávaný balík alebo install script.
3. Over npm provenance a integritu stiahnutých tarballov. Pri chýbajúcej alebo nezhodnej atestácii update zastav.
4. Zostav browser ESM bundle z oficiálneho entrypointu s esbuild, `platform=browser`, `format=esm`, bundlingom a minifikáciou.
5. Skontroluj diff bundlu, sieťové endpointy, dynamic importy, licencie a zmenu veľkosti. Aktualizuj `THIRD_PARTY_NOTICES.md`, tento snapshot a očakávaný hash v `scripts/test_static_security.mjs`.
6. Spusti celý validačný workflow. Zmena je prípustná iba cez review kódu; automatický data-only writer ju nesmie publikovať.

Tento dokument je update runbook, nie tvrdenie, že ľubovoľný budúci npm strom vytvorí rovnaký byte-for-byte výstup. Reprodukovateľnosť konkrétnej aktualizácie musí dokazovať skontrolovaný lockfile a výsledný hash v tom istom review.
