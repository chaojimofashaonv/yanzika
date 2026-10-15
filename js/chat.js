// ===== 聊天 / 拍一拍 / 表情包 / 长按操作 =====

let replyTo = null, activeMsg = null, pressTimer = null, pressedMsg = null;
let _idCounter = Date.now();
let _idSeq = 0;
// 在途回复【按会话】记名（BUGS #088）。旧版是一枚全局计数器 + 聊天页头部一枚常驻节点，于是：
// ① A 的回复在路上时切到 B（含群聊），头部那行「TA正在想怎么回你」照旧亮着——说的是 A 的事，挂在了 B 的名字下；
// ② 旧闸门 `if (_pendingReplies > 0) return` 是全站的，A 占着名额时你在 B 发消息，B 那封直接不发。
// 现在每个会话各有自己的名额，那行字只认「当前会话自己有没有在途」。
// 这是本页寿命内的状态（刷新即空，回复本来就靠 setTimeout 存活），刻意不进 data、不进备份。
const _pendingByChat = {};
function nextId() { return (_idCounter + (++_idSeq)) * 10; }
// 单聊：这一封还没落地就不排第二封。群聊按【人】判——她正在想怎么回你时不该再排她的第二封，
// 但别人该掷还是掷（传 name 才走这条，不传＝旧行为一字不差）
function _pendingBusy(chatId, name) {
  const l = _pendingByChat[chatId] || [];
  if (!name) return !!l.length;
  return l.some(e => e.senders.indexOf(name) >= 0);
}
// say=true＝这一封真的会有话落地（正常回复／继续说／问问TA 作答）；
// say=false＝「已读不回」那一封，它到点只落一条居中系统小字，报「正在想怎么回你」是假话
function _pendingAdd(chatId, say, senders) {
  (_pendingByChat[chatId] = _pendingByChat[chatId] || []).push({ say: !!say, senders: senders || [] });
  _typingTick();
}
function _pendingDone(chatId) {
  const l = _pendingByChat[chatId];
  if (l) { l.shift(); if (!l.length) delete _pendingByChat[chatId]; }
  _typingTick();
}
// 群聊里「TA」指不清：N＝这一批已定下来要开口的那几位（名单在发起时就定死，落库署的也是它）。
// 整批都是拍一拍时一个名字也定不出来——那种情况写「有人」，不硬凑一个数字冒充量过了
function _typingText(chatId) {
  if (!_chatIsGroup(chatId)) return 'TA正在想怎么回你';
  const seen = {};
  let n = 0;
  (_pendingByChat[chatId] || []).forEach(e => {
    if (!e.say) return;
    e.senders.forEach(s => { if (s && !seen[s]) { seen[s] = 1; n++; } });
  });
  return (n ? n + '位' : '有人') + '正在想怎么回你';
}
function _chatIsGroup(chatId) {
  const c = (data.contacts || []).find(x => x.id === chatId) || null;
  return !!(c && c.kind === 'group');
}
// 这行字的唯一写手：开一封／落一封／切会话都走它，一律按【当前会话】自己的在途重算
function _typingTick() {
  const el = document.getElementById('typingIndicator');
  if (!el) return;
  const busy = (_pendingByChat[data.activeChat] || []).some(e => e.say);
  el.hidden = !busy;
  if (!busy) return;
  const em = el.querySelector('em');
  const txt = _typingText(data.activeChat);
  if (em && em.textContent !== txt) em.textContent = txt;
}

function closeMsgActions() {
  const open = document.querySelector('.msg-actions:not([hidden])');
  if (open) { open.hidden = true; open.closest('.message').classList.remove('show-actions'); }
  activeMsg = null;
}
function openMsgActions(el) {
  closeMsgActions();
  const act = el.querySelector('.msg-actions');
  if (act) {
    // 长截图选段钮是动态注入的：起点设没设、设在哪条上，渲染期不知道，弹出这一刻才算（状态机在 js/chat-io.js）
    if (typeof _chatIoShotBtnFor === 'function') {
      const oldShot = act.querySelector('[data-act=chatshot]');
      if (oldShot) oldShot.remove();
      const shotM = data.messages.find(x => String(x.id) === el.dataset.id);
      const shot = shotM ? _chatIoShotBtnFor(shotM) : null;
      if (shot) {
        const shotBtn = document.createElement('button');
        shotBtn.type = 'button';
        shotBtn.dataset.act = shot.act;
        shotBtn.textContent = shot.label;
        act.insertBefore(shotBtn, act.firstChild);
      }
    }
    act.hidden = false; el.classList.add('show-actions'); activeMsg = el;
  }
}

function pressDown(e) {
  const el = e.target.closest('.message');
  if (!el || pressedMsg) return;
  // 联系人头像点击 = 打开拍一拍面板，不参与长按消息工具条（防长按头像误弹菜单）
  if (e.target.closest('.mini-avatar')) return;
  // 世界感知来源签同上：它是「跳去世界感知页」的按钮，不是消息的一部分，按住不该弹工具条
  if (e.target.closest('.as-badge-src')) return;
  pressedMsg = el;
  pressTimer = setTimeout(() => {
    if (pressedMsg === el) openMsgActions(el);
  }, 450);
}

function pressUp() {
  clearTimeout(pressTimer);
  pressedMsg = null;
}

function _rand(p) { return (Math.random() * 100) < (p === undefined ? 0 : p); }
function _categoryCards(cat, chatId) {
  const out = [];
  // 语音字卡（名称|||data:audio）不是可发言文字，排除在回复池外；专属分组只认绑定关系——
  // 绑给别人的、以及没绑给任何人的（未绑定＝停用）都不进这一路的池（口径见 utils.js groupUsableFor）
  // chatId 省略＝此刻开着的会话；主动发送那一条按【被掷的那位】传，池子才不会串味
  data.groups.forEach(g => { if ((g.category || '主字卡') === cat && groupUsableFor(g, chatId)) (g.cards || []).forEach(c => { const t = cardText(c); if (t && !voiceCardParts(t) && !cardIsOff(g, c)) out.push(t); }); });
  return out;
}
function _ri(min, max) { min = Math.ceil(min); max = Math.floor(max); return min + Math.floor(Math.random() * (max - min + 1)); }
// 逐条错开的间隔：0.8~3 秒，模拟真人连发节奏
function _msgGapMs() { return 800 + Math.floor(Math.random() * 2200); }

// 带图的句子（表情包／聊天图片）在没有图可画的地方才需要那句占位符，有图的地方不需要——
// 缩略图已经说了这件事，再写「[表情包]」＝同一件事说两遍（同 #094 引用预览、#194 收藏那条口径，BUGS #199）。
// 会话列表那一行没有缩略图，仍走 chats.js 的 _chatPreview，不在这里改。
function _msgCapText(msg) {
  const t = String(msg.text || '');
  return (t && t !== '[表情包]') ? t : '';
}
// 群里的消息在「没有署名位」的那两面（顶部横幅、系统通知）要自己把发言人补在句子前面，
// 否则屏上那句看不出是谁说的；聊天里那一行有行首署名，不吃这一发。
function _msgCapLine(msg, cap) {
  if (!msg.sender) return cap;
  return cap ? msg.sender + '：' + cap : msg.sender;
}

// 桌面前台弹窗：只有【别的会话】来消息时才顶部横幅提醒（点击切回该会话），头像/名字按该联系人取。
// 当前联系人（活跃会话）的消息不走这里，也不在 render.js 弹横幅——首页那一行的预览＋未读角标已带了同一条（BUGS #025）
function _deskPopForChat(msg, chatId) {
  if (typeof showDeskPopup !== 'function') return;
  const c = (data.contacts || []).find(x => x.id === chatId) || null;
  const cap = _msgCapText(msg);
  showDeskPopup({
    uid: 'chat:' + chatId,
    name: (c && (c.chatName || c.name)) || partnerName(),
    avatar: (c && (c.chatAvatar || c.avatar)) || '',
    text: _msgCapLine(msg, cap),
    img: msg.sticker || '',
    onClick: () => { if (typeof switchChat === 'function') switchChat(chatId); }
  });
}

// 系统通知（切后台那一族）：谁的消息就按谁的名字与头像弹，tag 带上 cid → 点通知直达那一本会话。
// 前台不弹是引擎自己的规矩（visible 时只 markSeen 就 return），那时桌面前台横幅＋未读角标已带了同一条，不在两处各响一遍。
// avFixed 必须给：不兜全局 profile.avatar（那是主联系人 c0 的镜像，会串人，BUGS #128 同族）。
function _bgNotifyForChat(msg, chatId) {
  if (typeof bgNotifyCheck !== 'function') return;
  const cap = _msgCapText(msg);
  if (!cap && !msg.sticker) return;
  const c = (data.contacts || []).find(x => x.id === chatId) || null;
  bgNotifyCheck(_msgCapLine(msg, cap), Date.now(), {
    name: (c && (c.chatName || c.name)) || partnerName(),
    av: (c && (c.chatAvatar || c.avatar)) || '',
    avFixed: true,
    img: msg.sticker || '',
    cid: chatId || '',
    kind: 'msg'
  });
}

// 回复投递：把消息落进它所属的会话流。发起回复后用户切走 → 消息照常路由回原会话
//（计未读角标、不弹提示音、只刷新会话列表），而不是串进当前打开的别的会话
function _deliverToChat(msg, originChat) {
  const ch = (data.chats && data.chats[originChat]) || null;
  const stream = (ch && Array.isArray(ch.msgs)) ? ch.msgs : data.messages;
  const isActive = stream === data.messages;
  // 未读以「用户是否正看着这个会话的聊天页」为准：活跃会话也一样，人停在桌面列表/别的页面就算未读
  const viewingThis = isActive && document.body.dataset.view === 'chat';
  msg.time = time();
  msg.date = new Date().toLocaleDateString('zh-CN');
  stream.push(msg);
  if (msg.from === 'partner' && !viewingThis && ch) ch.unread = (ch.unread || 0) + 1;
  // 非活跃会话来消息：弹桌面前台横幅（活跃会话不弹＝首页那一行预览＋未读角标已带了同一条，BUGS #025）
  if (msg.from === 'partner' && !viewingThis && !isActive) _deskPopForChat(msg, originChat);
  // 系统通知挂在这一条唯一的投递口：别的会话、群聊，以及心愿／纪念日／世界感知那些「功能生成的主动消息」
  // 就此全部覆盖，不再只有当前开着的那本会响（BUGS #164）。前台那一发由引擎记「已看」后自行 return，不与横幅重复
  if (msg.from === 'partner') _bgNotifyForChat(msg, originChat);
  if (msg.from === 'partner' && isActive) notifyPartnerMessage(originChat);
  // 头像昵称互动的节奏是**事件驱动**的（BUGS #179）：TA 做的每件事在这儿攒一点热度，攒够才换形象。
  // 挂在这一个投递口而不是各个功能里各写一遍——这才是「唯一入口」的意义（前一版的定时随机
  // 与本功能没有任何因果，换完只留一句「TA 换了头像」，看不出前因）。
  if (typeof avlibFeed === 'function' && msg.from === 'partner') {
    // 带来源标记的那些（世界感知/主动/信箱/纪念日…）也算一件正经事，权重高一档；
    // kind 只在「信」时区别成 letter，其余一律 msg —— src 的种类五花八门，硬凑成一句短语只会说错话。
    avlibFeed(originChat, msg.letter ? AV_HEAT_LETTER : (msg.src ? AV_HEAT_MSG + 2 : AV_HEAT_MSG), msg.letter ? 'letter' : 'msg');
  }
  if (typeof _cjEvent === 'function' && msg.from === 'partner') _cjEvent(originChat, 'taReplied');   // 世界感知事件钩子：TA 刚回了话
  save();
  if (isActive) { _animateNextRender = true; renderMessages(); }
  if (!viewingThis && typeof renderChatsList === 'function') { try { renderChatsList(); } catch (e) {} }
  return isActive;
}

