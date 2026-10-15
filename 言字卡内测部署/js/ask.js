// ===== 问问TA：互动提问卡片（单选题 / 多选题 / 文字题） =====
// 顶栏问号按钮打开编辑面板；发送后聊天里出现互动卡片（render.js _askCardHTML 渲染）。
// 单选题：TA 稍后从选项里随机选一个 → 卡片高亮答案并附 note；
// 多选题：TA 稍后从选项里勾几个（2 ~ 选项数的一半，每次现掷）→ 卡片高亮多枚并附 note；
// 文字题：TA 稍后从字卡库「主字卡」抽 1~8 张，直接以 chip 形式展示在互动卡片内（m.ask.parts）。
// 打字机与在途名额与 chat.js 共用同一张按会话的表（_pendingAdd/_pendingDone），互不打架。
// 面板那七值（题型／回答时间三样／重复提问／题目与写过的选项）记本机 localStorage、不进 data 也不进备份：同信箱筛选·世界感知 tag 那一族口径。

const ASK_MAX_OPTS = 12;   // 选择题答案上限（一行一个答案；多行框让人能连着往下写，上限只管住卡片别被撑成一面墙）
const ASK_MIN_OPTS = 2;    // 选择题答案下限
const ASK_MAX_CARDS = 8;   // 文字题回复字卡上限
const ASK_LAST_KEY = 'ordinal-ask-last';      // 面板上次档位（只活在本机）
const ASK_KINDS = ['choice', 'multi', 'text'];

let _askKind = 'choice';   // 当前面板题型：choice | multi | text
let _askDelayMode = 'random';   // 回答时间模式：random(随机) | custom(自定义)
let _askDelayUnit = 's';        // 自定义单位：s 秒 | m 分钟
let _askKeep = true;            // 「重复提问」那一枚：发出去之后这道题留不留着（默认留着＝#207 那版行为）
let _askNumVal = 5;             // 自定义回答时间此刻生效的那个数：屏上那格留空＝用户还没填完，不改这一格（#351）

const _askHintText = {
  choice: 'TA 会从下面的答案里选一个回答你',
  multi: 'TA 会从下面的答案里勾几个回答你（至少两个）',
  text: 'TA 会用字卡库「主字卡」里的字卡回答（1~8 张，多张之间空一格）'
};
// 答案区那一行的小字跟着题型走：写着「选一个」的多选题是个假承诺
const _askOptSubText = {
  choice: 'TA 会从里面选一个回答',
  multi: 'TA 会从里面勾几个回答'
};

// 多选回答勾几枚：至少两枚，上限不超过选项数的一半（向上取整）＝5 个选项给 2~3 枚。
// 区间内每次现掷不钉死；两个选项时上下限同值＝全选，所以 hint 只承诺「至少两个」，不承诺「必留一个没勾」。
function _askMultiCount(n) {
  const lo = Math.min(2, n);
  const hi = Math.max(lo, Math.ceil(n / 2));
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

// 记忆与回显用的夹取（提交那一发仍按用户输入报错，见 submitAsk）：脏值回默认 5
function _askClampNum(raw) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 5;
  return Math.min(1440, n);
}
// 那格留空＝「这一格不动」（用户正在改、还没打完字，或故意清空想沿用上次那个数）：
// 旧写法把空框夹成出厂 5 落账，而记账被题型／单位／关闭面板／历史回填各触发一次＝
// 用户没碰过这个数字，它也会被下一次顺手操作偷偷改回 5（BUGS #351＝#255 那格「空框不动」同一族）
function _askCommitNum() {
  const el = $('#askDelayNum');
  const raw = el ? String(el.value || '').trim() : '';
  if (raw) _askNumVal = _askClampNum(raw);
}

// 面板档位与这一发写过的字记本机：读侧逐档验形状，脏值回落默认＝不留一枚点不到的空档
function _askOptText() { return String(($('#askOpts') || {}).value || ''); }
// 多行框 → 答案那一本账：按行拆、逐行 trim、丢掉没有字的行（空行不是答案）。
// ⚠ 这里**不夹上限**：夹了就等于「用户写了 15 行、只用前 12 行、且不告诉他」的静默截断
// （BUGS 里「看着对实则吞了东西」那一族）。上限由 _askOptsOverflow 报、由 submitAsk 拦住问用户。
// 写侧（发送那一刻）与读侧（回填本机档位）共用这一处，别处不许再 split 一遍——
// 两处各写一份，将来改一处漏一处（#207 那两道闸同保一件事的教训）
function _askParseOpts(text) {
  return String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}
