// ===== 入口初始化 =====

// 全站版号（更多页顶部那格读它；assemble.py --bump 时与下面 markStep 一起 +1，锚点别合并＝bump 按各自锚替换）
window.APP_VER = 'v9.9.5';

// 启动进度标记（开屏层已删除：#splashStep 不再有宿主，本函数为空操作，保留作版本锚点与排障落点）
function markStep(s) { const e = document.getElementById('splashStep'); if (e) e.textContent = 'v9.9.5' + s; }

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
      let _vvApplied = null, _vvQueued = false, _vvPoll = null;
      const _vvApply = () => {
        _vvQueued = false;
        if (document.body.dataset.kbFix === 'off') {
          if (_vvApplied !== '') { _appShell.style.height = ''; _appShell.style.marginTop = ''; _vvApplied = ''; }
          _vvPollSet(false);   // 逃生阀开着＝轮询也一并停（开着白转）
          if (document.body.dataset.kb) delete document.body.dataset.kb;   // #456：同一把闸——逃生阀开着就别留 data-kb（css/motion.css ⑩-d 跟着静默，人工退路里不藏第二层 JS 干预）
          return;
        }
        const h = _vv.height;
        // #435：scale≠1＝页面被放大（iOS 对 <16px 输入框聚焦时的强制自动放大／用户双指缩放），不是键盘——
        // 键盘只缩高度、从不动 scale。放大时 vv.height 按 CSS px 读出来也变小，旧判据会把它当键盘把壳压矮+平移，
        // 贴底面板的几何当场被搅乱＝聚焦的框跑出可视区、「打字看不见数字」。此时不补偿，等缩放回去（scale 回 1）再正常判。
        const kb = ((_vv.scale || 1) <= 1.01) && (h < window.innerHeight - 80);   // 键盘真的开了（≠地址栏收起那几像素的抖）
        const next = kb ? h + 'px' : '';
        _vvPollSet(kb);   // #442：收敛轮询的开关（键盘开着＝500ms 一查，收起＝停表）
        // 平移量＝这一帧视觉口在布局坐标里的上沿。它是**独立于高度**的量：iOS 在键盘动画途中、
        // 以及用户拖动已开着的键盘时，都会只改平移不改高度 ⇒ 去重键必须带上它，只看高度会漏这几帧。
        const dy = kb ? Math.max(0, Math.round(_vv.offsetTop || 0)) : 0;
        // #442：sc 一并进去重键（防别的环境里布局口滚动漏报）。补偿生效后文档高度恒＝视口高
        // （margin 顶下去多少、壳就缩掉多少），scrollY 实测恒 0——真正会漏的是**事件本身**：
        // iOS 键盘的事件覆盖面不完整（第三方输入法／听写条／浮动键盘各有各的不发 resize/scroll 的形态，
        // vv 的读数变了却没有任何回调），错过事件补偿就停在旧值＝壳连着遮罩和贴底面板一起错开
        // 真实可视带——现场＝iPhone 上字卡库「批量添加」面板「面板飞了、满屏灰、点不进框」（BUGS #442）。
        // 聊天页有贴底稳定循环（render.js _stickLoop）一直兜着所以没露馅，其余贴底面板全靠这一处。
        // 收口＝下面的收敛轮询＋focusin 一脚即醒；键带上 sc/上屏前重读全部现值，保证轮询醒来总能收敛。
        const sc = Math.round(window.scrollY || window.pageYOffset || 0);
        const key = next + '@' + dy + '@' + sc;
        if (key === _vvApplied) return;          // 值没变 → 不写 style，一次重排都不付
        _vvApplied = key;
        // #456：把「键盘开/关」与这一帧的四枚读数递给只读下游（CSS 与诊断）——两行都挂在这条**已去重**的分支里，
        // 值没变时一次都不进＝不新增重排、不新开定时器、不新装 vv 监听（键盘沿只有 _vvFix 这一个宿主，
        // 两处各写一份＝以后必漂；js/perf.js 头段那条「不碰 visualViewport」的纪律同源）。
        const kbFlag = kb ? 'on' : 'off';
        if (document.body.dataset.kb !== kbFlag) document.body.dataset.kb = kbFlag;   // 消费方＝css/motion.css ⑩-d
        if (window.__iosFit) window.__iosFit.stamp(kb, Math.round(h), dy, sc);
        // 「壳没加补偿时的天然上沿」按**这一帧实测的矩形**倒推（扣掉上一次已经加过的 margin），
        // 不缓存一个静态值：2026-10-14 起产物改外链加载，app-shell 前面那批浮层万一占地方就不能想当然写 0；
        // vv.offsetTop 是「相对布局口」的量，故目标位置还要加上文档已经滚过的那段。
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
      // #442 收敛兜底：iOS 键盘的事件覆盖面不完整——第三方输入法／听写条／浮动键盘各有各的
      // 「vv 读数变了却不发 resize/scroll」的形态，错过事件＝补偿停在旧值＝壳连着遮罩和贴底面板
      // 一起错开真实可视带（BUGS #442 现场：iPhone 字卡库批量添加面板「飞了、满屏灰、点不进框」；
      // 聊天页有 render.js _stickLoop 一直兜着所以没露馅，其余贴底面板全靠这一处）。
      // 键盘开着期间每 500ms 重算一次：去重键没变＝零写入零重排，只有真漂了才补；收起即停表。
      const _vvPollSet = on => {
        if (on && _vvPoll == null) _vvPoll = setInterval(_vvFix, 500);
        else if (!on && _vvPoll != null) { clearInterval(_vvPoll); _vvPoll = null; }
      };
      // focusin 一脚即醒：键盘刚要起来的那一拍有些输入法还没来得及发 vv 事件，聚焦本身先叫醒一趟。
      document.addEventListener('focusin', _vvFix, true);
      window.addEventListener('pagehide', () => {
        _vv.removeEventListener('resize', _vvFix); _vv.removeEventListener('scroll', _vvFix);
        document.removeEventListener('focusin', _vvFix, true);
        if (_vvPoll != null) { clearInterval(_vvPoll); _vvPoll = null; }
      }, { once: true });
    }

    window.addEventListener('pagehide', () => {
      document.removeEventListener('visibilitychange', _visibilityHandler);
      pauseWriteScheduler();
      pauseActiveSend();
      pauseMomentsScheduler();
      // flushSave 自己已经同步兑了一份 localStorage 镜像（js/db.js），这里不再第二发——
      // 旧写法那一句是 #006 那时 flushSave 还不存在留下的尾巴，留着＝卸载前再整树 stringify 一遍（BUGS #434）
      flushSave();
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
    // ⚠ 走裸名 _deferredInstall（BUGS #445）：它在 js/settings.js 是顶层 let＝全局词法绑定，
    //    不挂 window。旧写法读 window._deferredInstall 恒 undefined＝这一支永远走不到，
    //    「添加到主屏幕」按钮只剩降级 toast、原生 prompt() 从不触发（同 #184 的裸名写、同 settings.js 的裸名读）。
    if (_deferredInstall) return '当前形态：浏览器标签页。点下面那枚钮即可安装到桌面（安装后无工具栏，也可在系统设置里开全屏）。';
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
    // 同上：裸名读那枚 beforeinstallprompt 事件（BUGS #445）——用 window. 前缀永远取不到，
    // 装了入口的浏览器点这枚钮也不会弹原生安装框。
    if (_deferredInstall) {
      try { _deferredInstall.prompt(); } catch (e) {}
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

// ===== iOS 视口与键盘适配硬化（BUGS #456）=====
// 用户报的四件事是同一条链：①整页能被拖到屏幕外面 ②比例不对（页面被放大） ③输入法把正在打字的框完全挡住
// ④交互时抖／闪。样式那半在 css/motion.css ⑩（本件只负责往 <html> 上挂那枚闸门类），这里补的是
// init() 里那段 _vvFix 没覆盖的**唯一一件事**：把正在打字的那一枚框捞回「真实可视带」。
//
// 为什么必须自己算、不用 scrollIntoView（三处都是坑）：
//   · 它按**布局视口**对齐——键盘遮住的那一段在它眼里仍然「在视口内」，滚完照样看不见（iOS 老账）；
//   · 它会把滚动一路做到 document 上，而⑩-a 钉住 body 之后那半条路是死的；没钉住时它恰好造出 offsetTop 漂移，
//     与 #430 那套「壳跟着视觉口平移」对冲＝④；
//   · behavior:'smooth' 那 300ms 与键盘动画（≈250ms）同拍抢同一个滚动容器，中间每一帧都在给 _vvApply 换读数＝④的另一半。
// 故：按 visualViewport 现算带 [offsetTop, offsetTop+height]，只滚**最近那一个滚动祖先**，瞬移不缓动。
// scale≠1（#435 那档罢工）时 rect 与 vv 同在 CSS px 坐标系里、判式照样成立＝这一件同时是那一档的兜底。
//
// ⚠ 三条纪律（与 js/perf.js∶js/night.js 同一家风）：
//   · 不新开定时器、不新装 visualViewport 监听——键盘沿由 _vvApply 经 __iosFit.stamp 递过来（唯一宿主）。
//   · 聊天那一面不碰：#messageInput 是壳的 flex 子层（不在任何滚动容器里），它贴回键盘上沿靠 _vvApply 压壳、
//     列表贴底靠 render.js 的 _stickLoop（#050）＝两处都有主，这里再插一脚必漂。
//   · 两枚逃生阀都认：?iosfit=off（整批不启用，含样式闸门）∶body[data-kbFix=off]（#361 那把人工退路，见 focusin 那道判）。
//   量具走第三条路：?iosfit=force——headless 没有 iPhone UA，靠它在同一条代码路上量（tools/_smoke_ios_viewport_pin.js）。
(function iosFitHarden() {
  try {
    const root = document.documentElement, body = document.body, vv = window.visualViewport;
    if (!root || !body) return;
    const ua = String(navigator.userAgent || '');
    // iOS 判定自包一份（站内 __bgIsIOS∶_stIsIOS∶上面那枚全屏的 isIOS 同一口径的先例：不跟别的 IIFE 借私有件）
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
    const q = String(location.search || '');
    if (/[?&]iosfit=off\b/.test(q)) return;                 // 排障：整批摘掉（闸门类与捞框都不做）
    const forced = /[?&]iosfit=force\b/.test(q);
    if (!isIOS && !forced) return;                          // 桌面／安卓走到这一行就收＝本件零参零输出
    root.classList.add('ios-pin');                          // css/motion.css ⑩ 的总闸（摘掉它＝⑩-a∶b∶c 整层失效）

    const EDITABLE = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=color]):not([type=button]):not([type=submit]):not([type=reset]):not([type=image]),textarea';
    const isEditable = el => {
      try { return !!el && !!(el.matches && el.matches(EDITABLE)); } catch (e) { return false; }
    };

    // 只读镜像：诊断页（js/diagnostic.js）与量具都念这一份，不允许第二处自己装 vv 监听
    const FIT = window.__iosFit = {
      on: true, ios: isIOS, forced: forced, pinned: true,
      kb: false, kbH: 0, dy: 0, sc: 0, scale: 1, foci: 0,
      log: [],        // 键盘沿（≤12 条）：{t,kb,h,dy}——「什么时候开的、压到多高、平移多少」的唯一现场
      last: null,     // 最近一次「焦点框 vs 可视带」判定＝诊断里那条遮挡预警的读数
      band() {
        const h = vv ? vv.height : window.innerHeight;
        const top = vv ? (vv.offsetTop || 0) : 0;
        return { top: top, h: h, bottom: top + h };
      },
      inBand(el, pad) {
        const r = el.getBoundingClientRect(), b = FIT.band(), p = pad == null ? 10 : pad;
        return r.top >= b.top + p && r.bottom <= b.bottom - p;
      },
      // 由 _vvApply 在**已去重**那条分支上叫：值没变不进＝零额外开销；顺手记沿与 scale，只在开/关沿上动捞框与还原
      stamp(kb, h, dy, sc) {
        FIT.kb = kb; FIT.kbH = kb ? h : 0; FIT.dy = dy; FIT.sc = sc;
        try { FIT.scale = vv ? (vv.scale || 1) : 1; } catch (e) {}
        if (kb === FIT._prev) return;
        FIT._prev = kb;
        FIT.log.push({ t: Date.now(), kb: kb, h: h, dy: dy });
        if (FIT.log.length > 12) FIT.log.shift();
        if (kb) relive(); else restore();
      }
    };

    let saved = null;   // 唯一一份还原账：{el, sc, before, after}
    // 最近的那一个滚动祖先（文档那一级在⑩-a 之后压根不可滚，不认它；.app-shell 是 overflow:hidden 也不会命中）
    function scrollerOf(el) {
      for (let n = el.parentElement; n && n !== body; n = n.parentElement) {
        let oy = '';
        try { oy = getComputedStyle(n).overflowY; } catch (e) { return null; }
        if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight - n.clientHeight > 2) return n;
      }
      return null;
    }
    function reveal(el) {
      if (!isEditable(el)) return;
      if (body.dataset.kbFix === 'off') return;              // #361 那把人工退路＝这一族全停
      const b = FIT.band(), r = el.getBoundingClientRect(), PAD = 10;
      const above = b.top + PAD - r.top, below = r.bottom - (b.bottom - PAD);   // 正数＝被挤出带外多少
      // moved 从**还原账**上算（不是只在本轮真动手那一下才写）：一次聚焦里这一发会被叫两拍（rAF ＋落定复核），
      // 复核那一拍看到的是「已经在带内」，旧写法会把上一拍的移动量盖成 0＝诊断上读出「没动过」的假话。
      const movedPrev = saved && saved.el === el ? Math.round(saved.after - saved.before) : 0;
      FIT.last = {
        at: Date.now(), id: el.id || '', cls: String((el.className || '')).split(' ')[0] || '',
        kb: FIT.kb, scale: FIT.scale, band: [Math.round(b.top), Math.round(b.bottom)],
        box: [Math.round(r.top), Math.round(r.bottom)], out: Math.round(Math.max(above, below)),
        inside: above <= 0 && below <= 0, moved: movedPrev
      };
      if (FIT.last.inside) return;
      const sc = scrollerOf(el);
      if (!sc) { FIT.last.noScroller = true; return; }        // 不在滚动容器里＝这一枚的位置归 _vvApply 压壳管（聊天输入栏正是这一类）
      if (!saved || saved.el !== el) saved = { el: el, sc: sc, before: sc.scrollTop, after: sc.scrollTop };
      // 对齐到带的**纵向中点**：只推到带上沿，输入法候选条／工具条那一截照样压在它身上（对岸 mochi 同一条经验）
      const delta = r.top - (b.top + (b.h - r.height) / 2);
      const max = sc.scrollHeight - sc.clientHeight;
      sc.scrollTop = Math.max(0, Math.min(max, sc.scrollTop + delta));
      saved.after = sc.scrollTop;
      FIT.last.moved = Math.round(saved.after - saved.before);
    }
    // 键盘刚起来那一拍（含那些不发 resize 的输入法，#442 同族）：谁还拿着焦点就按新的带再捞一次
    function relive() {
      try {
        const el = document.activeElement;
        if (!isEditable(el) || el.id === 'messageInput') return;
        requestAnimationFrame(() => reveal(el));
        setTimeout(() => { if (document.activeElement === el) reveal(el); }, 320);
      } catch (e) {}
    }
    // 键盘收起＝位置还给用户：只有我们那次滚动还在原位时才回滚（用户自己翻过就不动他的阅读位置）
    function restore() {
      const s = saved; saved = null;
      if (!s || !s.sc || s.after === s.before) return;
      try { if (Math.abs(s.sc.scrollTop - s.after) <= 2) s.sc.scrollTop = s.before; } catch (e) {}
    }

    // focusin 捕获：全站只这一枚（与 #442 那枚 focusin 同宿主、不同职责，两条互不覆盖）
    document.addEventListener('focusin', e => {
      const el = e.target;
      if (!isEditable(el)) return;
      FIT.foci++;                                            // 只读计数：诊断与量具拿它分「本件根本没收到焦点事件」与「收到了但没动手」
      saved = null;                                          // 换框＝上一笔还原账作废（不许把 A 的位置扣到 B 上）
      if (el.id === 'messageInput') return;                   // 聊天那一面有主（见头段第二条纪律）
      requestAnimationFrame(() => requestAnimationFrame(() => reveal(el)));
      setTimeout(() => { if (document.activeElement === el) reveal(el); }, 320);   // 键盘动画 ≈250ms，320 那一拍是落定后的复核
    }, true);
  } catch (e) { /* 硬化件是增强不是依赖：出错就不硬化（闸门类没挂上＝回到今天的形状），主流程一律不受影响 */ }
})();
