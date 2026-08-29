import { APP_VERSION } from './version-ui.js';

const MAP_W = 1040;
const MAP_H = 620;
const SVG_NS = 'http://www.w3.org/2000/svg';
let scheduled = false;
let dismissedLot = '';

function parseWorldTransform(svg) {
  const world = svg?.querySelector('#supMapWorld');
  const raw = world?.getAttribute('transform') || '';
  const match = raw.match(/translate\(([-\d.]+)\s+([-\d.]+)\)\s+scale\(([-\d.]+)\)/);
  return match ? { x: Number(match[1]), y: Number(match[2]), zoom: Number(match[3]) } : { x: 0, y: 0, zoom: 1 };
}

function selectedPath(svg) {
  return svg?.querySelector('path.sup-lot.selected[data-sup-lot]') || null;
}

function ensureLabels(svg) {
  if (!svg || svg.dataset.lotLabelsReady === '1') return;
  const paths = [...svg.querySelectorAll('path[data-sup-lot]')];
  if (!paths.length) return;

  const labels = document.createElementNS(SVG_NS, 'g');
  labels.id = 'supMapLabels';
  labels.setAttribute('aria-hidden', 'true');

  paths.forEach((path) => {
    const lot = String(path.dataset.supLot || '').trim();
    if (!lot) return;
    let box;
    try { box = path.getBBox(); } catch { return; }
    const text = document.createElementNS(SVG_NS, 'text');
    text.classList.add('sup-lot-label');
    text.dataset.supLotLabel = lot;
    text.dataset.mapX = String(box.x + box.width / 2);
    text.dataset.mapY = String(box.y + box.height / 2);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.textContent = lot;
    labels.appendChild(text);
  });

  svg.appendChild(labels);
  svg.dataset.visibleLots = String(paths.length);
  svg.dataset.lotLabelsReady = '1';
}

function updateLabels(svg, transform) {
  const labels = [...(svg?.querySelectorAll('.sup-lot-label') || [])];
  if (!labels.length) return;
  const selected = selectedPath(svg)?.dataset.supLot || '';
  const visibleLots = Number(svg.dataset.visibleLots || 0);
  const showAll = transform.zoom >= 1.7 || visibleLots <= 45;
  svg.dataset.lotLabels = showAll ? 'show' : 'hide';

  labels.forEach((label) => {
    const x = Number(label.dataset.mapX || 0);
    const y = Number(label.dataset.mapY || 0);
    label.setAttribute('x', String(transform.x + x * transform.zoom));
    label.setAttribute('y', String(transform.y + y * transform.zoom));
    label.classList.toggle('selected-label', label.dataset.supLotLabel === selected);
  });
}

function detailValues() {
  const detail = document.querySelector('.sup-map-detail:not(.sup-empty)');
  if (!detail) return null;
  const data = {};
  detail.querySelectorAll('dl > div').forEach((row) => {
    const key = row.querySelector('dt')?.textContent?.trim() || '';
    const value = row.querySelector('dd')?.textContent?.trim() || '—';
    if (key) data[key] = value;
  });
  return {
    lot: detail.querySelector('h3')?.textContent?.trim() || '',
    fundo: data.Fundo || '—',
    modulo: data['Módulo'] || '—',
    evaluations: data.Evaluaciones || '0',
    captures: data.Capturas || '0',
    traps: data.Trampas || '0',
    indicator: detail.querySelector('p strong')?.textContent?.trim() || '—'
  };
}

function ensurePopup(svg, transform) {
  const canvas = svg?.closest('.sup-map-canvas');
  if (!canvas) return;
  const path = selectedPath(svg);
  if (!path) {
    canvas.querySelector('#supMapPopup')?.remove();
    dismissedLot = '';
    return;
  }

  const lot = String(path.dataset.supLot || '');
  if (!lot || dismissedLot === lot) {
    canvas.querySelector('#supMapPopup')?.remove();
    return;
  }

  const values = detailValues();
  if (!values || values.lot !== lot) return;

  let popup = canvas.querySelector('#supMapPopup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'supMapPopup';
    popup.className = 'sup-map-popup';
    canvas.appendChild(popup);
  }

  let box;
  try { box = path.getBBox(); } catch { return; }
  popup.dataset.lot = lot;
  popup.dataset.mapX = String(box.x + box.width / 2);
  popup.dataset.mapY = String(box.y + box.height / 2);
  popup.innerHTML = `
    <button type="button" class="sup-map-popup-close" aria-label="Cerrar detalle">×</button>
    <span>LOTE</span>
    <strong>${escapeHtml(values.lot)}</strong>
    <small>${escapeHtml(values.fundo)} · ${escapeHtml(values.modulo)}</small>
    <div class="sup-map-popup-grid">
      <div><b>${escapeHtml(values.captures)}</b><em>Capturas</em></div>
      <div><b>${escapeHtml(values.traps)}</b><em>Trampas</em></div>
      <div><b>${escapeHtml(values.evaluations)}</b><em>Evaluaciones</em></div>
    </div>
    <p>${escapeHtml(values.indicator)}</p>`;
  positionPopup(popup, transform);
}

function positionPopup(popup, transform) {
  if (!popup) return;
  const x = transform.x + Number(popup.dataset.mapX || 0) * transform.zoom;
  const y = transform.y + Number(popup.dataset.mapY || 0) * transform.zoom;
  const left = Math.min(82, Math.max(18, (x / MAP_W) * 100));
  const top = Math.min(88, Math.max(22, (y / MAP_H) * 100));
  popup.style.left = `${left}%`;
  popup.style.top = `${top}%`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}

function enhanceMap() {
  const svg = document.querySelector('#supMapSvg');
  if (!svg) return;
  const version = document.querySelector('.brand .muted');
  if (version && version.textContent !== `v${APP_VERSION}`) version.textContent = `v${APP_VERSION}`;
  ensureLabels(svg);
  const transform = parseWorldTransform(svg);
  updateLabels(svg, transform);
  ensurePopup(svg, transform);
  const hint = svg.closest('.sup-map-card')?.querySelector('.sup-map-hint');
  if (hint) hint.textContent = 'Arrastra para mover. Acerca el mapa para ver los nombres de los lotes y toca uno para consultar sus datos.';
}

function scheduleEnhance() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    enhanceMap();
  });
}

document.addEventListener('click', (event) => {
  const close = event.target.closest?.('.sup-map-popup-close');
  if (close) {
    const popup = close.closest('#supMapPopup');
    dismissedLot = popup?.dataset.lot || '';
    popup?.remove();
    event.stopPropagation();
    return;
  }
  if (event.target.closest?.('[data-sup-lot]')) dismissedLot = '';
  setTimeout(scheduleEnhance, 0);
});

document.addEventListener('change', () => setTimeout(scheduleEnhance, 0));
document.addEventListener('pointermove', (event) => {
  if (event.target.closest?.('#supMapSvg')) scheduleEnhance();
});
document.addEventListener('pointerup', (event) => {
  if (event.target.closest?.('#supMapSvg')) scheduleEnhance();
});
document.addEventListener('wheel', (event) => {
  if (event.target.closest?.('#supMapSvg')) scheduleEnhance();
}, { passive: true });

window.addEventListener('pageshow', scheduleEnhance);
document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleEnhance(); });
setInterval(enhanceMap, 1000);
scheduleEnhance();