// 撤回 + 撤回补发：target 在几秒后标记撤回，命中补发概率则以新消息重发。
// originChat=消息所属会话（回复期间切走时按原会话流查找与投递，不串进当前会话）
function _scheduleRecall(target, bh, originChat) {
  setTimeout(() => {
    const willResend = _rand(bh.rcRefix);
    const ch = originChat && data.chats && data.chats[originChat];
    const stream = (ch && Array.isArray(ch.msgs)) ? ch.msgs : data.messages;
    const isActive = stream === data.messages;
    const viewingThis = isActive && document.body.dataset.view === 'chat';   // 未读口径与 _deliverToChat 一致
    // FIX 2026-09-03 #031 原文已被用户删除时整体放弃（原逻辑仍会走补发，删掉的气泡几秒后「复活」）
    const found = stream.find(m => m.id === target.id);
    if (!found) return;
    found.recalled = true;
    // 半句撤回：35% 概率「瞥到几个字」——开头或结尾随机残留在气泡上（纯文字才有）；25% 概率表情包只瞥到一角
    if (!target.sticker && target.text && target.text !== '[表情包]' && Math.random() < 0.35) {
      const s = String(target.text).trim();
      const fromEnd = s.length > 6 && Math.random() < 0.4;
      const n = Math.min(s.length, 1 + Math.floor(Math.random() * 2) + (s.length > 12 ? 1 : 0));
      found.peek = fromEnd ? s.slice(-n) : s.slice(0, n);
      if (fromEnd) found.peekEnd = true;
    }
    if (target.sticker && Math.random() < 0.25) found.peekSticker = true;
    save();
    if (isActive) { resetMessageRender(); renderMessages(); }
    if (!viewingThis && typeof renderChatsList === 'function') { try { renderChatsList(); } catch (e) {} }
    if (willResend) {
      setTimeout(() => {
        const again = { id: nextId(), from: 'partner', text: (target.text && target.text !== '[表情包]') ? target.text : '[表情包]', time: time(), date: new Date().toLocaleDateString('zh-CN'), unread: true };
        again.sentAgain = true;   // 撤回补发重发的消息：与撤回一样默认隐藏原文，点「查看」才显示（避免误以为原文直接暴露）
        if (target.sticker) again.sticker = target.sticker;
        if (target.quote) again.quote = target.quote;
        if (target.quoteImgId) again.quoteImgId = target.quoteImgId;   // FIX 2026-09-03 #031 文字消息引用图片时补发保留缩略图（原仅 sticker 分支设置）
        if (target.sticker) again.quoteImgId = target.id;   // 引用图片：存原消息 id，渲染时取图，避免复制整张 base64
        if (target.sender) again.sender = target.sender;
        stream.push(again);
        if (isActive) notifyPartnerMessage(originChat);
        if (!viewingThis && ch) ch.unread = (ch.unread || 0) + 1;
        if (!viewingThis && !isActive) _deskPopForChat(again, originChat);
        save();
        if (isActive) { _animateNextRender = true; renderMessages(); }
        if (!viewingThis && typeof renderChatsList === 'function') { try { renderChatsList(); } catch (e) {} }
      }, 600 + Math.random() * 1200);
    }
  }, 1500 + Math.random() * 2000);
}

// @ 谁：文本里出现「@名字」就算（名单逐个找，@ 后紧跟标点或换行也算点到）
function _gMentioned(c, userText) {
  const t = String(userText || '');
  if (t.indexOf('@') < 0) return [];
  return (c.members || []).filter(n => n && t.indexOf('@' + n) >= 0);
}

// ===== @ 点名（只在群里）：打 @ 弹成员名单，点一下把「@名字 」插回输入框 =====
// 引擎认的是文本里的 @名字（上面那个 _gMentioned），这一层只负责把它打出来，不做第二套判定
function _atClose() { const el = $('#atPick'); if (el) el.hidden = true; }
function _atScan() {
  const input = $('#messageInput'), el = $('#atPick'), list = $('#atPickList');
  if (!input || !el || !list) return;
  const c = (typeof currentContact === 'function') ? currentContact() : null;
  const v = input.value;
  const caret = (typeof input.selectionStart === 'number') ? input.selectionStart : v.length;
  const at = v.lastIndexOf('@', Math.max(0, caret - 1));
  const seg = at < 0 ? null : v.slice(at + 1, caret);
  // @ 后已经打过空格＝这一次点名结束了，别再挂着名单
  if (!c || c.kind !== 'group' || at < 0 || /\s/.test(seg)) { _atClose(); return; }
  const hit = ((c.members || []).filter(n => n && (!seg || n.indexOf(seg) === 0))).slice(0, 8);
  if (!hit.length) { _atClose(); return; }
  list.innerHTML = hit.map(n => '<div class="member-pick" data-at-name="' + escapeHTML(n) + '">'
    + _memberAvatarHTML(n, 'member-pick-avatar', true)
    + '<span class="member-pick-name">' + escapeHTML(n) + '</span></div>').join('');
  el.hidden = false;
}
const _atInputEl = $('#messageInput');
if (_atInputEl) {
  _atInputEl.addEventListener('input', _atScan);
  _atInputEl.addEventListener('click', _atScan);
  _atInputEl.addEventListener('blur', () => setTimeout(_atClose, 160));
}
const _atPickEl = $('#atPick');
if (_atPickEl) _atPickEl.addEventListener('click', e => {
  const row = e.target.closest('[data-at-name]');
  if (row) _atPickName(row.dataset.atName);
});
function _atPickName(name) {
  const input = $('#messageInput');
  if (!input || !name) { _atClose(); return; }
  const v = input.value;
  const caret = (typeof input.selectionStart === 'number') ? input.selectionStart : v.length;
  const at = v.lastIndexOf('@', Math.max(0, caret - 1));
  if (at < 0) { _atClose(); return; }
  input.value = v.slice(0, at) + '@' + name + ' ' + v.slice(caret);
  const pos = at + name.length + 2;
  input.setSelectionRange(pos, pos);
  data.chatDraft = input.value;
  _atClose();
  input.focus();
}

// 群里的一轮：每位成员各掷一次【她自己那档】的不回概率，命中的才开口；被 @ 点到的那几位必开口、
// 且这一轮只有他们（跳过概率）。一个都没中＝这一轮屏上什么都不落——「对方已读不回」那句话在群里
// 说不出是谁，宁可不说（这枚口径在对比稿 D 案里已给用户看过）。
function _groupReplyRound(chatId, userText) {
  const c = (data.contacts || []).find(x => x.id === chatId) || null;
  if (!c || c.kind !== 'group' || !(c.members || []).length) return;
  const named = _gMentioned(c, userText);
  // 掷的是每位【自己那一格 × 她自己此刻在做什么】（BUGS #290）：她自己的档住在她自己那一本单聊里，
  // 按名回查得到就浮、查不到（只在群里出现的名字）一律 ×1 不表态——不拿群里那位的名义替她假设她在忙
  const who = named.length ? named : c.members.filter(n => !_rand(_rnProbOf(_cjCidOfName(n), _gbhMerged(chatId, n))));
  who.forEach((name, i) => _memberReply(chatId, name, i));
}

// 一位成员的一封回复：延迟与条数都从她自己的档里抽（没存过的格跟随群档），
// order 只用来把同轮的几位错开，免得三个人同一帧各冒一条
function _memberReply(chatId, name, order, immediate) {
  if (_pendingBusy(chatId, name)) return;
  const bh = _gbhMerged(chatId, name);
  const plan = _replyPlan(bh, immediate ? 1 : null, name);
  _pendingAdd(chatId, true, plan.senders);
  const fastest = Math.max(1, Number(bh.rsMin) || 1) * 1000;
  const slowest = Math.max(fastest, Math.max(1, Number(bh.rsMax) || 40) * 1000);
  const base = immediate ? 300 + Math.floor(Math.random() * 700) : Math.max(400, fastest + (slowest - fastest) * Math.random());
  const delay = base + (order || 0) * _msgGapMs();
  setTimeout(() => {
    _replyBatch(bh, plan, chatId);
  }, delay);
}

// 拍一拍指定成员后由她回（BUGS #184）：走的是 _memberReply 的 immediate 那一档——跳过「已读不回」概率，
// 与 @ 点名「被点到的那几位必开口」同一口径。空壳放 js/chat.js 是因为 _memberReply 是本文件的模块级函数，
// js/stickers.js 拿不到它；别把 _memberReply 本身改成全局（那就成了第二个写手，两处都能改同一条回复规则）。
function _pokeMemberReply(chatId, name) {
  try { _memberReply(chatId || data.activeChat, name, 0, true); } catch (e) {}
}
// 「话没挤过来」：TA 每回应你一句之前先掷这一枚概率（behavior.strayProb，按联系人各一份，0＝从不），
// 命中那一轮就不发正文，只在聊天里落一条居中系统小字（照「对方已读不回」那一族的写法：事件提示走系统小字，
// 不发成 TA 的气泡，否则等于替它编了一句它没能说出来的话）。
// 2026-10-10 换向（BUGS #153 二批）：旧写法把它钉在「库里这一位取不到任何正文卡」这一个前提上，
// 而那个前提对往库里加卡的人永不成立＝一整行设置永远不会生效、屏上那一发永远看不见。现在它就是普通概率事件。
// 等待时长沿用这一条线自己的那个数（rsMin~rsMax 的正常回复节奏），不新写死一个；
// 在途名额照计＝顶栏那行「TA正在想怎么回你」与落地的这条不打嘴（两条读数互相矛盾是本仓红过的一族）。
// 返回 true＝这一轮归它了，调用方就此收住，不再走已读不回与正常回复那两条抽签。
function _strayNote(chatId, bh) {
  const p = Math.max(0, Math.min(100, Number(bh && bh.strayProb) || 0));
  if (!_rand(p)) return false;
  _pendingAdd(chatId, false);
  const today = new Date().toLocaleDateString('zh-CN');
  const fastest = Math.max(1, Number(bh && bh.rsMin) || 1) * 1000;
  const slowest = Math.max(fastest, Math.max(1, Number(bh && bh.rsMax) || 40) * 1000);
  const delay = Math.max(400, fastest + (slowest - fastest) * Math.random());
  setTimeout(() => {
    try {
      const ch = data.chats && data.chats[chatId];
      const stream = (ch && Array.isArray(ch.msgs)) ? ch.msgs : null;   // 等待期间切走：这条仍归原会话
      if (stream) {
        stream.push({ id: nextId(), from: 'system', text: '有句话没挤过两个世界', time: time(), date: today });
        save();
        if (stream === data.messages) renderMessages();
        else if (typeof renderChatsList === 'function') { try { renderChatsList(); } catch (e) {} }
      }
    } finally {
      _pendingDone(chatId);
    }
  }, delay);
  return true;
}

