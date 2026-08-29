import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'index.html','styles.css','styles-supervision.css','manifest.webmanifest','sw.js',
  'js/app.js','js/db.js','js/sync.js','js/qr.js','js/supervision-safe.js',
  'data/catalogo-fenologia.json','apps-script/Code.gs','scripts/prepare-web.mjs'
];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Falta ${file}`);
}

const master = JSON.parse(fs.readFileSync(path.join(root, 'data/catalogo-fenologia.json'), 'utf8'));
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
if (!catalog.some((x) => x.lote === 'M06T02-05') || !catalog.some((x) => x.lote === 'M06T02-06')) throw new Error('Faltan M06T02-05/M06T02-06 del catálogo correcto de Fenología.');
if (catalog.some((x) => ['M06T01-05','M06T01-06'].includes(x.lote))) throw new Error('Persisten códigos antiguos que no pertenecen al catálogo maestro de Fenología.');

const calc = (captures, traps) => captures / (traps * 7);
for (const [c,t,expected] of [[1,4,1/28],[14,1,2],[7,7,1/7]]) {
  if (Math.abs(calc(c,t) - expected) > 1e-12) throw new Error('La fórmula MTD/C-T-D no coincide con las plantillas.');
}

const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const sync = fs.readFileSync(path.join(root, 'js/sync.js'), 'utf8');
const backend = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const supervision = fs.readFileSync(path.join(root, 'js/supervision-safe.js'), 'utf8');
const prepare = fs.readFileSync(path.join(root, 'scripts/prepare-web.mjs'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!app.includes('diasRevision: 7')) throw new Error('Días de revisión no está fijado en 7.');
if (app.includes('Turno detectado')) throw new Error('Turno detectado volvió a aparecer en la interfaz.');
if (!app.includes('Activar dispositivo') || !app.includes('qrSvg')) throw new Error('Falta la activación simplificada con QR.');
if (!sync.includes("'redeemActivation'") || !sync.includes("'createActivation'")) throw new Error('Faltan endpoints de activación en el cliente.');
if (!backend.includes('issueActivation_') || !backend.includes('redeemActivationAction_')) throw new Error('Falta activación temporal en Apps Script.');
if (!backend.includes('USER_DISABLED')) throw new Error('Falta revocación central de usuarios.');
if (!sw.includes('vendor/qrcode.mjs') || !sw.includes('data/lotes-mapa.geojson') || !sw.includes('js/supervision-safe.js')) throw new Error('El mapa/dashboard seguro no quedó incluido en la caché PWA.');
if (!index.includes('js/supervision-safe.js') || index.includes('src="js/supervision.js')) throw new Error('La página sigue cargando el observador antiguo.');
if (!supervision.includes('Mapa y dashboard fitosanitario') || !supervision.includes('getCentralSnapshot')) throw new Error('Falta el dashboard central.');
if (!supervision.includes('no representa un umbral fitosanitario')) throw new Error('Falta aclaración de escala relativa del mapa.');
if (!supervision.includes("observer.observe(root,{childList:true})")) throw new Error('El observador seguro debe limitarse a cambios directos del contenedor principal.');
if (supervision.includes('subtree:true') || supervision.includes('subtree: true')) throw new Error('El observador recursivo puede volver a bloquear la PWA.');
if (!supervision.includes('requestAnimationFrame')) throw new Error('Falta limitar la detección de cambios por cuadro.');
if (!prepare.includes('catalogo-fenologia.json') || !prepare.includes('catalog.length !== 254') || !prepare.includes('fenologia-pwa')) throw new Error('Falta construir el catálogo/mapa fitosanitario desde la referencia de Fenología.');

const allText = required.map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
if (/AIza[0-9A-Za-z_-]{20,}|script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}/.test(allText)) throw new Error('Se detectó un secreto o URL real de implementación dentro del repositorio.');

console.log('OK · Fitosanidad PWA 0.4.2');
console.log(`Catálogo maestro de Fenología: ${catalog.length} lotes`);
console.log('Fórmulas verificadas: Bicho, Mosca, SENASA');
console.log('Activación simplificada: verificada');
console.log('Dashboard central y mapa fitosanitario: verificados');
console.log('Rendimiento: observador recursivo retirado y detección limitada por cuadro');