/* 极简 IndexedDB：items（题目，照片以 Blob 存）+ meta（设置） */
const DB = (function () {
  const NAME = 'cuotiben-phone', VER = 1;
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      const r = indexedDB.open(NAME, VER);
      r.onupgradeneeded = function () {
        const db = r.result;
        if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        let out;
        try { out = fn(s); } catch (e) { rej(e); return; }
        t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { rej(t.error); };
        t.onabort = function () { rej(t.error); };
      });
    });
  }
  return {
    all: function () { return tx('items', 'readonly', function (s) { return s.getAll(); }); },
    get: function (id) { return tx('items', 'readonly', function (s) { return s.get(id); }); },
    put: function (it) { return tx('items', 'readwrite', function (s) { return s.put(it); }); },
    del: function (id) { return tx('items', 'readwrite', function (s) { return s.delete(id); }); },
    clear: function () { return tx('items', 'readwrite', function (s) { return s.clear(); }); },
    getMeta: function (k) { return tx('meta', 'readonly', function (s) { return s.get(k); }).then(function (r) { return r ? r.v : undefined; }); },
    setMeta: function (k, v) { return tx('meta', 'readwrite', function (s) { return s.put({ k: k, v: v }); }); }
  };
})();
