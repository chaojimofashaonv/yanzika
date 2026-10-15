// ===== 邀请（独立功能：一页清单＋聊天里那张双向卡）=====
// 2026-10-11 用户「但还是感觉这两个功能加在一起很莫名其妙，还是分开吧」＝#270 那次融合撤销：
// 邀请自成一册（data.invites）、自成一页（入口＝「更多」那一行＋功能中心那一行），
// 心愿页自此不再有任何邀请入口（没有「发给 TA」那枚开关、没有「让 TA 提」、行上也不长待答签）。
//
// 一册一行＝一次邀请：{ iid, t 句子, dir?, cid?, status?, at?, replyAt?, reply?, from? }
//   没发出去过的只有 iid/t（屏上是一条草稿，右侧两枚去处钮）；发出去那一刻才落 dir∶cid∶status∶at
//   dir 'ta' = TA 邀请我 → 卡上三枚按钮（同意／拒绝／稍后）在我这侧，答一次即定
//   dir 'me' = 我邀请 TA → 卡上不画任何按钮（屏上没有「我替 TA 点同意」这条路），
//              到 replyAt 由本文件的 invTick 替 TA 答一句，那句作为一条正常气泡出现、卡只改状态行
//   status   = waiting / accepted / declined / later（名单只一份：js/utils.js 的 INVITE_STATUS，
//              db 的清洗∶本页∶那张卡∶invTick 全引它——写两处的后果 #270 那批记过）
// 「随机挑一位联系人」沿用用户最初那句原话（2026-10-10「联系人可以随机挑选，在聊天里发送，邀请我」）：
// 抽的是单聊（群聊没有一张脸在邀请你，与世界感知 _cjSingles 同口径），抽中谁就报一声名再带过去。
// 聊天那张卡的答没答**只从这一册读**（卡片自己不存状态＝两处各记一遍必有一份对不上，#270 那一课仍在）；
// 但认回来有三条路，全走 _invRecOfMsg 一处（不在渲染与委托两边各写一份）：
//   ① 本批之后发出去的：消息带 invite.iid → 按 iid 找；
//   ② #270 融合期间发出去的：消息带 invite.wid，而那条心愿的 req 已被 ensureData 搬成一行邀请
//      （搬过去时把当年的 wid 记在 from 上）→ 按 from 找；
//   ③ 独立页最早那批：既没 iid 也没 wid，状态只能记在消息自己身上（不回改、不补建）。
//
// 一行可以引用一条心愿（行上的 `wid`＝那句话来自心愿册的哪一条）——这是**单向引用**，与 #270 那次融合相反：
// 上次是心愿条目上挂一枚 `req`＝心愿**拥有**一次邀请，于是心愿页每一行都要判「这条是不是那张卡」；
// 这次是邀请**认得**心愿，`js/wish.js`／心愿页一个字不改。句子在发出那一刻抄一份进 `t`（历史不该随你
// 日后改心愿而变，同 #165「不重掷 lid」∶#156「文案与账解耦」那族），`wid` 只用来做去重与「还能不能再挑」。
// 同一句心愿在邀请册里**只占一行**（用户「已经添加过的心意不用重复添加」），要再申请走行上那枚「再请一次」
// ＝同一行重新投一张卡、册子不多一行（用户「已添加但未实现的心意也可以在聊天里重新发送向我申请」）。
// 重新申请过的那一行，旧的那张卡在屏上要老实说「后来又申请过一次」并收掉三枚钮——卡的状态是从册子
// 现读的，不作这一层区分的话旧卡会跟着翻回「等你答」＝同一句话能答两遍，第二遍把第一遍的账顶掉。
// 记「当前这一轮是哪张卡」的字段是行上的 `mid`（旧行没有＝旧卡一律算当轮，不给历史造一个它没有的轮次）。
// 刻意**没有**（用户那句「只是一个邀请机制，别乱加机制」）：概率档、冷却、每日上限、发送记录、
// 已发统计、待答闸门、TA 自己主动发邀请的那条钟（旧版就没有，融合版也没有——TA 那句话要过目仍归心愿）。

