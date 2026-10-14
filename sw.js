const CACHE_PREFIX = 'ordinal-v926';
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
self.addEventListener('install', (event) => {
  event.waitUntil(
    // FIX #038: 必须 cache:'reload' 绕过 HTTP 缓存，否则素材更新（如骰子图片）在手机上永不生效
    // 单个文件取失败只跳过它（一处笔误不该让整个离线缓存装不上）
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.all(STATIC_ASSETS.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => null)))
    )
  );
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
  if (event.request.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

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
