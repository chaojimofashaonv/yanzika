// ===== 朋友圈（ins 风单列流：题头行 → 整宽方图 → 动作行 → 赞数 → 正文 → 评论 → 时刻）=====
// 设置按【人】各一份（全局默认那份 ＋ 只存被单独调过的那一位，读侧唯一口径 _mmCfg(cid)），
// 与信箱 _mbCfg、播放器 _plCfg 同族＝新增一格自动跟随。提醒那一格（弹窗/系统通知）刻意留全局：
// 关了提醒就该对所有人生效，按人分会出现「关了 A、B 还在」（AGENTS §6 那条开关口径）。
// 发圈节奏照 mochi 定档＝固定概率 ＋ 每日上限（用户 2026-10-12 明文选的这一档，
// 与本仓「不要硬额度限次」相冲，按他定的做并记进台账）。
// 照片**不复任何滤镜**（2026-10-14 BUGS #427 用户定档取消低饱和，改回原色）：那层 saturate(.42)
// 让发的图与相册原图对不上（用户原话「莫名其妙有色差」）；发布时 `fileData(f, 800, 0.86)` 直通优先，
// 落在直通闸内的图一个像素都不重画＝ICC 色彩配置完整保留。这两条各修各的，别互相兜底。
let _momentInterval = null;
let _momentComposer = { mode: 'publish', momentId: null, commentId: null, imgs: [], sticker: '' };
let _mmFilter = 'all';        // 按谁筛（all / me / 联系人 id）＝阅读位置，不进 data
let _mmBucket = 'all';       // 月份分桶（all / week / 月份键 / older）
let _mmExpanded = {};        // 这一屏里哪几条展开了长正文
let _mmCmtOpen = {};         // 这一屏里哪几条展开了全部评论（正文与评论是两件事，各记一本）
let _mmShown = {};           // 每个桶画到哪一条（超出 200 条给「显示更多」）
let _mmStkFor = null;        // 贴纸面板此刻在给哪条动态挑贴纸
let _mmStkCur = '';          // 面板里选到哪一组（''＝全部）；只活在这一次打开里，不落账
let _mmStkItems = [];        // 面板当前列出的那些（屏上一格按序号找它＝不把整张 dataURL 塞进属性里）
let _mmPick = null;          // 选位态 {id, src, emoji}：贴在配图上的哪一处由手指点的那一下决定
const MM_RENDER_CAP = 200;
const MM_CMT_PREVIEW = 2;    // 一屏先给最近两条评论，更早的收进「查看全部」那一行
const MM_MAX_IMGS = 9;
const MM_NOTICE_MAX = 100;
const MM_FOLD_CHARS = 120;

// 全局默认那份 ＋ 只存被改过的那一位；缺字段一律由 defaults 兜住＝新增一格自动跟随
function _mmCfg(cid) {
  const base = Object.assign({}, (defaults && defaults.momentsSettings) || {});
  Object.assign(base, (data && data.momentsSettings) || {});
  const one = cid && data && data.momentsBy && data.momentsBy[cid];
  return (one && typeof one === 'object') ? Object.assign(base, one) : base;
}
function _mmSet(cid, patch) {
  if (!data.momentsBy) data.momentsBy = {};
  const cur = (data.momentsBy[cid] && typeof data.momentsBy[cid] === 'object') ? data.momentsBy[cid] : {};
  const next = Object.assign({}, cur);
  // patch 里值为 null 的那格＝从他自己那一本里摘掉＝恢复「跟随默认」（见 saveMomentsNow：改回与默认相同的值就是这个意思）
  Object.keys(patch).forEach(k => { if (patch[k] === null) delete next[k]; else next[k] = patch[k]; });
  if (Object.keys(next).length) data.momentsBy[cid] = next; else delete data.momentsBy[cid];
  save();
}
// 拼正文用的标点档＝这一位聊天里那一份（不新增一格设置＝朋友圈与聊天同一个「怎么把几张卡连起来」）
function _mmBh(cid) { return (data.chatSettings && data.chatSettings[cid]) || data.behavior; }
// 单聊名单（朋友圈是「人」的行为：群聊不建档也不发圈，同世界感知 #195 那条口径）
function _mmPeople() { return (data.contacts || []).filter(c => c && c.id && c.kind !== 'group'); }

function momentPool(category, cid) {
  // 取那一本字卡（公用＋绑给他的专属；绑定别人的组不进）
  return (data.groups || []).filter(g => g.category === category && groupUsableFor(g, cid)).flatMap(g => (g.cards || []).filter(c => !cardIsOff(g, c)));
}
function momentRand(min, max) { return min + Math.random() * (max - min); }
function momentPick(arr) { return arr.length ? arr[Math.floor(Math.random() * arr.length)] : ''; }
function momentName(author) {
  if (author === 'me') return chatMyName() || '我';
  const c = (data.contacts || []).find(x => x.id === author);
  if (c) return fixedNameOf(c);
  return data.profile && data.profile.name ? data.profile.name : TA_FALLBACK_NAME;   // 旧档那枚 'partner'
}
function momentAvatar(author) {
  if (author === 'me') return chatMyAvatar() || data.me.avatar || '';
  const c = (data.contacts || []).find(x => x.id === author);
  return c ? chatAvatarOf(c) : '';
}
// 「多久之前」：一小时内说分钟、一天内说小时、昨天说昨天、一周内说几天、更早交给桶标题去说
function _mmAgo(ts) {
  if (typeof ts !== 'number' || !isFinite(ts)) return '';
  const d = Date.now() - ts;
  if (d < 0) return '刚刚';
  if (d < 6e4) return '刚刚';
  if (d < 36e5) return Math.floor(d / 6e4) + ' 分钟前';
  if (d < 864e5) return Math.floor(d / 36e5) + ' 小时前';
  if (d < 1728e5) return '昨天';
  if (d < 6048e5) return Math.floor(d / 864e5) + ' 天前';
  const dt = new Date(ts);
  return (dt.getMonth() + 1) + ' 月 ' + dt.getDate() + ' 日';
}
// 分桶键：本周／各月／更早（分桶是收纳不是筛选：桶内仍按时间新在前）
function _mmBucketKey(ts) {
  if (typeof ts !== 'number' || !isFinite(ts)) return 'older';
  const now = new Date(), d = new Date(ts);
  const day = 864e5;
  if (Date.now() - ts < 7 * day) return 'week';
  const sameYear = d.getFullYear() === now.getFullYear();
  if (!sameYear && (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()) >= 7) return 'older';
  return 'm:' + d.getFullYear() + '-' + d.getMonth();
}
function _mmBucketLabel(key, ts) {
  if (key === 'week') return '本周';
  if (key === 'older') return '更早';
  const d = new Date(ts);
  return (d.getMonth() + 1) + ' 月' + (d.getFullYear() === new Date().getFullYear() ? '' : ' · ' + d.getFullYear());
}

// 组装某位 TA 的一条动态：字卡为基底，按概率叠加颜文字/emoji/表情包/图片
function composeMomentText(cid) {
  const s = _mmCfg(cid);
  const base = momentPool('主字卡', cid);
  if (!base.length) return null;
  const minN = Math.max(1, Number(s.minCardsInMoment) || 4);
  const maxN = Math.max(minN, Number(s.maxCardsInMoment) || 15);
  const n = Math.floor(momentRand(minN, maxN + 1));
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(base[Math.floor(Math.random() * base.length)]);
  let text = pyJoinCards(parts, _mmBh(cid));
  if (Math.random() * 100 < (Number(s.useKaomojiProb) || 0)) { const k = momentPick(momentPool('颜文字', cid)); if (k) text += ' ' + k; }
  if (Math.random() * 100 < (Number(s.useEmojiProb) || 0)) { const e = momentPick(momentPool('emoji', cid)); if (e) text += ' ' + e; }
  const imgs = [];
  const ps = partnerStickers(cid);
  if (Math.random() * 100 < (Number(s.useStickerProb) || 0) && ps.length) imgs.push(momentPick(ps));
  const pis = partnerImages(cid);
  if (Math.random() * 100 < (Number(s.useImageProb) || 0) && pis.length) imgs.push(momentPick(pis));
  return { text, imgs };
}

// 某位的评论内容：按概率多个字卡，最多 maxCardsInComment 条，可带表情包
function composeComment(cid) {
  const s = _mmCfg(cid);
  const base = momentPool('主字卡', cid);
  let text = '';
  if (base.length) {
    const multi = Math.random() * 100 < (Number(s.multiCardProbability) || 60);
    const n = multi ? Math.max(1, Math.floor(momentRand(1, Math.max(2, Number(s.maxCardsInComment) || 4) + 1))) : 1;
    const parts = [];
    for (let i = 0; i < n; i++) parts.push(base[Math.floor(Math.random() * base.length)]);
    text = pyJoinCards(parts, _mmBh(cid));
  }
  const c = { text };
  const ps = partnerStickers(cid);
  if (Math.random() * 100 < (Number(s.useStickerInComment) || 0) && ps.length) c.sticker = momentPick(ps);
  return c;
}

function todayCountMoments(cid) {
  const key = new Date().toLocaleDateString('zh-CN');
  return (data.moments || []).filter(m => m.author === cid && m.date === key).length;
}
function nextMomentTimestamp(cid) {
  const s = _mmCfg(cid);
  const minW = Math.max(1, Number(s.minPublishIntervalMin) || 90);
  const maxW = Math.max(minW, Number(s.maxPublishIntervalMin) || 480);
  return Date.now() + momentRand(minW, maxW) * 60000;
}
// 已到每日上限：排到明早 8~11 点之间现掷（不写死一个整点＝每天醒来同一刻必发显得像闹钟）
function _mmTomorrowAt() {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(8 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 60), 0, 0);
  return next.getTime();
}

