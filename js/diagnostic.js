// ===== 诊断信息 =====

// ===== 错误采集（重构：与诊断入口 DOM 解耦 + 提前挂载 + localStorage 持久化）=====
// 旧实现把 error/unhandledrejection 监听放在 initDiagnostic 里、且在 $('#diagOutput')
// 判空 return 之后——①设置页输出框 DOM 被挪/删时采集整体静默失效；②本文件在 js_order
// 第 13 位，前面模块的启动错误抓不到；③错误只存内存，刷新即清零，用户「刚才报错了」
// 打开诊断永远是空列表。现改为：本文件一加载就挂监听（IIFE 顶部），错误持久化到
// localStorage（键 ordinal-diag-errs，环形 20 条），入口 DOM 不存在只影响展示不影响采集。
const DIAG_ERRS_KEY = 'ordinal-diag-errs';
const DIAG_ERRS_CAP = 20;
function diagReadErrs() {
  try {
    const raw = localStorage.getItem(DIAG_ERRS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function diagPushErr(type, msg) {
  try {
    const arr = diagReadErrs();
    // 30s 内同文去重：轮询/定时器重复报错会刷掉其他线索
    const now = Date.now();
    const dup = arr.length && arr[arr.length - 1].msg === msg && (now - (arr[arr.length - 1].ts || 0)) < 30000;
    if (dup) return;
    arr.push({ ts: now, time: new Date().toLocaleTimeString('zh-CN'), type: type, msg: String(msg).slice(0, 300) });
    if (arr.length > DIAG_ERRS_CAP) arr.splice(0, arr.length - DIAG_ERRS_CAP);
    localStorage.setItem(DIAG_ERRS_KEY, JSON.stringify(arr));
  } catch { /* 存储失败不影响采集主流程 */ }
}
(function diagBindErrors() {
  if (window._diagErrorBound) return;
  window._diagErrorBound = true;
  window.addEventListener('error', e => {
    diagPushErr('error', (e.message || '') + (e.filename ? ' @ ' + (e.filename.split('/').pop() || '') + ':' + e.lineno : ''));
  });
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason;
    diagPushErr('promise', (r && (r.message || String(r))) || 'unknown');
  });
})();

// 实测帧率：一次性测量，测完缓存到 window._diagFPS 并刷新诊断显示（防递归）
let _diagRenderLock = false;
function renderDiag() {
  if (_diagRenderLock) return;
  _diagRenderLock = true;
  requestAnimationFrame(() => { _diagRenderLock = false; });
  const out = $('#diagOutput');
  if (out) out.textContent = getDiagnosticInfo();
}
function startFPSMeasure() {
  if (window._diagFPSMeasuring) return;
  window._diagFPSMeasuring = true;
  let frames = 0;
  const start = performance.now();
  (function tick() {
    frames++;
    if (performance.now() - start < 1000) requestAnimationFrame(tick);
    else {
      window._diagFPS = frames;
      window._diagFPSMeasuring = false;
      renderDiag();
    }
  })();
}

// ===== iOS 视口与键盘适配判定（BUGS #456 · 屏幕诊断里「判定器」那一层）=====
// 与对岸 mochi 的 screenDiagJudge 同一个思路：**实测值 → 一条条 ✓/✗ 结论**，而不是再堆一屏原始读数。
// 上面那份报告（设备∶视口∶能力∶性能）是给开发者看的原始数据，用户抄回来仍然要人现推；
// 本段专管四件真机症状：整页可拖出屏幕 / 页面被放大 / 键盘挡住打字框 / 键盘期错位。
// ⚠ 三条纪律：① 全程只读——不写样式、不装 vv 监听、不新开定时器，键盘那一族的读数一律念 js/app.js 的 __iosFit 镜像；
//   ② 只在诊断渲染那一刻算（诊断页开着才有成本，静息零开销）；
//   ③ 判式不许与执行器各写一份——阈值（80px∶16px∶1.01∶24px）与 css/motion.css ⑩∶js/app.js _vvApply 同数，那两边走这里跟。
function iosFitInp() {
  const d = document, de = d.documentElement, b = d.body;
  const vv = window.visualViewport, fit = window.__iosFit || null;
  const innerH = window.innerHeight, innerW = window.innerWidth;
  // 横向溢出体检：页面被自动缩小（scale<1）的典型成因是内容横向溢出（固定宽面板把文档撑宽，
  // iOS 为容纳它把整页缩到能装下）。只报现场、不猜：找出真越界的那几枚。（对岸 mochi #971 同一条经验）
  // ⚠ 成本闸：只在诊断页开着时跑、节点上限 3000、命中三枚就收手（rect 读数是整帧一次布局，不重复强制）
  const wide = [];
  try {
    const all = b.querySelectorAll('main,section,div,input,textarea,button,img,table,pre,svg');
    for (let i = 0; i < all.length && i < 3000; i++) {
      const el = all[i];
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > innerW + 1) {
        wide.push((el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '') + ' 超宽' + Math.round(r.right - innerW) + 'px'));
        if (wide.length >= 3) break;
      }
    }
  } catch (e) {}
  // 16px 地板自检：这条盯的不是今天（地板已在 css/motion.css ⑩-b 钉上），而是「以后新页面又写 13px」
  // 与「闸门被人摘了」——两道都靠这一条现形（只数屏上真看得见的，上限 200 枚）
  const small = [];
  try {
    const eds = b.querySelectorAll('input,textarea');
    for (let i = 0; i < eds.length && i < 200; i++) {
      const el = eds[i], t = (el.getAttribute('type') || '').toLowerCase();
      if (['checkbox', 'radio', 'range', 'file', 'color', 'button', 'submit', 'reset', 'hidden', 'image'].indexOf(t) >= 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;              // 没上屏的不算（display:none 的框不会被聚焦，也就不触发放大）
      const fs = parseFloat(getComputedStyle(el).fontSize) || 0;
      if (fs > 0 && fs < 16) small.push(((el.id ? '#' + el.id : el.className ? '.' + String(el.className).split(' ')[0] : el.tagName.toLowerCase())) + '=' + fs + 'px');
    }
  } catch (e) {}
  const shell = d.querySelector('.app-shell'), sr = shell ? shell.getBoundingClientRect() : null;
  let cvLeft = 0;
  try {
    d.querySelectorAll('.view').forEach(v => {
      try { if (getComputedStyle(v).contentVisibility === 'auto') cvLeft++; } catch (e) {}
    });
  } catch (e) {}
  return {
    uaIOS: /iPhone|iPad|iPod/.test(String(navigator.userAgent || '')),
    pin: de.classList.contains('ios-pin'), forced: !!(fit && fit.forced),
    offValve: /[?&]iosfit=off\b/.test(String(location.search || '')),
    kbFixOff: b.dataset.kbFix === 'off',
    fit: fit, kb: !!(fit && fit.kb),
    scale: vv ? (vv.scale || 1) : 1, vvH: vv ? Math.round(vv.height) : 0,
    dy: vv ? Math.round(vv.offsetTop || 0) : 0,
    innerH: innerH, innerW: innerW,
    docOverY: de.scrollHeight - de.clientHeight, docOverX: de.scrollWidth - de.clientWidth,
    shellBottom: sr ? Math.round(sr.bottom) : 0, shellH: sr ? Math.round(sr.height) : 0,
    wide: wide, small: small, cvLeft: cvLeft,
    last: fit ? fit.last : null, log: fit ? (fit.log || []) : []
  };
}
// 纯判定器：inp 为采集好的实测值，返回 findings 数组（{ok,name,detail}）——没有 DOM 调用，量具可直接单测
function iosFitJudge(inp) {
  const F = [];
  const add = (ok, name, detail) => F.push({ ok: !!ok, name: name, detail: detail || '' });
  // ① 闸门：iOS 上必须挂着（非 iOS 出「不适用」的绿，别拿它吓人）
  if (!inp.uaIOS) add(true, 'iOS 硬化闸门', '非 iOS，本段判据只作参考');
  else add(inp.pin, 'iOS 硬化闸门', inp.pin
    ? '在位' + (inp.forced ? '（?iosfit=force 试跑）' : '') + '：钉文档∶16px 地板∶.view 退出跳过渲染' + (inp.kbFixOff ? '；但 body[data-kbFix=off] 开着（#361 那把人工退路＝不压壳也不捞框）' : '')
    : '未挂载——' + (inp.offValve ? '地址栏带了 iosfit=off' : '地址栏并没有带 iosfit=off＝闸门件没跑起来，多半是缓存里那份旧产物（先看开屏公告那一行版号）') + '，下面那些 ✗ 都是「本来就没开」不是「开了坏」');
  // ② 整页可拖余量（症状①的唯一硬证据：文档比布局口高/宽一点点就是「能拖到屏幕外面」）
  const over = Math.max(inp.docOverY, inp.docOverX);
  add(over <= 2, '整页可拖余量', over <= 2 ? '文档＝布局口（纵向 ' + inp.docOverY + 'px∶横向 ' + inp.docOverX + 'px）'
    : '纵向 +' + inp.docOverY + 'px∶横向 +' + inp.docOverX + 'px → 整页可被拖着滚出可视区' + (inp.wide.length ? '；横向越界元素：' + inp.wide.join(' · ') : ''));
  // ③ 页面缩放（症状②：比例不对。键盘只缩高度从不动 scale，所以 scale≠1 就是「被放大/缩小」不是键盘）
  const scaled = Math.abs(inp.scale - 1) > 0.01;
  add(!scaled, '页面缩放 scale', !scaled ? '1.00（无自动放大∶无双指缩放）'
    : inp.scale.toFixed(2) + ' → ' + (inp.scale > 1 ? '页面被放大（iOS 对 <16px 输入框聚焦的强制放大／用户双指），_vvApply 按 #435 那把闸不补偿' : '页面被缩小（典型成因＝内容横向溢出，iOS 缩到能装下）'));
  // ④ 16px 地板（症状②③的共同根因：聚焦就放大）
  add(!inp.small.length, '输入框 16px 地板', inp.small.length ? inp.small.length + ' 枚可见可编辑控件字号 <16px（iOS 聚焦即整页放大）：' + inp.small.slice(0, 3).join(' · ') : '无一枚 <16px');
  // ⑤ 键盘在场读数（事实行，恒绿：这一行只回答「现在键盘开着吗、量到多高」）
  add(true, '键盘在场', inp.kb ? ('开着：可视带 ' + inp.vvH + 'px（布局口 ' + inp.innerH + 'px，差 ' + (inp.innerH - inp.vvH) + 'px）∶视觉口平移 ' + inp.dy + 'px') : '收起（可视带＝布局口 ' + inp.innerH + 'px）');
  // ⑥ 壳与可视带贴合（症状③的硬证据：错位＝输入栏与贴底面板跑在键盘底下或屏幕外面）
  if (inp.kb) {
    const gap = Math.abs(inp.shellBottom - (inp.dy + inp.vvH));
    add(gap <= 24, '壳与可视带贴合', gap <= 24 ? '壳底边＝带底边（差 ' + gap + 'px）' : '差 ' + gap + 'px → 壳没跟着可视带走（补偿未生效或被摘）');
  } else add(true, '壳与可视带贴合', '键盘收起，不判');
  // ⑦ 焦点框可视带（＝用户要的「键盘遮挡预警」：拿 js/app.js 捞框那一次的现场读数）
  const L = inp.last;
  if (!L) add(true, '焦点框可视带', '未采到（本机这一轮没聚焦过可编辑控件，或聊天输入栏那一面归 _vvApply 压壳管）');
  else if (L.inside) add(true, '焦点框可视带', (L.id ? '#' + L.id : L.cls || '框') + ' 在带内' + (L.moved ? '（捞过 ' + L.moved + 'px）' : '（无需捞）'));
  else if (L.noScroller) add(true, '焦点框可视带', (L.id ? '#' + L.id : L.cls || '框') + ' 不在滚动容器里→位置交给压壳那一段（壳底边看 ⑥ 那行）');
  else add(false, '焦点框可视带', (L.id ? '#' + L.id : L.cls || '框') + ' 被挤出带外 ' + L.out + 'px（带 ' + L.band + '∶框 ' + L.box + '∶scale ' + L.scale + '）');
  // ⑧ 100dvh 与布局口（键盘收起时这俩该同数；差得多＝工具栏收放途中或补偿残留）
  if (!inp.kb) {
    const d2 = Math.abs(inp.shellH - inp.innerH);
    add(d2 <= 4, 'dvh 与布局口', d2 <= 4 ? '同数（' + inp.shellH + 'px）' : '差 ' + d2 + 'px → 壳高与可视区不等（地址栏收放中／残留），这一族正是抖的来源');
  } else add(true, 'dvh 与布局口', '键盘开着，不判');
  // ⑨ .view 跳过渲染残留（#004·#316 那一族：iOS 上挂着就是「滑到飞出屏幕的位置」的同根因；pin 在位时应恒 0）
  add(inp.cvLeft === 0 || !inp.pin, '.view 跳过渲染', inp.cvLeft === 0 ? '全部已退出（#004·#316 那一族在 iOS 上收干净）'
    : inp.cvLeft + ' 面还挂着 auto（#359 那条几何契约靠 contain，不靠它）');
  return F;
}
function iosFitLines() {
  let inp = null, F = [];
  try { inp = iosFitInp(); F = iosFitJudge(inp); } catch (e) { return ['✗ 判定器出错：' + String((e && e.message) || e)]; }
  const L = F.map(f => (f.ok ? '✓ ' : '✗ ') + f.name + (f.detail ? '：' + f.detail : ''));
  const log = (inp && inp.log) || [];
  L.push(log.length ? '键盘沿（最近 6 条）：' + log.slice(-6).map(e => new Date(e.t).toLocaleTimeString('zh-CN') + (e.kb ? ' 开→' + e.h + 'px' : ' 收') + (e.dy ? '∥平移' + e.dy : '')).join(' · ') : '键盘沿：本轮未采到（没弹过键盘＝无沿可记，这一行不是故障）');
  return L;
}