// 「已读不回」这一格此刻真正生效的概率＝你填的那个数 × TA 此刻在做什么的倍率（BUGS #290·
// 倍率表与取档都在 js/cjian.js 一处，这里只负责乘完夹回来）。两道夹 0~100 各挡一件事：
// ①倍率能把 90% 顶穿 100%＝「永远不回」，那是另一回事，不许由一次浮动悄悄发生；
// ②你填 0 时乘任何倍率仍是 0＝「从不已读不回」这一档必须填得进去（#198 那条「0 这一档必须填得进去」）。
// cid 由调用方递【这一位自己】的那一本：群聊里传的是按名回查到的单聊 id，读不到就一律 ×1 不表态
function _rnProbOf(cid, bh) {
  const base = Math.max(0, Math.min(100, Number(bh && bh.rnProb) || 0));
  const mul = (typeof cjActivityNrMul === 'function') ? cjActivityNrMul(cid, bh) : 1;
  return Math.max(0, Math.min(100, base * mul));
}
// 群里那位成员在世界感知里的那一档住在他【自己那一本单聊】的档案里（按名回查，与 chatCardOwners∶#104 同一手法）；
// 只在群里出现的名字（不在通讯录）＝没有档可读 → 空串，两位读侧都回 ×1，不替他假设现在忙不忙
function _cjCidOfName(name) {
  const m = (data.contacts || []).find(x => x && x.kind !== 'group' && x.name === name);
  return m ? m.id : '';
}

function partnerReply(chatId, userText) {
  const activeChat = (chatId && data.chats && data.chats[chatId]) ? chatId : data.activeChat;   // 发送时所在会话：回复归属与回复设置都取这里
  const bh = (activeChat !== data.activeChat && data.chatSettings && data.chatSettings[activeChat]) ? data.chatSettings[activeChat] : (data.behavior || {});
  if (!_categoryCards('主字卡').length) return;   // 库里这一位一句正文都没有＝照旧静默（#078 定档的代价；它不再是那行小字的前提）
  // 群聊走另一条路：不是「这轮回几条、每条署谁」，而是「每位各自决定回不回、回几条」
  if (_chatIsGroup(activeChat)) { _groupReplyRound(activeChat, userText); return; }
  // 闸门只看【本会话】有没有在途（旧的「全局只允许一封」会把别的会话一起挡死，BUGS #088）
  if (_pendingBusy(activeChat)) return;
  // 先掷「话没挤过来」这一枚（BUGS #153 二批）：命中＝这一轮不发正文，只落那一行居中小字
  if (_strayNote(activeChat, bh)) return;
  // rnProb = 已读不回概率：命中则标记已读并发系统提示「对方已读不回」，不回复；未命中（100-rnProb%）才正常回复。
  // 掷的是【乘过 TA 此刻状态】的那个数（BUGS #290），掷点在发起那一刻＝与 #088 那一族同一条规矩
  if (_rand(_rnProbOf(activeChat, bh))) {
    _pendingAdd(activeChat, false);
    const today = new Date().toLocaleDateString('zh-CN');
    const readDelay = Math.max(600, Math.min(5000, Math.max(1, Number(bh.rsMin) || 1) * 300));
    setTimeout(() => {
      try {
        const ch = data.chats && data.chats[activeChat];
        const stream = (ch && Array.isArray(ch.msgs)) ? ch.msgs : null;   // 等待期间切走：系统提示仍归原会话
        if (stream) {
          stream.push({ id: nextId(), from: 'system', text: '对方已读不回', time: time(), date: today });
          if (typeof _cjEvent === 'function') _cjEvent(activeChat, 'nr');   // 世界感知事件钩子：已读不回落下＝TA 正被占着
          save();
          if (stream === data.messages) renderMessages();
          else if (typeof renderChatsList === 'function') { try { renderChatsList(); } catch (e) {} }
        }
      } finally {
        _pendingDone(activeChat);
      }
    }, readDelay);
    return;
  }
  const plan = _replyPlan(bh, null);
  _pendingAdd(activeChat, true, plan.senders);
  const fastest = Math.max(1, Number(bh.rsMin) || 1) * 1000;
  const slowest = Math.max(fastest, Math.max(1, Number(bh.rsMax) || 40) * 1000);
  const delay = Math.max(400, fastest + (slowest - fastest) * Math.random());
  setTimeout(() => {
    _replyBatch(bh, plan, activeChat);   // 等待期间切走：回复设置与整张计划表都用发起时的（bh/plan），消息路由回发起时的会话
  }, delay);
}

// 一封回复的全部随机决定都在【发起那一刻】算死存进这张表，落地时只照表装配。
// 以前这些抽签发生在延迟到期的回调里，而那时用户可能已经切到别的会话，于是取的是「别的会话用得到的字卡」
// （#051 硬隔离后各会话池子不同）、引用的是「别的会话的最后一条」、群聊署名从「别的群」的成员里挑（BUGS #088）。
// 群聊那一份 senders[] 同时是屏上「N位正在想怎么回你」的读数来源——先定人才敢说几位，不是编一个数。
// 给一条消息附上一张图，并把「这一张是图片还是表情包」的身份一起写进消息（BUGS #157）。
// 身份＝字卡库那一组自己的分类；缺省（不写这个字段）＝表情包档，老消息零迁移照旧渲染。
// 一处抽签四处复用（回复批·文字附带·主动发送·主动附带），不留第二份写法
function _attachSticker(msg, pool) {
  const p = pool && pool[Math.floor(Math.random() * pool.length)];
  if (!p) return;
  msg.sticker = typeof p === 'string' ? p : p.src;
  if (typeof p === 'object' && p.kind === 'image') msg.imgKind = 'image';
}
// TA 会不会**不等你长按去问就自己把那两枚签标上**（BUGS #350）。两枚各一格概率（behavior.referProb／
// meantProb，按联系人一份、出厂 0＝这个新行为不悄悄生效，同 #309 情绪标签那条），
// 一处掷、两条开口路径共用（回你话那一批的第一条 ∶ 主动发来那句的第一条）＝不留第二份实现。
// 写侧也读那两枚总闸（data.referOn／data.meantOn）：关着＝既不掷也不落库，
// 只藏渲染的话库里会攒一堆屏上永远看不见的值（#114 那条「关掉＝既不掷也不上屏」同一课）。
// 签落库后与长按掷出来的长得一样（用户定档「不区分来路」）：再长按一次仍重掷覆盖，不攒账。
function _askBadgeSelf(m, bh) {
  if (!m || m.from !== 'partner' || m.src || m.recalled) return;
  const lo = (v) => Math.max(0, Math.min(100, Number(v) || 0));
  const rp = data.referOn !== false ? lo(bh && bh.referProb) : 0;
  const mp = data.meantOn !== false ? lo(bh && bh.meantProb) : 0;
  if (rp && _rand(rp)) m.refer = rollRefer();
  // 本意那一段的资格仍归渲染侧那一把尺（我方名下的问问TA 卡等例外它自己判），这里只多问一句
  if (mp && _rand(mp) && (typeof _meantEligible !== 'function' || _meantEligible(m))) m.meant = rollMeant();
}
function _replyPlan(bh, countOverride, onlySender) {
  const origin = data.activeChat;
  const isGroup = !!onlySender || (typeof _isGroupChat === 'function' && _isGroupChat());
  const mainCards = _categoryCards('主字卡');
  // 「表情包概率」与「图片概率」各管一类（BUGS #209 二批）：partnerStickerPool 每张卡自带 kind 身份，
  // 这里按身份现分成两池＝取池仍只有一处，两枚概率才各有其义。
  // 旧写法两类混在同一池里、只由 stickerProb 说话，于是「图片概率」那一格从上线起一次都不生效。
  const pool = typeof partnerStickerPool === 'function' ? partnerStickerPool() : [];
  const stickers = pool.filter(p => p.kind !== 'image');
  const images = pool.filter(p => p.kind === 'image');
  const voices = typeof partnerVoices === 'function' ? partnerVoices() : [];
  const multi = !!(bh.pyEnabled && _rand(bh.pyProb));
  // 上限与控件区间同源（html/view-mate.html 那两格 max=10∶群成员档 GBH_RANGE 也到 10）：
  // 原先这里夹死 5＝用户把「最多回复条数」拉到 8 完全无效（BUGS #127 给主动发送那族收过的同一刀）
  const n = multi ? 1 : Math.max(1, Math.min(10, countOverride || _ri(Number(bh.replyMin) || 1, Number(bh.replyMax) || 2)));
  // 逐条形态按旧分支的同一次序掷（表情包先判、拍一拍只在非表情包时判），把随机数消耗顺序原样保住；
  // 语音与图片插在表情包之前＝三枚概率各管一类，一条气泡只带一种（池空那一档自动跳过，不占掷）
  const kinds = [], senders = [];
  for (let i = 0; i < n; i++) {
    const k = (!multi && voices.length && _rand(bh.voiceProb)) ? 'voice'
      : (!multi && images.length && _rand(bh.imageProb)) ? 'image'
      : (!multi && stickers.length && _rand(bh.stickerProb)) ? 'sticker'
      : (!multi && _rand(bh.touchProb)) ? 'poke' : 'text';
    kinds.push(k);
    // 群聊这一封是【某一位】的发言（onlySender）。拍一拍**也要署名**（BUGS #185）：
    // 原写法 `k !== 'poke'` 把拍一拍排除在署名之外，于是群成员发的拍一拍落成一条无名系统小字，
    // 屏上既不知道是谁拍的、也不知道拍的是谁（实测「XXX拍了拍我」里 XXX 直接空了）。
    senders.push(isGroup ? (onlySender || _groupSender() || '') : '');
  }
  // 引用目标＝我方在【本会话】的最后一条，发起时就读好
  const stream = (data.chats[origin] && Array.isArray(data.chats[origin].msgs)) ? data.chats[origin].msgs : (data.messages || []);
  let quoteTarget = null;
  for (let k = stream.length - 1; k >= 0; k--) if (stream[k].from === 'me') { quoteTarget = stream[k]; break; }
  return {
    multi, n, kinds, senders, isGroup, mainCards, stickers, images, voices,
    kaomos: _categoryCards('颜文字'), emojis: _categoryCards('emoji'), pokes: _categoryCards('拍一拍'),
    doQuote: !!quoteTarget && _rand(bh.quoteProb),
    quoteText: quoteTarget ? (quoteTarget.sticker ? '[表情包]' : quoteTarget.text) : '',
    quoteImgId: quoteTarget && quoteTarget.sticker ? quoteTarget.id : '',
    doRecall: !!bh.recallEnabled && _rand(bh.rcProb),
    pokeName: typeof chatPartnerName === 'function' ? chatPartnerName() : partnerName()
  };
}

