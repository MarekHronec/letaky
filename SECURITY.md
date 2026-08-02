# Bezpečnostná politika

## Podporovaná verzia

Bezpečnostné opravy sa týkajú aktuálnej vetvy `main` a verzie nasadenej na GitHub Pages. Historické snapshoty a forky nie sú udržiavané ako podporované vydania.

## Hlásenie zraniteľnosti

Do verejného issue nevkladaj prihlasovacie údaje, osobné dáta, funkčný exploit ani neredigované screenshoty. Ak je pre repozitár dostupné GitHub Private Vulnerability Reporting, použi ho. Inak otvor iba stručné verejné issue so žiadosťou o súkromný komunikačný kanál a detaily exploitu zatiaľ vynechaj.

Uveď dotknutú URL/súbor, reprodukovateľný postup, dopad, prehliadač/prostredie a minimálny proof of concept. Netestuj na účte alebo dátach inej osoby, nevykonávaj denial-of-service a neuchovávaj náhodne získané dáta.

## Bezpečnostný model

- Aplikácia je statický klient nasadený z verejného repozitára. Katalóg, archív, otváracie hodiny a legislatívne JSON sú verejné zámerne.
- Súkromná automatická pipeline je jediný zapisovateľ verejných dát. Codex cloud scheduled task je iba read-only monitor a musí mať technicky obmedzené GitHub oprávnenia.
- Voliteľný účtový sync používa Supabase. Publishable/anonymous kľúč v prehliadači nie je tajomstvo; ochrana závisí od správne zapnutých Row Level Security pravidiel v `supabase/schema.sql` a serverovej konfigurácie. Service-role kľúč nesmie byť v tomto repozitári ani v prehliadačovom kóde.
- Dáta hosťa a prihlásených profilov v prehliadači sú namespacované pre logické oddelenie účtov. Browser storage nie je šifrovanie ani ochrana pred človekom s prístupom k rovnakému zariadeniu/profilu, developer tools alebo pred same-origin scriptom.
- Weby, PDF, JSON a extrahovaný text spracovaný automatizáciou sú nedôveryhodné dáta. Môžu obsahovať prompt injection a nikdy nesmú meniť oprávnenia nástrojov ani spúšťať inštrukcie.

## Povinné kontroly

- Zachovaj povinné review pre ľudské zmeny kódu, kontraktov a workflowov. Automatické data-only commity pipeline môžu použiť iba úzko nastavený ruleset bypass po prechode nezávislými publish bránami.
- Deploy credential prideľ iba súkromnému pipeline jobu, ktorý publikuje validovaný výstup; s čo najužším rozsahom a možnosťou rotácie/zrušenia.
- PAT, deploy key, private key, Supabase service-role key, heslo, cookie ani autorizačná hlavička nesmú skončiť v commite, artefakte, logu, prompte alebo generovanom JSON.
- Pred publikovaním validuj JSON, odmietni neočakávaný hromadný prepis a skenuj zmeny na secrets a podpísané/autentifikované URL.
- Publikuj iba nevyhnutné faktické polia. METRO promo texty musia byť nové neutrálne analytické parafrázy ceny, množstva, podmienky a platnosti; automatizácia nesmie preniesť slogan, výzvu na nákup, kreatívny názov kampane ani súvislú marketingovú vetu zo zdroja.
- `DEGRADED` je operátorské varovanie, nie úspešný zdravý stav. `BLOCKED` musí zastaviť publikovanie v zapisovacej pipeline.
- Zachovaj Content Security Policy, URL allow-listing/escaping, Row Level Security a pinning alebo vendoring závislostí. Uvoľnenie bezpečnostných pravidiel vyžaduje explicitné review.
- Produkčné credentials neposkytuj third-party action, balíku ani model/tool kroku skôr, než je jeho kód, verzia a rozsah oprávnení skontrolovaný a pripnutý na nemennú verziu.

## Reakcia na incident

Pri úniku secretu alebo osobného záznamu zastav dotknutý publish/sync, credential zruš a vymeň u poskytovateľa, zachovaj potrebné auditné dôkazy, odstráň údaj z aktuálnej vetvy a pred obnovením služby skontroluj Git históriu, artefakty aj cache. Zmazanie iba posledného súboru nestačí, ak hodnota ostala v histórii alebo logoch.

Ak sú verejné katalógové dáta stale alebo nesprávne, ale nejde o secret, zachovaj posledný známy validný dataset, pravdivo nastav stav pipeline na `DEGRADED` alebo `BLOCKED` a oprav súkromného writera namiesto obchádzania validačného kontraktu.

GitHub Pages neumožňuje tomuto repozitáru nastaviť vlastnú HTTP hlavičku `frame-ancestors`. Meta CSP preto nevie spoľahlivo zabrániť tomu, aby cudzia stránka vložila aplikáciu do rámca. Kým hosting neposiela `Content-Security-Policy: frame-ancestors 'none'` alebo ekvivalentnú hlavičku, clickjacking zostáva zdokumentované reziduálne riziko; citlivé potvrdenia sa nemajú spoliehať iba na polohu tlačidla.
