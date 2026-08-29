const DB_NAME = 'fitosanidad-pwa';
const DB_VERSION = 1;

let dbPromise;

export function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('evaluaciones')) {
        const store = db.createObjectStore('evaluaciones', { keyPath: 'id' });
        store.createIndex('syncStatus', 'syncStatus', { unique: false });
        store.createIndex('tipo', 'tipo', { unique: false });
        store.createIndex('fecha', 'fecha', { unique: false });
      }
      if (!db.objectStoreNames.contains('usuarios')) {
        const store = db.createObjectStore('usuarios', { keyPath: 'id' });
        store.createIndex('username', 'username', { unique: true });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function txRequest(storeName, mode, operation) {
  return openDatabase().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
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
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return bytesToBase64(bytes);
}

export async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToBase64(new Uint8Array(digest));
}

export async function createUser({ name, username, role, pin }) {
  const salt = randomSalt();
  const pinHash = await hashPin(pin, salt);
  const user = {
    id: crypto.randomUUID(),
    name: name.trim(),
    username: username.trim().toLowerCase(),
    role,
    active: true,
    salt,
    pinHash,
    createdAt: new Date().toISOString()
  };
  await db.add('usuarios', user);
  return user;
}

export async function verifyUser(username, pin) {
  const users = await db.getAll('usuarios');
  const normalized = username.trim().toLowerCase();
  const user = users.find((u) => u.username === normalized && u.active);
  if (!user) return null;
  const digest = await hashPin(pin, user.salt);
  return digest === user.pinHash ? user : null;
}
