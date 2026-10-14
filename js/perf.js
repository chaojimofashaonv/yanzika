// ===== 运行时性能守护（BUGS #432 · 手机端流畅度批）=====
// 本件只做一件事：**在「动」的时候关掉最贵的那笔开销，静止了立刻还回来**。
// 观感规则归 css/motion.css（那里定义挂上之后长什么样），这里只管什么时候挂、什么时候摘。
//
// 为什么需要它：backdrop-filter 是逐帧重采样它身后的画面。静止时这钱付得值（玻璃质感就是它），
// 滚动时付等于白付——手指在动的时候人眼读不出背景模糊的细节，而合成器每帧要多跑一遍全屏采样。
// 尤其 .bubble：聊天页一屏十几枚气泡，每一枚都是一层实时模糊，弱机上这就是掉帧的大头。
//
// ① 滚动／惯性期降级：html.mo-scrolling（动→挂，静 140ms→摘）
// ② 低端机常驻降级：html.mo-lite（内存 ≤4G 或 逻辑核 ≤4，全程挂着）
// ③ moFrame(fn)：全站共用的 rAF 合帧器（同一帧里多次调用只排一帧）
// ④ moDefer(fn)：动的时候排队，静下来再跑（重活别跟滚动抢主线程）
//
// ⚠ 三条纪律：
//   · 全程 try/catch 兜底，本件任何一步出错都**不许**影响主流程（它是增强不是依赖）。
//   · 不碰 visualViewport／键盘——那一族归 js/app.js 的 _vvFix（#430），两边都动必漂。
//   · 逃生阀：地址栏带 ?moperf=off 时本件整体不启用（排障时先摘它，看卡顿是不是它引起的）。

(function () {
  'use strict';
  try {
    var root = document.documentElement;
    if (!root) return;

    // 逃生阀：?moperf=off（值任意，出现即生效）
    try {
      if (/[?&]moperf=off\b/.test(String(location.search || ''))) {
        window.__moPerf = { off: true, on: false, lite: false };
        return;
      }
    } catch (e) {}

    var IDLE_MS = 140;          // 静多久算「停了」：iOS 惯性滚动两帧间隔约 8~16ms，
                                // 取 140 既躲得开帧间隙、又不至于让降级拖到停手后还亮着。
    var last = 0, on = false, timer = 0, deferQ = [];

    function flushDefer() {
      var q = deferQ;
      deferQ = [];
      for (var i = 0; i < q.length; i++) { try { q[i](); } catch (e2) {} }
    }

    function removeCls() {
      on = false;
      timer = 0;
      try { root.classList.remove('mo-scrolling'); } catch (e) {}
      flushDefer();
    }

    function tick() {
      var gap = Date.now() - last;
      if (gap >= IDLE_MS) { removeCls(); return; }
      timer = setTimeout(tick, IDLE_MS - gap);   // 只在「还剩多久」上排一次，不是每帧重排
    }

    function onScroll() {
      last = Date.now();
      if (!on) {
        on = true;
        try { root.classList.add('mo-scrolling'); } catch (e) {}
      }
      if (!timer) timer = setTimeout(tick, IDLE_MS);
    }

    // scroll 事件**不冒泡**，但在 capture 阶段会自上而下走一遍 ⇒ 挂在 document 上用 capture
    // 能听见任意后代容器的滚动（聊天列表∶弹层∶朋友圈…），不需要给每个容器各挂一个监听。
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    // 触摸拖动本身也发 scroll，但快速甩动后惯性期间仍会持续发 scroll，故 ① 已覆盖；
    // 这里补 touchmove 只为「手指按住不动地拖」这种不产生 scroll 的边缘情况。
    document.addEventListener('touchmove', onScroll, { passive: true, capture: true });

    // ── ② 低端机探测 ──
    // deviceMemory 是 Chrome 系才有的（Device Memory API），iOS Safari 没有 ⇒ 拿不到就**不降级**，
    // 不猜、不按 UA 猜机型（那条路在本仓踩过：UA 判断一错就是整族观感错）。
    var lite = false;
    try {
      var mem = navigator.deviceMemory, cores = navigator.hardwareConcurrency;
      if (typeof mem === 'number' && mem > 0 && mem <= 4) lite = true;
      if (typeof cores === 'number' && cores > 0 && cores <= 4) lite = true;
    } catch (e) {}
    if (lite) { try { root.classList.add('mo-lite'); } catch (e) {} }

    // ── ③ rAF 合帧 ──
    // 散在各处的「下一帧再做」如果各自 requestAnimationFrame，一帧里会排进好几个回调，
    // 每个回调里再各自读一次几何＝同一帧多次强制重排。共用一帧＝整帧只读一次。
    var fRaf = 0, fQ = [];
    function flushFrame() {
      fRaf = 0;
      var q = fQ; fQ = [];
      for (var i = 0; i < q.length; i++) { try { q[i](); } catch (e2) {} }
    }
    window.moFrame = function (fn) {
      if (typeof fn !== 'function') return;
      fQ.push(fn);
      if (!fRaf) fRaf = requestAnimationFrame(flushFrame);
    };

    // ── ④ 动的时候排队，静下来再跑 ──
    window.moDefer = function (fn) {
      if (typeof fn !== 'function') return;
      if (!on) { try { fn(); } catch (e2) {} return; }   // 没在动 → 立刻跑，别无谓地等
      deferQ.push(fn);
    };

    // 切到后台／切回来时把降级类收干净：后台里 scroll 事件可能停发，
    // 回来时那个类还挂着＝顶栏一直不糊（看着像「玻璃开关失灵」）。
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { if (timer) { clearTimeout(timer); timer = 0; } removeCls(); }
    });

    // 排障／量具落点：只读，不参与任何判定
    window.__moPerf = { off: false, on: on, lite: lite, IDLE_MS: IDLE_MS };
  } catch (err) {
    try { window.__moPerf = { off: false, error: String(err && err.message || err) }; } catch (e0) {}
  }
})();
