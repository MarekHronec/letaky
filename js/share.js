// Prenos zoznamu medzi zariadeniami: zdieľací link (#share= fragment sa
// neposiela serveru), JSON export/import a hlasové zadávanie položky.

import { SHARE_URL_MAX, SHARE_HASH_MAX, SHARE_ITEMS_MAX, VOICE_LANG } from './config.js';
import { state } from './state.js';
import * as shopping from './shopping.js';
import { showToast } from './lib/toast.js';
import { $ } from './lib/util.js';

// ---------------------------------------------------------------------------
// Zdieľací link (base64url v URL fragmente)
// ---------------------------------------------------------------------------

function encodeSharePayload(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeSharePayload(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const field = document.createElement('textarea');
  field.value = text;
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  document.execCommand('copy');
  field.remove();
}

export async function shareList() {
  try {
    const payload = encodeSharePayload({ v: 2, items: shopping.items });
    const url = location.href.split('#')[0] + '#share=' + payload;
    if (url.length > SHARE_URL_MAX) {
      showToast('Zoznam je na link príliš dlhý – použi JSON export');
      return;
    }
    if (navigator.share) {
      await navigator.share({
        title: 'Môj nákupný zoznam',
        text: 'Otvor link a načítaj môj nákupný zoznam.',
        url,
      });
    } else {
      await copyText(url);
      showToast('Link na zoznam je skopírovaný');
    }
  } catch (e) {
    if (e?.name !== 'AbortError') showToast('Link sa nepodarilo vytvoriť');
  }
}

// Spracuje #share= fragment z URL. Vracia true, ak fragment existoval
// (volajúci má potom prekresliť UI); zoznam nahradí len po potvrdení.
export function consumeSharedLink() {
  if (!location.hash.startsWith('#share=')) return false;
  state.view = 'list';
  const cleanHash = location.pathname + location.search + '#list';
  try {
    const value = location.hash.slice(7);
    if (value.length > SHARE_HASH_MAX) throw new Error();
    const parsed = decodeSharePayload(value);
    const items = Array.isArray(parsed) ? parsed : parsed.items;
    if (!Array.isArray(items) || items.length > SHARE_ITEMS_MAX) throw new Error();
    const clean = items.map(shopping.sanitizeListItem).filter(Boolean);
    if (!clean.length && items.length) throw new Error();
    if (shopping.items.length && !confirm('V tomto zariadení už máš nákupný zoznam. Chceš ho nahradiť zoznamom z linku?')) {
      history.replaceState(null, '', cleanHash);
      return true;
    }
    shopping.replaceAll(clean);
    history.replaceState(null, '', cleanHash);
    showToast('Zoznam z linku je načítaný');
  } catch {
    history.replaceState(null, '', cleanHash);
    showToast('Link neobsahuje platný nákupný zoznam');
  }
  return true;
}

// ---------------------------------------------------------------------------
// JSON export / import (záloha a riešenie pre veľmi dlhé zoznamy)
// ---------------------------------------------------------------------------

export function exportList() {
  const payload = { version: 3, exportedAt: new Date().toISOString(), items: shopping.items };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nakupny-zoznam-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Zoznam bol exportovaný');
}

// Vracia true pri úspechu (volajúci prekreslí UI).
export async function importList(file) {
  try {
    const parsed = JSON.parse(await file.text());
    const items = Array.isArray(parsed) ? parsed : parsed.items;
    if (!Array.isArray(items)) throw new Error();
    const clean = items.map(shopping.sanitizeListItem).filter(Boolean);
    if (!clean.length && items.length) throw new Error();
    shopping.replaceAll(clean);
    showToast('Zoznam bol importovaný');
    return true;
  } catch {
    showToast('Tento súbor nie je platný zoznam');
    return false;
  }
}

// ---------------------------------------------------------------------------
// Hlasové zadávanie (Web Speech API, sk-SK, s fallbackom na písanie)
// ---------------------------------------------------------------------------

let recognition = null;

export function startVoice(btn) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    showToast('Tento prehliadač nepodporuje hlasové zadávanie');
    return;
  }
  if (recognition) {
    // druhé ťuknutie počas počúvania nahrávanie ukončí
    try {
      recognition.stop();
    } catch {
      // už bolo zastavené
    }
    return;
  }
  const input = $('#manual-name');
  if (!input) return;

  recognition = new SR();
  recognition.lang = VOICE_LANG;
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;
  btn.classList.add('listening');

  let finalText = '';
  recognition.onresult = e => {
    let interim = '';
    for (let k = e.resultIndex; k < e.results.length; k++) {
      const t = e.results[k][0].transcript;
      if (e.results[k].isFinal) finalText += t;
      else interim += t;
    }
    input.value = (finalText || interim).replace(/\s+/g, ' ').trim();
  };
  recognition.onerror = e => {
    showToast(
      e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'Prístup k mikrofónu je zamietnutý'
        : 'Hlas sa nepodarilo zachytiť',
    );
  };
  recognition.onend = () => {
    btn.classList.remove('listening');
    recognition = null;
    if (input.value.trim()) input.focus();
  };

  try {
    recognition.start();
  } catch {
    btn.classList.remove('listening');
    recognition = null;
  }
}
