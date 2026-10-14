// ===== 入站小测 · 开屏公告「确认进入」后的第二道门（先输内测密码，再 8 道单选，全对才放行进桌面）=====
// 与公告的分工：公告每次打开都要重读一遍（BUGS #258），小测答一次管终身——完成标记落 localStorage，
// **只认「在不在」、不比版本**（BUGS #409，2026-10-14 用户定档：开屏密码和答题只需要答一次，后续更新也不重新答题）。
// 键值仍写 QUIZ_GATE_VER 留作来源标注；改题/改答案抬版本号不再触发重考，老值（v1~v4 任何非空值）一律算已答过。
// 内测密码住在小测门内＝门不再出现密码自然也不再问，无须单独记。
// 问卷式（BUGS #355，2026-10-13 晚改版）：八题一次全部铺在一个滚动问卷里，向下滑动逐题选，
// **作答过程零反馈**（选错不当时提醒）；底部常驻一枚「提交」，八题答完才亮；
// 交卷后才判分——答错的选项标红留在原地可换选（改哪题撤哪题的红），全对才放行。
// 只有 age-gate 的「确认进入」会唤起这一页（js/age-gate.js btn 分支）；自动化门预置跳过公告＝连带跳过小测。
const QUIZ_GATE_KEY = 'ordinal-quiz-ok';
const QUIZ_GATE_VER = 'v5-2026-10-14';
// 内测登录密码：小测门内的第 0 步（公告「确认进入」→ 密码 → 八题）。只做本次门内的前置，
// 不落任何存储——过了小测的设备整道门都不再出现，密码自然也不再问；改密码只动这一个常量。
const QUIZ_PASS = '230203';
const QUIZ_PASS_IDLE = '— 请输入内测登录密码 —';
const QUIZ_ITEMS = [
  { q: '网站作者的名字是？',
    opts: ['星言', 'mochi', '言序', '序言'], a: 2 },
  { q: '作者平时在哪个平台活跃？',
    opts: ['抖音', '小红书', '没有作者这个人，网站是凭空出现的'], a: 1 },
  { q: '这个网站的名字是？',
    opts: ['星言', 'mochi', '言字卡', '没有名字'], a: 2 },
  { q: '现在这个网站还在内测，禁止二传链接，正式公开网站后会更换网站链接。如果你想在内测时分享这个网站，并传播链接应该怎么做？',
    opts: ['直接发链接，不管不管', '规则是死的，偷偷发一下怎么了，反正作者不知道', '如果有人问链接 说明正在内测禁止二传链接的情况，指路可以加入作者的内测群自取链接'], a: 2 },
  { q: '这个网站是什么？',
    opts: ['字卡传讯', '小手机'], a: 0 },
  { q: '字卡传讯是怎么回复消息的？',
    opts: ['AI 回答的', '纯代码回复：用系统内置字卡和你自己上传的字卡里挑选字卡随机回复'], a: 1 },
  { q: '这个网站是怎么出现的？',
    opts: ['作者自己花钱花时间做的', '从网上凭空出现，还能自己更新，神奇'], a: 0 },
  { q: '不好用怎么办？',
    opts: ['自己根据个人习惯调整概率和适应使用，字卡传讯网站本质只是工具', '一定是碰上鬼了，我要举报这个网站'], a: 0 }
];
const QUIZ_HINT_IDLE = '— 逐题选出你认为正确的一项 —';

function _quizGatePassed() {
  // 只认「在不在」：任何非空值（含历史版本 v1~v4 写下的）都算已答过＝更新换代不重考（BUGS #409）
  try { return localStorage.getItem(QUIZ_GATE_KEY) !== null; } catch { return false; }
}

window.__quizGateNeed = function () { return !_quizGatePassed(); };

