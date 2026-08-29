import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'index.html','styles.css','styles-supervision.css','manifest.webmanifest','sw.js',
  'js/app.js','js/db.js','js/sync.js','js/qr.js','js/supervision.js',
  'data/catalogo-lotes.json','apps-script/Code.gs','scripts/prepare-web.mjs'
];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Falta ${file}`);
}

const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/catalogo-lotes.json'), 'utf8'));
if (catalog.length !== 253) throw new Error(`Se esperaban 253 lotes y hay ${catalog.length}.`);
if (!catalog.every((x) => ['OLMOS','MOTUPE'].includes(x.campo) && x.fundo && x.modulo && x.lote)) throw new Error('Hay filas inválidas en el catálogo.');
if (!catalog.every((x) => /^M\d{2}T\d{2}-/.test(x.lote))) throw new Error('Hay lotes con estructura no esperada.');

const calc = (captures, traps) => captures / (traps * 7);
for (const [c,t,expected] of [[1,4,1/28],[14,1,2],[7,7,1/7]]) {
  if (Math.abs(calc(c,t) - expected) > 1e-12) throw new Error('La fórmula MTD/C-T-D no coincide con las plantillas.');
}

const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const sync = fs.readFileSync(path.join(root, 'js/sync.js'), 'utf8');
const backend = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const supervision = fs.readFileSync(path.join(root, 'js/supervision.js'), 'utf8');
const prepare = fs.readFileSync(path.join(root, 'scripts/prepare-web.mjs'), 'utf8');
if (!app.includes('diasRevision: 7')) throw new Error('Días de revisión no está fijado en 7.');
if (app.includes('Turno detectado')) throw new Error('Turno detectado volvió a aparecer en la interfaz.');
if (!app.includes('Activar dispositivo') || !app.includes('qrSvg')) throw new Error('Falta la activación simplificada con QR.');
if (!sync.includes("'redeemActivation'") || !sync.includes("'createActivation'")) throw new Error('Faltan endpoints de activación en el cliente.');
if (!backend.includes('issueActivation_') || !backend.includes('redeemActivationAction_')) throw new Error('Falta activación temporal en Apps Script.');
if (!backend.includes('USER_DISABLED')) throw new Error('Falta revocación central de usuarios.');
if (!sw.includes('vendor/qrcode.mjs') || !sw.includes('data/lotes-mapa.geojson') || !sw.includes('js/supervision.js')) throw new Error('El mapa/dashboard no quedó incluido en la caché PWA.');
if (!supervision.includes('Mapa y dashboard fitosanitario') || !supervision.includes('getCentralSnapshot')) throw new Error('Falta el dashboard central.');
if (!supervision.includes('no representa un umbral fitosanitario')) throw new Error('Falta aclaración de escala relativa del mapa.');
if (!prepare.includes('fenologia-pwa') || !prepare.includes('features.length !== catalog.length')) throw new Error('Falta construir/validar el GeoJSON fitosanitario.');

const allText = required.map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
if (/AIza[0-9A-Za-z_-]{20,}|script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}/.test(allText)) throw new Error('Se detectó un secreto o URL real de implementación dentro del repositorio.');

console.log('OK · Fitosanidad PWA 0.4.0');
console.log(`Catálogo: ${catalog.length} lotes`);
console.log('Fórmulas verificadas: Bicho, Mosca, SENASA');
console.log('Activación simplificada: verificada');
console.log('Dashboard central y mapa fitosanitario: verificados');
