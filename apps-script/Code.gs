/* Fitosanidad PWA 0.6.0 · servicio central Google Sheets.
 * Multi-dispositivo por credencial independiente, compatible con perfiles 0.5.x.
 * No contiene tokens, IDs de Drive ni datos reales.
 */

const FITO_VERSION = '0.6.0';
const SPREADSHEET_ID_PROPERTY = 'FITO_SPREADSHEET_ID';
const MAX_BATCH_SIZE = 200;
const MAX_SNAPSHOT_RECORDS = 5000;
const ACTIVATION_TTL_MS = 24 * 60 * 60 * 1000;
const ACTIVATION_PREFIX = 'FITO_ACTIVATION_';

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

const TECH_HEADERS = ['ID_REGISTRO','EVALUADOR_ID','EVALUADOR','FECHA_REGISTRO','LATITUD','LONGITUD','PRECISION_GPS'];
const USER_HEADERS = ['USUARIO_ID','USUARIO','NOMBRE','ROL','TOKEN_HASH','ACTIVO','CREADO','ULTIMO_ACCESO'];
const DEVICE_HEADERS = ['DISPOSITIVO_ID','USUARIO_ID','ETIQUETA','TOKEN_HASH','ACTIVO','CREADO','ULTIMO_ACCESO'];
const AUDIT_HEADERS = ['FECHA','ACCION','ACTOR_ID','OBJETIVO_ID','TIPO','DETALLE'];

function setupFitosanidad() {
  const props = PropertiesService.getScriptProperties();
  let spreadsheetId = props.getProperty(SPREADSHEET_ID_PROPERTY) || props.getProperty('SPREADSHEET_ID');
  let ss = null;
  try { if (spreadsheetId) ss = SpreadsheetApp.openById(spreadsheetId); } catch (error) { ss = null; }
  if (!ss) {
    ss = SpreadsheetApp.create('BD_FITOSANIDAD');
    spreadsheetId = ss.getId();
  }
  props.setProperty(SPREADSHEET_ID_PROPERTY, spreadsheetId);
  props.setProperty('SPREADSHEET_ID', spreadsheetId);

  Object.keys(SHEET_NAMES).forEach(function(type) { ensureEvaluationSheet_(ss, type); });
  ensureControlSheet_(ss, 'USUARIOS_SYNC', USER_HEADERS);
  ensureControlSheet_(ss, 'DISPOSITIVOS_SYNC', DEVICE_HEADERS);
  ensureControlSheet_(ss, 'AUDITORIA', AUDIT_HEADERS);

  const defaultSheet = ss.getSheetByName('Sheet1') || ss.getSheetByName('Hoja 1');
  if (defaultSheet && ss.getSheets().length > 1) ss.deleteSheet(defaultSheet);
  cleanupExpiredActivations_();
  return { version: FITO_VERSION, spreadsheetId: ss.getId(), spreadsheetUrl: ss.getUrl() };
}

function provisionInitialAdmin() {
  setupFitosanidad();
  if (findUser_('ADM-001')) throw new Error('ADM-001 ya existe. Usa un código de recuperación o Agregar dispositivo.');
  const profile = registerUser_({ id: 'ADM-001', username: 'admin', name: 'Administrador principal', role: 'ADMIN' });
  console.log('PERFIL_ADMIN=' + JSON.stringify(profile));
  return profile;
}

function rotateInitialAdminToken() {
  setupFitosanidad();
  if (!findUser_('ADM-001')) throw new Error('Primero ejecuta provisionInitialAdmin().');
  const profile = rotateTokenForUser_('ADM-001');
  console.log('PERFIL_ADMIN=' + JSON.stringify(profile));
  return profile;
}

function doGet() {
  return json_({ ok: true, app: 'fitosanidad-pwa', version: FITO_VERSION });
}

