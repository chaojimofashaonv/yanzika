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
    if (perf) perfData = {
      unload: (perf.unloadEventEnd - perf.unloadEventStart).toFixed(0) + 'ms',
      redirect: (perf.redirectEnd - perf.redirectStart).toFixed(0) + 'ms',
      dns: (perf.domainLookupEnd - perf.domainLookupStart).toFixed(0) + 'ms',
      tcp: (perf.connectEnd - perf.connectStart).toFixed(0) + 'ms',
      ttfb: (perf.responseStart - perf.requestStart).toFixed(0) + 'ms',
      response: (perf.responseEnd - perf.responseStart).toFixed(0) + 'ms',
      domParse: (perf.domInteractive - perf.navigationStart).toFixed(0) + 'ms',
      load: (perf.loadEventEnd - perf.navigationStart).toFixed(0) + 'ms',
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
    `连接类型: ${navigator.connection ? navigator.connection.effectiveType + ' (' + navigator.connection.type + ')' : '不支持'}`,
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