// 面板档位记本机：读侧逐档验形状，脏值回落默认＝不留一枚点不到的空档。
// q/opts 一律照屏上记（含没写完的草稿）＝翻开关不许把用户正写着的东西抹掉；「发完就清」只发生在发送那一刻，见 submitAsk
function _askSaveLast() {
  try {
    const qEl = $('#askQuestion');
    localStorage.setItem(ASK_LAST_KEY, JSON.stringify({
      kind: _askKind, mode: _askDelayMode, unit: _askDelayUnit, keep: _askKeep,
      num: _askNumVal,
      q: qEl ? String(qEl.value || '').trim().slice(0, 60) : '',
      opts: _askParseOpts(_askOptText()).slice(0, ASK_MAX_OPTS)
    }));
  } catch {}
}
function _askLoadLast() {
  const out = { kind: 'choice', mode: 'random', unit: 's', keep: true, num: 5, q: '', opts: [] };
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(ASK_LAST_KEY) || 'null'); } catch { return out; }
  if (!raw || typeof raw !== 'object') return out;
  if (ASK_KINDS.includes(raw.kind)) out.kind = raw.kind;
  if (raw.mode === 'custom') out.mode = 'custom';
  if (raw.unit === 'm') out.unit = 'm';
  if (raw.keep === false) out.keep = false;   // 只认明确的关；缺键与脏值＝留着＝不给旧记录凭空换一个档
  if (Number.isFinite(Number(raw.num)) && Number(raw.num) >= 1) out.num = _askClampNum(raw.num);
  if (typeof raw.q === 'string') out.q = raw.q.trim().slice(0, 60);
  if (Array.isArray(raw.opts)) out.opts = raw.opts.filter(s => typeof s === 'string' && s.trim()).slice(0, ASK_MAX_OPTS);
  return out;
}

function _askOptsToText(list) { return (Array.isArray(list) ? list : []).join('\n'); }   // 回填多行框：一行一个答案

// ===== 面板开关 =====
function openAsk() {
  const last = _askLoadLast();      // 回到上次用的那一档（以前每次打开硬重置成「单选题＋随机」）
  // 开关先落到内存：下面三次 setXxx 各自会记一次账，晚落就把刚读回来的这档盖成模块初值
  _askKeep = last.keep;
  const keepEl = $('#askKeep');
  if (keepEl) keepEl.checked = last.keep;   // 程序写 checked 不派发 change＝不会为这次回显多记一笔账
  const numEl = $('#askDelayNum');
  // 数值先落到内存再落到 DOM：同上，晚落就把自己刚读回来的值盖成 HTML 默认的 5
  _askNumVal = last.num;
  if (numEl) numEl.value = last.num;
  setAskKind(last.kind);
  const qEl = $('#askQuestion');
  qEl.value = last.q;              // 题目与选项留着＝同一道题再问一遍不用重打
  const optEl = $('#askOpts');
  optEl.value = _askOptsToText(last.opts);   // 一行一个答案，逐字回填（没写过就是空框）
  setAskDelayMode(last.mode);
  setAskDelayUnit(last.unit);
  _syncAskClears();
  $('#askHint').textContent = _askHintText[last.kind];
  _askHistOpen = false;   // 每次打开面板历史区回折起（翻折是「此刻怎么看」，不跟着档位记忆走）
  _askHistSync();
  // 滚动区（.ask-modal-body）每次打开回到顶：上次翻到半截关掉、再开从半截处开始＝题型与提示看不见
  const _askBodyEl = $('#askModalBody');
  if (_askBodyEl) _askBodyEl.scrollTop = 0;
  $('#askMask').hidden = false;
  setTimeout(() => { try { qEl.focus(); } catch {} }, 60);
}
// 关闭即记账：中途改过的题目／选项／档位都算「这一发用过的」，不留「屏上改了、下次开又是旧的」
function closeAsk() { _askSaveLast(); $('#askMask').hidden = true; }

// 两枚 × 都只在各自那格有字时出现（空框上挂一枚按了没反应的 ×＝本仓反复被打回的那一族）
function _syncAskClears() {
  const qBtn = $('#askClearQ'), qEl = $('#askQuestion');
  if (qBtn && qEl) qBtn.hidden = !qEl.value;
  const oBtn = $('#askClearOpts'), oEl = $('#askOpts');
  if (oBtn && oEl) oBtn.hidden = !oEl.value;
}