function getDiagnosticInfo() {
  const d = data || {};   // 启动期 data 尚未赋值时也会被 initDiagnostic 调用，必须判空
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  let gpuInfo = '未知';
  if (gl) {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      gpuInfo = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '未知';
    } else {
      gpuInfo = gl.getParameter(gl.RENDERER) || '未知';
    }
  }


  const ua = navigator.userAgent;
  // 修复：原表达式混入 navigator.userActivation?.persistentState（语义完全无关，
  // 纯错误代码），platform 缺失时就该是「未知」
  const platform = navigator.platform || '未知';
  const language = navigator.language || navigator.userLanguage || '未知';
  const languages = (navigator.languages || [language]).join(', ');

  // UA 解析
  const uaParsed = (() => {
    const r = { device: '未知', os: '未知', browser: '未知', version: '', webview: false };
    if (/iPhone|iPad|iPod/.test(ua)) {
      r.os = 'iOS ' + (ua.match(/OS (\d+[_\.]\d+(?:[_\.]\d+)?)/)?.[1]?.replace(/_/g, '.') || '');
      r.device = /iPad/.test(ua) ? 'iPad' : /iPod/.test(ua) ? 'iPod' : 'iPhone';
    } else if (/Android/.test(ua)) {
      r.os = 'Android ' + (ua.match(/Android (\d+(?:\.\d+)?)/)?.[1] || '');
      r.device = (ua.match(/;\s*([^;)]+?)\s*Build\//)?.[1] || 'Android设备').trim();
    } else if (/Windows NT/.test(ua)) {
      const v = ua.match(/Windows NT (\d+\.\d+)/)?.[1];
      r.os = 'Windows ' + (v === '10.0' ? '10/11' : v || '');
    } else if (/Mac OS X/.test(ua)) {
      r.os = 'macOS ' + (ua.match(/Mac OS X (\d+_\d+(?:_\d+)?)/)?.[1]?.replace(/_/g, '.') || '');
    } else if (/Linux/.test(ua)) {
      r.os = 'Linux';
    }
    if (/CriOS\/(\d+)/.test(ua)) { r.browser = 'Chrome iOS'; r.version = ua.match(/CriOS\/(\d+(?:\.\d+)?)/)?.[1] || ''; }
    else if (/FxiOS\/(\d+)/.test(ua)) { r.browser = 'Firefox iOS'; r.version = ua.match(/FxiOS\/(\d+(?:\.\d+)?)/)?.[1] || ''; }
    else if (/EdgiOS\/(\d+)/.test(ua)) { r.browser = 'Edge iOS'; r.version = ua.match(/EdgiOS\/(\d+(?:\.\d+)?)/)?.[1] || ''; }
    else if (/Edg\/(\d+)/.test(ua)) { r.browser = 'Edge'; r.version = ua.match(/Edg\/(\d+(?:\.\d+)?)/)?.[1] || ''; }
    else if (/Firefox\/(\d+)/.test(ua)) { r.browser = 'Firefox'; r.version = ua.match(/Firefox\/(\d+(?:\.\d+)?)/)?.[1] || ''; }
    else if (/Chrome\/(\d+)/.test(ua)) { r.browser = 'Chrome'; r.version = ua.match(/Chrome\/(\d+(?:\.\d+)?)/)?.[1] || ''; }
    else if (/Safari\/(\d+)/.test(ua)) { r.browser = 'Safari'; r.version = ua.match(/Version\/(\d+(?:\.\d+)?)/)?.[1] || ua.match(/Safari\/(\d+)/)?.[1] || ''; }
    r.webview = /; wv\)/.test(ua) || /WebView/.test(ua) || (r.browser === 'Chrome' && !/Safari\//.test(ua));
    return r;
  })();

  // userAgentData (Client Hints)
  const uaData = navigator.userAgentData;
  const uaDataStr = uaData ? `${uaData.platform || '?'} / ${(uaData.brands || []).map(b => `${b.brand}=${b.version}`).join(', ')}` : '不支持';

  // 方向
  const orientation = screen.orientation ? screen.orientation.type : '未知';
  const angle = screen.orientation ? (screen.orientation.angle || '?') : '?';

  // 系统深色偏好
  const darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches ? '深色' : '浅色';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? '启用' : '未启用';
  const reducedTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)').matches ? '启用' : '未启用';

  // pointer / hover / 强制颜色 / 反色
  const pointerMQ = window.matchMedia('(pointer: coarse)').matches ? 'coarse(触摸)'
    : window.matchMedia('(pointer: fine)').matches ? 'fine(精确)' : 'none';
  const hoverMQ = window.matchMedia('(hover: none)').matches ? 'none(无悬停)'
    : window.matchMedia('(hover: hover)').matches ? 'hover(可悬停)' : '未知';
  const forcedColors = window.matchMedia('(forced-colors: active)').matches ? '启用' : '未启用';
  const invertedColors = window.matchMedia('(inverted-colors: inverted)').matches ? '反色' : '正常';

  // CSS 特性检测
  const cssTests = {
    'container-queries': CSS.supports('container-type: inline-size'),
    ':has()': CSS.supports('selector(:has(*))'),
    'aspect-ratio': CSS.supports('aspect-ratio: 1'),
    'grid': CSS.supports('display: grid'),
    'flexbox': CSS.supports('display: flex'),
    'css-grid': CSS.supports('display: grid'),
    'subgrid': CSS.supports('grid-template-rows: subgrid'),
    'calc()': CSS.supports('width: calc(1px + 1px)'),
    'var()': CSS.supports('color: var(--x)'),
    'overscroll-behavior': CSS.supports('overscroll-behavior: contain'),
    'scroll-behavior:smooth': CSS.supports('scroll-behavior: smooth'),
    'touch-action:manipulation': CSS.supports('touch-action: manipulation'),
    '-webkit-fill-available': CSS.supports('width: -webkit-fill-available'),
    'dvh/svh/lvh': CSS.supports('height: 100dvh') && CSS.supports('height: 100svh') && CSS.supports('height: 100lvh'),
  };

  // -webkit- 特性（CSS.supports 不一定可靠，用元素 style 测）
  const webkitTests = (() => {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;';
    document.body.appendChild(el);
    const r = {};
    el.style.webkitOverflowScrolling = 'touch';
    r['-webkit-overflow-scrolling:touch'] = el.style.webkitOverflowScrolling === 'touch' ? '支持' : '不支持';
    el.style.webkitTapHighlightColor = 'transparent';
    r['-webkit-tap-highlight-color'] = el.style.webkitTapHighlightColor === 'transparent' ? '支持' : '不支持';
    el.style.webkitTextSizeAdjust = '100%';
    r['-webkit-text-size-adjust'] = el.style.webkitTextSizeAdjust === '100%' ? '支持' : '不支持';
    document.body.removeChild(el);
    return r;
  })();

  // 运行环境
  const isInFrame = window !== window.top;
  const isInIframe = !!window.frameElement;
  const isPWA = !!window.matchMedia('(display-mode: standalone)').matches;
  const isFullscreen = !!window.matchMedia('(display-mode: fullscreen)').matches;
  const isMinimalUI = !!window.matchMedia('(display-mode: minimal-ui)').matches;
  const referrer = document.referrer || '(直接访问)';
  const currentUrl = location.href;

  // iOS standalone + apple meta
  const iosStandalone = navigator.standalone === true ? '是(主屏)' : '否';
  const appleMeta = document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content || '未设置';

  // 硬件信息
  const hardwareConcurrency = navigator.hardwareConcurrency || '未知';
  const touchPoints = navigator.maxTouchPoints;

  // 错误列表：从 localStorage 持久化读取，采集在文件顶部监听，刷新后仍在
  const errorList = diagReadErrs().slice(-5);
  const errorCount = diagReadErrs().length;

  // 滚动相关
  const scrollX = window.pageXOffset || 0;
  const scrollY = window.pageYOffset || 0;
  const docHeight = document.documentElement.scrollHeight;
  const docClientHeight = document.documentElement.clientHeight;

  // DOM 统计
  const totalElements = document.querySelectorAll('*').length;
  const imgCount = document.querySelectorAll('img').length;
  const inputCount = document.querySelectorAll('input, textarea, select').length;

  // zoom 检测（移动端意外缩放）
  let zoomLevel = '未知';
  try {
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const sw = screen.width;
    if (vw > 0 && sw > 0) {
      zoomLevel = (sw / vw).toFixed(2) + (vw === sw ? ' (正常)' : ' ⚠️ 可能缩放');
    }
  } catch { zoomLevel = '检测失败'; }

  // 关键 API 支持
  const apiTests = {
    'Cache API': 'cache' in window,
    'BroadcastChannel': 'BroadcastChannel' in window,
    'Web Animations API': 'animate' in document.documentElement,
    'Share API': 'share' in navigator,
    'Notifications': 'Notification' in window,
    'Vibration API': 'vibrate' in navigator,
    'Wake Lock API': 'wakeLock' in navigator,
    'Barcode API': 'BarcodeDetector' in window,
    'Face/Touch ID': 'PublicKeyCredential' in window,
    'Clipboard read': !!navigator.clipboard?.readText,
    'structuredClone': typeof structuredClone === 'function',
    'crypto.randomUUID': !!crypto?.randomUUID,
    'scheduler.postTask': !!navigator.scheduler?.postTask,
    'requestIdleCallback': typeof requestIdleCallback === 'function',
    'inputmode attr': (() => { const i = document.createElement('input'); i.setAttribute('inputmode', 'numeric'); return i.inputMode === 'numeric'; })(),
    'enterkeyhint attr': (() => { const i = document.createElement('input'); i.setAttribute('enterkeyhint', 'go'); return i.enterKeyHint === 'go'; })(),
    'DeviceMotion权限': typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function',
  };

  // 性能数据
  let perfData = null;
  try {
    const perf = performance.getEntriesByType('navigation')[0];
    // FIX 2026-10-15 #456：这一页的「DOM 解析」「页面加载」恒写 NaNms——PerformanceNavigationTiming 上早就没有
    // navigationStart（规范里换成 startTime），读到 undefined 就是 NaN。报告里说假话比少一行更坏，按现名读。
    const t0 = perf && perf.startTime != null ? perf.startTime : 0;
    if (perf) perfData = {
      unload: (perf.unloadEventEnd - perf.unloadEventStart).toFixed(0) + 'ms',
      redirect: (perf.redirectEnd - perf.redirectStart).toFixed(0) + 'ms',
      dns: (perf.domainLookupEnd - perf.domainLookupStart).toFixed(0) + 'ms',
      tcp: (perf.connectEnd - perf.connectStart).toFixed(0) + 'ms',
      ttfb: (perf.responseStart - perf.requestStart).toFixed(0) + 'ms',
      response: (perf.responseEnd - perf.responseStart).toFixed(0) + 'ms',
      domParse: (perf.domInteractive - t0).toFixed(0) + 'ms',
      // loadEventEnd 在 load 之前是 0，拿 0 减 t0 会写出负数——没发生的事不编读数（与本仓「量不到的读数不编」同一条）
      load: perf.loadEventEnd ? (perf.loadEventEnd - t0).toFixed(0) + 'ms' : '尚未触发 load',
    };
  } catch { /* ignore */ }

  // performance.memory
  const perfMem = performance.memory ? {
    used: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1) + 'MB',
    total: (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(1) + 'MB',
    limit: (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(0) + 'MB',
  } : null;

  // visualViewport 全量 + 键盘高度
  let vvInfo = '不支持';
  let keyboardHeight = '无';
  if (typeof visualViewport !== 'undefined') {
    // 推算值并标注口径——iOS Safari 工具栏收展（约55-60px）也会改变
    // vv.height 与 innerHeight 的差，>50px 阈值下可能误报「键盘弹出」，
    // 读数仅供定位参考，不能当键盘高度的精确证据
    const kh = visualViewport.height - window.innerHeight;
    keyboardHeight = kh > 50 ? kh + 'px（推算值，工具栏收展可能误报）' : '无';
    vvInfo = `height=${Math.round(visualViewport.height)}px offsetTop=${Math.round(visualViewport.offsetTop)}px scale=${visualViewport.scale} pageLeft=${Math.round(visualViewport.pageLeft)} pageTop=${Math.round(visualViewport.pageTop)}`;
  }

  // 页面可见性
  const visibilityState = document.visibilityState;

  // GPU 渲染加速（复用顶部已创建的 gl 上下文——旧代码第二次
  // canvas.getContext('webgl') 重复创建上下文，白耗一次 GPU 资源）
  let gpuAccel = '未知';
  try {
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      gpuAccel = gl.getParameter(debugInfo ? debugInfo.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '未知';
    } else {
      gpuAccel = '不支持（无 WebGL 上下文）';
    }
  } catch { gpuAccel = '检测失败'; }

  // 安全上下文
  const isSecure = window.isSecureContext;
  const protocol = location.protocol;

  // viewport meta 完整内容 + viewport-fit
  const viewportMeta = (() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return '未找到 viewport meta';
    return meta.getAttribute('content') || '(空)';
  })();
  const viewportFit = viewportMeta.includes('viewport-fit=cover') ? 'viewport-fit=cover ✓'
    : viewportMeta.includes('viewport-fit=contain') ? 'viewport-fit=contain'
    : 'viewport-fit 未设置（安全区域可能无效）';

  // theme-color meta
  const themeColor = document.querySelector('meta[name="theme-color"]')?.content || '未设置';

  // 安全区域实测（用临时元素读 padding:env(...)，env() 不能在 JS 直接取值）
  const safeArea = (() => {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);visibility:hidden;';
    document.body.appendChild(el);
    const cs = getComputedStyle(el);
    const r = `top=${cs.paddingTop} bottom=${cs.paddingBottom} left=${cs.paddingLeft} right=${cs.paddingRight}`;
    document.body.removeChild(el);
    return r;
  })();

  // 视口单位实测 (100vh/dvh/svh/lvh 实际像素)
  const vpUnits = (() => {
    const units = ['vh', 'dvh', 'svh', 'lvh'];
    const r = {};
    units.forEach(u => {
      const el = document.createElement('div');
      el.style.cssText = `position:fixed;top:0;left:0;width:0;height:100${u};visibility:hidden;`;
      document.body.appendChild(el);
      r[u] = Math.round(el.getBoundingClientRect().height) + 'px';
      document.body.removeChild(el);
    });
    return r;
  })();

  // 根字号
  const rootFontSize = getComputedStyle(document.documentElement).fontSize;

  // localStorage 实测写入 + 已用大小
  const lsTest = (() => {
    try {
      const k = '__diag_test__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return '正常';
    } catch (e) { return '异常: ' + e.name; }
  })();
  const lsSize = (() => {
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        total += k.length + (localStorage.getItem(k) || '').length;
      }
    } catch {}
    return (total / 1024).toFixed(1) + 'KB';
  })();

  const fps = window._diagFPS || '测量中...';

  // Service Worker 状态（同步检查）
  // 修复竞态：旧实现每次渲染都重新 getRegistration 并把结果写局部变量
  // swStatus——重渲染时状态又从头「不支持→已注册」闪烁。改为结果缓存到
  // window._diagSW，只探测一次，后续渲染直接读缓存。
  let swStatus = window._diagSW || '检测中…';
  // FIX 2026-09-01 #007 file:// 协议下 getRegistration() 被拒且未捕获，控制台抛 SecurityError（BUGS.md #007）
  if (!window._diagSW && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.getRegistration().then(reg => {
      window._diagSW = reg ? `已注册 (${reg.scope})` : '未注册';
      renderDiag();
    }).catch(() => { window._diagSW = '不可用（file://）'; renderDiag(); });
  } else if (!window._diagSW && !('serviceWorker' in navigator)) {
    window._diagSW = '不支持';
  }

  // IndexedDB 状态（同款修复：结果缓存 + 只测一次）
  // 旧实现每次渲染都 open('__diag_test__') 再 deleteDatabase——诊断页开着不动，
  // 每几秒反复创建删除测试库。改缓存到 window._diagIDB。
  let idbStatus = window._diagIDB || '检测中…';
  if (!window._diagIDB) {
    if (!window.indexedDB) {
      window._diagIDB = '不支持';
    } else {
      idbStatus = '支持（需测试）';
      try {
        const testDB = indexedDB.open('__diag_test__', 1);
        testDB.onupgradeneeded = () => testDB.result.createObjectStore('test');
        testDB.onsuccess = () => {
          window._diagIDB = '正常';
          testDB.result.close();
          indexedDB.deleteDatabase('__diag_test__');
          renderDiag();
        };
        testDB.onerror = () => { window._diagIDB = '异常'; };
      } catch { window._diagIDB = '异常'; }
    }
  }

  // 电池状态（同款修复：缓存到 window._diagBattery，且不支持时输出明确一行）
  let batteryInfo = window._diagBattery || '不支持（该浏览器无 getBattery 接口）';
  if (!window._diagBattery && navigator.getBattery) {
    navigator.getBattery().then(battery => {
      const level = Math.round((battery.level || 0) * 100) + '%';
      const charging = battery.charging ? '充电中 ⚡' : (battery.chargingTime === Infinity ? '未充电' : `充电剩余 ${battery.chargingTime}s`);
      window._diagBattery = `电量 ${level} - ${charging}`;
      renderDiag();
    }).catch(() => { window._diagBattery = '读取失败'; });
  }

  return [
    `=== 言字卡 · 诊断信息 ===`,
    `生成时间: ${new Date().toLocaleString('zh-CN')}`,
    ``,
    `--- 设备信息 ---`,
    `平台: ${platform}`,
    `用户代理: ${ua}`,
    `UA解析: ${uaParsed.device} / ${uaParsed.os} / ${uaParsed.browser} ${uaParsed.version}${uaParsed.webview ? ' [WebView]' : ''}`,
    `UA Client Hints: ${uaDataStr}`,
    `语言: ${language}`,
    `可用语言: ${languages}`,
    `CPU 核心数: ${hardwareConcurrency}`,
    `触摸点数: ${touchPoints}`,
    `内存 (.deviceMemory): ${navigator.deviceMemory || '不支持'}`,
    ``,
    `--- 屏幕与视口 ---`,
    `屏幕分辨率: ${screen.width} × ${screen.height}`,
    `可用屏幕(avail): ${screen.availWidth} × ${screen.availHeight}`,
    `outer 尺寸: ${window.outerWidth} × ${window.outerHeight}`,
    `屏幕色深: ${screen.colorDepth}bit`,
    `设备像素比: ${window.devicePixelRatio || '未知'}`,
    `视口: ${window.innerWidth} × ${window.innerHeight}`,
    `CSS可视区域: ${typeof visualViewport !== 'undefined' ? `${visualViewport.width}px × ${visualViewport.height}px` : '不支持'}`,
    `根字号: ${rootFontSize}`,
    `安全区域(实测): ${safeArea}`,
    `视口单位实测: 100vh=${vpUnits.vh} 100dvh=${vpUnits.dvh} 100svh=${vpUnits.svh} 100lvh=${vpUnits.lvh}`,
    `Zoom: ${zoomLevel}`,
    ``,
    `--- 系统偏好 ---`,
    `深色模式: ${darkMode}`,
    `屏幕方向: ${orientation} (${angle}°)`,
    `减少动态效果: ${reducedMotion}`,
    `减少透明度: ${reducedTransparency}`,
    `pointer: ${pointerMQ}`,
    `hover: ${hoverMQ}`,
    `forced-colors: ${forcedColors}`,
    `inverted-colors: ${invertedColors}`,
    ``,
    `--- 运行环境 ---`,
    `页面模式: ${isInFrame ? (isInIframe ? 'iframe 嵌入' : '嵌套框架') : (isPWA ? 'PWA 应用' : (isFullscreen ? '全屏' : (isMinimalUI ? 'minimal-ui' : '普通网页')))} `,
    `iOS standalone: ${iosStandalone}`,
    `apple-mobile-web-app-capable: ${appleMeta}`,
    `当前 URL: ${currentUrl}`,
    `来源页面: ${referrer}`,
    `安全上下文: ${isSecure ? '是 (HTTPS)' : '否 (HTTP)'}`,
    `协议: ${protocol}`,
    `viewport meta: ${viewportMeta}`,
    `viewport-fit: ${viewportFit}`,
    `theme-color: ${themeColor}`,
    ``,
    `--- 浏览器能力 ---`,
    `IndexedDB: ${idbStatus}`,
    `localStorage: ${typeof localStorage !== 'undefined' ? '支持' : '不支持'} (写入:${lsTest}, 已用:${lsSize})`,
    `Service Worker: ${swStatus}`,
    `WebGL: ${!!gl ? '支持' : '不支持'}`,
    `GPU: ${gpuInfo}`,
    `网络在线: ${navigator.onLine ? '在线' : '离线'}`,
    `在线协议: ${navigator.onLine ? (navigator.connection ? navigator.connection.effectiveType : '未知') : '离线'}`,
    // FIX 2026-10-15 #456：connection.type 现代内核（Chrome／Safari）根本不暴露，旧写法直接把它接在串里
    // → 报告里出现「连接类型: 4g (undefined)」；没这个读数就该说没给，不该打印一个 undefined
    `连接类型: ${navigator.connection ? navigator.connection.effectiveType + (navigator.connection.type ? ' (' + navigator.connection.type + ')' : '（该内核不暴露网络类型）') : '不支持'}`,
    `JS堆内存: ${perfMem ? `used=${perfMem.used} total=${perfMem.total} limit=${perfMem.limit}` : '不支持'}`,
    `电池: ${batteryInfo}`,
    `GPU 渲染: ${gpuAccel}`,
    ``,
    `--- CSS 特性支持 ---`,
    ...Object.entries(cssTests).map(([k, v]) => `${k}: ${v ? '✓' : '✗'}`),
    ...Object.entries(webkitTests).map(([k, v]) => `${k}: ${v}`),
    ``,
    `--- 键盘与 visualViewport ---`,
    `visualViewport: ${vvInfo}`,
    `键盘高度: ${keyboardHeight}`,
    ``,
    // #456：屏幕适配的「结论层」（上面那些是原始读数，这一段的每一行都带着 ✓/✗ 与症状）
    `--- iOS 视口与键盘适配判定 ---`,
    ...iosFitLines(),
    ``,
    `--- 页面状态 ---`,
    `滚动位置: x=${scrollX}, y=${scrollY}`,
    `文档高度: ${docHeight}px, 可视高度: ${docClientHeight}px`,
    `DOM 元素总数: ${totalElements}`,
    `图片数: ${imgCount}, 表单控件数: ${inputCount}`,
    `页面错误数: ${errorCount}`,
    `可见性: ${visibilityState}`,
    ``,
    `--- 页面性能 ---`,
    `DOM 解析: ${perfData ? perfData.domParse : '不支持'}`,
    `首字节 (TTFB): ${perfData ? perfData.ttfb : '不支持'}`,
    `页面加载: ${perfData ? perfData.load : '不支持'}`,
    `rAF 实测帧率: ${fps} fps`,
    ``,
    `--- API 支持 ---`,
    ...Object.entries(apiTests).map(([k, v]) => `${k}: ${v ? '✓' : '✗'}`),
    ``,
    `--- 错误列表 (最近5条) ---`,
    ...(errorList.length ? errorList.map(e => `[${e.time}] ${e.type}: ${e.msg}`) : ['(无)']),
    ``,
    `--- 应用状态 ---`,
    `当前主题: ${d.theme || 'white'}`,
    `头像形状: ${d.avatarShape || 'circle'}`,
    `消息数: ${d.messages?.length || 0}`,
    `字卡分组: ${d.groups?.length || 0}`,
    `总字卡数: ${d.groups?.reduce((s, g) => s + (g.cards?.length || 0), 0) || 0}`,
    `表情包数: ${d.stickers?.length || 0}`,
    `收到信件: ${d.receivedLetters?.length || 0}`,
    `寄出信件: ${d.sentLetters?.length || 0}`,
    `纪念日: ${d.anniversary || '未设置'}`,
    `存储与体积: 见「设置 → 数据 → 存储」折叠卡（占用读数与清理只有那一处宿主，这里不再各印一份）`,
    ``,
    `--- 功能检测 ---`,
    `clipboard.writeText: ${!!navigator.clipboard?.writeText ? '支持' : '不支持'}`,
    `IntersectionObserver: ${!!IntersectionObserver ? '支持' : '不支持'}`,
    `CSS env(safe-area-inset-*): 支持`,
    `pointer events: ${'ontouchstart' in window ? '触摸屏' : '鼠标'}`,
  ].join('\n');
}

function env(name) {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  } catch { return '?'; }
}


// 诊断信息初始化
(function initDiagnostic() {
  const output = $('#diagOutput');
  if (!output) return; // 仅影响展示；错误采集已解耦到文件顶部的 diagBindErrors

  function refresh() {
    startFPSMeasure();
    output.textContent = getDiagnosticInfo();
  }

  refresh();

  $('#diagCopy')?.addEventListener('click', async () => {
    // 剪贴板那两条路（navigator.clipboard ∶ textarea+execCommand）与「长按消息·复制」共用 utils.js 一处实现，
    // 不在这里写第二份。旧写法不检查 execCommand 返回值就报已复制＝假成功，现在两条都验结果、失败如实提示。
    showToast((await copyTextToClipboard(output.textContent)) ? '已复制' : '复制失败，请手动选择文本复制');
  });

  $('#diagRefresh')?.addEventListener('click', refresh);
  $('#diagExport')?.addEventListener('click', () => {
    const blob = new Blob([output.textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '言字卡-诊断信息.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('已导出 TXT');
  });

})();