function doPost(e) {
  try {
    setupFitosanidad();
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = clean_(body.action);
    const allowed = [
      'ping','appendEvaluations','listUsers','createUser','setUserActive','rotateUserToken','snapshot',
      'createActivation','redeemActivation','listDevices','setDeviceActive'
    ];
    if (allowed.indexOf(action) < 0) throw apiError_('ACTION_NOT_ALLOWED', 'Acción no soportada.');

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      if (action === 'redeemActivation') return json_(redeemActivationAction_(body));
      if (action === 'ping') return json_(ping_(body));
      if (action === 'appendEvaluations') return json_(appendEvaluationsAction_(body));
      if (action === 'listUsers') return json_(listUsersAction_(body));
      if (action === 'listDevices') return json_(listDevicesAction_(body));
      if (action === 'setDeviceActive') return json_(setDeviceActiveAction_(body));
      if (action === 'createUser') return json_(createUserAction_(body));
      if (action === 'setUserActive') return json_(setUserActiveAction_(body));
      if (action === 'rotateUserToken') return json_(rotateUserTokenAction_(body));
      if (action === 'createActivation') return json_(createActivationAction_(body));
      if (action === 'snapshot') return json_(snapshotAction_(body));
      throw apiError_('ACTION_NOT_ALLOWED', 'Acción no soportada.');
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return json_({ ok: false, errorCode: error && error.code ? error.code : 'SERVER_ERROR', error: cleanError_(error) });
  }
}

function ping_(body) {
  const user = authenticate_(body);
  touchUser_(user.id);
  return { ok: true, version: FITO_VERSION, user: publicUser_(user) };
}

function appendEvaluationsAction_(body) {
  const user = authenticate_(body);
  const records = Array.isArray(body.records) ? body.records : [];
  if (records.length > MAX_BATCH_SIZE) throw apiError_('BATCH_TOO_LARGE', 'Máximo ' + MAX_BATCH_SIZE + ' registros por envío.');
  const confirmedIds = appendEvaluations_(records, user);
  touchUser_(user.id);
  audit_('SYNC', user.id, '', '', confirmedIds.length + ' registro(s) confirmado(s)');
  return { ok: true, version: FITO_VERSION, confirmedIds: confirmedIds };
}

function listUsersAction_(body) {
  const actor = authenticate_(body);
  requireAdmin_(actor);
  touchUser_(actor.id);
  return { ok: true, version: FITO_VERSION, users: listUsers_() };
}

function listDevicesAction_(body) {
  const actor = authenticate_(body);
  requireAdmin_(actor);
  touchUser_(actor.id);
  return { ok: true, version: FITO_VERSION, devices: listDeviceCredentials_() };
}

function setDeviceActiveAction_(body) {
  const actor = authenticate_(body);
  requireAdmin_(actor);
  const targetDeviceId = normalizeDeviceId_(body.targetDeviceId);
  const currentDeviceId = normalizeDeviceId_(body.deviceId);
  const active = body.active === true;
  if (!targetDeviceId) throw apiError_('INVALID_DEVICE', 'El dispositivo no tiene un identificador válido.');
  if (!active && currentDeviceId && currentDeviceId === targetDeviceId) throw apiError_('CURRENT_DEVICE', 'No puedes revocar el dispositivo que estás utilizando.');
  const credential = findDeviceCredentialAny_(targetDeviceId);
  if (!credential) throw apiError_('DEVICE_NOT_FOUND', 'Dispositivo no encontrado.');
  setDeviceCredentialActive_(credential.userId, targetDeviceId, active);
  audit_(active ? 'ACTIVATE_DEVICE' : 'REVOKE_DEVICE', actor.id, credential.userId, 'DEVICE', targetDeviceId);
  touchUser_(actor.id);
  return { ok: true, version: FITO_VERSION, devices: listDeviceCredentials_() };
}