// 回复批次的逐条落地：partnerReply（正常回复）与 continueChat（让对方继续说）共用，内容照 plan 装配。
// originChat=回复归属的会话（缺省=当前活跃会话）
function _replyBatch(bh, plan, originChat) {
  try {
    if (!originChat) originChat = data.activeChat;
    if (!plan) plan = _replyPlan(bh);   // 兜底：调用方没给计划表时当场生成（此刻 origin 仍是活跃会话）
    const mainCards = plan.mainCards, stickers = plan.stickers, images = plan.images, voices = plan.voices, kaomos = plan.kaomos, emojis = plan.emojis, pokes = plan.pokes;
    const multi = plan.multi;
    // 逐条形态与署名在发起时已定死（群聊那一份就是屏上「N位」数的那份），这里不再现取别的会话的东西
    const msgs = [];
    for (let i = 0; i < plan.n; i++) {
      const kind = plan.kinds[i];
      let msg;
      if (kind === 'voice') {
        // 语音：这一条气泡＝库里那张语音卡说出来的话。录音是卡自带的（不碰 MiniMax、不出网），
        // text 存那张卡自带的完整文字（卡上有才有，没有就空串）＝复制∶搜索∶收藏拿得出正文，
        // 而屏上画的是波形条（渲染侧 m.voice 分支），一枚气泡只说一种载体。
        const v = voices[Math.floor(Math.random() * voices.length)];
        msg = { id: nextId(), from: 'partner', text: v.text || '', voice: v.data, unread: true };
      } else if (kind === 'sticker' || kind === 'image') {
        // 图片与表情包走同一条装配，只差抽哪一池（身份由 _attachSticker 按卡自己的 kind 写进消息）
        msg = { id: nextId(), from: 'partner', text: '[表情包]', unread: true };
        _attachSticker(msg, kind === 'image' ? images : stickers);
        // tsEnabled：表情包附带字卡文字，同气泡发送
        if (bh.tsEnabled) {
          let t = mainCards[Math.floor(Math.random() * mainCards.length)];
          const suf = [];
          // 世界观：TA 只能用已保存的字卡表达——库里没有颜文字/emoji 组时就不用，不设兜底
if (_rand(bh.emojiProb) && emojis.length) suf.push(emojis[Math.floor(Math.random() * emojis.length)]);
          if (_rand(bh.kaomojiProb) && kaomos.length) suf.push(kaomos[Math.floor(Math.random() * kaomos.length)]);
          if (suf.length) t = t + ' ' + suf.join(' ');
          msg.text = t;
        }
      } else if (kind === 'poke') {
        // 拍一拍：像「对方已读不回」一样居中显示为系统提示，不计入可撤回消息。
        // 兜底文案与主动拍一拍统一为「我」视角（原「拍了拍你」是旁观视角）。
        // ⚠ 库里那张卡（如「拍了拍你的头」）是**「我拍她」**的视角，照抄出来读着像是我在拍自己。
        // TA 主动拍我要反过来念成「拍了拍我的头」——只换代词、**不补名字**：这一行居中没有主语位，
        // 补上会念成「阿澄 拍了拍阿澄的头」（BUGS #185 那一族里【群】的拍一拍靠行首那枚署名解决；居中这一行不带署名，所以只能换代词）。
        const base = pokes.length ? pokes[Math.floor(Math.random() * pokes.length)] : '拍了拍我';
        msg = { id: nextId(), from: 'system', text: typeof _pokeTransformTa === 'function' ? _pokeTransformTa(base) : base };
      } else {
        let text;
        if (multi) {
          const cn = Math.max(2, _ri(Number(bh.pyMin) || 2, Number(bh.pyMax) || 5));
          const parts = [];
          for (let c = 0; c < cn; c++) parts.push(mainCards[Math.floor(Math.random() * mainCards.length)]);
          text = pyJoinCards(parts, bh);
        } else {
          text = mainCards[Math.floor(Math.random() * mainCards.length)];
        }
        const suf = [];
if (_rand(bh.emojiProb) && emojis.length) suf.push(emojis[Math.floor(Math.random() * emojis.length)]);
        if (_rand(bh.kaomojiProb) && kaomos.length) suf.push(kaomos[Math.floor(Math.random() * kaomos.length)]);
        if (suf.length) text = text + ' ' + suf.join(' ');
        msg = { id: nextId(), from: 'partner', text, unread: true };
        // 聊天情绪标签与逻辑连接词（BUGS #309，前作「星言」的三级链＋「mochi」的连接词两用法）：
        // ①只有这一轮的第一条挂（与前作同口径，一条批里每条都长三枚标签读成表格不像对话）；
        // ②**先有正文才谈连接词**——主字卡池空时 partnerReply 第一道闸就早退了，走不到这里，
        //   所以不会出现「只有一行标签没有话」或「TA 只回一个嗯嗯」那种空气泡（设计稿 §五-6）；
        // ③追加固定用空格相接，不走 pyJoinCards 那口随机标点池（同一句里「，」＋「其实」＝连接两遍）。
        if (i === 0 && typeof _emotionForMessage === 'function') {
          const e = _emotionForMessage(_emoCidFor(msg, originChat), text);
          if (e.word) text = e.replace ? e.word : (text + ' ' + e.word);
          msg.text = text;
          if (e.tags.length) msg.emo = e.tags;
        }
        // 文字字卡附带一张图：与 Mochi 类似，同气泡附带（仅单条字卡时）。
        // 两枚概率各管一类——先掷「图片概率」抽「图片」分类，没中再掷「表情包概率」抽「表情包」分类，
        // 一条气泡只带一张（BUGS #209 二批：旧写法这一发只读 stickerProb，图片那一格永远不生效）
        if (!multi && bh.tsEnabled && images.length && _rand(bh.imageProb)) _attachSticker(msg, images);
        else if (!multi && bh.tsEnabled && stickers.length && _rand(bh.stickerProb)) _attachSticker(msg, stickers);
      }
      if (i === 0) _askBadgeSelf(msg, bh);   // 一轮只标第一条（与情绪标签同口径），其余各条不叠签
      if (i === 0 && plan.doQuote && msg.from === 'partner') {
        msg.quote = plan.quoteText;
        if (plan.quoteImgId) msg.quoteImgId = plan.quoteImgId;   // 引用图片：存原消息 id，渲染时取图，避免复制整张 base64
      }
      // 群聊：署发起时定好的那位。⚠ 判断**不能**带 msg.from === 'partner'（BUGS #185）：
      // 拍一拍是 from='system' 的居中小字，那道门槛把它挡在门外 → sender 永远搬不上，
      // 屏上那一行就成了「拍了拍我的头」这种无名无主的话（用户报的就是这个）。
      // 改成「只要有署名就搬」，覆盖 partner 与 system 两族；quote 那段仍只看 partner（引用只发生在气泡上）。
      if (plan.isGroup && !msg.sender) { const s = plan.senders[i]; if (s) msg.sender = s; }
      msgs.push(msg);
    }
    // 逐条错开落地（时间戳在实际落地时取），期间切走会话由 _deliverToChat 路由回原会话
    const pushed = [];
    let acc = 0;
    msgs.forEach((msg, i) => {
      if (i > 0) acc += _msgGapMs();
      setTimeout(() => {
        try {
          _deliverToChat(msg, originChat);
          if (msg.from !== 'system') pushed.push(msg);
        } finally {
          if (i === msgs.length - 1) {
            _pendingDone(originChat);
            // TA 回完这一批 → 2 秒后问一次「要不要一起听」（群聊那一发在 plMaybeRequest 里自己挡掉）
            setTimeout(() => { try { if (typeof plMaybeRequest === 'function') plMaybeRequest(originChat); } catch (e) {} }, 2000);
            if (plan.doRecall && pushed.length) _scheduleRecall(pushed[pushed.length - 1], bh, originChat);
          }
        }
      }, acc);
    });
  } catch (e) {
    _pendingDone(originChat);
    throw e;
  }
}

