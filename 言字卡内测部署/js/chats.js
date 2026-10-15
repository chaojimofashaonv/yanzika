// ===== 会话列表：多联系人 + 群聊 =====
// 数据模型：data.contacts = [{id,name,avatar,kind:'single'|'group',members:[]}]；
// data.chats[id] = { msgs:[], unread, draft }；data.messages 恒为 data.chats[data.activeChat].msgs
// 的同一数组引用（db.ensureData 保证），聊天/搜索/统计等模块照常读写当前流即可。

function currentContact() {
  return (data.contacts || []).find(c => c.id === data.activeChat) || null;
}

// 回复设置按联系人隔离：data.behavior 恒为 chatSettings[activeChat] 的同一引用（db.ensureData 建立），
// 切换会话时把 behavior 换绑到目标联系人的那份；新联系人没有存档时以当前设置播种一份作起点
function _applyContactBehavior(id) {
  if (!id) return;
  if (!data.chatSettings || typeof data.chatSettings !== 'object') data.chatSettings = {};
  if (!data.chatSettings[id] || typeof data.chatSettings[id] !== 'object') {
    data.chatSettings[id] = JSON.parse(JSON.stringify(data.behavior || defaults.behavior));
  }
  data.behavior = data.chatSettings[id];
}

function _isGroupChat() {
  const c = currentContact();
  return !!(c && c.kind === 'group');
}

// 群聊里随机挑一个成员作为本条回复的发言人。
// 按档挑：被设成「从不说话」（不回概率 100%）的那位不该再冒出来；全体都不说话时回 null，
// 调用方要么不发（主动发送），要么自己按位各掷（被动回复走 _groupRoundWho，不经这里）
function _groupSender(chatId) {
  const c = chatId ? (data.contacts || []).find(x => x.id === chatId) : currentContact();
  if (!c || c.kind !== 'group' || !(c.members || []).length) return null;
  const can = c.members.filter(n => _gbhMerged(c.id, n).rnProb < 100);
  if (!can.length) return null;
  return can[Math.floor(Math.random() * can.length)];
}

// ===== 群聊档位：群一份（chatSettings[群id]）＋ 每位成员在本群里的一份 =====
// 覆盖格与 behavior 完全同名（rnProb/rsMin/rsMax/replyMin/replyMax）——不新造「开口概率」这个概念：
// 「这一位开不开口」＝各掷一次自己的 !rnProb，与单聊同一把尺子；没存的那格跟随群档。
// 键用名字而非 id：群名单本身存的就是名字（建群那步 .map(c => c.name)），那位被删了档还在，
// 与「群里仍会署这名」的既有口径同形，不留第二套身份映射。
// 落点是 data.groupBh 这个顶层字段（js/utils.js 的 defaults 已登记，清洗在下面的 _gbhSanitize，
// 由 db.ensureData 在 contacts 定型之后调用）。旧注释里那句「还没进 defaults」随 10-06 交棒作废。
const GBH_KEYS = ['rnProb', 'rsMin', 'rsMax', 'replyMin', 'replyMax'];
const GBH_RANGE = { rnProb: [0, 100], rsMin: [1, 3600], rsMax: [1, 3600], replyMin: [1, 10], replyMax: [1, 10] };