function addMoment(author, content) {
  if (!Array.isArray(data.moments)) data.moments = [];
  const now = Date.now();
  const m = {
    id: nextId(),
    author,
    text: content.text || '',
    imgs: (content.imgs || []).filter(v => typeof v === 'string' && v).slice(0, MM_MAX_IMGS),
    ts: now,
    time: time(),
    date: new Date(now).toLocaleDateString('zh-CN'),
    likes: [],
    comments: []
  };
  data.moments.push(m);
  // 我发了条动态＝一件事：TA 从自己那本收藏里翻这条（收藏归按人那份，概率也读他那格）
  if (m.author === 'me') {
    const at = mainChatId();
    const p = Number(_mmCfg(at).taCollectProb) || 0;
    if (p > 0 && typeof maybeCollectByTa === 'function') maybeCollectByTa({ kind: 'feed', text: m.text || '', imgs: m.imgs.slice() }, p, at);
  }
  // TA 发了条朋友圈＝一件事，喂给头像昵称那个事件驱动的热度
  if (m.author !== 'me' && typeof avlibFeed === 'function' && typeof AV_HEAT_MOMENT !== 'undefined') avlibFeed(m.author, AV_HEAT_MOMENT, 'moment');
  return m;
}

function maybeMomentTick() {
  if (!isSchedulerLeader()) return;
  flushMomentReactions();   // 持久化的互动排期到点即执行（页面隐藏冻结，回前台补执行）
  if (!data._nextMomentAtBy || typeof data._nextMomentAtBy !== 'object') data._nextMomentAtBy = {};
  const people = _mmPeople();
  const now = Date.now();
  let touched = false;
  for (const c of people) {
    const cid = c.id;
    const s = _mmCfg(cid);
    if (typeof data._nextMomentAtBy[cid] !== 'number') { data._nextMomentAtBy[cid] = now + momentRand(120, 600) * 1000; touched = true; continue; }  // 首轮只摊起点不投递
    const at = data._nextMomentAtBy[cid];
    if (now < at) continue;
    // 后台冻结/离开期间错过的圈不补发：超过宽限期视为过期，重新排期
    if (now - at > _SCHED_GRACE_MS) { data._nextMomentAtBy[cid] = nextMomentTimestamp(cid); touched = true; continue; }
    data._nextMomentAtBy[cid] = now + 10 * 60000;   // 掷之前先挪开＝同一位不被相邻两轮各掷一次
    touched = true;
    if (s.postEnabled === false) { data._nextMomentAtBy[cid] = nextMomentTimestamp(cid); continue; }
    const daily = Math.max(0, Number(s.dailyMaxMoments) || 0);
    if (daily > todayCountMoments(cid) && Math.random() * 100 < Math.max(0, Number(s.publishProbability) || 0)) {
      const content = composeMomentText(cid);
      if (content) {
        const m = addMoment(cid, content);
        renderMoments();
        notifyMomentActivity('post', Object.assign({ momentId: m.id }, content), cid);
        // 会话里那一行指针（同信箱 #165∶播放器 #284∶印象簿 #303 一族）：动态本身不进聊天，
        // 那一行按 id 指到具体一条。少了它＝「TA 发了圈」这件事只有你自己打开朋友圈才知道。
        _deliverToChat({ id: nextId(), from: 'system', text: momentName(cid) + ' 发了一条朋友圈 · 点开看', moment: m.id }, cid);
      }
    }
    if (daily <= todayCountMoments(cid)) {
      data._nextMomentAtBy[cid] = _mmTomorrowAt();
    } else {
      data._nextMomentAtBy[cid] = nextMomentTimestamp(cid);
      const cooldown = Math.max(0, Number(s.publishCooldownMin) || 0) * 60000;
      if (data._nextMomentAtBy[cid] - Date.now() < cooldown) data._nextMomentAtBy[cid] = Date.now() + cooldown;
    }
  }
  if (touched) save();
}

function startMomentsScheduler() {
  if (_momentInterval) return;
  maybeMomentTick();
  _momentInterval = setInterval(maybeMomentTick, 30 * 1000);
}
function pauseMomentsScheduler() {
  if (_momentInterval) { clearInterval(_momentInterval); _momentInterval = null; }
}
function resumeMomentsScheduler() {
  maybeMomentTick();
  if (!_momentInterval) _momentInterval = setInterval(maybeMomentTick, 30 * 1000);
}

// ===== 互动提醒与未读角标 =====
// 未读数只有一个来源＝提醒簿里没看过的那几条（以前另存一枚本机计数器＝同一件事两处记账，
// 两处必有一个是旧的；本机键 ordinal-moments-unread 随之下线，js/db.js 开机清残留）
let _momentPopupTimer = null;

// 提醒簿：谁·做了什么·哪一刻·落在哪条动态上（点一条直达那条并闪一下）
function addMomentNotice(kind, by, momentId) {
  if (!Array.isArray(data.momentNotices)) data.momentNotices = [];
  data.momentNotices.push({ id: nextId(), kind, by: by || 'partner', at: Date.now(), momentId: momentId || null, seen: false });
  while (data.momentNotices.length > MM_NOTICE_MAX) data.momentNotices.shift();
  save();
}
function momentNoticesUnread() { return (data.momentNotices || []).filter(n => n && !n.seen).length; }
// 「更多」那一页那行的角标：未读提醒数（写手是 hub.js 的 updateHomeIndex，与信箱那枚同一口径）
function momentsUnreadTotal() { return momentNoticesUnread(); }
function markNoticesSeen() {
  let changed = false;
  (data.momentNotices || []).forEach(n => { if (n && !n.seen) { n.seen = true; changed = true; } });
  if (changed) { save(); renderMomentNotices(); }
}

const _MOMENT_NOTIFY_MAP = { post: '发了一条新朋友圈', like: '赞了你的朋友圈', comment: '评论了你的朋友圈', reply: '回复了你的评论', returnlike: '回赞了你' };
function _momentNoticeText(n) {
  const who = momentName(n.by);
  const act = _MOMENT_NOTIFY_MAP[n.kind] || '有了新动静';
  const m = n.momentId != null ? _findMoment(n.momentId) : null;
  const say = m ? String(m.text || '').slice(0, 30) : '';
  return who + ' ' + act + (say ? '：' + say : '');
}
function _findMoment(id) { return (data.moments || []).find(m => String(m.id) === String(id)); }

// 通用通知入口：无论开关如何都累积未读红点＋记一条提醒；弹窗（前台弹层＋切后台的系统通知）受 momentPopup 一枚管
function notifyMomentActivity(type, content, cid) {
  const by = cid || mainChatId();
  updateHomeIndex();
  const s = _mmCfg(by);
  addMomentNotice(type, by, content && content.momentId ? content.momentId : null);
  // 系统通知（切后台那一族，BUGS #164）：这一枚同时管前台弹层与后台通知，关了两处都安静
  if (s.momentPopup !== false && typeof bgNotifyCheck === 'function') {
    const act = _MOMENT_NOTIFY_MAP[type] || '有了新动静';
    const say = content && content.text ? String(content.text) : '';
    bgNotifyCheck(momentName(by) + act + (say ? '：' + say.slice(0, 40) : ''), Date.now(), {
      name: momentName(by), kind: 'feed', cid: by
    });
  }
  if (s.momentPopup === false) return;
  const popup = $('#momentPopup');
  if (!popup) return;
  const avatar = $('#momentPopupAvatar');
  if (avatar) {
    const src = momentAvatar(by);
    avatar.innerHTML = src ? '<img src="' + escapeHTML(src) + '" alt="">' : avatarHTML(src, momentName(by));
  }
  const name = $('#momentPopupName'); if (name) name.textContent = momentName(by);
  const act = $('#momentPopupAction'); if (act) act.textContent = _MOMENT_NOTIFY_MAP[type] || '';
  const preview = $('#momentPopupPreview');
  const txt = content && content.text ? content.text : '';
  if (preview) {
    if (txt) { preview.hidden = false; preview.textContent = txt; }
    else { preview.hidden = true; preview.textContent = ''; }
  }
  popup.hidden = false;
  popup.classList.remove('moment-popup-hide');
  clearTimeout(_momentPopupTimer);
  _momentPopupTimer = setTimeout(() => { popup.classList.add('moment-popup-hide'); }, 4000);
  if (document.body.dataset.view === 'moments') renderMomentNotices();
}
function hideMomentPopup() {
  clearTimeout(_momentPopupTimer);
  const popup = $('#momentPopup'); if (popup) { popup.classList.add('moment-popup-hide'); }
}

function _mmToggleLike(momentId, who) {
  const m = _findMoment(momentId);
  if (!m) return false;
  if (!Array.isArray(m.likes)) m.likes = [];
  const had = m.likes.indexOf(who) >= 0;
  m.likes = had ? m.likes.filter(a => a !== who) : m.likes.concat([who]);
  save();
  return !had;
}
function addLike(momentId, author) { if (_mmToggleLike(momentId, author)) renderMoments(); }
function addComment(momentId, author, content, replyTo) {
  const m = _findMoment(momentId);
  if (!m) return null;
  if (!Array.isArray(m.comments)) m.comments = [];
  const c = { id: nextId(), author, text: content.text || '', sticker: content.sticker || '', ts: Date.now(), time: time(), replyTo: replyTo || null };
  m.comments.push(c);
  save();
  renderMoments();
  return c;
}

