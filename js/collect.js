// ===== 收藏夹（方案B画廊 · 按联系人归属）=====
// 数据：每个会话一个 store：collect-msgs:<会话id> → [{ kind, by:'me'|'ta', text, ts, ...快照 }]
// 收藏时按"当时所在会话"落库；收藏页聚合展示：
//   「我的」= 所有会话里我收藏的（带 来自·联系人 来源标）
//   「TA 的」= 联系人 chips 切换（全部/单个联系人），卡片带 TA 名标

let _collectToastTimer = null;
function toast(msg) {
  document.body.removeAttribute('data-toast');
  void document.body.offsetWidth;
  document.body.setAttribute('data-toast', msg);
  clearTimeout(_collectToastTimer);
  _collectToastTimer = setTimeout(() => document.body.removeAttribute('data-toast'), 2000);
}
// 默认那一份走 lsWrite（js/utils.js）：iOS 无痕模式下 setItem 直接抛异常，全站 JS 拼成一块
// 内联 script＝这一处抛＝后面所有模块都不执行（#021·#111 那一族）。_collectStore 那枚桩是
// 探针留的入口，原样留着不动。
function collectStore() { return window._collectStore || { get: k => localStorage.getItem(k), set: (k, v) => lsWrite(k, v) }; }
// 收藏按联系人分开存：key = collect-msgs:<会话id>；旧全局 key 自动并入 c0
// cid 可由调用方指定：TA 的自动收藏发生在延迟回调里，那一刻用户可能已经切走会话，
// 不传就会把 A 收的记进 B 的册子（BUGS #156）。不传＝此刻这一本。
function _collectKey(cid) {
  const key = 'collect-msgs:' + (cid || (typeof data !== 'undefined' && data.activeChat) || 'c0');
  if (!collectStore().get(key)) {
    const legacy = collectStore().get('collect-msgs');
    if (legacy !== null && key === 'collect-msgs:c0') { collectStore().set(key, legacy); collectStore().set('collect-msgs', '[]'); }
    else collectStore().set(key, '[]');
  }
  return key;
}
function collectGet(cid) { try { return JSON.parse(collectStore().get(_collectKey(cid)) || '[]') || []; } catch (e) { return []; } }
function collectSave(list, cid) { collectStore().set(_collectKey(cid), JSON.stringify(list || [])); }
// 查找用的那一大串：正文之外，那一行「为什么收这一条」也算在内（我写的那句、TA 自己那句都算＝
// 不分主语只搜一半，屏上会解释不清；这一框找的是这一页上的字，不挑那句话是谁写的）
function _favHay(f) { return ((f && f.text || '') + ' ' + (f && f.reason || '')).toLowerCase(); }
// 这一本的属主名字（收藏页与 toast 共用一处口径，别再读全局 profile）
function _collectOwnerName(cid) {
  const c = (data.contacts || []).find(x => x.id === cid) || null;
  return (c && (c.chatName || c.name)) || '';
}
function collectDup(list, f) {
  // 有消息 id 就只认 id：两张【不同】的图片消息 text 都是空串、kind/by/title 全同，
  // 旧写法按文字判重 → 从第二张起永远回「已收藏过」，屏上那张图根本进不了收藏（BUGS #194）
  if (f.mid) return list.some(x => x.mid && String(x.mid) === String(f.mid));
  // 动态带的是它自己的 id（fid）：与 mid 同一条道理，只认来源、不拿文字比（#194 那一课）
  if (f.fid !== undefined && f.fid !== null) return list.some(x => x.fid !== undefined && x.fid !== null && String(x.fid) === String(f.fid));
  const img0 = (f.imgs && f.imgs[0]) || '';
  return list.some(x => (x.by || 'me') === (f.by || 'me') && (x.kind || 'msg') === (f.kind || 'msg')
    && (x.text || '') === (f.text || '') && (x.title || '') === (f.title || '')
    && ((x.imgs && x.imgs[0]) || '') === img0 && (!f.ts || x.ts === f.ts));
}
// 供各模块调用的收藏入口：返回 false = 已收藏过
window.addCollectItem = function (f, cid) {
  const list = collectGet(cid);
  if (collectDup(list, f)) return false;
  list.push(Object.assign({ by: 'me' }, f, { ts: f.ts || Date.now() }));
  collectSave(list, cid);
  try { if (typeof renderCollectList === 'function') renderCollectList(); } catch (e) {}
  return true;
};

