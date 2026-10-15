// ===== 头像和昵称互动（移植自家 mochi）：TA/我的 头像池 + 昵称池 =====
// 页面：独立全屏视图（view-avatarlib），顶部「我的 + 每个单聊联系人」胶囊行按会话区分池子；
//       入口 = 功能中心 hub「头像昵称」行 / TA 设置整页 #mateAvlibBtn（均预选当前会话联系人）
// 数据：data.avlib = { me:{...}, by:{ [联系人id]: {...} } }，池结构见 _avNewPool
// 手动点选立即生效；换 TA 的形象有 50% 概率触发回应（70% 同意 / 30% 拒绝回退）
// 节奏：**事件驱动**（不再是「每隔 N 小时」）——TA 做了什么就攒热度（唯一投递口 avlibFeed），
//       攒够了才换，且须同时满足：总闸开着、档位够、夜里不换（23:00-08:00）、当日没超上限；
//       TA 主动给我换时 50% 弹窗邀请，且必定归到**做这件事的那一位**名下（不再落进此刻开着的会话）
// TA 的改动只写 c.chatName / c.chatAvatar（聊天窗口专属），系统消息进该联系人的会话流；
// 我这侧同构（2026-10-08 按会话分开）：本页「我的」那一面写的是**默认那一份** data.me，
// 某一位想顶另一张脸就写那位名下的 myChatName / myChatAvatar（入口＝聊天页右上角 TA 的设置），
// TA 主动给我换＝只写发起那一位的覆盖。系统消息一律进触发者会话。
//
// 群聊完全退出本功能（2026-10-08 用户定档，BUGS #179）：群没有唯一的 TA（印象簿早就按这条口径
// 不给群记账），却能建池、点选、开随机、还会自己冒系统消息，而群头像的渲染口径 groupAvatarHTML
// 只读 c.avatar 从不读 c.chatAvatar ＝写进去的数据屏上看不见。与「群没有一张脸」那条定档直接冲突。
// 硬隔离不留例外：胶囊行不列群、avlibTick 跳过群、入口落在群上回退、旧档里群的池与印象簿一并剪掉。

const AV_INVITE_PROB = 50;   // 触发「回应/邀请」的概率 %
const AV_AGREE_PROB = 70;    // 触发回应时同意的概率 %（拒绝 = 100 - 此值）

// 三档节奏：攒够 need 点热度才换，且当日换的次数不许超 max（1 = 很少 / 2 = 偶尔 / 3 = 常换）
const AV_RATES = {
  1: { need: 60, max: 1, name: '很少' },
  2: { need: 25, max: 2, name: '偶尔' },
  3: { need: 10, max: 4, name: '常换' }
};
const AV_RATE_DEFAULT = 2;
// 夜里不换形象：这一段只攒不换，攒下的热度留着白天兑现（真实的人凌晨三点不换头像）
const AV_QUIET_FROM = 23, AV_QUIET_TO = 8;
// 事件权重：写在唯一的地方，别在各个投递口各写一个数字
const AV_HEAT_MSG = 3;        // TA 跟你说了一句话
const AV_HEAT_LETTER = 8;     // 一封信到站
const AV_HEAT_CALL = 6;       // 通了 / 挂了电话
const AV_HEAT_MOMENT = 5;     // TA 发了一条动态（朋友圈）
// 每种事件配一句话短语：换形象那一刻记下「因为什么换的」，屏上读得到＝事件驱动这件事才算兑现。
// 只留最近一个（不记流水账）——用户问的是「为什么此刻换」，不是要一份事件日志。
// 人称按**那一行正文的自称**分两套（2026-10-12 定档）：TA 换自己那一支的正文是第三人称
// （「薄荷猫 把自己的昵称换成了「乖猫」」），括号里说「你 / TA」正好接得上；而 TA 动我这侧那两行
// 正文用的是「我的」（「薄荷猫 更换了我的头像」），同一个人一行里叫「我」又叫「你」＝读起来像两个人
// 在说话，故 me 侧的短语一律不带人称代词（写成「聊得正密」而不是「我跟你聊得正密」）。
const AV_WHY = {
  ta: { msg: '你跟 TA 聊得正密', letter: 'TA 给你写了信', call: '你们刚通过电话' },
  me: { msg: '聊得正密', letter: '信刚到', call: '刚通过电话' }
};
function _avWhyText(side, kind) { const s = AV_WHY[side] || AV_WHY.ta; return s[kind] || ''; }
// 门槛换算成人话：need 点热度大致等于几件事，用户才能预判「大概要聊多少才换」。
// 换算只用现成的权重常量，不另写一份数字——权重一改这句话自动跟着变，不会变成一句过期的话。
function _avNeedText(need) {
  const n = Math.max(1, Math.round(need / AV_HEAT_MSG));
  return `你们聊够 ${n} 句`;
}

const _AV_INVIS_RE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u206A-\u206F\uFEFF\u180E]/g;
function _avCleanNick(s) { return String(s == null ? '' : s).replace(_AV_INVIS_RE, '').trim().slice(0, 30); }

// 池子形状：av/nicks 是素材；En 是总闸；Rate 是档位（1 很少/2 偶尔/3 常换）；
// Heat 是攒着的事件热度（唯一写手 avlibFeed）；Why 是「最近因为什么」那一句话短语（兑现时清零）；
// Day/DayN 是当日计数与日期（封顶用）；Last/LastWho 是上次换的时刻与触发者；me* 是「TA 主动给我换」那一侧按人的一份。
function _avNewPool() {
  return {
    av: [], nicks: [], avEn: true, nickEn: true,
    avRate: AV_RATE_DEFAULT, nickRate: AV_RATE_DEFAULT,
    avHeat: 0, nickHeat: 0, avWhy: '', nickWhy: '',
    avDay: '', avDayN: 0, nickDay: '', nickDayN: 0,
    avLast: 0, nickLast: 0, avLastWho: '', nickLastWho: '', avLastWhy: '', nickLastWhy: '',
    meAvEn: true, meNickEn: true, meAvHeat: 0, meNickHeat: 0, meAvWhy: '', meNickWhy: '',
    meAvDay: '', meNickDay: '', meAvDayN: 0, meNickDayN: 0, meAvLastWhy: '', meNickLastWhy: ''
  };
}
function _avRoot() {
  if (!data.avlib || typeof data.avlib !== 'object') data.avlib = { me: _avNewPool(), by: {} };
  if (!data.avlib.by || typeof data.avlib.by !== 'object') data.avlib.by = {};
  // 「我的」专属池（BUGS #407）：meBy[cid]＝只给那一位看的候选本。懒建即可，这里只保形状在册
  if (!data.avlib.meBy || typeof data.avlib.meBy !== 'object') data.avlib.meBy = {};
  return data.avlib;
}
function _avMePool() {
  const root = _avRoot();
  if (!root.me || typeof root.me !== 'object') root.me = _avNewPool();
  return root.me;
}
// 当前选中对象的池子（页面内操作用，懒建）；id = 'me' | 联系人id
function _avPoolById(id) {
  if (id === 'me') return _avMePool();
  const root = _avRoot();
  if (!root.by[id] || typeof root.by[id] !== 'object') root.by[id] = _avNewPool();
  return root.by[id];
}
// 本功能参与的会话：**只有单聊**。群聊整族退出（BUGS #179），这里是唯一那把筛子，
// 页面上凡是要列「有哪些会话」的地方都必须走它，别再各自 for 一遍 data.contacts。
function _avAvatars() { return (data.contacts || []).filter(c => c && c.kind !== 'group'); }
function _avSelContact() {
  if (_avSel === 'me') return null;
  return _avAvatars().find(c => c.id === _avSel) || null;
}
function _avPool() { return _avPoolById(_avSel); }

// ===== 「我的」面的池子分本（BUGS #407）=====
// _avMineSel＝「我的」面里在编哪一本：'global'＝通用那本（data.avlib.me，换了全网生效）
// ｜联系人id＝对那位专属的一本（data.avlib.meBy[cid]，换了只写那位的 myChatAvatar/myChatName 覆盖位）。
// 给不给某位开专属由用户按人决定：不切子选择就一直用通用，切过去才动那本。
let _avMineSel = 'global';
function _avMineContact() { return _avMineSel === 'global' ? null : (_avAvatars().find(c => c.id === _avMineSel) || null); }
// 「我的」面当前在编的池子（懒建）。专属本与 _avNewPool 同形＝渲染与增删链路一份代码两处用；
// 节奏档位/总闸**不**跟素材走：自动换的钟仍住全局 me 池与 by[cid]（meAvEn 按人那份）。
function _avMinePool() {
  if (_avMineSel === 'global') return _avMePool();
  const root = _avRoot();
  if (!root.meBy[_avMineSel] || typeof root.meBy[_avMineSel] !== 'object') root.meBy[_avMineSel] = _avNewPool();
  return root.meBy[_avMineSel];
}
// 读侧（不懒建）：自动换「有专属用专属、没有回落通用」的那把尺
function _avMinePoolById(cid) {
  const root = data.avlib;
  const m = (root && root.meBy && typeof root.meBy === 'object') ? root.meBy[cid] : null;
  return (m && typeof m === 'object') ? m : null;
}

function _avTaName() { const c = _avSelContact(); return chatNameOf(c) || partnerName(); }
function _avTaAvatar() { const c = _avSelContact(); return chatAvatarOf(c) || ''; }
function _avMyName() { return (data.me && data.me.name) || '我'; }
function _avMyAvatar() { return (data.me && data.me.avatar) || ''; }