// ===== TA 互动排期（持久化队列）=====
// 点赞/评论/回复/回赞用内存 setTimeout 会在刷新时凭空消失（BUGS #041）→ 落盘队列由 30s 轮询消费
function _queueMomentReaction(kind, delayMs, momentId, commentId, text, author) {
  if (!Array.isArray(data._momentReactions)) data._momentReactions = [];
  data._momentReactions.push({ at: Date.now() + Math.max(0, delayMs), kind, momentId, commentId: commentId || null, text: typeof text === 'string' ? text : undefined, author: author || 'partner' });
  if (data._momentReactions.length > 50) data._momentReactions.splice(0, data._momentReactions.length - 50);
  save();
}

function flushMomentReactions() {
  const q = data._momentReactions;
  if (!Array.isArray(q) || !q.length) return;
  const now = Date.now();
  const due = q.filter(x => x && typeof x.at === 'number' && x.at <= now);
  if (!due.length) return;
  data._momentReactions = q.filter(x => !(x && typeof x.at === 'number' && x.at <= now));
  for (const item of due) {
    const who = item.author || 'partner';
    if (item.kind === 'like') {
      if (!_findMoment(item.momentId)) continue;
      _mmToggleLike(item.momentId, who);
      // 提醒只由 notifyMomentActivity 记一次（那里同时管角标·系统通知·前台弹层）；
      // 这里再 addMomentNotice 一遍＝同一件事两本账，屏上会出现两条一模一样的提醒
      notifyMomentActivity('like', { momentId: item.momentId }, who);
    } else if (item.kind === 'comment') {
      if (!_findMoment(item.momentId)) continue;
      const c = composeComment(who);
      if (c.text || c.sticker) {
        c.momentId = item.momentId;
        addComment(item.momentId, who, c);
        notifyMomentActivity('comment', c, who);
      }
    } else if (item.kind === 'reply') {
      const m = _findMoment(item.momentId);
      const cmt = m && (m.comments || []).some(c => String(c.id) === String(item.commentId));
      if (!m || !cmt) continue;   // 我方评论可能已被删除，失效则放弃
      const c = composeComment(who);
      if (c.text || c.sticker) {
        c.momentId = item.momentId;
        addComment(item.momentId, who, c, item.commentId);
        notifyMomentActivity('reply', c, who);
      }
    } else if (item.kind === 'returnlike') {
      const mine = (data.moments || []).filter(mm => mm.author === 'me').reverse().find(mm => !(mm.likes || []).includes(who));
      if (mine) {
        _mmToggleLike(mine.id, who);
        notifyMomentActivity('returnlike', { momentId: mine.id }, who);
      }
    } else if (item.kind === 'selfnote') {
      if (!_findMoment(item.momentId)) continue;
      if (item.text) addComment(item.momentId, who, { text: item.text });
    }
  }
  save();
  if (document.body.dataset.view === 'moments') renderMoments();
}

// 我发布后：按人掷 TA 是否点赞／首次评论（各自档位里的秒数区间）
function schedulePartnerReactions(momentId) {
  _mmPeople().forEach(c => {
    const s = _mmCfg(c.id);
    const likeProb = Math.max(0, Math.min(100, Number(s.likeProbability) || 0));
    const commentProb = Math.max(0, Math.min(100, Number(s.commentProbability) || 0));
    if (Math.random() * 100 < likeProb) {
      const d = momentRand(Math.max(1, Number(s.likeMinSec) || 2), Math.max(1, Number(s.likeMaxSec) || 120)) * 1000;
      _queueMomentReaction('like', d, momentId, null, undefined, c.id);
    }
    if (Math.random() * 100 < commentProb) {
      const d = momentRand(Math.max(1, Number(s.commentMinSec) || 3), Math.max(1, Number(s.commentMaxSec) || 180)) * 1000;
      _queueMomentReaction('comment', d, momentId, null, undefined, c.id);
    }
  });
}
function scheduleCommentReply(momentId, commentId) {
  _mmPeople().forEach(c => {
    const s = _mmCfg(c.id);
    const prob = Math.max(0, Math.min(100, Number(s.replyProbability) || 0));
    if (Math.random() * 100 < prob) {
      const d = momentRand(Math.max(1, Number(s.replyMinSec) || 2), Math.max(1, Number(s.replyMaxSec) || 120)) * 1000;
      _queueMomentReaction('reply', d, momentId, commentId, undefined, c.id);
    }
  });
}
// 我赞了某位的圈：他按概率回赞我最近一条还没被他赞过的动态
function scheduleReturnLike(cid) {
  const s = _mmCfg(cid);
  const prob = Math.max(0, Math.min(100, Number(s.returnLikeProbability) || 0));
  if (Math.random() * 100 < prob) {
    const d = momentRand(Math.max(1, Number(s.likeMinSec) || 2), Math.max(1, Number(s.likeMaxSec) || 120)) * 1000;
    _queueMomentReaction('returnlike', d, null, null, undefined, cid);
  }
}

// ===== 封面与头像 =====
// 这一处是「有没有封面」的唯一写手：封面层显隐 ∶「恢复默认封面」那枚钮的显隐都从它这里出
// （两处各判一次＝一处改了另一处必长出点不动的死件，本仓「看着能点实则无反应」那一族）
function renderMomentsCover() {
  const cover = $('#momentsCover'); if (!cover) return;
  const has = !!data.momentsCover;
  cover.hidden = !has;
  cover.style.backgroundImage = has ? `url("${escapeHTML(data.momentsCover)}")` : '';
  const clr = $('#mcClearCover'); if (clr) clr.hidden = !has;
  const av = $('#mcAvatarImg');
  if (av) {
    const src = data.momentsAvatar || chatMyAvatar() || data.me.avatar || '';
    av.innerHTML = src ? `<img src="${escapeHTML(src)}" alt="头像">` : avatarHTML('');
  }
}
function _bindMomentsCoverUI() {
  // 封面/头像改走全站唯一的 fileData（2026-10-15）：旧写法自带一套 FileReader＋Image，
  // 少了体积闸、也少了 img.onerror——挑到读不出来的文件时那一下 change 静默落地＝用户报的「传了没反应、失败也没提示」。
  // 现在体积闸/解码失败/大图处理中的提示都由 fileData 一处管；成功由 renderMomentsCover 的界面变化说。
  const bindPick = (input, maxEdge, apply) => {
    if (!input) return;
    input.addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';   // 复位：同一张图再选一次也会触发 change
      if (!f) return;
      const d = await fileData(f, maxEdge);
      if (!d) return;        // 失败已由 fileData 的 toast 说明，不静默重复
      apply(d);
      await save();
      renderMomentsCover();
    });
  };
  bindPick($('#momentsCoverInput'), 1080, d => { data.momentsCover = d; });
  bindPick($('#momentsAvatarInput'), 400, d => { data.momentsAvatar = d; });
  // 三枚钮都带守卫：顶层一次 `$('#x').addEventListener` 取到 null 会抛异常、
  // 而全部 JS 拼在同一块 <script> 里＝一处崩掉整块作废（#021·#111 那一族，本仓最贵的一种死法）
  const on = (sel, fn) => { const el = $(sel); if (el) el.addEventListener('click', fn); };
  on('#mcSetCover', () => { const i = $('#momentsCoverInput'); if (i) i.click(); });
  on('#mcSetAvatar', () => { const i = $('#momentsAvatarInput'); if (i) i.click(); });
  on('#mcClearCover', () => { data.momentsCover = ''; save(); renderMomentsCover(); });
  on('#mcAvatarBtn', () => { const i = $('#momentsAvatarInput'); if (i) i.click(); });
}
_bindMomentsCoverUI();

// ===== 渲染 =====
let _momentsKey = '';