// 「发完就清」那一档在发送那一刻把面板清回出厂样子：题目空、答案框空。
// 答案框是一枚多行框，清它只有「置空」这一件事——不留第二份「把面板铺开」的实现（旧写法要逐行建序号与 ×）
function _clearAskFields() {
  const qEl = $('#askQuestion');
  if (qEl) qEl.value = '';
  const optEl = $('#askOpts');
  if (optEl) optEl.value = '';
  _syncAskClears();
}

function setAskKind(k) {
  _askKind = ASK_KINDS.includes(k) ? k : 'choice';
  $$('.ask-kind').forEach(b => {
    if (b.dataset.kind === _askKind) b.setAttribute('data-active', '');
    else b.removeAttribute('data-active');
  });
  $('#askOptsBox').hidden = _askKind === 'text';
  const sub = $('#askOptSub');
  if (sub) sub.textContent = _askOptSubText[_askKind] || '';
  const h = $('#askHint');
  if (h) h.textContent = _askHintText[_askKind];
  _askSaveLast();
}

// ===== 回答时间模式/单位切换 =====
function setAskDelayMode(mode) {
  _askDelayMode = mode === 'custom' ? 'custom' : 'random';
  $$('.ask-time-mode').forEach(b => {
    if (b.dataset.mode === _askDelayMode) b.setAttribute('data-active', '');
    else b.removeAttribute('data-active');
  });
  const c = $('#askTimeCustom');
  if (c) c.hidden = _askDelayMode !== 'custom';
  _askSaveLast();
}
function setAskDelayUnit(unit) {
  _askDelayUnit = unit === 'm' ? 'm' : 's';
  $$('.ask-time-unit').forEach(b => {
    if (b.dataset.unit === _askDelayUnit) b.setAttribute('data-active', '');
    else b.removeAttribute('data-active');
  });
  _askSaveLast();
}

// ===== 答案框（一行一个答案） =====
// 用户点名改成 mochi「帮我决定」那种一行一个答案的多行框：整块替换掉旧的那一族
// （每行一枚输入框／逐行字母圆标／每行的删除钮／「添加选项」钮），回车换行接着写，不再点加号。
// 好处一眼可见：答案多起来时是一段可读的清单，不再是几行各自一个小格。
// 代价如实说：Ctrl+Enter 不再是「提交」（多行框里它也是换行），提交只走下方那枚「发送提问」钮。
// 超上限时回给用户「要删几行」，而不是拿 slice 悄悄截掉他正写着的字——
// 静默截断＝用户写了 15 行、发出去只剩 12，且不知道少了哪三行（本仓「看着对实则吞了东西」那一族）
function _askOptsOverflow() {
  return _askParseOpts(_askOptText()).length - ASK_MAX_OPTS;
}