// 形象/昵称变更后的统一刷新：cid=null（我的，全局）或联系人 id；仅改动会落在当前会话时才重建消息 DOM
function _avAfterChange(cid) {
  save();
  if (!cid || cid === data.activeChat) renderMessages();
  updateTopbarTitle(document.body.dataset.view || 'chat');
  renderChatsList();
  if (document.body.dataset.view === 'avatarlib') { _avSyncHead(); _avSyncHighlight(); }
}

// 系统消息：默认进当前会话流；_avSysFor 进指定联系人的会话流（活跃会话才实时重渲染）
function _avSys(text, img) {
  const msg = { id: nextId(), from: 'system', text, time: time(), date: new Date().toLocaleDateString('zh-CN') };
  if (img) msg.sysImg = img;
  data.messages.push(msg);
}
// imprKey＝这一行指的是哪一本印象账（'a:哈希' / 'n:昵称'）。走的是信箱 #165 那一族的写法：
// 会话里只留一行指针、点开才是那本账，不把整本流水打印在聊天里。旧消息没有这一格＝老实不可点（不替它猜）。
function _avSysFor(cid, text, img, imprKey) {
  const ch = (data.chats && data.chats[cid]) || null;
  const stream = ch && Array.isArray(ch.msgs) ? ch.msgs : data.messages;
  const msg = { id: nextId(), from: 'system', text, time: time(), date: new Date().toLocaleDateString('zh-CN') };
  if (img) msg.sysImg = img;
  if (imprKey) msg.avImpr = imprKey;
  stream.push(msg);
  if (cid === data.activeChat) renderMessages();
}

// cid 给了（＝这一位 TA 干的，或正在翻某一位的那一面）就只改**那一本会话**那一份覆盖，
// 不给才动全局 data.me 那一份。旧写法无论谁换都写全局＝A 给你换了头像，B、C 那里的你也一起变了，
// 而屏上只有 A 那一本留了一行「A 更换了我的头像」（#156·#091·#165 那一族的第八处）。
function _avApplyMyAvatar(src, cid) {
  const r = cid ? chatMyRowOf(cid) : null;
  if (r) r.myChatAvatar = src || '';
  else { if (!data.me) data.me = {}; data.me.avatar = src || ''; }
  _avAfterChange(cid || null);
}
function _avApplyTaAvatar(src) { const c = _avSelContact(); if (!c) return; c.chatAvatar = src || ''; _avAfterChange(c.id); }
function _avApplyTaNick(name) { const c = _avSelContact(); if (!c) return; c.chatName = name; _avAfterChange(c.id); }
function _avApplyMyNick(name, cid) {
  const r = cid ? chatMyRowOf(cid) : null;
  if (r) r.myChatName = name || '';
  else { if (!data.me) data.me = {}; data.me.name = name; }
  _avAfterChange(cid || null);
}