// ===== 主动发送：每位联系人一条钟，开口那一刻才决定「说给谁」（BUGS #216）=====
// 2026-10-07 #135 把那枚全局钟改成「每个会话各一格」，代价量在纸上：一位联系人在单聊占一格、
// 在三个群就还占三格＝他一个人拿着四份钟，而群那几格读的是「本群」那份档，与他在单聊里多勤快无关。
// 于是用户 2026-10-09 看到的现场＝明明在跟某位单聊，屏上大半主动消息却是这些人轮流在群里冒话。
// 同一把尺子的模拟（tools/_as_share_sim.mjs·出厂档·三人各一单聊＋两个群·跑两遍读数一致）：
//   改前 单聊每人 105 条/天 ∶ 群 A 160 ∶ 群 B 159（群里占 50%，而只有一个成员的群和住满人的群一样吵）
//   改后 单聊每人 98 条/天 ∶ 群 A 26 ∶ 群 B 5（落群 10% 那一档）
// 现在 data._nextActiveAtBy[联系人id] 只给【单聊】摊格，间隔·概率·免打扰·条数·字卡池全读他自己那份；
// 到点掷中之后再掷一次落点——绝大多数回到他自己的单聊本，asGroupProb 那一点概率均分给他所在的每个群。
// 所以「群里多吵」由那一格决定，与你开了几个群无关（群越多，每个群分到的越少）。
// 群不再有自己的钟：旧「偶尔自己聊天」那一族（按群 20~60 分钟到点必发，js/mailbox.js）整组退役，
// 屏上「群里有人自己说话」自此只剩一个来路＝某位开口时落到了群（不留第二份实现）。
// 如实写明代价：屏上主动消息的总量随【人数】走——「每人各设各的勤懒」本来就是这个含义，不是漏洞。
// 一个 tick 只放行【到点最早的那一位】（其余等下一格 30 秒）：冷启动/回前台时可能 N 位同时过期，
// 一次全掷＝屏上凭空涌出 N 个人的消息。这不是限次（每位照常到点照常说话），只是不叠在同一秒。
// #061 那三条判据（长/短离场分岔＋_asLastTryAt 双通道去重）在这套模型下不再需要，已随本次改写撤掉：
// 表里那枚时刻本来就是按【该档自己的区间】算出来的未来时刻，只有真过了它才会掷——回前台不可能「提前」
// 补出一发；掷之前先把新的未来时刻写回去，也不存在两条通道抢同一位（免打扰那条承诺因此自动守住，
// 不再需要 #127 追记里那枚共用的地板常量去对齐两处数字）。
let _asInterval = null;
let _asSeq = 0;
const DND_MIN_MS = 60;   // 免打扰档的间隔地板（分钟）：这一档最短也要等 1 小时，再叠 0~2 小时随机
// 这一位的档＝chatSettings[cid] 那一份；没建过就以出厂档兜底。
// 刻意不回落 data.behavior——那是「此刻开着的那个人」的档，拿它顶替正是旧写法串味的来源。
function _asBhOf(cid) {
  const bh = (data.chatSettings && cid) ? data.chatSettings[cid] : null;
  return (bh && typeof bh === 'object') ? bh : defaults.behavior;
}
function nextActiveDelay(cid) {
  const bh = _asBhOf(cid);
  const minMin = Math.max(1, Number(bh.asMin) || 1);
  const maxMin = Math.max(minMin, Number(bh.asMax) || 5);
  // 整段区间按「TA 此刻在做什么」浮动（倍率表与唯一读侧都在 js/cjian.js·BUGS 见设计稿段一）：
  // 空闲 ×0.7 ∶ 忙着 ×2.6 ∶ 睡着 ×6 ∶ 读不到 ×1。这一发落到单聊还是群是更晚才掷的（_asTargetOf），
  // 所以群里冒出来的那一句带的就是他【自己】这一档的倍率——群成员不需要第二份实现
  const mul = (typeof cjActivityMul === 'function') ? cjActivityMul(cid, bh) : 1;
  let ms = (minMin + Math.random() * (maxMin - minMin)) * 60000 * mul;
  if (bh.dndEnabled) ms = Math.max(ms, (DND_MIN_MS + Math.random() * 120) * 60000); // 免打扰：1~3 小时
  // 地板放在乘【之后】：那条 1~3 小时是用户显式许下的下限，不许被倍率乘穿。
  // 如实的代价（仿真实测）＝开着免打扰时这一族的浮动基本被地板抬起、三张倍率表读数与不调制一致，
  // 屏上那句说明因此写着「开着免打扰时基本看不出来」
  return ms;
}
// 活动档换了之后，只允许把那一格【拉近】，绝不推后（设计稿段二·策略 C）。
// 为什么必须单向：活动钟每 8~25 分钟跳一次，比这一格本身的间隔还勤——两头都动＝每次跳都把它重推到未来，
// 那一格永远走不到点（仿真读数：免打扰开着时开口 0 次／天·免打扰关着时最长等待从 60 分被顶到 191~268 分，
// tools/_as_state_mul_sim.mjs）。mul >= 1 就回：变忙不该把已答应的等待拉长，「读不到」也不替他假设现在有空
function _asPullIn(cid) {
  const bh = _asBhOf(cid);
  const mul = (typeof cjActivityMul === 'function') ? cjActivityMul(cid, bh) : 1;
  if (mul >= 1) return;
  const tbl = data._nextActiveAtBy;
  if (!tbl || typeof tbl !== 'object' || Array.isArray(tbl)) return;
  const t = tbl[cid];
  if (typeof t !== 'number' || !isFinite(t)) return;   // 还没摊过那一格＝交给 tick 自己按档摊
  const cand = Date.now() + nextActiveDelay(cid);
  if (cand < t) { tbl[cid] = cand; save(); }
}
// 把某一格推到未来（掷之前先落时刻＝同一位不会被两轮 tick 各掷一次）
function _asSetNext(cid) {
  if (!data._nextActiveAtBy || typeof data._nextActiveAtBy !== 'object' || Array.isArray(data._nextActiveAtBy)) data._nextActiveAtBy = {};
  data._nextActiveAtBy[cid] = Date.now() + nextActiveDelay(cid);
}
// 这一位所在、且他在其中没被设成「从不说话」的群（rnProb 100＝他不接话，也不该在群里自己冒出来，#104 同口径）
function _asGroupSeats(cid) {
  const c = (data.contacts || []).find(x => x && x.id === cid && x.kind !== 'group');
  if (!c || !c.name) return [];
  const seats = (data.contacts || []).filter(g => g && g.kind === 'group' && (g.members || []).indexOf(c.name) >= 0
    && _gbhMerged(g.id, c.name).rnProb < 100).map(g => g.id);
  // 主动消息管理（js/silent.js）：被关掉的群不再当座位＝那一发落回他自己的单聊，群里不会有主动消息。
  // 群没有自己的钟（#216），群里每一句主动消息都由某位单聊联系人那口钟落进来，所以这一道就是
  // 群聊场景的全部——不需要也不许再有第二份实现
  if (typeof chatSilentOn === 'function') return seats.filter(id => !chatSilentOn(id));
  return seats;
}
// 开口那一刻掷一次落点：先掷「这一发说给群吗」，中了再在他所在的群之间等概率挑一个。
// 落点定了就不再回落单聊——「本来要说给你、结果说给了群」那种串味正是这一族的老病，反过来也一样；
// 而群那本的主字卡池是这一位单聊池的超集（utils.chatCardOwners 把成员自己的专属组并了进来），
// 所以「落到群反而一句都没有」只会在单聊同样一句都没有时发生，不存在因为落群而凭空少说一句。
function _asTargetOf(cid, bh) {
  const seats = _asGroupSeats(cid);
  if (!seats.length) return cid;
  const p = Math.max(0, Math.min(100, Number(bh.asGroupProb) || 0));
  if (!p || !_rand(p)) return cid;
  return seats[Math.floor(Math.random() * seats.length)];
}
// 改完这一位的设置就当场按新值重排那一格：间隔从 10 分调到 1 分，不必等旧的那一格走完。
// 群没有自己的钟（BUGS #216），在群那一屏里保存设置不许给群摊一格＝不留一条永不掷的死人账。
function rescheduleActiveSend(cid) {
  const id = cid || data.activeChat;
  if (!id || _chatIsGroup(id)) return;
  _asSetNext(id);
  save();
}
function _activeSendTick() {
  if (!isSchedulerLeader()) return;
  // 只遍历单聊联系人：群不再占一格（它的话由每一位自己那一条钟落到群里）
  const list = (data.contacts || []).filter(c => c && c.id && c.kind !== 'group');
  if (!data._nextActiveAtBy || typeof data._nextActiveAtBy !== 'object' || Array.isArray(data._nextActiveAtBy)) {
    // 旧档只有全局那一枚钟：摊给每位当同一个起点＝升级那一下会同时到点，涌出一批。
    // 所以起点按各自的区间逐个现算（第一次算出的那一格就是这一位自己的节奏）。
    data._nextActiveAtBy = {};
    list.forEach(c => { _asSetNext(c.id); });
    save();
    return;
  }
  const now = Date.now();
  // 夜间免打扰开着：到点的那一格照常推回未来、这一发不掷（BUGS #306）。
  // 闸放在【挑出来之前】而不是投递口＝不会攒出一批「已生成没送到」的账，早上也不补（用户定档：让它过去）
  const muted = (typeof nightOn === 'function') && nightOn();
  let dirty = false, pick = null;
  for (const c of list) {
    const t = data._nextActiveAtBy[c.id];
    // 新加的联系人还没有那一格（以及任何脏值）：当场按他自己的档摊一个起点，不在这里掷
    if (typeof t !== 'number' || !isFinite(t)) { _asSetNext(c.id); dirty = true; continue; }
    if (t > now) continue;
    if (muted) { _asSetNext(c.id); dirty = true; continue; }
    // 主动消息管理（js/silent.js）：这一位被关掉主动消息＝与夜间那一道同一把尺（到点不掷，
    // 照常按他自己的区间推回未来＝不攒账不补发）。闸放在这里而不是投递口，理由与上面那一道相同
    if (typeof chatSilentOn === 'function' && chatSilentOn(c.id)) { _asSetNext(c.id); dirty = true; continue; }
    if (pick && pick.at <= t) continue;
    pick = { id: c.id, at: t };
  }
  if (dirty) save();
  if (!pick) return;
  _asSetNext(pick.id);
  save();
  _activeSendOne(pick.id);
}
function startActiveSendScheduler() {
  if (_asInterval) return;
  _activeSendTick();
  _asInterval = setInterval(_activeSendTick, 30 * 1000);
}
function pauseActiveSend() {
  if (_asInterval) { clearInterval(_asInterval); _asInterval = null; }
  _asSeq++; // 暂停后作废错开队列里尚未落地的消息，防止回前台集中补发
}
function resumeActiveSend() {
  // 各会话的时刻在离场期间一直躺在表里，回来这一发照常由 tick 按「真过了它自己的时刻」判定——
  // 不需要 #061 旧写法那套「离场够不够久」的分岔，也不需要一个全局的「上次开掷」去重来去重。
  _activeSendTick();
  if (!_asInterval) _asInterval = setInterval(_activeSendTick, 30 * 1000);
}
// 线上主动发送那条形态链的唯一一份：语音→图片→表情包→主字卡（掷序与 _activeSendOne 一字不差）。
// 字卡适应度检测（js/cardfit.js 的 _cfSim）也调它＝不留第二份实现（铁律①）；
// roll 可注入（线上默认 _rand，检测页传写死种子看稳态、或现场真随机看抖动）。
function _asShapeKind(bh, p, roll) {
  roll = roll || _rand;
  if (p.voices && roll(bh.voiceProb)) return 'voice';
  if (p.images && roll(bh.imageProb)) return 'image';
  if (p.stickers && roll(bh.stickerProb)) return 'sticker';
  if (p.main) return 'text';
  return 'none';
}
function _activeSendOne(cid) {
  // 主动消息管理（js/silent.js）：tick 上已经拦过，这里是直接调用路径的同一把尺。
  // 留这一道是给「不经 tick 的调用方」兜底——落到群那一句是这一份自己掷的，不拦就漏一句
  if (typeof chatSilentOn === 'function' && chatSilentOn(cid)) return;
  const bh = _asBhOf(cid);
  try {
    if (!bh.asEnabled) return;
    if (!_rand(bh.asProb)) return;
    const to = _asTargetOf(cid, bh);   // 落点在取池之前定死，之后不再读界面状态
    const isGrp = to !== cid;
    const mainCards = _categoryCards('主字卡', to);
    // 与回复批同一套拆池口径（表情包∶图片∶语音各一池，两枚概率各管一类）
    const pool = partnerStickerPool(to);
    const stickers = pool.filter(p => p.kind !== 'image');
    const images = pool.filter(p => p.kind === 'image');
    const voices = typeof partnerVoices === 'function' ? partnerVoices(to) : [];
    if (!mainCards.length && !stickers.length && !images.length && !voices.length) return;
    // 落到群＝署他自己的名：这一发本来就是【他】开口（旧写法 _groupSender 随机挑一位署名，
    // 那服务的是「群自己那条钟」，那条钟已随 #216 整组退役，屏上不再有一句不知道是谁说的话）
    const speaker = isGrp ? ((data.contacts || []).find(x => x && x.id === cid) || {}).name || '' : '';
    if (isGrp && !speaker) return;   // 认不出这位是谁（旧档脏数据）就不往群里塞一句没有主语的话
    // 条数上限跟着控件走（#asCountMax 的 max=10），不再硬夹 5：
    // 硬夹 5 会让用户把「条数最多」从 5 拉到 10 时**完全无效**（实测掷 3000 次全是 5），
    // 而这一格是唯一显示、没有第二处备份 —— 属于「设了不生效」那类静默失败。
    // 夹取改用「先按 Number 收窄、再对 defaults 兜底」，与本文件其它读侧同一把尺子。
    const _cLo = Math.max(1, Math.round(Number(bh.asCountMin) || defaults.behavior.asCountMin));
    const _cHi = Math.max(_cLo, Math.round(Number(bh.asCountMax) || defaults.behavior.asCountMax));
    const n = Math.max(1, Math.min(10, _ri(_cLo, _cHi)));
    const _asShapes = { voices: voices.length, images: images.length, stickers: stickers.length, main: mainCards.length };
    const msgs = [];
    for (let i = 0; i < n; i++) {
      let msg = null;
      // 形态链走 _asShapeKind——线上与字卡适应度检测共用的唯一一份（掷序一字不差＝不留第二份实现）
      const _kind = _asShapeKind(bh, _asShapes);
      if (_kind === 'voice') {
        const v = voices[Math.floor(Math.random() * voices.length)];
        msg = { id: nextId(), from: 'partner', text: v.text || '', voice: v.data, unread: true };
      } else if (_kind === 'image') {
        msg = { id: nextId(), from: 'partner', text: '[表情包]', unread: true };
        _attachSticker(msg, images);
      } else if (_kind === 'sticker') {
        msg = { id: nextId(), from: 'partner', text: '[表情包]', unread: true };
        _attachSticker(msg, stickers);
      } else if (_kind === 'text') {
        msg = { id: nextId(), from: 'partner', text: mainCards[Math.floor(Math.random() * mainCards.length)], unread: true };
        // 文字字卡附带一张图：两枚概率各管一类（先图片、没中再表情包）
        if (bh.tsEnabled && images.length && _rand(bh.imageProb)) _attachSticker(msg, images);
        else if (bh.tsEnabled && stickers.length && _rand(bh.stickerProb)) _attachSticker(msg, stickers);
        // 他主动开口那一句也走同一处掷签（BUGS #309）＝不留第二条实现；同样只给第一条、同样先有正文
        if (i === 0 && typeof _emotionForMessage === 'function') {
          const e = _emotionForMessage(_emoCidFor(msg, to), msg.text);
          if (e.word) msg.text = e.replace ? e.word : (msg.text + ' ' + e.word);
          if (e.tags.length) msg.emo = e.tags;
        }
      }
      // 只有图/表情/语音三池、主字卡池空，而这一条一枚也没掷中＝跳过这一条。
      // 旧写法在这里无条件取 mainCards[i]＝text 落成 undefined＝屏上一枚空气泡（三池一多就撞得上）
      if (!msg) continue;
      if (bh.asBadge) msg.asBadge = true;
      // 主动开口那一句走同一处掷签（BUGS #350）＝不留第二条实现；同样只给第一条。
      // 「主动」那枚来源签占槽里第一格、这句的签占第二格（槽最多两枚是旧口径，不因此破）。
      if (i === 0) _askBadgeSelf(msg, bh);
      if (speaker) msg.sender = speaker;
      msgs.push(msg);
    }
    const seq = _asSeq;
    // 逐条落地期间用户切走：仍路由回【这一发定下的那一本】（计未读、弹横幅、不串进当前开着的会话）。
    // 旧写法在这里读 data.activeChat 当投递目标＝这条消息本质上是「掷给此刻开着的那个会话」的。
    let acc = 0;
    msgs.forEach((msg, i) => {
      if (i > 0) acc += _msgGapMs();
      setTimeout(() => {
        if (seq !== _asSeq) return;
        _deliverToChat(msg, to);
      }, acc);
    });
  } catch (e) {
    // 时刻在开掷前就已写回未来（_activeSendTick），这里抛出也不会让这一位卡成「每一格都重来一遍」
    console.error('主动发送失败:', e);
  }
}

