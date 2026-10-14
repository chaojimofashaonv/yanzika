// ===== 「线上有新版」检测＋提醒（BUGS #331 开屏那一行 ＋ #410 周期复查·应用内弹窗·待换版验证闭环）=====
// 宿主＝开屏公告页那一行（html/age-gate.html 的 #ageGateUpdate）——选这一处而不是应用内浮条：
// 本站的开屏公告每次打开都要重读一遍（BUGS #258），所以这一条每次进入都看得见，又不打断正在进行的会话。
// 刻意不做自动重载／待换版登记／保活闸门（mochi #279·#965·#992 那族）：那些防的是「用着用着页面自己重开」，
// 而这一条长在用户还没进应用的那一刻，且只有他本人点下去才换版＝没有可打断的东西。
// 也不移植 mochi 的「先 PRECACHE_NOW 预取新 index 再 reload」：本站 sw.js 对导航与 .json 都是
// network-first＋cache:'reload'（旧 SW 也照拉线上），刷新必然拿最新那一份，那套是给 cache-first 入口兜底的。
// version.json 由 tools/assemble.py 每次出包写（内容＝这一页自己的 window.APP_VER）；apk 壳里不随包，
// 且 file:// 双击与包内都拿不到「线上新版」——两条都在下面第一道闸里静默跳过，不留一条必失败的请求。
// —— #410 补的三块（#331 的行与两条哨兵一字未动）——
// ① 周期复查：回前台（距上次 >5min）＋每 30min 定时（仅页面可见）。开屏首查照旧，只有复查命中才弹应用内
//    弹窗 #updateRemind（html/sheet.html，样式 css/base.css「新版提醒弹窗」节）——「稍后」＝本会话不再弹。
// ② 待换版标记 localStorage['ordinal-upd-wait']：点刷新前先落 {from∶want∶count}，新页首查「已是最新」才清。
//    没有它，「点了刷新却还在旧包」没有任何证据可查＝假进入无声。
// ③ 刷新验证三态：回来仍是旧版→那行改口「刚才刷新没换到」（连败两轮→「换址强刷／关浏览器」）；
//    版本号都拉不到→「网络不稳，没法确认版本」（#410 假进入的主根因＝失败被静默吞掉）；已是最新→清标记静默进。
(function () {
  if (!/^https?:$/.test(location.protocol)) return;
  const wrap = document.getElementById('ageGateUpd'), btn = document.getElementById('ageGateUpdate');
  if (!wrap || !btn) return;
  const WAIT_KEY = 'ordinal-upd-wait';
  const WAIT_TTL = 86400000;          // 待换版标记一天过期＝死档自清
  const RETRY_LIMIT = 2;              // 刷新连败两轮后那行改口收手，不再无限「再试一次」
  const RECHECK_GAP = 5 * 60 * 1000;  // 回前台复查的最小间隔（省流量，version.json 不到 100B 但也不必频发）
  let lastCheckTs = 0;
  let popupDone = false;              // 本会话已弹过弹窗＝不再弹（那行照旧更新）
  let failedReloads = 0;              // 刚才的刷新没换到版的次数（从待换版标记读来）

  // 版号是 X.Y.Z 三段（tools/assemble.py 的 bump 就这么拼），折成一个数才能分「更新／更旧」两向：
  // 只认线上更新这一向——线上更旧（本机是未发布的调试包）或相等时提示刷新是假话，刷完还是这一版。
  const num = v => { const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v || '')); return m ? (+m[1]) * 10000 + (+m[2]) * 100 + (+m[3]) : 0; };

  function readWait() {
    try {
      const w = JSON.parse(localStorage.getItem(WAIT_KEY) || 'null');
      if (w && w.from && w.want && Date.now() - w.ts < WAIT_TTL) return w;
    } catch (e) {}
    clearWait();
    return null;
  }
  function clearWait() { try { localStorage.removeItem(WAIT_KEY); } catch (e) {} }
  function writeWait(want, count) {
    try { localStorage.setItem(WAIT_KEY, JSON.stringify({ from: window.APP_VER, want: want, count: count || 0, ts: Date.now() })); } catch (e) {}
  }

  function fetchVer() {
    return fetch('./version.json?ts=' + Date.now(), { cache: 'reload' }).then(function (r) { return r.ok ? r.json() : null; });
  }

  // 层位卫生（同 #365 备份弹窗那族）：开屏门／小测门／别的弹窗还开着、页面在后台＝等，不让开就不弹。
  function gateUp() {
    const g = document.getElementById('ageGate');
    return !!(g && g.classList.contains('on') && !g.classList.contains('gone'));
  }
  function layerBusy() {
    try { if (typeof _bkLayerBusy === 'function' && _bkLayerBusy()) return true; } catch (e) {}
    return false;
  }

  function showRow(text) { btn.textContent = text; wrap.hidden = false; }

  function askPopup(ver, tries) {
    if (popupDone) return;
    const mask = document.getElementById('updateRemind');
    if (!mask) return;
    if ((gateUp() || layerBusy() || document.hidden) && (tries || 0) < 20) { setTimeout(function () { askPopup(ver, (tries || 0) + 1); }, 1500); return; }
    if (gateUp() || layerBusy() || document.hidden) return;   // 30s 没让开＝本轮不弹（那行还在，不丢信息）
    const when = document.getElementById('upWhen');
    if (when) when.textContent = '最新 ' + ver + ' · 这一页还是 ' + window.APP_VER;
    const go = document.getElementById('upGo'), later = document.getElementById('upLater');
    if (go) go.onclick = function () { mask.hidden = true; doRefresh(); };
    if (later) later.onclick = function () { mask.hidden = true; popupDone = true; };
    mask.hidden = false;
    popupDone = true;
  }

  // 刷新进入新版：先再确认一次线上仍是新版再落待换版标记（可能用户刚刷过、或线上已回滚）；
  // 然后走预取落盘通道（BUGS #415，mochi PRECACHE_NOW 同族）：把最新 index 长超时拉进 SW 缓存、
  // 收到 UPD_PREFETCH_DONE 回执再 reload——弱网下裸 reload 的导航请求会超时回退旧缓存＝
  // 「刷了还在旧版」的根治。上一次刷新已经失败过＝换址导航（?v= 时间戳）把 HTTP 缓存与
  // SW 缓存全部绕开（GitHub Pages 文件本身有 10 分钟边缘缓存，这是最硬的穿透手段）。
  let downloading = false;
  function goReload() {
    if (failedReloads > 0) { try { location.replace('./?v=' + Date.now()); return; } catch (e) {} }
    try { location.reload(); } catch (e) {}
  }
  function doRefresh() {
    if (downloading) return;   // 防连点叠监听/叠计时器（mochi _prBusy 同口径）
    fetchVer().then(function (d) {
      const remote = num(d && d.ver);
      if (remote && remote > num(window.APP_VER)) writeWait(d.ver, failedReloads);
    }).catch(function () {}).then(function () {
      let swc = null;
      try { swc = navigator.serviceWorker && navigator.serviceWorker.controller; } catch (e) {}
      if (!swc) { goReload(); return; }   // 无 SW（首次访问注册未完成）＝裸 reload 兜底
      downloading = true;
      showRow('正在下载新版…（弱网约一两分钟，别连点）');
      let doneSeen = false;
      const cleanup = function () {
        try { navigator.serviceWorker.removeEventListener('message', onMsg); } catch (e) {}
        clearInterval(ping);
      };
      const onMsg = function (ev) {
        if (!ev.data || ev.data.type !== 'UPD_PREFETCH_DONE' || doneSeen) return;
        doneSeen = true; downloading = false;
        cleanup();
        goReload();
      };
      const send = function () { try { swc.postMessage({ type: 'UPD_PREFETCH' }); } catch (e) {} };
      const ping = setInterval(function () {   // #1047 同族：iOS WebKit 冻结空闲 SW＝首条消息可能没人收，12s 重发唤醒
        if (doneSeen) { clearInterval(ping); return; }
        send();
      }, 12000);
      try { navigator.serviceWorker.addEventListener('message', onMsg); } catch (e) { downloading = false; goReload(); return; }
      send();
      // 硬超时兜底（#629 同理）：下载没完成就不自动 reload——此时兜底缓存大概率还是旧页，
      // 刷了多半白刷；如实告知并留给用户再试（wait 标记还在，下一轮首查仍会改口）。
      // #417 起整包＝入口＋全部外置件（几十件），150s 才收手。
      setTimeout(function () {
        if (doneSeen) return;
        downloading = false;
        cleanup();
        showRow('下载没完成（网络慢）· 点按再试，或换流量再试');
      }, 150000);
    });
  }

  function check(isRecheck) {
    lastCheckTs = Date.now();
    const pending = readWait();
    if (pending) failedReloads = pending.count || 0;
    fetchVer().then(function (d) {
      const remote = num(d && d.ver), mine = num(window.APP_VER);
      if (!remote || !mine || remote <= mine) {
        // 已是最新（或拿不到可比较的号）＝换版成功，清掉待换版标记；没标记时维持 #331 的静默。
        failedReloads = 0;
        clearWait();
        return;
      }
      window.__updStale = true;
      if (pending) {
        // 刚点过刷新回来还是旧版＝那次刷新没拿到新包（弱网下 SW 对导航 network-first 失败兜底回旧缓存）。
        failedReloads += 1;
        writeWait(d.ver, failedReloads);
        if (failedReloads >= RETRY_LIMIT) showRow('刷了两轮还是旧包（网络不稳）· 点按换址强刷，或彻底关掉浏览器再重开');
        else showRow('刚才刷新没换到新版 · 线上仍是 ' + d.ver + ' · 点按再试');
      } else {
        showRow('线上已有新版 ' + d.ver + '（这一页是 ' + window.APP_VER + '）· 点按刷新进入');
        if (isRecheck) askPopup(d.ver);
      }
    }).catch(function () {
      if (pending) {
        // 用户明确点过刷新却没换到版，这次连版本号都拉不到＝不再静默（假进入的主根因是失败被吞）。
        showRow('网络不稳，暂时没法确认版本 · 连上网后再点一次刷新');
      }
      // 线上取不到且没有待换版＝静默：这一页没有「线上新版」可说，也不拿一次失败的 fetch 去吓用户。
    }).then(function () {
      // 无论哪条路都留一个「这一发查完了」的读数：hidden 在「查过且相等」与「压根没查完」两态下长得一模一样，
      // 门不钉这一步就会把「没量到」读成「已是最新」（本仓「0 也可能是空转」那一族）。
      window.__updChecked = true;
    });
  }

  btn.onclick = function () { doRefresh(); };
  check(false);

  // #410 周期复查：回前台（距上次 >5min）＋每 30min 定时（仅页面可见时）。只有复查命中才弹应用内弹窗。
  function recheck() {
    if (document.hidden) return;
    if (Date.now() - lastCheckTs < RECHECK_GAP) return;
    check(true);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) recheck(); });
  setInterval(recheck, 30 * 60 * 1000);
})();
