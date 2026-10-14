// ===== 信箱操作 =====

// 邮戳日期格式化
function formatPostmarkDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

let currentDraft = '';
let _isSending = false;

/* ===== 信箱按联系人分册（2026-10-06 段一）=====
   信件仍住在 data.sentLetters／data.receivedLetters 两个全局数组里，每封带 cid；读侧按册筛选
   （收藏页 _favAll、印象簿 #074 两处同族手法），不重构成 by[cid] 嵌套——
   那要连带动导入导出·统计·搜索·诊断五处，收益只有「看起来更整齐」。 */
const _MB_SCOPE_KEY = 'ordinal-mailbox-scope';
let _mbScope = (() => { try { return localStorage.getItem(_MB_SCOPE_KEY) || 'all'; } catch (e) { return 'all'; } })();
function _mbScopeSet(cid) {
  _mbScope = cid || 'all';
  try {
    if (_mbScope === 'all') localStorage.removeItem(_MB_SCOPE_KEY);
    else localStorage.setItem(_MB_SCOPE_KEY, _mbScope);
  } catch (e) {}
}
// 人删了之后筛选停在一个不存在的册上＝一屏空白，看着像信箱坏了：脏值当场回落「全部」
function _mbScopeNow() {
  if (_mbScope === 'all') return 'all';
  return (data.contacts || []).some(c => c && c.id === _mbScope) ? _mbScope : 'all';
}
function _mbSingles() { return (data.contacts || []).filter(c => c && c.kind !== 'group'); }   // 群聊不写信：与心愿／世界感知同口径
function _mbOwner(cid) { return (data.contacts || []).find(x => x && x.id === cid) || null; }
function _mbOwnerName(cid) { const c = _mbOwner(cid); return c ? (fixedNameOf(c) || 'TA') : '已不在通讯录'; }
// which='sent'|'proactive'|'reply'；返回 [{m, idx, sent}]，idx 恒为**原数组下标**（点击/收藏/搜索直达都按它定位，筛过也不能错位）
// 2026-10-14 三分类（BUGS #402）：来信按 kind 拆两册——proactive＝TA 主动写来的（旧档没有 kind 的也算这册，
// 与写信统计页「TA 主动写的」、信箱设置「每天最多 N 封」同一把尺）；reply＝回你的信。sent 不变。
// ⚠ 必须先 map 保留原下标再 filter：直接 filter+map 会让 idx 变成筛后下标，点击/删除/收藏全体错位。
function _mbLetters(which) {
  const scope = _mbScopeNow();
  const inBook = m => scope === 'all' || m.cid === scope;
  const all = which === 'sent'
    ? (data.sentLetters || []).map((m, idx) => ({ m, idx, sent: true }))
    : (data.receivedLetters || []).map((m, idx) => ({ m, idx, sent: false }));
  const keep = which === 'reply' ? r => r.m && r.m.kind === 'reply'
    : which === 'proactive' ? r => r.m && (r.m.kind || 'proactive') !== 'reply'
    : () => true;
  return all.filter(r => r.m && keep(r) && inBook(r.m));
}
/* 第几封＝它在**这一本册子里排第几**，按邮戳先后正着数（最早那封＝第 1 封；BUGS #240＝#225 的二批：
   信箱里序数是真的，而未拆／盖过几枚那些读数都是【计数】，给它们挂序数记号就是假话）。三条口径：
   ① 按【册】数，不跟着筛选态变——筛中单人时那一行不该换个数字；
   ② 数的是** chronological 位次**，不是「它在今晚这一屏排第几」——收纳名单是新的在上（列表那一面按它排），
      所以取到位置后用「总封数 − 位置」倒过来算。#244 那次把它接到 _mbOrdered 上时漏了这一步，
      结果最新那封自称「第 1 封」而它前面明明还有两封（由 #240 的门 F2 抓到，见该门）。
   ⚠ 必须走 _mbOrdered 这把尺子＝与列表同一份实现；旧写法拿 `postmark + ' ' + time` 当字符串比，
   可旧档邮戳有 '9/28' 这种没年份的、时刻又有 '9:58' 这种个位小时（`time()` 走 toLocaleTimeString）
   ——字符串比会把 '9:58' 判成比 '21:40' 晚＝同一件事两处两种说法（BUGS #244 修的就是这一刀）。 */
function _mbLetterNo(m, which) {
  const arr = (which === 'sent' ? data.sentLetters : data.receivedLetters) || [];
  const who = m.cid || mainChatId();
  const mine = arr.map((x, idx) => (x && (x.cid || mainChatId()) === who ? { m: x, idx } : null)).filter(Boolean);
  const at = _mbOrdered(mine).findIndex(r => r.m === m);
  return at >= 0 ? mine.length - at : 1;
}
// 写信的对象＝当前筛中的那位；「全部」这一档取当前活跃会话里那位单聊（收信人是谁写在写信页页题上，不静默决定）
function _mbWriteTarget() {
  const s = _mbScopeNow();
  if (s !== 'all') return s;
  const a = data.activeChat;
  const c = (data.contacts || []).find(x => x && x.id === a && x.kind !== 'group');
  return c ? a : (_mbSingles()[0] || {}).id || 'c0';
}

// 信纸的日期栏：与列表行 .mb-date 同构（衬线日号 + 周X + 时刻 + 月份 + 第 N 封）。
// 同一份填充两处用两种排法：写信页仍是纸左那一列，读信页横排成抬头那一行（2026-10-10 BUGS #244 追记·丁案），
// 所以月份与序号各带一个类名让 CSS 决定谁在前——这里只管内容不管排布。
function _letterRailFill(el, postmark, time, seq) {
  if (!el) return;
  const p = typeof _mbParsePostmark === 'function' ? _mbParsePostmark(postmark) : null;
  const wd = typeof _mbWeekday === 'function' ? _mbWeekday(p) : '';
  el.innerHTML = `<b>${p ? String(p.d).padStart(2, '0') : '--'}</b>`
    + `<i>${wd ? wd + ' ' : ''}${escapeHTML(time || '')}</i>`
    + (p ? '<u class="mo">' + p.m + '月</u>' : '')
    // 那一列说的是「这一封」的账，序号排在最后；写信页没有序号（第 3 个实参不给就不画）
    + (seq > 0 ? `<u class="sq">第 ${seq} 封</u>` : '');
}