// ===== 让对方继续说（对齐 mochi continueChat）：点顶部昵称 / 输入栏按钮，让 TA 接着当前话题再说一轮 =====
// csNormal 关=立即快速回 1 条；开=按「已读不回与回复速度」里的回复速度与条数设置抽取（不改字卡池与多字卡逻辑）
let _csFiredAt = 0;
function continueChat() {
  const now = Date.now();
  if (now - _csFiredAt < 1200) return;   // 触屏 pointerdown + 随后合成 click 只算一次（mochi #152 同款防重入）
  _csFiredAt = now;
  const bh = data.behavior || {};
  if (!_categoryCards('主字卡').length) return;   // 库里没词＝静默（与 partnerReply 同一口径）
  if (_strayNote(data.activeChat, bh)) return;   // 「让 TA 继续说」撞上这一枚＝同一件事，同一个出口
  if (_pendingBusy(data.activeChat)) return;   // 只看本会话有没有在途（旧的全局闸门会连累别的会话）
  const activeChat = data.activeChat;
  if (_chatIsGroup(activeChat)) {
    const c = currentContact();
    const can = ((c && c.members) || []).filter(n => _gbhMerged(activeChat, n).rnProb < 100);
    if (!can.length) return;
    const pick = can.slice().sort(() => Math.random() - 0.5).slice(0, Math.min(2, can.length));
    pick.forEach((name, i) => _memberReply(activeChat, name, i, !bh.csNormal));
    return;
  }
  let delay, count;
  if (bh.csNormal) {
    const fastest = Math.max(1, Number(bh.rsMin) || 1) * 1000;
    const slowest = Math.max(fastest, Math.max(1, Number(bh.rsMax) || 40) * 1000);
    delay = Math.max(400, fastest + (slowest - fastest) * Math.random());
    count = _ri(Number(bh.replyMin) || 1, Number(bh.replyMax) || 2);
  } else {
    delay = 300 + Math.floor(Math.random() * 700);
    count = 1;
  }
  const plan = _replyPlan(bh, count);
  _pendingAdd(activeChat, true, plan.senders);
  setTimeout(() => {
    _replyBatch(bh, plan, activeChat);   // 等待期间切走：消息照常路由回发起时的会话，内容也照发起时的计划表装配
  }, delay);
}

// 「让对方继续说」的唯一入口＝点聊天页顶部的对方昵称（群聊点群名）。
// 原先输入栏还有一枚 #continueBtn 按钮（bh.csTriggerBar 控制显隐），2026-10-08 用户定档「只要点昵称」，
// 那枚按钮连同它的开关一起撤掉：留两个入口等于让用户猜该点哪个，且输入栏那一排已经够挤。
// csTriggerName 开关保留＝仍可整体关掉这个入口（关掉后昵称不再可点，cursor 也随之撤掉，见 render.js）。
const _headNameBtn = $('#chatHeadName');
if (_headNameBtn) {
  _headNameBtn.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') e.preventDefault(); });  // 防夺焦收起输入法（#017 同款）
  _headNameBtn.addEventListener('click', () => {
    if (!(data.behavior && data.behavior.csTriggerName)) return;
    continueChat();
  });
}

// 消息列表长按事件
const msgList = $('#messageList');
msgList.addEventListener('touchstart', pressDown, { passive: false });
msgList.addEventListener('touchmove', pressUp, { passive: true });
msgList.addEventListener('touchend', pressUp, { passive: true });
// FIX 2026-09-03 #032 系统手势/来电横幅等接管时只来 touchcancel：漏监听会留下 450ms 定时器自发弹框且 pressedMsg 永久卡死（后续长按全失效）
msgList.addEventListener('touchcancel', pressUp, { passive: true });
msgList.addEventListener('mousedown', pressDown);
msgList.addEventListener('mouseup', pressUp);
msgList.addEventListener('mouseleave', pressUp);
msgList.addEventListener('contextmenu', e => {
  const el = e.target.closest('.message');
  if (!el) return;
  // 长按头像应打开拍一拍面板而非消息工具条（与 pressDown 的排除一致，避免双重响应）
  if (e.target.closest('.mini-avatar')) return;
  e.preventDefault();
  openMsgActions(el);
});

// 消息操作工具条：引用/撤回/删除（长按消息后显示在气泡上方，点击其它处收起）
// FIX 滑屏误触拍一拍（Pointer 精确版）：
// 触屏：按下(pointerdown)时目标必须是对方头像、且松开前位移 ≤12px 才算「点头像」，否则（滑动/
// 手指不动但内容滚过指下，按下目标不是头像）一律不弹。鼠标点击走原 click 分支不受影响。
let _pokePress = null;
let _pokeSuppressClick = false;
msgList.addEventListener('pointerdown', e => {
  // 每一发新手势都把「触屏已开过面板」那枚标记清掉：面板浮起来盖住手指时，那一发的兼容 click
  // 落在卡片上（不在消息区里）→ 下面那个分支根本不会执行、标记就一直留着，会把手动鼠标点头像那一下吞成「面板打不开」。
  _pokeSuppressClick = false;
  _pokePress = { type: e.pointerType, av: !!(e.target.closest && e.target.closest('.message:not(.mine) .mini-avatar')), who: e.target.closest && e.target.closest('.message:not(.mine)') ? (e.target.closest('.message').dataset.pokeWho || '') : '', x: e.clientX, y: e.clientY };
});
msgList.addEventListener('pointerup', e => {
  if (!_pokePress) return;
  const moved = Math.hypot(e.clientX - _pokePress.x, e.clientY - _pokePress.y) > 12;
  const touchTap = _pokePress.type === 'touch' && _pokePress.av && !moved;
  const who = _pokePress.who;
  _pokePress = null;
  // 群里点谁拍谁（BUGS #184）：与下面 click 分支同一个口径，两条路径不能一个带名字一个不带
  // ⚠ 触屏这一手还欠浏览器一发兼容 click（面板此刻已浮起来盖住手指），交给面板根吞掉——
  //    不吞的话「只是打开面板」就会当场发出去一条不可撤回的拍一拍（用户「打开拍一拍的面板容易误触直接发送」，BUGS #233）
  if (touchTap) { _pokeSuppressClick = true; pokeSwallowGhostClick(); closeMsgActions(); openPokePanel(who); }
});

msgList.addEventListener('click', async e => {
  // 点来源签 → 跳它该去的那一面（这枚签的全部意义：把「为什么 TA 说了这句」的出口接上）
  // 排在长按工具条分支之前：它是独立动作，不该顺手 closeMsgActions 走掉
  const srcBadge = e.target.closest('.as-badge-src');
  if (srcBadge) {
    closeMsgActions();
    // 「心愿」签 → 心愿页：带上当前会话的 cid（群聊等 openWish 自己回落「全部」）
    if (srcBadge.dataset.srcBadge === 'wish') { if (typeof openWish === 'function') openWish(data.activeChat); return; }
    // 「邀请」签 → 邀请那一页（2026-10-11 撤销 #270 融合：这一册不再住在心愿页里，出口也就分家）
    if (srcBadge.dataset.srcBadge === 'invite') { if (typeof openInvite === 'function') openInvite(); return; }
    // 「印象」签 → 头像昵称页的「印象簿」那一面（BUGS #303：那句看法从前投进聊天里与 TA 的回话长得一模一样，
    // 认不出是「它对着形象簿说的一句」；签把它接回这本账，出口与那行系统小字同落一处）
    if (srcBadge.dataset.srcBadge === 'impress') { if (typeof openAvatarImprLedger === 'function') openAvatarImprLedger(); return; }
    if (typeof showView === 'function') showView('cjian');
    return;
  }
  // 点信箱到站那一行系统小字 → 当场拆那一封（#165：信的内容不进聊天，会话里只留这一行指针）
  const note = e.target.closest('.sys-msg-letter');
  if (note) {
    closeMsgActions();
    if (typeof openLetterByLid === 'function') openLetterByLid(note.dataset.letter);
    return;
  }
  // 点「TA 邀你一起听」那一行 → 跳播放器并把那一张待答卡开出来（BUGS #284，与上面信件指针同一族：会话里只留一行，歌本身不进气泡）
  const pinv = e.target.closest('.sys-msg-player');
  if (pinv) {
    closeMsgActions();
    if (typeof showView === 'function') showView('player');
    if (typeof openPlayerInvite === 'function') openPlayerInvite(pinv.dataset.player);
    return;
  }
  // 点「TA 换了形象」那一行 → 就地翻开这一位名下那一本印象账（BUGS #303·与上面信件指针同一族：
  // 会话里只留一行，整本流水在那本账里；cid 取当前这本＝这条消息正待在的那本，不猜别的会话）
  const avp = e.target.closest('.sys-msg-av');
  if (avp) {
    closeMsgActions();
    if (typeof _avOpenImprPointer === 'function') _avOpenImprPointer(data.activeChat, avp.dataset.avImpr);
    return;
  }
  // 点「TA 发了一条朋友圈」那一行 → 跳朋友圈并把那一条闪一下（BUGS #347：动态不进聊天，会话里只留这一行指针；
  // 出口与提醒簿那一行共用 openMomentById＝不会一处闪、一处不闪地各漂一份）
  const mnote = e.target.closest('.sys-msg-moment');
  if (mnote) {
    closeMsgActions();
    if (typeof showView === 'function') showView('moments');
    if (typeof openMomentById === 'function') openMomentById(mnote.dataset.moment);
    return;
  }
  // 点联系人消息旁的头像 → 打开拍一拍面板（我方右侧小头像不响应，且先收起可能开着的工具条）
  // 群里带一句 sender：点谁拍谁，面板开出来就锁定她（BUGS #184）
  if (e.target.closest('.message:not(.mine) .mini-avatar')) {
    if (_pokeSuppressClick) { _pokeSuppressClick = false; closeMsgActions(); return; }   // 触屏已由 pointerup 打开过
    closeMsgActions();
    openPokePanel(e.target.closest('.message')?.dataset.pokeWho || '');
    return;
  }
  const btn = e.target.closest('.msg-actions [data-act]');
  if (btn) {
    const message = btn.closest('.message');
    const m = data.messages.find(x => String(x.id) === message.dataset.id);
    if (m) {
      if (btn.dataset.act === 'copy') {
        // 复制不碰消息本身：不重画列表（#138 二批——全量重画会把正在翻旧消息的人甩到最底部），也不落库
        toast((await copyTextToClipboard(msgCopyText(m))) ? '已复制' : '复制失败，请手动选择文本复制');
      } else if (btn.dataset.act === 'quote') {
        // FIX 2026-09-03 已撤回的消息不再允许引用（原文属撤回内容，点「查看」可见但不应被带进引用条）
        if (m.recalled) { closeMsgActions(); return; }
        replyTo = m;
        // 引用预览：聊天图片与表情包同存 sticker 字段，有图就画缩略图，不再把「[表情包]」占位符当正文写进这一行
        const cap = (m.text && m.text !== '[表情包]') ? m.text : '';
        _setReplyTarget(m.sticker && !cap ? '回复' : '回复：' + cap, m.sticker || '');
        $('#messageInput').focus();
      } else if (btn.dataset.act === 'recall' && m.from === 'me') {
        m.recalled = true; await save(); resetMessageRender(); renderMessages();
      } else if (btn.dataset.act === 'delete') {
        // 「删除消息」总闸（delMsgOn，出厂关）：渲染侧已经不画这枚钮，这里再判一次——
        // 长按工具条是**留在 DOM 里**的一行旧节点（只切 hidden），开着开关时画过的那几枚不会因为关掉开关而消失，
        // 用户当场关掉设置再点旧气泡仍能删。凡是「开关一关就该立刻失效」的动作，判定都得落在点击这一刻。
        if (!data.delMsgOn) { toast('删除消息在设置里开启后才能用'); closeMsgActions(); return; }
        const idx = data.messages.findIndex(x => String(x.id) === message.dataset.id);
        if (idx > -1) { data.messages.splice(idx, 1); await save(); resetMessageRender(); renderMessages(); }
      } else if (btn.dataset.act === 'collect') {
        if (m.recalled) { toast('已撤回的消息不能收藏'); }
        // 图（聊天图片与表情包同存 m.sticker）与问答卡快照一起带走：以前只抄 m.text，
        // 于是纯图那条存成空串、表情包那条存成「[表情包]」占位符、问问TA 那张卡只剩题面（BUGS #189）
        else if (typeof collectMsg === 'function') collectMsg(m.from === 'me' ? 'out' : 'in', m.text || '',
          { img: m.sticker || '', mid: m.id, ask: typeof _collectAskSnap === 'function' ? _collectAskSnap(m) : undefined });
      } else if (btn.dataset.act === 'wish') {
        // BUGS #166：原来这里直接 wishAdd(原文) 把整条消息原样塞进心愿 —— 点一下就落库，
        // 既不能在添加时改内容，也看不出到底记了哪一句（长消息只能看到被截断的一截）。
        // 现在一律把这条消息当草稿摆进心愿面板：预填原文、带图则作凭证待挂，改完点「存好」才入库。
        const t = (m.text || '').trim();
        const pic = m.sticker || '';   // 聊天图片与表情包同存 sticker 字段，都可作为心愿凭证
        if (m.recalled) { toast('已撤回的消息不能记为心愿'); }
        else if (typeof openWishFromChat === 'function') openWishFromChat(t, pic, data.activeChat);
        else if (t && t !== '[表情包]') { if (typeof wishAdd === 'function') { wishAdd(t, data.activeChat, 'me'); toast('已记入心愿'); } }
        else { toast('这条没法记成心愿'); }
      } else if (btn.dataset.act === 'refer') {
        // 每按一次重掷一档并覆盖：这一枚说的是「你此刻问的这句话」，不是永久身份，不排队也不攒账
        // 只就地换那一条气泡角上的签——全量重画（resetMessageRender(); renderMessages()）会走贴底那一套，
        // 把正在翻旧消息的人甩到最底部（BUGS #138 二批，用户报「点这个功能消息还跳到最新位置」）
        m.refer = rollRefer(); await save(); patchMessageBadges(m);
      } else if (btn.dataset.act === 'meant') {
        // 同一颗签的另一段：问「这一句是不是 TA 自己想发给你的」。与「这句说谁」同口径＝掷一次覆盖，不攒账、不重画列表
        m.meant = rollMeant(); await save(); patchMessageBadges(m);
      } else if (btn.dataset.act === 'chatshot') {
        // 长截图选段：设起点/取消起点/到这条出图，状态机在 js/chat-io.js（一次性手势，零 data 字段）
        if (typeof _chatIoShotTap === 'function') _chatIoShotTap(m, message);
      }
    }
    closeMsgActions();
    return;
  }
  // FIX 2026-09-02 桌面端长按松手会立刻收起工具条：长按触发后松开鼠标产生的 click 落在原消息上，
  // 若不拦截会把刚弹出的框关掉导致点不到按钮——只有点击消息以外区域才收起（点回原消息保持打开）
  if (activeMsg && e.target.closest('.message') === activeMsg) return;
  closeMsgActions();
});
msgList.addEventListener('scroll', closeMsgActions, { passive: true });
// 输入栏上方那条引用预览：文字走 span，图（聊天图片与表情包同存 sticker 字段）另画一枚缩略图
function _setReplyTarget(label, src) {
  const thumb = $('#replyTargetThumb');
  if (thumb) { thumb.hidden = !src; if (src) thumb.src = src; }
  $('#replyTargetText').textContent = label;
  $('#replyTarget').hidden = false;
}
$('#replyCancel').onclick = () => { replyTo = null; $('#replyTarget').hidden = true; };
// 从收藏里回应（collect.js 调用）：TA 收藏的旧话没有消息 id，用合成引用目标（发送链路只读 .text/.sticker）
window.setReplyFromText = function (t) {
  replyTo = { text: String(t || '') };
  _setReplyTarget('回应这句：' + String(t || ''), '');
};

