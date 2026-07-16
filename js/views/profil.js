// Pohľad Profil: prihlásenie/synchronizácia a nastavenia (DPH režim,
// obdobie podávania DPH, skrývanie kartových akcií).

import { state } from '../state.js';
import { syncLabel } from '../sync.js';
import { pageHead } from './shared.js';
import { svg } from '../lib/icons.js';
import { esc } from '../lib/util.js';

function accountPanel() {
  if (state.user) {
    return `<div class="prof-login">
        <div class="prof-avatar">${svg('user')}</div>
        <div>
          <h2 style="margin:0;font-size:16px">Prihlásený</h2>
          <p style="margin:4px 0 0;color:var(--muted);font-size:12px">${esc(state.user.email)}</p>
        </div>
      </div>
      ${syncLabel() ? `<div style="margin-top:10px;font-size:11.5px;color:var(--muted)">${esc(syncLabel())}</div>` : ''}
      <button class="secondary-btn full" data-action="logout" style="margin-top:12px">Odhlásiť sa</button>
      <p style="font-size:10.5px;color:var(--muted);margin:11px 0 0;line-height:1.5">Nákupný zoznam a nastavenia sa synchronizujú medzi tvojimi zariadeniami.</p>`;
  }

  // Supabase klienta sa nepodarilo načítať (offline / blokované CDN) –
  // namiesto nefunkčného formulára vysvetlíme, čo sa deje.
  if (state.syncUnavailable) {
    return `<div class="prof-login">
        <div class="prof-avatar">${svg('user')}</div>
        <div>
          <h2 style="margin:0;font-size:16px">Prihlásenie</h2>
          <p style="margin:4px 0 0;color:var(--muted);font-size:12px">Synchronizácia medzi zariadeniami</p>
        </div>
      </div>
      <div class="login-err" style="margin-top:14px">Prihlásenie a synchronizácia sú momentálne nedostupné – nepodarilo sa načítať prihlasovací modul. Appka funguje ďalej lokálne; po obnovení pripojenia to skúsime znova.</div>
      <p style="font-size:10.5px;color:var(--muted);margin:11px 0 0;line-height:1.5">Bez prihlásenia appka funguje tiež – zoznam ostáva len v tomto zariadení a dá sa preniesť linkom.</p>`;
  }

  return `<div class="prof-login">
      <div class="prof-avatar">${svg('user')}</div>
      <div>
        <h2 style="margin:0;font-size:16px">Prihlásenie</h2>
        <p style="margin:4px 0 0;color:var(--muted);font-size:12px">Prihlás sa e-mailom a heslom. Účty vytvára správca – ak ho nemáš, ozvi sa.</p>
      </div>
    </div>
    <form id="login-form" style="margin-top:14px;display:grid;gap:8px" autocomplete="on">
      <input class="login-input" name="email" type="email" required placeholder="E-mail" autocomplete="username">
      <input class="login-input" name="password" type="password" required placeholder="Heslo" autocomplete="current-password">
      ${state.loginErr ? `<div class="login-err">${esc(state.loginErr)}</div>` : ''}
      <button class="primary-btn full" type="submit"${state.loginBusy ? ' disabled' : ''}>${state.loginBusy ? 'Prihlasujem…' : svg('user') + ' Prihlásiť sa'}</button>
    </form>
    <p style="font-size:10.5px;color:var(--muted);margin:11px 0 0;line-height:1.5">Bez prihlásenia appka funguje tiež – zoznam ostáva len v tomto zariadení a dá sa preniesť linkom.</p>`;
}

export function renderProfil() {
  const s = state.settings;

  const dphButton = (value, label, description) =>
    `<button class="opt ${s.dph === value ? 'on' : ''}" data-action="set-dph" data-val="${value}"><strong>${label}</strong><span>${description}</span></button>`;

  const periodButton = (value, label) =>
    `<button class="opt ${s.dphPeriod === value ? 'on' : ''}" data-action="set-dphperiod" data-val="${value}"><strong>${label}</strong></button>`;

  const dphPeriodSetting =
    s.dph === 'platca'
      ? `<div class="setting">
          <div class="setting-label">
            <strong>Ako často podávaš DPH?</strong>
            <span>Ovplyvní, ktoré DPH termíny sa ti zobrazia v Legislatíve. Ak nevieš, nechaj „Neviem" (ukáže všetky).</span>
          </div>
          <div class="opt-group">${periodButton('mesacne', 'Mesačne')}${periodButton('stvrtrocne', 'Štvrťročne')}${periodButton('', 'Neviem')}</div>
        </div>`
      : '';

  return `${pageHead({ eyebrow: 'Účet', title: 'Profil a nastavenia', desc: 'Nastavenia sa ukladajú v tomto zariadení. Po prihlásení sa budú synchronizovať medzi zariadeniami – nič sa nezadáva dvakrát.', large: true })}
    <div class="profile-grid">
      <section class="panel panel-pad">${accountPanel()}</section>
      <section class="panel">
        <div class="panel-head">
          <div><h2>Nastavenia</h2><p>Ovplyvňujú zobrazené ceny a filtre akcií</p></div>
          ${svg('settings')}
        </div>
        <div class="panel-pad">
          <div class="setting">
            <div class="setting-label">
              <strong>Platca DPH</strong>
              <span>Pri Metre (veľkoobchod) rozhoduje, či sa ako hlavná cena ukáže cena bez DPH alebo s DPH.</span>
            </div>
            <div class="opt-group">${dphButton('platca', 'Platca DPH', 'hlavná cena bez DPH')}${dphButton('neplatca', 'Neplatca / spotrebiteľ', 'hlavná cena s DPH')}</div>
          </div>
          ${dphPeriodSetting}
          <label class="setting toggle">
            <div class="setting-label">
              <strong>Skryť akcie viazané na vernostnú kartu</strong>
              <span>Nezobrazovať ponuky platné len s Kaufland Card / Lidl Plus a pod.</span>
            </div>
            <input type="checkbox" data-action="toggle-setting" data-key="hideCard" ${s.hideCard ? 'checked' : ''}>
          </label>
        </div>
      </section>
    </div>`;
}