// 打开写信整页
// 打开写信整页：FAB／草稿行／读信页「回一封信」三处共用这一条路径，不留第二份开页逻辑
// to＝写给谁（不传＝按当前筛中的册）
function openLetterCompose(to) {
  const mask = $('#letterModalMask');
  $('#stampDate').textContent = formatPostmarkDate();
  _letterRailFill($('#letterWriteRail'), formatPostmarkDate(), '');
  // 草稿按册：写一半的信不会串到别人那本（旧的全局一份由 ensureData 迁到主会话名下）
  _letterTo = to || _mbWriteTarget();
  // 页题写明这一封写给谁（筛选为「全部」时取当前活跃会话那位）——不静默替用户决定
  const wt = $('#letterWriteTitle');
  if (wt) wt.textContent = _mbOwner(_letterTo) ? '写给 ' + _mbOwnerName(_letterTo) : '写一封信';
  if (!data.drafts || typeof data.drafts !== 'object') data.drafts = {};
  const d = data.drafts[_letterTo];
  currentDraft = (d && d.text) || '';
  $('#letterTextarea').value = currentDraft;
  const dn = $('#letterDraftNote'); if (dn) dn.hidden = !currentDraft;
  _letterCountRefresh();
  _letterImg = '';   // 草稿不存图，每次开页从空开始
  _letterImgRefresh();
  mask.hidden = false;
  $('#letterTextarea').focus();
}
$('#newLetter').onclick = () => openLetterCompose();
// 有草稿的那几本（跟着当前筛中的册）：草稿此前只有「恰好对那位点开写信」才看得见＝等于没有
function _mbDrafts() {
  const scope = _mbScopeNow();
  return Object.keys(data.drafts || {})
    .filter(cid => (data.drafts[cid] || {}).text && (scope === 'all' || cid === scope))
    .map(cid => ({ cid, text: data.drafts[cid].text, stamp: data.drafts[cid].stamp || '' }))
    .sort((a, b) => (b.stamp || '').localeCompare(a.stamp || ''));
}
// 写信页字数计（maxlength=500 在 html 上）
function _letterCountRefresh() {
  const el = $('#letterCount');
  if (el) el.textContent = `${$('#letterTextarea').value.length} / 500`;
}

// 草稿保存（输入时节流）
let _draftTimer = null;
let _letterTo = '';
$('#letterTextarea').addEventListener('input', () => {
  currentDraft = $('#letterTextarea').value;
  const dn = $('#letterDraftNote'); if (dn) dn.hidden = true;
  _letterCountRefresh();
  clearTimeout(_draftTimer);
  _draftTimer = setTimeout(() => {
    if (!data.drafts || typeof data.drafts !== 'object') data.drafts = {};
    if (!_letterTo) _letterTo = _mbWriteTarget();
    if (currentDraft) data.drafts[_letterTo] = { text: currentDraft, stamp: formatPostmarkDate() };
    else delete data.drafts[_letterTo];
    save();
  }, 500);
});

// 写信夹图：选图压缩进信（GIF 保帧），随信落库；草稿不存图，关页即弃
let _letterImg = '';
function _letterImgRefresh() {
  const row = $('#letterImgRow'), thumb = $('#letterImgThumb');
  if (!row || !thumb) return;
  if (_letterImg) { thumb.src = _letterImg; row.hidden = false; } else { row.hidden = true; thumb.removeAttribute('src'); }
}
$('#letterImgBtn').onclick = () => { $('#letterImgPick').click(); };
$('#letterImgPick').addEventListener('change', function () {
  const f = this.files && this.files[0];
  this.value = '';
  if (!f || typeof fileData !== 'function') return;
  fileData(f).then(url => { if (url) { _letterImg = url; _letterImgRefresh(); } });
});
$('#letterImgDel').onclick = () => { _letterImg = ''; _letterImgRefresh(); };

// 关闭整页：不清除草稿，留在原地
function closeLetterModal() {
  $('#letterModalMask').hidden = true;
}
$('#letterClose').onclick = closeLetterModal;
$('#letterCancelBtn').onclick = closeLetterModal;

// 寄出后居中盖一枚「已寄出」邮戳，落定即散（一次性仪式，纯展示）
function _postmarkFx() {
  const fx = $('#postmarkFx');
  if (!fx) return;
  $('#postmarkFxDate').textContent = formatPostmarkDate();
  fx.classList.remove('on');
  void fx.offsetWidth;
  fx.classList.add('on');
  setTimeout(() => fx.classList.remove('on'), 1400);
}

// 寄出信件
$('#letterSendBtn').onclick = () => {
  if (_isSending) return;
  _isSending = true;
  const to = _letterTo || _mbWriteTarget();
  // 立即清空并保存这一册的草稿，阻止后续节流写入（空文本时原样还回去）
  currentDraft = '';
  if (!data.drafts || typeof data.drafts !== 'object') data.drafts = {};
  const savedDraft = data.drafts[to];
  delete data.drafts[to];
  save();
  clearTimeout(_draftTimer);

  const text = $('#letterTextarea').value.trim();
  if (!text) {
    _isSending = false;
    if (savedDraft) data.drafts[to] = savedDraft;
    save();
    return;
  }
  // 寄出＝这封信当场交到对方手里：没有「在路上」那一段，所以也当场排这一次的回信（旧写法排在到站那一刻）
  if (!data.sentLetters) data.sentLetters = [];
  const entry = {
    text,
    time: time(),
    postmark: formatPostmarkDate(),
    charCount: text.length,
    cid: to
  };
  if (_letterImg) entry.img = _letterImg;   // 夹图随信走（TA 收到的信里同款内嵌显示）
  _letterImg = '';
  _letterImgRefresh();
  data.sentLetters.push(entry);
  if (typeof maybeCollectByTa === 'function') { const _cs = data.collectSettings || {}; maybeCollectByTa({ kind: 'mail', mailType: 'sent', title: '', text }, _cs.taMailProb, to); }
  save();
  closeLetterModal();
  renderMailbox();
  _postmarkFx();
  schedulePartnerReply(to);
  showToast('已寄出');
  _isSending = false;
};

