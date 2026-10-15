// ===== 心愿（独立功能）=====
// 数据：data.wishlist = [{ wid 唯一 id, t 文字, ts 时刻, cid 归属会话, by 'ta'|'me',
//       done?, doneTs?, doneBy?('ta'=TA 促成), pin 置顶?, reacted? TA已回应过, echoed?, ann? 已存纪念日,
//       annId? 存成的纪念日 id, prop?/propTs? TA提议中（你点 ✓ 才算实现，14 天没点头悄悄收回）,
//       dueTs? 想在什么时候之前（末刻毫秒；**与 ts 是两件事**，见下方 WISH_DUE_TIERS），
//       img? 凭证图 dataURL（聊天长按图片关联） }]，不设上限全量保留
// 生成：wishTick() 挂 mailbox 30s 调度（升格独立前寄在 cjian.js cjMemoryTick 里）；素材=「TA心里话/心愿」组，
//       说出于谁＝当前活跃会话，入册同时进那条时间线的世界感知历史 k='w'
// 闭环：✓ 标记实现满 12h 后 TA 偶尔从「心愿回响」提起一次（echoed 只提一次）；你记下的心愿 TA 也会从
//       「心愿回应」看见（满 2h、当日一次、每条一次）；待实现满 3 天的旧心愿 TA 偶尔从「心愿促成」约你，
//       说了就把那条标成已实现（doneBy='ta'）
// 页面：✓ 标记实现／置顶（pin，排到最前）／点行改文字·换归属·删除（删除后 5s 内可撤销，不再弹 confirm）／
//       已实现的可一键存为纪念日／导出长图（svgToPngDownload，与单封信导出同族）
// 入口：功能中心「心愿」行 ＋ 世界感知面板那一行 ＋ 聊天长按菜单「心愿」＋ 统一搜索「心愿」类；开关 data.wishOn
// 从聊天记一条（BUGS #166）：长按「心愿」不再直接 wishAdd 落库，而是 openWishFromChat() 把那条消息
//       当草稿摆进编辑面板（_wishDraft = { text 原文, img 待挂凭证图, cid 来源会话 }）——预填全文、
//       选中待改、图挂在面板里等你确认，点「存好」才入库；关掉面板＝什么都不发生。纯图另走凭证挑选，
//       那一栏第一行永远是「记一条新的」，不再把人支回心愿页自己找。
// 版式：A「独白」范式（2026-10-04 二轮）——一条心愿是「写下来的话」不是「一条记录」：
//       零卡片容器／零日期列／✓ 常态隐身，只用左缘 2px 细竖线定边界，条目间靠发丝线与留白；
//       置顶时竖线加粗到 3px 转实墨；日期降级为 meta 行内小字附注（月已由分组头说过）

let _wishSel = '';    // '' = 全部联系人
let _wishTab = 'todo';
let _wishEdit = -1;   // -1 = 新记一条，否则 = 该条的 wid
let _wishDraft = null;// 草稿：聊天长按带来的 { text 原文, img 待挂凭证图, cid 来源会话 }；只在新建态生效
let _wishUndo = null; // 刚删除的一条 { e, i }，5s 内可撤销
let _wishUndoTimer = null;

function wishOn() { return data.wishOn !== false; }
function wishList() { return Array.isArray(data.wishlist) ? data.wishlist : []; }
function wishOwner(e) { return (e && e.cid) || 'c0'; }
function wishName(cid) {
  const c = (data.contacts || []).find(x => x.id === cid);
  return fixedNameOf(c) || 'TA';
}
function wishCountTodo(cid) {
  return wishList().filter(e => !e.done && (!cid || wishOwner(e) === cid)).length;
}
function wishById(id) { return wishList().find(e => e.wid === id); }
// 心愿归属只列单聊（群聊没有唯一的「TA」，与世界感知同口径）；群聊里的心愿仍归其 cid，只在「全部」可见
function _wishSingles() { return (data.contacts || []).filter(x => x.kind !== 'group'); }
// 心愿说给谁：当前活跃会话（不在联系人表里时回落到第一个联系人，再回落到 c0）
function _wishTargetCid() {
  const cs = data.contacts || [];
  const act = cs.find(x => x.id === data.activeChat);
  if (act) return act.id;
  return cs.length ? cs[0].id : 'c0';
}
function _wishPad(n) { return (n < 10 ? '0' : '') + n; }
function _wishEsc(v) { return escapeHTML(String(v == null ? '' : v)); }
function _wishNewId() { return 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
// 旧档没 wid 的补一个（ensureData 也会补，这里兜渲染期直塞的种子数据）
function _wishEnsureIds() {
  let dirty = false;
  for (const e of wishList()) if (!e.wid) { e.wid = _wishNewId(); dirty = true; }
  if (dirty) save();
}

function wishAdd(text, cid, by) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (!Array.isArray(data.wishlist)) data.wishlist = [];
  const e = { wid: _wishNewId(), t: t, ts: Date.now(), cid: cid || _wishTargetCid(), by: by === 'me' ? 'me' : 'ta' };
  data.wishlist.push(e);
  save();
  return e;
}