// ===== 发送提问 =====
function submitAsk() {
  const q = $('#askQuestion').value.trim();
  if (!q) { showToast('先写下想问 TA 的话'); return; }
  const isText = _askKind === 'text';
  const isMulti = _askKind === 'multi';
  let opts = null;
  if (!isText) {
    opts = _askParseOpts(_askOptText());
    if (opts.length < ASK_MIN_OPTS) { showToast('至少填写 ' + ASK_MIN_OPTS + ' 个答案'); return; }
    const over = _askOptsOverflow();
    if (over > 0) { showToast('最多 ' + ASK_MAX_OPTS + ' 个答案，请删掉多余的 ' + over + ' 行'); return; }
  } else if (!_categoryCards('主字卡').length) {
    showToast('字卡库还没有「主字卡」，TA 没法用字卡回答'); return;
  }
  let delay = 0;   // 0 = 随机（跟随回复速度）
  if (_askDelayMode === 'custom') {
    const numEl = $('#askDelayNum');
    const raw = numEl ? String(numEl.value || '').trim() : '';
    if (raw && Number(raw) > 1440) { showToast('回答时间过长，请勿超过 1440 分钟'); return; }
    // 有字才动这一格；留空＝沿用记着的那一档（不当 1 秒发出去，也不当 5 落账，见 _askCommitNum）
    _askCommitNum();
    delay = _askNumVal * (_askDelayUnit === 'm' ? 60000 : 1000);
  }
  // picks 只有多选题用得上；单选与文字题一并带着 null＝一张卡两种形状，读侧不必问「这题是哪年出的」
  const ask = isText
    ? { kind: 'text', opts: null, status: 'waiting', pick: null, picks: null, cardCount: null, delay }
    : { kind: isMulti ? 'multi' : 'choice', opts, status: 'waiting', pick: null, picks: null, cardCount: null, delay };
  const msg = { id: nextId(), from: 'me', text: q, ask, time: time(), date: new Date().toLocaleDateString('zh-CN') };
  data.messages.push(msg);
  save();
  _askSaveLast();   // 这一发用的档位就是「下次还想这么用」的那一档
  if (!_askKeep) _clearAskFields();  // 「发完就清」：清在 closeAsk 记账之前＝屏上清了什么、账上就是什么（写手仍只有一处）
  closeAsk();
  showView('chat');
  // 停在搜索定位的历史窗口时发问 → 回到最新对话（与聊天发送一致）
  _animateNextRender = true;
  // BUGS #425 发卡片后不滚底：这一发漏了 chat.js `_composerSend` 那记「发送前强制开贴底意图锁」。
  // renderMessages 的增量路径只在 `isChatAtBottom()`（距底 ≤400px）为真时才滚底，否则只亮回底浮钮；
  // 而问问TA 这一发有两个必然把它顶过 400 的来源：
  //   ① 卡片本身高——head＋题干＋N 个选项（每枚约 40px），4 项≈250px、8 项≈430px、12 项≈610px，
  //      普通文本气泡只有几十 px，所以「发消息滚、发卡片不滚」不是错觉；
  //   ② 面板里那枚输入框持焦 → 键盘把可视区压矮，closeAsk 只是把面板 hidden，键盘收起是异步动画，
  //      renderMessages 同步跑的这一刻 clientHeight 还矮着，dist 被再抬一截。
  // 故与聊天发送同一手：渲染前先 scrollChatToBottom()（强制 _stickBottom=true，renderMessages 才读得到）。
  scrollChatToBottom();
  if (inLocateMode()) jumpToLatest(); else renderMessages();
  // 键盘收起那一拍可视区会抬回去，高度稳定循环可能刚好在动画中途收工（chat.js 发送后那条 rAF 治的是同一件事）
  requestAnimationFrame(() => scrollChatToBottom());
  scheduleAskAnswer(msg);
}

// ===== TA 回答调度（思考延迟 + 打字机，模式同 chat.js partnerReply） =====
function scheduleAskAnswer(m) {
  if (!m || !m.ask || m.ask.status !== 'waiting') return;
  const cid = data.activeChat;          // 提问落在哪个会话，此刻就记死（BUGS #088）
  const stream = data.messages;         // 这条卡片所在的那条会话流，别在到期时去别的会话里找同 id
  const pool = _categoryCards('主字卡');   // 回答用的字卡池同样在发起时读，切了会话不换池子
  const custom = Math.max(0, Number(m.ask.delay) || 0);   // 单独设置的回答时间
  let delay;
  if (custom > 0) {
    delay = Math.max(1000, custom);
  } else {
    const bh = data.behavior || {};
    const fastest = Math.max(1, Number(bh.rsMin) || 1) * 1000;
    const slowest = Math.max(fastest, Math.max(1, Number(bh.rsMax) || 40) * 1000);
    delay = Math.max(1000, fastest + (slowest - fastest) * Math.random());
  }
  _pendingAdd(cid, true);
  setTimeout(() => {
    try {
      _deliverAskAnswer(m, stream, pool);
    } finally {
      _pendingDone(cid);
    }
  }, delay);
}

function _deliverAskAnswer(m, stream, pool) {
  if (!m || !m.ask) return;
  // 消息可能已被删除/撤回：以【它自己那条会话流】里的最新状态为准（旧写法读 data.messages，切了会话就找不到这条卡片）
  const cur = (stream || data.messages || []).find(x => x.id === m.id);
  if (!cur || cur.recalled || cur.ask.status !== 'waiting') return;
  if (cur.ask.kind === 'choice') {
    const opts = Array.isArray(cur.ask.opts) ? cur.ask.opts.filter(o => o && String(o).trim()) : [];
    cur.ask.pick = opts.length ? opts[Math.floor(Math.random() * opts.length)] : '';
    cur.ask.status = 'answered';
    save();
    _rerenderAskMsg(cur);
    return;
  }
  if (cur.ask.kind === 'multi') {
    // 不放回抽样＝同一选项不会被勾两遍（选项本身可重复，故按位置取、取走即从袋里拿掉）
    const bag = (Array.isArray(cur.ask.opts) ? cur.ask.opts : []).filter(o => o && String(o).trim()).slice();
    const want = Math.min(_askMultiCount(bag.length), bag.length);
    const picks = [];
    for (let i = 0; i < want && bag.length; i++) picks.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
    cur.ask.picks = picks;
    cur.ask.status = 'answered';
    save();
    _rerenderAskMsg(cur);
    return;
  }
  // 文字题：抽 1~8 张不重复的主字卡，直接展示在互动卡片内
  pool = pool || _categoryCards('主字卡');
  if (!pool.length) return;   // 字卡被清空 → 保持等待，与聊天无字卡时对方不回复一致
  const bag = pool.slice();
  const want = 1 + Math.floor(Math.random() * Math.min(ASK_MAX_CARDS, bag.length));
  const picked = [];
  for (let i = 0; i < want && bag.length; i++) {
    picked.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
  }
  cur.ask.status = 'answered';
  cur.ask.cardCount = picked.length;
  cur.ask.parts = picked;   // 字卡存进卡片，答案直接显示在卡片内
  save();
  _rerenderAskMsg(cur);
}