// 两册来信（TA 的来信｜TA 的回信）共用同一条拆信链：行骨架·data-type="received"·撕开动画·已读翻转一式两份，
// 册子只管「哪些信进来」，拆信的行为两册不许有第二份实现（2026-10-14 BUGS #402 三分类）。
function _bindRecvList(sel) {
  $(sel).onclick = e => {
    const row = e.target.closest('.mailbox-row');
    if (row && row.dataset.type === 'received') {
      if (row.dataset.animated === 'true') return;
      const idx = Number(row.dataset.idx);
      const m = data.receivedLetters[idx];
      if (!m) return;
      // 已读的信随时可重看：只展开信纸，不再撕开、不再把正文重复送进聊天
      if (m.read) { openLetterView(m); return; }
      // 点击来信：撕开动画 + 弹出信封查看全文 + 标记已读（内容同步进入聊天，保留原有行为）
      row.dataset.animated = 'true';
      row.classList.add('tearing');
      setTimeout(() => {
        _openReceivedLetter(m);
        row.dataset.animated = 'false';
      }, 450);
    }
  };
}
_bindRecvList('#proactiveList');
_bindRecvList('#replyList');

// 打开一封未读来信：标记已读＋展开信纸（列表点击、册页下钻、聊天里那一行提示三处共用）。
// 2026-10-08 #165：正文与夹图不再当 TA 的气泡写进聊天——信的内容只住在信纸那一面，
// 会话里只留信到手那一刻的一行系统提示（写手在 _mbLand）。
function _openReceivedLetter(m) {
  if (!m.read) {
    m.read = true;
    save();
    renderMailbox();   // 三册一起重画（memo 键各管各的，没变的册不重画）；旧写法只画一册，拆一封回信时另一册的未读数停在旧值
  }
  openLetterView(m);
}

// 聊天里那一行的落点：按 lid 找到那一封，未读走拆信链、已读直接重看（与册页下钻同一支路径）。
// 找不到（信被删过）要给一句实话而不是什么都不发生＝本仓反复打回的「看着能点实则无反应」那一族。
function openLetterByLid(lid) {
  const m = (data.receivedLetters || []).find(x => x && x.lid === lid);
  if (!m) { showToast('这封信已经不在信箱里了'); return; }
  if (m.read) openLetterView(m); else _openReceivedLetter(m);
}

// 打开一封寄出的信（列表点击 / 回信跳转共用）；寄出的信也带夹的图
function _openSentLetter(m) {
  _curViewLetter = m;
  $('#letterViewTitle').textContent = '寄出的信';
  $('#letterReplyBtn').hidden = true;   // 自己寄出的信没有「回」的对象
  _letterRailFill($('#letterViewRail'), m.postmark, m.time, _mbLetterNo(m, 'sent'));
  _showLetterReason(m);   // 寄出的信无由头（块自隐），夹的图在这里管理显示
  $('#letterViewText').textContent = m.text;
  // 落款按**这封信寄给的那一本**取我叫什么（2026-10-08 按会话分开）；旧信没有 cid 才兜主会话那份
  $('#letterViewSignature').textContent = chatMyName(m.cid || mainChatId());
  $('#letterViewMask').hidden = false;
}

// 打开一封来信的信纸（首次撕开与日后重看共用同一条路径）
function openLetterView(m) {
  _curViewLetter = m;
  $('#letterViewTitle').textContent = '来信';
  $('#letterReplyBtn').hidden = false;
  _letterRailFill($('#letterViewRail'), m.postmark, m.time, _mbLetterNo(m, 'recv'));
  _showLetterReason(m);
  $('#letterViewText').textContent = m.text;
  // 落款＝写信的那一位，不是「此刻开着的会话」那位（partnerName() 读的是全局 profile，多联系人下会署错名）
  $('#letterViewSignature').textContent = _mbOwnerName(m.cid || mainChatId());
  $('#letterViewMask').hidden = false;
}

let _curViewLetter = null;
// 「回一封信」＝带着这位的册去写信（页题仍写「写给 X」；不预填引用——信不是消息，引用没地方落）
const _lvReply = $('#letterReplyBtn');
if (_lvReply) _lvReply.onclick = () => {
  const m = _curViewLetter;
  $('#letterViewMask').hidden = true;
  if (m) openLetterCompose(m.cid || _mbWriteTarget());
};

$('#sentList').onclick = e => {
  const row = e.target.closest('.mailbox-row');
  if (row && row.dataset.type === 'sent') {
    const idx = Number(row.dataset.idx);
    const m = data.sentLetters[idx];
    if (m) _openSentLetter(m);
  }
};
// 信纸顶部「由头」块：主动信显示 TA心里话-写信理由；rsys=系统随机送信的灰字自白；
// kind='reply' 且记了 replyTo → 显示「回你 X.XX 的那封信」（可点击跳到那封寄出的信）；无理由（旧数据）整块隐藏。
// 顺带管理信里夹的图（m.img）：打开来信/寄出的信都要先清掉上一封的图
function _showLetterReason(m) {
  const rv = $('#letterViewReason');
  if (rv) {
    if (m && (m.reason || m.rsys || (m.kind === 'reply' && m.replyTo))) {
      rv.hidden = false;
      rv.classList.toggle('sys', !m.reason && !!m.rsys);
      rv.innerHTML = m.reason
        ? '<span>由头</span>' + escapeHTML(m.reason)
        : (m.kind === 'reply' && m.replyTo)
          ? '<span>回信</span><span class="letter-reply-link" data-jump-reply>回你 ' + escapeHTML(m.replyTo) + ' 的那封信</span>'
          : escapeHTML('（这封信是系统随机送来的，TA大概也没控制住）');
    } else rv.hidden = true;
  }
  const iv = $('#letterViewImg');
  if (iv) {
    iv.onerror = null;
    iv.onload = null;
    if (m && m.img) {
      // 解码失败或尺寸过小（坏图/1×1 空白图）→ 直接隐藏，不留空白框
      iv.onload = () => { if (iv.naturalWidth < 48 || iv.naturalHeight < 48) { iv.hidden = true; iv.removeAttribute('src'); } };
      iv.onerror = () => { iv.hidden = true; iv.removeAttribute('src'); };
      iv.src = m.img;
      iv.hidden = false;
    } else { iv.hidden = true; iv.removeAttribute('src'); }
  }
}
$('#letterViewClose').onclick = () => { $('#letterViewMask').hidden = true; };

