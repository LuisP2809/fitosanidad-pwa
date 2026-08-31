import { db } from './db.js';
import { qrSvg } from './qr.js';
import { createCentralActivation, getDeviceId, listCentralDevices, setCentralDeviceActive } from './sync.js';

let scheduled = false;
let busy = false;

function esc(value='') {
  return String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function fmt(value) {
  if (!value) return 'Sin registro';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('es-PE', { dateStyle:'short', timeStyle:'short' });
}
function activationLink(admin, activation) {
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set('activate', activation.code);
  url.searchParams.set('server', admin.syncEndpoint);
  return url.toString();
}
async function localAdmin() {
  const direct = await db.get('usuarios', 'ADM-001');
  if (direct?.active !== false && direct?.role === 'ADMIN') return direct;
  const users = await db.getAll('usuarios');
  return users.find((u) => u.role === 'ADMIN' && u.active !== false) || null;
}

function panelMarkup() {
  return `<section class="card admin-device-panel" id="adminDevicePanel">
    <div class="admin-device-head"><div><span class="admin-device-eyebrow">ACCESOS DEL ADMINISTRADOR</span><h3>Dispositivos del Administrador</h3><p>La PC y los celulares pueden permanecer vinculados al mismo ADM-001 con credenciales independientes.</p></div><button class="btn" id="addAdminDevice">＋ Agregar dispositivo</button></div>
    <div id="adminDeviceActivation"></div>
    <div id="adminDeviceList" class="admin-device-list"><div class="muted">Cargando dispositivos…</div></div>
  </section>`;
}

function activationMarkup(admin, activation) {
  const link = activationLink(admin, activation);
  return `<div class="admin-device-activation"><div class="admin-device-qr">${qrSvg(link)}</div><div><span class="muted">Código temporal</span><strong>${esc(activation.code)}</strong><p>Escanea este QR desde el nuevo dispositivo. Crearás un PIN propio y la sesión actual seguirá funcionando.</p><small>Vence: ${esc(fmt(activation.expiresAt))}</small><div class="admin-device-actions"><button class="btn secondary small" id="copyAdminDeviceLink">Copiar enlace</button><button class="btn ghost small" id="shareAdminDeviceLink">Compartir</button></div></div><input id="adminDeviceLink" class="sr-only" value="${esc(link)}" readonly></div>`;
}

function deviceRows(devices) {
  const current = getDeviceId();
  const adminDevices = devices.filter((d) => d.userId === 'ADM-001');
  if (!adminDevices.length) return '<div class="empty">Todavía no hay dispositivos registrados. La credencial actual se migrará automáticamente al conectarse.</div>';
  return adminDevices.map((d) => {
    const isCurrent = d.deviceId === current;
    return `<div class="admin-device-row ${d.active ? '' : 'revoked'}"><div class="admin-device-icon">${/Android|iPhone|iPad|Celular/i.test(d.label) ? '📱' : '💻'}</div><div class="admin-device-copy"><b>${esc(d.label || 'Dispositivo')}</b><small>${esc(d.deviceId.slice(0,18))}${d.deviceId.length>18?'…':''}</small><span>Último acceso: ${esc(fmt(d.lastAccessAt))}</span></div><div class="admin-device-state"><span class="badge ${d.active ? 'synced':'offline'}">${d.active ? 'Activo':'Revocado'}</span>${isCurrent ? '<small>Este dispositivo</small>' : `<button class="btn ${d.active ? 'danger':'secondary'} small" data-device-toggle="${esc(d.deviceId)}" data-active="${d.active?'1':'0'}">${d.active ? 'Revocar':'Reactivar'}</button>`}</div></div>`;
  }).join('');
}

async function loadDevices(panel, admin) {
  const target = panel.querySelector('#adminDeviceList');
  try {
    const result = await listCentralDevices(admin);
    target.innerHTML = deviceRows(result.devices || []);
    target.querySelectorAll('[data-device-toggle]').forEach((button) => button.addEventListener('click', async () => {
      if (busy) return;
      busy = true; button.disabled = true;
      try {
        const active = button.dataset.active !== '1';
        const updated = await setCentralDeviceActive(admin, button.dataset.deviceToggle, active);
        target.innerHTML = deviceRows(updated.devices || []);
        await loadDevices(panel, admin);
      } catch (error) {
        alert(error.message || 'No se pudo actualizar el dispositivo.');
      } finally { busy = false; }
    }));
  } catch (error) {
    target.innerHTML = `<div class="note">${error.code === 'ACTION_NOT_ALLOWED' ? 'Actualiza Apps Script a la versión 0.6.0 para administrar varios dispositivos.' : esc(error.message || 'No se pudieron cargar los dispositivos.')}</div>`;
  }
}

async function bindPanel(panel) {
  if (panel.dataset.bound === '1') return;
  panel.dataset.bound = '1';
  const admin = await localAdmin();
  if (!admin) return;
  panel.querySelector('#addAdminDevice')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const result = await createCentralActivation(admin, 'ADM-001');
      const box = panel.querySelector('#adminDeviceActivation');
      box.innerHTML = activationMarkup(admin, result.activation);
      const link = box.querySelector('#adminDeviceLink')?.value || '';
      box.querySelector('#copyAdminDeviceLink')?.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(link); } catch {}
      });
      box.querySelector('#shareAdminDeviceLink')?.addEventListener('click', async () => {
        if (navigator.share) { try { await navigator.share({ title:'Acceso Administrador Fitosanidad', text:`Código ${result.activation.code}`, url:link }); return; } catch (e) { if (e.name === 'AbortError') return; } }
        try { await navigator.clipboard.writeText(link); } catch {}
      });
    } catch (error) {
      alert(error.message || 'No se pudo generar el acceso del Administrador.');
    } finally { button.disabled = false; }
  });
  await loadDevices(panel, admin);
}

function enhanceAdmin() {
  const form = document.querySelector('#userForm');
  if (!form) return;
  const grid = form.closest('.admin-grid');
  if (!grid) return;
  let panel = document.querySelector('#adminDevicePanel');
  if (!panel) {
    grid.insertAdjacentHTML('afterend', panelMarkup());
    panel = document.querySelector('#adminDevicePanel');
  }
  bindPanel(panel);
}
function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; enhanceAdmin(); });
}
const root = document.querySelector('#app');
if (root) new MutationObserver(schedule).observe(root, { childList:true });
window.addEventListener('pageshow', schedule);
schedule();
