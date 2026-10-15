const CACHE_PREFIX = 'ordinal-v982';
const STATIC_CACHE = CACHE_PREFIX + '-static';
const DATA_CACHE = CACHE_PREFIX + '-data';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-maskable.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
];

// 站点＝「一份拼好的 index.html ＋ 素材」：css/js/html 全在那一个文件里，页面运行期不再请求任何
//   css/∶js/∶html/ 小文件，所以这里也不按清单去预缓存上百件。
//   （2026-10-11 那次改成「薄入口＋运行时按 assemble.json 注片段」时这里跟着读清单；那套在双击
//    file:// 下整站起不来，10-12 收回，见 tools/_probe_file_url.js。）
//   assemble.json 仍是**源码**的唯一顺序表，由 tools/assemble.py 消费，不再进缓存。
// #431（薄入口化）：外置件清单由组装器写成 asset-manifest.json（{ver,files}），这里按它分波
// 预缓存（mochi #860 口径：每波 12 件、波间串行＝弱网下不会几十发并发把自己挤死）。
// 首访装全量是「第二次起秒开＋离线能跑」的底；install 慢不影响首访在线使用（页面自己照常网络加载）。
async function precacheAll() {
  const cache = await caches.open(STATIC_CACHE);
  const put = (u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => null);
  await Promise.all(STATIC_ASSETS.map(put));
  try {
    const m = await fetch('./asset-manifest.json', { cache: 'reload' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const files = (m && Array.isArray(m.files)) ? m.files : [];
    for (let i = 0; i < files.length; i += 12) {
      await Promise.all(files.slice(i, i + 12).map(put));
    }
  } catch (e) {}
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAll());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          // 清理所有不属于当前版本的历史缓存
          .filter((k) => k !== STATIC_CACHE && k !== DATA_CACHE && k.startsWith('ordinal'))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  // 页面导航：network-first，确保部署到任意子路径时也总能拿到最新 index.html
  // （#413 改 networkFirstNav＝成功与兜底都归一到「去查询串」的规范键，见下）
  if (event.request.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/')) {
    event.respondWith(networkFirstNav(event.request));
    return;
  }

  // BUGS #415：version.json 完全放行、不拦截不缓存（mochi #157 同族移植）——
  // SW 对它的「网络优先」在弱网超时会回退缓存里的旧 version.json ⇒ 页面读到旧值以为已是
  // 最新＝「有新版却永远不提示、一直停在旧版」。放行后页面 fetch(cache:'reload') 直接走
  // 浏览器原生网络：要么真线上值、要么真失败，绝不拿旧缓存冒充。
  if (url.pathname.endsWith('/version.json')) return;

  // API / data requests: network-first
  if (url.pathname.endsWith('.json') || url.pathname.includes('/api/')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // 拆开的源文件（css/ js/ html/）也走 network-first：这一族是会天天改的文本，
  // cache-first 会让「改了刷新却看不见」——缓存只用来兜离线。图片与图标仍 cache-first（素材少改且体积大）
  if (/\.(css|js|html)$/.test(url.pathname)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Static assets: cache-first
  event.respondWith(cacheFirst(event.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    // 后台更新缓存（FIX #038: cache:'reload' 绕过 HTTP 缓存，否则后台更新会写回旧图）
    fetch(request, { cache: 'reload' }).then(response => {
      if (response.ok) {
        caches.open(STATIC_CACHE).then(cache => cache.put(request, response));
      }
    }).catch(() => {});
    return cached;
  }
  try {
    const response = await fetch(request, { cache: 'reload' });
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: 'reload' });
    if (response.ok) {
      const cache = await caches.open(DATA_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('Offline', { status: 503 });
  }
}

// BUGS #415：导航专用 network-first——成功与兜底都归一到「去查询串」的规范键上写/读，
// 与下方 UPD_PREFETCH 预取通道（写 './' 与 './index.html' 两键）共用同一本账：
// 弱网 reload 超时回退时命中的才是刚预取落盘的新页；带 ?v= 的换址导航也命中同一键
// （不归一＝?v= 导航失败时 caches.match 落空＝直接 503 白屏）。
async function networkFirstNav(request) {
  const u = new URL(request.url); u.search = ''; const key = u.href;
  try {
    const response = await fetch(request, { cache: 'reload' });
    if (response.ok) {
      const c = await caches.open(DATA_CACHE);
      c.put(key, response.clone());
      c.put(key.endsWith('/index.html') ? key.replace(/index\.html$/, '') : key + 'index.html', response.clone());
    }
    return response;
  } catch {
    const cached = (await caches.match(key)) || (await caches.match(key, { ignoreSearch: true })) || (await caches.match(request));
    if (cached) return cached;
    return new Response('Offline', { status: 503 });
  }
}

// ===== BUGS #415：点「刷新进入新版」的预取落盘通道（mochi PRECACHE_NOW #157/#273/#629/#1047 同族移植）=====
// 弱网下裸 reload 的导航请求会超时回退旧缓存 index.html＝「刷了还在旧版」。页面点刷新先发
// UPD_PREFETCH，这里长超时把新版整包拉下来、校验完整后写进当前 DATA_CACHE，回执 UPD_PREFETCH_DONE，
// 页面收到再 reload——导航即使超时，networkFirstNav 的缓存兜底命中的就是刚落盘的新页。
// #431 起整包＝薄入口 index ＋ asset-manifest.json 清单里的全部外置件（css/js），波次推进。
// 幂等：页面 12s 重发唤醒被 iOS 冻结的 SW 实例（#1047），重复收到只是重复回执，无害。
self.addEventListener('message', (e) => {
  const data = e.data || {};
  if (data.type !== 'UPD_PREFETCH') return;
  const base = new URL('./', self.registration.scope).href;
  const done = () => { try { if (e.source && e.source.postMessage) e.source.postMessage({ type: 'UPD_PREFETCH_DONE' }); } catch (x) {} };
  (async () => {
    const c = await caches.open(DATA_CACHE);
    const targets = [base, base + 'index.html'];
    try {
      const m = await fetch('./asset-manifest.json', { cache: 'reload' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (m && Array.isArray(m.files)) for (const f of m.files) targets.push(base + f);
    } catch (x) {}
    const grab = (u) => fetch(u, { cache: 'reload' }).then((res) => {
      if (!res || !res.ok) return false;
      // 完整性校验（mochi #134 同理）：把截断的新版固化进缓存＝用户永远卡残缺版。
      // #431 体积闸从 500KB 降到 50KB：入口从 2.7MB 单文件瘦成 ~0.4MB，旧阈值会把合法新入口误判成截断。
      if (!/\.html$/.test(u)) { c.put(u, res); return true; }
      return res.clone().text().then((t) => {
        if (t.length < 50000 || !/<\/html>\s*$/i.test(t.trim())) return false;
        c.put(u, res); return true;
      });
    }).catch(() => false);
    for (let i = 0; i < targets.length; i += 12) {
      await Promise.allSettled(targets.slice(i, i + 12).map(grab));
    }
  })().then(done).catch(done);
});

// 后台弹窗点击（mochi 移植）：聚焦已有窗口 / 开新窗口，并 postMessage 通知页面端跳转。
// 页面可能已被系统回收（postMessage 落空），点击侧同时把 tag 写进 IDB，页面开机后自取一次（只认 3 分钟内的）。
function bgIdbSet(key, val) {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('ordinal-keep-db', 1);
      req.onupgradeneeded = () => { try { req.result.createObjectStore('files'); } catch (e) {} };
      req.onsuccess = () => {
        try {
          const tx = req.result.transaction('files', 'readwrite').objectStore('files').put(val, key);
          tx.onsuccess = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch (e) { resolve(false); }
      };
      req.onerror = () => resolve(false);
    } catch (e) { resolve(false); }
  });
}

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const tag = (e.notification && e.notification.tag) || '';
  e.waitUntil((async () => {
    if (tag) { try { await bgIdbSet('__notify-click', JSON.stringify({ tag: tag, ts: Date.now() })); } catch (x0) {} }
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (cs && cs.length) {
      const c = cs[0];
      try { await c.focus(); } catch (x) {}
      try { c.postMessage({ type: 'MOCHI_NOTIFY_CLICK', tag: tag }); } catch (x) {}
      return;
    }
    try {
      const w = await self.clients.openWindow('./');
      if (w && w.postMessage) {
        for (let i = 0; i < 3; i++) {
          await new Promise((r) => setTimeout(r, 800));
          try { w.postMessage({ type: 'MOCHI_NOTIFY_CLICK', tag: tag }); } catch (x) { break; }
        }
      }
    } catch (x) {}
  })());
});
