import { db, importAccessProfile, verifyUser } from './db.js';
import {
  CentralApiError,
  checkCentralAccess,
  syncPending,
  listCentralUsers,
  createCentralUser,
  setCentralUserActive,
  rotateCentralUserToken,
  getCentralSnapshot
} from './sync.js';

const VERSION = '0.2.0';
const TYPES = {
  bicho: { title: 'Bicho del cesto', icon: '🐛', captureLabel: 'Capturas', indicator: 'C/T/D' },
  mosca: { title: 'Mosca de la fruta', icon: '🪰', captureLabel: 'Moscas capturadas', indicator: 'MTD' },
  senasa: { title: 'Trampas oficiales de SENASA', icon: '🪤', captureLabel: 'Capturas', indicator: 'C/T/D' }
};

let catalog = [];
let currentUser = null;
let currentView = 'home';
let centralUsersCache = [];
let centralSnapshotCache = [];

const app = document.querySelector('#app');
const toastEl = document.querySelector('#toast');

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
}

function toast(message, duration = 3000) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.remove('show'), duration);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'es', { numeric: true }));
}

function isoDateToday() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function dateParts(dateText) {
  const date = new Date(`${dateText}T12:00:00`);
  const month = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'][date.getMonth()];
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  return { year: date.getFullYear(), month, week };
}

function formatDatePE(dateText) {
  if (!dateText) return '';
  const [y,m,d] = String(dateText).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(dateText);
}

function formatIndicator(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '0.00';
}

function roleLabel(role) {
  return role === 'ADMIN' ? 'Administrador' : role === 'SUPERVISOR' ? 'Supervisor' : 'Evaluador';
}

function getGps() {
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => { if (!settled) { settled = true; resolve(value); } };
    const timer = setTimeout(() => done(null), 3500);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        done({
          lat: Number(position.coords.latitude.toFixed(7)),
          lon: Number(position.coords.longitude.toFixed(7)),
          accuracy: Math.round(position.coords.accuracy)
        });
      },
      () => { clearTimeout(timer); done(null); },
      { enableHighAccuracy: true, timeout: 3000, maximumAge: 60000 }
    );
  });
}

async function loadCatalog() {
  const response = await fetch('./data/catalogo-lotes.json');
  if (!response.ok) throw new Error('No se pudo cargar el catálogo de lotes.');
  catalog = await response.json();
}

function shell(content, active = currentView) {
  const adminNav = currentUser?.role === 'ADMIN';
  return `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand"><div class="brand-badge">F</div><div>Fitosanidad <span class="muted">v${VERSION}</span></div></div>
        <div class="top-actions">
          <div class="status-line"><span class="dot ${navigator.onLine ? 'online':'offline'}"></span>${navigator.onLine ? 'Online':'Sin señal'}</div>
          <button class="btn ghost small" data-action="logout">Salir</button>
        </div>
      </header>
      <main class="page">${content}</main>
      <nav class="nav">
        <button data-nav="home" class="${active === 'home' ? 'active':''}">🏠<br>Inicio</button>
        <button data-nav="records" class="${active === 'records' ? 'active':''}">📋<br>Registros</button>
        <button data-nav="summary" class="${active === 'summary' ? 'active':''}">📊<br>Resumen</button>
        <button data-nav="${adminNav ? 'admin':'sync'}" class="${active === 'admin' || active === 'sync' ? 'active':''}">${adminNav ? '⚙️<br>Admin':'☁️<br>Sync'}</button>
      </nav>
    </div>`;
}