// ===== 想在什么时候之前（dueTs）=====
// 2026-10-08 用户定档：这一栏**不做精确到日的月历**，给几档口语说法就够（项目里 js/anniversary.js
//  那套日粒度月历是纪念日在用，机型差异大，但心愿是「大概有个盼头」，精确到日反而像填表单）。
// 存 dueTs＝该档**末刻**的毫秒；不设＝字段整个不存在（老档与 TA 自己说出的心愿都走这一支）。
// ⚠ 与 ts 是两件事，勿混：ts＝什么时候记下的（月份分组/排序/「我记的」那枚日号全读它），
//   dueTs＝什么时候之前要做的（只进 meta 行的期限签与促成逻辑）。改期限不重排列表。
function _wishDueEndOfMonth(add) {
  const n = new Date();
  const y = n.getFullYear(), m = n.getMonth() + add;
  return new Date(y, m + 1, 0, 23, 59, 59, 999).getTime();   // Date 会把 m 越界自动进位，跨年也对
}
// 季度末：本季度剩下的那几个月（3/6/9/12 月）。不能拿「+2 个月」糊弄 —— 5 月时那是 7 月底，
// 读着是「这个季度」实际却跨进了三季度；季末落点必须是本季最后一个月。
function _wishDueEndOfQuarter() {
  const n = new Date();
  const m = n.getMonth();
  const lastMonth = Math.floor(m / 3) * 3 + 2;     // 3/6/9/12（0 基的 2/5/8/11）
  return new Date(n.getFullYear(), lastMonth + 1, 0, 23, 59, 59, 999).getTime();
}
function _wishDueEndOfYear(add) {
  const n = new Date();
  // 月份用 11（12 月，Date 的月序从 0 起），日取 31 —— 写成 new Date(y, 0, 31) 是「1 月 31 日」不是 12 月，
  // 会让「今年内」算出今年元旦前、那条一建就显示逾期（这条自己踩过：量具 D2 读出 month=0 当场抓住）
  return new Date(n.getFullYear() + add, 11, 31, 23, 59, 59, 999).getTime();
}
// 档位表：label 是屏上话；end 是「算出这一档的落点」或**null 表示这一档不落期限**。
// ⚠ null 与函数混在一张表里，所以**任何调用都必须先判 typeof**（首版 chips 那处直接 t.end()，
//   被「不急」那一档的 null 打中 → openWishEditor 整段抛 → 面板永远开不了，连点行改字/删除
//   那几条路一起废掉。以后加档位只往这张表里加，不要在别处另判一次）。
// ⚠ 必须用 var 不能用 const/let：js/*.js 是内联进同一个 <script> 的经典脚本（不是 ESM），
//   `const` 声明不会挂到 window 上，而下面所有 `_wishDue*` 函数都在同一份作用域里读它——
//   真要断过：某次探针里页面侧读 WISH_DUE_TIERS 报 ReferenceError。与 js/utils.js 那些全局表同一口径。
var WISH_DUE_TIERS = [
  { k: 'none', label: '不急', end: null },
  { k: 'thisM', label: '这个月内', end: () => _wishDueEndOfMonth(0) },
  { k: 'nextM', label: '下个月', end: () => _wishDueEndOfMonth(1) },
  { k: 'season', label: '这个季度', end: () => _wishDueEndOfQuarter() },
  { k: 'year', label: '今年内', end: () => _wishDueEndOfYear(0) },
  { k: 'ever', label: '不着急，达成算', end: () => null }
];
function _wishDueEnd(k) {
  const t = WISH_DUE_TIERS.find(x => x.k === k);
  return t && typeof t.end === 'function' ? t.end() : null;
}
// 反推选中态用：档位算出的落点与现值一致才算选中。两档恰好落同一时刻（如季度末＝年末）时先中者胜，
// 与 chips 的书写顺序一致 —— 判据是「点这枚点下去会得到什么」，不是「存的是哪个 k」。
function _wishDueSame(end, cur) {
  const a = typeof end === 'number' ? end : null;
  const b = typeof cur === 'number' ? cur : null;
  return a === null ? b === null : b !== null && Math.abs(a - b) < 1000;
}
// 期限签的屏上话：过了几天 / 还剩几天 / 差一天；档位名字只在此处与面板 chips 里各说一次
function _wishDueMeta(w) {
  if (!w || typeof w.dueTs !== 'number' || !isFinite(w.dueTs)) return null;
  const now = Date.now();
  const days = Math.round((w.dueTs - now) / 864e5);
  const d = new Date(w.dueTs);
  const md = (d.getMonth() + 1) + '/' + d.getDate();
  if (w.done) return { late: false, text: md + ' 前' };
  if (days < 0) return { late: true, text: '过了 ' + (-days) + ' 天 · ' + md };
  if (days === 0) return { late: false, text: '就是今天 · ' + md };
  return { late: false, text: '还剩 ' + days + ' 天 · ' + md };
}
// 标记实现/撤销：点一下即生效（再点一次撤销），不弹确认；TA 提议中的点 ✓＝点头（记成 TA 促成），
// 撤销时把提议痕迹一并清掉（回到普通待实现，之后 TA 还能再约）
function wishSetDone(id, on) {
  const w = wishById(id);
  if (!w) return;
  if (on) {
    w.done = true; w.doneTs = Date.now();
    if (w.prop) { w.doneBy = 'ta'; delete w.prop; delete w.propTs; }
    else delete w.doneBy;
    delete w.echoed;
  }
  else { delete w.done; delete w.doneTs; delete w.doneBy; delete w.prop; delete w.propTs; delete w.echoed; }
  save();
}
function wishRemove(id) {
  const i = wishList().findIndex(e => e.wid === id);
  if (i < 0) return null;
  return wishList().splice(i, 1)[0];
}
// 删除后的撤销条（#wishUndo）：5s 内可原位放回，超时自动消失
function _wishUndoShow(entry, idx) {
  _wishUndo = { e: entry, i: idx };
  const bar = $('#wishUndo');
  if (!bar) return;
  bar.hidden = false;
  if (_wishUndoTimer) clearTimeout(_wishUndoTimer);
  _wishUndoTimer = setTimeout(_wishUndoHide, 5000);
}
function _wishUndoHide() {
  _wishUndo = null;
  if (_wishUndoTimer) { clearTimeout(_wishUndoTimer); _wishUndoTimer = null; }
  const bar = $('#wishUndo');
  if (bar) bar.hidden = true;
}

