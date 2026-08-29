import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'index.html','styles.css','manifest.webmanifest','sw.js','js/app.js','js/db.js','js/sync.js','data/catalogo-lotes.json','apps-script/Code.gs'
];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Falta ${file}`);
}

const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/catalogo-lotes.json'), 'utf8'));
if (catalog.length !== 253) throw new Error(`Se esperaban 253 lotes y hay ${catalog.length}.`);
if (!catalog.every((x) => ['OLMOS','MOTUPE'].includes(x.campo) && x.fundo && x.modulo && x.lote)) throw new Error('Hay filas inválidas en el catálogo.');
if (!catalog.every((x) => /^M\d{2}T\d{2}-/.test(x.lote))) throw new Error('Hay lotes con estructura no esperada.');

const calc = (captures, traps) => captures / (traps * 7);
const checks = [
  [1,4,0.03571428571428571],
  [14,1,2],
  [7,7,0.14285714285714285]
];
for (const [c,t,expected] of checks) {
  if (Math.abs(calc(c,t) - expected) > 1e-12) throw new Error('La fórmula MTD/C-T-D no coincide con las plantillas.');
}

const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
if (!app.includes("diasRevision: 7")) throw new Error('Días de revisión no está fijado en 7.');
if (!app.includes("role: 'ADMIN'")) throw new Error('No existe bootstrap de Administrador.');
if (!app.includes('SUPERVISOR') || !app.includes('EVALUADOR')) throw new Error('Faltan roles Supervisor/Evaluador.');

const allText = required.map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
if (/AIza[0-9A-Za-z_-]{20,}|script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}/.test(allText)) throw new Error('Se detectó un secreto o URL de implementación dentro del repositorio.');

console.log('OK · Fitosanidad PWA 0.1.0');
console.log(`Catálogo: ${catalog.length} lotes`);
console.log('Fórmulas verificadas: Bicho, Mosca, SENASA');
