// ===== 开屏后免责声明 · 18 岁确认（C·契约时间线；滑底门控＋每次打开都要读一遍） =====
// 确认状态只活在本次文档寿命（一个内存布尔）＝关掉重开、刷新都要重新过这一关；不进 data、不进备份、不落任何存储。
// 键名与声明版本号的唯一来源＝html/head.html 的首屏前置脚本（那里要在读档之前就判同一件事）。
// AGE_GATE_KEY 自此只是自动化门预置的跳过标记（存在即免问），真实确认路径从不写它；
// AGE_GATE_VER 也不再承担「声明改版→重新确认」的语义（每一次都要确认，本来就无需比对版本），只留在跳过记录里当来源标注。
const AGE_GATE_KEY = window.AGE_GATE_KEY_EARLY;
const AGE_GATE_VER = window.AGE_GATE_VER_EARLY;
// 旧口径「本机确认一次」的那条凭据，读方没了就清掉，不留没人读的键（同 delete a.tone 那一族）
const AGE_GATE_LEGACY_KEY = 'ordinal-age-confirmed';
const AGE_HINT_LOCK = '— 请阅读至底部后勾选 —';
const AGE_HINT_OK = '— 已读完，勾选确认后进入 —';
let _ageGateEntered = false;

function _ageGateOk() {
  if (_ageGateEntered) return true;
  try { return localStorage.getItem(AGE_GATE_KEY) !== null; } catch { return false; }
}

function _ageGateAtBottom() {
  const g = $('#ageGate');
  const sc = g && g.querySelector('.ag-scroll');
  if (!sc) return true;
  return sc.scrollHeight - sc.scrollTop - sc.clientHeight <= 8;
}

// 「已读完」只进不退：读到底一次即永久解锁，之后离底／可视区变矮都不锁回去（否则勾了也进不去）
function _ageGateUpdate() {
  const g = $('#ageGate');
  if (!g || g.classList.contains('readok')) return;
  // gate-early 时公告已在屏上但还没有 .on（读档还没走完），这一段照样要能解锁
  if (!g.classList.contains('on') && !document.documentElement.classList.contains('gate-early')) return;
  if (!_ageGateAtBottom()) return;
  const check = $('#ageGateCheck');
  const btn = $('#ageGateEnter');
  const hint = $('#ageGateHint');
  g.classList.add('readok');
  if (check) check.disabled = false;
  if (btn && check && check.checked) btn.disabled = false;
  if (hint) hint.textContent = AGE_HINT_OK;
}

// 启动完成后由 app.js init 两条路径调用；已确认过本版声明的设备直接跳过
function maybeShowAgeGate() {
  if (_ageGateOk()) return;
  const g = $('#ageGate');
  if (!g || g.classList.contains('on')) return;
  // gate-early 时这一页早就在屏上了，用户可能已经读到底甚至勾上——不清他的阅读位置与勾选，只补 .on
  if (!document.documentElement.classList.contains('gate-early')) {
    const sc = g.querySelector('.ag-scroll');
    const check = $('#ageGateCheck');
    const btn = $('#ageGateEnter');
    const hint = $('#ageGateHint');
    if (sc) sc.scrollTop = 0;
    if (check) { check.checked = false; check.disabled = true; }
    if (btn) btn.disabled = true;
    if (hint) hint.textContent = AGE_HINT_LOCK;
    g.classList.remove('readok');
  }
  g.classList.add('on');
  g.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(_ageGateUpdate);
}

(function () {
  try { localStorage.removeItem(AGE_GATE_LEGACY_KEY); } catch {}
  const g = $('#ageGate');
  if (!g) return;
  const sc = g.querySelector('.ag-scroll');
  const check = $('#ageGateCheck');
  const btn = $('#ageGateEnter');
  if (!check || !btn) return;
  // 首屏前置那一段已把这一页画上但还没轮到 .on，读屏软件此刻不该被挡在外面
  if (document.documentElement.classList.contains('gate-early')) g.setAttribute('aria-hidden', 'false');
  window.__ageGateBound = true;
  if (sc) sc.addEventListener('scroll', _ageGateUpdate, { passive: true });
  window.addEventListener('resize', _ageGateUpdate);
  check.addEventListener('change', () => { btn.disabled = !check.checked; });
  btn.addEventListener('click', () => {
    if (!check.checked) return;
    // 只记在本次文档寿命里：不落任何存储、不设定时器，下次打开（含刷新）照常再读一遍
    _ageGateEntered = true;
    g.classList.add('gone');
    setTimeout(() => { g.classList.remove('on', 'gone'); g.setAttribute('aria-hidden', 'true'); document.documentElement.classList.remove('gate-early'); }, 500);
    // 公告过后还有入站小测（8 题单选，只填一次，完成标记在 localStorage，见 js/quiz-gate.js）：
    // 没考过就接着考，考完「确认进入」才见桌面；自动化门预置跳过公告＝连带跳过小测
    if (typeof window.__quizGateNeed === 'function' && window.__quizGateNeed() &&
        typeof window.__quizGateShow === 'function') window.__quizGateShow();
  });
})();