// FIX 2026-09-01 #002 撤回消息「查看/收起」：点气泡或「查看」钮，在消息下方内联展开/收起被撤回的原文（不弹独立窗口），可重复开合
msgList.addEventListener('click', e => {
  const trigger = e.target.closest('.bubble.recalled[data-recalled]');
  if (!trigger) return;
  const message = trigger.closest('.message');
  const body = message && message.querySelector('.recall-peek-inline[data-peek-body]');
  if (!body) return;
  const show = body.hidden;
  body.hidden = !show;
  const btn = message.querySelector('.recall-peek-toggle');
  if (btn) { btn.textContent = show ? '收起' : '查看'; btn.setAttribute('aria-expanded', show ? 'true' : 'false'); }
  closeMsgActions();
});

// 顶层立即读取 data 的语句必须推迟到 init() 加载完成后再执行（否则 data 此时为 undefined 会抛错中断整段脚本）
function syncChatDraftToInput(){ $('#messageInput').value = data.chatDraft || ''; }
let _chatDraftTimer = null;
$('#messageInput').addEventListener('input', () => {
  data.chatDraft = $('#messageInput').value;
  clearTimeout(_chatDraftTimer);
  _chatDraftTimer = setTimeout(save, 500);
});

const _scrollBtn = $('#scrollBottomBtn');
// 回车键发送开关：设置里关闭后，拦截输入框回车（表单隐式提交），回车不再发送消息
$('#messageInput').addEventListener('keydown', e => {
  // #412 回车发送：原走 <form> 隐式提交，去 form 化后显式触发；isComposing/229＝输入法选字回车豁免
  if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
  if (!(data.behavior && data.behavior.enterSend)) { e.preventDefault(); return; }
  e.preventDefault();
  _composerSend();
});
// FIX 2026-10-12 #316 分页的下一帧执行器（与 scroll 监听里那段注释同一处根因）
let _scrollPagePending = false, _scrollPageAt = 0;
function _flushScrollPage() {
  _scrollPagePending = false;
  if (msgList.scrollTop <= 60) loadEarlierMessages();          // 滚到接近顶部 → 加载更早一页历史
  else if (inLocateMode() && (msgList.scrollHeight - msgList.scrollTop - msgList.clientHeight) < 120) loadLaterMessages(); // 搜索定位窗口滚到底 → 往后翻一页，追平最新后恢复常规
}
msgList.addEventListener('scroll', () => {
  const dist = msgList.scrollHeight - msgList.scrollTop - msgList.clientHeight;
  _scrollBtn.hidden = !(dist > 400);
  // 贴底意图锁：用户主动上翻阅读时解除跟随（此时新消息只亮回底按钮，不抢视口）；
  // 回到底部重新锁定。中间地带保持原状，避免发送瞬间的惯性滚动误判成「想读历史」。
  syncStickIntent();
  // FIX 2026-10-12 #316 上翻/下翻分页移出 scroll 同步路径：惯性滚动中在 passive 滚动回调里同步
  // 插 200 个 DOM 节点会阻塞主线程（合成器的滚动位置与 JS 侧 stale，恢复后可见一次跳变），
  // 补偿时序也要和 js/render.js 的锚点补位串好。改为只置标志、下一帧执行，300ms 内不重复触发。
  // syncStickIntent() 与回底按钮读数保持同步执行不动（#050 哨兵：该监听必须同步贴底意图且不得改非 passive）。
  if (_scrollPagePending || Date.now() - _scrollPageAt < 300) return;
  if (msgList.scrollTop <= 60 || (inLocateMode() && dist < 120)) {
    _scrollPagePending = true;
    _scrollPageAt = Date.now();
    requestAnimationFrame(_flushScrollPage);
  }
}, { passive: true });
_scrollBtn.onclick = () => {
  if (inLocateMode()) { jumpToLatest(); return; }   // 在历史定位窗口点回底 → 直接回到最新对话
  // 走 scrollChatToBottom 而不是裸赋值：表情包等懒加载图在贴底之后才撑高列表，
  // 裸赋值只钉那一帧的高度，用户点完回底仍差一截（用户报「点回底也贴不准」）。
  scrollChatToBottom();
  _scrollBtn.hidden = true;
};

// 发送消息表单：文字 + 已插入的图片/表情包（_attachSrc）同一气泡发送
let _attachSrc = '';
let _attachBig = false;   // 待发送这一张的身份：true＝图片大档，false＝表情包小档（BUGS #157）
function _setAttach(src, big) {
  _attachSrc = src || '';
  _attachBig = _attachSrc ? !!big : false;
  const box = $('#composerAttach');
  if (!box) return;
  if (_attachSrc) {
    const thumb = $('#attachThumb');
    if (thumb) thumb.src = _attachSrc;
    box.hidden = false;
    $('#messageInput').focus();
  } else {
    box.hidden = true;
  }
}
$('#attachRemove').onclick = () => _setAttach('');
// FIX 2026-09-02 #017 手机端点发送按钮后输入法自动收起：阻止按钮 pointerdown 夺走输入框焦点，键盘保持弹出
$('#composer .send-btn').addEventListener('pointerdown', e => e.preventDefault());
// #412 输入栏去 form 化：Chrome 手机版对「文档里存在 <form>」的页面整体挂自动填充附件条
// （键盘上方那条 🔑💳📍 白条），SPA 所有输入框跟着中招。composer 由 <form> 改 <div> 后，
// submit 事件不再存在，发送改由「点发送钮」＋「输入框回车（enterSend 开时）」两条路径显式触发。
// isComposing/229 守卫＝输入法选字回车不发送（原 form 隐式提交自带该豁免，去 form 后须自己补）。
async function _composerSend() {
  const input = $('#messageInput'), text = input.value.trim();
  if (!text && !_attachSrc) return;
  const msg = { id: nextId(), from: 'me', text, time: time(), date: new Date().toLocaleDateString('zh-CN') };
  if (_attachSrc) { msg.sticker = _attachSrc; if (_attachBig) msg.imgKind = 'image'; }
  if (replyTo) {
    msg.quote = replyTo.sticker ? '[表情包]' : replyTo.text;
    if (replyTo.sticker) msg.quoteImgId = replyTo.id;   // 引用图片：存原消息 id，渲染时取图，避免复制整张 base64
  }
  const sentFromChat = data.activeChat;   // 同步捕获：await save 期间切走会话，回复仍归属发送时的会话与联系人
  data.messages.push(msg);
  if (msg.from === 'me' && typeof maybeCollectByTa === 'function') { const _cs = data.collectSettings || {}; maybeCollectByTa({ kind: 'msg', side: 'out', text: msg.text || '', imgs: msg.sticker ? [msg.sticker] : [], mid: msg.id }, _cs.taMsgProb, sentFromChat); }
  if (typeof _cjEvent === 'function') _cjEvent(sentFromChat, 'meSent');   // 世界感知事件钩子：你刚说了话
  notifyMyMessage();
  input.value = '';
  _atClose();
  data.chatDraft = '';
  _setAttach('');
  replyTo = null;
  $('#replyTarget').hidden = true;
  await save();
  _animateNextRender = true;   // 空会话首条等重建路径也要播入场动画
  // 发消息前先强制打开贴底意图锁：即使用户发送前正翻着历史，发送这条也必须滚到底看到自己发出去的字。
  // 放在 renderMessages 之前，renderMessages 里的 isChatAtBottom() 才读得到 true。
  scrollChatToBottom();
  if (inLocateMode()) jumpToLatest(); else renderMessages();   // 正停留在搜索定位的历史窗口时发消息 → 自动回到最新对话
  input.focus();   // #017 发送后保持输入框焦点，手机上输入法不收起
  // 键盘弹起会把可视区压矮（visualViewport 变小的每一帧都在改 clientHeight），贴底循环可能
  // 恰好在键盘动画中途就收工了。焦点落在输入框时再多跑一轮稳定循环，确保键盘完全弹起后仍然贴底。
  requestAnimationFrame(() => {
    if (window.inputFocused(input)) scrollChatToBottom();   // ⚠ inputFocused：Android 焦点在 ce-box 上（#418）
  });
  partnerReply(sentFromChat, text);
}
$('#composer .send-btn').addEventListener('click', () => _composerSend());