function _gbhBook() {
  if (!data.groupBh || typeof data.groupBh !== 'object') data.groupBh = {};
  return data.groupBh;
}
function _gbhGroup(chatId) {
  const b = (data.chatSettings || {})[chatId];
  return (b && typeof b === 'object') ? b : defaults.behavior;
}
// 该位在本群里存过的那几格；没存过回 null（UI 靠它分「跟随群里／单独设」两态，不拿默认值冒充）
function _gbhPatch(chatId, name) {
  const g = _gbhBook()[chatId];
  const p = g && g.bh && g.bh[name];
  return (p && typeof p === 'object') ? p : null;
}
function _gbhMerged(chatId, name) {
  // 整份群档先铺底，再只覆盖那五格：表情/拍一拍/引用/拼句/撤回这些概率不在 GBH_KEYS 里，
  // 若只返回五格对象，群聊回话就永远抽不出表情包与拍一拍（E1 那条反向对照就是这么抓出来的）
  const base = _gbhGroup(chatId), p = _gbhPatch(chatId, name) || {}, out = Object.assign({}, base);
  for (const k of GBH_KEYS) {
    const v = (typeof p[k] === 'number' && isFinite(p[k])) ? p[k] : base[k];
    out[k] = (typeof v === 'number' && isFinite(v)) ? v : defaults.behavior[k];
  }
  // 区间配平只在这一处做：她可能只存了区间的一头，另一头跟随群档，两者拼起来才谈得上倒挂
  out.rsMax = Math.max(out.rsMax, out.rsMin);
  out.replyMax = Math.max(out.replyMax, out.replyMin);
  return out;
}
function _gbhSet(chatId, name, key, val) {
  if (GBH_KEYS.indexOf(key) < 0 || !name) return;
  const book = _gbhBook();
  const g = book[chatId] || (book[chatId] = { bh: {} });
  if (!g.bh || typeof g.bh !== 'object') g.bh = {};
  const p = g.bh[name] || (g.bh[name] = {});
  const lim = GBH_RANGE[key];
  let v = Math.round(Number(val));
  if (!isFinite(v)) v = defaults.behavior[key];
  p[key] = Math.max(lim[0], Math.min(lim[1], v));
}
// 整位回到「跟随群里」：删掉那一本，不留空对象（留着会让 UI 把「存过但全空」误读成单独设）
function _gbhFollow(chatId, name) {
  const g = _gbhBook()[chatId];
  if (g && g.bh && g.bh[name]) delete g.bh[name];
}

// 「偶尔自己聊天」那一族已于 2026-10-09 整组退役（BUGS #216）：按群那条钟与它的参数
// （旧 GBA_DEF／GBA_LIM／_gbhAmb／_gbhAmbSet 四件）一起撤，群里那句话只由每位自己的主动发送钟
// 落到群（js/chat.js 的 _asTargetOf）。旧档里那本 amb 由下面的 _gbhSanitize 清掉，不留惰性键。
// 存档清洗：只认现存群、只认还在名单里的人、只认这几格且夹回区间。
// 人已移出群却留着档＝没人会再读到它，留着比删掉更容易在下次加回来时冒充「你以前设过的」。
function _gbhSanitize(book, contacts) {
  if (!book || typeof book !== 'object' || Array.isArray(book)) return {};
  const lim = { rnProb: [0, 100], rsMin: [1, 3600], rsMax: [1, 3600], replyMin: [1, 10], replyMax: [1, 10] };
  const keep = (v, l) => (typeof v === 'number' && isFinite(v)) ? Math.max(l[0], Math.min(l[1], Math.round(v))) : null;
  for (const gid of Object.keys(book)) {
    const g = (contacts || []).find(c => c && c.id === gid && c.kind === 'group');
    const e = book[gid];
    if (!g || !e || typeof e !== 'object' || Array.isArray(e)) { delete book[gid]; continue; }
    if (e.bh && typeof e.bh === 'object' && !Array.isArray(e.bh)) {
      for (const nm of Object.keys(e.bh)) {
        const p = e.bh[nm];
        if (!p || typeof p !== 'object' || (g.members || []).indexOf(nm) < 0) { delete e.bh[nm]; continue; }
        for (const k of Object.keys(p)) {
          const v = lim[k] ? keep(p[k], lim[k]) : null;
          if (v === null) delete p[k]; else p[k] = v;
        }
        if (!Object.keys(p).length) delete e.bh[nm];
      }
      if (!Object.keys(e.bh).length) delete e.bh;
    } else delete e.bh;
    // 「偶尔自己聊天」那一本随整族退役（BUGS #216）：读方与写方都没了，留着＝备份里躺着一组没人读的键
    if (e.amb) delete e.amb;
    if (!e.bh) delete book[gid];
  }
  return book;
}

// 群成员/无头像联系人的头像：无头像一律用默认矢量人形图（2026-10-13 第六轮：人形改 --muted 墨色）；
// lookup=true 时同名单聊联系人带真实头像则直接用
// extra：会话行的未读角标要挂进头像容器内（方案C：角标贴在头像右上角）
function _memberAvatarHTML(name, cls, lookup, extra) {
  const tag = cls === 'mini-avatar' ? 'div' : 'span';
  if (lookup) {
    const c = (data.contacts || []).find(x => x.kind !== 'group' && x.name === name && x.avatar);
    if (c) return `<${tag} class="${cls}">${avatarHTML(c.avatar)}${extra || ''}</${tag}>`;
  }
  return `<${tag} class="${cls}">${avatarHTML('')}${extra || ''}</${tag}>`;
}

