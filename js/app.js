// ===== 入口初始化 =====

// 全站版号（更多页顶部那格读它；assemble.py --bump 时与下面 markStep 一起 +1，锚点别合并＝bump 按各自锚替换）
window.APP_VER = 'v9.6.7';

// 启动进度标记（开屏层已删除：#splashStep 不再有宿主，本函数为空操作，保留作版本锚点与排障落点）
function markStep(s) { const e = document.getElementById('splashStep'); if (e) e.textContent = 'v9.6.7' + s; }

(async function init() {
  try {
    markStep('读取数据');
    data = await load();
    const b = data.behavior || defaults.behavior;
    // 兜底：确保 behavior 各字段为合法类型/数值（正常由 load→ensureData 补齐）
    for (const k of Object.keys(defaults.behavior)) {
      if (typeof defaults.behavior[k] === 'boolean') { if (typeof b[k] !== 'boolean') b[k] = defaults.behavior[k]; }
      else if (typeof b[k] !== 'number' || !isFinite(b[k])) b[k] = defaults.behavior[k];
    }
    b.rsMax = Math.max(b.rsMin, b.rsMax);
    b.replyMax = Math.max(b.replyMin, b.replyMax);
    b.pyMax = Math.max(b.pyMin, b.pyMax);
    b.asMax = Math.max(b.asMin, b.asMax);
    b.asCountMax = Math.max(b.asCountMin, b.asCountMax);
    data.behavior = b;

    applyAppearance();
    const _moreVer = document.getElementById('moreVer'); if (_moreVer) _moreVer.textContent = window.APP_VER;   // 更多页顶部的版号
    const _agVer = document.getElementById('ageGateVer'); if (_agVer) _agVer.textContent = window.APP_VER;     // 开屏公告最顶的版号（部署核对用）
    showView('chats');

    markStep('渲染聊天');
    syncChatDraftToInput();
    document.body.dataset.settingsTab = 'notify';
    renderProfile();
    resetMessageRender();
    renderMessages();
    ensureAskAnswers();   // 补答上次会话遗留的未回答问问TA卡片

    updateUnread();
    initLazyImages();
    startPartnerWriteScheduler();
    startActiveSendScheduler();
    startMomentsScheduler();
    // 重新加载后恢复后台保活（禁音音频，需等首次用户交互解锁音频上下文）
    if (data.appearance && data.appearance.bgKeepAlive) try { setBackgroundKeepAlive(true); } catch {}
    try { document.dispatchEvent(new Event('ordinal-data-ready')); } catch {}   // 后台运行模块（mochi 移植）读档回填开关
    markStep('完成');
    try { if (typeof maybeShowAgeGate === 'function') maybeShowAgeGate(); } catch {}

    // 定期备份提醒（规则.md §六）：有用户数据且超过 7 天未导出（或从未导出）时，每次会话提示一次
    setTimeout(() => {
      try {
        const last = Number(localStorage.getItem('lastBackupAt')) || 0;
        const hasData = (data.messages || []).length > 2 ||
          (data.groups || []).some(g => (g.cards || []).length > 0) ||
          (data.sentLetters || []).length > 0 || (data.receivedLetters || []).length > 0;
        if (hasData && (!last || Date.now() - last > 7 * 86400000)) {
          _bkRemindAsk(last);   // FIX 2026-10-14 #365 原来是一枚 2 秒 toast，换成 sheet.html 的 #backupRemind 弹窗（规则.md §六 的触发条件一字未动）
        }
      } catch {}
    }, 3000);

    const _visibilityHandler = () => {
      const _keepAliveOn = !!(data.appearance && data.appearance.bgKeepAlive);
      if (document.hidden) {
        // 后台保活开启时，页面计时器继续运转（联系人回复/主动发送仍会触发），后台通知随之生效
        if (!_keepAliveOn) {
          pauseWriteScheduler();
          pauseActiveSend();
          if (!_keepAliveOn) pauseMomentsScheduler();
        }
        if (!_useLS) {
          if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
          if (_savePending) { _savePending = false; _doSave(); }
        }
      } else {
        resumeWriteScheduler();
        resumeActiveSend();
        resumeMomentsScheduler();
      }
    };
    document.addEventListener('visibilitychange', _visibilityHandler);

    // iOS 键盘修复：键盘弹出时 visualViewport 变小但 100dvh 不变，用 JS 压缩容器高度防止输入栏被挡
    // ⚠ 2026-10-14 iOS 卡顿批：iOS 键盘动画期间 visualViewport.resize 是**每帧连发**的（0.25s 动画 ≈ 15+ 次，
    // 且头几帧高度会在判定阈值上下抖）。旧实现每次回调都直接写 .app-shell 的 style.height——写 height 是强制
    // 重排整棵壳（顶栏／底栏／滚动区全部重新布局），连发十几次就是连续十几次全屏重排，这正是「iOS 上打字
    // 时明显卡」的主因。改成两件事，行为与视觉一字不变：
    //   ① rAF 合帧：resize 回调只标记待应用，下一帧读一次最新的 visualViewport.height 统一写
    //      （与键盘动画同拍，肉眼无差；顺带消掉旧实现「每次回调都新挂一个 rAF 滚底」的回调堆积）；
    //   ② 值去重：与上次应用的值相同就整个跳过——阈值上下抖时旧实现会反复写/清 height，每次都是一次大重排。
    // 逃生阀 body[data-kbFix=off] 与 80px 阈值语义未动。#335 问TA 面板按钮四档出屏是靠 #339 的
    // 「常驻按钮行 flex:none + min-height:0」兜住的，不依赖本函数的时序，故合帧不会把它带回来。
    // #430 iPhone Safari「点输入栏 → 聊天框莫名跑到屏幕顶上」：iOS 开键盘时**只缩视觉口、不缩布局口**
    // （innerHeight 与 100dvh 都不动——head.html 那句 interactive-widget=resizes-content iOS 压根不支持），
    // 还会为了把焦点那一枚捞进可视区，把视觉口往下平移（vv.offsetTop 变正）。旧实现只压了 .app-shell
    // 的高度＝壳停在文档顶上那段 [0, vv.height]，而屏幕上真正可见的是 [offsetTop, offsetTop+vv.height] 那条带
    // ——两处错位，整块 UI 顶进屏幕上半截、下面空出一大片，看着就是「聊天框跑屏顶了、也没法用」。
    // 故补第三件事：③ 把壳整体下移 offsetTop。**用 margin-top 不用 transform**：transform 会让
    // .app-shell 变成屏上那十几枚 position:fixed 件的包含块（css/theme.css viewIn 那条注释钉过的坑）。
    const _appShell = document.querySelector('.app-shell');
    const _vv = window.visualViewport;
    if (_appShell && _vv) {
      let _vvApplied = null, _vvQueued = false;
      const _vvApply = () => {
        _vvQueued = false;
        if (document.body.dataset.kbFix === 'off') {
          if (_vvApplied !== '') { _appShell.style.height = ''; _appShell.style.marginTop = ''; _vvApplied = ''; }
          return;
        }
        const h = _vv.height;
        const kb = (h < window.innerHeight - 80);   // 键盘真的开了（≠地址栏收起那几像素的抖）
        const next = kb ? h + 'px' : '';
        // 平移量＝这一帧视觉口在布局坐标里的上沿。它是**独立于高度**的量：iOS 在键盘动画途中、
        // 以及用户拖动已开着的键盘时，都会只改平移不改高度 ⇒ 去重键必须带上它，只看高度会漏这几帧。
        const dy = kb ? Math.max(0, Math.round(_vv.offsetTop || 0)) : 0;
        const key = next + '@' + dy;
        if (key === _vvApplied) return;          // 值没变 → 不写 style，一次重排都不付
        _vvApplied = key;
        // 「壳没加补偿时的天然上沿」按**这一帧实测的矩形**倒推（扣掉上一次已经加过的 margin），
        // 不缓存一个静态值：2026-10-14 起产物改外链加载，app-shell 前面那批浮层万一占地方就不能想当然写 0；
        // vv.offsetTop 是「相对布局口」的量，故目标位置还要加上文档已经滚过的那段。
        const sc = window.scrollY || window.pageYOffset || 0;
        const curM = parseFloat(_appShell.style.marginTop) || 0;
        const baseTop = Math.round(_appShell.getBoundingClientRect().top + sc - curM);
        _appShell.style.height = next;
        _appShell.style.marginTop = dy ? Math.max(0, Math.round(sc + dy) - baseTop) + 'px' : '';
        // 键盘弹起后若焦点在聊天输入框，按合帧后的最终高度补一次贴底（#049：只补一帧不够，
        // 但完整的贴底稳定由 render.js 的 _stickLoop 负责，这里只做「容器刚被压矮」这一次对齐）
        // ⚠ 判据走 inputFocused（js/input-ce.js）：Android 上输入框已换成 ce-box，
        //    焦点落在 box 上，activeElement === 原 input 恒 false（#418）
        if (kb && window.inputFocused($('#messageInput'))) { const l = $('#messageList'); if (l) l.scrollTop = l.scrollHeight; }
      };
      const _vvFix = () => { if (_vvQueued) return; _vvQueued = true; requestAnimationFrame(_vvApply); };
      _vv.addEventListener('resize', _vvFix);
      _vv.addEventListener('scroll', _vvFix);   // iOS 平移可能在高度不变的情况下单独变（见上面 dy 那条）
      window.addEventListener('pagehide', () => { _vv.removeEventListener('resize', _vvFix); _vv.removeEventListener('scroll', _vvFix); }, { once: true });
    }

    window.addEventListener('pagehide', () => {
      document.removeEventListener('visibilitychange', _visibilityHandler);
      pauseWriteScheduler();
      pauseActiveSend();
      pauseMomentsScheduler();
      flushSave();
      try { lsSet(data); } catch {}
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        try { showToast('已更新，刷新即可使用新版'); } catch {}
      });
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      _deferredInstall = e;
      const btn = $('#installAppBtn'); if (btn) btn.hidden = false;
    });
    window.addEventListener('appinstalled', () => {
      const btn = $('#installAppBtn'); if (btn) btn.hidden = true;
    });
  } catch (err) {
    console.error('初始化失败:', err);
    try { if (typeof maybeShowAgeGate === 'function') maybeShowAgeGate(); } catch {}
    $('#messageList').innerHTML = `<div class="empty" style="text-align:center;padding:40px 20px;color:var(--danger-ink);"><strong>页面初始化失败</strong><br><br><span style="font-size:13px;color:var(--muted)">${err.message || err}</span><br><span style="font-size:12px;color:var(--muted);">请检查浏览器控制台 (F12) 的详细错误信息</span></div>`;
  }
})();