function createUserAction_(body) {
  const actor = authenticate_(body);
  requireAdmin_(actor);
  const input = body.user || {};
  const role = normalizeRole_(input.role);
  if (role === 'ADMIN') throw apiError_('ROLE_NOT_ALLOWED', 'Desde la PWA solo se pueden crear Evaluadores o Supervisores.');
  const username = normalizeUsername_(input.username);
  const name = clean_(input.name).slice(0, 120);
  if (!name) throw apiError_('INVALID_NAME', 'Indica el nombre del usuario.');
  if (!username) throw apiError_('INVALID_USERNAME', 'El usuario debe tener entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo.');
  if (findUserByUsername_(username)) throw apiError_('USERNAME_EXISTS', 'Ese usuario ya existe.');

  const id = nextUserId_(role);
  registerUser_({ id: id, username: username, name: name, role: role });
  const activation = issueActivation_(id, actor.id, 'NEW_USER');
  touchUser_(actor.id);
  audit_('CREATE_USER', actor.id, id, role, username);
  return { ok: true, version: FITO_VERSION, activation: activation, users: listUsers_() };
}

function createActivationAction_(body) {
  const actor = authenticate_(body);
  requireAdmin_(actor);
  const targetId = clean_(body.targetUserId).toUpperCase();
  const target = findUser_(targetId);
  if (!target) throw apiError_('USER_NOT_FOUND', 'Usuario no encontrado.');
  if (!target.active) throw apiError_('USER_DISABLED', 'Activa el usuario antes de generar un acceso.');
  if (target.role === 'ADMIN' && target.id !== actor.id) throw apiError_('ADMIN_PROTECTED', 'No se puede generar acceso para otro Administrador.');
  const activation = issueActivation_(targetId, actor.id, target.role === 'ADMIN' ? 'ADMIN_MULTI_DEVICE' : 'MULTI_DEVICE');
  touchUser_(actor.id);
  audit_('CREATE_ACTIVATION', actor.id, targetId, target.role, target.role === 'ADMIN' ? 'Nuevo dispositivo Administrador' : 'Nuevo dispositivo');
  return { ok: true, version: FITO_VERSION, activation: activation };
}

function redeemActivationAction_(body) {
  cleanupExpiredActivations_();
  const code = normalizeActivationCode_(body.activationCode);
  if (!code) throw apiError_('INVALID_ACTIVATION', 'Código de activación inválido.');
  const props = PropertiesService.getScriptProperties();
  const key = activationKey_(code);
  const raw = props.getProperty(key);
  if (!raw) throw apiError_('INVALID_ACTIVATION', 'El código no existe, ya fue usado o venció.');

  let activation;
  try { activation = JSON.parse(raw); } catch (error) { activation = null; }
  if (!activation || !activation.userId || !activation.expiresAt) {
    props.deleteProperty(key);
    throw apiError_('INVALID_ACTIVATION', 'Código de activación inválido.');
  }
  if (new Date(activation.expiresAt).getTime() <= Date.now()) {
    props.deleteProperty(key);
    throw apiError_('ACTIVATION_EXPIRED', 'El código de activación venció. Solicita uno nuevo al Administrador.');
  }

  const user = findUser_(clean_(activation.userId).toUpperCase());
  if (!user) {
    props.deleteProperty(key);
    throw apiError_('USER_NOT_FOUND', 'El usuario asociado ya no existe.');
  }
  if (!user.active) throw apiError_('USER_DISABLED', 'Este usuario está desactivado.');

  const deviceId = normalizeDeviceId_(body.deviceId);
  const label = clean_(body.deviceLabel).slice(0, 120) || 'Dispositivo';
  const profile = deviceId ? issueDeviceProfile_(user, deviceId, label) : rotateTokenForUser_(user.id);
  props.deleteProperty(key);
  touchUser_(user.id);
  audit_('REDEEM_ACTIVATION', user.id, user.id, user.role, deviceId ? ('Dispositivo ' + deviceId) : 'Cliente legado');
  return { ok: true, version: FITO_VERSION, profile: profile, user: publicUser_(findUser_(user.id)) };
}

