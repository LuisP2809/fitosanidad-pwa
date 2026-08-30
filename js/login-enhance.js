import { db } from './db.js';
import { APP_VERSION } from './version-ui.js';

let installPrompt = null;
let installed = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
let scheduled = false;

const userIcon = `<span class="fit-input-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"></circle><path d="M5.5 19c.8-3.4 3-5.2 6.5-5.2s5.7 1.8 6.5 5.2"></path></svg></span>`;
const lockIcon = `<span class="fit-input-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="6" y="10" width="12" height="9" rx="2"></rect><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10"></path><path d="M12 13.5v2"></path></svg></span>`;
const eyeIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.2-5 9-5 9 5 9 5-3.2 5-9 5-9-5-9-5Z"></path><circle cx="12" cy="12" r="2.2"></circle></svg>`;
const downloadIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11"></path><path d="m8 10 4 4 4-4"></path><path d="M5 18v2h14v-2"></path></svg>`;
const loginSprout = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V9"></path><path d="M12 11c-3.8.1-6-1.8-6.5-5.6 3.9-.1 6.1 1.8 6.5 5.6Z"></path><path d="M12 8c.9-3.3 3.3-4.8 7-4.3-.4 3.4-2.7 5-7 4.3Z"></path></svg>`;
const arrowIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13"></path><path d="m14 8 4 4-4 4"></path></svg>`;

function wordmark() {
  return `<div class="fit-login-brand" aria-label="Ingleby Farms"><span>INGLEBY</span><svg viewBox="0 0 32 48" aria-hidden="true"><path d="M16 45V19"></path><path d="M16 24C9 24 5 20 4 12c7-1 12 3 12 12Z"></path><path d="M16 17C18 9 23 5 30 6c-1 8-6 12-14 11Z"></path><path d="M9 45h14"></path></svg><span>FARMS</span><span class="fit-wordmark-dot">.</span></div>`;
}

function ensureWordmark(wrap) {
  if (!wrap.querySelector('.fit-login-brand')) wrap.insertAdjacentHTML('afterbegin', wordmark());
}

function wrapInput(field, kind) {
  const input = field?.querySelector('input');
  if (!input || input.closest('.fit-login-input-shell')) return;
  field.classList.add('fit-login-field');
  const shell = document.createElement('div');
  shell.className = 'fit-login-input-shell';
  input.parentNode.insertBefore(shell, input);
  shell.innerHTML = kind === 'pin' ? lockIcon : userIcon;
  shell.appendChild(input);
  if (kind === 'pin') {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'fit-pin-toggle';
    toggle.setAttribute('aria-label', 'Mostrar u ocultar PIN');
    toggle.innerHTML = eyeIcon;
    toggle.addEventListener('click', () => {
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      toggle.classList.toggle('active', !visible);
    });
    shell.appendChild(toggle);
  }
}

function installCardMarkup() {
  return `<div class="fit-install-card" id="fitInstallCard"><div class="fit-install-icon">${downloadIcon}</div><div class="fit-install-copy"><b>Instalar Fitosanidad</b><small id="fitInstallHelp">Agrégala a la pantalla principal para trabajar con acceso rápido y sin conexión.</small></div><button class="btn" type="button" id="fitInstallButton">${installed ? 'Instalada' : installPrompt ? 'Instalar' : 'Instalar'}</button></div>`;
}

function updateInstallCard() {
  const button = document.querySelector('#fitInstallButton');
  const help = document.querySelector('#fitInstallHelp');
  if (!button || !help) return;
  if (installed) {
    button.textContent = 'Instalada';
    button.disabled = true;
    help.textContent = 'La aplicación ya está instalada en este dispositivo.';
  } else {
    button.disabled = false;
    button.textContent = 'Instalar';
    help.textContent = installPrompt
      ? 'Agrégala a la pantalla principal para trabajar con acceso rápido y sin conexión.'
      : 'Si Chrome no abre el instalador, usa el menú ⋮ y elige Instalar app o Agregar a pantalla principal.';
  }
}

