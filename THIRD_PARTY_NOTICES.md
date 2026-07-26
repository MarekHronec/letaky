# Third-party notices

Táto aplikácia je statická (bez build-stepu) a používa natívne ES moduly. Nižšie sú uvedené runtime závislosti tretích strán zabalené do vendornutého súboru. Všetky uvedené licencie sú permisívne (MIT alebo 0BSD).

## Runtime závislosti (uložené pri aplikácii)

### Supabase browser bundle
- **Licencia:** MIT
- **Verzia:** 2.110.7 (presne pripnutá)
- **Lokálna kópia:** `js/vendor/supabase-js.mjs` (same-origin, bez runtime CDN importu)
- **Upstream:** https://github.com/supabase/supabase-js/tree/v2.110.7
- **npm integrita:** `sha512-AnfO3A230Shy6RMO7cya3Wl1OcXnABJrzH8vP+fY7/RFjhzcchB7DjKkkTIAntlwekD+GkSFzEvt2tC+D4Fp8w==`
- **SHA-256 bundle:** `f062acafbd5a643abba691ade8ff808cb34d1bcb1a5e102195f4431d2bb7c4e7`
- **Zostavenie:** browser ESM bundle cez esbuild 0.25.12.
- **Použitie:** voliteľné prihlásenie e-mailom a synchronizácia nákupného zoznamu / nastavení medzi zariadeniami. Bez tejto knižnice appka funguje ďalej lokálne.
- **Obsah bundle:** `@supabase/supabase-js`, `@supabase/auth-js`, `@supabase/functions-js`, `@supabase/postgrest-js`, `@supabase/realtime-js` a `@supabase/storage-js` vo verzii 2.110.7; `@supabase/phoenix` 0.4.5; `iceberg-js` 0.8.1; `tslib` 2.8.1.
- **Licencie a zachované oznámenia:** Supabase balíky sú MIT, `Copyright (c) 2020 Supabase`; časť Phoenix klienta je MIT, `Copyright (c) 2014 Chris McCord`; `iceberg-js` 0.8.1 deklaruje MIT a autora `mandarini` v publikovaných npm metadátach; `tslib` je 0BSD, `Copyright (c) Microsoft Corporation`.
- **Kontrola aktualizácie:** presný hash blokuje `scripts/test_static_security.mjs`; postup vedomej aktualizácie a kontroly pôvodu je v `docs/vendor-supabase.md`.

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

`tslib` 2.8.1 používa túto 0BSD licenciu:

```
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
```

## Grafy

Grafy vývoja ceny (sparkline v zoznamoch a veľký graf v detaile) sú **vlastné, ručne písané SVG** (`js/charts.js`) — žiadna externá knižnica grafov. Tremor ani iná React knižnica sa nepoužíva, pretože aplikácia je postavená na vanilla ES moduloch bez build-stepu; pridanie Reactu by bolo v rozpore s architektúrou. Ak by v budúcnosti pribudla knižnica grafov, musí mať permisívnu licenciu (MIT / Apache-2.0) a záznam sa doplní sem.

## Ikony

Ikony sú vlastné inline SVG (`js/lib/icons.js`). Žiadna externá sada ikon.

## Fonty

Používa sa systémový font stack prehliadača/OS. Žiadne externé webové fonty.
