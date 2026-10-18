// #545（换版后首访「加载不全」）：缓存账本一律**不带版号**。
//   旧代三个名字是 ordinal-v<ver>-static∶-data，每次 bump 就是两个新账本，activate 再把旧的两本全删掉
//   ＝**每换一次版本，缓存里那 3MB 代码件必然清零**；而入口引的两件又是内容寻址的新名字（也必然 miss）。
//   两者叠起来＝「一更新就必定全量重下」，重下那一趟只要网络打个嗝，屏上就是残缺的（报障那一屏）。
//   现在分三本，各自按自己的寿命管：
//   · ordinal-static：根十件（manifest∶icon∶入口那几张图）——几乎不变，有的就不重下。
//   · ordinal-code：外置代码件（dist/app.<ver>.css∶js）。文件名自带版号＝**内容寻址**：这一件一旦落盘就
//     永不变化，所以命中即返回、绝不后台重下（旧 SWR 那一发 cache:'reload' 每次打开都把 2MB 又下一遍）。
//     清理不按代做，按 URL 做（见 sweepCode），留最近两代。
//   · ordinal-nav：导航页 index.html。它是「每次都要最新的那一页」，但必须与 ordinal-code 成套才给
//     （见 navWithBundle）——不成套时宁可给缓存里那一份**完整能用**的旧页。
const STATIC_CACHE = 'ordinal-static';
const CODE_CACHE = 'ordinal-code';
const NAV_CACHE = 'ordinal-nav';

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

// 站点＝「一份薄入口 ＋ 两件合并件（dist/app.<ver>.css∶js）＋ 素材」：页面运行期不再请求任何
//   css/∶js/ 小文件（#474 二批把 84 发收成 2 发），所以这里也不按清单去预缓存上百件。
//   （2026-10-11 那次改成「薄入口＋运行时按 assemble.json 注片段」时这里跟着读清单；那套在双击
//    file:// 下整站起不来，10-12 收回，见 tools/_probe_file_url.js。）
//   assemble.json 仍是**源码**的唯一顺序表，由 tools/assemble.py 消费，不再进缓存。
// #431（薄入口化）：交付件清单由组装器写成 asset-manifest.json（{ver,files}），UPD_PREFETCH 预取落盘
// 按它念。
// ⚠ #474：安装期**不再预拉 asset-manifest 点名的代码件**。旧写法在 install 里把那一坨全走一遍
//   `cache:'reload'`＝与页面自己那些请求抢同一条弱网带宽（而且 reload 绕浏览器 HTTP 缓存＝同一件拉两遍），
//   正是「首访最难的时候最难」的形状。现在代码件由页面自己那一趟顺手入账（见 codeCacheFirst）：
//   页面要哪件、拉到了就存哪件，一次也不多发。根文件那十件仍旧预缓存（它们小∶且离线首屏靠它们），
//   #545 起再加一条「已经在的不再重下」。
async function precacheAll() {
  const cache = await caches.open(STATIC_CACHE);
  // 入口那两键（'./' 与 './index.html'）是**导航页**，必须每次装 SW 都重下（＝总留着最新那一页）；
  // 其余八件（manifest∶icon）内容几乎不变，有的就不重下。
  // 反过来做＝缓存里那份 index.html 停在装它的那一天，导航兜底拿它出来＝拿出一页早已过期的旧入口。
  const put = async (u, force) => {
    const abs = new URL(u, self.registration.scope).href;
    if (!force) { try { if (await cache.match(abs)) return; } catch (e) {} }
    try { await cache.add(new Request(abs, { cache: 'reload' })); } catch (e) {}
  };
  await Promise.all(STATIC_ASSETS.map((u) => put(u, /(^\.\/$|index\.html$)/.test(u))));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAll());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await migrateIntoNewBooks();
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => /^ordinal-v\d+-/.test(k)).map((k) => caches.delete(k)));
    await sweepCode();
  })());
  self.clients.claim();
});

