# Ochrana súkromia

Posledná aktualizácia: 26. júla 2026

Letákový prehľad je aplikácia pre plánovanie nákupov a verejné maloobchodné informácie. Neobsahuje reklamnú ani behaviorálnu analytiku a nepridáva cookies tretích strán. Hosting, voliteľné prihlásenie a odkazy na externé zdroje však používajú služby opísané nižšie.

## Výlučne osobné a rodinné používanie

Účtová synchronizácia je určená výlučne vlastníkovi aplikácie a jeho bratovi na súkromné rodinné plánovanie nákupov. Nie je spojená s podnikaním, zamestnaním, reklamou, platenou službou ani inou profesijnou alebo komerčnou činnosťou. Verejná registrácia nie je dostupná a osobné účtové dáta sa nezverejňujú.

Za týchto okolností ide o spracúvanie fyzickou osobou v rámci výlučne osobnej alebo domácej činnosti podľa [čl. 2 ods. 2 písm. c) GDPR a odôvodnenia 18](https://eur-lex.europa.eu/legal-content/SK/TXT/?uri=CELEX:32016R0679), na ktoré sa GDPR nevzťahuje. Preto sa pre túto uzavretú rodinnú synchronizáciu nezverejňujú identifikačné ani kontaktné údaje prevádzkovateľa.

Ak by sa účty niekedy sprístupnili ďalším ľuďom, verejnosti alebo na profesijný či komerčný účel, toto posúdenie prestáva byť postačujúce. Pred takým rozšírením sa musí vykonať nové posúdenie ochrany osobných údajov a podľa výsledku doplniť identita a kontakt prevádzkovateľa, právne základy, retenčné lehoty, práva používateľov a informácie o prenosoch.

## Verejné informácie

Katalógy ponúk, cenová história, otváracie hodiny vybraných predajní a legislatívne súhrny v `data/` sú zámerne verejným obsahom aplikácie. Vybrané pobočky (METRO Devínska Nová Ves, Kaufland Bratislava – Devínska Nová Ves a Lidl Bratislava, Eisnerova) sú verejná konfigurácia, nie zozbieraná poloha používateľa. Aplikácia nežiada prístup ku GPS/geolokácii.

## Údaje uložené pre používateľa

Podľa použitých funkcií môže aplikácia ukladať:

- aktívne položky nákupného zoznamu a deletion tombstones,
- uložené zoznamy/šablóny,
- explicitne potvrdené záznamy nákupov,
- sledované produkty, stav zásoby a produktové preferencie,
- nastavenia zobrazenia a stavy legislatívnych položiek,
- autentifikačné/session údaje potrebné pre Supabase pri použití účtu.

Odporúčanie pre sledovaný produkt sa počíta deterministicky z katalógových dát a vlastných vstupov/potvrdených nákupov používateľa. Nie je to trénovaný ML profil a odvodené odporúčanie sa prepočítava namiesto ukladania do samostatného tréningového datasetu.

## Hranice rodinného spracúvania

- Účtový e-mail, session a synchronizovaný obsah sa používajú iba na synchronizáciu medzi zariadeniami dvoch členov rodiny.
- Údaje sa nesmú použiť na reklamu, behaviorálne profilovanie, predaj údajov ani sledovanie ďalších osôb.
- Odporúčania nemajú právne ani obdobne významné účinky. Ide o deterministický výpočet pre vlastné nákupné rozhodnutie, nie trénovaný ML profil.

Výnimka pre osobnú alebo domácu činnosť sa nevzťahuje na GitHub, Supabase ani ďalších poskytovateľov infraštruktúry; tí plnia vlastné povinnosti podľa svojich pravidiel ochrany údajov.

## Režim hosťa a voliteľný sync

Bez účtu ostávajú osobné nákupné dáta v origin storage tohto prehliadača. Vyčistenie dát webu, reset profilu prehliadača alebo odinštalovanie PWA ich môže odstrániť; dôležité zoznamy si predtým exportuj.

Pri voliteľnom účte vytvorenom správcom spracuje Supabase Authentication prihlasovací e-mail a session a aplikácia synchronizuje podporované dáta do tabuľky `user_data`. Row Level Security má obmedziť každý záznam na autentifikovaný `user_id`; verejné pravidlá sú v `supabase/schema.sql`. Verejná registrácia je vypnutá konfiguráciou projektu, nie iba prehliadačovým kódom.

Odhlásenie oddelí prihlásený profil od dát hosťa, ale samo osebe nemaže lokálne ani cloudové dáta. Na zdieľanom profile prehliadača môže človek s prístupom k zariadeniu alebo developer tools stále čítať nešifrované úložisko webu.

## Zdieľanie

„Zdieľať link“ vloží snapshot nákupného zoznamu do URL fragmentu (`#share=…`). Prehliadač fragment pri bežnej HTTP požiadavke neposiela serveru stránky, ale ktokoľvek s kompletným linkom si snapshot môže prečítať. Link môžu uchovať aj komunikačné aplikácie, história prehliadača, screenshoty, rozšírenia alebo skopírované logy. Do zdieľaného zoznamu nevkladaj secrets ani citlivé osobné údaje.

## Hlasové zadávanie

Hlasové zadávanie sa aktivuje iba po stlačení tlačidla mikrofónu a po povolení prístupu v prehliadači. Používa Web Speech API poskytované prehliadačom alebo operačným systémom. Podľa konkrétnej implementácie môže rozpoznanie prebehnúť lokálne alebo cez službu výrobcu prehliadača/OS; Letákový prehľad zvuk sám neprijíma, neukladá ani neposiela do Supabase. Ak tento spôsob spracovania nechceš použiť, povolenie mikrofónu neudeľ a položku napíš ručne.

## Príjemcovia, poskytovatelia a prenosy

- [GitHub Pages](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) servuje statickú aplikáciu a podľa vlastných podmienok môže spracovať bežné request metadata, napríklad IP adresu, čas, požadovanú cestu a informácie o prehliadači. Prevádzkovateľ aplikácie nemá v klientskom kóde vlastnú návštevnostnú analytiku.
- [Supabase](https://supabase.com/privacy) poskytuje voliteľnú autentifikáciu a cloudovú synchronizáciu a spracúva účet/session a synchronizovaný obsah ako poskytovateľ infraštruktúry. Jeho aktuálne zmluvné podmienky ochrany údajov opisuje [Supabase DPA](https://supabase.com/legal/dpa).
- Po otvorení oficiálneho odkazu obchodníka alebo štátneho zdroja dostane cieľ bežnú browser request a uplatní vlastné pravidlá súkromia.

GitHub, Supabase alebo ich subdodávatelia môžu podľa svojich podmienok spracúvať údaje aj mimo Európskeho hospodárskeho priestoru. Pred akýmkoľvek rozšírením účtov mimo uvedených dvoch členov rodiny treba zdokumentovať zvolený región Supabase, zmluvné nastavenia, zoznam subdodávateľov a použitý mechanizmus prípadného medzinárodného prenosu.

Aplikácia sama nepridáva analytické udalosti tretích strán. Runtime závislosti musia ostať pripnuté alebo vendornuté podľa dokumentácie repozitára; ich sieťové správanie treba znovu posúdiť pri každej zmene architektúry.

## Uchovávanie a vymazanie

Lokálne dáta ostávajú, kým ich používateľ neodstráni dostupnými ovládacími prvkami alebo nevyčistí úložisko webu. Synchronizačné tombstones sa uchovávajú obmedzený čas (aktuálne 30 dní), aby sa vymazaná položka nevrátila z iného zariadenia. Potvrdené nákupy sú v aktuálnom používateľskom rozhraní append-only, aby ostala zachovaná analytická história.

Cloudový obsah ostáva po dobu používania rodinného účtu. Na priamu požiadavku druhého používateľa vlastník odstráni riadok `user_data` a príslušný autentifikačný účet bez zbytočného odkladu. Zálohy a technické logy poskytovateľov sa dočisťujú podľa ich vlastných retenčných cyklov. Aktuálna aplikácia nemá samoobslužné zmazanie účtu; obaja používatelia sa poznajú a komunikujú priamo.

## Praktická kontrola údajov

Druhý rodinný používateľ môže priamo požiadať o zobrazenie, opravu, export alebo vymazanie svojich cloudových údajov. Vymazanie údajov potrebných pre účet znemožní ďalšiu synchronizáciu. Toto je praktické rodinné pravidlo; nejde o verejnú službu ani o formálny proces vybavovania žiadostí podľa GDPR.

## Bezpečnosť a zmeny

Browser storage je praktické úložisko, nie bezpečný trezor. Do textu nákupných položiek nevkladaj heslá, údaje platobnej karty, zdravotné údaje ani iné secrets. Bezpečnostný problém nahlás podľa `SECURITY.md` a osobné údaje nevkladaj do verejného issue.

Tento dokument treba aktualizovať pri každej zmene okruhu používateľov, účelu, úložnej schémy, synchronizačného poskytovateľa, analytiky, hostingu, prenosov alebo zdieľania.

Účty sú momentálne určené iba vlastníkovi aplikácie a jeho bratovi. Pred pridaním ďalšieho používateľa treba znovu posúdiť, či používanie zostáva výlučne osobnou alebo domácou činnosťou; pred verejným, profesijným alebo komerčným použitím je potrebná úplná dokumentovaná GDPR kontrola.