// ===== 补答上次会话遗留的未回答卡片（app.js init 调用）：逐张错开，模拟 TA 逐条回应 =====
function ensureAskAnswers() {
  let acc = 0;
  (data.messages || []).forEach(m => {
    if (!m || !m.ask || m.ask.status !== 'waiting') return;
    setTimeout(() => scheduleAskAnswer(m), acc);
    acc += 2600 + Math.random() * 3600;
  });
}

// 卡片由 waiting → answered 后重建对应 DOM（渲染窗口外则无需处理，翻页时会按数据重建）
function _rerenderAskMsg(m) {
  const list = $('#messageList');
  if (!list) return;
  const el = list.querySelector('.message[data-id="' + m.id + '"]');
  if (!el) return;
  const [miniImg, miniPartner, miniMine] = getMiniAvatarHTML();
  const fresh = _buildMessageHTML(m, miniImg, miniMine, miniPartner);
  el.replaceWith(fresh);
}

// ===== 历史记录（面板内折叠区，2026-10-13 用户「问问ta 功能页面缺少历史记录的功能」） =====
// 现捞当前会话流里带 ask 的消息，不另立一份存储＝删了消息历史里也就没有，账只有一本。
// 展开状态记页内变量：每次打开面板回折起（同世界感知筛选 chips 那族「页内状态」口径，不进 localStorage）。
const ASK_HIST_MAX = 20;   // 屏上最多铺多少条；更早的不铺只报数＝面板别被撑成一面墙
let _askHistOpen = false;
function _askHistItems() {
  return (data.messages || []).filter(m => m && m.ask && !m.recalled);
}
function _askHistAns(a) {
  if (!a || a.status !== 'answered') return '等 TA 回答';
  if (a.kind === 'choice') return a.pick ? 'TA 选了「' + a.pick + '」' : 'TA 没答上来';
  if (a.kind === 'multi') return (a.picks || []).length ? 'TA 勾了 ' + a.picks.join(' · ') : 'TA 没答上来';
  const parts = a.parts || [];   // 文字题：TA 抽的那几张主字卡
  return parts.length ? 'TA 抽了 ' + parts.join(' · ') : 'TA 没答上来';
}
function _askHistHTML() {
  const items = _askHistItems().slice().reverse();   // 新的在上
  if (!items.length) return '<div class="ask-hist-empty">还没问过 TA</div>';
  const kindName = k => k === 'multi' ? '多选' : k === 'text' ? '文字' : '单选';
  let out = items.slice(0, ASK_HIST_MAX).map(m => {
    const a = m.ask || {};
    const ts = String(m.date || '') + (m.time ? ' ' + m.time : '');
    return `<button type="button" class="ask-hist-item" data-ask-hist="${m.id}">`
      + `<span class="ask-hist-top"><span class="ask-hist-kind">${kindName(a.kind)}</span><span class="ask-hist-q">${escapeHTML(m.text || '')}</span><span class="ask-hist-ts">${escapeHTML(ts)}</span></span>`
      + `<span class="ask-hist-ans${a.status === 'answered' ? ' ok' : ''}">${escapeHTML(_askHistAns(a))}</span></button>`;
  }).join('');
  if (items.length > ASK_HIST_MAX) out += `<div class="ask-hist-empty">更早的还有 ${items.length - ASK_HIST_MAX} 条，去聊天记录里翻</div>`;
  return out;
}
// 头/计数/清单三处一次对齐（openAsk 与翻折、回填后各走一遍；hidden 由 theme.css 那条收）
function _askHistSync() {
  const box = $('#askHistBox');
  if (!box) return;
  const n = _askHistItems().length;
  box.hidden = !n;   // 一条都没问过＝整区不出现（不留一块点不开的空架子）
  const cnt = $('#askHistCount');
  if (cnt) cnt.textContent = n ? n + ' 条' : '';
  const list = $('#askHistList');
  if (list) { list.hidden = !_askHistOpen; list.innerHTML = _askHistHTML(); }
  const head = $('#askHistToggle');
  if (head) head.classList.toggle('on', _askHistOpen);
}
// 点一条历史＝把那道题回填进面板（题型/题目/答案），「同一道题再问一遍不用重打」
function _askFillFromHist(m) {
  const a = m.ask || {};
  setAskKind(ASK_KINDS.includes(a.kind) ? a.kind : 'choice');
  const qEl = $('#askQuestion');
  if (qEl) qEl.value = m.text || '';
  const optEl = $('#askOpts');
  if (optEl) optEl.value = _askOptsToText(Array.isArray(a.opts) ? a.opts : []);
  _syncAskClears();
  const h = $('#askHint');
  if (h) h.textContent = _askHintText[_askKind];
  _askSaveLast();   // 回填也算「这一发用过的」＝关掉面板再开还在（与手写同账）
  _askHistOpen = false;   // 回填完收起＝屏上让给题目/答案框，别让清单挡着改字
  _askHistSync();
  setTimeout(() => { try { qEl && qEl.focus(); } catch {} }, 60);
}