function _lastTs(c) {
  const ch = (data.chats && data.chats[c.id]) || {};
  const msgs = ch.msgs || [];
  const m = msgs[msgs.length - 1];
  if (!m) return 0;
  const t = new Date(`${m.date || ''} ${m.time || ''}`).getTime();
  return isFinite(t) ? t : 0;
}

function _chatPreview(c, msgs) {
  const m = msgs[msgs.length - 1];
  if (!m) return { text: '开始聊天吧', time: '' };
  let text = m.text || '';
  if (m.recalled) text = '撤回了一条消息';
  else if (m.sticker) text = (m.text && m.text !== '[表情包]') ? m.text : '[表情包]';
  else if (m.ask) text = '[问问TA]';
  else if (m.game) text = m.game.kind === 'catcard' ? '[信已送到]' : (m.game.kind === 'challenge' ? `[游戏挑战 · ${m.game.ta || ''}]` : (m.game.kind === 'coop' ? `[一起合成 · ${m.game.game === 'g2048' ? (m.game.tier || 0) : ((G_FRUITS[m.game.tier] || {}).n || '水果')}]` : `[游戏战绩 · ${m.game.score || 0}]`));
  else if (!text && m.quote) text = `[引用] ${m.quote}`;
  let prefix = '';
  if (c.kind === 'group') prefix = m.from === 'me' ? '我：' : `${m.sender || '成员'}：`;
  else if (m.from === 'me') prefix = '我：';
  const today = new Date().toLocaleDateString('zh-CN');
  const time = m.date === today ? (m.time || '') : String(m.date || '').replace(/^\d{4}\//, '');
  return { text: prefix + text, time };
}

function _greetWords() {
  const h = new Date().getHours();
  return h < 12 ? '早上好' : (h < 18 ? '下午好' : '晚上好');
}

// 今日句数＝所有会话里日期等于今天的双向消息（TA 说的与我说的都算，同 ui1 那句「和 TA 说了 N 句话」）；
// 判据与 _chatPreview 那行时间戳用同一个 toLocaleDateString('zh-CN')——两处各算一遍「今天」必漂
function _todayMsgCount() {
  const today = new Date().toLocaleDateString('zh-CN');
  const chats = (data && data.chats) || {};
  let n = 0;
  Object.keys(chats).forEach(id => {
    const msgs = (chats[id] && chats[id].msgs) || [];
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (m.date === today && !m.recalled && (m.text || m.sticker || m.ask || m.game)) n++;
    }
  });
  return n;
}

function renderChatsList() {
  const list = $('#chatsList');
  if (!list) return;
  const _now = new Date(); const gd = $('#greetDate');
  if (gd) gd.textContent = `${_now.getMonth() + 1}月 周${'日一二三四五六'[_now.getDay()]}`; const gday = $('#greetDay'); if (gday) gday.textContent = _now.getDate();
  const ghi = $('#greetHi'); if (ghi) ghi.textContent = _greetWords();
  const gtd = $('#greetToday');
  if (gtd) { const n = _todayMsgCount(); gtd.textContent = n > 0 ? `今天也和 TA 说了 ${n} 句话` : '今天还没说上话'; }
  const all = (data.contacts || []).slice().sort((a, b) => _lastTs(b) - _lastTs(a));
  const pin = all.filter(c => c.pin && !c.archived);
  const norm = all.filter(c => !c.pin && !c.archived);
  const arch = all.filter(c => c.archived);
  const rowHTML = c => {
    const ch = (data.chats && data.chats[c.id]) || {};
    const msgs = ch.msgs || [];
    const pv = _chatPreview(c, msgs);
    const badge = ch.unread > 0 ? `<span class="unread-badge chat-row-badge">${ch.unread > 99 ? '99+' : ch.unread}</span>` : '';
    // 「主动消息已关」那一枚小签（js/silent.js 那道闸）：屏上先看得见谁不再主动说话，不必进那一页猜
    const silentTag = (typeof chatSilentOn === 'function' && chatSilentOn(c.id))
      ? '<span class="chat-row-silent" title="主动消息已关：TA 不会主动发来新消息">静音</span>' : '';
    const av = c.kind === 'group'
      ? `<span class="avatar chat-row-avatar">${groupAvatarHTML(c)}</span>`
      : `<span class="avatar chat-row-avatar">${avatarHTML(chatAvatarOf(c))}</span>`;
    return `<div class="chat-row${c.pin ? ' chat-row-pinned' : ''}${c.archived ? ' chat-row-archived' : ''}" data-chat="${escapeHTML(c.id)}">${av}<div class="chat-row-main"><div class="chat-row-top"><b>${escapeHTML(chatNameOf(c))}</b>${c.pin ? '<span class="chat-pin-tag">置顶</span>' : ''}${silentTag}<span class="chat-row-time">${escapeHTML(pv.time)}</span></div><div class="chat-row-preview">${escapeHTML(pv.text)}</div></div>${badge}</div>`;
  };
  list.innerHTML = pin.map(rowHTML).join('') + norm.map(rowHTML).join('')
    + (arch.length ? `<div class="chat-arch-toggle" id="chatArchToggle">${_chatArchOpen ? '▾' : '▸'} 已归档 · ${arch.length}</div><div class="chat-arch-list"${_chatArchOpen ? '' : ' hidden'}>${arch.map(rowHTML).join('')}</div>` : '');
  const toggle = document.getElementById('chatArchToggle');
  if (toggle) toggle.addEventListener('click', () => { _chatArchOpen = !_chatArchOpen; renderChatsList(); });
  const empty = $('#chatsEmpty');
  if (empty) empty.hidden = (pin.length + norm.length) > 0;
}
let _chatArchOpen = false;