function setUserActiveAction_(body) {
  const actor = authenticate_(body);
  requireAdmin_(actor);
  const targetId = clean_(body.targetUserId).toUpperCase();
  const active = body.active === true;
  if (!targetId) throw apiError_('INVALID_USER', 'Falta el usuario objetivo.');
  if (targetId === actor.id && !active) throw apiError_('SELF_DISABLE', 'El Administrador no puede desactivarse a sí mismo.');
  const target = findUser_(targetId);
  if (!target) throw apiError_('USER_NOT_FOUND', 'Usuario no encontrado.');
  if (target.role === 'ADMIN' && !active) throw apiError_('ADMIN_PROTECTED', 'El Administrador principal no puede desactivarse desde la PWA.');
  setUserActive_(targetId, active);
  touchUser_(actor.id);
  audit_(active ? 'ACTIVATE_USER' : 'DEACTIVATE_USER', actor.id, targetId, target.role, '');
  return { ok: true, version: FITO_VERSION, users: listUsers_() };
}

function rotateUserTokenAction_(body) {
  const actor = authenticate_(body);
  requireAdmin_(actor);
  const targetId = clean_(body.targetUserId).toUpperCase();
  const target = findUser_(targetId);
  if (!target) throw apiError_('USER_NOT_FOUND', 'Usuario no encontrado.');
  if (target.role === 'ADMIN' && target.id !== actor.id) throw apiError_('ADMIN_PROTECTED', 'No se puede rotar otro Administrador.');
  const profile = rotateTokenForUser_(targetId);
  touchUser_(actor.id);
  audit_('ROTATE_TOKEN', actor.id, targetId, target.role, 'Token legado renovado por compatibilidad');
  return { ok: true, version: FITO_VERSION, profile: profile };
}

function snapshotAction_(body) {
  const actor = authenticate_(body);
  if (['ADMIN','SUPERVISOR'].indexOf(actor.role) < 0) throw apiError_('FORBIDDEN', 'Este perfil no puede consultar el consolidado central.');
  const limit = Math.max(1, Math.min(MAX_SNAPSHOT_RECORDS, Number(body.limit) || 2000));
  const records = snapshotRecords_(limit);
  touchUser_(actor.id);
  return { ok: true, version: FITO_VERSION, records: records, generatedAt: new Date().toISOString() };
}

function issueActivation_(userId, actorId, mode) {
  cleanupExpiredActivations_();
  const user = findUser_(userId);
  if (!user) throw apiError_('USER_NOT_FOUND', 'Usuario no encontrado.');
  if (!user.active) throw apiError_('USER_DISABLED', 'El usuario está desactivado.');

  const props = PropertiesService.getScriptProperties();
  let code = '';
  let key = '';
  for (let attempt = 0; attempt < 8; attempt++) {
    code = generateActivationCode_();
    key = activationKey_(code);
    if (!props.getProperty(key)) break;
    code = '';
  }
  if (!code) throw apiError_('ACTIVATION_ERROR', 'No se pudo generar un código único. Intenta nuevamente.');

  const expiresAt = new Date(Date.now() + ACTIVATION_TTL_MS).toISOString();
  props.setProperty(key, JSON.stringify({ userId: user.id, createdBy: clean_(actorId), mode: clean_(mode) || 'MULTI_DEVICE', expiresAt: expiresAt }));
  return { code: formatActivationCode_(code), expiresAt: expiresAt, user: publicUser_(user) };
}

function cleanupExpiredActivations_() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  Object.keys(all).forEach(function(key) {
    if (key.indexOf(ACTIVATION_PREFIX) !== 0) return;
    try {
      const item = JSON.parse(all[key]);
      if (!item.expiresAt || new Date(item.expiresAt).getTime() <= Date.now()) props.deleteProperty(key);
    } catch (error) {
      props.deleteProperty(key);
    }
  });
}

function generateActivationCode_() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const source = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  let code = '';
  for (let i = 0; i < 8; i++) {
    const pair = source.slice(i * 2, i * 2 + 2);
    code += alphabet[parseInt(pair, 16) % alphabet.length];
  }
  return code;
}

function normalizeActivationCode_(value) {
  const code = clean_(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z2-9]{8}$/.test(code) ? code : '';
}

function formatActivationCode_(code) {
  const normalized = normalizeActivationCode_(code);
  return normalized ? normalized.slice(0, 4) + '-' + normalized.slice(4) : '';
}

