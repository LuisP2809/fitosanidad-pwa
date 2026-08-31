import { APP_VERSION } from './version-ui.js';

const NAV = {
  home: ['🏠','Inicio'],
  records: ['📋','Registros'],
  summary: ['📊','Resumen'],
  admin: ['⚙️','Administración'],
  sync: ['☁️','Sincronización']
};
let scheduled = false;

function enhanceShell() {
  const shell = document.querySelector('.app-shell');
  const nav = shell?.querySelector('.nav');
  if (!shell || !nav) return;
  shell.classList.add('fit-workspace');
  nav.classList.add('fit-sidebar');
  nav.querySelectorAll('button[data-nav]').forEach((button) => {
    const key = button.dataset.nav;
    const [icon,label] = NAV[key] || ['•', key || 'Sección'];
    if (button.dataset.fitNavEnhanced !== '1') {
      button.dataset.fitNavEnhanced = '1';
      button.innerHTML = `<span class="fit-nav-icon" aria-hidden="true">${icon}</span><span class="fit-nav-label">${label}</span>`;
    }
  });
  if (!nav.querySelector('.fit-side-footer')) {
    nav.insertAdjacentHTML('beforeend', `<div class="fit-side-footer"><b>Fitosanidad</b><small>v${APP_VERSION} · Ingleby Farms</small><span>PC + móvil · Offline</span></div>`);
  }
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; enhanceShell(); });
}

const root = document.querySelector('#app');
if (root) new MutationObserver(schedule).observe(root, { childList: true });
window.addEventListener('pageshow', schedule);
schedule();
