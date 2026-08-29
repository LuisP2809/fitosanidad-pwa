import { db, markUserDisabled, updateLocalUserFromServer } from './db.js';

export class CentralApiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CentralApiError';
    this.code = code || 'API_ERROR';
  }
}

export async function centralRequest(user, action, payload = {}) {
  if (!user?.syncEndpoint || !user?.deviceToken || !user?.id) throw new CentralApiError('NO_PROFILE', 'El usuario no tiene un perfil central configurado.');
  if (!navigator.onLine) throw new CentralApiError('OFFLINE', 'No hay conexión a internet.');

  const response = await fetch(user.syncEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, userId: user.id, deviceToken: user.deviceToken, ...payload })
  });
  if (!response.ok) throw new CentralApiError(`HTTP_${response.status}`, `HTTP ${response.status}`);
  const data = await response.json();
  if (!data.ok) {
    if (data.errorCode === 'USER_DISABLED') await markUserDisabled(user.id);
    throw new CentralApiError(data.errorCode, data.error || 'La solicitud fue rechazada.');
  }
  return data;
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

export function setCentralUserActive(user, targetUserId, active) {
  return centralRequest(user, 'setUserActive', { targetUserId, active });
}

export function rotateCentralUserToken(user, targetUserId) {
  return centralRequest(user, 'rotateUserToken', { targetUserId });
}

export function getCentralSnapshot(user, limit = 2000) {
  return centralRequest(user, 'snapshot', { limit });
}
