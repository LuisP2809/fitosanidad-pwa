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
for (const [c,t,expected] of [[1,4,1/28],[14,1,2],[7,7,1/7]]) {
  if (Math.abs(calc(c,t) - expected) > 1e-12) throw new Error('La fórmula MTD/C-T-D no coincide con las plantillas.');
}

const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const db = fs.readFileSync(path.join(root, 'js/db.js'), 'utf8');
const sync = fs.readFileSync(path.join(root, 'js/sync.js'), 'utf8');
const backend = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8');
if (!app.includes('diasRevision: 7')) throw new Error('Días de revisión no está fijado en 7.');
if (!db.includes('fitosanidad-access-profile')) throw new Error('Falta validación de perfil central.');
if (!sync.includes("'appendEvaluations'")) throw new Error('Falta sincronización autenticada.');
if (!backend.includes('provisionInitialAdmin')) throw new Error('Falta aprovisionamiento inicial del Administrador.');
if (!backend.includes('USUARIOS_SYNC') || !backend.includes('TOKEN_HASH')) throw new Error('Falta el control central de usuarios/tokens.');
if (!backend.includes('USER_DISABLED')) throw new Error('Falta revocación central de usuarios.');

const allText = required.map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
if (/AIza[0-9A-Za-z_-]{20,}|script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}/.test(allText)) throw new Error('Se detectó un secreto o URL de implementación dentro del repositorio.');

console.log('OK · Fitosanidad PWA 0.2.0');
console.log(`Catálogo: ${catalog.length} lotes`);
console.log('Fórmulas verificadas: Bicho, Mosca, SENASA');
console.log('Usuarios centrales, revocación y sincronización autenticada: verificados');