function importAccessMarkup(showBack = false) {
  return `
    <div class="login-wrap"><section class="login-card">
      <h1>Vincular acceso</h1>
      <p class="muted">Importa el perfil entregado por el Administrador y crea un PIN local para este dispositivo.</p>
      <form id="accessForm">
        <div class="field"><label>URL de Google Apps Script</label><input name="endpoint" type="url" placeholder="https://script.google.com/macros/s/.../exec" required></div>
        <div class="field"><label>Perfil de acceso</label><textarea name="profile" rows="8" spellcheck="false" style="width:100%;border:1px solid #cbdad2;border-radius:12px;padding:11px 12px;font:inherit;resize:vertical" placeholder='{"type":"fitosanidad-access-profile",...}' required></textarea></div>
        <div class="field"><label>PIN local (mínimo 6 dígitos)</label><input name="pin" type="password" inputmode="numeric" minlength="6" pattern="[0-9]{6,}" required></div>
        <div class="field"><label>Repite el PIN</label><input name="pin2" type="password" inputmode="numeric" minlength="6" pattern="[0-9]{6,}" required></div>
        <button class="btn" type="submit">Vincular dispositivo</button>
        ${showBack ? '<button class="btn ghost" type="button" id="backLogin">Volver al inicio de sesión</button>' : ''}
      </form>
      <p class="note">El token central se guarda únicamente en este dispositivo. Tu PIN no se envía a Google Apps Script.</p>
    </section></div>`;
}

function renderImportAccess(showBack = false) {
  app.innerHTML = importAccessMarkup(showBack);
  document.querySelector('#backLogin')?.addEventListener('click', renderLogin);
  document.querySelector('#accessForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get('pin') !== form.get('pin2')) return toast('Los PIN no coinciden.');
    let profile;
    try { profile = JSON.parse(String(form.get('profile') || '').trim()); }
    catch { return toast('El perfil de acceso no es JSON válido.'); }
    try {
      const user = await importAccessProfile(profile, form.get('endpoint'), form.get('pin'));
      if (navigator.onLine) {
        try {
          const result = await checkCentralAccess(user);
          currentUser = result.localUser || user;
        } catch (error) {
          currentUser = null;
          throw error;
        }
      } else {
        currentUser = user;
      }
      toast('Dispositivo vinculado correctamente.');
      renderHome();
    } catch (error) {
      toast(error.message || 'No se pudo vincular el acceso.', 4500);
    }
  });
}

function renderLogin() {
  app.innerHTML = `
    <div class="login-wrap"><section class="login-card">
      <h1>Fitosanidad</h1>
      <p class="muted">Ingresa con tu usuario y PIN.</p>
      <form id="loginForm">
        <div class="field"><label>Usuario</label><input name="username" autocomplete="username" required></div>
        <div class="field"><label>PIN</label><input name="pin" type="password" inputmode="numeric" autocomplete="current-password" required></div>
        <button class="btn" type="submit">Iniciar sesión</button>
        <button class="btn ghost" type="button" id="importAccess">Importar o actualizar acceso</button>
      </form>
      <p class="note">Después de una validación online exitosa puedes seguir registrando evaluaciones sin internet.</p>
    </section></div>`;
  document.querySelector('#importAccess').addEventListener('click', () => renderImportAccess(true));
  document.querySelector('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const user = await verifyUser(form.get('username'), form.get('pin'));
    if (!user) return toast('Usuario o PIN incorrecto.');
    if (navigator.onLine) {
      try {
        const result = await checkCentralAccess(user);
        currentUser = result.localUser || user;
      } catch (error) {
        if (error instanceof CentralApiError && ['USER_DISABLED','UNAUTHORIZED'].includes(error.code)) {
          return toast(error.code === 'USER_DISABLED' ? 'Tu usuario está desactivado.' : 'El perfil central ya no es válido.', 4500);
        }
        currentUser = user;
        toast('No se pudo validar el servidor; se habilitó el modo local.', 4500);
      }
    } else currentUser = user;
    renderHome();
  });
}

function renderHome() {
  currentView = 'home';
  const canEvaluate = ['EVALUADOR','ADMIN','SUPERVISOR'].includes(currentUser.role);
  app.innerHTML = shell(`
    <section class="hero">
      <h1>Hola, ${esc(currentUser.name)}</h1>
      <p>${roleLabel(currentUser.role)} · ${navigator.onLine ? 'Conectado al sistema central':'Trabajando sin conexión'}</p>
    </section>
    ${canEvaluate ? `<section class="grid">
      ${Object.entries(TYPES).map(([key, item]) => `
        <article class="card eval-card">
          <div><div class="emoji">${item.icon}</div><h3>${item.title}</h3><p class="muted">Días de revisión: 7 · ${item.indicator} automático</p></div>
          <button class="btn" data-eval="${key}">Nueva evaluación</button>
        </article>`).join('')}
    </section>` : ''}
    ${currentUser.role !== 'EVALUADOR' ? `<div class="section-title"><h2>Supervisión</h2></div><div class="card"><p>Los registros confirmados de todos los evaluadores ya pueden consultarse desde el resumen central cuando hay internet.</p><button class="btn secondary" data-nav="summary">Ver resumen central</button></div>` : ''}
  `);
  bindShell();
  document.querySelectorAll('[data-eval]').forEach((button) => button.addEventListener('click', () => renderEvaluation(button.dataset.eval)));
}

