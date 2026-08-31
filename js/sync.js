import { db, markUserDisabled, updateLocalUserFromServer } from './db.js';

const DEVICE_STORAGE_KEY = 'fitosanidad-device-id-v1';
const REQUEST_TIMEOUT_MS = 15000;

export class CentralApiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CentralApiError';
    this.code = code || 'API_ERROR';
  }
}

function validateEndpoint(endpoint) {
  const value = String(endpoint || '').trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/.test(value)) {
    throw new CentralApiError('INVALID_ENDPOINT', 'La dirección del servidor no es válida.');
  }
  return value;
}

export function getDeviceId() {
  let value = '';
  try { value = String(localStorage.getItem(DEVICE_STORAGE_KEY) || '').trim(); } catch {}
  if (/^[A-Za-z0-9._:-]{8,120}$/.test(value)) return value;
  const random = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  value = `FIT-${random}`;
  try { localStorage.setItem(DEVICE_STORAGE_KEY, value); } catch {}
  return value;
}

export function getDeviceLabel() {
  const ua = navigator.userAgent || '';
  const mobile = /Android|iPhone|iPad|Mobile/i.test(ua);
  let system = mobile ? 'Celular' : 'PC';
  if (/Android/i.test(ua)) system = 'Android';
  else if (/iPhone|iPad/i.test(ua)) system = 'iPhone/iPad';
  else if (/Windows/i.test(ua)) system = 'PC Windows';
  else if (/Macintosh/i.test(ua)) system = 'Mac';
  let browser = 'Navegador';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua)) browser = 'Safari';
  return `${system} · ${browser}`;
}

async function postJson(endpoint, body) {
  if (!navigator.onLine) throw new CentralApiError('OFFLINE', 'No hay conexión a internet.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(validateEndpoint(endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) throw new CentralApiError(`HTTP_${response.status}`, `HTTP ${response.status}`);
    const data = await response.json();
    if (!data.ok) throw new CentralApiError(data.errorCode, data.error || 'La solicitud fue rechazada.');
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new CentralApiError('REQUEST_TIMEOUT', 'El servidor tardó demasiado en responder.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function centralRequest(user, action, payload = {}) {
  if (!user?.syncEndpoint || !user?.deviceToken || !user?.id) throw new CentralApiError('NO_PROFILE', 'El usuario no tiene un perfil central configurado.');
  try {
    return await postJson(user.syncEndpoint, {
      action,
      userId: user.id,
      deviceToken: user.deviceToken,
      deviceId: getDeviceId(),
      deviceLabel: getDeviceLabel(),
      ...payload
    });
  } catch (error) {
    if (error instanceof CentralApiError && error.code === 'USER_DISABLED') await markUserDisabled(user.id);
    throw error;
  }
}

export function redeemActivation(endpoint, activationCode) {
  return postJson(endpoint, {
    action: 'redeemActivation',
    activationCode: String(activationCode || '').trim(),
    deviceId: getDeviceId(),
    deviceLabel: getDeviceLabel()
  });
}

export async function checkCentralAccess(user) {
  const data = await centralRequest(user, 'ping');
  const updated = await updateLocalUserFromServer(user.id, data.user || {});
  return { ...data, localUser: updated };
}

export async function syncPending(user) {
  const all = await db.getAll('evaluaciones');
  const pending = all.filter((row) => row.evaluadorId === user.id && row.syncStatus !== 'confirmed');
  if (!pending.length) return { ok: true, confirmed: 0 };
  const data = await centralRequest(user, 'appendEvaluations', { records: pending });
  const confirmedIds = new Set(data.confirmedIds || []);
  for (const row of pending) {
    if (!confirmedIds.has(row.id)) continue;
    await db.put('evaluaciones', { ...row, syncStatus: 'confirmed', syncedAt: new Date().toISOString() });
  }
  return { ok: true, confirmed: confirmedIds.size };
}

export function listCentralUsers(user) { return centralRequest(user, 'listUsers'); }
export function createCentralUser(user, input) { return centralRequest(user, 'createUser', { user: input }); }
export function createCentralActivation(user, targetUserId) { return centralRequest(user, 'createActivation', { targetUserId }); }
export function setCentralUserActive(user, targetUserId, active) { return centralRequest(user, 'setUserActive', { targetUserId, active }); }
export function rotateCentralUserToken(user, targetUserId) { return centralRequest(user, 'rotateUserToken', { targetUserId }); }
export function getCentralSnapshot(user, limit = 2000) { return centralRequest(user, 'snapshot', { limit }); }
export function listCentralDevices(user) { return centralRequest(user, 'listDevices'); }
export function setCentralDeviceActive(user, targetDeviceId, active) { return centralRequest(user, 'setDeviceActive', { targetDeviceId, active }); }