function _mmMediaHtml(m, imgs) {
  const stks = _mmStickersOf(m);
  const picking = _mmPicking(m);
  // 一张图都没有也能贴贴纸＝配图区画一块空板托着它：没有板，浮在空白上的贴纸没有参照物，
  // 「点哪贴哪」那一下也没有宿主。空板只在真有贴纸或在挑位置时出现＝光一条正文不长出一块灰板。
  if (!imgs.length && !stks.length && !picking) return '';
  const n = Math.min(imgs.length, MM_MAX_IMGS);
  const cells = imgs.slice(0, n).map(src => `<span class="mp-cell"><img src="${escapeHTML(src)}" alt="图片"></span>`).join('');
  // 三宫格是这一族的默认（9 张＝3×3）；只有 1 张整宽正方、2 张横一点，各自一档
  const cls = imgs.length ? `mp-photos count-${Math.min(n, 3)}` : 'mp-photos mm-blank';
  return `<div class="${cls}${picking ? ' mm-picking' : ''}">${cells}${_mmStkHtml(stks)}</div>`;
}
// 正在给这一条挑位置？（挑的是「哪一处」不是「哪一张」＝这一发只改这一条的贴纸，别的条目不受牵连）
function _mmPicking(m) { return !!(_mmPick && String(_mmPick.id) === String(m.id)); }
// 贴纸落在配图上的哪一处只存**百分比**：卡片宽度随屏变，存像素＝换一台机器/转一次屏就全体错位
function _mmStkHtml(list) {
  return list.map((s, i) => {
    const inner = s.src ? `<img src="${escapeHTML(s.src)}" alt="贴纸">` : `<b>${escapeHTML(s.emoji)}</b>`;
    // 只有我贴的那张能撤：别人的贴纸画得出来、点不动＝不留一枚点了没反应的件（屏上没有「我替 TA 撕」这条路）
    return s.by === 'me'
      ? `<button type="button" class="mm-stk" data-stk="${i}" style="left:${s.x}%;top:${s.y}%" aria-label="撤回这张贴纸">${inner}</button>`
      : `<span class="mm-stk" style="left:${s.x}%;top:${s.y}%">${inner}</span>`;
  }).join('');
}
// 这一条贴在谁那本上：作者本人是联系人就拿作者，其余（我的／旧档那枚 partner）都归主会话那本
function _mmStkCid(m) {
  const a = m && m.author;
  return ((data.contacts || []).find(c => c && c.id === a)) ? a : mainChatId();
}
// 贴纸池＝三处来源合成一份带分组的名单。顺序＝建组顺序，chip 上那个数与点进去列得出的数必须一致
// （同一条去重在两处各算一遍必漂＝#079 那一课），所以去重只在这一个函数里做一次、按建名单的先后丢重。
// emoji 档排在字卡那两处之后，不抢「我的表情包」的位置。
function _mmStkPool(cid) {
  const out = [], seen = {};
  const add = (n, items) => {
    const keep = items.filter(it => {
      const k = it.emoji ? 'e' + it.emoji : it.src;
      if (!k || seen[k]) return false;
      seen[k] = 1;
      return true;
    });
    if (keep.length) out.push({ n, items: keep });
  };
  // 字卡库「表情包／图片」两类：与聊天里 TA 发图同一口径（两分类同池、公用＋只绑给这一位的专属，硬隔离 #051）
  const gs = {};
  (data.groups || []).forEach(g => {
    if (!groupUsableFor(g, cid) || (g.category !== '表情包' && g.category !== '图片')) return;
    const rows = (g.cards || []).filter(c => !cardIsOff(g, c)).map(cardImage).filter(Boolean).map(src => ({ src }));
    if (rows.length) { const k = g.name || '未分组'; gs[k] = (gs[k] || []).concat(rows); }
  });
  Object.keys(gs).forEach(k => add(k, gs[k]));
  // 我自己攒的分组与那摊旧扁平（表情包抽屉那两处同源＝这里不再抄第四份取法）
  (data.stickerGroups || []).forEach(g => add('我的 · ' + (g.name || '未分组'), (g.imgs || []).filter(Boolean).map(src => ({ src }))));
  add('我的', (data.stickers || []).filter(Boolean).map(src => ({ src })));
  add('emoji 贴纸', momentPool('emoji', cid).map(cardText).filter(Boolean).map(t => ({ emoji: t })));
  return out;
}
function _mmLikesLine(m) {
  // 这一行只说【谁】赞了，几个赞归动作行那枚心旁边的数（同一件事在两处各说一遍＝一处改了另一处必漂）
  const likes = (m.likes || []);
  if (!likes.length) return '';
  const mine = likes.includes('me');
  const others = likes.filter(a => a !== 'me');
  if (!mine) return `<div class="mp-likes">${escapeHTML(_mmNameList(others))} 赞了</div>`;
  if (!others.length) return `<div class="mp-likes">你赞了</div>`;
  return `<div class="mp-likes">你和${escapeHTML(_mmNameList(others))} 赞了</div>`;
}
function _mmNameList(authors) {
  const names = authors.map(a => momentName(a));
  return names.length > 3 ? names.slice(0, 3).join('、') + ' 等其他人' : names.join('、');
}
function _mmCommentsLine(m) {
  const cs = (m.comments || []);
  if (!cs.length) return '';
  // ins 口径：一屏先给最近两条，更早的收进「查看全部 N 条评论」那一行（长串评论不把整页撑长）；
  // 回复是行末那枚钮不是点文字——点文字在触屏上等于想选词，而这一行本来就整行不可点
  const collapsed = !_mmCmtOpen[m.id] && cs.length > MM_CMT_PREVIEW;
  const cut = collapsed ? cs.length - MM_CMT_PREVIEW : 0;
  const rows = cs.slice(cut).map(c => {
    const who = momentName(c.author);
    const reply = c.replyTo ? (() => { const r = cs.find(x => String(x.id) === String(c.replyTo)); return r ? `<i>回复 ${escapeHTML(momentName(r.author))}</i>` : ''; })() : '';
    const body = (c.sticker ? `<img class="mp-cimg" src="${escapeHTML(c.sticker)}" alt="表情包">` : '') + escapeHTML(c.text || '');
    return `<div class="mp-cmt" data-cid="${c.id}"><span class="mp-cwho">${escapeHTML(who)}</span>${reply}<span class="mp-ctx">${body}</span><span class="mp-cwhen">${escapeHTML(_mmAgo(c.ts))}</span><button type="button" class="mp-creply" data-comment-btn="${m.id}" aria-label="回复 ${escapeHTML(who)}">回复</button></div>`;
  }).join('');
  const more = collapsed
    ? `<button type="button" class="mp-cmore" data-cmore="${m.id}">查看全部 ${cs.length} 条评论</button>`
    : (cut === 0 && cs.length > MM_CMT_PREVIEW ? `<button type="button" class="mp-cmore" data-cmore="${m.id}">只看最近 ${MM_CMT_PREVIEW} 条</button>` : '');
  return `<div class="mp-comments">${rows}${more}</div>`;
}
function _mmPostHtml(m) {
  const isMine = m.author === 'me';
  const name = momentName(m.author);
  const liked = (m.likes || []).includes('me');
  const imgs = _mmImgsOf(m);
  const text = String(m.text || '');
  const long = text.length > MM_FOLD_CHARS;
  const open = !!_mmExpanded[m.id];
  const cap = long && !open ? escapeHTML(text.slice(0, MM_FOLD_CHARS)) + '…' : escapeHTML(text);
  const likeN = (m.likes || []).length;
  const cmtN = (m.comments || []).length;
  const stkN = _mmStickersOf(m).length;
  const picking = _mmPicking(m);
  // 脚上＝两枚主钮（赞∶评论）靠左 ＋ 收藏与删除推到行末靠右；「更多」只在自己的动态上长出来，
  // 因为点开那条折叠条里只有「删除」一件事——不给一枚点开是空白的钮（本仓「点不动的死件」那一族）。
  // 折叠条里不再重复列「评论／收藏」＝同一件事两处入口，改一处必漂另一处。
  const acts = `<div class="mp-acts">
      <button type="button" class="mp-act${liked ? ' on' : ''}" data-like="${m.id}" aria-label="${liked ? '取消赞' : '赞'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5S4.5 15.2 4.5 9.9A4.9 4.9 0 0 1 12 7.1a4.9 4.9 0 0 1 7.5 2.8c0 5.3-7.5 10.6-7.5 10.6z"/></svg>${likeN ? `<span class="mp-act-n">${likeN}</span>` : ''}</button>
      <button type="button" class="mp-act" data-comment-btn="${m.id}" aria-label="评论"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v11H9.5L4 20z"/></svg>${cmtN ? `<span class="mp-act-n">评论 ${cmtN}</span>` : ''}</button>
      <button type="button" class="mp-act${picking ? ' on' : ''}" data-sticker="${m.id}" aria-label="贴纸"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><circle cx="9" cy="9.5" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="9.5" r="1" fill="currentColor" stroke="none"/></svg>${stkN ? `<span class="mp-act-n">贴纸 ${stkN}</span>` : ''}</button>
      <span class="mp-acts-end">
        <button type="button" class="mp-act${_mmCollected(m) ? ' on' : ''}" data-collect="${m.id}" aria-label="${_mmCollected(m) ? '取消收藏' : '收藏'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg></button>
        ${isMine ? `<button type="button" class="mp-act mp-more" data-ops="${m.id}" aria-label="更多操作" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button>` : ''}
      </span>
    </div>
    ${isMine ? `<div class="moment-ops" id="momentOps-${m.id}" hidden><button class="op-del" data-del="${m.id}">删除</button></div>` : ''}`;
  return `<div class="moment-post" data-mid="${m.id}">
      <div class="mp-top"><span class="mp-av">${avatarHTML(momentAvatar(m.author), name)}</span><span class="mp-nm"><b>${escapeHTML(name)}</b><span class="mp-when">${escapeHTML(_mmAgo(_mmTs(m)))}</span></span></div>
      ${text ? `<div class="mp-cap"><span class="mp-cap-t">${cap}</span>${long ? `<button type="button" class="mp-fold" data-fold="${m.id}">${open ? '收起' : '展开全文'}</button>` : ''}</div>` : ''}
      ${picking ? `<div class="mm-pick-bar"><span>点配图上的位置放下这张贴纸</span><button type="button" data-stk-cancel>取消</button></div>` : ''}
      ${_mmMediaHtml(m, imgs)}
      ${acts}
      ${_mmLikesLine(m)}
      ${_mmCommentsLine(m)}
    </div>`;
}
// 旧记录那三格（sticker/image/time+date）在新形状里各有一个归宿：读侧只有一处换算，屏上与导出都引它
function _mmImgsOf(m) {
  if (Array.isArray(m.imgs) && m.imgs.length) return m.imgs.filter(v => typeof v === 'string' && v);
  const out = [];
  if (m.image) out.push(m.image);
  if (m.sticker) out.push(m.sticker);
  return out;
}
// 贴纸两态（图／字）都没有的那张画不出来＝db 清洗已经丢过一遍，这里再兜一道防页内直接改数据的路径
function _mmStickersOf(m) {
  return (Array.isArray(m && m.stickers) ? m.stickers : []).filter(s => s && (s.src || s.emoji));
}
function _mmTs(m) {
  if (typeof m.ts === 'number' && isFinite(m.ts)) return m.ts;
  if (typeof m.date === 'string') { const d = new Date(m.date + ' ' + (m.time || '12:00')); const t = d.getTime(); if (isFinite(t)) return t; }
  return 0;
}
function _mmCollected(m) {
  if (typeof feedCollected !== 'function') return false;
  return feedCollected(m.id);
}