// stay=true：设置页内切换编辑对象——只换绑会话流与回复设置，不跳转、不动草稿与未读
function switchChat(id, stay) {
  if (!data.chats[id]) return;
  // 打开这个会话＝它的消息已经看得见，属于它的横幅当场收起，不再压着对话挂满 6 秒（BUGS #028）
  // stay=设置页内切换编辑对象（没进会话）不收；点横幅直达也走这里，横幅本体已由点击处理收起，此处幂等
  if (!stay && typeof deskPopDismissChat === 'function') deskPopDismissChat(id);
  // 打开会话一律定位到最新（BUGS #014）：启动首屏的渲染发生在 display:none 的容器里，
  // 那次 scrollChatToBottom 是空操作，列表带着 scrollTop=0 被显示，进来就落在最旧一条。
  // showView 里也有一份同样的钩子（覆盖通知冷启动/弹窗横幅等不经 switchChat 的入口），两者幂等不冲突；
  // 若日后 showView 那份被移除，这里仍能独立兜住「从会话列表进聊天」这条主路径。
  if (id === data.activeChat) { if (!stay) { showView('chat'); enterChatAtLatest(); } return; }
  if (!stay && data.activeChat && data.chats[data.activeChat]) {
    data.chats[data.activeChat].draft = data.chatDraft || $('#messageInput').value || '';
  }
  data.activeChat = id;
  data.messages = data.chats[id].msgs;
  _applyContactBehavior(id);   // 回复设置跟随联系人切换（渲染回显在回到设置页时由 showView 刷新）
  if (typeof _batchReset === 'function') _batchReset();   // 切会话＝批量发送清单清空、按钮显隐跟随这一位的开关（mochi contact-switched 同款）
  if (typeof _typingTick === 'function') _typingTick();   // 「正在想怎么回你」只认本会话自己的在途：切过来没在途就收起，切走那封仍挂在它自己名下（BUGS #088）
  if (typeof updateCjChip === 'function') updateCjChip();   // 世界感知小字跟随会话切换（群聊＝不显示，不等 20s 定时器）
  if (typeof applyAppearance === 'function') applyAppearance();   // 会话外观（气泡/背景等）跟随联系人切换
  if (stay) { save(); return; }
  data.chatDraft = data.chats[id].draft || '';
  data.chats[id].unread = 0;
  save();
  syncChatDraftToInput();
  showView('chat');
  requestAnimationFrame(() => { renderMessages(); enterChatAtLatest(); });
}

// ===== 添加联系人 / 创建群聊 =====
let _chatFormMode = 'single';
let _chatFormPicked = new Set();   // 建群时勾选的联系人 id（成员落库仍存名字，兼容旧渲染/统计）