// 「回你 X.XX 的那封信」→ 在同一整页里切到那封寄出的信
$('#letterViewReason').addEventListener('click', e => {
  if (!e.target.closest('[data-jump-reply]')) return;
  const pm = _curViewLetter && _curViewLetter.replyTo;
  // 邮戳只写到日，同一天寄给两位的信 postmark 相同：先在**回信那位自己的册**里找，找不到再全局兜底（旧档没记 cid）
  const who = _curViewLetter && _curViewLetter.cid;
  const pool = pm ? [...(data.sentLetters || [])].reverse() : [];
  const sent = pm ? (pool.find(x => x && x.postmark === pm && x.cid === who) || pool.find(x => x && x.postmark === pm)) : null;
  if (!sent) { showToast('找不到那封信'); return; }
  _openSentLetter(sent);
});

// 删除这封信（两段确认：第一下变「确认删除」，2.5s 内再点才真删；不弹 confirm 打断手机端）
let _delArm = null;
$('#letterDelBtn').onclick = () => {
  const btn = $('#letterDelBtn'), m = _curViewLetter;
  if (!btn || !m) return;
  if (!_delArm) {
    btn.textContent = '确认删除';
    _delArm = setTimeout(() => { _delArm = null; btn.textContent = '删除'; }, 2500);
    return;
  }
  clearTimeout(_delArm);
  _delArm = null;
  btn.textContent = '删除';
  const arr = (data.receivedLetters || []).includes(m) ? data.receivedLetters : (data.sentLetters || []).includes(m) ? data.sentLetters : null;
  if (!arr) return;
  arr.splice(arr.indexOf(m), 1);
  _curViewLetter = null;
  $('#letterViewMask').hidden = true;
  renderMailbox();   // 三册＋分册 chips 一起重画（旧写法两册分别调，加第三册时就是漏画的那一册）
  updateHomeIndex();
  save();
  showToast('已删除这封信');
};

/* ===== 信箱设置（按联系人各一份）=====
   data.mailbox 是那份**全局默认**（所有没被单独改过的 TA 共用），data.mailboxSettings[cid] 只存被改过的那一位。
   读写一律走下面这两个函数：别处直接抓 data.mailbox 会让"给小七单独调过的回信概率"在别人身上也生效。 */
function _mbCfg(cid) {
  const base = data.mailbox || defaults.mailbox;
  const own = (data.mailboxSettings || {})[cid];
  return own && typeof own === 'object' && !Array.isArray(own) ? Object.assign({}, base, own) : base;
}
// 第一次改某一位＝先把"此刻生效的那一份"整本拷成他的副本再改。只写变化的那一格＝其余字段会跟着全局那份的新值漂走，
// 用户改完他的概率却发现他的字卡条数也变了
function _mbCfgSet(cid, patch) {
  if (!data.mailboxSettings || typeof data.mailboxSettings !== 'object' || Array.isArray(data.mailboxSettings)) data.mailboxSettings = {};
  const id = cid || mainChatId();
  if (!data.mailboxSettings[id] || typeof data.mailboxSettings[id] !== 'object') data.mailboxSettings[id] = Object.assign({}, _mbCfg(id));
  Object.assign(data.mailboxSettings[id], patch);
  return data.mailboxSettings[id];
}
// 一封信里各张字卡之间的连接符：总闸看信箱自己那份（punctEnabled），符号池借用这位 TA 聊天那套 pyPunct*
// （含「换行」——要先在 TA 的设置 → 拼接符号 里点亮它，这里才有换行可抽）。聊天那两个开关不参与判定＝两页互不影响。
// 开关关掉时池子退成 [' ']＝老样子只用空格相连
function _mbJoin(parts, cid) {
  const cs = (data.chatSettings && data.chatSettings[cid]) || data.behavior || {};
  return pyJoinCards(parts, Object.assign({}, cs, { pyEnabled: true, pyPunctEnabled: !!_mbCfg(cid).punctEnabled }));
}

// ===== 对方主动写信（用字卡写信） =====
let _writeInterval = null;

// 汇总可用的字卡：主字卡为基底，按设置叠加 颜文字/emoji/表情包。cid＝写这封信的那一位，缺省主会话
function composeLetterText(cid) {
  const who = cid || mainChatId();
  const m = _mbCfg(who);
  const cats = ['主字卡'];
  if (m.useKaomoji) cats.push('颜文字');
  if (m.useEmoji) cats.push('emoji');
  if (m.useSticker) cats.push('表情包');
  // 只取文本字卡；图片/表情对象字卡不参与组信（与 chat.js 主字卡口径一致，避免生成 "[object Object]" 乱码信）
  // 取的是**那位自己**那一份字卡（公用＋绑给他的专属），写死主会话会让回信用别人的话术
  const pool = (data.groups || []).filter(g => cats.includes(g.category) && groupUsableFor(g, who)).flatMap(g => (g.cards || []).filter(c => !cardIsOff(g, c))).filter(c => typeof c === 'string' && !voiceCardParts(c));
  if (!pool.length) return '';
  // 这两个数按**张数**计（照 mochi 的 ml-min-cards / ml-max-cards）：想拼几张卡就是几张，
  // 池子里只有那么多张时夹到那么多。旧写法把 min/max 当「累计字符数」用，标签却写着条数——
  // 设 2~9 时第一张（约 8 字）就满足下限、第二张又顶破上限，于是永远只出一张卡。
  const maxN = pool.length;
  const wantMin = Math.min(Math.max(1, Number(m.minCardCount) || 1), maxN);
  const wantMax = Math.min(Math.max(wantMin, Number(m.maxCardCount) || wantMin), maxN);
  const n = wantMin + Math.floor(Math.random() * (wantMax - wantMin + 1));
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(pool[Math.floor(Math.random() * maxN)]);
  return _mbJoin(parts, who);
}