function _mmBucketHtml(key, rows) {
  const label = _mmBucketLabel(key, _mmTs(rows[0]));
  const shown = _mmShown[key] || MM_RENDER_CAP;
  const body = rows.slice(0, shown);
  const more = rows.length > body.length
    ? `<button type="button" class="mp-more-btn" data-more="${escapeHTML(key)}">显示更早的 ${rows.length - body.length} 条</button>` : '';
  return `<div class="mm-bucket"><div class="mm-bucket-h">${escapeHTML(label)}<i>${rows.length}</i></div>${body.map(_mmPostHtml).join('')}${more}</div>`;
}

function renderMomentNotices() {
  const box = $('#momentNotices');
  if (!box) return;
  const list = (data.momentNotices || []).slice().reverse();
  $('#mmNoticeBtn') && ($('#mmNoticeBtn').hidden = !list.length);
  const dot = $('#mmNoticeDot');
  if (dot) { const n = momentNoticesUnread(); dot.hidden = n === 0; dot.textContent = n > 9 ? '9+' : String(n); }
  if (!list.length) { box.innerHTML = '<div class="mn-empty">还没有人动过你的朋友圈</div>'; return; }
  box.innerHTML = list.map(n => `<button type="button" class="mn-row${n.seen ? '' : ' new'}" data-jump="${escapeHTML(String(n.momentId || ''))}" data-nid="${escapeHTML(String(n.id))}">
      <span class="mn-av">${avatarHTML(momentAvatar(n.by), momentName(n.by))}</span>
      <span class="mn-tx"><b>${escapeHTML(momentName(n.by))}</b> ${escapeHTML(_MOMENT_NOTIFY_MAP[n.kind] || '有了新动静')}</span>
      <span class="mn-when">${escapeHTML(_mmAgo(n.at))}</span>
    </button>`).join('');
}

// 池空这件事在屏上必须有名字：composeMomentText 拼不出话时是安静 return null 的，
// 用户只看见「TA 怎么从来不发圈」，而那一句词都没有的原因（主字卡没给他备）藏在字卡库里。
function _mmVoiceless() {
  const people = _mmFilter !== 'all' ? _mmPeople().filter(c => c.id === _mmFilter) : _mmPeople();
  return people.filter(c => !momentPool('主字卡', c.id).length);
}
function renderMmQuiet() {
  const row = $('#mmQuiet');
  if (!row) return;
  const gone = _mmVoiceless();
  if (!gone.length) { row.hidden = true; row.innerHTML = ''; return; }
  const who = gone.length === 1 ? fixedNameOf(gone[0]) : gone.length + ' 个人';
  row.hidden = false;
  row.innerHTML = '<span class="mm-quiet-tz">' + escapeHTML(who) + ' 的「主字卡」是空的——TA 发不出朋友圈，评论里也没有话可说</span>'
    + '<button type="button" class="mc-chip" data-mm-cards>去字卡库</button>';
}
// 跳字卡库只有一处实现（js/cardfit.js 的 _cfGoCards：带作用域∶带分类∶顺手清掉按谁筛），
// 本页不抄第二份——抄了就会漂成「跳到字卡库却落在筛掉那批的档上」＝点得动却看不见东西。
function _mmGoCards() {
  if (typeof _cfGoCards === 'function') { _cfGoCards('public', '主字卡', ''); return; }
  showView('cards');
}

