import { db } from './db.js';
import { getCentralSnapshot } from './sync.js';

const VERSION = '0.4.2';
const TYPES = {
  all: { label: 'Todas las evaluaciones', indicator: '' },
  bicho: { label: 'Bicho del cesto', indicator: 'C/T/D' },
  mosca: { label: 'Mosca de la fruta', indicator: 'MTD' },
  senasa: { label: 'Trampas oficiales SENASA', indicator: 'C/T/D' }
};

const state = {
  records: [],
  catalog: [],
  catalogLots: new Set(),
  geojson: null,
  user: null,
  selectedLot: '',
  loading: false,
  filters: { type: 'all', from: '', to: '', campo: '', fundo: '', modulo: '', evaluator: '' }
};

const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const fmt = (value, digits = 0) => Number(value || 0).toLocaleString('es-PE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const unique = (values) => [...new Set(values.filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'es', { numeric: true }));
const datePE = (value) => {
  const [y,m,d] = String(value || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(value || '—');
};

function roleCode(label = '') {
  const text = String(label).toLowerCase();
  if (text.includes('administrador')) return 'ADMIN';
  if (text.includes('supervisor')) return 'SUPERVISOR';
  if (text.includes('evaluador')) return 'EVALUADOR';
  return '';
}

function rememberSessionHint() {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const name = String(hero.querySelector('h1')?.textContent || '').replace(/^Hola,\s*/i, '').trim();
  const role = roleCode(hero.querySelector('p')?.textContent || '');
  if (!name || !role) return;
  const next = JSON.stringify({ name, role });
  if (sessionStorage.getItem('fitosanidad-session-hint') !== next) sessionStorage.setItem('fitosanidad-session-hint', next);
}

async function resolveCentralUser() {
  const users = await db.getAll('usuarios');
  const eligible = users.filter((user) => user?.central === true && user.active !== false && ['ADMIN','SUPERVISOR'].includes(user.role) && user.syncEndpoint && user.deviceToken);
  if (!eligible.length) return null;
  let hint = null;
  try { hint = JSON.parse(sessionStorage.getItem('fitosanidad-session-hint') || 'null'); } catch {}
  const exact = hint ? eligible.find((user) => user.name === hint.name && user.role === hint.role) : null;
  return exact || eligible.sort((a,b) => String(b.updatedAt || b.serverCheckedAt || '').localeCompare(String(a.updatedAt || a.serverCheckedAt || '')))[0];
}

async function loadData(force = false) {
  if (state.loading) return;
  state.loading = true;
  try {
    state.user = await resolveCentralUser();
    if (!state.user) throw new Error('No se encontró una sesión central de Supervisor o Administrador en este dispositivo.');
    const tasks = [];
    if (force || !state.records.length) tasks.push(getCentralSnapshot(state.user, 5000).then((data) => { state.records = data.records || []; }));
    if (!state.catalog.length) tasks.push(fetch('./data/catalogo-lotes.json').then((r) => {
      if (!r.ok) throw new Error('No se pudo cargar el catálogo de lotes.');
      return r.json();
    }).then((data) => {
      state.catalog = data;
      state.catalogLots = new Set(data.map((row) => row.lote));
    }));
    if (!state.geojson) tasks.push(fetch('./data/lotes-mapa.geojson').then((r) => {
      if (!r.ok) throw new Error('No se pudo cargar el mapa de lotes.');
      return r.json();
    }).then((data) => { state.geojson = data; }));
    await Promise.all(tasks);
  } finally {
    state.loading = false;
  }
}

function recordMatches(record) {
  const f = state.filters;
  if (f.type !== 'all' && record.tipo !== f.type) return false;
  if (f.from && String(record.fecha || '') < f.from) return false;
  if (f.to && String(record.fecha || '') > f.to) return false;
  if (f.campo && record.lugar !== f.campo) return false;
  if (f.fundo && record.fundo !== f.fundo) return false;
  if (f.modulo && record.modulo !== f.modulo) return false;
  if (f.evaluator && (record.evaluadorId || record.evaluador) !== f.evaluator) return false;
  return true;
}

function featureMatches(feature) {
  const p = feature?.properties || {};
  const f = state.filters;
  if (f.campo && p.CAMPO !== f.campo) return false;
  if (f.fundo && p.FUNDO !== f.fundo) return false;
  if (f.modulo && p.MODULO !== f.modulo) return false;
  return state.catalogLots.has(p.LOTE);
}

function option(value, label, selected) {
  return `<option value="${esc(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`;
}

function filterOptions() {
  const f = state.filters;
  const campos = unique(state.catalog.map((x) => x.campo));
  const fundos = unique(state.catalog.filter((x) => !f.campo || x.campo === f.campo).map((x) => x.fundo));
  const modulos = unique(state.catalog.filter((x) => (!f.campo || x.campo === f.campo) && (!f.fundo || x.fundo === f.fundo)).map((x) => x.modulo));
  const evaluators = new Map();
  state.records.forEach((r) => {
    const id = r.evaluadorId || r.evaluador;
    if (id) evaluators.set(id, r.evaluador || r.evaluadorId);
  });
  return { campos, fundos, modulos, evaluators: [...evaluators.entries()].sort((a,b) => a[1].localeCompare(b[1], 'es')) };
}

function filtersMarkup() {
  const { campos, fundos, modulos, evaluators } = filterOptions();
  const f = state.filters;
  return `<section class="sup-card sup-filters">
    <div class="sup-head"><div><span class="sup-eyebrow">FILTROS</span><h2>Mapa y dashboard fitosanitario</h2><p>Los indicadores se calculan únicamente con los registros que cumplen estos filtros.</p></div><button class="btn secondary small" id="supRefresh">↻ Actualizar</button></div>
    <div class="sup-filter-grid">
      <label>Evaluación<select id="supType">${Object.entries(TYPES).map(([key,item]) => option(key,item.label,f.type)).join('')}</select></label>
      <label>Desde<input id="supFrom" type="date" value="${esc(f.from)}"></label>
      <label>Hasta<input id="supTo" type="date" value="${esc(f.to)}"></label>
      <label>Campo<select id="supCampo">${option('','Todos',f.campo)}${campos.map((v) => option(v,v,f.campo)).join('')}</select></label>
      <label>Fundo<select id="supFundo" ${f.campo ? '' : 'disabled'}>${option('','Todos',f.fundo)}${fundos.map((v) => option(v,v,f.fundo)).join('')}</select></label>
      <label>Módulo<select id="supModulo" ${f.fundo ? '' : 'disabled'}>${option('','Todos',f.modulo)}${modulos.map((v) => option(v,v,f.modulo)).join('')}</select></label>
      <label>Evaluador<select id="supEvaluator">${option('','Todos',f.evaluator)}${evaluators.map(([id,name]) => option(id,name,f.evaluator)).join('')}</select></label>
      <button class="btn ghost small sup-clear" id="supClear">Limpiar filtros</button>
    </div>
  </section>`;
}

function aggregate(rows) {
  return {
    evaluations: rows.length,
    captures: rows.reduce((sum,r) => sum + Number(r.capturas || 0), 0),
    traps: rows.reduce((sum,r) => sum + Number(r.trampasRevisadas || 0), 0),
    lots: new Set(rows.map((r) => r.lote).filter(Boolean)).size
  };
}

function typeSummary(rows, type) {
  const typed = rows.filter((r) => r.tipo === type);
  return {
    count: typed.length,
    captures: typed.reduce((sum,r) => sum + Number(r.capturas || 0), 0),
    avg: typed.length ? typed.reduce((sum,r) => sum + Number(r.indicador || 0), 0) / typed.length : 0
  };
}

function kpisMarkup(rows) {
  const a = aggregate(rows);
  const type = state.filters.type;
  const avg = type === 'all' || !rows.length ? null : rows.reduce((sum,r) => sum + Number(r.indicador || 0), 0) / rows.length;
  return `<section class="sup-kpis">
    <article><span>Evaluaciones</span><strong>${fmt(a.evaluations)}</strong><small>Registros confirmados</small></article>
    <article><span>Lotes evaluados</span><strong>${fmt(a.lots)}</strong><small>Con al menos un registro</small></article>
    <article><span>Capturas</span><strong>${fmt(a.captures)}</strong><small>Total filtrado</small></article>
    <article><span>Trampas revisadas</span><strong>${fmt(a.traps)}</strong><small>Total filtrado</small></article>
    <article><span>${type === 'all' ? 'Indicador' : TYPES[type].indicator + ' promedio'}</span><strong>${avg == null ? '—' : fmt(avg,3)}</strong><small>${type === 'all' ? 'Elige un tipo para no mezclar MTD y C/T/D' : 'Promedio de evaluaciones'}</small></article>
  </section>`;
}

function typeCards(rows) {
  return `<section class="sup-type-grid">${['bicho','mosca','senasa'].map((type) => {
    const s = typeSummary(rows, type);
    return `<article class="sup-card"><span class="sup-eyebrow">${esc(TYPES[type].indicator)}</span><h3>${esc(TYPES[type].label)}</h3><div class="sup-type-metrics"><div><b>${fmt(s.count)}</b><small>evaluaciones</small></div><div><b>${fmt(s.captures)}</b><small>capturas</small></div><div><b>${fmt(s.avg,3)}</b><small>promedio</small></div></div></article>`;
  }).join('')}</section>`;
}

function rankData(rows, keyFn, valueFn) {
  const map = new Map();
  rows.forEach((r) => {
    const key = keyFn(r);
    if (!key) return;
    map.set(key, (map.get(key) || 0) + Number(valueFn(r) || 0));
  });
  return [...map.entries()].sort((a,b) => b[1] - a[1]);
}

function bars(title, subtitle, entries) {
  const top = entries.slice(0, 8);
  const max = Math.max(1, ...top.map((x) => x[1]));
  return `<article class="sup-card sup-chart"><div class="sup-chart-head"><h3>${esc(title)}</h3><span>${esc(subtitle)}</span></div>${top.length ? `<div class="sup-bars">${top.map(([label,value]) => `<div class="sup-bar-row"><div class="sup-bar-label" title="${esc(label)}">${esc(label)}</div><div class="sup-bar-track"><i style="width:${Math.max(3,(value/max)*100).toFixed(1)}%"></i></div><b>${fmt(value)}</b></div>`).join('')}</div>` : '<div class="sup-empty">Sin datos con estos filtros.</div>'}</article>`;
}

function weeklyChart(rows) {
  const weeks = new Map();
  rows.forEach((r) => {
    const key = `${r.year || ''}-S${String(r.week || '').padStart(2,'0')}`;
    if (key === '-S00') return;
    weeks.set(key, (weeks.get(key) || 0) + Number(r.capturas || 0));
  });
  const data = [...weeks.entries()].sort((a,b) => a[0].localeCompare(b[0])).slice(-12);
  if (!data.length) return `<article class="sup-card sup-chart"><div class="sup-chart-head"><h3>Evolución semanal</h3><span>Capturas</span></div><div class="sup-empty">Sin semanas disponibles.</div></article>`;
  const W = 720, H = 250, P = 34;
  const max = Math.max(1, ...data.map((x) => x[1]));
  const x = (i) => data.length === 1 ? W/2 : P + i*((W-2*P)/(data.length-1));
  const y = (v) => H-P-(Number(v || 0)/max)*(H-2*P);
  const points = data.map((item,i) => `${x(i).toFixed(1)},${y(item[1]).toFixed(1)}`).join(' ');
  return `<article class="sup-card sup-chart sup-line-card"><div class="sup-chart-head"><h3>Evolución semanal</h3><span>Capturas · últimas 12 semanas con datos</span></div><svg class="sup-line" viewBox="0 0 ${W} ${H}" role="img"><line x1="${P}" y1="${H-P}" x2="${W-P}" y2="${H-P}" class="axis"/><polyline points="${points}" class="trend"/>${data.map((item,i) => `<circle cx="${x(i)}" cy="${y(item[1])}" r="5" class="dotpoint"><title>${item[0]}: ${item[1]} capturas</title></circle><text x="${x(i)}" y="${H-10}" text-anchor="middle">${esc(item[0].replace(/^\d{4}-/,''))}</text>`).join('')}</svg></article>`;
}

function chartsMarkup(rows) {
  return `<section class="sup-chart-grid">${weeklyChart(rows)}${bars('Lotes con más capturas','Top 8',rankData(rows,(r)=>r.lote,(r)=>r.capturas))}${bars('Capturas por fundo','Comparativo operativo',rankData(rows,(r)=>r.fundo,(r)=>r.capturas))}${bars('Actividad por evaluador','Número de evaluaciones',rankData(rows,(r)=>r.evaluador || r.evaluadorId,()=>1))}</section>`;
}

function lotAggregates(rows) {
  const map = new Map();
  rows.forEach((r) => {
    if (!r.lote) return;
    const item = map.get(r.lote) || { evaluations: 0, captures: 0, traps: 0, indicatorSum: 0, last: null };
    item.evaluations += 1;
    item.captures += Number(r.capturas || 0);
    item.traps += Number(r.trampasRevisadas || 0);
    item.indicatorSum += Number(r.indicador || 0);
    if (!item.last || String(r.createdAt || r.fecha || '') > String(item.last.createdAt || item.last.fecha || '')) item.last = r;
    map.set(r.lote, item);
  });
  map.forEach((item) => { item.avgIndicator = item.evaluations ? item.indicatorSum/item.evaluations : 0; });
  return map;
}

function geometryParts(geometry) {
  if (geometry?.type === 'Polygon') return [geometry.coordinates];
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function mapProjection(features) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  features.forEach((f) => geometryParts(f.geometry).forEach((poly) => poly.forEach((ring) => ring.forEach(([x,y]) => {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }))));
  if (!Number.isFinite(minX)) return null;
  const W=1040,H=620,P=24,dx=Math.max(0.000001,maxX-minX),dy=Math.max(0.000001,maxY-minY);
  const scale=Math.min((W-2*P)/dx,(H-2*P)/dy),usedW=dx*scale,usedH=dy*scale,offX=(W-usedW)/2,offY=(H-usedH)/2;
  return { W,H, project: ([lon,lat]) => [offX+(lon-minX)*scale, H-(offY+(lat-minY)*scale)] };
}

function pathFor(feature, projection) {
  return geometryParts(feature.geometry).map((poly) => poly.map((ring) => ring.map((point,i) => {
    const [x,y] = projection.project(point);
    return `${i ? 'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') + ' Z').join(' ')).join(' ');
}

function colorFor(item, maxMetric) {
  if (!item?.evaluations) return '#e5ece8';
  const metric = state.filters.type === 'all' ? item.captures : item.avgIndicator;
  const t = maxMetric > 0 ? Math.min(1, metric/maxMetric) : 0;
  return `hsl(148 46% ${(78-t*35).toFixed(1)}%)`;
}

function lotDetail(feature, item) {
  if (!feature) return '<div class="sup-map-detail sup-empty">Toca un lote para ver su detalle.</div>';
  const p = feature.properties || {};
  const indicator = state.filters.type === 'all' ? '—' : `${TYPES[state.filters.type].indicator}: ${fmt(item?.avgIndicator || 0,3)}`;
  return `<div class="sup-map-detail"><span class="sup-eyebrow">LOTE</span><h3>${esc(p.LOTE)}</h3><dl><div><dt>Campo</dt><dd>${esc(p.CAMPO)}</dd></div><div><dt>Fundo</dt><dd>${esc(p.FUNDO)}</dd></div><div><dt>Módulo</dt><dd>${esc(p.MODULO)}</dd></div><div><dt>Evaluaciones</dt><dd>${fmt(item?.evaluations || 0)}</dd></div><div><dt>Capturas</dt><dd>${fmt(item?.captures || 0)}</dd></div><div><dt>Trampas</dt><dd>${fmt(item?.traps || 0)}</dd></div></dl><p><strong>${indicator}</strong></p>${item?.last ? `<p class="muted">Último registro: ${datePE(item.last.fecha)} · ${esc(item.last.evaluador || item.last.evaluadorId || '—')}</p>` : '<p class="muted">Sin evaluaciones con los filtros actuales.</p>'}</div>`;
}

function mapMarkup(rows) {
  const features = (state.geojson?.features || []).filter(featureMatches);
  const projection = mapProjection(features);
  const byLot = lotAggregates(rows);
  const metrics = [...byLot.values()].map((item) => state.filters.type === 'all' ? item.captures : item.avgIndicator);
  const maxMetric = Math.max(0,...metrics);
  const selectedFeature = features.find((f) => f.properties?.LOTE === state.selectedLot) || null;
  const selectedItem = selectedFeature ? byLot.get(selectedFeature.properties.LOTE) : null;
  const evaluated = features.filter((f) => byLot.has(f.properties?.LOTE)).length;
  return `<section class="sup-card sup-map-section"><div class="sup-head"><div><span class="sup-eyebrow">MAPA FITOSANITARIO</span><h2>${features.length} lotes visibles · ${evaluated} evaluados</h2><p>La intensidad del verde es <strong>relativa a los datos filtrados</strong>; no representa un umbral fitosanitario.</p></div></div><div class="sup-map-layout"><div class="sup-map-canvas">${projection ? `<svg id="supMapSvg" viewBox="0 0 ${projection.W} ${projection.H}" role="img" aria-label="Mapa de lotes fitosanitarios">${features.map((f) => {
    const lot=f.properties?.LOTE || '',item=byLot.get(lot);
    return `<path d="${pathFor(f,projection)}" fill="${colorFor(item,maxMetric)}" class="sup-lot ${state.selectedLot===lot?'selected':''}" data-sup-lot="${esc(lot)}"><title>${esc(lot)} · ${item?.evaluations || 0} evaluaciones · ${item?.captures || 0} capturas</title></path>`;
  }).join('')}</svg>` : '<div class="sup-empty">No hay lotes para los filtros seleccionados.</div>'}<div class="sup-map-legend"><span><i class="none"></i>Sin evaluación</span><span><i class="low"></i>Menor intensidad relativa</span><span><i class="high"></i>Mayor intensidad relativa</span></div></div>${lotDetail(selectedFeature,selectedItem)}</div></section>`;
}

function latestTable(rows) {
  const latest=[...rows].sort((a,b)=>String(b.createdAt || b.fecha || '').localeCompare(String(a.createdAt || a.fecha || ''))).slice(0,12);
  return `<section class="sup-card"><div class="sup-head"><div><span class="sup-eyebrow">ÚLTIMOS REGISTROS</span><h2>Detalle operativo</h2></div></div>${latest.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Evaluación</th><th>Fundo</th><th>Lote</th><th>Capturas</th><th>Trampas</th><th>Indicador</th><th>Evaluador</th></tr></thead><tbody>${latest.map((r)=>`<tr><td>${datePE(r.fecha)}</td><td>${esc(TYPES[r.tipo]?.label || r.tipoNombre || r.tipo)}</td><td>${esc(r.fundo)}</td><td>${esc(r.lote)}</td><td>${fmt(r.capturas)}</td><td>${fmt(r.trampasRevisadas)}</td><td>${esc(r.indicadorNombre || TYPES[r.tipo]?.indicator || '')} ${fmt(r.indicador,3)}</td><td>${esc(r.evaluador || r.evaluadorId || '')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="sup-empty">No hay registros para mostrar.</div>'}</section>`;
}

function renderDashboard(page) {
  const rows = state.records.filter(recordMatches);
  page.innerHTML = `<div class="sup-dashboard">${filtersMarkup()}${kpisMarkup(rows)}${typeCards(rows)}${chartsMarkup(rows)}${mapMarkup(rows)}${latestTable(rows)}</div>`;
  bindDashboard(page);
}

function bindDashboard(page) {
  const rerender = () => renderDashboard(page);
  page.querySelector('#supType')?.addEventListener('change',(e)=>{state.filters.type=e.target.value;state.selectedLot='';rerender();});
  page.querySelector('#supFrom')?.addEventListener('change',(e)=>{state.filters.from=e.target.value;rerender();});
  page.querySelector('#supTo')?.addEventListener('change',(e)=>{state.filters.to=e.target.value;rerender();});
  page.querySelector('#supCampo')?.addEventListener('change',(e)=>{state.filters.campo=e.target.value;state.filters.fundo='';state.filters.modulo='';state.selectedLot='';rerender();});
  page.querySelector('#supFundo')?.addEventListener('change',(e)=>{state.filters.fundo=e.target.value;state.filters.modulo='';state.selectedLot='';rerender();});
  page.querySelector('#supModulo')?.addEventListener('change',(e)=>{state.filters.modulo=e.target.value;state.selectedLot='';rerender();});
  page.querySelector('#supEvaluator')?.addEventListener('change',(e)=>{state.filters.evaluator=e.target.value;rerender();});
  page.querySelector('#supClear')?.addEventListener('click',()=>{state.filters={type:'all',from:'',to:'',campo:'',fundo:'',modulo:'',evaluator:''};state.selectedLot='';rerender();});
  page.querySelector('#supRefresh')?.addEventListener('click',async()=>{
    const btn=page.querySelector('#supRefresh');
    if (btn){btn.disabled=true;btn.textContent='Actualizando…';}
    try { await loadData(true); rerender(); } catch(error) { showError(page,error); }
  });
  page.querySelector('#supMapSvg')?.addEventListener('click',(event)=>{
    const path=event.target.closest?.('[data-sup-lot]');
    if (!path) return;
    state.selectedLot=path.dataset.supLot || '';
    rerender();
  });
}

function showError(page,error) {
  page.innerHTML=`<section class="sup-card sup-error"><h2>No se pudo cargar el dashboard</h2><p>${esc(error?.message || 'Error inesperado.')}</p><button class="btn secondary" id="supRetry">Reintentar</button></section>`;
  page.querySelector('#supRetry')?.addEventListener('click',()=>enhanceSummary(page,true));
}

async function enhanceSummary(page, force=false) {
  if (!page || state.loading || page.dataset.supervisionSafe === 'loading') return;
  page.dataset.supervisionSafe='loading';
  page.innerHTML='<section class="sup-card sup-loading">Cargando mapa y consolidado central…</section>';
  try {
    await loadData(force);
    renderDashboard(page);
    page.dataset.supervisionSafe='ready';
  } catch(error) {
    page.dataset.supervisionSafe='error';
    showError(page,error);
  }
}

function detectPage() {
  rememberSessionHint();
  const brandVersion=document.querySelector('.brand .muted');
  const versionText=`v${VERSION}`;
  if (brandVersion && brandVersion.textContent !== versionText) brandVersion.textContent=versionText;
  const page=document.querySelector('.page');
  if (!page) return;
  const heading=page.querySelector('.section-title h2')?.textContent?.trim() || '';
  if (heading === 'Resumen central' && !page.dataset.supervisionSafe) enhanceSummary(page);
}

let scheduled=false;
function scheduleDetect() {
  if (scheduled) return;
  scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;detectPage();});
}

const root=document.querySelector('#app');
if (root) {
  const observer=new MutationObserver(scheduleDetect);
  observer.observe(root,{childList:true});
}
detectPage();