// ===== TA 的印象（TA心里话-印象字卡）：某一位 TA 对某个头像/昵称积累的想法，记录 + 按概率说出口 =====
// 印象簿 data.avlib.impr = { [会话id]: { [key]: [{t, ts}] } }——每人一本；key：头像=图片内容哈希（a:xxx），昵称=文本（n:xxx）
// 旧档（2026-10-05 之前）那本没有会话id、分不清是谁记的，整本迁进保留键 '*'，弹层里单列一节标「当时没记下是谁」，不挂到任何人名下
// 群聊没有唯一的「TA」，故既不记录也不说出口（旧写法是「只记不说」，记下来那本没有任何一面读得到＝死数据）
// 记录不落库会丢（_avAfterChange 的 save 可能先于本调用返回），这里显式 save
const AV_IMPR_ANY = '*';
function _avImprRoot() { const r = _avRoot(); if (!r.impr || typeof r.impr !== 'object') r.impr = {}; return r.impr; }
function _avImprBook(cid) { const r = _avImprRoot(); if (!r[cid] || typeof r[cid] !== 'object') r[cid] = {}; return r[cid]; }
function _avImprKey(src, isNick) {
  if (isNick) return 'n:' + String(src || '');
  let h = 5381; const s = String(src || '');
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return 'a:' + h.toString(36);
}
function _avContactById(cid) { return (data.contacts || []).find(x => x.id === cid) || null; }
// 这条印象记在哪一位名下：显式给的会话（TA 侧）或当下活跃会话（我这侧），落到群聊／没人则不记
function _avImprHolder(cid) {
  const c = _avContactById(cid || data.activeChat);
  return (c && c.kind !== 'group') ? c.id : null;
}
// 名下写谁：走聊天内那一枚名字（chatNameOf＝覆盖位优先，其次基础资料），与这一页页头·首页那一行·聊天页头部同一个名字。
// 旧写法只读 c.name，于是 TA 换上「小满」之后页头写着小满、这本账的标题却写着梦角1＝同一个人两个名字（BUGS #246）。
// 如实留一句：TA 刚把自己换成某个昵称时，那一面会读成「小满 对「小满」的印象」——看着绕，但那确实是 TA 现在的名字，
// 比另起一个名字更好读；「我的」那一面的逐行名字是**别人**名下的簿子，不与被评的那张图/那个昵称相撞。
function _avImprWho(cid) { const c = _avContactById(cid); return chatNameOf(c) || (cid === data.activeChat ? partnerName() : ''); }
// 这一面翻的是哪几本：TA 的池＝只那一位的簿子；我的池＝所有单聊联系人各一本（同一张图在几个人眼里是几回事）
function _avImprViewHolders() {
  if (_avSel !== 'me') { const c = _avSelContact(); return (c && c.kind !== 'group') ? [c.id] : []; }
  return _avAvatars().map(c => c.id);
}
// holders 由调用方给＝这一面翻哪几本（缺省按页上此刻选中的那一面）。从聊天里那一行指针进来时必须钉住
// 「就是这一位那一本」，不能被此刻胶囊行选中的人决定——点开 A 那行读出 B 的账是 #091·#128·#246 那一族。
function _avImprRows(src, isNick, holders) {
  const key = _avImprKey(src, isNick), root = _avImprRoot(), own = [], any = [];
  const hs = holders || _avImprViewHolders();
  // w＝换上它那一刻的来由（老条目与手动换没有这一格，读成空串，屏上就不印那一行）
  hs.forEach(cid => {
    const l = root[cid] && root[cid][key];
    if (Array.isArray(l)) l.forEach(e => own.push({ t: e.t, ts: e.ts, cid, w: e.w || '' }));
  });
  // 旧档那一本（保留键 '*'）只在**这一面确有名下的人**时才列：群聊整族退出本功能，它没有名下的人，
  // 把「没记下是谁」的旧账挂到群名下又是一句假话（这条判据原来住在 _avImprAnyVisible 里，两处各问一次必漂，收进本函数）
  if (hs.length) {
    const l = root[AV_IMPR_ANY] && root[AV_IMPR_ANY][key];
    if (Array.isArray(l)) l.forEach(e => any.push({ t: e.t, ts: e.ts, w: e.w || '' }));
  }
  own.sort((a, b) => a.ts - b.ts);
  any.sort((a, b) => a.ts - b.ts);
  return { own, any };
}
function _avSayFor(cid, text) {
  if (typeof _deliverToChat !== 'function') return;
  // src:'impress' 是 AGENTS §6 那条铁律（功能生成的句一律打 src·签无条件出画）补上的一格：
  // 这句不是 TA 回你，是它对着形象簿说的——原先它长得跟普通回话一模一样，用户在聊天里认不出这是印象。
  _deliverToChat({ id: nextId(), from: 'partner', text, unread: true, src: 'impress' }, cid);
}
// 抽一句 TA 的看法＋记进那一本＋返回那一句。**一次算好、三处共用**（簿子·播报那行·说出口）：
// 原来记账与说话在 _avImpress 里各抽一次，播报想挂上看法就必须再抽第三下＝同一次换留下两种说法。
// kind＝抽哪一池（BUGS #401）：'impress'＝TA 看**我的**新形象；'impressSelf'＝TA 看**自己的**新形象。
// 同一个池里「很配你」那类说用户的句子，挂在自己换形象后面就是张冠李戴——两池分开，各抽各的；
// 两池都空＝那一侧不留下看法（没有依据的话不替 TA 编，不互相兜底）。
function _avMakeImpr(src, isNick, cid, why, kind) {
  const holder = _avImprHolder(cid);
  if (!holder) return '';
  const r = typeof taReasonPick === 'function' ? taReasonPick(kind || 'impress', false) : null;
  if (!r || !r.text) return '';
  const book = _avImprBook(holder), key = _avImprKey(src, isNick);
  if (!Array.isArray(book[key])) book[key] = [];
  // w＝换上它的那一刻「因为什么」（事件驱动的来由）。手动换没有前因，留空——
  // 弹层里那一格空着是事实，编一句「你们聊得正密」才是假的。
  book[key].push({ t: r.text, ts: Date.now(), w: why || '' });
  if (book[key].length > 20) book[key].splice(0, book[key].length - 20);
  save();
  if (document.body.dataset.view === 'avatarlib') _avRenderPane();   // 印象落地即时显角标（否则要等下次重渲染）
  return r.text;
}
// 说不说＝一枚固定概率，与「记不记」分开（旧写法两者缠在一起，rate 传进来又总传同一个数）
const AV_SAY_PROB = 60;
function _avSayImpr(cid, text) {
  const holder = _avImprHolder(cid);
  if (text && holder && Math.random() * 100 < AV_SAY_PROB) _avSayFor(holder, text);
}
// 手动点选那一族仍是「记完当场按概率说一句」（行为一字不变）；kind 同 _avMakeImpr（缺省看我的形象）
function _avImpress(src, isNick, cid, why, kind) {
  _avSayImpr(cid, _avMakeImpr(src, isNick, cid, why, kind));
}
function _avFmtTs(ts) { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
// 一行的实现只有一份：点开角标的弹层与「印象簿」那一面共用（各写一份必漂，#244 那把收纳尺同一课）。
// whoLabel＝跨几位时标「谁说的」；whatHTML＝这一条例讲的是哪个头像/哪个昵称（弹层里标题已经说过，传空）。
// 「因为什么」那行挂在句子下面（同一格里换行，不另起一行）——它解释的是**这一条**的来由，
// 不是这一句 TA 说的话的来由，所以跟 txt 同层、排在时间戳之前。
function _avImprItemHTML(e, whoLabel, whatHTML, btnAttrs) {
  const inner = (whoLabel ? `<span class="av-impr-who">${escapeHTML(whoLabel)}</span>` : '') + (whatHTML || '')
    + `<span class="av-impr-txt">${escapeHTML(e.t)}${e.w ? `<span class="av-impr-why">${escapeHTML(e.w)}</span>` : ''}</span>`
    + `<span class="av-impr-ts">${_avFmtTs(e.ts)}</span>`;
  // 「印象簿」那一面的行整行可点（点它＝翻开那一本），弹层里的行不是按钮——同一份内芯、两种外壳，不留两份行实现
  return btnAttrs
    ? `<button type="button" class="av-impr-item av-ledger-item" ${btnAttrs}>${inner}</button>`
    : `<div class="av-impr-item">${inner}</div>`;
}
// 头像那本账的键是图片内容哈希（昵称的键是文本本身）——要把「讲的是哪张图」画出来只能反查池子。
// 扫不到就回空串，调用方老实写「那张图已经不在池子里了」，绝不拿另一张图冒充（猜错＝把一句话挂到别的头像名下，#074 那一族）。
function _avSrcByHash(key) {
  const root = _avRoot();
  const lists = [(root.me && root.me.av) || []].concat(_avAvatars().map(c => (root.by[c.id] && root.by[c.id].av) || []));
  for (const l of lists) { const hit = l.find(s => _avImprKey(s, false) === key); if (hit) return hit; }
  return '';
}
// 「讲的是哪个对象」那一小块：昵称直接印文本；头像能找回图就画 22px 缩略图、找不回就说实话
function _avImprWhatHTML(key) {
  if (key.slice(0, 2) === 'n:') return `<span class="av-impr-what">${escapeHTML(key.slice(2))}</span>`;
  const src = _avSrcByHash(key);
  return src
    ? `<span class="av-impr-what av-impr-what-ava"><img src="${escapeHTML(src)}" alt=""></span>`
    : '<span class="av-impr-what">那张图已不在池里</span>';
}
function _avShowImpr(src, isNick, holders) {
  const rows = _avImprRows(src, isNick, holders), viewHolders = holders || _avImprViewHolders();
  // ownerSet＝这些条目实际记在哪几位名下（与 viewHolders 不是一回事：前者是账本、后者是这一面翻哪几本）
  const ownerSet = [...new Set(rows.own.map(e => e.cid))];
  const thisOne = `对这${isNick ? '个昵称' : '个头像'}`;
  // 一本在册就点那一位的名；跨几位（「我的」池那一面）才收成「大家」并逐行标「谁说的」，别把别人的话挂到此刻选中的那位名下
  let who = '';
  if (viewHolders.length === 1) who = _avImprWho(viewHolders[0]);
  else if (ownerSet.length === 1) who = _avImprWho(ownerSet[0]);
  $('#avImprTitle').textContent = `${who ? who : (ownerSet.length > 1 ? '大家' : '')}${thisOne}的印象`;
  const multi = viewHolders.length > 1 && ownerSet.length > 1;
  let html = rows.own.slice().reverse().map(e => _avImprItemHTML(e, multi ? _avImprWho(e.cid) : '')).join('');
  if (rows.any.length) html += `<div class="av-impr-cap">更早的 ${rows.any.length} 条 · 那时还没记下是谁</div>` + rows.any.slice().reverse().map(e => _avImprItemHTML(e, '')).join('');
  $('#avImprList').innerHTML = html || '<div class="av-impr-empty">还没有印象</div>';
  $('#avImprMask').hidden = false;
}
// 点聊天里那枚「印象」签 → 落在头像昵称页的「印象簿」那一面。签的全部意义是把「为什么 TA 说了这句」的
// 出口接上（与心愿／邀请那两档同一族）；出口不落在这一页，签就成了一枚只会说明来路的装饰。
function openAvatarImprLedger() { _avKind = 'impr'; openAvatarLib(data.activeChat); }
// 聊天里那一行系统小字＝一本账的指针（BUGS #303 定档·与信箱 #165 同一族写法）：
// 按 key 直接翻开它，holders 钉死这条消息所在的那一本——不能被此刻胶囊行选中的人决定，
// 否则点开 A 那行读出的是 B 的账（#091·#128·#246 那一族第十处）。
function _avOpenImprPointer(cid, key) {
  if (typeof key !== 'string' || (key.slice(0, 2) !== 'a:' && key.slice(0, 2) !== 'n:')) return;
  const isNick = key.slice(0, 2) === 'n:';
  _avShowImpr(isNick ? key.slice(2) : _avSrcByHash(key), isNick, [_avImprHolder(cid) || cid]);
}
// 「印象簿」那一面屏上至多画这么多条——这本账是给人回看的，不做无限列表（超出如实报数）
const AV_LEDGER_MAX = 40;
// 这一面名下所有印象（或指定这几本），按时刻倒序。**不设上限**——上限只管屏上画几条，
// 而 chip 上那个数与「另有 N 条」都得是真数，读侧先截一次就会把「一共多少」说成「屏上多少」。
function _avImprLedgerEntries(holders) {
  const root = _avImprRoot(), out = [];
  (holders || _avImprViewHolders()).forEach(cid => {
    const book = root[cid];
    if (!book || typeof book !== 'object') return;
    for (const key of Object.keys(book)) {
      const l = book[key];
      if (!Array.isArray(l)) continue;
      l.forEach(e => { if (e && typeof e.t === 'string' && e.t.trim() && typeof e.ts === 'number') out.push({ t: e.t, ts: e.ts, w: e.w || '', cid, key }); });
    }
  });
  return out.sort((a, b) => b.ts - a.ts);
}
// 「印象簿」那一面：顶部一个数（同一件事不说两遍）＋逐条按时刻倒序，一行＝一条、点它翻开那一本。
// 超过 40 条时如实写「另有 N 条没列出」——不做无限列表，也不假装屏上就是全部。
function _avLedgerHTML() {
  const all = _avImprLedgerEntries(), owners = [...new Set(all.map(e => e.cid))], multi = owners.length > 1;
  const shown = all.slice(0, AV_LEDGER_MAX);
  const head = `<div class="av-ledger-sum">${all.length
    ? `${multi ? '大家' : (_avImprWho(owners[0]) || 'TA')}记下了 ${all.length} 条`
    : '还没有攒下印象'}</div>`;
  const rows = shown.map(e => _avImprItemHTML(e, multi ? _avImprWho(e.cid) : '', _avImprWhatHTML(e.key),
    `data-ledger-cid="${escapeHTML(e.cid)}" data-ledger-key="${escapeHTML(e.key)}"`)).join('');
  const more = all.length > shown.length ? `<div class="av-ledger-more">另有 ${all.length - shown.length} 条没列出，点上面任意一行可看那一本的全部。</div>` : '';
  return head + rows + more;
}
// 池子条目上的印象数角标（有积累才显示）：这位名下的条数＋旧档那几条。
// holders＝这一面翻哪几本（缺省按页上此刻选中的那一面）；「对某人」的专属本只数那一位名下的
function _avImprBadge(items, i, isNick, holders) {
  const rows = _avImprRows(items[i], isNick, holders), n = rows.own.length + rows.any.length;
  return n ? `<button type="button" class="av-impr${isNick ? ' nick' : ''}"${isNick ? ' data-nick-impr' : ' data-av-impr'}="${i}" aria-label="印象">${n}</button>` : '';
}

// ===== 全屏页面 =====
let _avSel = 'me';        // 选中谁：'me' | 联系人id
let _avKind = 'avatar';   // 换什么：avatar | nick
let _avFileSide = null;   // 待上传头像的归属侧（'ta'=当前选中联系人 / 'me'=我）

function openAvatarLib(cid) {
  // 群聊整族退出本功能：落在群上（群会话里点 TA 设置那页也进得来）回退到「我的」，不留半截功能
  const cur = (typeof currentContact === 'function' && currentContact());
  const want = cid || (cur && cur.id);
  _avSel = (_avAvatars().some(c => c.id === want)) ? want : 'me';
  _avMineSel = 'global';   // 进页一律从通用那本看起（BUGS #407）
  showView('avatarlib');
}

const _AV_ICON_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>';
const _AV_ICON_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>';
const _AV_ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/></svg>';

// 节奏选择器：三档 + 「关」。事件驱动换掉了原来的「每隔 1-8 小时随机」开关（BUGS #179）
// swKey（总闸，写 avEn/nickEn/meAvEn/meNickEn）与 dataKey（chips 回写用的键名）必须分开：
// 早期版本两者共用一个键，于是点一下总闸把**档位**置成了 false（量具 E5/E6 抓到的就是这条）。
function _avRateHTML(title, swKey, enKey, rateKey, last, whoName, dataKey, lastWhy) {
  const on = !!enKey;
  const r = on ? AV_RATES[rateKey] || AV_RATES[AV_RATE_DEFAULT] : null;
  const chips = [1, 2, 3].map(i =>
    `<button type="button" class="av-rate${on && rateKey === i ? ' on' : ''}" data-av-rate="${dataKey}" data-av-rate-v="${i}"${!on ? ' disabled' : ''}>${AV_RATES[i].name}</button>`
  ).join('');
  // 只显示「上次」，不给预计——预计是个随机数，容易变成一句不打算兑现的话。
  // 「上次」后面挂上那一次的来由（_avCharge 从攒着的 Why 转存过来的），换完还在，读得到「为什么」。
  const lastTxt = last ? `上次 ${_avAgo(last)}${whoName ? ' · ' + whoName : ''}${lastWhy ? ' · ' + lastWhy : ''}` : '上次：还没换过';
  // 门槛换算成人话：用户真正需要预判的是「大概要聊多少才换」，不是「攒够 25 点热度」
  const sub = on
    ? `${r.name}：${_avNeedText(r.need)}就换，一天最多 ${r.max} 次。${lastTxt}`
    : `关掉就不会自己换。${lastTxt}`;
  return `<div class="av-toggle"><div class="av-toggle-txt"><div class="av-toggle-name">${title}</div><div class="av-toggle-sub">${sub}</div>`
    + `<div class="av-rate-row"><label class="av-rate-sw"><input type="checkbox" data-av-toggle="${swKey}"${on ? ' checked' : ''}><span>自动更换</span></label>${chips}</div></div></div>`;
}
function _avAgo(ts) {
  const m = Math.floor((Date.now() - (Number(ts) || 0)) / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}
function _avRateOf(pool, isNick) { const k = isNick ? 'nickRate' : 'avRate'; return pool[k] === 1 || pool[k] === 2 || pool[k] === 3 ? pool[k] : AV_RATE_DEFAULT; }
// 我那一面的总闸是**按人**各一份（by[cid].meAvEn/meNickEn），屏上只有一个开关：
// 一个人开着就还开着，全都关了才算关（少一个开着的人就别把它显示成关，否则点一下会误关所有人）。
function _avMeAnyEn(isNick) {
  const list = _avAvatars();
  if (!list.length) return true;
  const k = isNick ? 'meNickEn' : 'meAvEn';
  return list.some(c => { const st = _avRoot().by[c.id]; return !st || st[k] !== false; });
}

// 「我的 + 每个单聊联系人」胶囊行：一个会话一个池子（群聊不出现，BUGS #179）
function _avRenderOwners() {
  const bar = $('#avOwners');
  if (!bar) return;
  const chips = [{ id: 'me', name: _avMyName() || '我', avatar: _avMyAvatar() }]
    .concat(_avAvatars().map(c => ({ id: c.id, name: chatNameOf(c) || 'TA', avatar: chatAvatarOf(c) || '' })));
  bar.innerHTML = chips.map(x =>
    `<button type="button" class="av-chip${x.id === _avSel ? ' on' : ''}" data-av-owner-id="${escapeHTML(x.id)}"><span class="avatar av-chip-ava">${avatarHTML(x.avatar)}</span><span class="av-chip-name">${escapeHTML(x.name)}</span></button>`
  ).join('');
  const on = bar.querySelector('.av-chip.on');
  if (on) bar.scrollLeft = on.offsetLeft - (bar.clientWidth - on.offsetWidth) / 2;   // 水平居中选中胶囊（不动页面纵向滚动）
}

// 「我的」面的子选择排（BUGS #407）：在编哪一本池。通用＝全网那份；每位名下一本专属，
// 空池起步（「从通用池复制」一键搬过来）。群聊不出现（整族退出本功能，BUGS #179）
function _avMineRowHTML() {
  const list = _avAvatars();
  if (!list.length) return '';
  const chip = (id, label) => `<button type="button" class="av-mine-chip${_avMineSel === id ? ' on' : ''}" data-av-mine="${escapeHTML(id)}">${escapeHTML(label)}</button>`;
  return `<div class="av-mine-row"><span class="av-mine-cap">这本池子</span>`
    + chip('global', '通用')
    + list.map(c => chip(c.id, '对' + (chatNameOf(c) || 'TA'))).join('')
    + `</div>`;
}

// 页头预览 + 库计数（换名/换头像/切换对象后实时刷新）
function _avSyncHead() {
  const ta = _avSel !== 'me';
  const mc = ta ? null : _avMineContact();
  const pool = ta ? (_avPool() || _avNewPool()) : _avMinePool();
  const ka = $('#avKindAvatarBtn'), kn = $('#avKindNickBtn'), ki = $('#avKindImprBtn');
  if (ka) ka.textContent = `头像库（${pool.av.length}）`;
  if (kn) kn.textContent = `昵称库（${pool.nicks.length}）`;
  // 第三枚 chip 上那个数与「印象簿」那一面顶部那个数是同一把尺（都走 _avImprLedgerEntries）——
  // 各算一次就会一处截断一处不截，屏上两个「条数」对不上（#265 那族「说的数与点进去看到的数必须一致」）
  if (ki) ki.textContent = `印象簿（${_avImprLedgerEntries().length}）`;
  // 预览画的是「此刻谁会看到什么」：通用那本＝全局那份；对某人那本＝那位实际看到的（覆盖位优先，回落全局）
  $('#avPageAva').innerHTML = avatarHTML(ta ? _avTaAvatar() : (mc ? chatMyAvatar(mc.id) : _avMyAvatar()));
  $('#avPageName').textContent = ta ? _avTaName() : (mc ? `我 · 对${chatNameOf(mc) || 'TA'}` : (_avMyName() || '我'));
  $('#avPageSub').textContent = ta
    ? '改的是 TA 在聊天里的形象（不是通讯录那份基础资料）'
    : (mc
      ? `改的是给「${chatNameOf(mc) || 'TA'}」看的形象——只对这一位生效，其他会话仍用通用那一份`
      : '改的是通用那一份：没单独设过的会话都用它；要只给某一位换，在下方「这本池子」切到那位名下');
  _avRenderOwners();
}

function renderAvatarlibPage() {
  if (_avSel !== 'me' && !_avSelContact()) _avSel = 'me';   // 联系人已删除／是群 → 回退到「我的」
  if (_avMineSel !== 'global' && !_avMineContact()) _avMineSel = 'global';   // 专属本的主人没了 → 回通用
  _avRenderPane();
}

function _avRenderPane() {
  const isNick = _avKind === 'nick', ta = _avSel !== 'me';
  const pool = _avPool() || _avNewPool();
  _avSyncHead();
  $$('#avKinds .av-kind').forEach(b => b.classList.toggle('on', b.dataset.avKind === _avKind));
  // 「印象簿」那一面走另一套排布（它是流水账，不是素材池），提前收口：上面那两处公共前置都已跑过
  // （_avSyncHead 要更新三枚 chip 的计数、kind 高亮要跟着切），故分支只能放在这两行之后。
  if (_avKind === 'impr') { $('#avBody').innerHTML = _avLedgerHTML(); return; }

  // 我这一面：触发者是谁要显示出来（事件驱动下换我的形象是有名有姓的人干的）
  const whoName = ta ? '' : (_avImprWho(pool[isNick ? 'nickLastWho' : 'avLastWho']) || '');
  // 那一面的来由存在 me 池上（素材与档位也住那儿），读上次时挂到「上次」后面
  const meLastWhy = ta ? '' : (pool[isNick ? 'meNickLastWhy' : 'meAvLastWhy'] || '');
  // swKey 用 meAvRate/meNickRate：这个面上的总闸不是 me 池那一份，而是**按人**存在 by[cid].meAvEn/meNickEn
  // （事件驱动下「谁给我换的」必须按人，否则又退回全局一份＝此刻开着的那个人的）
  const meSw = isNick ? 'meNickRate' : 'meAvRate';
  const rate = _avRateHTML(
    isNick ? 'TA 主动给我换昵称' : 'TA 主动给我换头像',
    meSw, (ta ? pool[isNick ? 'nickEn' : 'avEn'] : _avMeAnyEn(isNick)),
    _avRateOf(pool, isNick), pool[isNick ? 'nickLast' : 'avLast'], whoName,
    isNick ? 'nickRate' : 'avRate', meLastWhy);   // 档位与素材同住 me 池（dataKey 说的是「池子上哪个键」）

  let html = '';
  if (!isNick && ta) {
    html = _avRateHTML('TA 自己换头像', 'avEn', pool.avEn, _avRateOf(pool, false), pool.avLast, '', 'avRate', pool.avLastWhy)
      + '<div class="av-note">改的是 <b>TA 在聊天里的头像</b>：聊天窗口与首页那一行的头像跟着换；信箱横幅仍显示原本的头像。想固定头像可在 设置 → 资料里改。</div>'
      + (pool.av.length ? `<div class="av-grid">${pool.av.map((s, i) => `<div class="av-cell${s === _avTaAvatar() ? ' on' : ''}" data-av-idx="${i}"><img src="${escapeHTML(s)}" alt="头像" loading="lazy">${_avImprBadge(pool.av, i, false)}<button type="button" class="av-cell-del" data-av-del="${i}" aria-label="删除这张头像">×</button></div>`).join('')}</div>` : '<div class="av-empty">还没有头像，点下方按钮从相册添加</div>')
      + `<div class="av-actions"><button type="button" class="av-btn" data-av-act="add-av-ta">${_AV_ICON_UP}添加头像</button><button type="button" class="av-btn danger" data-av-act="clear-av-ta">${_AV_ICON_TRASH}清空</button></div>`;
  } else if (!isNick && !ta) {
    // 「我的」面（BUGS #407）：网格画的是**在编的那本**（通用 or 对某人专属），
    // 高亮与印象角标都对着「这本池子服务的那一位」实际看到的样子；节奏块仍读全局 me 池（自动换的钟不跟素材走）
    const mpool = _avMinePool();
    const mc = _avMineContact();
    const cur = mc ? chatMyAvatar(mc.id) : _avMyAvatar();
    const holders = mc ? [mc.id] : null;
    const copyBtn = mc ? `<button type="button" class="av-btn" data-av-act="copy-mine">${_AV_ICON_PLUS}从通用池复制</button>` : '';
    html = rate
      + _avMineRowHTML()
      + (mpool.av.length ? `<div class="av-grid">${mpool.av.map((s, i) => `<div class="av-cell${s === cur ? ' on' : ''}" data-av-idx="${i}"><img src="${escapeHTML(s)}" alt="头像" loading="lazy">${_avImprBadge(mpool.av, i, false, holders)}<button type="button" class="av-cell-del" data-av-del="${i}" aria-label="删除这张头像">×</button></div>`).join('')}</div>` : (mc ? '<div class="av-empty">这本还是空的：点「从通用池复制」搬一份过来，或自己添加</div>' : '<div class="av-empty">还没有头像，点下方按钮从相册添加</div>'))
      + `<div class="av-actions"><button type="button" class="av-btn" data-av-act="add-av-me">${_AV_ICON_UP}添加我的头像</button>${copyBtn}<button type="button" class="av-btn danger" data-av-act="clear-av-me">${_AV_ICON_TRASH}清空</button></div>`;
  } else if (isNick && ta) {
    html = _avRateHTML('TA 自己换昵称', 'nickEn', pool.nickEn, _avRateOf(pool, true), pool.nickLast, '', 'nickRate', pool.nickLastWhy)
      // 2026-10-13 #346：这句说明跟着双昵称拆分改口——这里换的只影响聊天那一屏，其他功能读「固定昵称」
      + '<div class="av-note">改的是 <b>TA 在聊天里的名字</b>：聊天窗口与首页那一行跟着换。字卡库、信箱、世界感知等其他功能用的是「固定昵称」（去聊天页右上角 → TA 的设置里改），不随这里换。</div>'
      + (pool.nicks.length ? `<div class="av-names">${pool.nicks.map((n, i) => `<div class="av-name-cell${n === _avTaName() ? ' on' : ''}" data-nick-idx="${i}"><span class="av-name-txt">${escapeHTML(n)}</span>${_avImprBadge(pool.nicks, i, true)}<button type="button" class="av-name-del" data-nick-del="${i}" aria-label="删除这条昵称">×</button></div>`).join('')}</div>` : '<div class="av-empty">还没有昵称，点下方按钮添加</div>')
      + `<div class="av-actions"><button type="button" class="av-btn" data-av-act="add-nick-ta">${_AV_ICON_PLUS}添加昵称（一行一个）</button><button type="button" class="av-btn danger" data-av-act="clear-nick-ta">${_AV_ICON_TRASH}清空</button></div>`;
  } else {
    // 「我的」昵称面：分本同头像那支（BUGS #407）
    const mpool = _avMinePool();
    const mc = _avMineContact();
    const cur = mc ? chatMyName(mc.id) : _avMyName();
    const holders = mc ? [mc.id] : null;
    const copyBtn = mc ? `<button type="button" class="av-btn" data-av-act="copy-mine">${_AV_ICON_PLUS}从通用池复制</button>` : '';
    html = rate
      + _avMineRowHTML()
      + '<div class="av-note">' + (mc
        ? `改的是<b>给「${escapeHTML(chatNameOf(mc) || 'TA')}」看的名字</b>：只对这一位生效，其他会话仍用通用那一份。`
        : '改的是 <b>我的名字（默认那一份）</b>：没单独设过的会话都用它，信箱也用它。要只给某一位换，在上方「这本池子」切到那位名下。') + '</div>'
      + (mpool.nicks.length ? `<div class="av-names">${mpool.nicks.map((n, i) => `<div class="av-name-cell${n === cur ? ' on' : ''}" data-nick-idx="${i}"><span class="av-name-txt">${escapeHTML(n)}</span>${_avImprBadge(mpool.nicks, i, true, holders)}<button type="button" class="av-name-del" data-nick-del="${i}" aria-label="删除这条昵称">×</button></div>`).join('')}</div>` : (mc ? '<div class="av-empty">这本还是空的：点「从通用池复制」搬一份过来，或自己添加</div>' : '<div class="av-empty">还没有昵称，点下方按钮添加</div>'))
      + `<div class="av-actions"><button type="button" class="av-btn" data-av-act="add-nick-me">${_AV_ICON_PLUS}添加我的昵称（一行一个）</button>${copyBtn}<button type="button" class="av-btn danger" data-av-act="clear-nick-me">${_AV_ICON_TRASH}清空</button></div>`;
  }
  $('#avBody').innerHTML = html;
}

// 点选换头像后只同步高亮，不重建网格（避免已解码图片重载闪烁）
function _avSyncHighlight() {
  const isNick = _avKind === 'nick', ta = _avSel !== 'me';
  const body = $('#avBody');
  const pool = (ta ? _avPool() : _avMinePool()) || _avNewPool();
  const mc = ta ? null : _avMineContact();
  if (isNick) {
    const cur = ta ? _avTaName() : (mc ? chatMyName(mc.id) : _avMyName());
    body.querySelectorAll('.av-name-cell').forEach(c => c.classList.toggle('on', pool.nicks[Number(c.dataset.nickIdx)] === cur));
  } else {
    const cur = ta ? _avTaAvatar() : (mc ? chatMyAvatar(mc.id) : _avMyAvatar());
    body.querySelectorAll('.av-cell').forEach(c => c.classList.toggle('on', pool.av[Number(c.dataset.avIdx)] === cur));
  }
}

// ===== 手动点选 =====
// 手动换过一次就把这一格的热度清零：用户刚亲手定下的形象，不该几小时后再被自动换掉。
// 攒着的 Why 清空，手动换的 lastWhy 也**显式置空**——不写这一句的话，上一次自动换留下的来由
// 会挂在「刚刚」那一次头上（「上次 刚刚 · TA 给你写了信」，而这一次的实情是你自己点的，
// 与那封信毫无关系）。这与「屏上一句假话」是同一族，宁可空着。
function _avManualMark(pool, isNick, who, lastWhy) {
  if (isNick) { pool.nickHeat = 0; pool.nickWhy = ''; pool.nickLast = Date.now(); pool.nickLastWho = who || ''; pool.nickLastWhy = lastWhy || ''; }
  else { pool.avHeat = 0; pool.avWhy = ''; pool.avLast = Date.now(); pool.avLastWho = who || ''; pool.avLastWhy = lastWhy || ''; }
}
function _avPickTaAvatar(src) {
  const pool = _avPool();
  const c = _avSelContact();
  if (!pool || !c || !pool.av.includes(src)) return;
  const name = chatNameOf(c) || 'TA';
  const invite = Math.random() * 100 < AV_INVITE_PROB;
  const agree = Math.random() * 100 < AV_AGREE_PROB;
  _avManualMark(pool, false, c.id);
  if (invite && !agree) {
    _avSysFor(c.id, `${name} 拒绝了我换头像的邀请，头像保持不变`, src);
    save();
    _avSyncHighlight();
    showToast(`${name} 不想换头像`);
    return;
  }
  if (invite) _avSysFor(c.id, `${name} 同意了我换头像的邀请`, src);
  else { _avSysFor(c.id, `我更换了${name}的头像`, src); showToast('头像已切换'); }
  _avApplyTaAvatar(src);
  _avImpress(src, false, c.id, '', 'impressSelf');   // TA 穿上我选的头像后，TA 对自己新头像的印象
}

function _avPickMyAvatar(src) {
  const pool = _avMinePool();
  if (!pool.av.includes(src)) return;
  // 分本（BUGS #407）：通用那本换了落全局 data.me.avatar（没单独设过的会话都跟着变）；
  // 对某人那本换了只写那位的 myChatAvatar 覆盖位，系统行也只落那一位的会话流
  const cid = _avMineSel === 'global' ? null : _avMineSel;
  if (cid) _avSysFor(cid, '我更换了自己的头像（只对这一位生效）', src);
  else _avSys('我更换了自己的头像', src);
  showToast(cid ? '头像已切换（只对这一位生效）' : '头像已更换');
  _avApplyMyAvatar(src, cid);
  _avImpress(src, false, cid);   // TA 对我的新头像的印象（对某人那本记在那位名下）
}

function _avPickTaNick(name) {
  const pool = _avPool();
  const c = _avSelContact();
  if (!pool || !c || !pool.nicks.includes(name)) return;
  const cur = chatNameOf(c) || 'TA';
  const invite = Math.random() * 100 < AV_INVITE_PROB;
  const agree = Math.random() * 100 < AV_AGREE_PROB;
  _avManualMark(pool, true, c.id);
  if (invite && !agree) {
    _avSysFor(c.id, `${cur} 拒绝了我的换昵称邀请，名字保持不变`);
    save();
    _avSyncHighlight();
    showToast(`${cur} 不想换昵称`);
    return;
  }
  if (invite) _avSysFor(c.id, `${cur} 同意了我的换昵称邀请，昵称换成了「${name}」`);
  else { _avSysFor(c.id, `我把${cur}的昵称换成了「${name}」`); showToast('昵称已切换'); }
  _avApplyTaNick(name);
  _avImpress(name, true, c.id, '', 'impressSelf');   // TA 用上我选的昵称后，TA 对自己新昵称的印象
}

function _avPickMyNick(name) {
  const pool = _avMinePool();
  if (!pool.nicks.includes(name)) return;
  const cid = _avMineSel === 'global' ? null : _avMineSel;
  if (cid) _avSysFor(cid, `我把自己的昵称换成了「${name}」（只对这一位生效）`);
  else _avSys(`我把自己的昵称换成了「${name}」`);
  showToast(cid ? '昵称已切换（只对这一位生效）' : '昵称已更换');
  _avApplyMyNick(name, cid);
  _avImpress(name, true, cid);   // TA 对我的新昵称的印象（对某人那本记在那位名下）
}

// ===== 添加 / 删除 / 清空 =====
// 「添加昵称」的输入面板：TA 那一面与「我的」那一面共用同一块面板，_avNickSide 记这次开的是哪一面。
// 面板只是拿字的地方——拿回来之后那条链（拆行 → _avCleanNick → 去重 → save → 重画 → 提示）与旧 prompt 一字未改。
let _avNickSide = 'ta';
function _avOpenNickSheet(side) {
  _avNickSide = side === 'me' ? 'me' : 'ta';
  const ta = _avNickSide !== 'me';
  if (ta && !_avSelContact()) return;   // TA 那一面没选中人＝没有池子，不开面板（不留一块填了也存不进去的输入框）
  const ti = $('#avNickTi'), input = $('#avNickInput');
  if (ti) ti.textContent = ta ? '添加昵称' : '添加我的昵称';
  if (input) input.value = '';          // 每次开都是新的一批：上一批凡能进的已进池，留着只会被再读一遍
  $('#avNickMask').hidden = false;
  if (input) setTimeout(() => { try { input.focus(); } catch (e) {} }, 60);   // 与建群表单同款：等这一帧排完再要键盘
}
function _avCloseNickSheet() { const m = $('#avNickMask'); if (m) m.hidden = true; }
function _avSubmitNickSheet() {
  const input = $('#avNickInput');
  const raw = input ? input.value : '';
  if (!String(raw).trim()) { showToast('先写一两个昵称'); return; }   // 空着点「添加」给一句实话，不是没反应
  _avAddNicks(raw);
}
function _avAddNicks(raw) {
  const lines = String(raw).split(/\r\n|\r|\n|\u2028|\u2029/).map(_avCleanNick).filter(Boolean);
  if (!lines.length) { showToast('没有可添加的昵称'); return; }
  const pool = _avNickSide === 'ta' ? _avPool() : _avMinePool();   // 我这一面落「在编的那本」（BUGS #407）
  if (!pool) return;
  let added = 0, dup = 0;
  lines.forEach(n => { if (pool.nicks.includes(n)) { dup++; return; } pool.nicks.push(n); added++; });
  save();
  _avRenderPane();
  showToast(added ? `已添加 ${added} 个昵称${dup ? `，${dup} 个已存在` : ''}` : '昵称都已经在池子里了');
  _avCloseNickSheet();
}

// 头像上传输入框（常驻挂 body，多选，压缩口径与设置页头像一致：256 边）
const _avFileInput = document.createElement('input');
_avFileInput.type = 'file';
_avFileInput.accept = 'image/*';
_avFileInput.multiple = true;
_avFileInput.style.display = 'none';
document.body.appendChild(_avFileInput);
_avFileInput.addEventListener('change', async () => {
  const files = Array.from(_avFileInput.files || []);
  _avFileInput.value = '';
  const side = _avFileSide;
  _avFileSide = null;
  if (!files.length || !side) return;
  const pool = side === 'ta' ? _avPool() : _avMinePool();   // 我这一面落「在编的那本」（BUGS #407）
  if (!pool) return;
  let added = 0;
  for (const f of files) {
    const src = await fileData(f, 256);
    if (!src) continue;
    if (!pool.av.includes(src)) { pool.av.push(src); added++; }
  }
  save();
  _avRenderPane();
  showToast(added ? `已添加 ${added} 张头像` : '没有添加新头像');
});

// ===== TA 主动给我换（弹窗邀请，必须点同意/拒绝） =====
// cid = 发起邀请的那一位（旧写法用 chatPartnerName() + _avSys 落进「此刻开着的那本」，
// 于是小七的邀请可能端到阿吉的会话里说——#165/#156/#091「延迟回调读此刻」那一族的第八处）
let _avInviteCb = null;
function _avShowInvite(kind, val, cid, why) {
  const c = _avContactById(cid);
  if (!c || c.kind === 'group') return;
  const name = chatNameOf(c) || 'TA';
  const isAv = kind === 'avatar';
  $('#avInviteTitle').textContent = `${name}想给你换个${isAv ? '头像' : '昵称'}`;
  // 副标题带上「因为什么」：这一句是事件驱动的来由，也是用户决定同意/拒绝时唯一能参考的信息
  $('#avInviteSub').textContent = (why ? why + ' · ' : '') + (isAv ? '同意后立即换上新头像，拒绝则保持现在的样子' : '同意后你的昵称会立即更换，拒绝则保持不变');
  $('#avInvitePreview').innerHTML = isAv ? `<img src="${escapeHTML(val)}" alt="新头像">` : `<span>${escapeHTML(val)}</span>`;
  $('#avInviteMask').hidden = false;
  _avInviteCb = (ok) => {
    $('#avInviteMask').hidden = true;
    _avInviteCb = null;
    const pool = _avMePool();
    // 只重置被回应的那一格：旧写法头像与昵称两个 next 一起刷，答一个头像顺带把昵称的钟也拨了
    _avManualMark(pool, !isAv, c.id);
    if (!ok) {
      _avSysFor(c.id, isAv ? `我拒绝了${name}的换头像邀请` : `我拒绝了${name}的换昵称邀请，昵称保持不变`);
      save();
      if (c.id === data.activeChat) renderMessages();
      return;
    }
    if (isAv) {
      _avSysFor(c.id, `我同意了${name}的换头像邀请${why ? '（' + why + '）' : ''}`, val);
      _avApplyMyAvatar(val, c.id);
      _avImpress(val, false, c.id, why);   // TA 给我挑的形象，TA 自己的印象
    } else {
      _avSysFor(c.id, `我同意了${name}的换昵称邀请，昵称换成了「${val}」${why ? '（' + why + '）' : ''}`);
      _avApplyMyNick(val, c.id);
      _avImpress(val, true, c.id, why);
    }
  };
}

// ===== 节奏调度（并入信箱 30s tick）：事件驱动，不再是「每隔 N 小时」 =====
// 换不换只看四道闸，全过才换：① 总闸开着 ② 这一格热度攒够当前档位的 need ③ 夜里不换 ④ 当日没超档位的 max
// 热度由唯一的写手 avlibFeed 攒（TA 做了什么），不再由钟自己凭空产生——旧模型一天能换十几次，
// 凌晨三点也会弹「TA 更换了头像」，而且换完留下一句「TA 换了头像」却没有任何前因。
function _avDayKey(ts) { const d = ts ? new Date(ts) : new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
function _avQuietNow() { const h = new Date().getHours(); return h >= AV_QUIET_FROM || h < AV_QUIET_TO; }
// 四道闸：① 总闸开着 ② 热度攒够当前档位的 need ③ 夜里不换 ④ 当日没超档位的 max。
// pfx 是**完整前缀**：'meAv'／'meNick'（字段就叫 meAvEn/meAvDay/meAvHeat，首字母已大写）。
// 不传时用 sfx（'av'／'nick'）拼出 avEn/avDay/avHeat。两种拼法必须分别写死——
// 本函数第一版把 pfx 当成「还要再接 Av/Nick」拼，得出 meAvAvEn 这种不存在的键，
// 于是那一侧的闸门恒闭（量具 D 段四条一起红才暴露出来）。
function _avRateGate(pool, isNick, pfx) {
  const en = pfx ? pool[pfx + 'En'] : pool[(isNick ? 'nick' : 'av') + 'En'];
  if (!en) return null;
  const rate = _avRateOf(pfx ? _avMePool() : pool, isNick);
  if (_avQuietNow()) return null;               // 夜里只攒不换
  const cfg = AV_RATES[rate];
  const sfx = isNick ? 'nick' : 'av';
  const dayK = pfx ? pfx + 'Day' : sfx + 'Day';
  const dayN = pfx ? pfx + 'DayN' : sfx + 'DayN';
  if (pool[dayK] !== _avDayKey()) { pool[dayK] = _avDayKey(); pool[dayN] = 0; }
  if ((Number(pool[dayN]) || 0) >= cfg.max) return null;
  const heat = Number(pool[pfx ? pfx + 'Heat' : sfx + 'Heat']) || 0;
  if (heat < cfg.need) return null;
  return cfg;
}
// 「因为什么换的」这句只在**同一自然日**内成立：夜里只攒不换（_avQuietNow 那道闸），攒够可能已是几天之后，
// 把几天前那通电话当成此刻换头像的原因＝一句假话（屏上一句话还成不成立，历轮那几把颜色／版式尺子从没扫过这一类）。
// 判据沿用当日次数那把闸的同一把尺 _avDayKey，不猜「大概还算新」；旧档没有时刻＝不知道事发生在哪天，也宁可不写。
function _avWhyFresh(pool, key) {
  const txt = pool && typeof pool[key] === 'string' ? pool[key] : '';
  if (!txt) return '';
  const at = Number(pool[key + 'At']) || 0;
  return at && _avDayKey(at) === _avDayKey() ? txt : '';
}
function _avCharge(pool, isNick, cfg, why) {
  const heatK = isNick ? 'nickHeat' : 'avHeat', dayN = isNick ? 'nickDayN' : 'avDayN';
  pool[heatK] = 0;
  pool[dayN] = (Number(pool[dayN]) || 0) + 1;
  pool[isNick ? 'nickLast' : 'avLast'] = Date.now();
  // 「因为什么换的」随这次兑现一起转存到 LastWhy 并清空攒着的 Why：
  // 面板上的「上次」读的是 LastWhy（换完还在），攒着的 Why 只是还没兑现的那一段。
  pool[isNick ? 'nickWhy' : 'avWhy'] = '';
  pool[isNick ? 'nickWhyAt' : 'avWhyAt'] = 0;      // 时刻跟着那句一起清，留着它下一段来由会被判成过期
  pool[isNick ? 'nickLastWhy' : 'avLastWhy'] = why || '';
}
// 刚换过形象之后的一段时间里，本会话的 partner 消息不再攒热度。
// 没有这道闸会自喂循环：换形象 → 留下印象 → 印象经 _deliverToChat 投递 → 又攒热度 → 再换，
// 一次换完当天上限立刻被自己打满，之后一整天锁死（量具 B3 抓到的就是这条）。
const AV_COOLDOWN_MS = 30 * 60 * 1000;
function _avInCooldown(cid) {
  const st = _avRoot().by[cid];
  if (!st) return false;
  const now = Date.now();
  return ['avLast', 'nickLast'].some(k => { const t = Number(st[k]) || 0; return t > 0 && now - t < AV_COOLDOWN_MS; });
}
// 从池子里抽一个和当前不同的：抽到相同的不重排期（旧写法直接 return，下一个 30s tick 再撞一次，
// 池里只有一张图时变成永久空转）。这里一次跳过当前值，抽不出就安静收手。
function _avPickOther(list, cur) {
  const pool = (Array.isArray(list) ? list : []).filter(x => x && x !== cur);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

// 事件写手：任何功能在**投递** TA 的动作时调它，带权重与事件种类。
// kind 决定两件事：攒多少点（weight）、以及屏上读得到的「因为什么」（AV_WHY 那句短语）。
// 群聊不参与本功能，直接不记。
function avlibFeed(cid, weight, kind) {
  const c = _avContactById(cid);
  if (!c || c.kind === 'group') return;
  const w = Number(weight) || 0;
  if (w <= 0) return;
  const stored = _avRoot().by[cid];
  if (!stored || typeof stored !== 'object') return;
  if (_avInCooldown(cid)) return;   // 刚换过：这段时间里发生的事不再攒（切断自喂循环，见 _avInCooldown）
  const whyTa = _avWhyText('ta', kind), whyMe = _avWhyText('me', kind), at = Date.now();
  // 每记一句来由同时记下**那一刻**（*WhyAt）：兑现可能落在几天之后（夜里只攒不换、白天要等热度攒够），
  // 没有时刻就无从判断这句还成不成立——读侧一律走 _avWhyFresh，跨了自然日就当没说过。
  if (stored.avEn !== false) { stored.avHeat = (Number(stored.avHeat) || 0) + w; if (whyTa) { stored.avWhy = whyTa; stored.avWhyAt = at; } }
  if (stored.nickEn !== false) { stored.nickHeat = (Number(stored.nickHeat) || 0) + w; if (whyTa) { stored.nickWhy = whyTa; stored.nickWhyAt = at; } }
  // 我那一格的热度也记在这一位名下（meAvHeat/meNickHeat）——「TA 主动给我换」必须知道是谁干的，
  // 全局 me 池只有一个钟的旧写法，收到的提示会端到此刻开着的那个人的会话里。
  if (stored.meAvEn !== false) { stored.meAvHeat = (Number(stored.meAvHeat) || 0) + w; if (whyMe) { stored.meAvWhy = whyMe; stored.meAvWhyAt = at; } }
  if (stored.meNickEn !== false) { stored.meNickHeat = (Number(stored.meNickHeat) || 0) + w; if (whyMe) { stored.meNickWhy = whyMe; stored.meNickWhyAt = at; } }
}

function _avTickTaAv(cid) {
  const stored = _avRoot().by[cid];
  const c = _avContactById(cid);
  if (!stored || !c || c.kind === 'group' || !stored.av.length) return;
  const cfg = _avRateGate(stored, false);
  if (!cfg) return;
  const src = _avPickOther(stored.av, chatAvatarOf(c) || '');
  if (!src) return;
  const why = _avWhyFresh(stored, 'avWhy');
  _avCharge(stored, false, cfg, why);
  // 系统消息里带上「因为什么」：事件驱动换掉钟之后，这句是用户能看见的前因（跨了自然日就不印，见 _avWhyFresh）。
  // 后半段挂 TA 自己的看法（2026-10-12 定档·丙）：原先这一行只有事件、看法另说一句，两件事隔着一整条聊天。
  const impr = _avMakeImpr(src, false, cid, why, 'impressSelf');   // TA 对自己新头像的印象
  _avSysFor(cid, `${chatNameOf(c) || 'TA'} 更换了头像${why ? '（' + why + '）' : ''}${impr ? ' · ' + impr : ''}`, src, _avImprKey(src, false));
  c.chatAvatar = src;
  _avAfterChange(cid);
  _avSayImpr(cid, impr);
}

function _avTickTaNick(cid) {
  const stored = _avRoot().by[cid];
  const c = _avContactById(cid);
  if (!stored || !c || c.kind === 'group' || !stored.nicks.length) return;
  const cfg = _avRateGate(stored, true);
  if (!cfg) return;
  const name = _avPickOther(stored.nicks, chatNameOf(c));
  if (!name) return;
  const cur = chatNameOf(c) || 'TA';
  const why = _avWhyFresh(stored, 'nickWhy');
  _avCharge(stored, true, cfg, why);
  const impr = _avMakeImpr(name, true, cid, why, 'impressSelf');   // TA 对自己新昵称的印象
  _avSysFor(cid, `${cur} 把自己的昵称换成了「${name}」${why ? '（' + why + '）' : ''}${impr ? ' · ' + impr : ''}`, '', _avImprKey(name, true));
  c.chatName = name;
  _avAfterChange(cid);
  _avSayImpr(cid, impr);
}

// 我这一格：逐个单聊联系人各自掷（热度记在那一位自己名下的 meAvHeat／meNickHeat），
// 归册一律走 _avSysFor(cid) —— 谁干的活谁那里冒泡，不再落进此刻开着的会话；
// 换上的那一份也**只写这一位名下的覆盖**，别的人那里的我不动（2026-10-08 按会话分开）。
function _avTickMeAv(cid) {
  const stored = _avRoot().by[cid];
  const c = _avContactById(cid);
  const me = _avMePool();
  // 取池（BUGS #407）：那位名下有专属本就从专属本抽，没有才回落通用那本——
  // TA 给我换上的脸始终来自「我给它备的图」，专属开着的位不会拿到通用池里没给过它的脸。
  // 两本都空才 early-return：只开了专属的位，通用池空着也得能换
  const mine = _avMinePoolById(cid);
  const hasMine = !!(mine && Array.isArray(mine.av) && mine.av.length);
  if (!stored || !c || c.kind === 'group' || (!me.av.length && !hasMine)) return;
  const cfg = _avRateGate(stored, false, 'meAv');
  if (!cfg) return;
  const src = _avPickOther(hasMine ? mine.av : me.av, chatMyAvatar(cid));
  if (!src) return;
  const why = _avWhyFresh(stored, 'meAvWhy');
  const name = chatNameOf(c) || 'TA';
  if (Math.random() * 100 < AV_INVITE_PROB) { stored.meAvWhy = why; _avShowInvite('avatar', src, cid, why); return; }
  stored.meAvHeat = 0; stored.meAvWhy = ''; stored.meAvWhyAt = 0;
  stored.meAvDayN = (Number(stored.meAvDayN) || 0) + 1;
  stored.meAvLastWhy = why;
  const impr = _avMakeImpr(src, false, cid, why);
  _avSysFor(cid, `${name} 更换了我的头像${why ? '（' + why + '）' : ''}${impr ? ' · ' + impr : ''}`, src, _avImprKey(src, false));
  showToast(`${name}给你换了新头像`);
  _avManualMark(me, false, cid);
  _avApplyMyAvatar(src, cid);
  _avSayImpr(cid, impr);
}

function _avTickMeNick(cid) {
  const stored = _avRoot().by[cid];
  const c = _avContactById(cid);
  const me = _avMePool();
  const mine = _avMinePoolById(cid);   // 取池同头像那支：有专属用专属，没有回落通用（BUGS #407）
  const hasMine = !!(mine && Array.isArray(mine.nicks) && mine.nicks.length);
  if (!stored || !c || c.kind === 'group' || (!me.nicks.length && !hasMine)) return;
  const cfg = _avRateGate(stored, true, 'meNick');
  if (!cfg) return;
  const name = _avPickOther(hasMine ? mine.nicks : me.nicks, chatMyName(cid));
  if (!name) return;
  const why = _avWhyFresh(stored, 'meNickWhy');
  const who = chatNameOf(c) || 'TA';
  if (Math.random() * 100 < AV_INVITE_PROB) { stored.meNickWhy = why; _avShowInvite('nick', name, cid, why); return; }
  stored.meNickHeat = 0; stored.meNickWhy = ''; stored.meNickWhyAt = 0;
  stored.meNickDayN = (Number(stored.meNickDayN) || 0) + 1;
  stored.meNickLastWhy = why;
  const impr = _avMakeImpr(name, true, cid, why);
  _avSysFor(cid, `${who} 把我的昵称换成了「${name}」${why ? '（' + why + '）' : ''}${impr ? ' · ' + impr : ''}`, '', _avImprKey(name, true));
  showToast(`你的昵称被换成了「${name}」`);
  _avManualMark(me, true, cid);
  _avApplyMyNick(name, cid);
  _avSayImpr(cid, impr);
}

function avlibTick() {
  if (!isSchedulerLeader()) return;
  if (!$('#avInviteMask').hidden) return;   // 有邀请待回应时不再触发新的形象变动
  // 只遍历单聊：群聊整族退出本功能（BUGS #179）
  _avAvatars().forEach(c => { _avTickTaAv(c.id); _avTickTaNick(c.id); _avTickMeAv(c.id); _avTickMeNick(c.id); });
}

// ===== 事件绑定 =====
$('#avOwners').addEventListener('click', e => {
  const chip = e.target.closest('[data-av-owner-id]');
  if (!chip || chip.dataset.avOwnerId === _avSel) return;
  _avSel = chip.dataset.avOwnerId;
  _avMineSel = 'global';   // 换编辑对象＝子选择回通用（BUGS #407：那排子选择只属于「我的」面）
  _avRenderPane();
});
$('#avKinds').addEventListener('click', e => {
  const b = e.target.closest('.av-kind');
  if (!b || b.dataset.avKind === _avKind) return;
  _avKind = b.dataset.avKind;
  _avRenderPane();
});
$('#avBody').addEventListener('click', e => {
  // 「这本池子」子选择（BUGS #407）：切在编的那一本，整面重画
  const mineChip = e.target.closest('[data-av-mine]');
  if (mineChip) { _avMineSel = mineChip.dataset.avMine; _avRenderPane(); return; }
  const imp = e.target.closest('[data-av-impr],[data-nick-impr]');
  if (imp) {
    const isNick = imp.hasAttribute('data-nick-impr');
    const pool = _avSel === 'me' ? _avMinePool() : _avPool();
    const src = isNick ? pool.nicks[Number(imp.dataset.nickImpr)] : pool.av[Number(imp.dataset.avImpr)];
    // 「对某人」专属本上的角标只翻那一位名下的账（通用面才聚合大家的）
    if (src) _avShowImpr(src, isNick, (_avSel === 'me' && _avMineSel !== 'global') ? [_avMineSel] : null);
    return;
  }
  // 「印象簿」那一面的行＝一本账的入口（整行是按钮，热区天然够高）。点它翻开那一本，不在就地展开子列表：
  // 同一个对象可能攒到几十条，就地展开会把这一面撑成长条，而翻开那层贴底弹层已有现成的一份实现。
  const led = e.target.closest('[data-ledger-key]');
  if (led) { _avOpenImprPointer(led.dataset.ledgerCid, led.dataset.ledgerKey); return; }
  // 我这一面的增删点选都落在「在编的那本」上（BUGS #407）：通用＝data.avlib.me，对某人＝meBy[cid]
  const pool = _avSel === 'me' ? _avMinePool() : _avPool();
  const del = e.target.closest('[data-av-del]');
  if (del) {
    if (pool) { pool.av.splice(Number(del.dataset.avDel), 1); save(); _avRenderPane(); }
    return;
  }
  const ndel = e.target.closest('[data-nick-del]');
  if (ndel) {
    if (pool) { pool.nicks.splice(Number(ndel.dataset.nickDel), 1); save(); _avRenderPane(); }
    return;
  }
  const cell = e.target.closest('[data-av-idx]');
  if (cell) {
    const src = pool && pool.av[Number(cell.dataset.avIdx)];
    if (src) { if (_avSel !== 'me') _avPickTaAvatar(src); else _avPickMyAvatar(src); }
    return;
  }
  const ncell = e.target.closest('[data-nick-idx]');
  if (ncell) {
    const name = pool && pool.nicks[Number(ncell.dataset.nickIdx)];
    if (name) { if (_avSel !== 'me') _avPickTaNick(name); else _avPickMyNick(name); }
    return;
  }
  const act = e.target.closest('[data-av-act]');
  if (!act) return;
  const a = act.dataset.avAct;
  if (a === 'add-av-ta' || a === 'add-av-me') {
    _avFileSide = a === 'add-av-ta' ? 'ta' : 'me';
    if (_avFileSide === 'ta' && !_avSelContact()) { _avFileSide = null; return; }
    _avFileInput.click();
  } else if (a === 'add-nick-ta') _avOpenNickSheet('ta');
  else if (a === 'add-nick-me') _avOpenNickSheet('me');
  else if (a === 'copy-mine') {
    // 专属本空池起步的一键搬家：把通用那本里没有的搬过来，已有的不重复（BUGS #407）
    if (_avMineSel === 'global') return;
    const isNick = _avKind === 'nick';
    const g = _avMePool(), dst = _avMinePool();
    const srcList = isNick ? g.nicks : g.av, dstList = isNick ? dst.nicks : dst.av;
    let n = 0;
    srcList.forEach(x => { if (dstList.indexOf(x) < 0) { dstList.push(x); n++; } });
    save();
    _avRenderPane();
    showToast(n ? `已从通用池复制 ${n} ${isNick ? '条' : '张'}` : '通用池里的都在这本里了');
  }
  else if (a === 'clear-av-ta' || a === 'clear-av-me' || a === 'clear-nick-ta' || a === 'clear-nick-me') {
    openModal('清空这个池子', '', () => {
      const isNick = a.indexOf('nick') >= 0;
      const cpool = _avSel === 'me' ? _avMinePool() : _avPool();
      if (!cpool) return;
      if (isNick) { cpool.nicks = []; cpool.nickLast = 0; cpool.nickHeat = 0; cpool.nickDayN = 0; cpool.nickLastWho = ''; cpool.nickWhy = ''; cpool.nickLastWhy = ''; }
      else { cpool.av = []; cpool.avLast = 0; cpool.avHeat = 0; cpool.avDayN = 0; cpool.avLastWho = ''; cpool.avWhy = ''; cpool.avLastWhy = ''; }
      save();
      _avRenderPane();
      showToast('已清空');
    }, { noInput: true, staticText: '清空这个池子？删除后不可恢复。', okText: '清空', danger: true });
  }
});
$('#avBody').addEventListener('click', e => {
  // 档位 chips（关着时 disabled，点不动）。data-av-rate 记的是**档位数据的键名**：
  //   TA 那一面写 by[cid].avRate/nickRate；我那一面素材与档位同住 me 池，故写 me 的 avRate/nickRate。
  // 不能拿 swKey（总闸键）当 dataKey —— 那样点 chips 会去改总闸（量具 E4 抓的就是这条）。
  const rt = e.target.closest('[data-av-rate]');
  if (rt) {
    const pool = _avPool();
    const key = rt.dataset.avRate, v = Number(rt.dataset.avRateV);
    if (!pool || !(v in AV_RATES) || !(key in pool)) return;
    pool[key] = v;
    save();
    _avRenderPane();
    return;
  }
});
$('#avBody').addEventListener('change', e => {
  const t = e.target.closest('[data-av-toggle]');
  if (!t) return;
  const key = t.dataset.avToggle;
  const pool = _avPool();
  if (!pool) return;
  if (key === 'meAvRate' || key === 'meNickRate') {
    // 我这一面的总闸按**做这件事的那一位**存（by[cid].meAvEn/meNickEn），不再是全局一份
    const isNick = key === 'meNickRate';
    _avAvatars().forEach(c => {
      const st = _avRoot().by[c.id] || _avPoolById(c.id);
      st[isNick ? 'meNickEn' : 'meAvEn'] = t.checked;
      if (!t.checked) { st[isNick ? 'meNickHeat' : 'meAvHeat'] = 0; st[isNick ? 'meNickDayN' : 'meAvDayN'] = 0; }
    });
    save();
    _avRenderPane();
    return;
  }
  if (key in pool) {
    pool[key] = t.checked;
    if (!t.checked) { pool[key === 'avEn' ? 'avHeat' : 'nickHeat'] = 0; pool[key === 'avEn' ? 'avDayN' : 'nickDayN'] = 0; }
    save();
    _avRenderPane();
  }
});
$('#avInviteYes').onclick = () => { if (_avInviteCb) _avInviteCb(true); };
$('#avInviteNo').onclick = () => { if (_avInviteCb) _avInviteCb(false); };
$('#avImprClose').onclick = () => { $('#avImprMask').hidden = true; };
$('#avImprMask').addEventListener('click', e => { if (e.target === $('#avImprMask')) $('#avImprMask').hidden = true; });

// 「添加昵称」面板的开合（BUGS #246，替掉旧的那一发 window.prompt）：
// 三种收回各管一件事——「添加」把字交出去并收起·「取消」与 × 与点遮罩空白都只是不要这批（与搜索半屏同一口径）
(function bindAvNickSheet() {
  const yes = $('#avNickYes'); if (yes) yes.onclick = _avSubmitNickSheet;
  const no = $('#avNickNo'); if (no) no.onclick = _avCloseNickSheet;
  const close = $('#avNickClose'); if (close) close.onclick = _avCloseNickSheet;
  const mask = $('#avNickMask');
  if (mask) mask.addEventListener('click', e => { if (e.target === mask) _avCloseNickSheet(); });
})();