function activationKey_(code) {
  return ACTIVATION_PREFIX + sha256Hex_(normalizeActivationCode_(code));
}

function appendEvaluations_(records, user) {
  const ss = spreadsheet_();
  const confirmed = [];
  records.forEach(function(record) {
    validateRecord_(record);
    const sheet = ensureEvaluationSheet_(ss, record.tipo);
    if (existsId_(sheet, record.id)) {
      confirmed.push(String(record.id));
      return;
    }
    const indicator = calculateIndicator_(record.capturas, record.trampasRevisadas);
    const gps = record.gps || {};
    sheet.appendRow([
      Number(record.year), String(record.month || '').toUpperCase(), Number(record.week), parseDate_(record.fecha),
      String(record.lugar || ''), String(record.fundo || ''), String(record.modulo || ''), String(record.lote || ''),
      Number(record.capturas), Number(record.trampasRevisadas), 7, indicator,
      String(record.id), user.id, user.name, new Date(record.createdAt || new Date().toISOString()),
      gps.lat == null ? '' : Number(gps.lat), gps.lon == null ? '' : Number(gps.lon), gps.accuracy == null ? '' : Number(gps.accuracy)
    ]);
    confirmed.push(String(record.id));
  });
  return confirmed;
}

function snapshotRecords_(limit) {
  const ss = spreadsheet_();
  const all = [];
  Object.keys(SHEET_NAMES).forEach(function(type) {
    const sheet = ensureEvaluationSheet_(ss, type);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    const values = sheet.getRange(2, 1, lastRow - 1, 19).getValues();
    values.forEach(function(row) {
      all.push({
        id: clean_(row[12]), tipo: type,
        tipoNombre: type === 'bicho' ? 'Bicho del cesto' : type === 'mosca' ? 'Mosca de la fruta' : 'Trampas oficiales de SENASA',
        fecha: dateToIso_(row[3]), year: Number(row[0] || 0), month: clean_(row[1]), week: Number(row[2] || 0),
        lugar: clean_(row[4]), fundo: clean_(row[5]), modulo: clean_(row[6]), lote: clean_(row[7]),
        capturas: Number(row[8] || 0), trampasRevisadas: Number(row[9] || 0), diasRevision: 7,
        indicador: Number(row[11] || 0), indicadorNombre: type === 'mosca' ? 'MTD' : 'C/T/D',
        evaluadorId: clean_(row[13]), evaluador: clean_(row[14]), createdAt: dateTimeToIso_(row[15]),
        gps: row[16] === '' || row[17] === '' ? null : { lat: Number(row[16]), lon: Number(row[17]), accuracy: row[18] === '' ? null : Number(row[18]) },
        syncStatus: 'confirmed'
      });
    });
  });
  all.sort(function(a, b) { return String(b.createdAt || b.fecha).localeCompare(String(a.createdAt || a.fecha)); });
  return all.slice(0, limit);
}

function registerUser_(input) {
  const id = clean_(input.id).toUpperCase();
  const username = normalizeUsername_(input.username);
  const name = clean_(input.name).slice(0, 120);
  const role = normalizeRole_(input.role);
  if (!/^[A-Z0-9_-]{3,40}$/.test(id)) throw new Error('ID de usuario inválido.');
  if (!username || !name) throw new Error('Usuario incompleto.');
  if (findUser_(id)) throw new Error('El ID de usuario ya existe.');
  if (findUserByUsername_(username)) throw new Error('El nombre de usuario ya existe.');
  const token = generateToken_();
  const sheet = spreadsheet_().getSheetByName('USUARIOS_SYNC');
  sheet.appendRow([id, username, name, role, sha256Hex_(token), true, new Date(), '']);
  return accessProfile_(id, username, name, role, token, '');
}