function _openSheet() {
  $('#addChatMask').hidden = false;
  $('#addChatSheet').hidden = false;
}
function _closeSheet() {
  $('#addChatMask').hidden = true;
  $('#addChatSheet').hidden = true;
}
function _openChatForm(mode) {
  _chatFormMode = mode;
  _closeSheet();
  $('#chatFormTitle').textContent = mode === 'group' ? '创建群聊' : '添加联系人';
  $('#chatFormName').value = '';
  $('#chatFormName').placeholder = mode === 'group' ? '群名称' : '给 TA 起个名字';
  // 固定昵称那一格每次开都是空的（#346：留空＝跟随上面这个名字，见表单里那句说明）
  const _fx = $('#chatFormFixed');
  if (_fx) { _fx.value = ''; _fx.placeholder = mode === 'group' ? '群名称（其他功能用）· 留空＝同上' : '其他功能里的名字 · 留空＝同上'; }
  $('#chatFormMembersRow').hidden = mode !== 'group';
  if (mode === 'group') { _chatFormPicked = new Set(); _renderMemberPicker(); }
  $('#chatFormMask').hidden = false;
  setTimeout(() => $('#chatFormName').focus(), 60);
}

// 建群成员选择器：列出已有联系人（单聊），点行勾选/取消
function _renderMemberPicker() {
  const list = $('#chatFormMemberList');
  if (!list) return;
  const empty = $('#chatFormMemberEmpty');
  const cs = (data.contacts || []).filter(c => c.kind !== 'group');
  if (empty) empty.hidden = cs.length > 0;
  list.innerHTML = cs.map(c => `<div class="member-pick${_chatFormPicked.has(c.id) ? ' on' : ''}" data-pick="${escapeHTML(c.id)}"><span class="avatar member-pick-avatar">${avatarHTML(c.avatar, (c.name || '?').charAt(0))}</span><span class="member-pick-name">${escapeHTML(c.name)}</span><span class="member-pick-check" aria-hidden="true"></span></div>`).join('');
}
function _closeChatForm() {
  $('#chatFormMask').hidden = true;
}

function _submitChatForm() {
  const name = $('#chatFormName').value.trim();
  if (!name) { showToast(_chatFormMode === 'group' ? '先给群起个名字' : '先起个名字'); return; }
  // 固定昵称（#346）：聊天以外的功能（字卡库/信箱/世界感知/…）读这一格，与「头像昵称」里换的
  // 聊天昵称分开——那口池子可能换得勤，其他功能的牌子不跟着翻。留空＝跟随上面这个名字。
  const fixed = $('#chatFormFixed').value.trim();
  // 形状与 db.js 归一枚对齐（chatName/chatAvatar/myChatName/myChatAvatar 都落空串）：
  // 缺键的后果是 chatNameOf 读到 undefined——取值时 || 兜得住，但「有没有单独设过」这类判断会看花眼
  const contact = { id: 'c' + Date.now().toString(36), name, fixedName: fixed, avatar: '', chatName: '', chatAvatar: '', myChatName: '', myChatAvatar: '', kind: _chatFormMode === 'group' ? 'group' : 'single', members: [] };
  if (_chatFormMode === 'group') {
    const members = (data.contacts || []).filter(c => _chatFormPicked.has(c.id)).map(c => c.name).filter(Boolean);
    if (!members.length) { showToast('至少勾选一位联系人'); return; }
    contact.members = [...new Set(members)].slice(0, 30);
  }
  data.contacts.push(contact);
  data.chats[contact.id] = { msgs: [], unread: 0, draft: '' };
  if (!data.chatSettings || typeof data.chatSettings !== 'object') data.chatSettings = {};
  data.chatSettings[contact.id] = JSON.parse(JSON.stringify(data.behavior || defaults.behavior));   // 新联系人以当前回复设置为起点
  if (!data.chatAppearance || typeof data.chatAppearance !== 'object') data.chatAppearance = {};
  data.chatAppearance[contact.id] = Object.assign({}, defaults.chatAppearanceDefault);   // 新会话外观用默认
  // 2026-10-13 #341 后出厂零联系人：**册里本来没有活跃会话时**（第一位联系人／刚删完），新建的这位当场
  // 绑上活跃会话（messages／behavior／外观三条链一起）——旧写法靠出厂 c0 恒在所以看不出来，零册时
  // activeChat 停在空串，这三条链全绑在空气上。已经有活跃会话时不抢戏（加第二三位照旧停在原来那位）。
  if (!data.activeChat || !data.chats[data.activeChat]) {
    data.activeChat = contact.id;
    data.messages = data.chats[contact.id].msgs;
    _applyContactBehavior(contact.id);
    if (typeof applyAppearance === 'function') applyAppearance();
  }
  save();
  _closeChatForm();
  renderChatsList();
  showToast(_chatFormMode === 'group' ? '群聊已创建' : '联系人已添加');
}

