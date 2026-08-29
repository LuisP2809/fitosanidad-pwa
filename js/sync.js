import { db } from './db.js';

export async function getSyncConfig() {
  return {
    endpoint: await db.getSetting('syncEndpoint', '')
  };
}

export async function syncPending() {
  const { endpoint } = await getSyncConfig();
  if (!endpoint) return { ok: false, reason: 'NO_ENDPOINT', confirmed: 0 };
  if (!navigator.onLine) return { ok: false, reason: 'OFFLINE', confirmed: 0 };

  const all = await db.getAll('evaluaciones');
  const pending = all.filter((row) => row.syncStatus !== 'confirmed');
  if (!pending.length) return { ok: true, confirmed: 0 };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'appendEvaluations', records: pending })
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.error || 'La sincronización fue rechazada.');
  const confirmedIds = new Set(payload.confirmedIds || []);

  for (const row of pending) {
    if (!confirmedIds.has(row.id)) continue;
    await db.put('evaluaciones', { ...row, syncStatus: 'confirmed', syncedAt: new Date().toISOString() });
  }
  return { ok: true, confirmed: confirmedIds.size };
}