async function configureDeviceNote(card) {
  const note = card.querySelector('#fitConfiguredDevice');
  const username = card.querySelector('input[name="username"]');
  if (!note) return;
  try {
    const users = (await db.getAll('usuarios')).filter((user) => user?.active !== false);
    const selected = users.sort((a,b) => String(b.updatedAt || b.serverCheckedAt || '').localeCompare(String(a.updatedAt || a.serverCheckedAt || '')))[0];
    if (selected) {
      note.innerHTML = `Dispositivo configurado para <b>${escapeHtml(selected.name || selected.username || 'usuario')}</b>`;
      if (username && !username.value) username.value = selected.username || '';
    } else {
      note.textContent = 'Este dispositivo todavía no tiene un acceso configurado.';
    }
  } catch {
    note.textContent = 'Acceso local disponible en este dispositivo.';
  }
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}

function enhanceLogin(card) {
  if (card.dataset.fitLoginEnhanced === '1') return;
  card.dataset.fitLoginEnhanced = '1';
  card.classList.add('fit-login-card');

  const h1 = card.querySelector(':scope > h1');
  const intro = card.querySelector(':scope > p.muted');
  if (h1 && intro) {
    h1.textContent = 'Bienvenido';
    const heading = document.createElement('div');
    heading.className = 'fit-login-heading';
    h1.parentNode.insertBefore(heading, h1);
    heading.innerHTML = '<span class="fit-login-kicker">ACCESO SEGURO</span>';
    heading.appendChild(h1);
    heading.appendChild(intro);
  }

  const form = card.querySelector('#loginForm');
  const version = document.createElement('div');
  version.className = 'fit-login-version';
  version.innerHTML = `<i>✓</i><span>Versión ${APP_VERSION}</span><small>Interfaz y accesos actualizados</small>`;
  form?.parentNode.insertBefore(version, form);

  wrapInput(form?.querySelector('.field:has(input[name="username"])'), 'user');
  wrapInput(form?.querySelector('.field:has(input[name="pin"])'), 'pin');

  const submit = form?.querySelector('button[type="submit"]');
  if (submit) {
    submit.classList.add('fit-login-submit');
    submit.innerHTML = `<span class="fit-login-submit-label">${loginSprout}<span>Ingresar al sistema</span></span>${arrowIcon}`;
  }

  const activate = card.querySelector('#activateDevice');
  if (activate) activate.textContent = 'Activar otro dispositivo';

  const configured = document.createElement('div');
  configured.className = 'fit-configured-note';
  configured.id = 'fitConfiguredDevice';
  configured.textContent = 'Comprobando acceso configurado…';
  form?.insertAdjacentElement('afterend', configured);
  configured.insertAdjacentHTML('afterend', installCardMarkup());

  const offline = card.querySelector(':scope > p.note');
  if (offline) offline.classList.add('fit-offline-note');

  card.querySelector('#fitInstallButton')?.addEventListener('click', async () => {
    if (installed) return;
    if (!installPrompt) {
      updateInstallCard();
      card.querySelector('#fitInstallHelp')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    const prompt = installPrompt;
    installPrompt = null;
    await prompt.prompt();
    const choice = await prompt.userChoice.catch(() => null);
    if (choice?.outcome === 'accepted') installed = true;
    updateInstallCard();
  });

  configureDeviceNote(card);
  updateInstallCard();
}

function enhanceActivation(card) {
  if (card.dataset.fitActivationEnhanced === '1') return;
  card.dataset.fitActivationEnhanced = '1';
  card.classList.add('fit-login-activation');
  const icon = card.querySelector('.activation-icon');
  if (icon && !card.querySelector('.fit-login-kicker')) icon.insertAdjacentHTML('beforebegin', '<span class="fit-login-kicker">ACTIVACIÓN SEGURA</span>');
}

function enhance() {
  const wrap = document.querySelector('.login-wrap');
  if (!wrap) return;
  wrap.classList.add('fit-login-ready');
  ensureWordmark(wrap);
  const card = wrap.querySelector(':scope > .login-card');
  if (!card) return;
  if (card.querySelector('#loginForm')) enhanceLogin(card);
  else if (card.querySelector('#activationForm')) enhanceActivation(card);
}

function scheduleEnhance() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    enhance();
  });
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  updateInstallCard();
});
window.addEventListener('appinstalled', () => {
  installed = true;
  installPrompt = null;
  updateInstallCard();
});
window.addEventListener('pageshow', scheduleEnhance);
document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleEnhance(); });

const root = document.querySelector('#app');
if (root) {
  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(root, { childList: true });
}

scheduleEnhance();