// ===== 批量发送（FR 2026-10-11，复刻自家 mochi v3.11.x 同名功能）=====
// TA 的设置 → 回复节奏「批量发送」开关（每联系人独立，默认关）打开后，输入栏显示「批量发送」钮。
// 面板里逐项添加文字 / 表情包 / 图片（每一项就是一条消息，清单可删可清空、头部实时计数），
// 点「发送全部」按顺序逐条入账、整批只发起一次回复（TA 等这批说完才回）、toast 报数。
// 切会话清空未发送的清单（未发送内容不跨会话带）；引用挂第一条（回的是触发这批的那句话）。
let batchItems = [];   // [{type:'text',text}|{type:'sticker',src}|{type:'img',src}]
function _batchEnabled() { return !!(data.behavior && data.behavior.batchSend); }
function _syncBatchBtn() {
  const b = $('#batchBtn');
  if (!b) return;
  const on = !!(data && data.behavior && data.behavior.batchSend);   // data 在 app.js 异步 init 才就位：加载期按关处理（出厂本就是暗的），init 后由切会话/保存链再刷
  b.style.display = on ? '' : 'none';
  if (!on) _closeBatch();   // 开关关掉＝面板也一并收起（mochi syncBatchBtn 同款）
}
function _openBatch() {
  const mask = $('#batchMsgMask'); if (!mask) return;
  if (typeof closeStickerDrawer === 'function') closeStickerDrawer();   // 与表情包抽屉互斥（mochi 同款）
  _renderBatchList();
  mask.hidden = false;
  setTimeout(() => { try { const i = $('#batchMsgText'); if (i) i.focus(); } catch (e) {} }, 60);   // 等这一帧排完再要键盘（加字卡同款）
}
function _closeBatch() { const m = $('#batchMsgMask'); if (m) m.hidden = true; }
function _renderBatchList() {
  const list = $('#batchMsgList'), cnt = $('#batchMsgCount');
  if (!list) return;
  if (cnt) cnt.textContent = batchItems.length + ' 条';
  if (!batchItems.length) { list.innerHTML = '<div class="batch-empty">还没有要发送的消息<br>可添加文字 / 表情包 / 图片</div>'; return; }
  list.innerHTML = batchItems.map((it, i) => {
    const body = it.type === 'text'
      ? '<span class="batch-item-text"></span>'
      : '<img class="batch-item-media" alt="' + (it.type === 'sticker' ? '表情包' : '图片') + '">';
    const ty = it.type === 'text' ? '文字' : (it.type === 'sticker' ? '表情包' : '图片');
    return '<div class="batch-item"><span class="batch-item-idx">' + (i + 1) + '</span>' + body + '<span class="batch-item-type">' + ty + '</span><button type="button" class="batch-item-x" data-bx="' + i + '" aria-label="删除">×</button></div>';
  }).join('');
  // 文本用 textContent 回填（防注入），图用 src——inner模板只搭骨架
  batchItems.forEach((it, i) => {
    if (it.type === 'text') { const t = list.querySelectorAll('.batch-item-text')[i]; if (t) t.textContent = it.text; }
    else { const im = list.querySelectorAll('.batch-item-media')[i]; if (im) im.src = it.src; }
  });
}
function _batchAddText() {
  const inp = $('#batchMsgText');
  const v = inp ? (inp.value || '').trim() : '';
  if (!v) { showToast('请输入文字'); return; }
  batchItems.push({ type: 'text', text: v });
  if (inp) inp.value = '';
  _renderBatchList();
}
function _batchPickSticker(src, kind) { batchItems.push({ type: kind ? 'img' : 'sticker', src: src }); _renderBatchList(); }
function _batchAddImages(files) {
  (files || []).forEach(f => {
    fileData(f, 1080).then(src => {
      if (src) { batchItems.push({ type: 'img', src: src }); _renderBatchList(); }
      else showToast('这张图片没能读出来，换一张试试');
    }).catch(() => showToast('这张图片没能读出来，换一张试试'));
  });
}
async function _sendBatchItems(items) {
  const sentFromChat = data.activeChat;
  const _bch = data.chats && data.chats[sentFromChat];
  const bstream = (_bch && Array.isArray(_bch.msgs)) ? _bch.msgs : data.messages;
  const btoday = new Date().toLocaleDateString('zh-CN');
  const bmsgs = items.map((it, i) => {
    const m = { id: nextId(), from: 'me', time: time(), date: btoday };
    if (it.type === 'text') m.text = it.text;
    else { m.text = ''; m.sticker = it.src; if (it.type === 'img') m.imgKind = 'image'; }   // 纯表情包/图片气泡与 sendStickerSrc 同形（text 空）
    if (i === 0 && replyTo) {
      m.quote = replyTo.sticker ? '[表情包]' : replyTo.text;
      if (replyTo.sticker) m.quoteImgId = replyTo.id;   // 引用图片：存原消息 id，渲染时取图，避免复制整张 base64
    }
    return m;
  });
  _setAttach('');
  replyTo = null;
  $('#replyTarget').hidden = true;
  for (let i = 0; i < bmsgs.length; i++) {
    const blive = bstream === data.messages;   // 现场判断：中途切走就只落库，不抢当前画面
    bstream.push(bmsgs[i]);
    if (bmsgs[i].from === 'me' && typeof maybeCollectByTa === 'function') { const _cs = data.collectSettings || {}; maybeCollectByTa({ kind: 'msg', side: 'out', text: bmsgs[i].text || '', imgs: bmsgs[i].sticker ? [bmsgs[i].sticker] : [], mid: bmsgs[i].id }, _cs.taMsgProb, sentFromChat); }
    if (i === 0) notifyMyMessage();   // 一批只响一声，不机关枪
    save();
    if (blive) { _animateNextRender = true; scrollChatToBottom(); renderMessages(); }
    if (i < bmsgs.length - 1) await new Promise(r => setTimeout(r, 120));   // 同一动作连推多条，只留一拍落屏，不刻意演打字
  }
  if (bstream !== data.messages && typeof renderChatsList === 'function') { try { renderChatsList(); } catch (e) {} }
  showToast('已批量发送 ' + bmsgs.length + ' 条消息');
  // @提到检测吃全部几条（拼回一段传给回复链），整批只发起这一次回复
  partnerReply(sentFromChat, items.map(it => it.type === 'text' ? it.text : (it.type === 'img' ? '[图片]' : '[表情包]')).join('，'));
}
function _sendBatchAll() {
  if (!batchItems.length) { showToast('还没有要发送的消息'); return; }
  const items = batchItems.slice();
  batchItems = [];
  _renderBatchList();
  _closeBatch();
  _sendBatchItems(items);
}
function _batchReset() { batchItems = []; _renderBatchList(); _syncBatchBtn(); }   // 切会话＝未发送清单不跨会话带（mochi contact-switched 同款）
$('#batchBtn').onclick = () => _openBatch();
$('#batchMsgClose').onclick = () => _closeBatch();
$('#batchMsgTextAdd').onclick = () => _batchAddText();
$('#batchMsgText').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); _batchAddText(); } });
$('#batchMsgClear').onclick = () => { batchItems = []; _renderBatchList(); };
$('#batchMsgSendAll').onclick = () => _sendBatchAll();
$('#batchMsgList').addEventListener('click', e => {
  const x = e.target.closest ? e.target.closest('[data-bx]') : null;
  if (x) { batchItems.splice(Number(x.dataset.bx), 1); _renderBatchList(); }   // 清单里的 ✕：删那一条
});
$('#batchMsgImg').onclick = () => $('#batchMsgImgInput').click();
$('#batchMsgImgInput').onchange = e => {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  if (files.length) _batchAddImages(files);
};
// 「插入表情包」：收起本面板 → 打开表情包抽屉的「为批量挑一张」模式（stickers.js 认 __batchPickSticker）；
// 挑完自动回到批量面板继续加/发（mochi openEmojiPanelForInsert 同款往返）。挑一半不挑了＝收抽屉即清钩子
$('#batchMsgEmoji').onclick = () => {
  _closeBatch();
  window.__batchPickSticker = (src, kind) => {
    window.__batchPickSticker = null;
    _batchPickSticker(src, kind);
    _openBatch();
  };
  openStickerDrawer();
};
_syncBatchBtn();

// 表情包面板与拍一拍面板已迁至 js/stickers.js（移植自家 mochi 三 tab + 分类 + 分组 + 批量管理）
$('#messageList').addEventListener('pointerdown', (e) => {
  if ($('#stickerDrawer').classList.contains('open') && !$('#stickerDrawer').contains(e.target)) {
    // 走 closeStickerDrawer 而不是只摘 class（BUGS #175）：面板浮层化后 #chatView 上挂了 data-panel、
    // --composer-h 也写在那儿，只摘 class 会把「回到底部」浮钮永久藏掉（chat.css 有 #chatView[data-panel] 那道门）
    if (typeof closeStickerDrawer === 'function') closeStickerDrawer();
    else $('#stickerDrawer').classList.remove('open');
  }
  // ⚠ inputFocused：Android 上输入框是 ce-box，焦点不在原 input 上（#418）；
  //    收焦点仍然收在「真正持焦的那一枚」上——box 才是能 blur 的那个。
  if (e.target === $('#messageList') && window.inputFocused($('#messageInput'))) {
    const ae = document.activeElement;
    if (ae && typeof ae.blur === 'function') ae.blur();
  }
}, { passive: true });

// 聊天插入图片：输入栏右侧图片按钮 → 选图压缩 → 插入输入栏（可配文字同气泡发送）
$('#chatImageBtn').onclick = () => $('#chatImageInput').click();
$('#chatImageInput').onchange = async e => {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  if (!files.length) return;
  const src = await fileData(files[files.length - 1], 1080);
  if (src) _setAttach(src, true);   // 从相册传的图＝图片大档（不是表情包）
};

// ===== 主动拍一拍（点联系人头像打开底部面板，双 tab：联系人昵称的拍一拍 / 我的拍一拍，取自字卡库「拍一拍」分类分组） =====
// 与「对方已读不回」同款居中系统提示，不计入可撤回消息
function _pokeSys(text) {
  const msg = { id: nextId(), from: 'system', text, time: time(), date: new Date().toLocaleDateString('zh-CN') };
  data.messages.push(msg);
  save();
  _animateNextRender = true;
  renderMessages();
}
// 拍一拍面板已迁至 js/stickers.js（移植自家 mochi：三 tab + 分组 chips + 预设组 + 存入/发送）