function rotateTokenForUser_(id) {
  const sheet = spreadsheet_().getSheetByName('USUARIOS_SYNC');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (clean_(rows[i][0]).toUpperCase() !== id) continue;
    const token = generateToken_();
    sheet.getRange(i + 1, 5).setValue(sha256Hex_(token));
    return accessProfile_(id, clean_(rows[i][1]), clean_(rows[i][2]), normalizeRole_(rows[i][3]), token, '');
  }
  throw new Error('Usuario no encontrado.');
}

function issueDeviceProfile_(user, deviceId, label) {
  const token = generateToken_();
  upsertDeviceCredential_(deviceId, user, sha256Hex_(token), true, label);
  return accessProfile_(user.id, user.username, user.name, user.role, token, deviceId);
}

function accessProfile_(id, username, name, role, token, deviceId) {
  return {
    type: 'fitosanidad-access-profile', version: 1, serverVersion: FITO_VERSION,
    user: { id: id, username: username, name: name, role: role },
    deviceId: normalizeDeviceId_(deviceId), deviceToken: token
  };
}

function listUsers_() {
  const sheet = spreadsheet_().getSheetByName('USUARIOS_SYNC');
  const rows = sheet.getDataRange().getValues();
  return rows.slice(1).filter(function(row) { return clean_(row[0]); }).map(function(row) {
    return {
      id: clean_(row[0]).toUpperCase(), username: clean_(row[1]), name: clean_(row[2]), role: normalizeRole_(row[3]),
      active: row[5] === true || String(row[5]).toUpperCase() === 'TRUE',
      createdAt: dateTimeToIso_(row[6]), lastAccessAt: dateTimeToIso_(row[7])
    };
  });
}

function findUser_(id) {
  const wanted = clean_(id).toUpperCase();
  if (!wanted) return null;
  return listUsersInternal_().filter(function(user) { return user.id === wanted; })[0] || null;
}

function findUserByUsername_(username) {
  const wanted = normalizeUsername_(username);
  if (!wanted) return null;
  return listUsersInternal_().filter(function(user) { return user.username === wanted; })[0] || null;
}

function listUsersInternal_() {
  const sheet = spreadsheet_().getSheetByName('USUARIOS_SYNC');
  const rows = sheet.getDataRange().getValues();
  return rows.slice(1).filter(function(row) { return clean_(row[0]); }).map(function(row) {
    return {
      id: clean_(row[0]).toUpperCase(), username: clean_(row[1]), name: clean_(row[2]), role: normalizeRole_(row[3]),
      tokenHash: clean_(row[4]), active: row[5] === true || String(row[5]).toUpperCase() === 'TRUE'
    };
  });
}

function authenticate_(body) {
  const id = clean_(body.userId).toUpperCase();
  const token = clean_(body.deviceToken);
  const user = findUser_(id);
  if (!user || !token) throw apiError_('UNAUTHORIZED', 'Dispositivo no autorizado.');
  if (!user.active) throw apiError_('USER_DISABLED', 'Usuario desactivado.');

  const tokenHash = sha256Hex_(token);
  const deviceId = normalizeDeviceId_(body.deviceId);
  if (deviceId) {
    const credential = findDeviceCredential_(id, deviceId);
    if (credential) {
      if (!credential.active) throw apiError_('DEVICE_REVOKED', 'Este dispositivo fue revocado.');
      if (!constantTimeEqual_(tokenHash, credential.tokenHash)) throw apiError_('UNAUTHORIZED', 'Dispositivo no autorizado.');
      touchDeviceCredential_(id, deviceId, clean_(body.deviceLabel).slice(0, 120));
      return user;
    }
  }

  if (user.tokenHash && constantTimeEqual_(tokenHash, user.tokenHash)) {
    if (deviceId) upsertDeviceCredential_(deviceId, user, tokenHash, true, clean_(body.deviceLabel).slice(0, 120) || 'Dispositivo migrado');
    return user;
  }
  throw apiError_('UNAUTHORIZED', 'Dispositivo no autorizado.');
}

function publicUser_(user) {
  return { id: user.id, username: user.username, name: user.name, role: user.role, active: user.active };
}

function requireAdmin_(user) {
  if (!user || user.role !== 'ADMIN') throw apiError_('FORBIDDEN', 'Solo el Administrador puede realizar esta acción.');
}