// 回信先回应你的信：从 TA心里话「信的回应」抽一句拼在正文前（组被删则跳过，回信退回纯字卡正文）
function _replyRespondLine(cid) {
  const g = (data.groups || []).find(x => (x.name || '') === '信的回应' && (x.category || 'TA心里话') === 'TA心里话' && groupUsableFor(x, cid || mainChatId()));
  const cards = ((g && g.cards) || []).filter(c => typeof c === 'string' && c.trim() && !voiceCardParts(c) && !cardIsOff(g, c));
  if (!cards.length) return '';
  return cards[Math.floor(Math.random() * cards.length)];
}

// 距离下次写信的随机时间（分钟）——区间取的是**这一位自己**那一份（_mbCfg），不是全局那份
function nextWriteTimestamp(cid) {
  const m = _mbCfg(cid || mainChatId());
  const minW = Math.max(1, Number(m.minWriteMinutes) || 1);
  const maxW = Math.max(minW, Number(m.maxWriteMinutes) || minW);
  return Date.now() + (minW + Math.random() * (maxW - minW)) * 60000;
}

// 每日上限口径：只统计「主动写的信」（kind!=='reply'，旧数据无 kind 一律视为主动信——回信功能 0.133 前不存在）。
// FIX 2026-09-03 #042 原先回信既不受上限约束、又计入当日计数挤占下一次主动写信，两条路径语义互相矛盾
// 按册各计各的：dailyMaxLetters 既然已经是一位一份的值，计数跟着按位走，否则「这位每天最多 1 封」会被别人的信占额度
function todayCountLetters(cid) {
  const key = formatPostmarkDate();
  return (data.receivedLetters || []).filter(x => x.postmark === key && x.kind !== 'reply' && (x.cid || mainChatId()) === cid).length;
}

// 桌面前台弹窗：来信/回信到达时顶部横幅（点击进信箱）；在信箱页内列表直接可见，退回轻提示
function _deskPopShow(preview, fallbackToast, cid) {
  if (typeof showDeskPopup !== 'function' || document.body.dataset.view === 'mailbox') { showToast(fallbackToast); return; }
  // 头像只认写信那位自己的：c0 之外的联系人没传头像就是没传，不拿全局 profile.avatar 顶替
//（那是主联系人 c0 的镜像，兜上来等于让每位没传头像的人都顶着 c0 的脸，BUGS #128）
  const c = _mbOwner(cid || mainChatId());
  showDeskPopup({
    uid: 'mailbox',
    name: c ? (c.name || 'TA') : partnerName(),
    avatar: (c && c.avatar) || '',
    text: preview,
    onClick: () => showView('mailbox')
  });
}

// 主动写信的排期**按册各一条时钟**（2026-10-06 段二）：旧写法全局一枚 `_nextWriteAt` ＋ 收件人写死 mainChatId()
// ＝只有第一位会写信，与「信箱按联系人分册」对不上。每日上限也按册各计（与 dailyMaxLetters 一份一位同口径），
// 代价是来信总量随人数走——那是「每人各设各的勤懒」这句话的必然含义，不是漏洞。
function _mbNextWriteAt(cid) {
  const m = _mbCfg(cid);
  const daily = Math.max(0, Number(m.dailyMaxLetters) || 0);
  if (daily > 0 && todayCountLetters(cid) >= daily) {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(8 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 60), 0, 0);
    return next.getTime();
  }
  return nextWriteTimestamp(cid);
}
/* 一封 TA 寄来的信到手那一刻的四件事：未读角标·会话里那一行指针·桌面前台横幅·系统通知。
   它们本来就挂在同一个时点（旧写法＝到站那一刻，2026-10-06 段二/#097/#110 那条口径），
   2026-10-12 信箱去「在路上」之后这个时点＝信生成的当场，于是这一段从到站结算里搬过来、由两处生成点各调一次。
   正文不进聊天（#165）：这一行带 lid，点它就是拆这一封。 */
function _mbLand(m) {
  const who = m.cid || mainChatId();
  updateHomeIndex();
  if (typeof m.lid !== 'string') m.lid = mbLetterId();   // 合并导入进来的旧信可能还没有 id，补在写那一行之前，免得屏上写着「点开看」却点不动
  _deliverToChat({ id: nextId(), from: 'system', text: _mbNoticeText(m, who), letter: m.lid }, who);
  // 信到手＝一件事，喂给头像昵称那个事件驱动的热度（BUGS #179）。
  // 上面那行是 from:'system'，走不到 _deliverToChat 里 partner 那条写手，这里单独喂一次，
  // 归属就是这一封信的收信人 who（不落进此刻开着的会话）。
  if (typeof avlibFeed === 'function' && typeof AV_HEAT_LETTER !== 'undefined') avlibFeed(who, AV_HEAT_LETTER, 'letter');
  _deskPopShow(m.kind === 'reply' ? `回了一封手写信：${m.text}` : `给你寄来了一封信：${m.text}`,
    `${_mbOwnerName(who)}${m.kind === 'reply' ? '回了一封手写信' : '寄来了一封信'}`, who);
  // 系统通知（切后台那一族，BUGS #164）：与上面横幅·未读角标同一时点；
  // 人在前台时引擎自己记「已看」就 return，两处不会各响一遍。cid 带上＝点通知直达信箱
  if (typeof bgNotifyCheck === 'function') {
    const c = _mbOwner(who);
    bgNotifyCheck(m.kind === 'reply' ? `回了一封手写信：${m.text}` : `给你寄来了一封信：${m.text}`, Date.now(), {
      name: _mbOwnerName(who),
      av: (c && c.avatar) || '',
      avFixed: true,    // 不兜全局 profile.avatar（那是主联系人镜像，会串人，#128 同族）
      cid: who,
      kind: 'mail'
    });
  }
}