// ===== 备份提醒弹窗（BUGS #365 · 规则.md §六 受保护功能）=====
// 触发点在上面 init 的「定期备份提醒」那段（FIX-REGRESSION #011 钉的注释锚点＋setTimeout 3s 原样未动），
// 条件也一字未改：有数据且超过 7 天未导出（或从未导出）→ 每次会话提示一次。本段只负责「屏上长什么样」。
// 开屏两道门（年龄公告 #ageGate／入站小测 #quizGate，都用 .on 类显隐）还开着时弹出来也没人看得见，
// 轮询等它们让开：每 1.5s 一问、最多 20 次（30s）；等不到就本轮不提示，下一会话照旧。
function _bkLayerBusy() {
  const ag = document.getElementById('ageGate');
  if (ag && ag.classList.contains('on')) return true;    // 18 岁门（.on 类显隐，同 js/deskpop.js _deskPopLayerBusy 的口径）
  const qg = document.getElementById('quizGate');
  if (qg && qg.classList.contains('on')) return true;    // 入站小测门（.on 类显隐）
  const am = document.getElementById('appModal');
  if (am && !am.hidden) return true;                      // 通用弹窗／确认框（含夜间免打扰那一问）
  return !!document.querySelector('.fs-sheet-mask:not([hidden])');   // 贴底面板块（信箱设置∶收藏设置∶添加昵称…）
}
function _bkRemindAsk(last, tries) {
  tries = tries || 0;
  const mask = document.getElementById('backupRemind');
  if (!mask) return;
  if ((_bkLayerBusy() || document.hidden) && tries < 20) { setTimeout(() => _bkRemindAsk(last, tries + 1), 1500); return; }
  if (_bkLayerBusy() || document.hidden) return;          // 30s 还没让开＝本轮不提示（「每次会话最多一次」不受影响）
  const when = document.getElementById('bkWhen');
  if (when) {
    if (last) {
      const d = new Date(last), now = new Date();
      const days = Math.floor((Date.now() - last) / 86400000);
      const y = d.getFullYear() === now.getFullYear() ? '' : d.getFullYear() + ' 年 ';
      when.textContent = '已经 ' + days + ' 天没备份 · 上次 ' + y + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
    } else {
      when.textContent = '还从来没有备份过';
    }
  }
  const go = document.getElementById('bkGo');
  const later = document.getElementById('bkLater');
  if (go) go.onclick = function () { mask.hidden = true; _bkGoBackup(); };
  if (later) later.onclick = function () { mask.hidden = true; };
  mask.hidden = false;
}
// 「去备份」：直达复用 js/hub.js 现成的 _hubGoFold（切设置页→点亮「数据」格→展开「数据管理」卡→滚到正中），
// 不另写一遍「showView＋点 tab」＝同一件事只留一条路；再给导出钮挂一枚短高亮，人落页时一眼看见该点哪。
function _bkGoBackup() {
  if (typeof _hubGoFold === 'function') _hubGoFold('data', 'data');
  else {
    showView('settings');
    const t = document.querySelector('.settings-tab[data-tab="data"]');
    if (t) t.click();
  }
  setTimeout(() => {
    const ex = document.getElementById('exportAll');
    if (!ex) return;
    ex.classList.remove('bk-flash');
    void ex.offsetWidth;
    ex.classList.add('bk-flash');
    setTimeout(() => ex.classList.remove('bk-flash'), 2000);
  }, 120);
}