// 本页寿命内「刚才是长按呼出的」这一发标记：长按松手那一下浏览器还会补一个 click，落点正是刚盖满屏的遮罩，
// 不认这一发的话弹层会在出现的同时被同一次手势关掉＝用户报的「群聊无法删除」（长按没反应）的主因
let _lpJustFired = () => false;
function _askDeleteChat(id) {
  const c = (data.contacts || []).find(x => x.id === id);
  if (!c) return;
  // 会话动作单：置顶 / 归档 / 主动消息 / 清空聊天记录 / 删除 / 取消
  // （长按、右键、或设置页底部那一枚呼出——两件破坏性动作都只有这一处实现）
  // 那一行按会话类型说人话：旧文案对群也念「删除联系人」＝读着像没这功能（用户 2026-10-07 报「群聊无法删除」的一处因）
  // 删人与清记录分两条路：旧版只有「删人（含聊天记录）」一条＝想只清记录的人找不到入口（用户 2026-10-14 报）
  const delLabel = c.kind === 'group' ? '删除这个群（含聊天记录）' : '删除 TA（含聊天记录）';
  const clearLabel = c.kind === 'group' ? '清空聊天记录（这个群留着）' : '清空聊天记录（TA 留着）';
  // 本来就没有记录＝不摆一枚点了什么也不发生的钮（本仓「看着能点实则无反应」那一族）
  const _hasHistory = ((data.chats && data.chats[id] && data.chats[id].msgs) || []).length > 0;
  // 主动消息那一枚（js/silent.js）：按位开关是**批量那一页**的补充，不是第二处实现——
  // 写读都走同一个 setChatSilent，两边屏上的读数永远一致
  const _sl = (typeof chatSilentOn === 'function') && chatSilentOn(id);
  const silentLabel = c.kind === 'group'
    ? (_sl ? '开启群里主动消息' : '关闭群里主动消息')
    : (_sl ? '开启 TA 主动发消息' : '关闭 TA 主动发消息');
  const m = document.createElement('div');
  m.className = 'sheet-mask';
  m.id = 'chatActionsMask';
  const pinLabel = c.pin ? '取消置顶' : '置顶';
  const archLabel = c.archived ? '取消归档' : '归档（收进列表底部）';
  m.innerHTML = `<div class="sheet"><div class="sheet-head">${escapeHTML(chatNameOf(c))}</div>
    <button type="button" class="sheet-btn" data-act="pin">${pinLabel}</button>
    <button type="button" class="sheet-btn" data-act="arch">${archLabel}</button>
    <button type="button" class="sheet-btn" data-act="silent">${escapeHTML(silentLabel)}</button>
    ${_hasHistory ? `<button type="button" class="sheet-btn" data-act="clear">${escapeHTML(clearLabel)}</button>` : ''}
    <button type="button" class="sheet-btn sheet-danger" data-act="del">${escapeHTML(delLabel)}</button>
    <button type="button" class="sheet-btn sheet-cancel" data-act="cancel">取消</button></div>`;
  document.body.appendChild(m);
  // 破坏性动作（清空记录 / 删除会话）两段确认收进动作单本身（首点变「确认清空」/「确认删除」，2.5 秒不点回落），
  // 不再叠第二层浏览器原生 confirm——那个白框与全站观感不同族，且在手机端会打断输入
  let arm = null;   // 武装态：{ act, btn, label, t }
  const _disarm = () => { if (!arm) return; clearTimeout(arm.t); arm.btn.textContent = arm.label; arm = null; };
  m.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) { if (e.target === m && !_lpJustFired()) m.remove(); return; }
    const act = b.dataset.act;
    const ask = act === 'del' ? { label: delLabel, ask: '确认删除' }
      : (act === 'clear' ? { label: clearLabel, ask: '确认清空' } : null);
    if (ask && (!arm || arm.act !== act)) {   // 首点＝武装，再点同一下才真干
      _disarm();
      arm = { act, btn: b, label: ask.label, t: setTimeout(_disarm, 2500) };
      b.textContent = ask.ask;
      return;
    }
    _disarm();
    m.remove();
    if (act === 'pin') { c.pin = !c.pin; save(); renderChatsList(); showToast(c.pin ? '已置顶' : '已取消置顶'); return; }
    if (act === 'arch') {
      c.archived = !c.archived;
      if (c.archived && data.activeChat === id) { data.activeChat = ((data.contacts || []).find(x => x.id !== id && !x.archived) || {}).id || ''; data.messages = (data.activeChat && data.chats[data.activeChat]) ? data.chats[data.activeChat].msgs : []; _applyContactBehavior(data.activeChat); if (typeof applyAppearance === 'function') applyAppearance(); if (typeof renderMessages === 'function') renderMessages(); }
      save(); renderChatsList(); showToast(c.archived ? '已归档' : '已取消归档');
      return;
    }
    if (act === 'silent') {
      if (typeof chatSilentOn !== 'function' || typeof setChatSilent !== 'function') return;
      const on = !chatSilentOn(id);
      if (setChatSilent(id, on)) {
        save(); renderChatsList();
        if (typeof renderSilentEntry === 'function') renderSilentEntry();
        if (typeof renderSilentPage === 'function' && document.body.dataset.view === 'silent') renderSilentPage();
        showToast(on
          ? (c.kind === 'group' ? '已关闭：群里不会有主动消息' : '已关闭：TA 不会主动发来新消息')
          : (c.kind === 'group' ? '已开启：群里恢复主动消息' : '已开启：TA 会主动发来新消息'));
      }
      return;
    }
    if (act === 'clear') { _clearChatHistory(id); return; }
    if (act === 'del') _deleteChat(id);
  });
}
// 只清这一本的聊天记录、人留着：与「删除 TA／这个群」并列的一条独立动作（用户 2026-10-14 报
// 「联系人只有含记录一起删、没有单独清记录」）。只动消息与未读——草稿、外观、音效、信箱、
// 主动消息、纪念日、专属字卡组这些都还挂在这位身上，不跟着一起抹。
function _clearChatHistory(id) {
  const ch = data.chats && data.chats[id];
  if (!ch) return;
  const n = (ch.msgs || []).length;
  if (!n) { showToast('这本还没有聊天记录'); return; }
  ch.msgs.length = 0;   // 就地清空：data.messages 是它的活引用（见本文件顶注），换新数组会让别名脱钩
  ch.unread = 0;
  // 清的是当前会话才动屏：jumpToLatest 会复位定位窗口 _msgEnd 再重画（沿用 chat-io「追加记录」那一处的手法，
  // 不另造一套 resetMessageRender()＋renderMessages()）。
  if (data.activeChat === id && typeof jumpToLatest === 'function') jumpToLatest();
  save();
  renderChatsList();
  showToast('已清空 ' + n + ' 条聊天记录');
}
function _deleteChat(id) {
  const c = (data.contacts || []).find(x => x.id === id);
  if (!c) return;
  data.contacts = data.contacts.filter(x => x.id !== id);
  delete data.chats[id];
  if (data.chatSettings) delete data.chatSettings[id];
  if (data.chatSounds) delete data.chatSounds[id];   // 该联系人的单独音效一并清掉
  if (data.avlib && data.avlib.by) delete data.avlib.by[id];   // 头像昵称池随联系人一并清掉
  if (data.mailboxSettings) delete data.mailboxSettings[id];   // 他那一册的信箱设置一并清掉（不清＝下次同名的人进来继承他的勤懒）
  if (typeof silentPrune === 'function') silentPrune(id);   // 主动消息名单里这一格一并清掉（不清＝进那一页才被 prune，中间那段是一行死名字）
  if (typeof annReleaseContact === 'function') annReleaseContact(id);   // 其纪念日退回通用，save() 在下方统一落盘
  (data.groups || []).forEach(g => { if (g.contactId === id) g.contactId = ''; });   // 其专属字卡分组退回未绑定＝随之停用（硬隔离），字卡库卡面会标出来等重新绑定
  if (data.activeChat === id) {
    data.activeChat = (data.contacts[0] || {}).id || '';
    data.messages = (data.activeChat && data.chats[data.activeChat]) ? data.chats[data.activeChat].msgs : [];
    _applyContactBehavior(data.activeChat);
    if (typeof applyAppearance === 'function') applyAppearance();
    renderMessages();
  }
  save();
  renderChatsList();
  // 从「TA 的设置」那枚入口删的：这一屏的编辑对象已经不存在，别把一页空壳留在屏上
  if (typeof showView === 'function' && document.body.dataset.view === 'mate') showView('chats');
  showToast('已删除');
}