// 提醒簿那一行与聊天里那一行系统小字共用这一个出口（两处各写一份必漂：一处闪一下、一处不闪）
function openMomentById(id) {
  _mmFilter = 'all'; _mmBucket = 'all';
  _momentsKey = '';
  renderMoments();
  const box = $('#momentsList');
  const el = (id && box) ? box.querySelector('.moment-post[data-mid="' + CSS.escape(String(id)) + '"]') : null;
  if (!el) { if (id) showToast('这条动态已经删掉了'); return false; }
  el.scrollIntoView({ block: 'center' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1400);
  return true;
}

function renderMoments() {
  const root = $('#momentsList');
  if (!root) return;
  renderMomentsCover();
  renderMomentNotices();     // 提醒那枚入口常驻入口行：进这一屏就按当前未读数决定它出不出（藏在封面里那一版不用管，现在它自己得说实话）
  let list = (data.moments || []).slice();
  const people = _mmPeople();
  // 谁筛：只列真有动态的人（摆一枚点了必空白的 chip＝「看着能点实则无反应」那一族）
  const owners = {};
  list.forEach(m => { owners[m.author] = (owners[m.author] || 0) + 1; });
  if (_mmFilter !== 'all' && !owners[_mmFilter]) _mmFilter = 'all';
  renderMmQuiet();           // 排在筛档归位之后（这一行报的就是「此刻这一屏里谁拼不出话」），且必须早于下面那个早退
  const bar = $('#mmOwners');
  if (bar) {
    const chips = [];
    if (Object.keys(owners).length > 1) {
      chips.push({ k: 'all', n: '全部', c: list.length });
      if (owners.me) chips.push({ k: 'me', n: '我', c: owners.me });
      people.filter(c => owners[c.id]).forEach(c => chips.push({ k: c.id, n: fixedNameOf(c), c: owners[c.id] }));
    }
    bar.hidden = chips.length < 3;
    bar.innerHTML = chips.map(o => `<button type="button" class="mm-ow${_mmFilter === o.k ? ' on' : ''}" data-who="${escapeHTML(o.k)}">${escapeHTML(o.n)}<i>${o.c}</i></button>`).join('');
  }
  list = list.filter(m => _mmFilter === 'all' || m.author === _mmFilter);
  list.sort((a, b) => _mmTs(b) - _mmTs(a));   // 收纳序：新在前（数组写入顺序不等于时间顺序，导入旧档/合并会带进旧时刻）
  // 挑位置挑到一半，那条动态被删了或被这一屏的筛选挡在屏外：把这个态收掉。
  // 留着＝屏上再没有那句「点配图上的位置」，也没有任何一处能取消＝本仓零容忍的「挑着了却动不了」。
  if (_mmPick && !list.some(m => String(m.id) === String(_mmPick.id)
    && (_mmBucket === 'all' || _mmBucketKey(_mmTs(m)) === _mmBucket))) _mmPick = null;
  const buckets = [];
  const byKey = {};
  list.forEach(m => {
    const k = _mmBucketKey(_mmTs(m));
    if (!byKey[k]) { byKey[k] = { key: k, ts: _mmTs(m), rows: [] }; buckets.push(byKey[k]); }
    if (_mmTs(m) > byKey[k].ts) byKey[k].ts = _mmTs(m);
    byKey[k].rows.push(m);
  });
  const keys = buckets.map(b => b.key);
  if (_mmBucket !== 'all' && keys.indexOf(_mmBucket) < 0 && keys.indexOf('week') >= 0) _mmBucket = 'week';
  const tabs = $('#mmBuckets');
  if (tabs) {
    tabs.hidden = keys.length < 2 && _mmBucket === 'all';
    const items = [{ k: 'all', n: '全部' }].concat(keys.map(k => ({ k, n: _mmBucketLabel(k, byKey[k].ts) })));
    tabs.innerHTML = items.map(o => `<button type="button" class="mm-bk${_mmBucket === o.k ? ' on' : ''}" data-bucket="${escapeHTML(o.k)}">${escapeHTML(o.n)}</button>`).join('');
  }
  const shown = buckets.filter(b => _mmBucket === 'all' || b.key === _mmBucket);
  // 重画判据把「该变的」都算进去：筛/桶/展开/续画/贴上去的贴纸/正在挑位置都是这一屏的状态，漏一项＝点了没反应
  const key = [list.length, _mmFilter, _mmBucket, Object.keys(_mmExpanded).length, JSON.stringify(_mmShown), JSON.stringify(_mmCmtOpen),
    _mmPick ? _mmPick.id : '',
    list.map(m => m.id + ':' + (m.likes || []).length + ':' + (m.comments || []).length + ':' + _mmImgsOf(m).length + ':' + _mmStickersOf(m).length + ':' + (_mmExpanded[m.id] ? 1 : 0) + ':' + (_mmCmtOpen[m.id] ? 1 : 0)).join(',')].join('|');
  if (key === _momentsKey && root.children.length) return;
  _momentsKey = key;
  if (!list.length) {
    root.innerHTML = '<div class="moments-empty"><span class="moments-empty-ic"><svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><circle cx="12" cy="10" r="3.2"/><path d="M6 20.5a6 6 0 0 1 12 0z"/></svg></span><p class="moments-empty-tz">还没有人发过朋友圈<br>点右下角「＋」发第一条</p></div>';
    return;
  }
  root.innerHTML = shown.map(b => _mmBucketHtml(b.key, b.rows)).join('');
}

// ===== 发布与评论 =====
function openMomentComposer(mode, momentId, commentId) {
  _momentComposer = { mode, momentId: momentId || null, commentId: commentId || null, imgs: [], sticker: '' };
  const mask = $('#momentModalMask'); if (!mask) return;
  $('#momentModalTitle').textContent = mode === 'publish' ? '发一条' : (mode === 'comment' ? '评论' : '回复');
  $('#momentModalSubmit').textContent = mode === 'publish' ? '发布' : '发送';
  $('#momentModalInput').value = '';
  _mmSyncPicker();
  $('#momentStickerGrid').hidden = true;
  mask.hidden = false;
  $('#momentModalInput').focus();
}
function closeMomentComposer() { const mask = $('#momentModalMask'); if (mask) mask.hidden = true; }
function _mmSyncPicker() {
  const box = $('#momentPv');
  if (!box) return;
  const items = _momentComposer.imgs.map((src, i) =>
    `<span class="mpv-cell"><img src="${escapeHTML(src)}" alt=""><button type="button" class="mpv-x" data-rm="${i}" aria-label="移除这张">×</button></span>`).join('');
  const add = _momentComposer.imgs.length < MM_MAX_IMGS
    ? `<button type="button" class="mpv-add" id="momentPvAdd" aria-label="添加图片"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>` : '';
  box.innerHTML = items + add;
  box.hidden = !items && !add;
}
function buildMomentStickerGrid() {
  const grid = $('#momentStickerGrid');
  if (!grid || grid.dataset.built === '1') return;
  grid.innerHTML = (data.stickers || []).length
    ? data.stickers.map((s, i) => `<img src="${escapeHTML(s)}" data-si="${i}" alt="表情包">`).join('')
    : '<span class="empty">还没有表情包，先到字卡库导入</span>';
  grid.dataset.built = '1';
}

// ===== 贴纸：往一条动态的配图上贴一张（mochi 朋友圈那一族，2026-10-13 按用户要求接进来）=====
// 只搬「我贴」这一层。mochi 里我贴完 TA 有概率回贴一张并记一条提醒——那是「TA 自动点赞/评论」那一族
// （2026-10-12 朋友圈重做时用户定档不做），本批刻意没带进来：屏上没有「TA 贴的贴纸」这一种东西。
// 也不设上限：mochi 自己把「最多五张」那道闸删掉了（作者明文「不要限制」），本仓另有「不要硬额度」那条。
function openMmStickerPanel(id) {
  const m = _findMoment(id);
  const sheet = $('#mmStkSheet');
  if (!m || !sheet) return;
  _mmCancelPick();                       // 上一次没挑完的先收干净＝屏上不会同时躺着两条「点图贴/点图看大图」
  _mmStkFor = String(m.id);
  _mmStkCur = '';
  sheet.hidden = false;
  renderMmStickerPanel();
}
function closeMmStickerPanel() {
  const sheet = $('#mmStkSheet');
  if (sheet) sheet.hidden = true;
  _mmStkFor = null;
  _mmStkItems = [];
}
function _mmStkPoolNow() {
  const m = _mmStkFor ? _findMoment(_mmStkFor) : null;
  return _mmStkPool(m ? _mmStkCid(m) : mainChatId());
}
function renderMmStickerPanel() {
  const chips = $('#mmStkScopes'), body = $('#mmStkBody');
  if (!body) return;
  const pool = _mmStkPoolNow();
  if (!pool.length) {
    _mmStkItems = [];
    if (chips) { chips.innerHTML = ''; chips.hidden = true; }
    body.innerHTML = '<span class="mm-stk-empty">还没有能贴的东西——先到字卡库的「表情包」或「图片」里存几张，或在表情包抽屉里建自己的一组</span>';
    return;
  }
  const total = pool.reduce((n, g) => n + g.items.length, 0);
  const rows = pool.filter(g => !_mmStkCur || g.n === _mmStkCur);
  _mmStkItems = rows.flatMap(g => g.items);
  if (chips) {
    // 只有一组时连「全部」这一枚都不出＝那行 chip 会跟组名说同一件事（读数别重复）
    chips.hidden = pool.length < 2;
    chips.innerHTML = [{ n: '', t: '全部 ' + total }]
      .concat(pool.map(g => ({ n: g.n, t: g.n + ' ' + g.items.length })))
      .map(o => `<button type="button" class="mm-ow${_mmStkCur === o.n ? ' on' : ''}" data-stk-g="${escapeHTML(o.n)}">${escapeHTML(o.t)}</button>`).join('');
  }
  // 格子上只落序号：整张 dataURL 塞进属性＝一次画几十兆字符进 DOM（mochi 早期被这条撑爆过存储）
  body.innerHTML = _mmStkItems.map((it, i) => it.emoji
    ? `<button type="button" class="mm-stk-cell mm-stk-word" data-stk-pick="${i}">${escapeHTML(it.emoji)}</button>`
    : `<button type="button" class="mm-stk-cell" data-stk-pick="${i}"><img src="${escapeHTML(it.src)}" alt="贴纸"></button>`).join('');
}
// 选一张＝进入挑位置态（不当场贴）。这一步只改屏上状态、一个字都不落库：挑一半收手，那条动态一字未变。
function _mmStartPick(i) {
  const it = _mmStkItems[i], m = _mmStkFor ? _findMoment(_mmStkFor) : null;
  if (!it || !m) return;
  _mmPick = { id: m.id, src: it.src || '', emoji: it.emoji || '' };
  closeMmStickerPanel();
  _momentsKey = '';
  renderMoments();
  const el = document.querySelector('#momentsList .moment-post[data-mid="' + CSS.escape(String(m.id)) + '"] .mp-photos');
  if (el) el.scrollIntoView({ block: 'center' });   // 那枚「贴纸」钮在图**下面**，不先把图送上来＝看不见能点哪儿
}
function _mmCancelPick() {
  if (!_mmPick) return;
  _mmPick = null;
  _momentsKey = '';
  renderMoments();
}
function _mmPlacePick(x, y) {
  const p = _mmPick;
  if (!p) return;
  const m = _findMoment(p.id);
  _mmPick = null;                    // 先收态：查不到那条动态（刚被删掉）也只丢这一张贴纸，不把选位留在屏上
  if (!m) { _momentsKey = ''; renderMoments(); return; }
  if (!Array.isArray(m.stickers)) m.stickers = [];
  m.stickers.push({ src: p.src, emoji: p.emoji, x, y, by: 'me' });
  save();
  _momentsKey = '';
  renderMoments();
}
function _mmRemoveSticker(id, i) {
  const m = _findMoment(id);
  const list = m ? _mmStickersOf(m) : [];
  const s = list[i];
  if (!s || s.by !== 'me') return;   // 不是我的贴纸压根不画成钮；这一道再兜一次＝不替别人撕
  const at = (m.stickers || []).indexOf(s);   // 屏上那个序号是**筛过一遍**的名单里的；删要删原数组里那一格
  if (at < 0) return;
  openModal('撤回这张贴纸', '', () => {
    const cur = _findMoment(id);
    if (!cur || !Array.isArray(cur.stickers)) return;
    const now = cur.stickers.indexOf(s);   // 确认框开着那几秒里这本册子仍可能被别处改（TA 刚回贴／删过一条）＝按对象现找
    if (now < 0) return;
    cur.stickers.splice(now, 1);
    save();
    _momentsKey = '';
    renderMoments();
  }, { noInput: true, staticText: '只撕这一张贴纸，动态本身不动。', okText: '撤回', danger: true });
}

function _bindMomentUI() {
  const fab = $('#newMoment'); if (fab) fab.onclick = () => openMomentComposer('publish');
  const close = $('#momentModalClose'); if (close) close.onclick = closeMomentComposer;
  const mask = $('#momentModalMask');
  if (mask) mask.addEventListener('click', e => { if (e.target === mask) closeMomentComposer(); });
  const sbtn = $('#momentStickerBtn');
  if (sbtn) sbtn.onclick = () => { buildMomentStickerGrid(); $('#momentStickerGrid').hidden = !$('#momentStickerGrid').hidden; };
  const grid = $('#momentStickerGrid');
  if (grid) grid.addEventListener('click', e => {
    const img = e.target.closest('img[data-si]');
    if (!img) return;
    const src = data.stickers[+img.dataset.si];
    if (!src) return;
    if (_momentComposer.imgs.length >= MM_MAX_IMGS) { showToast('最多 ' + MM_MAX_IMGS + ' 张'); return; }
    _momentComposer.imgs.push(src);
    _mmSyncPicker();
    $('#momentStickerGrid').hidden = true;
  });
  const ibtn = $('#momentImageBtn');
  if (ibtn) ibtn.onclick = () => $('#momentImageInput') && $('#momentImageInput').click();
  const iin = $('#momentImageInput');
  if (iin) iin.onchange = async e => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    let dropped = 0;
    for (const f of files) {
      if (_momentComposer.imgs.length >= MM_MAX_IMGS) { dropped++; continue; }
      // 0.86 而不是 utils 默认那档（BUGS #427）：朋友圈这条是**拿原图对看**的那条路 ——
      // 直通闸放行的图一个像素都不重画，走到这里的都是被缩放的大图，
      // 有损编码压狠了先掉的是高频色彩（天边渐变、肤色过渡），宁可多占几十 KB。
      const img = await fileData(f, 800, 0.86);
      if (img) _momentComposer.imgs.push(img);
    }
    if (dropped) showToast('最多 ' + MM_MAX_IMGS + ' 张，多出的没加进来');
    _mmSyncPicker();
  };
  const submit = $('#momentModalSubmit');
  if (submit) submit.onclick = async () => {
    const text = $('#momentModalInput').value.trim();
    const { mode, momentId, commentId, imgs, sticker } = _momentComposer;
    if (!text && !imgs.length) { showToast('写点什么或放一张图'); return; }
    if (mode === 'publish') {
      const m = addMoment('me', { text, imgs });
      await save();
      closeMomentComposer();
      _mmFilter = 'all'; _mmBucket = 'all';
      renderMoments();
      schedulePartnerReactions(m.id);
    } else if (mode === 'comment') {
      const c = addComment(momentId, 'me', { text, sticker });
      closeMomentComposer();
      scheduleCommentReply(momentId, c ? c.id : null);
    } else {
      addComment(momentId, 'me', { text, sticker }, commentId);
      closeMomentComposer();
    }
  };
  // 委托挂在整面 #momentsView 而不是 #momentsList：那两行筛选 chip 在列表**外面**（与封面同一层），
  // 挂在列表上＝chip 点得动、账也记了，屏上却一条都不换＝本仓零容忍的「看着能点实则无反应」。
  const list = $('#momentsView');
  if (list) list.addEventListener('click', e => {
    const fold = e.target.closest('[data-fold]');
    if (fold) { _mmExpanded[fold.dataset.fold] = !_mmExpanded[fold.dataset.fold]; _momentsKey = ''; renderMoments(); return; }
    const cmore = e.target.closest('[data-cmore]');
    if (cmore) { _mmCmtOpen[cmore.dataset.cmore] = !_mmCmtOpen[cmore.dataset.cmore]; _momentsKey = ''; renderMoments(); return; }
    const more = e.target.closest('[data-more]');
    if (more) { const k = more.dataset.more; _mmShown[k] = (_mmShown[k] || MM_RENDER_CAP) + 100; _momentsKey = ''; renderMoments(); return; }
    const who = e.target.closest('[data-who]');
    if (who) { _mmFilter = who.dataset.who; _momentsKey = ''; renderMoments(); return; }
    const bk = e.target.closest('[data-bucket]');
    if (bk) { _mmBucket = bk.dataset.bucket; _momentsKey = ''; renderMoments(); return; }
    const goCards = e.target.closest('[data-mm-cards]');
    if (goCards) { _mmGoCards(); return; }   // 提示行那句「主字卡是空的」必须当场能办掉，不然就是一行只能看的话
    const opsBtn = e.target.closest('[data-ops]');
    if (opsBtn) {
      const post = opsBtn.closest('.moment-post');
      const menu = post && post.querySelector('.moment-ops');
      if (!menu) return;
      const willOpen = menu.hidden;
      _closeAllMomentOps(willOpen ? menu : null);
      menu.hidden = !willOpen;
      opsBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      return;
    }
    if (!e.target.closest('.moment-ops') && !e.target.closest('[data-ops]')) _closeAllMomentOps(null);
    const likeBtn = e.target.closest('[data-like]');
    if (likeBtn) {
      const m = _findMoment(likeBtn.dataset.like);
      if (!m) return;
      const on = _mmToggleLike(m.id, 'me');
      if (on && m.author !== 'me') scheduleReturnLike(m.author);
      _momentsKey = '';
      renderMoments();
      return;
    }
    const colBtn = e.target.closest('[data-collect]');
    if (colBtn) {
      const m = _findMoment(colBtn.dataset.collect);
      if (m && typeof collectFeed === 'function') collectFeed(m);
      _closeAllMomentOps(null);
      _momentsKey = '';
      renderMoments();
      return;
    }
    const delBtn = e.target.closest('[data-del]');
    if (delBtn) {
      const id = delBtn.dataset.del;
      openModal('删除这条朋友圈', '', () => {
        data.moments = (data.moments || []).filter(x => String(x.id) !== String(id));
        data.momentNotices = (data.momentNotices || []).filter(n => String(n.momentId) !== String(id));
        save();
        _closeAllMomentOps(null);
        _momentsKey = '';
        renderMoments();
      }, { noInput: true, staticText: '删除后找不回来。', okText: '删除', danger: true });
      return;
    }
    const cb = e.target.closest('[data-comment-btn]');
    if (cb) {
      _closeAllMomentOps(null);
      const cid = e.target.closest('.mp-cmt');
      const card = cb.closest('.moment-post');
      const m = card ? _findMoment(card.dataset.mid) : null;
      if (cid && m) {
        const cm = (m.comments || []).find(x => String(x.id) === String(cid.dataset.cid));
        if (cm) { openMomentComposer('reply', m.id, cm.id); return; }
      }
      openMomentComposer('comment', m ? m.id : cb.dataset.commentBtn);
      return;
    }
    // 贴纸这四条都排在「点图看大图」之前：挑位置那一下若先命中看图那一条，准星与那层纱就全白做（贴不上去）。
    const cancel = e.target.closest('[data-stk-cancel]');
    if (cancel) { _mmCancelPick(); return; }
    const sbtn = e.target.closest('[data-sticker]');
    if (sbtn) { openMmStickerPanel(sbtn.dataset.sticker); return; }
    if (_mmPick) {
      const ph = e.target.closest('.mp-photos');
      if (ph) {
        const r = ph.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          // 夹在 4~90 ∶ 6~90：贴在最边上＝半张被图框裁掉，也留给「点它撤回」一个能点到的中心（mochi 同这两个数）
          const x = Math.min(90, Math.max(4, (e.clientX - r.left) / r.width * 100));
          const y = Math.min(90, Math.max(6, (e.clientY - r.top) / r.height * 100));
          _mmPlacePick(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
        }
        return;
      }
    }
    const stkBtn = e.target.closest('[data-stk]');
    if (stkBtn) {
      const card = stkBtn.closest('.moment-post');
      if (card) _mmRemoveSticker(card.dataset.mid, +stkBtn.dataset.stk);
      return;
    }
    const photo = e.target.closest('.mp-cell');
    if (photo) { const img = photo.querySelector('img'); if (img) openLightbox(img.getAttribute('src')); }
  });
  // 贴纸面板的委托单独挂：它与提醒簿那两面都在 #momentsView **外面**（贴底面板是 app-shell 的直接子，
  // 挂在视图上＝面板点得动、账也记了，屏上却一条都不换＝本仓零容忍的「看着能点实则无反应」）
  const stkSheet = $('#mmStkSheet');
  if (stkSheet) stkSheet.addEventListener('click', e => {
    if (e.target === stkSheet || e.target.closest('.fs-sheet-close')) { closeMmStickerPanel(); return; }
    const g = e.target.closest('[data-stk-g]');
    if (g) { _mmStkCur = g.dataset.stkG; renderMmStickerPanel(); return; }
    const cell = e.target.closest('[data-stk-pick]');
    if (cell) _mmStartPick(+cell.dataset.stkPick);
  });
  const nc = $('#mmNoticeClose');
  if (nc) nc.onclick = () => { const sh = $('#mmNoticeSheet'); if (sh) sh.hidden = true; };
  const ns = $('#mmNoticeSheet');
  if (ns) ns.addEventListener('click', e => { if (e.target === ns) ns.hidden = true; });
  const nb = $('#mmNoticeBtn');
  if (nb) nb.onclick = () => {
    const sheet = $('#mmNoticeSheet');
    if (!sheet) return;
    sheet.hidden = !sheet.hidden;
    if (!sheet.hidden) { renderMomentNotices(); markNoticesSeen(); }
  };
  const nbox = $('#momentNotices');
  if (nbox) nbox.addEventListener('click', e => {
    const row = e.target.closest('[data-jump]');
    if (!row) return;
    const id = row.dataset.jump;
    const n = (data.momentNotices || []).find(x => String(x.id) === String(row.dataset.nid));
    if (n) { n.seen = true; save(); }
    if (n && momentNoticesUnread() === 0) updateHomeIndex();
    const sheet = $('#mmNoticeSheet'); if (sheet) sheet.hidden = true;
    openMomentById(id);        // 里面已「清筛∶归桶∶重画」，这里只补一次提醒簿读数（那一行点完就该不标新了）
    renderMomentNotices();
  });
}
function _closeAllMomentOps(except) {
  document.querySelectorAll('#momentsList .moment-ops').forEach(o => {
    if (o === except) return;
    o.hidden = true;
    const card = o.closest('.moment-post');
    const b = card && card.querySelector('.mp-more[data-ops]');
    if (b) b.setAttribute('aria-expanded', 'false');
  });
}
// 看大图：本站没有第二处灯箱，就地做一枚（点任意处收回）
function openLightbox(src) {
  if (!src) return;
  const box = document.createElement('div');
  box.className = 'mm-lightbox';
  box.innerHTML = '<img src="' + escapeHTML(src) + '" alt="">';
  box.addEventListener('click', () => box.remove());
  document.querySelector('.app-shell').appendChild(box);
}
_bindMomentUI();

