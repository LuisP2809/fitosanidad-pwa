/* Fitosanidad 0.6.1 · acelerador de navegación central.
 * Se carga antes de app.js y comparte las lecturas de Apps Script entre
 * Registros, Resumen, Administración y los módulos auxiliares.
 * Los datos se mantienen solo en memoria del navegador; no guarda tokens.
 */
(() => {
  const originalFetch = window.fetch.bind(window);
  const ENDPOINT_RE = /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/;
  const READ_ACTIONS = new Set(['snapshot', 'listUsers', 'listDevices']);
  const FRESH_MS = 45 * 1000;
  const MAX_STALE_MS = 5 * 60 * 1000;
  const MIN_SNAPSHOT_LIMIT = 5000;

  const cache = new Map();
  const inFlight = new Map();

  function requestMeta(input, init = {}) {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input || '');
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (method !== 'POST' || !ENDPOINT_RE.test(url)) return null;
    if (typeof init.body !== 'string') return null;
    try {
      const body = JSON.parse(init.body);
      if (!body || typeof body.action !== 'string') return null;
      return { url, body };
    } catch {
      return null;
    }
  }

  function cacheKey(url, body) {
    return [url, body.action, body.userId || '', body.deviceId || ''].join('|');
  }

  function responseFrom(record) {
    return new Response(record.text, {
      status: record.status,
      statusText: record.statusText,
      headers: record.headers
    });
  }

  async function responseRecord(response) {
    const text = await response.clone().text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    return {
      text,
      status: response.status,
      statusText: response.statusText,
      headers: Array.from(response.headers.entries()),
      cacheable: response.ok && data?.ok === true
    };
  }

  function normalizedRead(body) {
    if (body.action !== 'snapshot') return body;
    return { ...body, limit: Math.max(MIN_SNAPSHOT_LIMIT, Number(body.limit) || 0) };
  }

  function startRead(url, init, body, key) {
    const previous = cache.get(key);
    const normalized = normalizedRead(body);
    const promise = originalFetch(url, { ...init, body: JSON.stringify(normalized) })
      .then(responseRecord)
      .then((record) => {
        if (record.cacheable) cache.set(key, { record, at: Date.now() });
        return record;
      })
      .catch((error) => {
        if (previous) cache.set(key, previous);
        throw error;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
  }

  function readThroughCache(url, init, body) {
    const key = cacheKey(url, body);
    const saved = cache.get(key);
    const age = saved ? Date.now() - saved.at : Infinity;

    if (saved && age <= FRESH_MS) return Promise.resolve(responseFrom(saved.record));

    if (saved && age <= MAX_STALE_MS) {
      if (!inFlight.has(key)) startRead(url, init, body, key).catch(() => {});
      return Promise.resolve(responseFrom(saved.record));
    }

    const pending = inFlight.get(key) || startRead(url, init, body, key);
    return pending.then(responseFrom);
  }

  function invalidateMatching(url, action, userId = '') {
    for (const key of cache.keys()) {
      const prefix = `${url}|${action}|${userId}|`;
      if (key.startsWith(prefix)) cache.delete(key);
    }
  }

  function invalidateForMutation(url, body) {
    const userId = body.userId || '';
    if (body.action === 'appendEvaluations') invalidateMatching(url, 'snapshot', userId);
    if (['createUser', 'setUserActive', 'rotateUserToken'].includes(body.action)) invalidateMatching(url, 'listUsers', userId);
    if (body.action === 'setDeviceActive') invalidateMatching(url, 'listDevices', userId);
    if (body.action === 'redeemActivation') cache.clear();
  }

  function warmAfterPing(url, init, body, response) {
    let clone;
    try { clone = response.clone(); } catch { return; }
    clone.json().then((data) => {
      if (!data?.ok || !data.user || !body.userId || !body.deviceToken) return;
      const auth = {
        userId: body.userId,
        deviceToken: body.deviceToken,
        deviceId: body.deviceId,
        deviceLabel: body.deviceLabel
      };
      const baseInit = {
        method: 'POST',
        headers: init.headers || { 'Content-Type': 'text/plain;charset=utf-8' }
      };
      queueMicrotask(() => {
        window.fetch(url, { ...baseInit, body: JSON.stringify({ action: 'snapshot', ...auth, limit: MIN_SNAPSHOT_LIMIT }) }).catch(() => {});
        if (data.user.role === 'ADMIN') {
          window.fetch(url, { ...baseInit, body: JSON.stringify({ action: 'listUsers', ...auth }) }).catch(() => {});
          window.fetch(url, { ...baseInit, body: JSON.stringify({ action: 'listDevices', ...auth }) }).catch(() => {});
        }
      });
    }).catch(() => {});
  }

  window.fetch = function fitosanidadCachedFetch(input, init = {}) {
    const meta = requestMeta(input, init);
    if (!meta) return originalFetch(input, init);

    if (READ_ACTIONS.has(meta.body.action)) {
      return readThroughCache(meta.url, init, meta.body);
    }

    invalidateForMutation(meta.url, meta.body);
    const pending = originalFetch(input, init);
    if (meta.body.action === 'ping') {
      pending.then((response) => warmAfterPing(meta.url, init, meta.body, response)).catch(() => {});
    }
    return pending;
  };

  window.__fitosanidadPerformanceCache = {
    version: '0.6.1',
    clear() { cache.clear(); },
    get size() { return cache.size; }
  };
})();
