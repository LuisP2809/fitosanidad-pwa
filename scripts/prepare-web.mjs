import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const out = path.join(root, 'www');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const files = [
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'sw.js',
  'js/app.js',
  'js/db.js',
  'js/sync.js',
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

fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log(`Sitio preparado en ${out}`);
console.log(`Archivos públicos: ${files.length + 1}`);