// ===== 朋友圈设置面板（面板族 .fs-sheet-* 与信箱／收藏同一份）=====
// 谁的那一份：chips 选「默认」＝改全局那份；选某位＝只存被改过的格（没存过的跟随全局）
let _mmScope = 'default';
const MM_SET_NUM = [
  ['publishProbability', 0, 100], ['dailyMaxMoments', 0, 99],
  ['minPublishIntervalMin', 1, 1440], ['maxPublishIntervalMin', 1, 1440], ['publishCooldownMin', 0, 1440],
  ['minCardsInMoment', 1, 99], ['maxCardsInMoment', 1, 99],
  ['useKaomojiProb', 0, 100], ['useEmojiProb', 0, 100], ['useStickerProb', 0, 100], ['useImageProb', 0, 100],
  ['multiCardProbability', 0, 100], ['maxCardsInComment', 1, 20], ['useStickerInComment', 0, 100],
  ['likeProbability', 0, 100], ['likeMinSec', 1, 3600], ['likeMaxSec', 1, 3600],
  ['commentProbability', 0, 100], ['commentMinSec', 1, 3600], ['commentMaxSec', 1, 3600],
  ['replyProbability', 0, 100], ['replyMinSec', 1, 3600], ['replyMaxSec', 1, 3600],
  ['returnLikeProbability', 0, 100], ['taCollectProb', 0, 100]
];
const MM_SET_ID = {
  publishProbability: 'mmPublishProb', dailyMaxMoments: 'mmDailyMax',
  minPublishIntervalMin: 'mmMinInterval', maxPublishIntervalMin: 'mmMaxInterval', publishCooldownMin: 'mmCooldown',
  minCardsInMoment: 'mmMinCards', maxCardsInMoment: 'mmMaxCards',
  useKaomojiProb: 'mmKaomojiProb', useEmojiProb: 'mmEmojiProb', useStickerProb: 'mmStickerProb', useImageProb: 'mmImageProb',
  multiCardProbability: 'mmMultiCardProb', maxCardsInComment: 'mmMaxCardsInComment', useStickerInComment: 'mmCommentStickerProb',
  likeProbability: 'mmLikeProb', likeMinSec: 'mmLikeMin', likeMaxSec: 'mmLikeMax',
  commentProbability: 'mmCommentProb', commentMinSec: 'mmCommentMin', commentMaxSec: 'mmCommentMax',
  replyProbability: 'mmReplyProb', replyMinSec: 'mmReplyMin', replyMaxSec: 'mmReplyMax',
  returnLikeProbability: 'mmReturnLikeProb', taCollectProb: 'mmTaCollectProb'
};
function _mmScopeCid() { return _mmScope === 'default' ? null : _mmScope; }
function renderMomentsSettings() {
  const sheet = $('#mmSetSheet');
  if (!sheet) return;
  const cid = _mmScopeCid();
  const s = _mmCfg(cid);
  MM_SET_NUM.forEach(([k, min, max]) => {
    const el = $('#' + MM_SET_ID[k]);
    if (!el) return;
    const v = Number(s[k]);
    el.value = isFinite(v) && String(s[k]) !== '' ? v : (defaults.momentsSettings[k]);
    el.min = min; el.max = max;
  });
  const en = $('#mmPostEnabled');
  if (en) en.checked = s.postEnabled !== false;
  const pop = $('#mmPopup');
  if (pop) pop.checked = (data.momentsSettings || {}).momentPopup !== false;
  const own = $('#mmOwnersSet');
  if (own) {
    const over = data.momentsBy || {};
    own.innerHTML = [{ id: 'default', n: '默认' }].concat(_mmPeople().map(c => ({ id: c.id, n: fixedNameOf(c) + (over[c.id] ? ' · 已调' : '') })))
      .map(o => `<button type="button" class="mm-ow${_mmScope === o.id ? ' on' : ''}" data-mm-scope="${escapeHTML(o.id)}">${escapeHTML(o.n)}</button>`).join('');
  }
  const note = $('#mmScopeNote');
  if (note) note.textContent = cid
    ? '只调这一位：没动过的格子跟随「默认」那一列；把某格填成与默认相同的值＝这一格恢复跟随。'
    : '这一列是所有 TA 的默认值；单独调过的人记在他自己那一格。';
}
function saveMomentsNow() {
  const cid = _mmScopeCid();
  const src = _mmCfg(cid);
  const patch = {};
  MM_SET_NUM.forEach(([k, min, max]) => {
    const el = $('#' + MM_SET_ID[k]);
    if (!el) return;
    const raw = el.value;
    if (raw === '' || raw === null) return;              // 空框＝这一格不动（不是填回出厂值）
    let v = Math.floor(Number(raw));
    if (!isFinite(v)) return;
    v = Math.min(max, Math.max(min, v));
    patch[k] = v;
    el.value = v;
  });
  const en = $('#mmPostEnabled');
  if (en) patch.postEnabled = en.checked;
  // 区间配平只在本格被改过时补一句（没动过的那格不许被悄悄写进他的那一本）
  if (patch.minPublishIntervalMin != null && patch.maxPublishIntervalMin == null)
    patch.maxPublishIntervalMin = Math.max(patch.minPublishIntervalMin, Number(src.maxPublishIntervalMin) || defaults.momentsSettings.maxPublishIntervalMin);
  if (patch.maxPublishIntervalMin != null && patch.minPublishIntervalMin == null)
    patch.minPublishIntervalMin = Math.min(patch.maxPublishIntervalMin, Number(src.minPublishIntervalMin) || defaults.momentsSettings.minPublishIntervalMin);
  if (patch.minPublishIntervalMin != null && patch.maxPublishIntervalMin != null && patch.maxPublishIntervalMin < patch.minPublishIntervalMin)
    patch.maxPublishIntervalMin = patch.minPublishIntervalMin;
  if (patch.minCardsInMoment != null && patch.maxCardsInMoment == null)
    patch.maxCardsInMoment = Math.max(patch.minCardsInMoment, Number(src.maxCardsInMoment) || defaults.momentsSettings.maxCardsInMoment);
  if (patch.maxCardsInMoment != null && patch.minCardsInMoment == null)
    patch.minCardsInMoment = Math.min(patch.maxCardsInMoment, Number(src.minCardsInMoment) || defaults.momentsSettings.minCardsInMoment);
  if (patch.minCardsInMoment != null && patch.maxCardsInMoment != null && patch.maxCardsInMoment < patch.minCardsInMoment)
    patch.maxCardsInMoment = patch.minCardsInMoment;
  if (patch.likeMinSec != null && patch.likeMaxSec == null) patch.likeMaxSec = Math.max(patch.likeMinSec, Number(src.likeMaxSec) || 120);
  if (patch.likeMaxSec != null && patch.likeMinSec == null) patch.likeMinSec = Math.min(patch.likeMaxSec, Number(src.likeMinSec) || 2);
  if (patch.likeMinSec != null && patch.likeMaxSec != null && patch.likeMaxSec < patch.likeMinSec) patch.likeMaxSec = patch.likeMinSec;
  if (patch.commentMinSec != null && patch.commentMaxSec == null) patch.commentMaxSec = Math.max(patch.commentMinSec, Number(src.commentMaxSec) || 180);
  if (patch.commentMaxSec != null && patch.commentMinSec == null) patch.commentMinSec = Math.min(patch.commentMaxSec, Number(src.commentMinSec) || 3);
  if (patch.commentMinSec != null && patch.commentMaxSec != null && patch.commentMaxSec < patch.commentMinSec) patch.commentMaxSec = patch.commentMinSec;
  if (patch.replyMinSec != null && patch.replyMaxSec == null) patch.replyMaxSec = Math.max(patch.replyMinSec, Number(src.replyMaxSec) || 120);
  if (patch.replyMaxSec != null && patch.replyMinSec == null) patch.replyMinSec = Math.min(patch.replyMaxSec, Number(src.replyMinSec) || 2);
  if (patch.replyMinSec != null && patch.replyMaxSec != null && patch.replyMaxSec < patch.replyMinSec) patch.replyMaxSec = patch.replyMinSec;
  if (cid) {
    // 只往他那一本里写「与默认那一列不同」的格子：填成和默认相同的值＝把他那格摘掉＝恢复跟随
    // （旧写法把面板上看得见的每一格整个塞进他那一本＝屏上那句「没动过的格子跟随默认」当场是假话，
    //   而且默认列以后再调，他这一本永远不跟——同 #098「填了就永久压住全局值」那一族）
    const base = _mmCfg(null);
    const own = {};
    Object.keys(patch).forEach(k => { own[k] = patch[k] === base[k] ? null : patch[k]; });
    _mmSet(cid, own);
  } else Object.assign(data.momentsSettings, patch);
  const pop = $('#mmPopup');
  if (pop) data.momentsSettings.momentPopup = pop.checked;      // 提醒那一格永远只有全局一份
  save();
}
function openMomentsSettings() {
  const mask = $('#mmSetMask');
  if (!mask) return;
  renderMomentsCover();       // 「恢复默认封面」那枚只在真有封面时出现——显隐与封面同一处口径，开面板前再收一次
  renderMomentsSettings();
  mask.hidden = false;
}
function closeMomentsSettings() {
  const mask = $('#mmSetMask');
  if (mask) mask.hidden = true;
}
(function bindMomentsSettings() {
  const btn = $('#mmSetBtn'); if (btn) btn.onclick = openMomentsSettings;
  const close = $('#mmSetClose'); if (close) close.onclick = closeMomentsSettings;
  const mask = $('#mmSetMask');
  if (mask) mask.addEventListener('click', e => { if (e.target === mask) closeMomentsSettings(); });
  const own = $('#mmOwnersSet');
  if (own) own.addEventListener('click', e => {
    const b = e.target.closest('[data-mm-scope]');
    if (!b) return;
    saveMomentsNow();                 // 换人之前先把当前这屏的改动收下（不留「改了没存就切走」那种半截）
    _mmScope = b.dataset.mmScope;
    renderMomentsSettings();
  });
  const pv = $('#momentPv');
  if (pv) pv.addEventListener('click', e => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { _momentComposer.imgs.splice(Number(rm.dataset.rm), 1); _mmSyncPicker(); return; }
    if (e.target.closest('#momentPvAdd')) { const inp = $('#momentImageInput'); if (inp) inp.click(); }
  });
})();

// ===== 通知弹窗初始化 =====
const _momentPopup = $('#momentPopup');
if (_momentPopup) {
  const _pc = $('#momentPopupClose');
  if (_pc) _pc.onclick = hideMomentPopup;
  _momentPopup.addEventListener('transitionend', () => {
    if (_momentPopup.classList.contains('moment-popup-hide')) _momentPopup.hidden = true;
  });
}
updateHomeIndex();