// 聚合读取：全部会话的收藏，附 _cid/_cname（仅展示层用，不落库）
function _favAll() {
  const out = [];
  for (const c of (data.contacts || [])) {
    let list = [];
    try { list = JSON.parse(collectStore().get('collect-msgs:' + c.id) || '[]'); } catch (e) {}
    for (const f of list) out.push(Object.assign({ _cid: c.id, _cname: c.chatName || c.name || 'TA' }, f));
  }
  return out;
}

let collectTab = 'mine';   // mine=我的收藏 ta=TA的收藏
let collectKind = 'all';   // all/msg/mail/feed
let _favQuery = '';
let _favCid = 'all';       // 「TA 的」页签的联系人筛选（all=全部）

const COLLECT_KINDS = [
  { k: 'all', label: '全部' },
  { k: 'msg', label: '聊天' },
  { k: 'mail', label: '信件' },
  { k: 'feed', label: '动态' }
];

function _collectEsc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function _collectTextHtml(str) {
  const s = String(str || '');
  const re = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g;
  let html = '', last = 0, mm;
  while ((mm = re.exec(s))) {
    html += _collectEsc(s.slice(last, mm.index));
    html += '<img class="fav-item-img" src="' + mm[0] + '" alt="图片">';
    last = mm.index + mm[0].length;
  }
  return html + _collectEsc(s.slice(last));
}
function _favDay(ts) {
  const d = new Date(ts || 0);
  if (!d.getFullYear()) return '';
  return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`;
}
// 收藏里的「问问TA／TA 想问你」卡：题目已由 g-txt 画过，这里只补选项与答案那两笔。
// 窄卡（双列瀑布）里不复用聊天那张 .ask-opt——它是按全宽气泡排的，塞进 170px 一列会撑破列宽。
function _favAskHTML(a) {
  const opts = Array.isArray(a.opts) ? a.opts : [];
  const parts = Array.isArray(a.parts) ? a.parts : [];
  const isMulti = a.kind === 'multi';
  const picks = isMulti && Array.isArray(a.picks) ? a.picks : [];
  const who = a.mine ? 'TA' : '你';
  let inner = '';
  if (opts.length) inner = `<div class="fav-ask-opts">${opts.map(o =>
    `<span class="fav-ask-opt${a.answered && (isMulti ? picks.includes(o) : o === a.pick) ? ' on' : ''}">${_collectEsc(o)}</span>`).join('')}</div>`;
  if (parts.length) inner += `<div class="fav-ask-opts">${parts.map(p =>
    `<span class="fav-ask-opt on">${_collectEsc(p)}</span>`).join('')}</div>`;
  // 「TA」是拉丁字母与中文之间留一格，「你」是汉字不留（一句里出现两种空格里外＝看着像两套排版）
  const gap = a.mine ? ' ' : '';
  // 多选列勾了哪几枚，与聊天那张卡同一句说法；高亮的选项自己会数，不再补一句「共 N 个」
  const picked = isMulti
    ? `${who}${gap}勾了${picks.length ? picks.map(o => `「${_collectEsc(o)}」`).join('') : '几个'}`
    : `${who}${gap}选了「${_collectEsc(a.pick || '')}」`;
  const note = a.answered
    ? (parts.length ? `${who} 用 ${parts.length} 张字卡回了` : picked)
    : (a.mine ? '还在等 TA 回答' : '你还没选');
  return `${inner}<div class="fav-ask-note">${note}</div>`;
}

// 每次进入收藏页：联系人筛选回到「全部」。
// 为什么必须复位（BUGS #162）：_favCid 是模块级变量，上次停留在哪位就一直停着。用户收到
// 「阿澄 收藏了一条你的消息」的 toast 后点进收藏页，若上一趟筛的是白露，屏上只有白露那一本
// —— 于是「提示说 A、页面给 B」。落库归属本身是对的，是这个跨页残留的筛选把人带偏的。
function openCollectView() {
  _favCid = 'all';
  renderCollectList();
}

function renderCollectList() {
  const root = $('#collectList'); if (!root) return;
  const all = _favAll();
  const mine = all.filter(f => (f.by || 'me') !== 'ta');
  const ta = all.filter(f => (f.by || 'me') === 'ta');
  const q = _favQuery.trim().toLowerCase();

  // 「TA 的」联系人 chips（只列有收藏的联系人）
  const chipsBox = $('#favContactChips');
  if (chipsBox) {
    if (collectTab === 'ta') {
      const having = [];
      const seen = {};
      for (const f of ta) { if (!seen[f._cid]) { seen[f._cid] = 1; having.push({ cid: f._cid, name: f._cname }); } }
      chipsBox.innerHTML = `<button type="button" class="fchip${_favCid === 'all' ? ' on' : ''}" data-fcid="all">全部</button>`
        + having.map(c => `<button type="button" class="fchip${_favCid === c.cid ? ' on' : ''}" data-fcid="${_collectEsc(c.cid)}">${_collectEsc(c.name)}</button>`).join('');
      chipsBox.hidden = false;
    } else chipsBox.hidden = true;
  }

  // 数据集：我的=全部聚合；TA 的=按联系人筛选。查询与归属先筛＝pool，分类只从 pool 里挑。
  let pool = collectTab === 'ta' ? ta : mine;
  if (collectTab === 'ta' && _favCid !== 'all') pool = pool.filter(f => f._cid === _favCid);
  if (q) pool = pool.filter(f => _favHay(f).includes(q));
  // 分类计数走 pool（没按 kind 筛过的那一份）：旧写法拿已筛过的 list 再算计数，于是选中「信件」
  // 那一刻其余三枚同时报 0，而屏上明明还挂着一张卡＝一句当帧的假话（BUGS #194）
  const list = pool.filter(f => collectKind === 'all' || (f.kind || 'msg') === collectKind)
    .slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));   // 最新在前

  // 分类行（带计数）
  const kindRow = COLLECT_KINDS.map(o => {
    const cnt = o.k === 'all' ? pool.length : pool.filter(f => (f.kind || 'msg') === o.k).length;
    return `<button type="button" class="kchip${collectKind === o.k ? ' on' : ''}" data-kind="${o.k}">${o.label}<i>${cnt}</i></button>`;
  }).join('');
  const kindsBox = $('#favKinds');
  if (kindsBox) kindsBox.innerHTML = kindRow;

  // 卡片上的名标：这一行是「谁收的」的唯一落点，必须自带动词才不会被读成别的东西——
  // TA 那一面「白露 收藏」与 toast「白露 收藏了一条你的消息」同一口径；「我的」那一面是**我**收的，
  // 原文案「来自 · 白露」被读成「白露收藏的」（＝BUGS #162 用户报的那一幕），改明说「我存的」。
  const whoTag = f => {
    if (collectTab === 'ta') return `<span class="who">${_collectEsc(f._cname || partnerName())} 收藏</span>`;
    return `<span class="who who-from">我存的 · ${_collectEsc(f._cname || '')}</span>`;
  };

  let body = '';
  if (!list.length) {
    const K = { msg: '聊天消息', mail: '信件' };
    const why = q ? '没有匹配「' + _collectEsc(_favQuery.trim()) + '」的收藏'
      : (collectTab === 'ta' ? (_favCid === 'all' ? '还没有 TA 收藏' : '这个 TA 还没有收藏') : '暂无收藏') + (collectKind !== 'all' ? ' · ' + K[collectKind] : '');
    body = `<div class="fav-empty">${why}<br><span class="fav-empty-sub">收藏聊天或信，它们都会落在这里</span></div>`;
  } else {
    // 按月分组（瀑布列内以月份头分隔）
    const monthOf = f => { const d = new Date(f.ts || 0); return d.getFullYear() ? `${d.getFullYear()} 年 ${d.getMonth() + 1} 月` : ''; };
    const months = [];
    const byMonth = {};
    list.forEach(f => {
      const k = monthOf(f);
      if (!byMonth[k]) { byMonth[k] = []; months.push(k); }
      byMonth[k].push(f);
    });
    body = months.map(mk => {
      const items = byMonth[mk];
      const cards = items.map(f => {
        const kind = f.kind || 'msg';
        const who = kind === 'mail'
          ? (f.mailType === 'sent' ? '寄出的信' : '来信')
          : (f.side === 'out' ? '我' : (f._cname || partnerName()));
        const meta = `${_collectEsc(who)} · ${_favDay(f.ts)}`;
        let img = '';
        if (f.imgs && f.imgs.length) img = f.imgs[0];
        else {
          const mm = /(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)/.exec(f.text || '');
          if (mm) img = mm[1];
        }
        // 「[表情包]」是聊天气泡给无文字表情包消息用的占位符（chats.js 会话预览那一族），
        // 不是这句话的内容——以前被原样抄进收藏又原样端上屏（BUGS #194）
        let plain = (f.text || '').replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, '').trim();
        if (plain === '[表情包]') plain = '';
        const imgHtml = img ? `<img class="g-img" src="${_collectEsc(img)}" alt="">` : '';
        const txtHtml = plain ? `<div class="g-txt">${_collectTextHtml(plain)}</div>` : '';
        const askHtml = f.ask ? _favAskHTML(f.ask) : '';
        // 改版前存下的图片／表情包收藏只有文字（甚至是空串），图补不回来——当时就没抄进条目。
        // 留一行实话而不是继续挂一张空白卡；判重已改成认消息 id，回聊天再收藏一次就能拿到图。
        const voidHtml = (!img && !plain && !f.ask)
          ? `<div class="g-txt fav-void">${f.kind === 'msg' ? '这条当时只存下文字 · 回聊天再收藏一次就有图' : '这条没存下内容'}</div>` : '';
        // 这一行说的是「为什么收这一条」，两边共用同一条样式与同一个位置（一件事只在一处）：
        // TA 那一面是它自己动心的理由＝屏上只读（替他补一句「他为什么收」＝我编的）；
        // 「我的」那一面是**我**事后补的话，没写也照样给一行入口（藏着＝这功能没人知道有）。
        const reasonHtml = f.by === 'ta'
          ? ((f.reason || f.rsys)
            ? `<div class="fav-reason${f.rsys ? ' sys' : ''}">${f.rsys ? '（系统随机收藏，TA大概也没控制住）' : 'TA的理由 · ' + _collectEsc(f.reason)}</div>`
            : '')
          : `<div class="fav-reason fav-note${f.reason ? '' : ' todo'}">${f.reason ? '我写的 · ' + _collectEsc(f.reason) : '留一句话'}</div>`;
        return `<div class="fav-card${img ? ' has-img' : ''}" data-cts="${f.ts || ''}" data-cid="${_collectEsc(f._cid || '')}">${imgHtml}<div class="gt">${whoTag(f)}${txtHtml}${voidHtml}${askHtml}${reasonHtml}<div class="gm">${meta}</div></div></div>`;
      }).join('');
      const first = items[0];
      const dd = new Date(first.ts || 0);
      const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
      return `<div class="fav-month"><b>${CN[dd.getMonth()]}月</b><span>${dd.getFullYear()} · ${items.length} KEPT</span></div>` + cards;
    }).join('');
  }
  root.innerHTML = body;

  root.querySelectorAll('.fav-card').forEach(card => {
    card.oncontextmenu = e => { e.preventDefault(); _collectDel(card.dataset.cts, card.dataset.cid); };
    let t = null;
    card.addEventListener('touchstart', () => { t = setTimeout(() => _collectDel(card.dataset.cts, card.dataset.cid), 480); }, { passive: true });
    ['touchend', 'touchmove', 'touchcancel'].forEach(ev => card.addEventListener(ev, () => clearTimeout(t), { passive: true }));
    // 那一行「留一句话／我写的 · …」是这功能在这页唯一的入口：它自己吃掉这一下，
    // 不许再顺带触发卡片那一条（TA 那一面的点卡＝引用回话，两个动作各管一件事）
    const note = card.querySelector('.fav-note');
    if (note) note.addEventListener('click', e => { e.stopPropagation(); openFavNote(card.dataset.cts, card.dataset.cid); });
    card.onclick = () => {
      const item = _favAll().find(f => String(f.ts) === String(card.dataset.cts));
      if (!item || item.by !== 'ta' || (item.kind || 'msg') !== 'msg' || !item.text) return;
      if (typeof setReplyFromText !== 'function') return;
      setReplyFromText(item.text);
      showToast('已引用，去聊天回应这句话');
    };
  });
}

// 跨会话定位「那一条收藏」：卡片上带的是 ts＋册子 id，先按这一本找、找不到再按 ts 兜
// （旧写法只认 ts，而 ts 是收藏那一刻的时间戳——两本册子在同一毫秒各存一条是撞得上的，
// 撞上了就是删 A 的卡改 B 的话；一律走这一处，删与改不留两份实现＝BUGS #283）
function _favLocate(ts, cid) {
  const books = (data.contacts || []).map(c => c.id);
  const order = cid ? [cid].concat(books.filter(id => id !== cid)) : books;
  for (const id of order) {
    const key = 'collect-msgs:' + id;
    let list = [];
    try { list = JSON.parse(collectStore().get(key) || '[]'); } catch (e) { continue; }
    if (!Array.isArray(list)) continue;
    const i = list.findIndex(f => String(f.ts) === String(ts));
    if (i >= 0) return { key, list, i, cid: id };
  }
  return null;
}

// 跨会话删除：按 ts（优先连册子一起认）定位并删除
function _collectDel(ts, cid) {
  const at = _favLocate(ts, cid);
  if (!at) return;
  at.list.splice(at.i, 1);
  collectStore().set(at.key, JSON.stringify(at.list));
  renderCollectList();
  toast('已删除收藏');
}

// ===== 收藏动作（供聊天/信箱调用） =====
// 问问TA／TA 想问你那张卡收藏时带走的快照。只留屏上要说的那三件（题型·选项·答案）：
// status/delay 是「这张卡还能不能答」的运行时字段，收藏是一条记录不是一张还能答的卡，故不带。
// mine＝我问 TA（m.ask）；不是 mine＝TA 问我（m.taAsk），两句主语在屏上必须分得开。
function _collectAskSnap(m) {
  const a = m && (m.ask || m.taAsk);
  if (!a) return undefined;
  const s = { mine: !!m.ask, kind: a.kind === 'text' ? 'text' : (a.kind === 'multi' ? 'multi' : 'choice') };
  if (Array.isArray(a.opts)) s.opts = a.opts.slice();
  if (a.status === 'answered') {
    s.answered = true;
    if (a.pick) s.pick = a.pick;
    if (Array.isArray(a.picks)) s.picks = a.picks.slice();
    if (Array.isArray(a.parts)) s.parts = a.parts.slice();
  }
  return s;
}
window.collectMsg = function (side, text, extra) {
  const x = extra || {};
  const item = { kind: 'msg', side, text: String(text || '') };
  // 聊天里的图片与表情包同存 m.sticker（render.js 那一族），以前只抄 m.text 过来＝
  // 纯图那条 text 是空串、表情包那条是「[表情包]」占位符，收藏因此画成一张空白卡（BUGS #194）
  if (x.img) item.imgs = [x.img];
  if (x.mid) item.mid = x.mid;
  if (x.ask) item.ask = x.ask;
  const ok = window.addCollectItem(item);
  toast(ok ? '已收藏到我的收藏' : '已收藏过这条消息');
};
window.collectMail = function (mailType, title, text) {
  const ok = window.addCollectItem({ kind: 'mail', mailType, title: String(title || ''), text: String(text || '') });
  toast(ok ? '已收藏这封信' : '已收藏过这封信');
};
// TA 概率自动收藏（mochi 机制）：我发内容后，联系人按概率收进「TA 的收藏」，并从「TA心里话-收藏理由」挑一句理由挂上
// cid＝发起那本会话（在调用那一刻捕获，不进延迟回调现读）：延迟 1.2 秒里用户切了会话，
// 这条既不能落进别人的册子，也不能顶着别人的名字说「×× 收藏了你的消息」（BUGS #156）
function maybeCollectByTa(f, prob, cid) {
  const p = Number(prob); if (!(p > 0)) return;
  const at = cid || (typeof data !== 'undefined' && data.activeChat) || 'c0';
  if (Math.random() * 100 >= p) return;
  setTimeout(() => {
    const r = typeof taReasonPick === 'function' ? taReasonPick('collect', true) : { text: '', sys: false };
    const ok = window.addCollectItem(Object.assign({ by: 'ta', reason: r.text, rsys: r.sys || undefined }, f), at);
    if (ok && typeof toast === 'function') toast((_collectOwnerName(at) || 'TA') + ' 收藏了一条你的' + (f.kind === 'msg' ? '消息' : '信件') + (r.text ? '：' + r.text : ''));
  }, 1200);
}
// 收藏一条动态（朋友圈）。fid＝那条动态的 id：判重优先认它，两张文字相同的动态才不会被并成一条
// （#194 那一课：拿文字判重，两条没正文的动态 text 都是空串＝第二条起永远「已收藏过」）
window.collectFeed = function (m) {
  if (!m) return;
  const id = m.id;
  if (feedCollected(id)) { uncollectFeed(id); return; }
  const ok = window.addCollectItem({ kind: 'feed', text: String(m.text || ''), imgs: (m.imgs || []).slice(), fid: id });
  toast(ok ? '已收藏这条动态' : '已收藏过这条动态');
};
// 收藏态回显要能问「这条收过没有」——不回显＝同一件事两处各点一次，第二次只是弹一句「已收藏过」
function feedCollected(id) {
  if (id === undefined || id === null) return false;
  return _favAll().some(f => (f.kind || 'msg') === 'feed' && String(f.fid) === String(id));
}
function uncollectFeed(id) {
  let hit = false;
  for (const c of (data.contacts || [])) {
    const list = collectGet(c.id);
    const keep = list.filter(f => { const drop = (f.kind || 'msg') === 'feed' && String(f.fid) === String(id); if (drop) hit = true; return !drop; });
    if (keep.length !== list.length) collectSave(keep, c.id);
  }
  toast(hit ? '已取消收藏' : '这条不在收藏里');
  if (hit && typeof renderCollectList === 'function') renderCollectList();
}

// ===== 绑定 =====
(function () {
  // 分段：我的 / TA 的
  const seg = document.getElementById('collectTabs');
  if (seg) seg.addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b || b.dataset.tab === collectTab) return;
    collectTab = b.dataset.tab;
    seg.querySelectorAll('.fav-seg-btn').forEach(x => x.classList.toggle('sel', x === b));
    renderCollectList();
  });
  // 放大镜：只管查找。分类行不再藏在它后面（BUGS #194＝那一排整块 hidden，进页第一眼看不到任何分类）
  const tbtn = document.getElementById('favToolsBtn');
  const row = document.getElementById('favSearchRow');
  if (tbtn && row) tbtn.addEventListener('click', () => {
    row.hidden = !row.hidden;
    const inp = document.getElementById('favSearch');
    if (!row.hidden) { if (inp) inp.focus(); return; }
    // 收起查找框时把查询一起清掉：留着筛选而框不见了＝屏上凭空少几张卡且哪儿也关不掉
    if (inp && inp.value) { inp.value = ''; _favQuery = ''; renderCollectList(); }
  });
  // 分类行
  const kinds = document.getElementById('favKinds');
  if (kinds) kinds.addEventListener('click', e => {
    const b = e.target.closest('.kchip');
    if (!b) return;
    collectKind = b.dataset.kind;
    renderCollectList();
  });
  // 联系人 chips
  const fchips = document.getElementById('favContactChips');
  if (fchips) fchips.addEventListener('click', e => {
    const b = e.target.closest('.fchip');
    if (!b) return;
    _favCid = b.dataset.fcid;
    renderCollectList();
  });
  // 查找
  const inp = document.getElementById('favSearch');
  if (inp) {
    let t = null;
    inp.addEventListener('input', () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => { _favQuery = inp.value; renderCollectList(); }, 140);
    });
  }
})();

/* ===== 收藏设置面板（2026-10-09 由「设置 → TA 的世界 → TA 的收藏」那张折叠卡搬进来，旧卡与其摘要同批删净）=====
   两枚概率都是全局一份（data.collectSettings）：TA 自动收藏时按它掷骰，屏上只有这一个入口。
   落盘直接交回 save()（js/db.js 带去抖），不再叠第二层防抖；也不复用 settings.js 的 _autoSaveCard——
   那个助手定义在更晚加载的 settings.js 里，外链版（index-module.html）按文件顺序逐个 <script> 求值，
   本文件顶层那一刻它还不存在（内联版靠函数提升侥幸能过，两版行为不一致就是坑）。 */
const _COL_SET_FIELDS = [
  ['#collectTaMsg', 'taMsgProb'],
  ['#collectTaMail', 'taMailProb']
];
function _colSetDef(k) {
  const d = (typeof defaults === 'object' && defaults && defaults.collectSettings) || {};
  return Number.isFinite(d[k]) ? d[k] : 0;
}
function renderCollectSettings() {
  const cs = data.collectSettings || {};
  _COL_SET_FIELDS.forEach(f => { const el = $(f[0]); if (el) el.value = Number.isFinite(cs[f[1]]) ? cs[f[1]] : _colSetDef(f[1]); });
}
function saveCollectSettings() {
  if (!data.collectSettings) data.collectSettings = {};
  const cs = data.collectSettings;
  _COL_SET_FIELDS.forEach(f => {
    const el = $(f[0]); if (!el) return;
    const v = Number(el.value);
    cs[f[1]] = Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : _colSetDef(f[1]);
    el.value = cs[f[1]];   // 屏上不留一个不可能的数（填 300 会被夹回 100 并当场写回框里）
  });
  save();
}
function openCollectSettings() {
  const mask = $('#colSetMask');
  if (!mask) return;
  renderCollectSettings();
  mask.hidden = false;
}
function closeCollectSettings() {
  const mask = $('#colSetMask');
  if (mask) mask.hidden = true;
}
(function bindCollectSettings() {
  const btn = $('#colSetBtn'); if (btn) btn.onclick = openCollectSettings;
  const close = $('#colSetClose'); if (close) close.onclick = closeCollectSettings;
  const mask = $('#colSetMask');
  if (mask) mask.addEventListener('click', e => { if (e.target === mask) closeCollectSettings(); });   // 点遮罩空白收回，面板内点击不关
  const sheet = $('#colSetSheet');
  if (sheet) { sheet.addEventListener('input', saveCollectSettings); sheet.addEventListener('change', saveCollectSettings); }
})();

/* ===== 「我」给某一条收藏留一句话（2026-10-11 BUGS #283）=====
   用户口径「收藏也能留话」。收藏那一步仍一步到位（长按→收藏＝常规动作不插确认面板），
   这句是**事后**补的备注，所以入口长在卡片那一行上、不插进收藏那一刻。
   存的格子沿用 TA 那一面已有的 `reason`：两边说的是同一件事（「为什么收这一条」），只差主语，
   新开第二个字段＝同一件事两处各一份名字（#194 那族）。条目住在 localStorage 的
   collect-msgs:<cid> 里，零 data 字段零迁移。
   清空再「存好」＝这句话没了，不另配一枚「删掉这句」＝同一件事两处入口（#270 同一课）。 */
const FAV_NOTE_MAX = 120;
let _favNoteAt = null;   // 正在编辑的那一条 {ts, cid}；只活这一次，不进任何账

function openFavNote(ts, cid) {
  const at = _favLocate(ts, cid);
  if (!at) return;
  const f = at.list[at.i];
  if (!f || f.by === 'ta') return;   // TA 那一面的理由是它自己的账，不给改写
  _favNoteAt = { ts: f.ts, cid: at.cid };
  const inp = $('#favNoteInput');
  if (inp) inp.value = f.reason || '';
  const mask = $('#favNoteMask');
  if (mask) mask.hidden = false;
  if (inp) inp.focus();
}
function closeFavNote() {
  const mask = $('#favNoteMask');
  if (mask) mask.hidden = true;
  _favNoteAt = null;
}
function saveFavNote() {
  if (!_favNoteAt) return;
  const at = _favLocate(_favNoteAt.ts, _favNoteAt.cid);
  if (!at) { closeFavNote(); return; }   // 这一条已经不在册：不写字，也不报「已存好」那种假成功
  const inp = $('#favNoteInput');
  const v = String(inp && inp.value || '').trim().slice(0, FAV_NOTE_MAX);
  if (inp) inp.value = v;               // 屏上不留一个没存进去的字（超长的尾巴当场收掉）
  if (v) at.list[at.i].reason = v; else delete at.list[at.i].reason;   // 没写就不留一格空字符串
  collectStore().set(at.key, JSON.stringify(at.list));
  renderCollectList();
  closeFavNote();
}
(function bindFavNote() {
  const ok = $('#favNoteSave'); if (ok) ok.onclick = saveFavNote;
  const close = $('#favNoteClose'); if (close) close.onclick = closeFavNote;
  const mask = $('#favNoteMask');
  if (mask) mask.addEventListener('click', e => { if (e.target === mask) closeFavNote(); });   // 点遮罩空白收回，面板内点击不关
})();