// #545：换账本那一瞬间把旧本里的外置代码件与导航页搬过来，别让这次升级自己变成一次「缓存清零＝全量重下」。
// 只搬 dist/app.<ver>.css∶js 那一形状与导航页，旧本里别的杂件一律不搬（它们是上一代的账）。
// 键统一取「去查询串」的规范键＝与新账本的读写口径一致，否则搬过去也命中不了。
async function migrateIntoNewBooks() {
  let olds = [];
  try { olds = (await caches.keys()).filter((k) => /^ordinal-v\d+-/.test(k)); } catch (e) { return; }
  if (!olds.length) return;
  const code = await caches.open(CODE_CACHE);
  const nav = await caches.open(NAV_CACHE);
  for (const k of olds) {
    let c = null, reqs = [];
    try { c = await caches.open(k); reqs = await c.keys(); } catch (e) { continue; }
    for (const rq of reqs) {
      let p = '';
      try { p = new URL(rq.url).pathname; } catch (e) { continue; }
      const isCode = /\/app\.v[^/]+\.(css|js)$/.test(p);
      const isNav = /(^\/index\.html$|^\/$)/.test(p);
      if (!isCode && !isNav) continue;
      const key = rq.url.split('?')[0];
      try {
        const res = await c.match(rq);
        if (!res) continue;
        if (isCode) await code.put(key, res);
        else await nav.put(key, res);
      } catch (e) {}
    }
  }
}

// 代码件按 URL 清理而不是按代：只留最近两代的合并件（一代＝一对 css∶js），更早的删掉。
// 内容寻址的文件永不变，留着只为「上一代那一页还能成套」——超过两代的那一页早被新页替掉了。
async function sweepCode() {
  try {
    const code = await caches.open(CODE_CACHE);
    const reqs = await code.keys();
    const gens = {};
    for (const rq of reqs) {
      const m = /app\.(v[0-9.]+)\.(css|js)$/.exec(rq.url);
      if (!m) continue;
      (gens[m[1]] = gens[m[1]] || []).push(rq);
    }
    const names = Object.keys(gens).sort(verDesc);
    for (const n of names.slice(2)) for (const rq of gens[n]) { try { await code.delete(rq); } catch (e) {} }
  } catch (e) {}
}
function verDesc(a, b) { return verNum(b) - verNum(a); }
function verNum(v) { const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v || '')); return m ? (+m[1]) * 10000 + (+m[2]) * 100 + (+m[3]) : 0; }

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  // 页面导航：#545 起走「成套判定」——拿到最新那一页还不够，还得它引的那两件也在缓存里才肯交给屏上。
  // 单独把新页放出去＝把「有顶栏没内容」的空壳送上门（那一屏的来由见 html/head.html 里 #545 那段）。
  if (event.request.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/')) {
    event.respondWith(navWithBundle(event));
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

  // #545：代码件（入口引的两件合并件∶开发版逐件引的 css∶js）**cache-first 且不后台重下**。
  // 这一族是内容寻址的（文件名带版号＝内容一变 URL 就变），落盘的那一件逐字不会变，所以：
  //   ① 命中就返回，绝不为了「确认它没变」再去网络上下一遍（旧 SWR 那一发 cache:'reload' ＝每次打开
  //      都把那 2MB 真下一遍，是「每次打开都慢」与「换版后首访必卡」共同的放大器）；
  //   ② 拿不到就是真没有，如实给 503——页面那一屏按它显示「载入没完成」并给出重载入口，
  //      而不是拿个空壳糊过去。
  if (/\.(css|js|html)$/.test(url.pathname)) {
    event.respondWith(codeCacheFirst(event.request));
    return;
  }

  // Static assets: cache-first
  event.respondWith(cacheFirst(event.request));
});

const NAV_TIMEOUT = 4500;    // 导航网络那一发的硬超时：github.io 挂起时是白屏到天亮，等 4.5 秒没到就走缓存
const SYNC_MIN = 50000;      // 代码件完整性下限：入口 249KB∶css 636KB∶js 2.2MB，低于 50KB 必是截断或错误页

