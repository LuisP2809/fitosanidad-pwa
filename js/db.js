const DB_NAME = 'fitosanidad-pwa';
const DB_VERSION = 1;

let dbPromise;

export function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('evaluaciones')) {
        const store = database.createObjectStore('evaluaciones', { keyPath: 'id' });
        store.createIndex('syncStatus', 'syncStatus', { unique: false });
        store.createIndex('tipo', 'tipo', { unique: false });
        store.createIndex('fecha', 'fecha', { unique: false });
      }
      if (!database.objectStoreNames.contains('usuarios')) {
        const store = database.createObjectStore('usuarios', { keyPath: 'id' });
        store.createIndex('username', 'username', { unique: true });
      }
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function txRequest(storeName, mode, operation) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let request;
    try { request = operation(store); } catch (error) { reject(error); return; }
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}

export const db = {
  put(store, value) { return txRequest(store, 'readwrite', (s) => s.put(value)); },
  add(store, value) { return txRequest(store, 'readwrite', (s) => s.add(value)); },
  get(store, key) { return txRequest(store, 'readonly', (s) => s.get(key)); },
  getAll(store) { return txRequest(store, 'readonly', (s) => s.getAll()); },
  delete(store, key) { return txRequest(store, 'readwrite', (s) => s.delete(key)); },
  clear(store) { return txRequest(store, 'readwrite', (s) => s.clear()); },
  async getSetting(key, fallback = null) {
    const row = await this.get('settings', key);
    return row ? row.value : fallback;
  },
  setSetting(key, value) { return this.put('settings', { key, value, updatedAt: new Date().toISOString() }); }
};

function bytesToBase64(bytes) {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

export function randomSalt() {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToBase64(new Uint8Array(digest));
}

export function validateAccessProfile(value) {
  if (!value || value.type !== 'fitosanidad-access-profile' || Number(value.version) !== 1) throw new Error('El perfil de acceso no es válido.');
  const user = value.user || {};
  const id = String(user.id || '').trim().toUpperCase();
  const username = String(user.username || '').trim().toLowerCase();
  const name = String(user.name || '').trim();
  const role = String(user.role || '').trim().toUpperCase();
  const token = String(value.deviceToken || '').trim();
  if (!/^[A-Z0-9_-]{3,40}$/.test(id) || !/^[a-z0-9._-]{3,30}$/.test(username) || !name) throw new Error('El perfil contiene un usuario incompleto.');
  if (!['ADMIN','SUPERVISOR','EVALUADOR'].includes(role)) throw new Error('El perfil contiene un rol no válido.');
  if (token.length < 32) throw new Error('El perfil no contiene un token válido.');
  return { id, username, name, role, deviceToken: token, serverVersion: String(value.serverVersion || '') };
}

export async function importAccessProfile(profile, endpoint, pin) {
  const parsed = validateAccessProfile(profile);
  const cleanEndpoint = String(endpoint || profile.endpoint || '').trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/.test(cleanEndpoint)) throw new Error('La URL de Google Apps Script no es válida.');
  if (!/^\d{6,}$/.test(String(pin || ''))) throw new Error('El PIN debe tener al menos 6 dígitos.');
  const salt = randomSalt();
  const pinHash = await hashPin(String(pin), salt);
  const allUsers = await db.getAll('usuarios');
  const conflict = allUsers.find((item) => item.username === parsed.username && item.id !== parsed.id);
  if (conflict) {
    if (conflict.central === true) throw new Error('Ese nombre de usuario ya está vinculado a otro perfil central.');
    await db.delete('usuarios', conflict.id);
  }
  const existing = await db.get('usuarios', parsed.id);
  const user = {
    ...(existing || {}),
    id: parsed.id,
    name: parsed.name,
    username: parsed.username,
    role: parsed.role,
    active: true,
    central: true,
    syncEndpoint: cleanEndpoint,
    deviceToken: parsed.deviceToken,
    serverVersion: parsed.serverVersion,
    salt,
    pinHash,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await db.put('usuarios', user);
  return user;
}

export async function verifyUser(username, pin) {
  const users = await db.getAll('usuarios');
  const normalized = String(username || '').trim().toLowerCase();
  const user = users.find((u) => u.username === normalized && u.active !== false);
  if (!user) return null;
  const digest = await hashPin(String(pin || ''), user.salt);
  return digest === user.pinHash ? user : null;
}

export async function updateLocalUserFromServer(userId, serverUser) {
  const local = await db.get('usuarios', userId);
  if (!local) return null;
  const updated = {
    ...local,
    name: serverUser.name || local.name,
    username: serverUser.username || local.username,
    role: serverUser.role || local.role,
    active: serverUser.active !== false,
    serverCheckedAt: new Date().toISOString()
  };
  await db.put('usuarios', updated);
  return updated;
}

export async function markUserDisabled(userId) {
  const local = await db.get('usuarios', userId);
  if (!local) return;
  await db.put('usuarios', { ...local, active: false, serverCheckedAt: new Date().toISOString() });
}