// ===== 调度：TA 说出心愿 ＋ 看见你记的 ＋ 促成旧心愿 ＋ 实现后的心愿回响 =====
// 邀请那一层已于 2026-10-11 从这里搬回独立一册（用户「还是分开吧」＝撤销 BUGS #270 那次融合）：
// 心愿条目自此没有 req 这一格，心愿页不长「让 TA 提」「去答」两枚钮，也不画待答签。
// 邀请的形状∶状态名单∶答复时刻全在 js/invite.js 与 js/utils.js 的 INVITE_STATUS 那几处。
function wishTick() {
  if (typeof _deliverToChat !== 'function' || typeof _cjGroupText !== 'function') return;
  if (typeof isSchedulerLeader === 'function' && !isSchedulerLeader()) return;
  const today = new Date().toLocaleDateString('zh-CN');
  const now = Date.now();
  _wishPropExpire(now);
  if (!data._wishDate) data._wishDate = '';
  if (!data._wishLast) data._wishLast = 0;
  if (wishOn() && data._wishDate !== today && now - data._wishLast >= 36 * 3600000 && Math.random() < 0.015) {
    const wish = _cjGroupText('心愿');
    if (wish) {
      const recent = wishList().slice(-5).map(e => e.t);
      if (!recent.includes(wish)) {
        data._wishDate = today; data._wishLast = now;
        const cid = _wishTargetCid();
        wishAdd(wish, cid, 'ta');
        if (typeof _cjHist === 'function') _cjHist(cid, { k: 'w', t: wish, ts: now });
        // TA 自己挑的这一句就此只是一句心愿（2026-10-11 撤销 #270 二批·甲：它不再同时长成一张能答的
        // 过目卡——那是「邀请」那一册的事，两件事分家以后不再互相附送）
        save();
      }
    }
  }
  // TA 看见你记的心愿：记下满 2h 后偶尔回应一次（当日一次，每条只回应一次，已实现/已回应的跳过）
  if (!data._wishReactDate) data._wishReactDate = '';
  if (wishOn() && data._wishReactDate !== today && Math.random() < 0.01) {
    const pool = wishList().filter(e => e.by === 'me' && !e.reacted && !e.done && typeof e.ts === 'number' && now - e.ts >= 2 * 3600000);
    const w = pool.length ? pool[pool.length - 1] : null;
    if (w) {
      const react = _cjGroupText('心愿回应');
      if (react) {
        data._wishReactDate = today;
        w.reacted = true;
        _deliverToChat({ id: nextId(), from: 'partner', text: react + '\n' + w.t, src: 'wish', unread: true }, wishOwner(w));
        save();
      }
    }
  }
  // TA 促成心愿：待实现满 3 天的旧心愿，隔 ≥4 天偶尔主动约一次。TA 只是提议——落成
  // 「TA 提议中」（prop），你点 ✓ 才转已实现；提议挂了 14 天没人点头就悄悄收回去
  if (!data._wishPushLast) data._wishPushLast = 0;
  if (wishOn() && now - data._wishPushLast >= 4 * 86400000 && Math.random() < 0.008) {
    const pool = wishList().filter(e => !e.done && !e.prop && typeof e.ts === 'number' && now - e.ts >= 3 * 86400000);
    if (pool.length) {
      const push = _cjGroupText('心愿促成');
      if (push) {
        // 有期限的先被约：等距时按「离到期最近」排 —— 设了期限的心愿，催的时机本就该跟着期限走
        // （旧口径只按 ts 挑最后一条＝新记的那条，与「什么时候之前」无关）。逾期的最优先。
        const ranked = pool.slice().sort((a, b) => {
          const da = typeof a.dueTs === 'number' ? a.dueTs : null;
          const db = typeof b.dueTs === 'number' ? b.dueTs : null;
          if (da === null && db === null) return 0;
          if (da === null) return 1;
          if (db === null) return -1;
          return da - db;
        });
        const w = _wishPickByWeather(ranked);
        data._wishPushLast = now;
        w.prop = true; w.propTs = now;
        _deliverToChat({ id: nextId(), from: 'partner', text: _wishPushText(w, push), src: 'wish', unread: true }, wishOwner(w));
        save();
      }
    }
  }
  if (!data._echoDate) data._echoDate = '';
  if (wishOn() && data._echoDate !== today && Math.random() < 0.01) {
    const pending = wishList().find(e => e.done && !e.echoed && typeof e.doneTs === 'number' && now - e.doneTs >= 12 * 3600000);
    if (pending) {
      const echo = _cjGroupText('心愿回响');
      if (echo) {
        data._echoDate = today;
        pending.echoed = true;
        _deliverToChat({ id: nextId(), from: 'partner', text: echo + '\n' + pending.t, src: 'wish', unread: true }, wishOwner(pending));
        save();
      }
    }
  }
}

// 提议挂了 14 天没点头就收回（不落历史、不弹提示），回到普通待实现，之后还能再被促成
function _wishPropExpire(now) {
  let dirty = false;
  wishList().forEach(e => {
    if (e.prop && typeof e.propTs === 'number' && now - e.propTs >= 14 * 86400000) { delete e.prop; delete e.propTs; dirty = true; }
  });
  if (dirty) save();
}
// 促成时优先挑「主人世界天气对得上」的心愿：TA 那边下雪就约看雪、下雨就约听雨；
// 对不上（或世界感知不可用）＝原样纯随机。只在雨/雪这两档讲这个道理，晴风太泛不硬凑
function _wishPickByWeather(pool) {
  let wx = '';
  if (typeof cjSkyFor === 'function') {
    const owners = [];
    pool.forEach(e => { const c = wishOwner(e); if (!owners.includes(c)) owners.push(c); });
    const skies = owners.map(cid => { try { return cjSkyFor(cid); } catch (err) { return null; } }).filter(Boolean);
    if (skies.some(s => s.weather === 'snow')) wx = 'snow';
    else if (skies.some(s => s.weather === 'rain')) wx = 'rain';
  }
  if (!wx) return pool[Math.floor(Math.random() * pool.length)];
  const re = wx === 'snow' ? /雪|冬|堆雪人/ : /雨|伞|听雨/;
  const matched = pool.filter(e => re.test(e.t || ''));
  const hit = matched.length ? matched[Math.floor(Math.random() * matched.length)] : pool[Math.floor(Math.random() * pool.length)];
  hit._wxMatch = wx;   // 仅供 _wishPushText 读，不落库
  return hit;
}
// 促成消息的措辞：天气对上时 TA 先聊一句那边天气（天气的话组），再约心愿；对不上就维持原两段
function _wishPushText(w, push) {
  let line = push + '\n' + w.t;
  const wx = w._wxMatch;
  if (wx && typeof _cjRemarkPick === 'function') {
    try {
      const remark = _cjRemarkPick(wx);
      if (remark) line = remark + '\n' + push + '\n' + w.t;
    } catch (err) {}
  }
  delete w._wxMatch;
  return line;
}

