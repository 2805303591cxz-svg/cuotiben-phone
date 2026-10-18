/* 拍错题 · 只做一件事：拍照 → 上传到云端中转（电脑上自动收进待整理箱）
   本地队列存在 IndexedDB：没网、电脑没开都不会丢，联网后自动重试。 */
const $ = function (s) { return document.querySelector(s); };
const CODE = (window.CUOTIBEN_CODE || '');
let count = Number(localStorage.getItem('cuotiben_uploaded_today') || 0);
let todayKey = localStorage.getItem('cuotiben_day') || '';
const DAY = new Date().toISOString().slice(0, 10);
if (todayKey !== DAY) { todayKey = DAY; count = 0; localStorage.setItem('cuotiben_day', DAY); localStorage.setItem('cuotiben_uploaded_today', '0'); }

function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove('on'); }, ms || 2000); }

/* ---- 本地队列（IndexedDB） ---- */
function openDB() {
  return new Promise(function (res, rej) {
    const r = indexedDB.open('cuotiben-shots', 1);
    r.onupgradeneeded = function () { const db = r.result; if (!db.objectStoreNames.contains('shots')) db.createObjectStore('shots', { keyPath: 'id' }); };
    r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
  });
}
function tx(mode, fn) { return openDB().then(function (db) { return new Promise(function (res, rej) { const t = db.transaction('shots', mode); const s = t.objectStore('shots'); let out; try { out = fn(s); } catch (e) { rej(e); return; } t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); }; t.onerror = function () { rej(t.error); }; }); }); }
const Q = {
  all: function () { return tx('readonly', function (s) { return s.getAll(); }); },
  put: function (v) { return tx('readwrite', function (s) { return s.put(v); }); },
  del: function (id) { return tx('readwrite', function (s) { return s.delete(id); }); }
};

