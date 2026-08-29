const FITO_VERSION = '0.1.0';
const SHEET_NAMES = {
  bicho: 'BICHO DEL CESTO',
  mosca: 'MOSCA DE LA FRUTA',
  senasa: 'TRAMPAS OFICIALES DE SENASA'
};

const HEADERS = {
  bicho: ['AÑO','MES','SEMANA','FECHA','LUGAR','FUNDO','MODULO','LOTE','CAPTURAS','TRAMPAS REVISADAS','DIAS DE REVISION','C/T/D'],
  mosca: ['AÑO','MES','Semana','FECHA','LUGAR','FUNDO','MÓDULO','LOTE','MOSCAS CAPTURADAS','TRAMPAS REVISADAS','DIAS DE REVISION','MTD'],
  senasa: ['AÑO','MES','SEMANA','FECHA','LUGAR','FUNDO','MODULO','LOTE','CAPTURAS','TRAMPAS REVISADAS','DIAS DE REVISION','C/T/D']
};

const TECH_HEADERS = ['ID_REGISTRO','EVALUADOR','FECHA_REGISTRO','LATITUD','LONGITUD','PRECISION_GPS'];

function doGet() {
  return json_({ ok: true, app: 'fitosanidad-pwa', version: FITO_VERSION });
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (payload.action !== 'appendEvaluations') throw new Error('Acción no soportada.');
    const confirmedIds = appendEvaluations_(payload.records || []);
    return json_({ ok: true, confirmedIds: confirmedIds });
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function setupFitosanidad() {
  const props = PropertiesService.getScriptProperties();
  let spreadsheetId = props.getProperty('SPREADSHEET_ID');
  let ss;
  if (spreadsheetId) {
    ss = SpreadsheetApp.openById(spreadsheetId);
  } else {
    ss = SpreadsheetApp.create('BD_FITOSANIDAD');
    spreadsheetId = ss.getId();
    props.setProperty('SPREADSHEET_ID', spreadsheetId);
  }

  Object.keys(SHEET_NAMES).forEach(function(type) {
    ensureSheet_(ss, type);
  });

  let audit = ss.getSheetByName('AUDITORIA');
  if (!audit) audit = ss.insertSheet('AUDITORIA');
  if (audit.getLastRow() === 0) {
    audit.getRange(1, 1, 1, 5).setValues([['FECHA','ACCION','ID_REGISTRO','TIPO','DETALLE']]);
    audit.setFrozenRows(1);
  }

  return { spreadsheetId: spreadsheetId, spreadsheetUrl: ss.getUrl() };
}

function appendEvaluations_(records) {
  if (!Array.isArray(records)) throw new Error('records debe ser un arreglo.');
  if (records.length > 500) throw new Error('Máximo 500 registros por envío.');

  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) throw new Error('Ejecuta setupFitosanidad() antes de publicar el Web App.');

  const ss = SpreadsheetApp.openById(spreadsheetId);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    const confirmed = [];
    records.forEach(function(record) {
      validateRecord_(record);
      const sheet = ensureSheet_(ss, record.tipo);
      if (existsId_(sheet, record.id)) {
        confirmed.push(record.id);
        return;
      }

      const indicator = calculateIndicator_(record.capturas, record.trampasRevisadas);
      const gps = record.gps || {};
      const row = [
        Number(record.year),
        String(record.month || '').toUpperCase(),
        Number(record.week),
        parseDate_(record.fecha),
        String(record.lugar || ''),
        String(record.fundo || ''),
        String(record.modulo || ''),
        String(record.lote || ''),
        Number(record.capturas),
        Number(record.trampasRevisadas),
        7,
        indicator,
        String(record.id),
        String(record.evaluador || ''),
        new Date(record.createdAt || new Date().toISOString()),
        gps.lat == null ? '' : Number(gps.lat),
        gps.lon == null ? '' : Number(gps.lon),
        gps.accuracy == null ? '' : Number(gps.accuracy)
      ];
      sheet.appendRow(row);
      confirmed.push(record.id);
    });
    return confirmed;
  } finally {
    lock.releaseLock();
  }
}

function ensureSheet_(ss, type) {
  const name = SHEET_NAMES[type];
  if (!name) throw new Error('Tipo de evaluación inválido: ' + type);
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  const headers = HEADERS[type].concat(TECH_HEADERS);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 12).setFontWeight('bold').setBackground('#d9ead3');
    sheet.hideColumns(13, TECH_HEADERS.length);
  }
  return sheet;
}

function existsId_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const values = sheet.getRange(2, 13, lastRow - 1, 1).getValues();
  return values.some(function(row) { return String(row[0]) === String(id); });
}

function calculateIndicator_(captures, traps) {
  const c = Number(captures);
  const t = Number(traps);
  if (!Number.isFinite(c) || c < 0) throw new Error('Capturas inválidas.');
  if (!Number.isFinite(t) || t <= 0) throw new Error('Trampas revisadas inválidas.');
  return c / (t * 7);
}

function validateRecord_(record) {
  if (!record || !record.id) throw new Error('Registro sin ID.');
  if (!SHEET_NAMES[record.tipo]) throw new Error('Tipo inválido.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(record.fecha || ''))) throw new Error('Fecha inválida.');
  if (!record.lugar || !record.fundo || !record.modulo || !record.lote) throw new Error('Ubicación incompleta.');
  calculateIndicator_(record.capturas, record.trampasRevisadas);
}

function parseDate_(iso) {
  const parts = String(iso).split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