// ===== 全屏模式 + 添加到主屏幕引导 =====
// 2026-10-14 用户「设置里还缺一个和mochi项目一样的【全屏模式】＋提醒可以添加到主屏幕使用」
// 平台分流照 Mochi（js/fullscreen.js）那套口径，但**刻意不搬它的 ios-fs-active**：
// Mochi 的 .phone 是 390px 桌面模拟器外壳、需要撑到全屏并下移它那枚应用内模拟状态栏；
// 本站 .app-shell 本来就是 100dvh 全屏布局，iOS standalone 下顶栏/底栏已按 env(safe-area-inset-*)
// 避开刘海与 home indicator，再动安全区只会制造 bug（Mochi 自己就为这个修过 #114）。
// 所以 iPhone 上这一族只做「诚实说明 + 引导添加主屏幕」，不假装修状态栏。
// 只住本机：ordinal- 前缀的键，resetAllSite()（清空本站全部数据）会一并抹掉＝像第一次安装。
(function () {
  const fsEl = document.getElementById('fsOn');
  if (!fsEl || typeof $ !== 'function') return;
  const KEY = 'ordinal-fullscreen-on';
  const store = {
    get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  };
  const isIOS = () => {
    try { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); } catch (e) { return false; }
  };
  const standalone = () => {
    try { return navigator.standalone === true || !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches); } catch (e) { return false; }
  };
  const fsSupported = () => typeof document.documentElement.requestFullscreen === 'function' || typeof document.documentElement.webkitRequestFullscreen === 'function';
  const fsActive = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  // 形态文案：用户在设置里第一眼该知道「我现在是什么形态、还差哪一步」
  const formText = () => {
    if (standalone()) return '当前形态：已从桌面图标打开（无浏览器工具栏）——这已经是手机上能拿到的最满形态。';
    if (isIOS()) return '当前形态：Safari 标签页（带地址栏与工具栏）。iPhone 上想更满只有一条路：Safari 底部「分享」→「添加到主屏幕」，之后从桌面图标打开。';
    if (window._deferredInstall) return '当前形态：浏览器标签页。点下面那枚钮即可安装到桌面（安装后无工具栏，也可在系统设置里开全屏）。';
    return '当前形态：浏览器标签页。用浏览器菜单里的「安装应用 / 添加到主屏幕」即可装到桌面（安装后无工具栏）。';
  };
  const sumText = () => {
    if (fsActive()) return '全屏中';
    if (standalone()) return '已装到桌面';
    if (isIOS()) return 'iPhone 藏不掉状态栏';
    return store.get() === '1' ? '开着' : '关';
  };
  function sync(intentOn) {
    // intentOn 只在用户刚点完那一瞬用（requestFullscreen 是异步的，落定前不能以真实态回写，
    // 否则安卓上「点了开却看到没勾上」闪一下）；其余一律以系统真实全屏态为准。
    fsEl.checked = (typeof intentOn === 'boolean') ? intentOn : fsActive();
    const n = $('#fsFormNote'); if (n) n.textContent = formText();
    const s = $('#sumFs'); if (s) s.textContent = sumText();
    const b = $('#fsInstallBtn'); if (b) b.hidden = standalone();
  }
  // iPhone 专属说明：把「为什么做不到」讲平，并直接给下一步（这正是用户要的那句提醒）
  function iosGuide() {
    const msg = standalone()
      ? '已进入全屏模式。\n\niOS 的系统状态栏（时间/电量）由系统控制，任何网页都无法隐藏——这是所有 iPhone 应用的共同限制，不是本站没做。本站从桌面图标打开时已经没有浏览器工具栏，这已是 iPhone 上最满的形态。'
      : 'iPhone 上拿不到网页全屏。\n\n唯一能更满的路：Safari 底部「分享」→「添加到主屏幕」，之后从桌面图标打开——没有地址栏与工具栏，消息通知也只有这条路能在 iPhone 上用。\n\n另外：iOS 的系统状态栏（时间/电量）任何网页都藏不掉。';
    if (typeof openModal === 'function') openModal('全屏模式 · iPhone 说明', '', () => {}, { noInput: true, staticText: msg, okText: '知道了' });
    else if (typeof showToast === 'function') showToast('iPhone 全屏说明：用 Safari「分享 → 添加到主屏幕」');
  }
  function install() {
    if (window._deferredInstall) {
      try { window._deferredInstall.prompt(); } catch (e) {}
      return;
    }
    if (isIOS()) { iosGuide(); return; }
    if (typeof showToast === 'function') showToast('浏览器没给安装入口：用菜单里的「安装应用 / 添加到主屏幕」');
  }
  fsEl.addEventListener('change', () => {
    const on = fsEl.checked;
    if (isIOS()) {                       // iPhone：不假装修状态栏，讲清限制并指路
      fsEl.checked = false;
      store.set('0');
      iosGuide();
      sync(false);
      return;
    }
    if (!fsSupported()) {
      fsEl.checked = false;
      store.set('0');
      if (typeof showToast === 'function') showToast('当前浏览器不支持全屏：换 Chrome / Edge，或添加到主屏幕后从桌面图标打开');
      sync(false);
      return;
    }
    store.set(on ? '1' : '0');
    try {
      const el = document.documentElement;
      if (on) {
        const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen();
        if (p && p.catch) p.catch(() => { fsEl.checked = false; store.set('0'); sync(false); });
      } else if (document.exitFullscreen) {
        const p = document.exitFullscreen();
        if (p && p.catch) p.catch(() => {});
      } else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (e) {
      fsEl.checked = false; store.set('0');
      if (typeof showToast === 'function') showToast('进入全屏失败：' + (e && e.message ? e.message : '浏览器不允许'));
    }
    sync(on);      // 乐观显示（落定前不闪回），fullscreenchange 来了再以真实态校准
  });
  const instBtn = document.getElementById('fsInstallBtn');
  if (instBtn) instBtn.addEventListener('click', install);
  // 系统侧全屏变化（Esc / 系统手势退出）→ 同步开关与文案
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  // 启动恢复：安卓/桌面上次开着就补一次（iOS 不进这支，进 iosGuide）
  try {
    if (store.get() === '1' && !isIOS() && fsSupported() && !fsActive()) {
      const p = document.documentElement.requestFullscreen ? document.documentElement.requestFullscreen({ navigationUI: 'hide' }) : document.documentElement.webkitRequestFullscreen();
      if (p && p.catch) p.catch(() => {});
    }
  } catch (e) {}
  sync();
})();