// 规范键（去查询串）：导航∶代码件∶UPD_PREFETCH 三处读写同一本账，必须同一键才能互相命中
function canon(u) { const x = new URL(u); x.search = ''; return x.href; }
function navSibling(key) { return key.endsWith('/index.html') ? key.replace(/index\.html$/, '') : key + 'index.html'; }

// 这一页引了哪几件外置代码件（薄入口＝那两件 dist/app.<ver>.css∶js）
function distRefs(html) {
  const out = [];
  const re = /["']([^"']*app\.v[0-9.]+\.(?:css|js))["']/g;
  let m;
  while ((m = re.exec(html))) { if (out.indexOf(m[1]) < 0) out.push(m[1]); }
  return out;
}
async function codeHas(refs) {
  if (!refs.length) return false;
  const code = await caches.open(CODE_CACHE);
  for (const r of refs) {
    try { if (!(await code.match(new URL(r, self.registration.scope).href))) return false; } catch (e) { return false; }
  }
  return true;
}
async function fetchTimeout(request, ms) {
  const ac = (typeof AbortController === 'function') ? new AbortController() : null;
  let t = 0;
  if (ac) t = setTimeout(() => { try { ac.abort(); } catch (e) {} }, ms);
  try {
    const r = await fetch(request, ac ? { cache: 'reload', signal: ac.signal } : { cache: 'reload' });
    if (t) clearTimeout(t);
    return r;
  } catch (e) {
    if (t) clearTimeout(t);
    throw e;
  }
}

// ===== #545 导航：页面与它引的代码件必须**成套**才交给屏上 =====
// 三选一，按这个顺序：
//   ① 新页引的两件都在缓存里 ⇒ 上新页（最新的一页，且立刻能用）。
//   ② 新页的件还没落盘，而缓存里有一份**件齐全**的旧页 ⇒ 上旧页（用户看到的永远是一个能用的一页），
//      新页与它引的两件交给后台慢慢补齐；下次打开自然是新版的完整页。
//   ③ 缓存里连成套的旧页都没有（＝真·首访）⇒ 只能上新页：那一趟等网络的时间由开屏那根进度条扛着
//      （html/head.html 的 #545 那一屏），不再是「一句动静都没有的空白」。
// 网络那一发超时＝直接落到 ②／③；网络失败也是。旧写法 network-first 是「无限等网络、失败才回退」，
// 而挂起的连接永远等不到「失败」＝用户报的「每次都要刷新好几次」有一半是这一发造成的。
async function navWithBundle(event) {
  const request = event.request;
  const key = canon(request.url);
  const nav = await caches.open(NAV_CACHE);
  let fresh = null, text = '';
  try {
    fresh = await fetchTimeout(request, NAV_TIMEOUT);
    if (fresh && fresh.ok) text = await fresh.clone().text();
  } catch (e) { fresh = null; }
  const cached = (await nav.match(key)) || (await nav.match(navSibling(key))) || (await caches.match(key));

  if (fresh && fresh.ok && text) {
    const refs = distRefs(text);
    if (refs.length) {
      if (await codeHas(refs)) {
        saveNav(nav, key, fresh.clone());
        return fresh;
      }
      if (cached) {
        const ctext = await cached.clone().text();
        const crefs = distRefs(ctext);
        if (crefs.length && (await codeHas(crefs))) {
          // 旧页成套 ⇒ 给旧页；新页那一套交给后台补（补齐了才会真正落进导航账本，见 syncNew）
          event.waitUntil(syncNew(key, fresh.clone(), refs));
          return cached;
        }
      }
      saveNav(nav, key, fresh.clone());
      event.waitUntil(syncNew(key, fresh.clone(), refs));
      return fresh;
    }
    saveNav(nav, key, fresh.clone());
    return fresh;
  }
  if (cached) return cached;
  return new Response('Offline', { status: 503 });
}

function saveNav(nav, key, res) {
  try { nav.put(key, res.clone()); nav.put(navSibling(key), res.clone()); } catch (e) {}
}

