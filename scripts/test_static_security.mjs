import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';

const [html, sw, sync, vendorBytes, vendor, { SUPABASE }] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8'),
  readFile(new URL('../js/sync.js', import.meta.url), 'utf8'),
  readFile(new URL('../js/vendor/supabase-js.mjs', import.meta.url)),
  import('../js/vendor/supabase-js.mjs'),
  import('../js/config.js'),
]);

assert.equal(SUPABASE.clientUrl, './js/vendor/supabase-js.mjs');
assert.equal(typeof vendor.createClient, 'function', 'same-origin Supabase bundle musí byť importovateľný');
assert.equal(
  createHash('sha256').update(vendorBytes).digest('hex'),
  'f062acafbd5a643abba691ade8ff808cb34d1bcb1a5e102195f4431d2bb7c4e7',
  'vendornutý bundle sa nesmie zmeniť bez vedomého supply-chain review',
);
assert.match(sync, /new URL\(SUPABASE\.clientUrl, document\.baseURI\)/);
assert.match(html, /<meta name="referrer" content="no-referrer">/);
assert.match(html, /script-src 'self';/);
assert.match(html, /connect-src 'self' https:\/\/ihtwxmxmkwigbbkcgubs\.supabase\.co/);
assert.match(html, /wss:\/\/ihtwxmxmkwigbbkcgubs\.supabase\.co/);
assert.doesNotMatch(html, /esm\.sh/, 'CSP nesmie povoľovať runtime JavaScript CDN');
assert.doesNotMatch(html, /\*\.supabase\.co/, 'CSP má povoliť iba konkrétny Supabase projekt');
assert.match(html, /img-src 'self' data:;/);
assert.doesNotMatch(html, /kaufland\.media\.schwarz|media\.kaufland\.com/);
assert.doesNotMatch(html, /img-src[^;]*\shttps:\s/, 'CSP nesmie povoliť obrázky z ľubovoľného HTTPS hosta');
assert.match(html, /frame-src 'none'/);
assert.match(html, /id="archive-availability"/);
assert.match(html, /id="data-health"/);
assert.match(html, /href="PRIVACY\.md"/);

assert.match(sw, /const CACHE_PREFIX = "letaky-app-"/);
assert.match(sw, /key\.startsWith\(CACHE_PREFIX\) && key !== CACHE/);
assert.match(sw, /url\.pathname\.startsWith\(APP_SCOPE\.pathname\)/);
assert.match(sw, /"\.\/js\/profile-storage\.js"/);
assert.match(sw, /"\.\/js\/vendor\/supabase-js\.mjs"/);

const shellBlock = sw.match(/const SHELL = \[([\s\S]*?)\];/)?.[1] || '';
const shellFiles = [...shellBlock.matchAll(/"\.\/([^"\n]+)"/g)].map(match => match[1]);
assert.ok(shellFiles.length > 10, 'test musí nájsť app-shell manifest');
await Promise.all(shellFiles.map(file => access(new URL(`../${file}`, import.meta.url))));

console.log('static security boundaries: OK');