// 那一行的文案：只说「有一封信到手」，不替信把内容念一遍（旧写法是整封正文送进会话）
function _mbNoticeText(m, who) {
  return `${_mbOwnerName(who)} ${m.kind === 'reply' ? '回了你一封信' : '给你寄来了一封信'} · 点开看`;
}

function maybeDeliverLetter() {
  if (!isSchedulerLeader()) return;
  if (!data._nextWriteAtBy || typeof data._nextWriteAtBy !== 'object' || Array.isArray(data._nextWriteAtBy)) {
    // 旧全局那枚槽摊给每一册当起点（不摊＝升级那一刻所有册同时到点，会涌出一批信）
    const seed = typeof data._nextWriteAt === 'number' && data._nextWriteAt > Date.now() ? data._nextWriteAt : nextWriteTimestamp();
    data._nextWriteAtBy = {};
    _mbSingles().forEach(c => { data._nextWriteAtBy[c.id] = seed; });
    save();
    return;
  }
  const now = Date.now();
  let dirty = false;
  for (const c of _mbSingles()) {
    const t = data._nextWriteAtBy[c.id];
    if (typeof t !== 'number') { data._nextWriteAtBy[c.id] = _mbNextWriteAt(c.id); dirty = true; continue; }
    if (now < t) continue;
    // 后台冻结/离开期间错过的信不补发：超过宽限期视为过期，重新排期
    if (now - t > _SCHED_GRACE_MS) { data._nextWriteAtBy[c.id] = _mbNextWriteAt(c.id); dirty = true; continue; }
    dirty = true;
    data._nextWriteAtBy[c.id] = _mbNextWriteAt(c.id);
    const m = _mbCfg(c.id);
    // 总开关关掉＝这一位不再自己寄信；照旧走完重排（不钉死一个「多久以后再看」），且**不影响**你寄出后 TA 的回信
    if (!m.writeEnabled) continue;
    const daily = Math.max(0, Number(m.dailyMaxLetters) || 0);
    const prob = Math.max(0, Number(m.writeProbability) || 0);
    if (daily <= todayCountLetters(c.id) || Math.random() * 100 >= prob) continue;
    const who = c.id;
    const text = composeLetterText(who);
    if (!text) continue;
    // 主动信挂「TA心里话-写信理由」；rsys=系统随机送信（TA 没控制住）。回信（kind='reply'）是对我来信的应答，不挂理由
    const r = typeof taReasonPick === 'function' ? taReasonPick('letter', true) : { text: '', sys: false };
    // ⑧ 信里夹图：20% 概率附一张图片字卡（信纸内嵌显示，读信同步进聊天）
    // 过滤极小/短 dataURL（如 1×1 测试图）：放大后是隐形方块，信里只出现空白框
    let img = '';
    if (Math.random() < 0.2 && typeof partnerImages === 'function') {
      const pis = partnerImages(who).filter(u => typeof u === 'string' && u.startsWith('data:image') && u.length > 600);
      if (pis.length) img = pis[Math.floor(Math.random() * pis.length)];
    }
    if (!data.receivedLetters) data.receivedLetters = [];
    const letter = {
      lid: mbLetterId(),
      text,
      time: time(),
      postmark: formatPostmarkDate(),
      charCount: text.length,
      read: false,
      cid: who,
      kind: 'proactive',
      reason: r.text,
      rsys: r.sys || undefined,
      img
    };
    data.receivedLetters.push(letter);
    _mbLand(letter);
    renderMailbox();
  }
  if (dirty) save();
}

// 寄信后按「回信概率」排期：命中则安排一次回信，时间在 min/max 回信分钟内（两份读数都取**收件那一位**自己的）
function schedulePartnerReply(cid) {
  const who = cid || mainChatId();
  const m = _mbCfg(who);
  const prob = Math.max(0, Number(m.replyProbability) || 0);
  // 回信概率为 0 或未命中：不回信
  if (Math.random() * 100 >= prob) return;
  const minR = Math.max(1, Number(m.minReplyMinutes) || 1);
  const maxR = Math.max(minR, Number(m.maxReplyMinutes) || minR);
  data._scheduledReplyAt = Date.now() + (minR + Math.random() * (maxR - minR)) * 60000;
  data._scheduledReplyCid = who;
  save();
}

// 到点投递回信（期间离开/后台再回来也照常补发，不回信则随下一次寄信重新按概率排期）。
// 口径（#042）：回信是对来信的应答，不受「每天最多写信 N 封」约束，也不计入主动信的当日计数（kind='reply'）
function maybeDeliverReply() {
  if (!isSchedulerLeader()) return;
  if (typeof data._scheduledReplyAt !== 'number' || !data._scheduledReplyAt) return;
  if (Date.now() < data._scheduledReplyAt) return;
  // FIX 2026-09-03 #026 排期已过期超过宽限期（息屏冻结/导入旧备份）：作废重排，避免回前台瞬间立即弹回信
  if (Date.now() - data._scheduledReplyAt > _SCHED_GRACE_MS) { data._scheduledReplyAt = 0; save(); return; }
  data._scheduledReplyAt = 0;
  const who = data._scheduledReplyCid || mainChatId();
  const text = composeLetterText(who);
  if (text) {
    if (!data.receivedLetters) data.receivedLetters = [];
    // 回信先回应你的信：50% 先拼一句「信的回应」再接正文（回信是对来信的应答，读起来是在读你的信）
    const respond = Math.random() < 0.5 ? _replyRespondLine(who) : '';
    const full = respond ? respond + '\n' + text : text;
    // 记下回的是哪封（**这位自己那本里**最新一封寄出的信的邮戳日期），读信页「回信」由头可点击跳回去
    const _sentArr = (data.sentLetters || []).filter(x => x && (x.cid || mainChatId()) === who);
    const _lastSent = _sentArr[_sentArr.length - 1];
    const m = {
      lid: mbLetterId(),
      text: full,
      time: time(),
      postmark: formatPostmarkDate(),
      charCount: full.length,
      read: false,
      cid: who,
      kind: 'reply',
      replyTo: _lastSent && _lastSent.postmark ? _lastSent.postmark : undefined
    };
    data.receivedLetters.push(m);
    _mbLand(m);
    renderMailbox();
  }
  save();
}