// 后台把新页引的那两件拉下来落进代码账本；**两件都齐了**才把新页本身写进导航账本。
// 只齐一半就写新页＝下次导航又变成「新页＋缺件」，用户又得再等一趟；不齐则导航账本里仍是旧页，
// 下次打开还是那一份完整能用的，直到哪一趟补满为止（补满即换，不需要用户再做任何事）。
async function syncNew(key, freshRes, refs) {
  const code = await caches.open(CODE_CACHE);
  let all = true;
  for (const r of refs) {
    const abs = new URL(r, self.registration.scope).href;
    const got = await fetch(abs).then((res) => {
      if (!res || !res.ok) return false;
      return res.clone().text().then((t) => {
        if (t.length < SYNC_MIN) return false;   // 截断的不许落盘（mochi #134 同族）
        try { code.put(canon(abs), res); } catch (e) {}
        return true;
      });
    }).catch(() => false);
    if (!got) all = false;
  }
  if (all) {
    const nav = await caches.open(NAV_CACHE);
    saveNav(nav, key, freshRes);
  }
}

async function codeCacheFirst(request) {
  const key = canon(request.url);
  const code = await caches.open(CODE_CACHE);
  try {
    const cached = await code.match(key);
    if (cached) return cached;
  } catch (e) {}
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      const t = await res.clone().text();
      if (t.length >= SYNC_MIN) { try { code.put(key, res.clone()); } catch (e) {} }
      return res;
    }
  } catch (e) {}
  return new Response('Offline', { status: 503 });
}

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
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('Offline', { status: 503 });
  }
}

// ===== BUGS #415：点「刷新进入新版」的预取落盘通道（mochi PRECACHE_NOW #157/#273/#629/#1047 同族移植）=====
// 弱网下裸 reload 的导航请求会超时回退旧缓存 index.html＝「刷了还在旧版」。页面点刷新先发
// UPD_PREFETCH，这里长超时把新版整包拉下来、校验完整后写进当前账本，回执 UPD_PREFETCH_DONE，
// 页面收到再 reload——导航即使超时，navWithBundle 的缓存兜底命中的就是刚落盘的新页。
// #431 起整包＝薄入口 index ＋ asset-manifest.json 清单里的全部外置件（css/js），波次推进。
// #545：落到**与导航同一本账**（ordinal-nav∶ordinal-code），否则页面自己那一趟（html/head.html
// 的 _bfRefetch）落的和导航读的不是同一本，预取了也命中不了。
// 幂等：页面 12s 重发唤醒被 iOS 冻结的 SW 实例（#1047），重复收到只是重复回执，无害。
self.addEventListener('message', (e) => {
  const data = e.data || {};
  if (data.type !== 'UPD_PREFETCH') return;
  const base = new URL('./', self.registration.scope).href;
  const done = () => { try { if (e.source && e.source.postMessage) e.source.postMessage({ type: 'UPD_PREFETCH_DONE' }); } catch (x) {} };
  (async () => {
    const nav = await caches.open(NAV_CACHE);
    const code = await caches.open(CODE_CACHE);
    const targets = [base, base + 'index.html'];
    try {
      const m = await fetch('./asset-manifest.json', { cache: 'reload' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (m && Array.isArray(m.files)) for (const f of m.files) targets.push(base + f);
    } catch (x) {}
    const grab = (u) => fetch(u, { cache: 'reload' }).then((res) => {
      if (!res || !res.ok) return false;
      // 完整性校验（mochi #134 同理）：把截断的新版固化进缓存＝用户永远卡残缺版。
      // #431 体积闸从 500KB 降到 50KB：入口从 2.7MB 单文件瘦成 ~0.25MB，旧阈值会把合法新入口误判成截断。
      const isNav = /\.html$/.test(u);
      return res.clone().text().then((t) => {
        if (t.length < SYNC_MIN) return false;
        if (isNav && !/<\/html>\s*$/i.test(t.trim())) return false;
        try { (isNav ? nav : code).put(canon(u), res); } catch (x) {}
        return true;
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