/* ---- 压缩 ---- */
async function compress(file) {
  const bmp = await (window.createImageBitmap ? createImageBitmap(file, { imageOrientation: 'from-image' })
    : new Promise(function (res, rej) { const i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = URL.createObjectURL(file); }));
  const edge = 2000, scale = Math.min(1, edge / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise(function (r) { c.toBlob(r, 'image/jpeg', 0.85); });
}

/* ---- 上传 ---- */
const CLOUD = (window.CUOTIBEN_ENDPOINT || '');   // 配了才走云端中转；GitHub Pages 上没有后端 → 走本地存 + 导出
const endpoint = function () { return CLOUD + (CLOUD.indexOf('?') >= 0 ? '&' : '?') + 'c=' + encodeURIComponent(CODE); };
async function uploadOne(rec) {
  if (!CLOUD) throw new Error('no-endpoint');
  const r = await fetch(endpoint(), { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: rec.blob });
  const j = await r.json();
  if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}
async function flush() {
  const all = await Q.all();
  if (!CLOUD) { render(all); return; }   // 没有云端：等你自己导出
  const pending = all.filter(function (x) { return x.status !== 'uploaded'; });
  if (!pending.length) { render(all); return; }
  setStat('正在上传 ' + pending.length + ' 张…');
  let ok = 0;
  for (const rec of pending) {
    try {
      await uploadOne(rec);
      rec.status = 'uploaded'; rec.at = Date.now();
      await Q.put(rec);
      count++; localStorage.setItem('cuotiben_uploaded_today', String(count));
      ok++;
    } catch (e) { rec.error = e.message; await Q.put(rec); }
  }
  const after = await Q.all();
  render(after);
  if (ok) toast(ok + ' 张已上传');
  else toast('还没连上，等有网会自动重试', 2600);
}

/* ---- 渲染 ---- */
function setStat(html) { $('#stat').innerHTML = html; }
function render(list) {
  list = list || [];
  const pending = list.filter(function (x) { return x.status !== 'uploaded'; });
  $('#today').textContent = '今天已传 ' + count + ' 张';
  const grid = $('#grid');
  grid.innerHTML = list.slice().sort(function (a, b) { return b.at - a.at; }).map(function (rec) {
    const url = rec.url || (rec.url = URL.createObjectURL(rec.blob));
    return '<div class="shot ' + (rec.status === 'uploaded' ? '' : 'pending') + '"><span class="tag">' + (rec.status === 'uploaded' ? '已传' : '待传') + '</span><img src="' + url + '"></div>';
  }).join('');
  if (!CLOUD) {
    setStat(list.length ? ('手机上有 <b>' + list.length + '</b> 张　<button id="send" class="green" style="padding:4px 10px;font-size:13px">导出文件</button>') : '准备好了，点上面的大按钮');
    const s = $('#send'); if (s) s.onclick = exportToPC;
    return;
  }
  if (pending.length) setStat('待上传 <b>' + pending.length + '</b> 张　<button id="retry" class="gray" style="padding:4px 10px;font-size:13px">立即重试</button>');
  else if (list.length) setStat('都传上去了 ✔ 电脑开着时会自动收进待整理箱');
  else setStat('准备好了');
  const r = $('#retry'); if (r) r.onclick = function () { flush(); };
}

/* ---- 拍照 ---- */
async function addFiles(files) {
  const list = [].slice.call(files).filter(function (f) { return f.type.indexOf('image/') === 0; });
  if (!list.length) return;
  for (const f of list) {
    try {
      const blob = await compress(f);
      await Q.put({ id: String(Date.now()) + '-' + Math.random().toString(16).slice(2, 7), blob: blob, status: 'pending', at: Date.now() });
    } catch (e) {
      try { await Q.put({ id: String(Date.now()) + '-' + Math.random().toString(16).slice(2, 7), blob: f, status: 'pending', at: Date.now() }); } catch (e2) {}
    }
  }
  await flush();
}

/* ---- 导出到电脑（GitHub Pages 版本用这个）---- */
function blobToData(b) { return new Promise(function (res) { const r = new FileReader(); r.onload = function () { res(r.result); }; r.readAsDataURL(b); }); }
async function exportToPC() {
  const list = await Q.all();
  if (!list.length) { toast('还没有照片'); return; }
  setStat('正在打包…');
  const out = { app: 'cuotiben-phone', version: 1, exportedAt: new Date().toISOString(), items: [] };
  for (const rec of list.slice().sort(function (a, b) { return a.at - b.at; })) {
    out.items.push({ id: rec.id, at: rec.at, photos: [await blobToData(rec.blob)] });
  }
  const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '手机错题-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setStat('已存到手机的「<b>下载</b>」文件夹：' + a.download + '（' + (blob.size / 1048576).toFixed(1) + ' MB）<br>用 <b>微信「文件传输助手」</b> 或数据线发到电脑，再在电脑上「<b>收集 → 导入手机备份</b>」。');
  toast('已存到手机「下载」文件夹，发到电脑后导入', 4500);
}

/* ---- 启动 ---- */
(async function boot() {
  const p = await Q.all(); render(p);
  flush();
  setInterval(function () { if (navigator.onLine) flush(); }, 30000);
  window.addEventListener('online', function () { flush(); });
  const LAN = localStorage.getItem('cuotiben_lan') || window.CUOTIBEN_LAN || '';
  const lanBtn = $('#lanBtn');
  if (lanBtn) {
    lanBtn.href = LAN ? LAN.replace(/\/$/, '') + '/m' : '#';
    if (!LAN) lanBtn.onclick = function (e) { e.preventDefault(); toast('还没配置电脑地址', 2500); };
  }
  const lanInput = $('#lanInput');
  if (lanInput) {
    lanInput.value = localStorage.getItem('cuotiben_lan') || window.CUOTIBEN_LAN || '';
    lanInput.onchange = function () {
      const v = lanInput.value.trim();
      if (v) { localStorage.setItem('cuotiben_lan', v); toast('已记住：' + v); } else { localStorage.removeItem('cuotiben_lan'); toast('已恢复默认'); }
      const b = $('#lanBtn'); if (b) b.href = (v || window.CUOTIBEN_LAN || '').replace(/\/$/, '') + '/m';
    };
  }
  $('#code').textContent = CLOUD ? (CODE.slice(0, 6) + '…' + CODE.slice(-4)) : '本机保存（不上传）';
  $('#shoot').onclick = function () { $('#cam').click(); };
  $('#album').onclick = function () { $('#albumFile').click(); };
  $('#cam').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
  $('#albumFile').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; $('#installBtn').hidden = false; });
  window.addEventListener('appinstalled', function () { $('#installBtn').hidden = true; toast('装好了，桌面点图标就能拍'); });
  $('#installBtn').onclick = function () { if (installEvt) { installEvt.prompt(); installEvt.userChoice.then(function () { installEvt = null; }); } };
  if (navigator.storage && navigator.storage.persist) { try { await navigator.storage.persist(); } catch (e) {} }
})();
