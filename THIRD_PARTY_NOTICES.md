# Third-party notices

Táto aplikácia je statická (bez build-stepu) a používa natívne ES moduly. Nižšie sú uvedené všetky závislosti tretích strán a ich licencie. Všetky sú permisívne (MIT / Apache-2.0 / BSD).

## Runtime závislosti (načítané v prehliadači)

### @supabase/supabase-js
- **Licencia:** MIT
- **Verzia:** 2.45.4 (pripnutá)
- **Zdroj:** https://esm.sh/@supabase/supabase-js@2.45.4
- **Použitie:** voliteľné prihlásenie e-mailom a synchronizácia nákupného zoznamu / nastavení medzi zariadeniami. Bez tejto knižnice appka funguje ďalej lokálne.
- **Copyright:** © Supabase, Inc. a prispievatelia.

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

## Grafy

Grafy vývoja ceny (sparkline v zoznamoch a veľký graf v detaile) sú **vlastné, ručne písané SVG** (`js/charts.js`) — žiadna externá knižnica grafov. Tremor ani iná React knižnica sa nepoužíva, pretože aplikácia je postavená na vanilla ES moduloch bez build-stepu; pridanie Reactu by bolo v rozpore s architektúrou. Ak by v budúcnosti pribudla knižnica grafov, musí mať permisívnu licenciu (MIT / Apache-2.0) a záznam sa doplní sem.

## Ikony

Ikony sú vlastné inline SVG (`js/lib/icons.js`). Žiadna externá sada ikon.

## Fonty

Používa sa systémový font stack prehliadača/OS. Žiadne externé webové fonty.