function options(values, placeholder) {
  return `<option value="">${placeholder}</option>${values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}`;
}

function renderEvaluation(typeKey) {
  const type = TYPES[typeKey];
  if (!type) return renderHome();
  currentView = 'home';
  app.innerHTML = shell(`
    <button class="btn ghost small" data-action="back">← Volver</button>
    <section class="card form-card" style="margin-top:12px">
      <div class="section-title"><h2>${type.icon} ${type.title}</h2><span class="badge pending">7 días fijos</span></div>
      <form id="evalForm" data-type="${typeKey}">
        <div class="form-grid">
          <div class="field"><label>Fecha</label><input type="date" name="fecha" value="${isoDateToday()}" required></div>
          <div class="field"><label>Campo / Lugar</label><select name="campo" required>${options(unique(catalog.map((x) => x.campo)), 'Selecciona campo')}</select></div>
          <div class="field"><label>Fundo</label><select name="fundo" required disabled>${options([], 'Selecciona fundo')}</select></div>
          <div class="field"><label>Módulo</label><select name="modulo" required disabled>${options([], 'Selecciona módulo')}</select></div>
          <div class="field full"><label>Lote</label><select name="lote" required disabled>${options([], 'Selecciona lote')}</select></div>
          <div class="field"><label>${type.captureLabel}</label><input type="number" name="capturas" min="0" step="1" value="0" required></div>
          <div class="field"><label>Trampas revisadas</label><input type="number" name="trampas" min="1" step="1" required></div>
          <div class="field"><label>Días de revisión</label><div class="readonly">7 🔒</div></div>
          <div class="field"><label>Turno detectado</label><div class="readonly" id="turnoValue">—</div></div>
        </div>
        <div class="indicator"><div><span class="muted">${type.indicator} calculado</span><div>Capturas ÷ (trampas × 7)</div></div><strong id="indicatorValue">0.00</strong></div>
        <button class="btn" type="submit">Guardar evaluación</button>
      </form>
    </section>
  `);
  bindShell();
  document.querySelector('[data-action="back"]').addEventListener('click', renderHome);

  const form = document.querySelector('#evalForm');
  const campo = form.elements.campo;
  const fundo = form.elements.fundo;
  const modulo = form.elements.modulo;
  const lote = form.elements.lote;
  const captures = form.elements.capturas;
  const traps = form.elements.trampas;

  campo.addEventListener('change', () => {
    fundo.innerHTML = options(unique(catalog.filter((x) => x.campo === campo.value).map((x) => x.fundo)), 'Selecciona fundo');
    fundo.disabled = !campo.value;
    modulo.innerHTML = options([], 'Selecciona módulo'); modulo.disabled = true;
    lote.innerHTML = options([], 'Selecciona lote'); lote.disabled = true;
    document.querySelector('#turnoValue').textContent = '—';
  });
  fundo.addEventListener('change', () => {
    modulo.innerHTML = options(unique(catalog.filter((x) => x.campo === campo.value && x.fundo === fundo.value).map((x) => x.modulo)), 'Selecciona módulo');
    modulo.disabled = !fundo.value;
    lote.innerHTML = options([], 'Selecciona lote'); lote.disabled = true;
    document.querySelector('#turnoValue').textContent = '—';
  });
  modulo.addEventListener('change', () => {
    lote.innerHTML = options(unique(catalog.filter((x) => x.campo === campo.value && x.fundo === fundo.value && x.modulo === modulo.value).map((x) => x.lote)), 'Selecciona lote');
    lote.disabled = !modulo.value;
    document.querySelector('#turnoValue').textContent = '—';
  });
  lote.addEventListener('change', () => {
    const row = catalog.find((x) => x.lote === lote.value && x.modulo === modulo.value && x.fundo === fundo.value && x.campo === campo.value);
    document.querySelector('#turnoValue').textContent = row?.turno ? `T${row.turno}` : '—';
  });

  const updateIndicator = () => {
    const c = Number(captures.value || 0);
    const t = Number(traps.value || 0);
    document.querySelector('#indicatorValue').textContent = formatIndicator(t > 0 ? c / (t * 7) : 0);
  };
  captures.addEventListener('input', updateIndicator);
  traps.addEventListener('input', updateIndicator);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const capturesValue = Number(captures.value);
    const trapsValue = Number(traps.value);
    if (!Number.isInteger(capturesValue) || capturesValue < 0) return toast('Capturas debe ser un entero igual o mayor a 0.');
    if (!Number.isInteger(trapsValue) || trapsValue <= 0) return toast('Trampas revisadas debe ser mayor a 0.');
    const selected = catalog.find((x) => x.campo === campo.value && x.fundo === fundo.value && x.modulo === modulo.value && x.lote === lote.value);
    if (!selected) return toast('Selecciona un lote válido.');

    const { year, month, week } = dateParts(form.elements.fecha.value);
    const indicator = capturesValue / (trapsValue * 7);
    const gps = await getGps();
    const record = {
      id: crypto.randomUUID(), tipo: typeKey, tipoNombre: type.title,
      fecha: form.elements.fecha.value, year, month, week,
      lugar: selected.campo, fundo: selected.fundo, modulo: selected.modulo, lote: selected.lote, turno: selected.turno || '',
      capturas: capturesValue, trampasRevisadas: trapsValue, diasRevision: 7,
      indicador: indicator, indicadorNombre: type.indicator,
      evaluadorId: currentUser.id, evaluador: currentUser.name, gps,
      syncStatus: 'pending', createdAt: new Date().toISOString()
    };
    await db.put('evaluaciones', record);
    let message = gps ? 'Evaluación guardada con ubicación.' : 'Evaluación guardada.';
    if (navigator.onLine) {
      try {
        const result = await syncPending(currentUser);
        if (result.confirmed) message = 'Evaluación guardada y sincronizada.';
      } catch (error) {
        if (error.code === 'USER_DISABLED') return handleDisabledUser();
      }
    }
    toast(message);
    renderRecords();
  });
}