// ===== 渲染 =====
function _wishFiltered() {
  return wishList()
    .map((e, i) => ({ e: e, i: i }))
    .filter(x => !_wishSel || wishOwner(x.e) === _wishSel)
    .filter(x => (_wishTab === 'done') ? !!x.e.done : !x.e.done)
    .sort((a, b) => ((b.e.pin ? 1 : 0) - (a.e.pin ? 1 : 0)) || (b.e.ts - a.e.ts));
}
function _wishRow(x) {
  const e = x.e, d = new Date(e.ts);
  // 「谁说的」只说一遍：TA 说的 / 我记的；多于一名单聊或归在群聊时补归属名（群聊加「· 群」标，
  // 学纪念日口径）——「全部」列表里一排「我记的」要分得清是跟谁记的；正被筛中的那位不再重复报
  const oc = (data.contacts || []).find(c => c.id === wishOwner(e));
  const isGrp = !!(oc && oc.kind === 'group');
  const oName = (oc && (oc.chatName || oc.name)) || 'TA';
  const multi = (data.contacts || []).filter(c => c.kind !== 'group').length > 1;
  const mine = e.by === 'me';
  const showOwner = (multi || isGrp) && _wishSel !== wishOwner(e);
  const stamp = mine
    ? ('我记的' + (showOwner ? ' · ' + oName : '') + (isGrp ? ' · 群' : ''))
    : (oName + ' 说的' + (isGrp ? ' · 群' : ''));
  // 日期不再独占一列（那是上一版最刺眼的浪费：46px 只放一个日号，把句子挤到换行），
  // 降级成 meta 行里的一枚小字附注；月已由分组头说过，这里只补日与周几
  const day = _wishPad(d.getDate());
  const wk = '周日 周一 周二 周三 周四 周五 周六'.split(' ')[d.getDay()];
  const hhmm = _wishPad(d.getHours()) + ':' + _wishPad(d.getMinutes());
  // 已实现：正文转灰 + meta 行末一枚小签（不再叠删除线，长句上会糊成一片）；
  // TA 提议中：同位一枚待确认签——TA 只是约了，你点 ✓ 才算数
  let doneFlag = '';
  if (e.done) {
    const k = new Date(e.doneTs || e.ts);
    const tail = (e.doneBy === 'ta' ? 'TA 促成实现 ' : '已实现 ') + (k.getMonth() + 1) + '/' + k.getDate();
    doneFlag = `<span class="wish-doneflag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>${_wishEsc(tail)}</span>`;
  } else if (e.prop) {
    doneFlag = `<span class="wish-doneflag prop">TA 提议 · 等你点头</span>`;
  }
  // 期限签（与「置顶」「已实现」同位排在 meta 行末）：说期限时顺带说离今天多远，逾期的语气要不一样。
  // 不设期限的条目一个像素都不占 —— 这一栏是可选的，不该给每条都添一截。
  const dueMeta = _wishDueMeta(e);
  const dueFlag = dueMeta
    ? `<span class="wish-dueflag${dueMeta.late ? ' late' : ''}">${_wishEsc(dueMeta.text)}</span>`
    : '';
  return `<div class="wish-row${e.done ? ' done' : ''}${e.pin ? ' pin' : ''}${mine ? ' mine' : ''}" data-wish-id="${_wishEsc(e.wid)}" data-wish-edit="${_wishEsc(e.wid)}">`
    + `<p class="wish-quote"><span class="wish-text">${_wishEsc(e.t)}</span></p>`
    + (e.img ? `<img class="wish-proof" src="${_wishEsc(e.img)}" alt="凭证">` : '')
    + `<div class="wish-meta">`
    + (e.pin ? '<b class="wish-pinflag">置顶</b>' : '')
    + `<span class="wish-tick">${_wishEsc(stamp)}</span>`
    + `<span class="wish-date"><b>${day}</b><i>${wk}</i></span>`
    + `<span class="wish-clock">${hhmm}</span>`
    + dueFlag
    + doneFlag
    + `</div>`
    + `<button type="button" class="wish-ok" data-wish-done="${_wishEsc(e.wid)}" aria-label="${e.done ? '撤销已实现' : (e.prop ? 'TA 提议了，点头实现' : '标记为已实现')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></button>`
    + `</div>`;
}
function _wishEmpty() {
  const todo = _wishTab === 'todo';
  return `<div class="wish-empty"><span class="wish-empty-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${todo
    ? '<path d="M12 20.5S4.5 15.2 4.5 9.9A4.9 4.9 0 0 1 12 7.1a4.9 4.9 0 0 1 7.5 2.8c0 5.3-7.5 10.6-7.5 10.6z"/>'
    : '<path d="M20 6 9 17l-5-5"/>'}</svg></span>`
    + `<div class="wish-empty-t">${todo ? '还没有待实现的心愿' : '还没有已实现的心愿'}</div>`
    + `<div class="wish-empty-hint">${todo ? '点右下角「＋」记一条，TA 偶尔也会自己说起想做的事' : '在「待实现」里点一下 ✓，这条就挪到这里'}</div></div>`;
}
function renderWishPage() {
  const root = $('#wishView');
  if (!root) return;
  _wishEnsureIds();
  const all = wishList();
  // 计数跟着归属筛选走：报的是「你现在看到的这批」，不是全库总数
  const scoped = _wishSel ? all.filter(e => wishOwner(e) === _wishSel) : all;
  const done = scoped.filter(e => e.done).length;
  const stat = $('#wishStat');
  // 只报总数：两栏的数字由分段 tab 自己表达，页头再列一遍就是重复
  if (stat) stat.innerHTML = `共 <span class="wn-n">${scoped.length}</span> 条`
    + (done ? `<span class="wn-sep">·</span>已实现 <span class="wn-n">${done}</span>` : '');
  $$('.wish-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === _wishTab));
  const owners = $('#wishOwners');
  if (owners) {
    const singles = _wishSingles();
    owners.innerHTML = singles.length > 1
      ? `<button type="button" class="wish-ow${_wishSel === '' ? ' on' : ''}" data-wish-cid="">全部</button>`
        + singles.map(c => `<button type="button" class="wish-ow${c.id === _wishSel ? ' on' : ''}" data-wish-cid="${_wishEsc(c.id)}">${_wishEsc(c.chatName || c.name || 'TA')}</button>`).join('')
      : '';
  }
  const list = $('#wishList');
  if (!list) return;
  const rows = _wishFiltered();
  if (!rows.length) { list.innerHTML = _wishEmpty(); return; }
  let out = '', lastKey = '';
  rows.forEach(x => {
    const d = new Date(x.e.ts);
    const key = d.getFullYear() + '-' + (d.getMonth() + 1);
    if (key !== lastKey) {
      if (lastKey) out += '</div>';
      const n = rows.filter(y => { const k = new Date(y.e.ts); return (k.getFullYear() + '-' + (k.getMonth() + 1)) === key; }).length;
      out += `<div class="wish-mg"><b>${d.getMonth() + 1} 月</b><span class="rule"></span><span>${n} 条</span></div><div class="wish-group">`;
      lastKey = key;
    }
    out += _wishRow(x);
  });
  out += '</div>';
  list.innerHTML = out;
}

// ===== 导出长图（与单封信导出同族：拼 SVG → svgToPngDownload） =====
function _exportWishImage() {
  try {
    const list = wishList().slice().sort((a, b) => ((b.pin ? 1 : 0) - (a.pin ? 1 : 0)) || (b.ts - a.ts));
    if (!list.length) { showToast('还没有心愿可导出'); return; }
    const todo = list.filter(e => !e.done), done = list.filter(e => e.done);
    const now = new Date();
    const dateLabel = `${now.getFullYear()}.${_wishPad(now.getMonth() + 1)}.${_wishPad(now.getDate())}`;
    const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // SVG <text> 不自动换行：按 CJK 全宽/半角 0.55 宽贪心折行
    const wrap = (t, fsz, maxW) => {
      const out = [];
      for (const raw of String(t || '').split('\n')) {
        let line = '', w = 0;
        for (const ch of raw) {
          const cw = /[\x00-\xff]/.test(ch) ? fsz * .55 : fsz;
          if (w + cw > maxW && line) { out.push(line); line = ch; w = cw; } else { line += ch; w += cw; }
        }
        out.push(line);
      }
      return out;
    };
    const W = 750, pad = 60, ink = '#1a1a1a', mut = '#8a8a8e', fam = "-apple-system,'PingFang SC',sans-serif";
    let y = 210, body = '';
    const section = (label) => {
      body += `<text x="${pad}" y="${y}" font-size="20" font-weight="600" letter-spacing="6" fill="${ink}" font-family="${fam}">${esc(label)}</text>`;
      body += `<line x1="${pad}" y1="${y + 14}" x2="${W - pad}" y2="${y + 14}" stroke="${ink}" stroke-opacity=".12"/>`;
      y += 44;
    };
    const row = (e) => {
      const d = new Date(e.ts);
      const dl = `${d.getMonth() + 1}/${d.getDate()}`;
      const who = e.by === 'me' ? '你记下的' : wishName(wishOwner(e)) + ' 说的';
      const meta = e.pin ? '置顶 · ' + who : who;
      const xTxt = pad + 78;
      if (e.pin) body += `<rect x="${pad - 14}" y="${y - 22}" width="3" height="34" fill="${ink}"/>`;
      body += `<text x="${pad}" y="${y}" font-size="26" fill="${e.done ? mut : ink}" font-family="Georgia,'Times New Roman',serif" font-variant-numeric="tabular-nums">${esc(dl)}</text>`;
      const lines = wrap(e.t, 25, W - pad * 2 - 78);
      lines.forEach((l, i) => { body += `<text x="${xTxt}" y="${y + i * 38}" font-size="25" fill="${e.done ? mut : ink}" font-family="${fam}">${esc(l)}</text>`; });
      y += lines.length * 38 + 6;
      let meta2 = meta;
      if (e.prop && !e.done) meta2 += ' · TA 提议中';
      const dm = _wishDueMeta(e);
      if (dm) meta2 += ' · ' + (e.done ? '' : (dm.late ? '逾期 ' : '')) + dm.text;
      if (e.doneTs) { const k = new Date(e.doneTs); meta2 += ` · ${k.getMonth() + 1}/${k.getDate()} ${e.doneBy === 'ta' ? 'TA 促成实现' : '实现'}`; }
      body += `<text x="${xTxt}" y="${y}" font-size="17" letter-spacing="1" fill="${mut}" font-family="${fam}">${esc(meta2)}</text>`;
      y += 30;
      if (e.img) {   // 凭证图：正文下挂一张 104px 小图（dataURL 内嵌，SVG-as-image 允许）
        body += `<image x="${xTxt}" y="${y - 6}" width="104" height="104" preserveAspectRatio="xMidYMid slice" href="${e.img}" xlink:href="${e.img}"/>`;
        y += 112;
      }
    };
    if (todo.length) { section(`待实现 · ${todo.length}`); todo.forEach(row); y += 14; }
    if (done.length) { section(`已实现 · ${done.length}`); done.forEach(row); }
    y += 26;
    const H = y + 40;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#f7f7f5"/>`
      + `<text x="${pad}" y="96" font-size="32" font-weight="700" letter-spacing="8" fill="${ink}" font-family="${fam}">心愿</text>`
      + `<text x="${pad}" y="130" font-size="18" letter-spacing="4" fill="${mut}" font-family="-apple-system,sans-serif">${esc(dateLabel)} · ${todo.length} 待实现 / ${done.length} 已实现 · 言字卡 WISHES</text>`
      + `${body}<text x="${W / 2}" y="${H - 22}" text-anchor="middle" font-size="16" fill="#aeaeb2" letter-spacing="2" font-family="-apple-system,sans-serif">说过的，和你记下的</text></svg>`;
    if (typeof svgToPngDownload !== 'function') { showToast('导出失败'); return; }
    svgToPngDownload(svg, `言字卡-心愿-${now.getFullYear()}${_wishPad(now.getMonth() + 1)}${_wishPad(now.getDate())}.png`, 2);
    showToast('心愿已存为图片');
  } catch (e) { try { showToast('导出失败'); } catch (err) {} }
}

// ===== 记一条 / 改文字 =====
// 2026-10-13 用户「点击＋添加心愿，会显示『或者挑一句 TA 想过的』里面的内容，莫名其妙的，
// 我添加当然是我自己输入文字添加」：那一行候选（_wishRenderPick/_wishPickPool/_wishPoolGi 三件
// ＋ 面板里 [data-wish-pick]/[data-wish-pool-add] 两个点击分支）整族撤掉。
// ⚠ 一处事实校准（改前注释里写反了）：TA 促成／回响心愿读的是**册子里的条目**（wishList()），
// 从来不是那口卡组；卡组唯一的读方就是这条已删的候选行。故卡组不删也不改——db.js 四批照旧
// 补种那组预设句（删了不复活），它从此只是「功能 → 系统预设字卡 → 心愿」那一档里一组可改的预设卡
// ——主字卡库那一面硬排除 TA心里话 分类（render.js renderGroups ∶ PRESET_ONLY_CATEGORIES），
// 预设组「能加能删」是用户定档保留的（cards.js _clOpen 只挡 g.system）；用户补进去的句子照旧躺着。
function openWishEditor(id, draft) {
  _wishEdit = (typeof id === 'string' && wishById(id)) ? id : -1;
  _wishDraft = (_wishEdit === -1 && draft && typeof draft === 'object') ? draft : null;
  const mask = $('#wishMask');
  if (!mask) return;
  const w = _wishEdit !== -1 ? wishById(_wishEdit) : null;
  $('#wishPanelTitle').textContent = w ? '改这条心愿' : '记一条心愿';
  // 长按带进来的那一条：先把原文摆进去（超长截到面板上限，尾巴给个省略号，别静默吞字）
  const inp = $('#wishTextInput');
  if (w) inp.value = w.t;
  else if (_wishDraft && _wishDraft.text) {
    const raw = String(_wishDraft.text);
    inp.value = raw.length > 120 ? raw.slice(0, 119) + '…' : raw;
  } else inp.value = '';
  // 提示行只在这条是「从聊天带过来的」时说一遍：告诉人原文只是草稿，改完再存
  const hint = $('#wishPanelHint');
  if (hint) {
    const fromChat = !w && _wishDraft && _wishDraft.text;
    hint.textContent = fromChat ? '这条是从聊天里带来的，可以改成你们真正想做的事' : '';
    hint.hidden = !fromChat;
  }
  // 待挂凭证（草稿带来的图）：显示预览 + 让「不带了」能撤掉
  const pd = $('#wishProofDraft');
  if (pd) {
    const src = _wishDraft && _wishDraft.img ? String(_wishDraft.img) : '';
    pd.hidden = !src;
    if (src) { const im = $('#wishProofDraftImg'); if (im) im.src = src; }
  }
  const del = $('#wishPanelDel');
  if (del) del.hidden = !w;
  const pin = $('#wishPanelPin');
  if (pin) {
    pin.hidden = !w;
    pin.classList.toggle('on', !!(w && w.pin));
    pin.setAttribute('aria-pressed', w && w.pin ? 'true' : 'false');
  }
  const ann = $('#wishPanelAnn');
  if (ann) ann.hidden = !(w && w.done && !w.ann);
  // 「发给 TA」那枚开关随邀请分家一起摘了（2026-10-11 撤销 #270）：心愿面板只管记这一条，
  // 要约人就去「邀请」那一页写一句——两件事不再挤在同一块面板里
  // 「取消关联图片」两用：改已有条目＝摘掉那条的图；草稿态＝这张不带进新条（文案跟着变）
  const un = $('#wishPanelUnproof');
  if (un) {
    un.hidden = !((w && w.img) || (_wishDraft && _wishDraft.img));
    un.textContent = (w && w.img) ? '取消关联图片' : '这张不带';
  }
  const ownerRow = $('#wishOwnerRow');
  if (ownerRow) {
    const cs = _wishSingles();
    ownerRow.hidden = cs.length < 2;
    ownerRow.innerHTML = cs.map(c => {
      const cid = w ? wishOwner(w) : ((_wishDraft && _wishDraft.cid) || _wishSel || _wishTargetCid());
      return `<button type="button" class="wish-ow${c.id === cid ? ' on' : ''}" data-wish-own="${_wishEsc(c.id)}">${_wishEsc(c.chatName || c.name || 'TA')}</button>`;
    }).join('');
  }
  // 期限档位：选中态按「现值落在哪一档」反推，不另存一个 k —— 省一份可能对不上的状态
  const dueRow = $('#wishDueRow'), dueChips = $('#wishDueChips');
  if (dueRow && dueChips) {
    const cur = w ? w.dueTs : (_wishDraft && _wishDraft.dueTs);
    dueRow.hidden = false;
    dueChips.innerHTML = WISH_DUE_TIERS.map(t =>
      `<button type="button" class="wish-ow${_wishDueSame(typeof t.end === 'function' ? t.end() : null, cur) ? ' on' : ''}" data-wish-due="${_wishEsc(t.k)}">${_wishEsc(t.label)}</button>`
    ).join('');
  }
  mask.hidden = false;
  setTimeout(() => {
    if (!inp) return;
    inp.focus();
    // 预填进来的原文选中：进来就能直接改写（不选中就是光标落在末尾，容易误以为只能追加）
    if (!w && _wishDraft && _wishDraft.text && typeof inp.select === 'function') inp.select();
  }, 60);
}
function closeWishEditor() {
  const mask = $('#wishMask');
  if (mask) mask.hidden = true;
  _wishEdit = -1;
  _wishDraft = null;
}
function saveWishEditor() {
  const el = $('#wishTextInput');
  const t = el ? String(el.value || '').trim() : '';
  if (!t) { showToast('先写点什么'); return; }
  // 期限：只有当下点亮的那一枚才算数；「不急」与 never 档都不落 dueTs（字段整个不存在）
  const dueEnd = (function () {
    const on = $('#wishDueChips [data-wish-due].on');
    if (!on) return undefined;                    // 面板结构不在（老宿主）＝别动既有条目的期限
    return _wishDueEnd(on.dataset.wishDue);
  })();
  const applyDue = (w) => {
    if (!w || dueEnd === undefined) return;
    if (typeof dueEnd === 'number') w.dueTs = dueEnd;
    else delete w.dueTs;
  };
  if (_wishEdit !== -1) {
    const w = wishById(_wishEdit);
    if (w) { w.t = t; applyDue(w); save(); }
  } else {
    const own = $('#wishOwnerRow [data-wish-own].on');
    const cid = (own && own.dataset.wishOwn) || (_wishDraft && _wishDraft.cid) || _wishSel || _wishTargetCid();
    const nw = wishAdd(t, cid, 'me');
    applyDue(nw);
    // 草稿带来的凭证图：存好这一刻才挂上，取消则一张都不留
    if (nw && _wishDraft && _wishDraft.img) wishAttachImg(nw.wid, String(_wishDraft.img));
    if (nw) save();          // applyDue 改了 nw，这一句补一次落盘（wishAdd 里那次在 applyDue 之前）
    showToast('已记入心愿');
  }
  closeWishEditor();
  renderWishPage();
}
// 聊天长按「心愿」的入口：只把这条消息摆进面板，不碰数据。撤回消息仍然直接拒。
// 纯图（没有文字）另走凭证挑选 —— 那条本来就不该凭空造一句心愿文案。
function openWishFromChat(text, img, cid) {
  const t = String(text || '').trim();
  const pic = img ? String(img) : '';
  if (!t) {
    if (pic && typeof openWishProofPick === 'function') openWishProofPick(pic);
    else showToast('这条没法记成心愿');
    return;
  }
  openWishEditor(-1, { text: t, img: pic, cid: cid || '' });
}
// 已实现的心愿一键存为纪念日（实现那天变周年），存过就隐藏入口
function _wishSaveAsAnniversary(w) {
  if (!w || !w.done || w.ann) return;
  if (!Array.isArray(data.anniversaries)) data.anniversaries = [];
  const k = new Date(w.doneTs || Date.now());
  const date = `${k.getFullYear()}-${_wishPad(k.getMonth() + 1)}-${_wishPad(k.getDate())}`;
  const dup = data.anniversaries.some(a => a && a.name === w.t && a.date === date);
  if (!dup) {
    const rec = { id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: w.t.length > 30 ? w.t.slice(0, 30) + '…' : w.t, date: date, contactId: wishOwner(w), main: false, wishId: w.wid };
    data.anniversaries.push(rec);
    w.annId = rec.id;   // 回链：纪念日祝福提起时好认出「这条日子本来是一条心愿」
  }
  w.ann = true;
  save();
  showToast('已存入纪念日');
  renderWishPage();
}
function openWish(cid, tab) {
  // 只有一位单聊联系人不带筛选：筛选行本就隐藏，带着筛选进来会没有回「全部」的出口；
  // cid 是群聊时不落筛选（chips 只列单聊，带着群筛选进来会没有它的 chip 可点回去）
  const singles = _wishSingles();
  const multi = singles.length > 1;
  _wishSel = (multi && cid && singles.some(x => x.id === cid)) ? cid : '';
  _wishTab = tab === 'done' ? 'done' : 'todo';
  showView('wish');
}

// ===== 图片凭证：聊天长按图片「心愿」→ 挑一条待实现的挂上去 =====
function wishAttachImg(id, src) {
  const w = wishById(id);
  if (!w || !src) return;
  w.img = String(src);
  save();
}
let _wishProofPend = '';
// 纯图长按的凭证挑选。第一行永远是「记一条新的（这张图当凭证）」——原来只有一句「先记一条」，
// 没有可点的出口（BUGS #166 同源：让人自己找回心愿页，纯粹是多绕一圈）
const _wishProofNew = '<button type="button" class="wish-proof-opt new" data-wish-proof-new="1"><span>记一条新的</span><i>这张图当凭证</i></button>';
function openWishProofPick(src) {
  _wishProofPend = String(src || '');
  const mask = $('#wishProofMask');
  if (!mask) { showToast('先记一条心愿，再来关联图片'); return; }
  const pool = wishList().filter(e => !e.done);
  const list = $('#wishProofList');
  if (list) list.innerHTML = _wishProofNew
    + (pool.length
      ? pool.map(e => `<button type="button" class="wish-proof-opt" data-wish-proof="${_wishEsc(e.wid)}"><span>${_wishEsc(e.t)}</span><i>${_wishEsc(wishName(wishOwner(e)))}</i></button>`).join('')
      : '<p class="wish-proof-empty">还没有待实现的心愿 —— 点上面那条新记一张</p>');
  mask.hidden = false;
}
function closeWishProofPick() {
  const mask = $('#wishProofMask');
  if (mask) mask.hidden = true;
  _wishProofPend = '';
}

function bindWishView() {
  const tabs = $('#wishTabs');
  if (tabs) tabs.addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    _wishTab = b.dataset.tab;
    renderWishPage();
  });
  const owners = $('#wishOwners');
  if (owners) owners.addEventListener('click', e => {
    const b = e.target.closest('[data-wish-cid]');
    if (!b) return;
    _wishSel = b.dataset.wishCid;
    renderWishPage();
  });
  const list = $('#wishList');
  if (list) list.addEventListener('click', e => {
    const ok = e.target.closest('[data-wish-done]');
    if (ok) {
      const w = wishById(ok.dataset.wishDone);
      if (!w) return;
      wishSetDone(w.wid, !w.done);
      showToast(w.done ? '记下了，这条已实现' : '已放回待实现');
      renderWishPage();
      return;
    }
    const row = e.target.closest('[data-wish-edit]');
    if (row) {
      // 行内那枚 ✓ 排在「点行＝改这条」之前判：它自己也落在行里，晚一步就被行吞掉
      // （点一下开面板、什么都没标＝用户以为钮坏了，本仓「看着能点实则无反应」那一族的反向形态）
      openWishEditor(row.dataset.wishEdit);
    }
  });
  const mask = $('#wishMask');
  if (mask) mask.addEventListener('click', e => {
    if (e.target === mask || e.target.closest('#wishPanelClose')) { closeWishEditor(); return; }
    if (e.target.closest('#wishPanelSave')) { saveWishEditor(); return; }
    if (e.target.closest('#wishPanelAnn')) { const w = _wishEdit !== -1 ? wishById(_wishEdit) : null; if (w) { _wishSaveAsAnniversary(w); closeWishEditor(); } return; }
    if (e.target.closest('#wishPanelPin')) {
      const pin = e.target.closest('#wishPanelPin');
      const w = _wishEdit !== -1 ? wishById(_wishEdit) : null;
      if (w) {
        w.pin = !w.pin;
        if (!w.pin) delete w.pin;
        pin.classList.toggle('on', w.pin);
        pin.setAttribute('aria-pressed', w.pin ? 'true' : 'false');
        save();
        renderWishPage();
      }
      return;
    }
    if (e.target.closest('#wishPanelDel')) {
      const w = _wishEdit !== -1 ? wishById(_wishEdit) : null;
      if (!w) { closeWishEditor(); return; }
      const idx = wishList().findIndex(x => x.wid === w.wid);
      wishRemove(w.wid);
      closeWishEditor();
      renderWishPage();
      _wishUndoShow(w, idx);
      return;
    }
    if (e.target.closest('#wishPanelUnproof')) {
      const w = _wishEdit !== -1 ? wishById(_wishEdit) : null;
      // 改已有条目＝摘掉那条的图；草稿态＝把待挂的图从这条草稿里撤掉（数据还没落库，什么都不用删）
      if (w && w.img) { delete w.img; save(); showToast('已取消关联'); renderWishPage(); }
      else if (_wishDraft && _wishDraft.img) {
        _wishDraft.img = '';
        const pd = $('#wishProofDraft'); if (pd) pd.hidden = true;
        showToast('这张图不带了');
      }
      const un = $('#wishPanelUnproof');
      if (un) un.hidden = true;
      return;
    }
    const own = e.target.closest('[data-wish-own]');
    if (own) {
      mask.querySelectorAll('[data-wish-own]').forEach(b => b.classList.toggle('on', b === own));
      const w = _wishEdit !== -1 ? wishById(_wishEdit) : null;
      if (w) { w.cid = own.dataset.wishOwn; save(); }
      return;
    }
    // 期限档位：只切选中态，落盘一律等「存好」（与归属那枚一致＝面板里选的都不提前写库）
    const due = e.target.closest('[data-wish-due]');
    if (due) {
      mask.querySelectorAll('[data-wish-due]').forEach(b => b.classList.toggle('on', b === due));
      // 改已有条目时给即时反馈（它在屏上，看得见这枚点了有反应）；新建那条还没落库，不打扰
      const w = _wishEdit !== -1 ? wishById(_wishEdit) : null;
      if (w) {
        const end = _wishDueEnd(due.dataset.wishDue);
        if (typeof end === 'number') w.dueTs = end; else delete w.dueTs;
        save();
        renderWishPage();
      }
    }
    // 候选那一行（「挑一句 TA 想过的」 chips ＋ 行末「＋ 加一句」）2026-10-13 整族撤：
    // 用户「我添加当然是我自己输入文字添加」——记一条＝自己在题目框里写。那口池子归字卡库管。
  });
  const undoBtn = $('#wishUndoBtn');
  if (undoBtn) undoBtn.addEventListener('click', () => {
    if (!_wishUndo) { _wishUndoHide(); return; }
    const i = Math.min(_wishUndo.i, wishList().length);
    wishList().splice(i, 0, _wishUndo.e);
    save();
    _wishUndoHide();
    renderWishPage();
    showToast('已放回');
  });
  const proofMask = $('#wishProofMask');
  if (proofMask) proofMask.addEventListener('click', e => {
    if (e.target === proofMask || e.target.closest('#wishProofClose')) { closeWishProofPick(); return; }
    // 「记一条新的」：关掉挑选、把这张图带进新建面板当待挂凭证（不预填文字 —— 纯图没话可抄）
    if (e.target.closest('[data-wish-proof-new]')) {
      const src = _wishProofPend;
      closeWishProofPick();
      openWishEditor(-1, { text: '', img: src, cid: '' });
      return;
    }
    const opt = e.target.closest('[data-wish-proof]');
    if (!opt) return;
    const w = wishById(opt.dataset.wishProof);
    if (w && _wishProofPend) { wishAttachImg(w.wid, _wishProofPend); showToast('图片已作这条心愿的凭证'); renderWishPage(); }
    closeWishProofPick();
  });
  const fab = $('#wishAddBtn');
  if (fab) fab.onclick = () => openWishEditor(-1);
  const exp = $('#wishExportBtn');
  if (exp) exp.onclick = _exportWishImage;
}

bindWishView();