(function () {
  const g = $('#quizGate');
  if (!g) return;
  const prog = $('#quizGateProg');
  const bar = $('#quizGateBar');
  const qa = $('#quizGateQa');
  const hint = $('#quizGateHint');
  const done = $('#quizGateDone');
  const foot = $('#quizGateFoot');
  const submitBtn = $('#quizGateSubmit');
  const enter = $('#quizGateEnter');
  const pass = $('#quizGatePass');
  const pwIn = $('#quizGatePw');
  const pwGo = $('#quizGatePwGo');
  const pwHint = $('#quizGatePwHint');
  // 问卷态：sel[qi]＝每题当前选中的下标（-1＝未答）；wrong＝上一卷判错的题号集合（改了哪题撤哪题的红）
  const sel = QUIZ_ITEMS.map(() => -1);
  const wrong = new Set();
  const blocks = [];  // blocks[qi]＝题目块元素（判错后滚到第一道错题用）
  const optBtns = []; // optBtns[qi][i]＝选项按钮

  function answered() { return sel.filter(v => v >= 0).length; }

  // 底部常驻行：进度文案＋进度条＋提交键明暗＋提示行（判错期间改报错数）
  function refreshFoot() {
    const n = answered();
    if (prog) prog.textContent = '已答 ' + n + ' / ' + QUIZ_ITEMS.length + ' 题';
    if (bar) bar.style.width = (n / QUIZ_ITEMS.length * 100) + '%';
    if (submitBtn) submitBtn.disabled = n < QUIZ_ITEMS.length;
    if (hint) {
      if (wrong.size > 0) {
        hint.textContent = '答错了 ' + wrong.size + ' 题，标红的选项改改再交';
        hint.classList.add('warn');
      } else {
        hint.textContent = n < QUIZ_ITEMS.length
          ? '已答 ' + n + ' / ' + QUIZ_ITEMS.length + '，还有 ' + (QUIZ_ITEMS.length - n) + ' 题未作答'
          : '— 八题都答完了，交卷吧 —';
        hint.classList.remove('warn');
      }
    }
  }

  // 八题一次全部铺出（不翻页）：每块＝编号＋题干＋选项
  function renderAll() {
    if (!qa) return;
    qa.innerHTML = '';
    blocks.length = 0;
    optBtns.length = 0;
    QUIZ_ITEMS.forEach((item, qi) => {
      const block = document.createElement('div');
      block.className = 'qg-block';
      const h = document.createElement('h3');
      h.className = 'qg-q';
      h.innerHTML = '<span class="qg-no"></span><span class="qg-qt"></span>';
      h.querySelector('.qg-no').textContent = (qi + 1) + '.';
      h.querySelector('.qg-qt').textContent = item.q;
      block.appendChild(h);
      const opts = document.createElement('div');
      opts.className = 'qg-opts';
      const btns = [];
      item.opts.forEach((text, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'qg-opt';
        b.innerHTML = '<span class="qg-key"></span><span class="qg-txt"></span>';
        b.querySelector('.qg-key').textContent = 'ABCDEFGH'[i];
        b.querySelector('.qg-txt').textContent = text;
        b.addEventListener('click', () => pick(qi, i));
        opts.appendChild(b);
        btns.push(b);
      });
      block.appendChild(opts);
      qa.appendChild(block);
      blocks.push(block);
      optBtns.push(btns);
    });
  }

  // 选题＝单选：同题换选项只搬选中态；**不判对错**（零反馈），判错留到交卷
  function pick(qi, i) {
    sel[qi] = i;
    optBtns[qi].forEach((b, j) => {
      b.classList.remove('sel', 'bad');
      if (j === i) b.classList.add('sel');
    });
    wrong.delete(qi); // 改过的题不再算「待改的错题」，它的红一并撤掉
    refreshFoot();
  }

  // 交卷：先查有没有漏答，再判分——答错的选项标红留在原地，全对才放行
  function grade() {
    const wrongs = [];
    QUIZ_ITEMS.forEach((item, qi) => { if (sel[qi] !== item.a) wrongs.push(qi); });
    if (wrongs.length === 0) { allRight(); return; }
    wrong.clear();
    wrongs.forEach(qi => {
      wrong.add(qi);
      const b = optBtns[qi][sel[qi]];
      b.classList.remove('bad');
      void b.offsetWidth; // 重启抖动动画
      b.classList.add('bad');
    });
    refreshFoot();
    const first = blocks[wrongs[0]];
    if (first && first.scrollIntoView) first.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // 全对：正确项亮白岛色，短暂确认后结算（换「确认进入」常驻在底部）
  function allRight() {
    QUIZ_ITEMS.forEach((item, qi) => {
      optBtns[qi].forEach((b, j) => {
        b.disabled = true;
        if (j === sel[qi]) b.classList.add('ok');
      });
    });
    if (submitBtn) submitBtn.disabled = true;
    if (hint) { hint.textContent = '✓ 八题全对'; hint.classList.remove('warn'); }
    setTimeout(() => {
      if (qa) qa.hidden = true;
      if (prog) prog.hidden = true;
      if (bar) bar.style.width = '100%';
      if (done) done.hidden = false;
      if (submitBtn) submitBtn.hidden = true;
      if (enter) enter.hidden = false;
    }, 520);
  }

  // 密码步 → 答题步的切换：只翻各块的 hidden，进度条归零重走
  function unlockQuiz() {
    if (pass) pass.hidden = true;
    if (qa) qa.hidden = false;
    if (prog) prog.hidden = false;
    if (foot) foot.hidden = false;
    if (submitBtn) { submitBtn.hidden = false; submitBtn.disabled = true; }
    if (enter) enter.hidden = true;
    renderAll();
    refreshFoot();
  }

  function tryPass() {
    if (!pwIn) { unlockQuiz(); return; }
    if (pwIn.value.trim() === QUIZ_PASS) { unlockQuiz(); return; }
    pwIn.classList.remove('bad');
    void pwIn.offsetWidth; // 重启抖动动画
    pwIn.classList.add('bad');
    if (pwHint) { pwHint.textContent = '密码不对，向作者要内测密码后再来'; pwHint.classList.add('warn'); }
  }

  window.__quizGateShow = function () {
    if (!g || g.classList.contains('on')) return;
    sel.fill(-1);
    wrong.clear();
    if (pass) pass.hidden = false;
    if (qa) qa.hidden = true;
    if (prog) prog.hidden = true;
    if (bar) bar.style.width = '0%';
    if (hint) { hint.hidden = false; hint.textContent = QUIZ_HINT_IDLE; hint.classList.remove('warn'); }
    if (done) done.hidden = true;
    if (foot) foot.hidden = true;
    if (submitBtn) { submitBtn.hidden = false; submitBtn.disabled = true; }
    if (enter) enter.hidden = true;
    if (pwIn) { pwIn.value = ''; pwIn.classList.remove('bad'); }
    if (pwHint) { pwHint.textContent = QUIZ_PASS_IDLE; pwHint.classList.remove('warn'); }
    g.classList.add('on');
    g.setAttribute('aria-hidden', 'false');
    if (pwIn && !('ontouchstart' in window)) pwIn.focus();
  };

  if (pwGo) pwGo.addEventListener('click', tryPass);
  if (pwIn) pwIn.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); tryPass(); }
  });
  if (submitBtn) submitBtn.addEventListener('click', () => {
    if (answered() < QUIZ_ITEMS.length) return; // 没答完＝禁用态，点不动
    grade();
  });

  if (enter) enter.addEventListener('click', () => {
    try { localStorage.setItem(QUIZ_GATE_KEY, QUIZ_GATE_VER); } catch {}
    g.classList.add('gone');
    setTimeout(() => { g.classList.remove('on', 'gone'); g.setAttribute('aria-hidden', 'true'); }, 500);
  });

  window.__quizGateBound = true;
})();
