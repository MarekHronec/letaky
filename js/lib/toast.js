// Krátke oznámenia: vizuálny toast + neviditeľný aria-live región pre čítačky.

import { TOAST_MS } from '../config.js';

let toastTimer;

export function showToast(text) {
  const el = document.querySelector('#toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), TOAST_MS);
}

// Text pre čítačky obrazovky (po prekreslení view by inak nič neoznámili).
export function announce(text) {
  const el = document.querySelector('#live');
  if (el) el.textContent = text;
}