// ---------- 册子 ----------
function inviteList() { return Array.isArray(data.invites) ? data.invites : (data.invites = []); }
function invById(iid) { return inviteList().find(e => e && e.iid === iid); }
function _iidNew() { return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function _invEsc(v) { return escapeHTML(String(v == null ? '' : v)); }
// 单聊才算一位「联系人」：抽到群就说不清是谁在邀请
function _invSingles() { return (data.contacts || []).filter(x => x.kind !== 'group'); }
function _invName(cid) {
  const c = (data.contacts || []).find(x => x.id === cid);
  return (typeof fixedNameOf === 'function' && c ? fixedNameOf(c) : '') || (c && c.name) || 'TA';
}
// 唯一校验口径：一行是不是「已经发出去的邀请」全仓只问这一处（db 清洗在 utils 的名单上另做形状检查，
// 是因为它要在 invite.js 加载之前跑——两处判的是同一件事，加一档状态时两边都要动，注释各写了一句）
function _invOf(e) {
  if (!e || typeof e !== 'object') return null;
  if (e.dir !== 'ta' && e.dir !== 'me') return null;
  if (INVITE_STATUS.indexOf(e.status) < 0) return null;
  if (typeof e.at !== 'number' || !isFinite(e.at)) return null;
  if (typeof e.t !== 'string' || !e.t.trim()) return null;
  return e;
}
// 屏上那一枚状态签：两向 × 三种结果（「先放一放」不改语义只换个说法）
function _invMeta(e) {
  const r = _invOf(e);
  if (!r) return null;
  const pending = r.status === 'waiting' || r.status === 'later';
  const half = r.status === 'later';
  if (r.dir === 'ta') return { dir: 'ta', pending: pending, who: _invName(r.cid),
    text: pending ? (half ? '你放着 · 还没答' : '等你答') : (r.status === 'accepted' ? '你答应了' : '你拒绝了') };
  return { dir: 'me', pending: pending, who: _invName(r.cid),
    text: pending ? '等 TA 回' : (r.status === 'accepted' ? 'TA 答应了' : 'TA 这次不去') };
}
// 落一次状态（唯一写手）：改这一行并落盘，不重画聊天（谁调用谁负责那一面的渲染）
function invSet(iid, patch) {
  const e = invById(iid);
  if (!e || !_invOf(e)) return null;
  Object.assign(e, patch || {});
  save();
  return e;
}
// 答复话术从出厂组「邀请答复」按前缀取（前缀体例同世界感知那几条线）。池子被删／那一族一句不剩＝回空串，
// 宁可不说话也不自己编一句（#160 那句「我去骂他」就是这么被删掉的）
function _invAnswerLine(kind) {
  if (typeof _cjGroupCards !== 'function') return '';
  const pre = kind + '：';
  const hit = _cjGroupCards('邀请答复').filter(c => c.indexOf(pre) === 0).map(c => c.slice(pre.length)).filter(Boolean);
  return hit.length ? hit[Math.floor(Math.random() * hit.length)] : '';
}

// ---------- 发出去 ----------
// 两向共用一个出口：随机抽一位单聊 → 记下归属与时刻 → 投递只走 _deliverToChat 这一个口
// （未读∶横幅∶系统通知∶时间戳∶头像热度全在那一处，别在这儿重写第二份）
// 一行可以发很多次，但**册子始终一行**（#291）：已经发出去过的行再走一次这里＝「重新申请一遍同一句」，
// 旧写法那句「已经发出去过的不重发」早退被换掉——用户要的就是「已添加但未实现的心意可以在聊天里重新申请」，
// 而重复的只是「一次问话」，不是「一行记录」（同一句存两行才是他反对的「重复添加」）。
// 每一轮把当前那张卡记进行上的 mid，上一轮那张卡据此在屏上改口（见文件头那段）。
function _invFire(iid, dir) {
  const e = invById(iid);
  if (!e) return false;
  const again = !!_invOf(e);                       // 草稿 false∶已发出过的行 true（再请一次）
  const text = String(e.t || '').trim();
  if (!text) return false;
  const pool = _invSingles();
  if (!pool.length) { if (typeof showToast === 'function') showToast('还没有联系人'); return false; }
  const who = pool[Math.floor(Math.random() * pool.length)];
  const cid = who.id, now = Date.now(), mid = nextId();
  if (dir === 'me') {
    // 答复时刻在发出这一刻算死存进去（不在 tick 里现掷＝现掷每次轮到它都往前挪，屏上永远「等 TA 回」）
    e.replyAt = now + INV_REPLY_MIN + Math.floor(Math.random() * (INV_REPLY_MAX - INV_REPLY_MIN));
  } else {
    delete e.replyAt;                              // TA 邀我这侧不等谁回，留着上一轮的时刻只会让 invTick 白跑
  }
  e.dir = dir; e.cid = cid; e.status = 'waiting'; e.at = now; e.mid = mid;
  delete e.reply;                                  // 上一轮那句答复属于上一轮，新一轮不该顶着它
  save();
  if (dir === 'ta') {
    _deliverToChat({ id: mid, from: 'partner', text: text, unread: true, src: 'invite', invite: { iid: iid, dir: 'ta' } }, cid);
    if (typeof showToast === 'function') showToast(again ? _invName(cid) + ' 又邀请你了' : _invName(cid) + ' 邀请你了');
  } else {
    // from:'me' 走同一个投递口：未读/横幅/系统通知那三样在里面都只对 partner 生效，不会自己给自己报信
    _deliverToChat({ id: mid, from: 'me', text: text, src: 'invite', invite: { iid: iid, dir: 'me' } }, cid);
    if (typeof showToast === 'function') showToast('已发给 ' + _invName(cid));
  }
  if (typeof switchChat === 'function') switchChat(cid);   // 「随机」得让人看见抽中了谁
  if (again) _invRepaintStale(iid, mid);                   // 上一轮那张卡当场改口（见下面那位的注释）
  if (document.body.dataset.view === 'invite') renderInvitePage();
  return true;
}
// 重新申请之后，屏上上一轮那张卡必须当场改口：renderMessages 是增量追加（它不重建已在屏上的旧气泡），
// 不 swap 的话旧卡还挂着三枚钮＝「看着能点实则无反应」那一族（#138 二批同一课）。
// 只动这一行的卡（按 iid 认），别的行上一轮的答案与记号都不许被牵连重画
function _invRepaintStale(iid, mid) {
  if (typeof _inviteCardHTML !== 'function' || !data || !Array.isArray(data.messages)) return;
  [].slice.call(document.querySelectorAll('.inv-card')).forEach(el => {
    const id = el.dataset.invId;
    if (String(id) === String(mid)) return;
    const m = data.messages.find(x => String(x.id) === String(id));
    if (!m || !m.invite || m.invite.iid !== iid) return;
    el.outerHTML = _inviteCardHTML(m);
    // 换掉整块气泡会顺手把角上那枚「邀请」来源签一起换掉——那枚签是 _msgBadgesHTML 注在 .bubble 里面的，
    // 不在卡片模板里（AGENTS §6：src 无条件下写、签无条件出画）。补一次现成的 patchMessageBadges 把它挂回来，
    // 不在这行下面再抄一份拼签逻辑＝一处只有一个口径
    if (typeof patchMessageBadges === 'function') patchMessageBadges(m);
  });
}

// ---------- TA 到点答我这侧 ----------
// 答复窗口与应承率写在 js/utils.js 那几枚常量里（与状态名单同一族，db 不读它们、本文件是唯一读方）
function invTick() {
  if (typeof _deliverToChat !== 'function') return;
  if (typeof isSchedulerLeader === 'function' && !isSchedulerLeader()) return;
  const now = Date.now();
  const due = inviteList().find(e => {
    const r = _invOf(e);
    return !!r && r.dir === 'me' && (r.status === 'waiting' || r.status === 'later')
      && typeof r.replyAt === 'number' && isFinite(r.replyAt) && now >= r.replyAt;
  });
  if (!due) return;
  // 一轮只答一条：几条同时在等时不一次喷一串（按记录先后，等最久的那条本来就在前）
  const ok = Math.random() * 100 < INV_ACCEPT_PROB;
  const line = _invAnswerLine(ok ? '说好' : '拒了');
  invSet(due.iid, { status: ok ? 'accepted' : 'declined', reply: line });
  // 没词可说就只翻状态：册子上那一行与聊天里那张卡都会跟着改口，但不替 TA 编一句它没说过的话
  if (line) _deliverToChat({ id: nextId(), from: 'partner', text: line + '\n' + due.t, src: 'invite', unread: true }, due.cid);
  if (document.body.dataset.view === 'invite') renderInvitePage();
}

// ---------- 页面渲染 ----------
let _invEdit = '';   // 面板正在改哪一行（iid 字符串；'' = 新加）。只活本页寿命，不进 data
function _invEmpty() {
  return '<div class="iv-empty"><span class="iv-empty-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">'
    + '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7.5l9 6 9-6"/></svg></span>'
    + '<div class="iv-empty-t">还没有邀请</div>'
    + '<div class="iv-empty-hint">点下面「＋ 加一条」写一句——一行一条，发出去以后就是聊天里的三枚按钮</div></div>';
}
function _invRow(e, i) {
  const list = inviteList();
  const m = _invMeta(e), r = _invOf(e);
  // 时刻只认真在册的那一个：已发＝at（发出去那一刻）、草稿＝入册时的 ts；两个都没有就不画日期
  // （拿 Date.now() 顶上去＝每天刷新一次这一行都变成「今天」，屏上一句随时间漂的假话）
  const ts = r ? r.at : (typeof e.ts === 'number' && isFinite(e.ts) ? e.ts : null);
  const d = ts === null ? null : new Date(ts);
  const day = d ? (d.getDate() < 10 ? '0' : '') + d.getDate() : '';
  const wk = d ? '周日 周一 周二 周三 周四 周五 周六'.split(' ')[d.getDay()] : '';
  // 「谁发起的」由 dir 说一次，行上不再另写「你写的」——这一页每一行都是你写的（#095「一件事只在一处」）
  const tick = r ? (r.dir === 'ta' ? _invName(r.cid) + ' 邀请你' : '你邀请 ' + _invName(r.cid)) : '还没发出';
  const flag = m ? `<span class="iv-state${m.pending ? ' wait' : ''}">${_invEsc(m.text)}</span>` : '';
  // 两枚去处各管一件事、都只在真能按的时候出现（不留一枚点了没反应的钮）：
  // 草稿＝「让 TA 提」（TA 拿这句来约你）与「发给 TA」（你去约 TA）；
  // 已发＝「去答/去看」，而只有「TA 邀我」那一向再多给一枚「再请一次」（#291：同一句重新申请、册子不许多一行）。
  // 「我邀请 TA」那行不给重发＝用户没点名要「再催 TA 一次」，别乱加机制
  const acts = r
    ? `<button type="button" class="iv-go" data-inv-goto="${_invEsc(r.cid)}">${m && m.pending && r.dir === 'ta' ? '去答' : '去看'}</button>`
      + (r.dir === 'ta' ? `<button type="button" class="iv-go" data-inv-again="${_invEsc(e.iid)}">再请一次</button>` : '')
    : '<button type="button" class="iv-go" data-inv-ask="' + _invEsc(e.iid) + '">让 TA 提</button>'
      + '<button type="button" class="iv-go" data-inv-push="' + _invEsc(e.iid) + '">发给 TA</button>';
  return '<div class="iv-row' + (r ? ' sent' : '') + '" data-inv-edit="' + _invEsc(e.iid) + '">'
    + '<p class="iv-quote"><span class="iv-text">' + _invEsc(e.t) + '</span></p>'
    + '<div class="iv-meta">'
    + `<span class="iv-tick">${_invEsc(tick)}</span>`
    + (d ? `<span class="iv-date"><b>${day}</b><i>${wk}</i></span>` : '')
    + flag
    + acts
    + `<button type="button" class="iv-del" data-inv-del="${_invEsc(e.iid)}" aria-label="删掉这条邀请">×</button>`
    + '</div></div>';
}
function renderInvitePage() {
  const root = $('#inviteView');
  if (!root) return;
  const list = inviteList();
  const stat = $('#invStat');
  if (stat) {
    const waiting = list.filter(e => { const m = _invMeta(e); return m && m.pending; }).length;
    const draft = list.filter(e => !_invOf(e)).length;
    stat.innerHTML = `共 <span class="iv-n">${list.length}</span> 条`
      + (draft ? `<span class="iv-sep">·</span>没发出 <span class="iv-n">${draft}</span>` : '')
      + (waiting ? `<span class="iv-sep">·</span>等人回话 <span class="iv-n">${waiting}</span>` : '');
  }
  const box = $('#invList');
  if (!box) return;
  if (!list.length) { box.innerHTML = _invEmpty(); return; }
  // 新写的在前（与心愿页同一条读法：这是一份「最近说过什么」的清单，不是按字母排的名单）
  box.innerHTML = list.map((e, i) => _invRow(e, i)).reverse().join('');
}

// ---------- 面板（加／改）----------
// 复用全站那块贴底面板皮肤 .fs-sheet-*（#246·#275 立的家族）＝不再画第二套底部壳；
// 一个面板两种活：新加＝多行一次进多条（用户原话「一行一个」）；改＝只改这一行（单行，不拆行）
// 候选那一行＝心愿册里「没实现」的那几条，减去册子里已经有一行引用它（wid）的：
// 一次最多摆 INV_PICK_MAX 枚（新的在前）——心愿可能攒到几十条，全摆出来这块面板就只剩候选了
const INV_PICK_MAX = 6;
function _invWishPicks() {
  const list = inviteList();
  const out = (data.wishlist || []).filter(w => w && w.wid && !w.done
    && String(w.t || '').trim() && !list.some(e => e && e.wid === w.wid));
  return out.slice(-INV_PICK_MAX).reverse();
}
// 「这句是心愿里的哪一条」唯一算法：按**逐字相同**认，改过的一个字就不算——
// 半改的句子被当成引用会在屏上指着一条它其实不是的心愿（#160 那句「我去骂他」同款病：不替用户下判断）
function _invWidOfText(t) {
  const w = (data.wishlist || []).find(x => x && x.wid && !x.done && String(x.t || '').trim() === t);
  return w ? w.wid : '';
}
// 候选行单独成一个函数（心愿页那一行 2026-10-13 已整行撤，这里是从心愿册挑一句来邀请，两件事不同）：
// 开面板画一次，框里的字一变就再画一次，不留两份渲染。
// 选中态按「框里现在写的是哪句」反推＝不另存一个 _invPick 状态（两份状态必有一份对不上）
function _invRenderPick() {
  const row = $('#invPickRow'), chips = $('#invPickChips');
  if (!row || !chips) return;
  const pool = _invWishPicks();
  const inp = $('#invInput');
  const cur = String((inp && inp.value) || '').trim();
  const cap = $('#invPickCap');
  // 一本心愿都没有＝这一行没有可挑的东西，整行不出（留一句「TA 想过的一都说过了」是替用户编故事）；
  // 有心愿但都被挑过/实现了＝照旧出这一行，那句改口成「自己写一句」——那正是该补一句的时候（同心愿页那行）
  const anyOpen = (data.wishlist || []).some(w => w && w.wid && !w.done);
  if (!anyOpen) { row.hidden = true; chips.innerHTML = ''; return; }
  if (cap) cap.textContent = pool.length ? '或者挑一句 TA 想过的（没实现的那几条）' : 'TA 想过的一都说过了，自己写一句';
  row.hidden = false;
  chips.innerHTML = pool.map(w => {
    const t = String(w.t || '').trim();
    return `<button type="button" class="fchip${t === cur ? ' on' : ''}" data-inv-pick="${_invEsc(t)}" title="${_invEsc(t)}">${_invEsc(t)}</button>`;
  }).join('');
}
function openInviteEditor(iid) {
  const cur = typeof iid === 'string' && iid ? invById(iid) : null;
  // 只有草稿能开面板改（行上的 cursor 早已按这个事实分成两种：.iv-row.sent 是 default）＝
  // 一道闸判在入口这一处，不在点击侧再判一遍、也不在保存侧留第三遍（三处判据必漂）
  if (iid && !cur) return;
  if (cur && _invOf(cur)) return;
  _invEdit = cur ? cur.iid : '';
  const mask = $('#invMask'), inp = $('#invInput'), ti = $('#invTi'), del = $('#invDel');
  if (!mask || !inp) return;
  const editing = !!_invEdit;
  if (ti) ti.textContent = editing ? '改这一条邀请' : '加一条邀请';
  inp.value = editing ? String((invById(_invEdit) || {}).t || '') : '';
  inp.placeholder = editing ? '这一条邀请要说什么' : '比如：今晚一起看电影好不好\n一行一条，可以一次写好几条';
  if (del) del.hidden = !editing;
  mask.hidden = false;
  _invRenderPick();                                 // 候选行跟着这一次开板画一遍（改草稿那一发也画：它同样可能是一句心愿）
  setTimeout(() => { try { inp.focus(); if (editing && typeof inp.select === 'function') inp.select(); } catch (err) {} }, 60);
}
function closeInviteEditor() {
  const mask = $('#invMask');
  if (mask) mask.hidden = true;
  _invEdit = '';
}
function saveInviteEditor() {
  const inp = $('#invInput');
  const raw = String((inp && inp.value) || '').trim();
  if (!raw) { showToast('先写一条'); return; }
  if (_invEdit) {
    // 走到这里的一定是草稿：入口那道闸（openInviteEditor）已经把已发出的行挡在外面，
    // 这里不再判第二遍＝留两遍判据必漂（漂的那一遍就是一条「点了没反应」或「改字把卡与册子分开」）
    const e = invById(_invEdit);
    if (e) {
      e.t = raw.split(/\r\n|\r|\n/)[0].trim() || e.t;
      const w = _invWidOfText(e.t);
      if (w) e.wid = w; else delete e.wid;          // 逐字对得上才算引用；改过一个字就不算（宁可不挂，不指着一条它不是的心愿）
      save();
    }
    closeInviteEditor(); renderInvitePage(); return;
  }
  const lines = raw.split(/\r\n|\r|\n|\u2028|\u2029/).map(s => s.trim()).filter(Boolean);
  if (!lines.length) { closeInviteEditor(); return; }
  const list = inviteList();
  // 两把去重闸各拦一件事：同文跳过＝一次粘两份、或你把同一条写了两遍，屏上不该长出两枚一模一样的钮（#194 那一族）∶
  // 同 wid 跳过＝一句心愿在这本册子里只占一行（用户那句「已经添加过的心意不用重复添加」），
  //   要再申请用行上那枚「再请一次」——它重发的是**这一次问话**，不是新建一行
  let added = 0, dup = 0;
  lines.forEach(s => {
    if (list.some(e => String(e.t || '').trim() === s)) { dup++; return; }
    const wid = _invWidOfText(s);
    if (wid && list.some(e => e && e.wid === wid)) { dup++; return; }
    const rec = { iid: _iidNew(), t: s, ts: Date.now() };
    if (wid) rec.wid = wid;
    list.push(rec);
    added++;
  });
  save();
  closeInviteEditor();
  renderInvitePage();
  showToast(added ? `加了 ${added} 条${dup ? `，${dup} 条已经有` : ''}` : '这些已经有了');
}

// ---------- 绑定 ----------
(function () {
  const add = $('#invAdd');
  if (add) add.addEventListener('click', () => openInviteEditor(''));
  const ok = $('#invOk');
  if (ok) ok.addEventListener('click', saveInviteEditor);
  const cancel = $('#invCancel');
  if (cancel) cancel.addEventListener('click', closeInviteEditor);
  const del = $('#invDel');
  if (del) del.addEventListener('click', () => {
    const e = _invEdit ? invById(_invEdit) : null;
    if (!e) { closeInviteEditor(); return; }
    const i = inviteList().indexOf(e);
    if (i >= 0) inviteList().splice(i, 1);
    save();
    closeInviteEditor();
    renderInvitePage();
    if (i >= 0) _invUndoShow(e, i);
  });
  const mask = $('#invMask');
  if (mask) mask.addEventListener('click', e => {
    // 候选那一枚先判：它也在面板里，晚一步会被「点遮罩＝关板」那条吞掉（点芯片不该关板）
    const pick = e.target.closest('[data-inv-pick]');
    if (pick) {
      const box = $('#invInput');
      if (box) { box.value = pick.dataset.invPick || ''; box.focus(); }
      _invRenderPick();                             // 选中态按框里的字反推，填完就要重画一次
      return;
    }
    if (e.target === mask) { closeInviteEditor(); return; }
  });
  const box = $('#invInput');                        // 自己改过一个字＝这一句就不再是那条心愿，选中态跟着灭
  if (box) box.addEventListener('input', () => _invRenderPick());
  const list = $('#invList');
  if (list) list.addEventListener('click', e => {
    // 三枚行内钮都排在「点行＝改这条」之前判：它们自己也落在行里，晚一步就被行吞掉
    const ask = e.target.closest('[data-inv-ask]');
    if (ask) { invAsk(ask.dataset.invAsk); return; }
    const push = e.target.closest('[data-inv-push]');
    if (push) { invPush(push.dataset.invPush); return; }
    const again = e.target.closest('[data-inv-again]');
    if (again) { invAsk(again.dataset.invAgain); return; }   // 同一句再申请一次：走同一个出口，册子不多一行
    const go = e.target.closest('[data-inv-goto]');
    if (go) { if (typeof switchChat === 'function') switchChat(go.dataset.invGoto); return; }
    const rm = e.target.closest('[data-inv-del]');
    if (rm) {
      const i = inviteList().findIndex(x => x && x.iid === rm.dataset.invDel);
      if (i < 0) return;
      const cut = inviteList().splice(i, 1)[0];
      save();
      renderInvitePage();
      _invUndoShow(cut, i);
      return;
    }
    const row = e.target.closest('[data-inv-edit]');
    if (row) openInviteEditor(row.dataset.invEdit);
  });
  const undo = $('#invUndoBtn');
  if (undo) undo.addEventListener('click', () => {
    if (!_invUndo) { _invUndoHide(); return; }
    inviteList().splice(Math.min(_invUndo.i, inviteList().length), 0, _invUndo.e);
    save();
    _invUndoHide();
    renderInvitePage();
    showToast('已放回');
  });
})();

// 删除后 5 秒可放回（与心愿页那条撤销条同一手感；不复用它的 DOM＝两页各一枚，共用状态会互相顶）
let _invUndo = null, _invUndoTimer = null;
function _invUndoShow(entry, idx) {
  _invUndo = { e: entry, i: idx };
  const bar = $('#invUndo');
  if (!bar) return;
  bar.hidden = false;
  if (_invUndoTimer) clearTimeout(_invUndoTimer);
  _invUndoTimer = setTimeout(_invUndoHide, 5000);
}
function _invUndoHide() {
  _invUndo = null;
  if (_invUndoTimer) { clearTimeout(_invUndoTimer); _invUndoTimer = null; }
  const bar = $('#invUndo');
  if (bar) bar.hidden = true;
}
// 两枚去处各一个入口名（面板与页内都调这两个，不在两处各写一份 _invFire 参数）
function invAsk(iid) { return _invFire(iid, 'ta'); }
function invPush(iid) { return _invFire(iid, 'me'); }
function openInvite() { showView('invite'); }

// ---------- 聊天里那张卡的三态（同意 / 拒绝 / 稍后）----------
// 挂在 #messageList 上（与 taask 同一处委托）。卡片只可能出现在当前打开的会话里（人点了才看得到），
// 所以查 data.messages（＝活跃会话流的别名）够用，与 taask 同口径。
(function () {
  const list = $('#messageList');
  if (!list) return;
  list.addEventListener('click', e => {
    const btn = e.target.closest('[data-inv-act]');
    if (!btn) return;
    // ⚠ 必须按类名找那张卡：按钮自己身上也带 data-inv-id（点击委托要认消息 id），
    // 用 closest('[data-inv-id]') 会先命中按钮自己＝把整张卡塞进 .inv-acts 里、旧按钮还杵着（#270 自测抓出的真缺陷）
    const cardEl = btn.closest('.inv-card');
    if (!cardEl) return;
    const m = data.messages.find(x => String(x.id) === cardEl.dataset.invId);
    if (!m || !m.invite) return;
    const v = m.invite;
    if (v.dir === 'me') return;                 // 我方发出的那张不画按钮；这一道兜「别处造出来的一枚假钮」
    const act = String(btn.dataset.invAct || '');
    if (act !== 'accept' && act !== 'decline' && act !== 'later') return;
    const st = act === 'later' ? 'later' : (act === 'accept' ? 'accepted' : 'declined');
    const hit = _invRecOfMsg(v, m.id);
    if (hit && hit.stale) { _invPaint(cardEl, m); return; }   // 上一轮那张卡答不动（这一句后来又申请过一次），只让它改口

    if (hit) {
      if (hit.rec.status !== 'waiting') return;  // 已答过的（含「先放一放」）一律不改——重答会把一句「这次不了」又改成答应，账就假了
      invSet(hit.rec.iid, { status: st });
      _invPaint(cardEl, m);
      if (act !== 'later') _deliverToChat({ id: nextId(), from: 'me', text: act === 'accept' ? '好呀' : '这次不了', quote: hit.rec.t }, data.activeChat);
      return;
    }
    if (v.iid || v.wid) {
      // 记录被删了：卡片答不动（答了也没人认账），老实说一句而不是留三枚点了没反应的钮
      _invPaint(cardEl, m);
      return;
    }
    // ── 最早那批（融合之前发出去的）：没有 iid/wid，状态只能记在消息自己身上。
    //    不回改、不补建邀请条目——那条句子当初就没进册子，现在替它造一条等于替用户回忆当时想的是什么
    if (v.status && v.status !== 'waiting') return;
    m.invite.status = st;
    save();
    _invPaint(cardEl, m);
    if (act !== 'later') _deliverToChat({ id: nextId(), from: 'me', text: act === 'accept' ? '好呀' : '这次不了', quote: m.text || '' }, data.activeChat);
  });
})();
// 一张卡找它那一行（三条来路只在这一处判，渲染与委托共用；见文件头①②③）
// 第二参 mid＝屏上这张卡自己的消息 id。行上记着「当前这一轮是哪张卡」（re-request 之后 mid 会换），
// 对不上的那张是**上一轮**：状态仍从册子读会让它翻回「等你答」＝同一句话能答两遍，故如实标 stale 交给渲染收钮
function _invRecOfMsg(v, mid) {
  if (!v || typeof v !== 'object') return null;
  let e = null;
  if (v.iid) e = invById(v.iid);
  else if (v.wid) e = inviteList().find(x => x && x.from === v.wid);
  const r = e && _invOf(e);
  if (!r) return null;
  if (mid !== undefined && r.mid && String(mid) !== String(r.mid)) return { rec: r, stale: true };
  return { rec: r };
}
// 就地换这一张卡的 DOM，不走全量重画：renderMessages 是增量追加（它不重建已在屏上的旧气泡），
// 不 swap 的话册子已记成「答应了」而屏上三枚钮还杵着＝同一件事两处各说一遍（#138 二批那一课）
function _invPaint(cardEl, m) {
  if (typeof _inviteCardHTML === 'function') cardEl.outerHTML = _inviteCardHTML(m);
}