// 主动写信 + 回信统一在同一个 30s 调度里轮询
function _mailboxTick() {
  maybeDeliverLetter();
  maybeDeliverReply();
  maybeTriggerIncomingCall();
  if (typeof avlibTick === 'function') avlibTick();   // 头像和昵称互动：定时随机换形象（avatarlib.js）
  if (typeof annWishTick === 'function') annWishTick();   // 纪念日/周年当天 TA 主动祝福（anniversary.js）
  if (typeof annSelfTick === 'function') annSelfTick();   // TA 自己想起一个日子：每位一条随机钟（anniversary.js，BUGS #271）
  if (typeof cjianTick === 'function') cjianTick();   // 世界感知：TA 的时间/感知/状态签名（cjian.js）
  if (typeof wishTick === 'function') wishTick();   // 心愿：TA 说出心愿＋实现后的回响（wish.js）
  if (typeof invTick === 'function') invTick();   // 邀请：你发出去的那条，TA 到点答一句（invite.js，与心愿各走各的钟）
  if (typeof nightTick === 'function') nightTick();   // 夜间免打扰：夜里那一档的置开／解除与每晚那一问（night.js，BUGS #306）
}

// 群「偶尔自己聊天」整族已退役（2026-10-09 BUGS #216，旧写法＝本文件这里的 _gaWaitMs／maybeGroupChatter）：
// 那条按群的钟与「主动发送按会话各一格」是两条并行的钟，同一个人因此拿着好几份嘴（一位联系人在单聊占一格、
// 在三个群还占三格，再加每群这一条到点必发的），屏上大半主动消息就成了群里轮流冒话。
// 现在群里只有一种来路：某位【自己】那条主动发送钟到点、那一发落到了群（js/chat.js 的 _asTargetOf）。
// 别再往这里加按群的钟——那是同一条根的第二个化身。

function startPartnerWriteScheduler() {
  if (_writeInterval) return;
  _mailboxTick();
  _writeInterval = setInterval(_mailboxTick, 30 * 1000);
}
function pauseWriteScheduler() {
  if (_writeInterval) { clearInterval(_writeInterval); _writeInterval = null; }
}
function resumeWriteScheduler() {
  _mailboxTick();
  if (!_writeInterval) _writeInterval = setInterval(_mailboxTick, 30 * 1000);
}

// 长按/右键收藏信件（来信与寄出）
function _mailboxBindFav(listSel, type) {
  const list = document.querySelector(listSel); if (!list) return;
  list.addEventListener('contextmenu', e => {
    const row = e.target.closest('.mailbox-row'); if (!row) return;
    e.preventDefault();
    const m = (type === 'received' ? data.receivedLetters : data.sentLetters)[Number(row.dataset.idx)];
    if (m && typeof collectMail === 'function') collectMail(type, m.postmark || '', m.text || '');
  });
  let t = null;
  list.addEventListener('touchstart', e => {
    const row = e.target.closest('.mailbox-row'); if (!row) return;
    t = setTimeout(() => {
      const m = (type === 'received' ? data.receivedLetters : data.sentLetters)[Number(row.dataset.idx)];
      if (m && typeof collectMail === 'function') collectMail(type, m.postmark || '', m.text || '');
    }, 480);
  }, { passive: true });
  ['touchend','touchmove','touchcancel'].forEach(ev => list.addEventListener(ev, () => clearTimeout(t), { passive: true }));
}
_mailboxBindFav('#proactiveList', 'received');
_mailboxBindFav('#replyList', 'received');
_mailboxBindFav('#sentList', 'sent');

// 分册 chips：点一下只换筛选、不切视图。列表渲染 memo 键带着当前册（render.js），所以换册必然重画
const _mbOwnersEl = $('#mbOwners');
if (_mbOwnersEl) _mbOwnersEl.onclick = e => {
  const chip = e.target.closest('[data-mbcid]');
  if (!chip) return;
  _mbScopeSet(chip.dataset.mbcid);
  renderMailbox();
};

// 草稿行：点开就是接着写（写信页本就按册回填草稿，这里只负责把册切对）
  const dl = $('#sentList');
  if (dl) dl.addEventListener('click', e => {
    const row = e.target.closest('[data-draft-cid]');
    if (row) openLetterCompose(row.dataset.draftCid);
  });
/* ===== 信箱设置面板（2026-10-06 从「设置 → TA 的世界 → 信箱」那张折叠卡搬进来）=====
   一位一份（data.mailboxSettings[cid]，没改过的那位沿用 data.mailbox 那份默认）；面板顶部选编辑对象，卡内任一改动即存。
   不用 settings.js 的 _autoSaveCard：那个助手只防抖 400ms、存的是"回调跑的那一刻"的状态，
   改完数字立刻点另一位＝把上一位的改动挂到新人头上（串档）。这里改成「排队时定死是哪一位 ＋ 切人/关板先落地」。 */