async function recordsForView() {
  if (currentUser.role === 'EVALUADOR') {
    const rows = await db.getAll('evaluaciones');
    return rows.filter((x) => x.evaluadorId === currentUser.id).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  if (navigator.onLine) {
    try {
      const result = await getCentralSnapshot(currentUser, 3000);
      centralSnapshotCache = result.records || [];
      return centralSnapshotCache;
    } catch (error) {
      if (error.code === 'USER_DISABLED') { handleDisabledUser(); return []; }
      toast('No se pudo cargar el consolidado central; se muestran datos disponibles localmente.', 4200);
    }
  }
  if (centralSnapshotCache.length) return centralSnapshotCache;
  const rows = await db.getAll('evaluaciones');
  return rows.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function renderRecords() {
  currentView = 'records';
  const rows = await recordsForView();
  if (!currentUser) return;
  app.innerHTML = shell(`
    <div class="section-title"><h2>${currentUser.role === 'EVALUADOR' ? 'Mis registros':'Registros centrales'}</h2><button class="btn secondary small" id="exportCsv">Exportar CSV</button></div>
    <div class="toolbar">
      ${Object.entries(TYPES).map(([key,v]) => `<button class="btn ghost small" data-filter="${key}">${v.title}</button>`).join('')}
      <button class="btn ghost small" data-filter="all">Todos</button>
    </div>
    <div id="recordsTable">${recordsTable(rows)}</div>
  `, 'records');
  bindShell();
  let filtered = rows;
  document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
    filtered = button.dataset.filter === 'all' ? rows : rows.filter((x) => x.tipo === button.dataset.filter);
    document.querySelector('#recordsTable').innerHTML = recordsTable(filtered);
  }));
  document.querySelector('#exportCsv').addEventListener('click', () => exportCsv(filtered));
}