function listDeviceCredentials_() {
  const sheet = spreadsheet_().getSheetByName('DISPOSITIVOS_SYNC');
  if (!sheet || sheet.getLastRow() < 2) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, DEVICE_HEADERS.length).getValues();
  return rows.filter(function(row) { return clean_(row[0]) && clean_(row[1]); }).map(function(row) {
    return {
      deviceId: normalizeDeviceId_(row[0]), userId: clean_(row[1]).toUpperCase(), label: clean_(row[2]) || 'Dispositivo',
      active: row[4] === true || String(row[4]).toUpperCase() === 'TRUE', createdAt: dateTimeToIso_(row[5]), lastAccessAt: dateTimeToIso_(row[6])
    };
  });
}

function findDeviceCredential_(userId, deviceId) {
  const wantedUser = clean_(userId).toUpperCase();
  const wantedDevice = normalizeDeviceId_(deviceId);
  if (!wantedUser || !wantedDevice) return null;
  const sheet = spreadsheet_().getSheetByName('DISPOSITIVOS_SYNC');
  if (!sheet || sheet.getLastRow() < 2) return null;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, DEVICE_HEADERS.length).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (clean_(rows[i][1]).toUpperCase() !== wantedUser || normalizeDeviceId_(rows[i][0]) !== wantedDevice) continue;
    return {
      row: i + 2, deviceId: wantedDevice, userId: wantedUser, label: clean_(rows[i][2]), tokenHash: clean_(rows[i][3]),
      active: rows[i][4] === true || String(rows[i][4]).toUpperCase() === 'TRUE', createdAt: dateTimeToIso_(rows[i][5]), lastAccessAt: dateTimeToIso_(rows[i][6])
    };
  }
  return null;
}

function findDeviceCredentialAny_(deviceId) {
  const wanted = normalizeDeviceId_(deviceId);
  if (!wanted) return null;
  return listDeviceCredentials_().filter(function(item) { return item.deviceId === wanted; })[0] || null;
}

function upsertDeviceCredential_(deviceId, user, tokenHash, active, label) {
  const normalized = normalizeDeviceId_(deviceId);
  if (!normalized) throw apiError_('INVALID_DEVICE', 'El dispositivo no tiene un identificador válido.');
  const sheet = spreadsheet_().getSheetByName('DISPOSITIVOS_SYNC');
  const existing = findDeviceCredential_(user.id, normalized);
  const now = new Date();
  const created = existing && existing.createdAt ? new Date(existing.createdAt) : now;
  const values = [normalized, user.id, clean_(label).slice(0, 120) || (existing && existing.label) || 'Dispositivo', clean_(tokenHash), active === true, created, now];
  if (existing) sheet.getRange(existing.row, 1, 1, values.length).setValues([values]);
  else sheet.appendRow(values);
  return true;
}

function setDeviceCredentialActive_(userId, deviceId, active) {
  const credential = findDeviceCredential_(userId, deviceId);
  if (!credential) return false;
  spreadsheet_().getSheetByName('DISPOSITIVOS_SYNC').getRange(credential.row, 5).setValue(active === true);
  return true;
}

function touchDeviceCredential_(userId, deviceId, label) {
  const credential = findDeviceCredential_(userId, deviceId);
  if (!credential) return;
  const sheet = spreadsheet_().getSheetByName('DISPOSITIVOS_SYNC');
  if (clean_(label) && clean_(label) !== credential.label) sheet.getRange(credential.row, 3).setValue(clean_(label).slice(0, 120));
  sheet.getRange(credential.row, 7).setValue(new Date());
}

function normalizeDeviceId_(value) {
  const text = clean_(value);
  return /^[A-Za-z0-9._:-]{8,120}$/.test(text) ? text : '';
}

function setUserActive_(id, active) {
  const sheet = spreadsheet_().getSheetByName('USUARIOS_SYNC');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (clean_(rows[i][0]).toUpperCase() !== id) continue;
    sheet.getRange(i + 1, 6).setValue(active === true);
    return true;
  }
  return false;
}

