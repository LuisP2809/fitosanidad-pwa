import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const out = path.join(root, 'www');
const MAP_REF = '644433f3e756aa0ca5cbbd2ef0fc950837821521';
const MAP_URL = `https://raw.githubusercontent.com/LuisP2809/fenologia-pwa/${MAP_REF}/data/lotes-mapa.geojson`;

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const files = [
  'index.html',
  'styles.css',
  'styles-supervision.css',
  'styles-mobile-fenologia.css',
  'styles-summary-mobile.css',
  'styles-map-labels.css',
  'styles-login.css',
  'styles-desktop-fenologia.css',
  'styles-admin-devices.css',
  'styles-sync-status.css',
  'manifest.webmanifest',
  'sw.js',
  'js/performance-cache.js',
  'js/app.js',
  'js/db.js',
  'js/sync.js',
  'js/qr.js',
  'js/login-enhance.js',
  'js/desktop-shell.js',
  'js/admin-devices.js',
  'js/supervision-safe.js',
  'js/map-labels.js',
  'js/version-ui.js',
  'icons/icon.svg',
  'assets/login-farm.svg'
];

for (const relative of files) {
  const source = path.join(root, relative);
  const target = path.join(out, relative);
  if (!fs.existsSync(source)) throw new Error(`No existe ${relative}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

const qrSource = path.join(root, 'node_modules', 'qrcode-generator', 'dist', 'qrcode.mjs');
const qrTarget = path.join(out, 'vendor', 'qrcode.mjs');
if (!fs.existsSync(qrSource)) throw new Error('Falta qrcode-generator. Ejecuta npm install.');
fs.mkdirSync(path.dirname(qrTarget), { recursive: true });
fs.copyFileSync(qrSource, qrTarget);

function flattenFenologiaCatalog(master) {
  const rows = [];
  const seen = new Set();
  for (const [campo, fundos] of Object.entries(master?.lotesAgrupados || {})) {
    for (const [fundo, modulos] of Object.entries(fundos || {})) {
      for (const [modulo, lotes] of Object.entries(modulos || {})) {
        for (const rawLot of lotes || []) {
          const lote = String(rawLot || '').trim();
          if (!lote) throw new Error('El catálogo maestro de Fenología contiene un lote vacío.');
          if (seen.has(lote)) throw new Error(`El lote ${lote} está duplicado en el catálogo maestro de Fenología.`);
          seen.add(lote);
          const turnoMatch = lote.match(/T(\d{2})-/i);
          rows.push({ campo, fundo, modulo, lote, turno: turnoMatch ? `T${turnoMatch[1]}` : '' });
        }
      }
    }
  }
  return rows;
}

const masterPath = path.join(root, 'data', 'catalogo-fenologia.json');
if (!fs.existsSync(masterPath)) throw new Error('Falta data/catalogo-fenologia.json.');
const master = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
const catalog = flattenFenologiaCatalog(master);
if (catalog.length !== 254) throw new Error(`El catálogo maestro de Fenología debe tener 254 lotes y tiene ${catalog.length}.`);
if (!catalog.some((row) => row.lote === 'CACAO')) throw new Error('Falta el lote especial CACAO del catálogo de Fenología.');

const catalogTarget = path.join(out, 'data', 'catalogo-lotes.json');
fs.mkdirSync(path.dirname(catalogTarget), { recursive: true });
fs.writeFileSync(catalogTarget, JSON.stringify(catalog));

const catalogByLot = new Map(catalog.map((row) => [row.lote, row]));
const response = await fetch(MAP_URL, { headers: { 'User-Agent': 'fitosanidad-pwa-build' } });
if (!response.ok) throw new Error(`No se pudo obtener el mapa base (${response.status}).`);
const sourceMap = await response.json();
if (sourceMap?.type !== 'FeatureCollection' || !Array.isArray(sourceMap.features)) throw new Error('El mapa base no es un GeoJSON válido.');

const seen = new Set();
const features = sourceMap.features.filter((feature) => {
  const lot = String(feature?.properties?.LOTE || '').trim();
  return catalogByLot.has(lot);
}).map((feature) => {
  const lot = String(feature.properties.LOTE).trim();
  if (seen.has(lot)) throw new Error(`El lote ${lot} está duplicado en el mapa base.`);
  seen.add(lot);
  const expected = catalogByLot.get(lot);
  const actual = feature.properties || {};
  if (String(actual.CAMPO || '') !== expected.campo || String(actual.FUNDO || '') !== expected.fundo || String(actual.MODULO || '') !== expected.modulo) {
    throw new Error(`El mapa no coincide con el catálogo maestro para ${lot}.`);
  }
  if (!['Polygon','MultiPolygon'].includes(feature?.geometry?.type)) throw new Error(`Geometría no admitida para ${lot}.`);
  return { ...feature, properties: { ...feature.properties, ACTIVO: true } };
});

const missing = [...catalogByLot.keys()].filter((lot) => !seen.has(lot));
if (missing.length || features.length !== catalog.length) {
  throw new Error(`Mapa incompleto frente al catálogo maestro. Faltan: ${missing.slice(0,10).join(', ') || 'desconocido'}.`);
}

const mapTarget = path.join(out, 'data', 'lotes-mapa.geojson');
const cleanMap = {
  ...sourceMap,
  source: `fenologia-pwa@${MAP_REF}`,
  stats: { ...(sourceMap.stats || {}), lotesActivos: features.length, zonasReferencia: 0, featuresNormalizadas: features.length },
  features
};
fs.writeFileSync(mapTarget, JSON.stringify(cleanMap));

fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log(`Sitio preparado en ${out}`);
console.log(`Catálogo fitosanitario: ${catalog.length} lotes copiados de Fenología`);
console.log(`Mapa fitosanitario: ${features.length}/${catalog.length} lotes con geometría validada`);
console.log('Acceso responsive: fondo y cortes 900/760/420 copiados del patrón visual de Fenología');
console.log('Escritorio 0.6.0: navegación lateral 244px y área de trabajo completa');
console.log('Administrador 0.6.0: panel multidispositivo incluido');
console.log('Rendimiento 0.6.1: caché compartida y precarga central incluidas');
console.log('Offline 0.6.2: auto-sync, reconciliación local y sesión/panel tras recarga incluidos');
console.log(`Archivos públicos: ${files.length + 4}`);