function recordsTable(rows) {
  if (!rows.length) return '<div class="empty card">Todavía no hay evaluaciones guardadas.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Evaluación</th><th>Lugar</th><th>Fundo</th><th>Módulo</th><th>Lote</th><th>Capturas</th><th>Trampas</th><th>Indicador</th><th>Evaluador</th><th>Sync</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${formatDatePE(r.fecha)}</td><td>${esc(r.tipoNombre)}</td><td>${esc(r.lugar)}</td><td>${esc(r.fundo)}</td><td>${esc(r.modulo)}</td><td>${esc(r.lote)}</td><td>${r.capturas}</td><td>${r.trampasRevisadas}</td><td>${esc(r.indicadorNombre)} ${formatIndicator(r.indicador)}</td><td>${esc(r.evaluador || '')}</td><td><span class="badge ${r.syncStatus === 'confirmed' ? 'synced':'pending'}">${r.syncStatus === 'confirmed' ? 'Confirmado':'Pendiente'}</span></td></tr>`).join('')}
  </tbody></table></div>`;
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[;"\n]/.test(text) ? `"${text.replaceAll('"','""')}"` : text;
}

function exportCsv(rows) {
  if (!rows.length) return toast('No hay registros para exportar.');
  const headers = ['AÑO','MES','SEMANA','FECHA','LUGAR','FUNDO','MODULO','LOTE','CAPTURAS','TRAMPAS REVISADAS','DIAS DE REVISION','INDICADOR','EVALUADOR'];
  const body = rows.map((r) => [r.year,r.month,r.week,formatDatePE(r.fecha),r.lugar,r.fundo,r.modulo,r.lote,r.capturas,r.trampasRevisadas,7,Number(r.indicador).toFixed(6),r.evaluador || '']);
  const csv = '\ufeff' + [headers, ...body].map((row) => row.map(csvEscape).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `fitosanidad_${isoDateToday()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

async function renderSummary() {
  currentView = 'summary';
  const rows = await recordsForView();
  if (!currentUser) return;
  const pending = rows.filter((x) => x.syncStatus !== 'confirmed').length;
  const lots = new Set(rows.map((x) => `${x.lugar}|${x.fundo}|${x.modulo}|${x.lote}`)).size;
  const captures = rows.reduce((sum,x) => sum + Number(x.capturas || 0), 0);
  const avg = rows.length ? rows.reduce((sum,x) => sum + Number(x.indicador || 0), 0) / rows.length : 0;
  const perType = Object.entries(TYPES).map(([key,item]) => {
    const typed = rows.filter((x) => x.tipo === key);
    const total = typed.reduce((sum,x) => sum + Number(x.capturas || 0), 0);
    const average = typed.length ? typed.reduce((sum,x) => sum + Number(x.indicador || 0), 0) / typed.length : 0;
    return `<article class="card"><h3>${item.icon} ${item.title}</h3><p><strong>${typed.length}</strong> evaluaciones · <strong>${total}</strong> capturas</p><p class="muted">${item.indicator} promedio: ${formatIndicator(average)}</p></article>`;
  }).join('');

  app.innerHTML = shell(`
    <div class="section-title"><h2>${currentUser.role === 'EVALUADOR' ? 'Mi resumen':'Resumen central'}</h2></div>
    <div class="kpis"><div class="kpi"><span>Evaluaciones</span><strong>${rows.length}</strong></div><div class="kpi"><span>Lotes evaluados</span><strong>${lots}</strong></div><div class="kpi"><span>Capturas</span><strong>${captures}</strong></div><div class="kpi"><span>${currentUser.role === 'EVALUADOR' ? 'Pendientes sync':'Pendientes visibles'}</span><strong>${pending}</strong></div></div>
    <div class="grid">${perType}</div>
    <div class="card" style="margin-top:14px"><p><strong>Indicador promedio global:</strong> ${formatIndicator(avg)}</p><p class="muted">El mapa por lote se incorporará sobre este consolidado central en la siguiente etapa.</p></div>
  `, 'summary');
  bindShell();
}

async function renderSync() {
  currentView = 'sync';
  const rows = await db.getAll('evaluaciones');
  const pending = rows.filter((x) => x.evaluadorId === currentUser.id && x.syncStatus !== 'confirmed').length;
  app.innerHTML = shell(`
    <div class="section-title"><h2>Sincronización</h2></div>
    <div class="card">
      <p><strong>${pending}</strong> registros pendientes.</p>
      <p class="muted">Servidor central: ${currentUser.syncEndpoint ? 'configurado':'sin configurar'}.</p>
      <button class="btn" id="syncNow" ${currentUser.syncEndpoint ? '':'disabled'}>Sincronizar ahora</button>
    </div>
  `, 'sync');
  bindShell();
  document.querySelector('#syncNow')?.addEventListener('click', async () => {
    try {
      const result = await syncPending(currentUser);
      toast(`${result.confirmed} registros confirmados.`);
      renderSync();
    } catch (error) {
      if (error.code === 'USER_DISABLED') return handleDisabledUser();
      toast(`Error de sincronización: ${error.message}`, 4500);
    }
  });
}

function profileWithEndpoint(profile) {
  return { ...profile, endpoint: currentUser.syncEndpoint };
}

function profileBox(profile, title = 'Perfil de acceso generado') {
  const json = JSON.stringify(profileWithEndpoint(profile), null, 2);
  return `
    <section class="card" id="profileBox">
      <h3>${esc(title)}</h3>
      <p class="note">Este perfil contiene el token del dispositivo. Entrégalo únicamente a la persona correspondiente y bórralo de mensajes/archivos cuando termine la instalación.</p>
      <div class="field"><textarea id="profileOutput" rows="12" readonly style="width:100%;border:1px solid #cbdad2;border-radius:12px;padding:11px 12px;font:inherit;resize:vertical">${esc(json)}</textarea></div>
      <button class="btn secondary" id="copyProfile">Copiar perfil</button>
    </section>`;
}

async function renderAdmin(profile = null, profileTitle = '') {
  if (currentUser.role !== 'ADMIN') return renderHome();
  currentView = 'admin';
  let users = centralUsersCache;
  let loadError = '';
  if (navigator.onLine) {
    try {
      const result = await listCentralUsers(currentUser);
      users = result.users || [];
      centralUsersCache = users;
    } catch (error) {
      if (error.code === 'USER_DISABLED') return handleDisabledUser();
      loadError = error.message;
    }
  }
  app.innerHTML = shell(`
    <div class="section-title"><h2>Administración central</h2></div>
    ${loadError ? `<div class="note">No se pudo actualizar la lista central: ${esc(loadError)}</div>` : ''}
    <div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      <section class="card">
        <h3>Crear usuario</h3>
        <form id="userForm">
          <div class="field"><label>Nombre</label><input name="name" required></div>
          <div class="field"><label>Usuario</label><input name="username" pattern="[a-zA-Z0-9._-]{3,30}" required></div>
          <div class="field"><label>Rol</label><select name="role"><option value="EVALUADOR">Evaluador</option><option value="SUPERVISOR">Supervisor</option></select></div>
          <button class="btn" type="submit" style="margin-top:10px" ${navigator.onLine ? '':'disabled'}>Crear usuario central</button>
        </form>
      </section>
      <section class="card">
        <h3>Estado central</h3>
        <p><strong>${users.filter((u) => u.active).length}</strong> usuarios activos.</p>
        <p class="muted">La desactivación se hace efectiva en el siguiente contacto del dispositivo con el servidor.</p>
        <button class="btn secondary" id="refreshUsers" ${navigator.onLine ? '':'disabled'}>Actualizar usuarios</button>
      </section>
    </div>
    ${profile ? profileBox(profile, profileTitle) : ''}
    <div class="section-title"><h2>Usuarios</h2></div>
    <div class="card user-list">${users.length ? users.map((u) => `
      <div class="user-row">
        <div><strong>${esc(u.name)}</strong><div class="muted">${esc(u.username)} · ${esc(u.id)} · ${roleLabel(u.role)}</div></div>
        <div class="toolbar" style="margin:0">
          ${u.role === 'ADMIN' ? '<span class="badge synced">Administrador</span>' : `<button class="btn ${u.active ? 'danger':'secondary'} small" data-toggle-user="${esc(u.id)}" data-active="${u.active ? '1':'0'}">${u.active ? 'Desactivar':'Activar'}</button><button class="btn ghost small" data-rotate-user="${esc(u.id)}">Nuevo acceso</button>`}
        </div>
      </div>`).join('') : '<div class="empty">Sin usuarios centrales cargados.</div>'}</div>
  `, 'admin');
  bindShell();

  document.querySelector('#copyProfile')?.addEventListener('click', async () => {
    const text = document.querySelector('#profileOutput').value;
    try { await navigator.clipboard.writeText(text); toast('Perfil copiado.'); }
    catch { document.querySelector('#profileOutput').select(); toast('Selecciona y copia el perfil manualmente.'); }
  });

  document.querySelector('#refreshUsers')?.addEventListener('click', () => renderAdmin());
  document.querySelector('#userForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await createCentralUser(currentUser, { name: form.get('name'), username: form.get('username'), role: form.get('role') });
      centralUsersCache = result.users || centralUsersCache;
      toast('Usuario central creado.');
      renderAdmin(result.profile, 'Perfil nuevo: guárdalo antes de salir');
    } catch (error) { toast(error.message || 'No se pudo crear el usuario.', 4500); }
  });

  document.querySelectorAll('[data-toggle-user]').forEach((button) => button.addEventListener('click', async () => {
    try {
      const active = button.dataset.active !== '1';
      const result = await setCentralUserActive(currentUser, button.dataset.toggleUser, active);
      centralUsersCache = result.users || centralUsersCache;
      toast(active ? 'Usuario activado.' : 'Usuario desactivado.');
      renderAdmin();
    } catch (error) { toast(error.message, 4500); }
  }));

  document.querySelectorAll('[data-rotate-user]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm('El acceso anterior dejará de sincronizar. ¿Generar un token nuevo?')) return;
    try {
      const result = await rotateCentralUserToken(currentUser, button.dataset.rotateUser);
      renderAdmin(result.profile, 'Acceso renovado: reemplaza el perfil anterior');
    } catch (error) { toast(error.message, 4500); }
  }));
}

function bindShell() {
  document.querySelector('[data-action="logout"]')?.addEventListener('click', () => { currentUser = null; renderLogin(); });
  document.querySelectorAll('[data-nav]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.nav)));
}

function navigate(view) {
  if (view === 'home') return renderHome();
  if (view === 'records') return renderRecords();
  if (view === 'summary') return renderSummary();
  if (view === 'admin') return renderAdmin();
  if (view === 'sync') return renderSync();
}

function handleDisabledUser() {
  currentUser = null;
  toast('El usuario fue desactivado en el sistema central.', 4500);
  setTimeout(renderLogin, 800);
}

async function boot() {
  try {
    await loadCatalog();
    const users = await db.getAll('usuarios');
    if (!users.length) renderImportAccess(false); else renderLogin();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
    window.addEventListener('online', () => {
      document.querySelectorAll('.dot').forEach((dot) => { dot.classList.remove('offline'); dot.classList.add('online'); });
      if (currentUser) {
        checkCentralAccess(currentUser).then((result) => {
          if (result.localUser) currentUser = result.localUser;
          return syncPending(currentUser);
        }).then((result) => { if (result?.confirmed) toast(`${result.confirmed} registros sincronizados.`); })
          .catch((error) => { if (error.code === 'USER_DISABLED') handleDisabledUser(); });
      }
    });
    window.addEventListener('offline', () => {
      document.querySelectorAll('.dot').forEach((dot) => { dot.classList.remove('online'); dot.classList.add('offline'); });
    });
  } catch (error) {
    app.innerHTML = `<div class="login-wrap"><div class="login-card"><h1>No se pudo iniciar</h1><p>${esc(error.message)}</p></div></div>`;
  }
}

boot();