// ===== 事件绑定（脚本在 body 尾部，DOM 已就绪） =====
const _askTopBtn = $('#askBtn');
if (_askTopBtn) _askTopBtn.addEventListener('click', openAsk);
$('#askClose').addEventListener('click', closeAsk);
$('#askCancel').addEventListener('click', closeAsk);
$('#askSend').addEventListener('click', submitAsk);
const _askMaskEl = $('#askMask');
if (_askMaskEl) _askMaskEl.addEventListener('click', e => { if (e.target === _askMaskEl) closeAsk(); });
$$('.ask-kind').forEach(b => b.addEventListener('click', () => setAskKind(b.dataset.kind)));
$$('.ask-time-mode').forEach(b => b.addEventListener('click', () => setAskDelayMode(b.dataset.mode)));
$$('.ask-time-unit').forEach(b => b.addEventListener('click', () => setAskDelayUnit(b.dataset.unit)));
const _askDelayNumEl = $('#askDelayNum');
if (_askDelayNumEl) _askDelayNumEl.addEventListener('change', () => { _askCommitNum(); _askSaveLast(); });   // 数值也记本机，下次打开回到这个数（留空＝这一格不动）
$('#askQuestion').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); submitAsk(); return; }
  if (e.key === 'Escape') closeAsk();
});
$('#askQuestion').addEventListener('input', _syncAskClears);
$('#askOpts').addEventListener('input', _syncAskClears);
// 两枚 × 各清自己那一格（清完焦点回到框里接着写），画法与显隐同一份实现
[ ['#askClearQ', '#askQuestion'], ['#askClearOpts', '#askOpts'] ].forEach(pair => {
  const btn = $(pair[0]);
  if (!btn) return;
  btn.addEventListener('click', () => {
    const el = $(pair[1]);
    if (el) { el.value = ''; el.focus(); }
    _syncAskClears();
  });
});
// 这枚开关只决定「发出去之后留不留」：切档不当场清屏——用户可能题还没写完就先切档，
// 当场抹掉＝拿一次点开关删掉他正写着的东西（清空唯一发生在发送那一刻，见 submitAsk）
const _askKeepEl = $('#askKeep');
if (_askKeepEl) _askKeepEl.addEventListener('change', () => {
  _askKeep = !!_askKeepEl.checked;
  _askSaveLast();
});
// 历史记录：翻折只换清单那块，点一条回填那道题（委托绑在容器上＝清单 innerHTML 怎么重铺监听都在）
const _askHistToggleEl = $('#askHistToggle');
if (_askHistToggleEl) _askHistToggleEl.addEventListener('click', () => {
  _askHistOpen = !_askHistOpen;
  _askHistSync();
});
const _askHistListEl = $('#askHistList');
if (_askHistListEl) _askHistListEl.addEventListener('click', e => {
  const it = e.target.closest('[data-ask-hist]');
  if (!it) return;
  const m = (data.messages || []).find(x => String(x.id) === it.dataset.askHist);
  if (m) _askFillFromHist(m);
});
