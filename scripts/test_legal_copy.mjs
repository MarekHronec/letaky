import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, shared, deals, detail, overview, trackedAnalytics, trackedView, legislationView, schema, latestText, archiveIndexText, legislationText, privacy] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../js/views/shared.js', import.meta.url), 'utf8'),
  readFile(new URL('../js/views/deals.js', import.meta.url), 'utf8'),
  readFile(new URL('../js/detail.js', import.meta.url), 'utf8'),
  readFile(new URL('../js/views/overview.js', import.meta.url), 'utf8'),
  readFile(new URL('../js/tracked-analytics.js', import.meta.url), 'utf8'),
  readFile(new URL('../js/views/tracked.js', import.meta.url), 'utf8'),
  readFile(new URL('../js/views/legislativa.js', import.meta.url), 'utf8'),
  readFile(new URL('../data/schema-v2.json', import.meta.url), 'utf8'),
  readFile(new URL('../data/latest.json', import.meta.url), 'utf8'),
  readFile(new URL('../data/archive/index.json', import.meta.url), 'utf8'),
  readFile(new URL('../data/legislativa.json', import.meta.url), 'utf8'),
  readFile(new URL('../PRIVACY.md', import.meta.url), 'utf8'),
]);
const latest = JSON.parse(latestText);
const archiveWeeks = JSON.parse(archiveIndexText);
const archives = await Promise.all(archiveWeeks.map(async (week) => (
  JSON.parse(await readFile(new URL(`../data/archive/${encodeURIComponent(week)}.json`, import.meta.url), 'utf8'))
)));
const legislation = JSON.parse(legislationText);

assert.match(html, /Nezávislý informačný nástroj na vlastné plánovanie/);
assert.match(html, /nenahrádza oficiálne letáky obchodníkov/);
assert.match(
  html,
  /<p class="site-disclaimer-lead">[\s\S]*Nesprostredkúva predaj a nenahrádza oficiálne letáky obchodníkov\.<\/p>\s*<details>/,
);
assert.match(html, /nie sú garanciou úspory, právnym posúdením zľavy ani spotrebiteľským overením/i);
assert.match(html, /môže byť neúplná, neaktuálna alebo nepresná/i);
assert.match(detail, /Overiť v oficiálnom letáku/);
assert.match(detail, /target="_blank" rel="noopener noreferrer"/);
assert.match(detail, /Nie je to zákonná predchádzajúca cena konkrétneho obchodníka/);
assert.match(detail, /Najnižšia z aktuálne porovnaných ponúk/);

const publicLabels = [shared, deals, detail, overview, trackedAnalytics, trackedView].join('\n');
assert.doesNotMatch(publicLabels, /Reálne výhodné|Reálne výhodná|Podozrivá zľava|Reálna zľava/);
assert.match(publicLabels, /Priaznivá podľa dostupnej histórie/);
assert.match(publicLabels, /Letáková zľava nepodporená históriou/);
assert.match(publicLabels, /Nedostatok cenovej histórie/);
assert.match(publicLabels, /Hodnotenie je podporené cenovou históriou/);
assert.match(shared, /ref\. aplikácie/);
assert.match(shared, /leták/);
assert.match(deals, /Najväčšia zľava uvedená v letáku/);
assert.doesNotMatch(publicLabels, /Model porovnáva|Ponuka je overená|Ponuka nie je overená|Najlepšia cena|Overená priaznivá/);
assert.doesNotMatch(publicLabels, /Najväčšia zľava(?! uvedená v letáku)/);
assert.match(trackedView, /Deterministický výpočet/);
assert.match(legislationView, /Naposledy právne skontrolované/);
assert.match(legislationView, /Oficiálny zdroj sa zmenil/);
assert.match(legislation.upozornenie, /nemožno sa naň spoliehať ako na znenie práva/i);
assert.match(legislation.upozornenie, /aktuálnu časovú verziu/i);
assert.match(privacy, /výlučne osobnej alebo domácej činnosti/);
assert.match(privacy, /čl\. 2 ods\. 2 písm\. c\) GDPR/);
assert.match(privacy, /nezverejňujú identifikačné ani kontaktné údaje prevádzkovateľa/);
assert.match(privacy, /výlučne vlastníkovi aplikácie a jeho bratovi/);

const visualKeys = ['obrazok_url', 'obrázok_url', 'image_url', 'imageUrl', 'foto_url'];
for (const key of visualKeys) assert.doesNotMatch(schema, new RegExp(key, 'i'));
for (const dataset of [latest, ...archives]) {
  for (const promo of dataset.promo || []) {
    if (String(promo.obchod).toLowerCase() === 'metro') {
      assert.doesNotMatch(
        promo.text || '',
        /\b(?:zadarmo|odmena|vezmite|získajte|získate|navyše|ušetrite|super|VIP)\b|akciov[áa]\s+cena|→|!/i,
        `${promo.id || 'METRO promo'} musí byť neutrálna analytická parafráza`,
      );
    }
  }
  for (const store of dataset.obchody || []) {
    for (const offer of store.polozky || []) {
      for (const key of visualKeys) {
        assert.equal(Object.hasOwn(offer, key), false, `${offer.id || 'ponuka'} nesmie obsahovať vizuálny asset`);
        for (const point of offer.historia_cien || []) {
          assert.equal(Object.hasOwn(point, key), false, `${offer.id || 'ponuka'}: história nesmie obsahovať vizuálny asset`);
        }
      }
      assert.match(offer.zdroj_url || '', /^https:\/\//, `${offer.id || 'ponuka'} potrebuje zdroj`);
      assert.doesNotMatch(
        offer.dovod_verdiktu || '',
        /reálnu zľavu|umelú zľavu|Neoverená zľava/i,
        `${offer.id || 'ponuka'} používa právne zavádzajúce hodnotenie`,
      );
    }
  }
}

console.log('legal copy and source boundaries: OK');
