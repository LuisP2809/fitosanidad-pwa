import { db, markUserDisabled, updateLocalUserFromServer } from './db.js';

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

async function postJson(endpoint, body) {
  if (!navigator.onLine) throw new CentralApiError('OFFLINE', 'No hay conexión a internet.');
  const response = await fetch(validateEndpoint(endpoint), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new CentralApiError(`HTTP_${response.status}`, `HTTP ${response.status}`);
  const data = await response.json();
  if (!data.ok) throw new CentralApiError(data.errorCode, data.error || 'La solicitud fue rechazada.');
  return data;
}

export async function centralRequest(user, action, payload = {}) {
  if (!user?.syncEndpoint || !user?.deviceToken || !user?.id) throw new CentralApiError('NO_PROFILE', 'El usuario no tiene un perfil central configurado.');
  try {
    return await postJson(user.syncEndpoint, { action, userId: user.id, deviceToken: user.deviceToken, ...payload });
  } catch (error) {
    if (error instanceof CentralApiError && error.code === 'USER_DISABLED') await markUserDisabled(user.id);
    throw error;
  }
}

export function redeemActivation(endpoint, activationCode) {
  return postJson(endpoint, { action: 'redeemActivation', activationCode: String(activationCode || '').trim() });
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

export function listCentralUsers(user) {
  return centralRequest(user, 'listUsers');
}

export function createCentralUser(user, input) {
  return centralRequest(user, 'createUser', { user: input });
}

export function createCentralActivation(user, targetUserId) {
  return centralRequest(user, 'createActivation', { targetUserId });
}

export function setCentralUserActive(user, targetUserId, active) {
  return centralRequest(user, 'setUserActive', { targetUserId, active });
}

export function rotateCentralUserToken(user, targetUserId) {
  return centralRequest(user, 'rotateUserToken', { targetUserId });
}

export function getCentralSnapshot(user, limit = 2000) {
  return centralRequest(user, 'snapshot', { limit });
}
