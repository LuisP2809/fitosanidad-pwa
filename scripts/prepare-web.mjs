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
  'manifest.webmanifest',
  'sw.js',
  'js/app.js',
  'js/db.js',
  'js/sync.js',
  'js/qr.js',
  'js/supervision.js',
  'data/catalogo-lotes.json',
  'icons/icon.svg'
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

const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data', 'catalogo-lotes.json'), 'utf8'));
const catalogByLot = new Map(catalog.map((row) => [String(row.lote || '').trim(), row]));
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
  if (String(actual.CAMPO || '') !== String(expected.campo || '') || String(actual.FUNDO || '') !== String(expected.fundo || '') || String(actual.MODULO || '') !== String(expected.modulo || '')) {
    throw new Error(`El mapa no coincide con el catálogo para ${lot}.`);
  }
  if (!['Polygon','MultiPolygon'].includes(feature?.geometry?.type)) throw new Error(`Geometría no admitida para ${lot}.`);
  return { ...feature, properties: { ...feature.properties, ACTIVO: true } };
});

const missing = [...catalogByLot.keys()].filter((lot) => !seen.has(lot));
if (missing.length || features.length !== catalog.length) throw new Error(`Mapa incompleto. Faltan: ${missing.slice(0,10).join(', ') || 'desconocido'}.`);

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
console.log(`Mapa fitosanitario: ${features.length} lotes validados`);
console.log(`Archivos públicos: ${files.length + 3}`);
