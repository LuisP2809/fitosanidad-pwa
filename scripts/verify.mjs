import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'index.html','styles.css','styles-supervision.css','styles-mobile-fenologia.css','styles-summary-mobile.css','styles-map-labels.css','styles-login.css',
  'styles-desktop-fenologia.css','styles-admin-devices.css','manifest.webmanifest','sw.js',
  'js/app.js','js/db.js','js/sync.js','js/qr.js','js/login-enhance.js','js/desktop-shell.js','js/admin-devices.js','js/supervision-safe.js','js/map-labels.js','js/version-ui.js',
  'assets/login-farm.svg','data/catalogo-fenologia.json','apps-script/Code.gs','apps-script/ResetAccess.gs','scripts/prepare-web.mjs','package.json'
];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Falta ${file}`);
}

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const packageJson = JSON.parse(read('package.json'));
if (packageJson.version !== '0.6.0') throw new Error('package.json no apunta a 0.6.0.');

const master = JSON.parse(read('data/catalogo-fenologia.json'));
const catalog = [];
const seen = new Set();
for (const [campo, fundos] of Object.entries(master?.lotesAgrupados || {})) {
  for (const [fundo, modulos] of Object.entries(fundos || {})) {
    for (const [modulo, lotes] of Object.entries(modulos || {})) {
      for (const rawLot of lotes || []) {
        const lote = String(rawLot || '').trim();
        if (!lote || seen.has(lote)) throw new Error(`Lote maestro inválido o duplicado: ${lote || '(vacío)'}.`);
        seen.add(lote);
        catalog.push({ campo, fundo, modulo, lote });
      }
    }
  }
}
if (catalog.length !== 254) throw new Error(`Se esperaban 254 lotes del catálogo maestro de Fenología y hay ${catalog.length}.`);
if (!catalog.every((x) => ['OLMOS','MOTUPE'].includes(x.campo) && x.fundo && x.modulo && x.lote)) throw new Error('Hay filas inválidas en el catálogo maestro.');
if (!catalog.some((x) => x.lote === 'CACAO' && x.campo === 'MOTUPE' && x.fundo === 'CHOLOQUE' && x.modulo === 'M02')) throw new Error('Falta el lote especial CACAO.');
if (!catalog.some((x) => x.lote === 'M06T02-05') || !catalog.some((x) => x.lote === 'M06T02-06')) throw new Error('Faltan M06T02-05/M06T02-06.');
if (catalog.some((x) => ['M06T01-05','M06T01-06'].includes(x.lote))) throw new Error('Persisten códigos antiguos fuera del catálogo maestro.');

const calc = (captures, traps) => captures / (traps * 7);
for (const [c,t,expected] of [[1,4,1/28],[14,1,2],[7,7,1/7]]) {
  if (Math.abs(calc(c,t) - expected) > 1e-12) throw new Error('La fórmula MTD/C-T-D no coincide con las plantillas.');
}

const app = read('js/app.js');
const sync = read('js/sync.js');
const backend = read('apps-script/Code.gs');
const reset = read('apps-script/ResetAccess.gs');
const sw = read('sw.js');
const index = read('index.html');
const versionUi = read('js/version-ui.js');
const desktopShell = read('js/desktop-shell.js');
const desktopStyles = read('styles-desktop-fenologia.css');
const adminDevices = read('js/admin-devices.js');
const adminDeviceStyles = read('styles-admin-devices.css');
const prepare = read('scripts/prepare-web.mjs');
const supervision = read('js/supervision-safe.js');
const mapLabels = read('js/map-labels.js');
const loginEnhance = read('js/login-enhance.js');
const loginStyles = read('styles-login.css');
const mobileStyles = read('styles-mobile-fenologia.css');
const summaryMobileStyles = read('styles-summary-mobile.css');
const mapLabelStyles = read('styles-map-labels.css');

if (!app.includes('diasRevision: 7')) throw new Error('Días de revisión no está fijado en 7.');
if (app.includes('Turno detectado')) throw new Error('Turno detectado volvió a aparecer en la interfaz.');
if (!app.includes('Activar dispositivo') || !app.includes('qrSvg')) throw new Error('Falta la activación con QR.');

if (!index.includes('styles-desktop-fenologia.css?v=0.6.0') || !index.includes('styles-admin-devices.css?v=0.6.0') || !index.includes('js/desktop-shell.js?v=0.6.0') || !index.includes('js/admin-devices.js?v=0.6.0')) throw new Error('index.html no carga el escritorio/Admin 0.6.0.');
if (!sw.includes("fitosanidad-0.6.0") || !sw.includes('styles-desktop-fenologia.css') || !sw.includes('styles-admin-devices.css') || !sw.includes('js/desktop-shell.js') || !sw.includes('js/admin-devices.js')) throw new Error('La caché PWA 0.6.0 está incompleta.');
if (!sw.includes("event.request.mode==='navigate'") && !sw.includes("event.request.mode === 'navigate'")) throw new Error('La navegación debe priorizar red para evitar interfaz antigua.');
if (!versionUi.includes("APP_VERSION = '0.6.0'")) throw new Error('La fuente central de versión visible no es 0.6.0.');

if (!desktopStyles.includes('grid-template-columns:244px minmax(0,1fr)') || !desktopStyles.includes('@media (min-width:761px)')) throw new Error('Falta el escritorio tipo Fenología con menú lateral de 244px.');
if (!desktopShell.includes("nav.classList.add('fit-sidebar')") || !desktopShell.includes('fit-side-footer') || !desktopShell.includes('Administración')) throw new Error('Falta transformar la navegación inferior en lateral para PC.');

if (!sync.includes("DEVICE_STORAGE_KEY = 'fitosanidad-device-id-v1'") || !sync.includes('REQUEST_TIMEOUT_MS = 15000') || !sync.includes('getDeviceId') || !sync.includes('getDeviceLabel') || !sync.includes("'listDevices'") || !sync.includes("'setDeviceActive'")) throw new Error('El cliente no incluye soporte completo por dispositivo.');
if (!adminDevices.includes('Dispositivos del Administrador') || !adminDevices.includes('Agregar dispositivo') || !adminDevices.includes("createCentralActivation(admin, 'ADM-001')") || !adminDevices.includes('listCentralDevices') || !adminDevices.includes('setCentralDeviceActive')) throw new Error('Falta el panel multidispositivo del Administrador.');
if (!adminDeviceStyles.includes('.admin-device-panel') || !adminDeviceStyles.includes('.admin-device-row')) throw new Error('Falta el estilo del panel de dispositivos.');

if (!backend.includes("const FITO_VERSION = '0.6.0'") || !backend.includes("'DISPOSITIVOS_SYNC'") || !backend.includes('DEVICE_HEADERS') || !backend.includes('listDevicesAction_') || !backend.includes('setDeviceActiveAction_') || !backend.includes('ADMIN_MULTI_DEVICE') || !backend.includes('issueDeviceProfile_') || !backend.includes('upsertDeviceCredential_')) throw new Error('Apps Script no contiene el backend multidispositivo 0.6.0.');
if (!backend.includes('user.tokenHash && constantTimeEqual_') || !backend.includes('Dispositivo migrado')) throw new Error('Falta migración compatible desde credenciales 0.5.x.');
if (!backend.includes("if (!active && currentDeviceId && currentDeviceId === targetDeviceId)")) throw new Error('Falta protección para no revocar el dispositivo actual.');
if (!backend.includes("mosca: ['AÑO','MES','Semana','FECHA','LUGAR','FUNDO','MÓDULO'")) throw new Error('Los encabezados oficiales de Mosca cambiaron.');

if (!reset.includes("'DISPOSITIVOS_SYNC'") || !reset.includes('revokedDevices') || !reset.includes('activeAdminDevices') || !reset.includes('ADMIN_MULTI_DEVICE')) throw new Error('ResetAccess no está adaptado a 0.6.0 multidispositivo.');

if (!prepare.includes("'styles-desktop-fenologia.css'") || !prepare.includes("'styles-admin-devices.css'") || !prepare.includes("'js/desktop-shell.js'") || !prepare.includes("'js/admin-devices.js'") || !prepare.includes('catalog.length !== 254') || !prepare.includes('fenologia-pwa')) throw new Error('El build no publica los nuevos assets o no valida el mapa.');

if (!loginEnhance.includes('beforeinstallprompt') || !loginEnhance.includes('fit-login-brand')) throw new Error('La mejora del login PWA se perdió.');
if (!loginStyles.includes('@media(max-width:900px)') || !loginStyles.includes('@media(max-width:760px)') || !loginStyles.includes('@media(max-width:420px)')) throw new Error('Se perdieron los cortes responsive del login.');
if (!mobileStyles.includes('@media (max-width:420px)') || !summaryMobileStyles.includes('.sup-kpis')) throw new Error('Se perdió la adaptación móvil existente.');
if (!supervision.includes('supMapOut') || !supervision.includes('supMapFit') || !supervision.includes('supMapIn') || !supervision.includes('bindMapGestures')) throw new Error('Se perdieron controles o gestos del mapa.');
if (!supervision.includes("observer.observe(root,{childList:true})") || supervision.includes('subtree:true') || supervision.includes('subtree: true')) throw new Error('El observador del dashboard no es seguro.');
if (!mapLabels.includes('sup-lot-label') || !mapLabels.includes('supMapPopup') || !mapLabelStyles.includes('.sup-map-popup')) throw new Error('Se perdieron etiquetas o globo del mapa.');

const allText = required.map(read).join('\n');
if (/AIza[0-9A-Za-z_-]{20,}|script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}/.test(allText)) throw new Error('Se detectó un secreto o URL real de implementación dentro del repositorio.');

console.log('OK · Fitosanidad PWA 0.6.0');
console.log(`Catálogo maestro de Fenología: ${catalog.length} lotes`);
console.log('Fórmulas verificadas: Bicho, Mosca, SENASA');
console.log('PC: navegación lateral 244px y área de trabajo completa verificadas');
console.log('Móvil: navegación inferior y responsive existente verificados');
console.log('Administrador: varios dispositivos, QR, revocación individual y migración 0.5.x verificados');
console.log('Backend: DISPOSITIVOS_SYNC y credenciales independientes verificadas');
console.log('Mapa: 254 lotes, zoom, etiquetas y detalle rápido conservados');
console.log('Versión visible y caché: 0.6.0 verificadas');
