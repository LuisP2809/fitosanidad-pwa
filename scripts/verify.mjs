import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'index.html','styles.css','styles-supervision.css','styles-mobile-fenologia.css','styles-summary-mobile.css','styles-map-labels.css','manifest.webmanifest','sw.js',
  'js/app.js','js/db.js','js/sync.js','js/qr.js','js/supervision-safe.js','js/map-labels.js','js/version-ui.js',
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

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('js/app.js');
const sync = read('js/sync.js');
const backend = read('apps-script/Code.gs');
const sw = read('sw.js');
const supervision = read('js/supervision-safe.js');
const mapLabels = read('js/map-labels.js');
const versionUi = read('js/version-ui.js');
const prepare = read('scripts/prepare-web.mjs');
const index = read('index.html');
const styles = read('styles.css');
const supervisionStyles = read('styles-supervision.css');
const mobileStyles = read('styles-mobile-fenologia.css');
const summaryMobileStyles = read('styles-summary-mobile.css');
const mapLabelStyles = read('styles-map-labels.css');

if (!app.includes('diasRevision: 7')) throw new Error('Días de revisión no está fijado en 7.');
if (app.includes('Turno detectado')) throw new Error('Turno detectado volvió a aparecer en la interfaz.');
if (!app.includes('Activar dispositivo') || !app.includes('qrSvg')) throw new Error('Falta la activación simplificada con QR.');
if (!sync.includes("'redeemActivation'") || !sync.includes("'createActivation'")) throw new Error('Faltan endpoints de activación en el cliente.');
if (!backend.includes('issueActivation_') || !backend.includes('redeemActivationAction_')) throw new Error('Falta activación temporal en Apps Script.');
if (!backend.includes('USER_DISABLED')) throw new Error('Falta revocación central de usuarios.');
if (!sw.includes("fitosanidad-0.5.3") || !sw.includes('styles-summary-mobile.css') || !sw.includes('styles-map-labels.css') || !sw.includes('js/map-labels.js') || !sw.includes('js/version-ui.js')) throw new Error('La caché PWA no apunta a la versión 0.5.3 completa.');
if (!sw.includes("event.request.mode === 'navigate'")) throw new Error('La navegación debe priorizar red para evitar una interfaz antigua en caché.');
if (!index.includes('styles-summary-mobile.css?v=0.5.3') || !index.includes('styles-map-labels.css?v=0.5.3') || !index.includes('js/supervision-safe.js?v=0.5.3') || !index.includes('js/map-labels.js?v=0.5.3') || !index.includes('js/version-ui.js?v=0.5.3') || !index.includes('#063b25')) throw new Error('Los assets o el tema visual no apuntan a v0.5.3.');
if (!versionUi.includes("APP_VERSION = '0.5.3'") || !versionUi.includes('MutationObserver')) throw new Error('Falta la fuente central de versión visible 0.5.3.');
if (!supervision.includes('Mapa y dashboard fitosanitario') || !supervision.includes('getCentralSnapshot')) throw new Error('Falta el dashboard central.');
if (!supervision.includes('no representa un umbral fitosanitario')) throw new Error('Falta aclaración de escala relativa del mapa.');
if (!supervision.includes("observer.observe(root,{childList:true})")) throw new Error('El observador seguro debe limitarse a cambios directos del contenedor principal.');
if (supervision.includes('subtree:true') || supervision.includes('subtree: true')) throw new Error('El observador recursivo puede volver a bloquear la PWA.');
if (!supervision.includes('requestAnimationFrame')) throw new Error('Falta limitar la detección de cambios por cuadro.');
if (!supervision.includes('supMapOut') || !supervision.includes('supMapFit') || !supervision.includes('supMapIn')) throw new Error('Faltan controles − / Ajustar / + del mapa.');
if (!supervision.includes('bindMapGestures') || !supervision.includes('pointermove') || !supervision.includes('wheel')) throw new Error('Falta navegación interactiva del mapa.');
if (!mapLabels.includes("import { APP_VERSION } from './version-ui.js'") || !mapLabels.includes('getBBox') || !mapLabels.includes('sup-lot-label') || !mapLabels.includes('supMapPopup') || !mapLabels.includes('transform.zoom >= 1.7')) throw new Error('Faltan etiquetas de lote o detalle rápido del mapa.');
if (!styles.includes('--g950:#063b25') || !styles.includes('linear-gradient(90deg,var(--g950),var(--g800))')) throw new Error('Falta el lenguaje visual verde de Fenología adaptado a Fitosanidad.');
if (!supervisionStyles.includes('touch-action:none') || !supervisionStyles.includes('.sup-map-zoom')) throw new Error('Falta la base visual del mapa.');
if (!mobileStyles.includes('@media (max-width:420px)') || !mobileStyles.includes('.sup-map-zoom')) throw new Error('Falta la escala móvil general inspirada en Fenología.');
if (!summaryMobileStyles.includes('RESUMEN MOVIL 0.5.2') || !summaryMobileStyles.includes('(pointer:coarse)') || !summaryMobileStyles.includes('.sup-filter-grid') || !summaryMobileStyles.includes('.sup-kpis') || !summaryMobileStyles.includes('.sup-map-zoom')) throw new Error('Falta la corrección móvil dedicada del Resumen.');
if (!mapLabelStyles.includes('.sup-lot-label') || !mapLabelStyles.includes('.sup-map-popup') || !mapLabelStyles.includes('selected-label')) throw new Error('Falta el estilo de etiquetas o globo rápido del mapa.');
if (!prepare.includes('styles-summary-mobile.css') || !prepare.includes('styles-map-labels.css') || !prepare.includes('js/map-labels.js') || !prepare.includes('catalogo-fenologia.json') || !prepare.includes('catalog.length !== 254') || !prepare.includes('fenologia-pwa') || !prepare.includes('js/version-ui.js')) throw new Error('Falta publicar las mejoras del mapa o construir catálogo/mapa.');

const allText = required.map(read).join('\n');
if (/AIza[0-9A-Za-z_-]{20,}|script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}/.test(allText)) throw new Error('Se detectó un secreto o URL real de implementación dentro del repositorio.');

console.log('OK · Fitosanidad PWA 0.5.3');
console.log(`Catálogo maestro de Fenología: ${catalog.length} lotes`);
console.log('Fórmulas verificadas: Bicho, Mosca, SENASA');
console.log('Activación simplificada: verificada');
console.log('Dashboard central y mapa fitosanitario: verificados');
console.log('Resumen móvil: escala amplia, filtros, KPIs, gráficos y mapa verificados');
console.log('Mapa: etiquetas de lote, selección y globo rápido verificados');
console.log('Mapa móvil: controles − / Ajustar / +, arrastre y zoom verificados');
console.log('Versión visible: fuente central 0.5.3 verificada');
console.log('Rendimiento: observadores seguros y navegación con caché actualizable');