let _mbSetTarget = '';
let _mbSetPending = null;   // {who, timer}＝排队那一刻就把「这一发存给哪一位」封死，切人也不会串到新人身上
function _mbSetTargetNow() {
  const want = _mbSetTarget || _mbWriteTarget();
  const c = _mbOwner(want);
  if (c && c.kind !== 'group') return want;
  const s = _mbWriteTarget();
  const c2 = _mbOwner(s);
  return (c2 && c2.kind !== 'group') ? s : ((_mbSingles()[0] || {}).id || '');
}
const _MB_SET_FIELDS = [
  ['#mbSetMinCard', 'minCardCount', 1, 999, 20],
  ['#mbSetMaxCard', 'maxCardCount', 1, 999, 50],
  ['#mbSetDaily', 'dailyMaxLetters', 0, 99, 1],
  ['#mbSetWriteProb', 'writeProbability', 0, 100, 60],
  ['#mbSetWriteMin', 'minWriteMinutes', 1, 1440, 1],
  ['#mbSetWriteMax', 'maxWriteMinutes', 1, 1440, 60],
  ['#mbSetReplyProb', 'replyProbability', 0, 100, 80],
  ['#mbSetReplyMin', 'minReplyMinutes', 1, 1440, 1],
  ['#mbSetReplyMax', 'maxReplyMinutes', 1, 1440, 480]
];
function renderMbSettings() {
  const mask = $('#mbSetMask');
  if (!mask || mask.hidden) return;
  const who = _mbSetTargetNow();
  _mbSetTarget = who;
  const singles = _mbSingles();
  const bar = $('#mbSetWho');
  if (bar) bar.innerHTML = singles.map(c => `<button type="button" class="fchip${c.id === who ? ' on' : ''}" data-mb-set-who="${c.id}">${escapeHTML(c.name || 'TA')}</button>`).join('');
  // 三行说明各说一件会影响读数的实事，不重复控件本身
  const note = $('#mbSetScope');
  if (note) {
    if (!singles.length) note.textContent = '通讯录里还没有单聊联系人——信箱只给单聊的人写信，群聊没有这一册。';
    else if (!(data.mailboxSettings || {})[who]) note.textContent = `${_mbOwnerName(who)} 还没单独设过，现在这份是默认值；改一下就成了他自己的一份。`;
    else note.textContent = `${_mbOwnerName(who)} 已单独设过，这里改的只是他这一份，不影响别人。`;
  }
  const cfg = _mbCfg(who);
  // FIX 2026-10-14 #420 正在编辑的那一格不回写：改动一落（400ms 防抖）本函数就整片回写，会把刚敲进去的
  // 一半数字夹回上限、光标也被推到末尾——清空后过 400ms 又被写回下限，屏上于是永远停在那个上限（两处条数
  // 上限都是 999）。别处的数字格（设置页 _autoSaveCard）保存时本来就不回写，这里对齐它；失焦后照旧补回屏上。
  const _focused = document.activeElement;
  _MB_SET_FIELDS.forEach(f => { const el = $(f[0]); if (el && el !== _focused) el.value = cfg[f[1]]; });
  const chk = (sel, v) => { const el = $(sel); if (el) el.checked = !!v; };
  chk('#mbSetPunct', cfg.punctEnabled);
  chk('#mbSetWriteEn', cfg.writeEnabled);
  chk('#mbSetKao', cfg.useKaomoji);
  chk('#mbSetEmoji', cfg.useEmoji);
  chk('#mbSetSticker', cfg.useSticker);
}
function saveMbSettingsNow(who) {
  who = who || _mbSetTargetNow();
  if (!who) return;
  const patch = {};
  _MB_SET_FIELDS.forEach(f => {
    const el = $(f[0]);
    const v = el ? Math.floor(Number(el.value)) : NaN;
    patch[f[1]] = Number.isFinite(v) ? Math.max(f[2], Math.min(f[3], v)) : f[4];
  });
  // 区间不自洽（最短 > 最长）在读侧本就被夹住，这里就地写回一个合法的数，免得屏上留着一个不可能的组合
  if (patch.minWriteMinutes > patch.maxWriteMinutes) patch.maxWriteMinutes = patch.minWriteMinutes;
  if (patch.minReplyMinutes > patch.maxReplyMinutes) patch.maxReplyMinutes = patch.minReplyMinutes;
  if (patch.minCardCount > patch.maxCardCount) patch.maxCardCount = patch.minCardCount;
  ['#mbSetPunct', '#mbSetWriteEn', '#mbSetKao', '#mbSetEmoji', '#mbSetSticker'].forEach((s, i) => {
    const el = $(s);
    patch[['punctEnabled', 'writeEnabled', 'useKaomoji', 'useEmoji', 'useSticker'][i]] = !!(el && el.checked);
  });
  _mbCfgSet(who, patch);
  save();
  renderMbSettings();
}
function _mbSetQueueSave() {
  const who = _mbSetTargetNow();
  if (_mbSetPending) clearTimeout(_mbSetPending.timer);
  const timer = setTimeout(() => { if (_mbSetPending && _mbSetPending.timer === timer) _mbSetPending = null; saveMbSettingsNow(who); }, 400);
  _mbSetPending = { who, timer };
}
function _mbSetFlush() {
  if (!_mbSetPending) return;
  const p = _mbSetPending;
  _mbSetPending = null;
  clearTimeout(p.timer);
  saveMbSettingsNow(p.who);
}
function openMbSettings() {
  const mask = $('#mbSetMask');
  if (!mask) return;
  _mbSetTarget = _mbSetTargetNow();
  mask.hidden = false;
  renderMbSettings();
}
function closeMbSettings() {
  _mbSetFlush();
  const mask = $('#mbSetMask');
  if (mask) mask.hidden = true;
}
(function bindMbSettings() {
  const btn = $('#mbSetBtn'); if (btn) btn.onclick = openMbSettings;
  const close = $('#mbSetClose'); if (close) close.onclick = closeMbSettings;
  const mask = $('#mbSetMask');
  // 点遮罩空白收回（与搜索半屏同一口径）；点面板内不关
  if (mask) mask.addEventListener('click', e => { if (e.target === mask) closeMbSettings(); });
  const sheet = $('#mbSetSheet');
  if (sheet) { sheet.addEventListener('input', _mbSetQueueSave); sheet.addEventListener('change', _mbSetQueueSave); }
  // FIX 2026-10-14 #420 点进数字格先全选：点一下再敲＝换掉原来那个数；不选的话新数接在旧数后面，接一次
  // 就超过上限、被夹成上限（条数上限 999），屏上看着像「怎么打都变 999」。number 型不支持
  // setSelectionRange，只有 select() 能全选（失焦回写那笔由 renderMbSettings 的聚焦豁免把关）。
  if (sheet) sheet.addEventListener('focusin', e => {
    const el = e.target;
    if (el && el.matches && el.matches('input[type=number]')) el.select();
  });
  const bar = $('#mbSetWho');
  if (bar) bar.addEventListener('click', e => {
    const b = e.target.closest('[data-mb-set-who]');
    if (!b || b.dataset.mbSetWho === _mbSetTargetNow()) return;
    _mbSetFlush();                       // 上一位的改动先落地，再换人＝不串档
    _mbSetTarget = b.dataset.mbSetWho;
    renderMbSettings();
  });
})();