// ===== 事件绑定 =====
const _chatsList = $('#chatsList');
if (_chatsList) {
  _chatsList.addEventListener('click', e => {
    const row = e.target.closest('.chat-row');
    if (row) switchChat(row.dataset.chat);
  });
  let _lpTimer = null, _lpFrom = null, _lpFiredAt = 0;
  const _lpClear = () => { clearTimeout(_lpTimer); _lpTimer = null; _lpFrom = null; };
  _chatsList.addEventListener('touchstart', e => {
    const row = e.target.closest('.chat-row');
    if (!row) return;
    const t = e.touches[0];
    _lpFrom = t ? { x: t.clientX, y: t.clientY } : null;
    _lpTimer = setTimeout(() => { _lpClear(); _lpFiredAt = Date.now(); _askDeleteChat(row.dataset.chat, true); }, 480);
  }, { passive: true });
  // 位移容差 12px：旧写法「任何 touchmove 都取消」＝真机手指压下去几乎必然带几像素位移，长按常被当成滑动
  _chatsList.addEventListener('touchmove', e => {
    if (!_lpTimer || !_lpFrom) return;
    const t = e.touches[0];
    if (t && (Math.abs(t.clientX - _lpFrom.x) > 12 || Math.abs(t.clientY - _lpFrom.y) > 12)) _lpClear();
  }, { passive: true });
  ['touchend', 'touchcancel'].forEach(ev => _chatsList.addEventListener(ev, _lpClear, { passive: true }));
  // 长按呼出后，同一次手势松手那一下浏览器还会补一个 click，落点正是刚盖满屏的遮罩＝弹层被当场关掉。
  // 这一发只认「刚才是长按呼出的」，之后点空白关弹层照常。
  _lpJustFired = () => (Date.now() - _lpFiredAt < 600 ? (_lpFiredAt = 0, true) : false);
  _chatsList.addEventListener('contextmenu', e => {
    const row = e.target.closest('.chat-row');
    if (!row) return;
    e.preventDefault();
    _askDeleteChat(row.dataset.chat);
  });
}
const _addContactBtn = $('#addContactBtn');
if (_addContactBtn) _addContactBtn.addEventListener('click', _openSheet);
const _addChatCancel = $('#addChatCancel');
if (_addChatCancel) _addChatCancel.addEventListener('click', _closeSheet);
const _addChatMask = $('#addChatMask');
if (_addChatMask) _addChatMask.addEventListener('click', _closeSheet);
const _addSingleBtn = $('#addSingleBtn');
if (_addSingleBtn) _addSingleBtn.addEventListener('click', () => _openChatForm('single'));
const _addGroupBtn = $('#addGroupBtn');
if (_addGroupBtn) _addGroupBtn.addEventListener('click', () => _openChatForm('group'));
const _chatFormClose = $('#chatFormClose');
if (_chatFormClose) _chatFormClose.addEventListener('click', _closeChatForm);
const _chatFormCancel = $('#chatFormCancel');
if (_chatFormCancel) _chatFormCancel.addEventListener('click', _closeChatForm);
const _chatFormMask = $('#chatFormMask');
if (_chatFormMask) _chatFormMask.addEventListener('click', e => { if (e.target === _chatFormMask) _closeChatForm(); });
const _chatFormOk = $('#chatFormOk');
if (_chatFormOk) _chatFormOk.addEventListener('click', _submitChatForm);
const _chatFormMemberList = $('#chatFormMemberList');
if (_chatFormMemberList) _chatFormMemberList.addEventListener('click', e => {
  const row = e.target.closest('[data-pick]');
  if (!row) return;
  const id = row.dataset.pick;
  if (_chatFormPicked.has(id)) _chatFormPicked.delete(id); else _chatFormPicked.add(id);
  row.classList.toggle('on');
});