function touchUser_(id) {
  const sheet = spreadsheet_().getSheetByName('USUARIOS_SYNC');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (clean_(rows[i][0]).toUpperCase() !== id) continue;
    sheet.getRange(i + 1, 8).setValue(new Date());
    return;
  }
}

function nextUserId_(role) {
  const prefix = role === 'SUPERVISOR' ? 'SUP-' : 'EVA-';
  let max = 0;
  listUsers_().forEach(function(user) {
    if (user.id.indexOf(prefix) !== 0) return;
    const n = Number(user.id.slice(prefix.length));
    if (Number.isFinite(n)) max = Math.max(max, n);
  });
  return prefix + String(max + 1).padStart(3, '0');
}

function ensureEvaluationSheet_(ss, type) {
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
  } else {
    const current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
    if (clean_(current[12]) === 'ID_REGISTRO' && clean_(current[13]) === 'EVALUADOR') {
      sheet.insertColumnAfter(13);
      sheet.getRange(1, 14).setValue('EVALUADOR_ID');
      const last = sheet.getLastRow();
      if (last > 1) sheet.getRange(2, 14, last - 1, 1).setValue('LEGACY');
    }
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    try { sheet.hideColumns(13, TECH_HEADERS.length); } catch (error) {}
  }
  return sheet;
}

function ensureControlSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#d9ead3');
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
  if (!Number.isFinite(c) || c < 0 || Math.floor(c) !== c) throw apiError_('INVALID_CAPTURES', 'Capturas inválidas.');
  if (!Number.isFinite(t) || t <= 0 || Math.floor(t) !== t) throw apiError_('INVALID_TRAPS', 'Trampas revisadas inválidas.');
  return c / (t * 7);
}

function validateRecord_(record) {
  if (!record || !record.id) throw apiError_('INVALID_RECORD', 'Registro sin ID.');
  if (!SHEET_NAMES[record.tipo]) throw apiError_('INVALID_TYPE', 'Tipo inválido.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(record.fecha || ''))) throw apiError_('INVALID_DATE', 'Fecha inválida.');
  if (!record.lugar || !record.fundo || !record.modulo || !record.lote) throw apiError_('INVALID_LOCATION', 'Ubicación incompleta.');
  calculateIndicator_(record.capturas, record.trampasRevisadas);
}

function audit_(action, actorId, targetId, type, detail) {
  spreadsheet_().getSheetByName('AUDITORIA').appendRow([new Date(), clean_(action), clean_(actorId), clean_(targetId), clean_(type), clean_(detail)]);
}

function spreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(SPREADSHEET_ID_PROPERTY) || props.getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Ejecuta setupFitosanidad() primero.');
  return SpreadsheetApp.openById(id);
}

function normalizeRole_(value) {
  const role = clean_(value).toUpperCase();
  if (['ADMIN','SUPERVISOR','EVALUADOR'].indexOf(role) < 0) throw apiError_('INVALID_ROLE', 'Rol inválido.');
  return role;
}

function normalizeUsername_(value) {
  const username = clean_(value).toLowerCase();
  return /^[a-z0-9._-]{3,30}$/.test(username) ? username : '';
}

function generateToken_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

function sha256Hex_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8)
    .map(function(byte) { const v = byte < 0 ? byte + 256 : byte; return ('0' + v.toString(16)).slice(-2); }).join('');
}

function constantTimeEqual_(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function parseDate_(iso) {
  const parts = String(iso).split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function dateToIso_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return Utilities.formatDate(value, Session.getScriptTimeZone() || 'America/Lima', 'yyyy-MM-dd');
  const text = clean_(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function dateTimeToIso_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
  const text = clean_(value);
  if (!text) return '';
  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function clean_(value) { return String(value == null ? '' : value).trim(); }
function cleanError_(error) { return clean_(error && error.message ? error.message : error).slice(0, 500) || 'Error del servidor.'; }
function apiError_(code, message) { const error = new Error(message); error.code = code; return error; }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
