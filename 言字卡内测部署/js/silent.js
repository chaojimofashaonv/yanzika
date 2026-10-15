// ===== 主动消息管理（2026-10-12 落地）=====
// 一件只有一层意思的事：批量决定【哪些联系人与群】不再有 TA 主动发来的新消息。
// 2026-10-13 二批同一页再加一排「说给群」快捷档（用户点名搬进来方便批量管理）：它写的是每人自己
// 那份 chatSettings[cid].asGroupProb＝与「TA 的设置 → 回复节奏」里那一格同一个字段，这里只是批量
// 入口、不长第二本账（要填 37 这种个位数仍回那一格）；那一排只挂在单聊节（理由见 setChatProb）。
// 与 js/night.js 的分工：night 按**时间**（夜里那一档）全站拦，这一份按**人按群**长期拦。
// 两道闸同时在场、任一命中都不掷，互不覆盖也互不清（夜里那一档过去了，名单上的照旧关着）。
// 拦法与 night 同口径＝**到点不掷**：闸写在 js/chat.js 的 _activeSendTick（挑人之前，紧挨 night 那一道）
// 与 _asGroupSeats（落点之前），不在投递口拦也不在渲染口藏＝不生成就不存在「已生成没送到」的半截账，
// 「不再接收或提醒」靠的是那条消息根本不诞生：没有未读角标、没有桌面前台横幅、没有提示音与系统通知。
// 群为什么一道闸就够：群没有自己的钟（BUGS #216），群里每一句主动消息都是某位单聊联系人到点之后
// 经 _asTargetOf 落进去的；把群关掉＝_asGroupSeats 不再把它当座位，那一发落回他自己的单聊——
// 所以**单聊与群聊同一道闸**，不留第二份实现。
// 边界（屏上同一份文案，写在 html/view-silent.html 与 toast 里）：只管【TA 主动】发消息。
// 你发一句话之后 TA 的回话、TA 主动来电（来电总开关在设置 → 提醒 → 通话）、信件到站、纪念日开口
// 都不在这条链上；到点被让过去的那几句不攒账、不补回来（与 night 同一条定档：让它过去）。
// 名单上限 SILENT_MAX_IDS 只是防脏档膨胀：联系人本就是几十人的量级，屏上永远够用。
const SILENT_MAX_IDS = 500;
const SILENT_DEFAULT = { ids: [] };
// 「说给群」的快捷档（2026-10-13 用户点名把这一格搬进本页方便批量管理）：屏上那一排 chips 的唯一名单，
// 写的是每人自己那份 chatSettings[cid].asGroupProb——与「TA 的设置 → 回复节奏」里那一格同一个字段、
// 同一把尺＝这里只是批量入口，不长出第二本账（精确到个位数的值仍回那一格填，所以这里只给五档快捷）。
// 100 的语义照实写：每一发都说给群＝他不再主动发到你单聊（js/chat.js 的 _asTargetOf 一次只定一个落点）。
const SILENT_PROBS = [{ v: 0, t: '从不' }, { v: 10, t: '偶尔' }, { v: 30, t: '有时' }, { v: 50, t: '对半' }, { v: 100, t: '总是' }];
// 本页寿命内的筛选态（全部／只看已关闭）：只活在这一页，不读也不写 data
let _silentFilter = 'all';

// data 还没就位（启动前的顶层调用）就返回 null，不在那一瞬往 data 上挂东西——
// 本仓 #296 那一批就是加载期摸 data 把整条启动链炸断的，同一课防一手
function silentCfg() {
  if (typeof data === 'undefined' || !data || typeof data !== 'object') return null;
  if (!data.silent || typeof data.silent !== 'object' || Array.isArray(data.silent)) {
    data.silent = JSON.parse(JSON.stringify(SILENT_DEFAULT));
  }
  return data.silent;
}
function silentIds() {
  const s = silentCfg();
  return (s && Array.isArray(s.ids)) ? s.ids : [];
}
// 生效判据只有一条＝这一格在不在名单里。chat.js 那两道闸与屏上各行都读它：
// 「开了但不在名单」与「在名单」之间没有第三态（留第三态＝本仓「设了不生效」那一族）
function chatSilentOn(cid) {
  return !!cid && silentIds().indexOf(cid) >= 0;
}
// 唯一写手（这一页的开关∶两枚批量钮∶首页长按动作单都走它）。只给在册的联系人与群记账，
// 返回「这一下有没有真改动」＝没改动不 save、不 toast（点了没反应那一族，反过来也成立）
function setChatSilent(cid, muted) {
  const s = silentCfg();
  if (!s || !cid) return false;
  const c = (data.contacts || []).find(x => x && x.id === cid);
  if (!c) return false;   // 不在册不给记账；删掉的格由 silentPrune 收
  if (!Array.isArray(s.ids)) s.ids = [];
  const i = s.ids.indexOf(cid);
  if (muted) {
    if (i >= 0 || s.ids.length >= SILENT_MAX_IDS) return false;
    s.ids.push(cid);
    return true;
  }
  if (i < 0) return false;
  s.ids.splice(i, 1);
  return true;
}
// 批量：整段名单过一遍同一个写手，返回真改了几条
function silentBatch(ids, muted) {
  let n = 0;
  (ids || []).forEach(id => { if (setChatSilent(id, muted)) n++; });
  return n;
}
// ===== 「说给群」那一档（每人自己那份 asGroupProb）=====
// 这一位的落点档。缺档兜出厂那份，刻意不回落 data.behavior——那是「此刻屏幕上开着的那个人」的档，
// 拿它顶替＝甲的偏好被读成乙的（与 js/chat.js 的 _asBhOf 同一条口径，两处各写一份必串味）。
function chatProbOf(cid) {
  const bh = (typeof data !== 'undefined' && data && data.chatSettings) ? data.chatSettings[cid] : null;
  const v = Math.round(Number(bh && bh.asGroupProb));
  if (isFinite(v)) return Math.max(0, Math.min(100, v));
  const d = Math.round(Number(defaults.behavior.asGroupProb));
  return isFinite(d) ? Math.max(0, Math.min(100, d)) : 0;
}
// 唯一写手。只认【在册单聊】：群不写——asGroupProb 住在人身上，群那份档里没有任何钟读它
// （js/chat.js 的 A4/D3 两条门钉的就是「给群摊一格＝留一笔永不掷的死人账」，往群档写这一格同理）。
// 那本档还不存在时以【出厂档】整份播种，两个理由各拦一种静默坏：
// ①只塞这一个键不行——_asBhOf 见对象就整份返回、不并 defaults，缺 asEnabled 会被读成 undefined
//   ＝这位从此不再主动说话（静默关掉一个人，比不改更坏）；
// ②拿 data.behavior 播种也不行——那＝此刻开着的那个档，等于把甲的设置抄给从没设过档的乙（#216 反面）。
function setChatProb(cid, v) {
  if (typeof data === 'undefined' || !data || typeof data !== 'object' || !cid) return false;
  const c = (data.contacts || []).find(x => x && x.id === cid && x.kind !== 'group');
  if (!c) return false;
  const n = Math.round(Number(v));
  if (!isFinite(n) || n < 0 || n > 100) return false;
  if (!data.chatSettings || typeof data.chatSettings !== 'object' || Array.isArray(data.chatSettings)) data.chatSettings = {};
  const cur = data.chatSettings[cid];
  const bh = (cur && typeof cur === 'object' && !Array.isArray(cur)) ? cur : JSON.parse(JSON.stringify(defaults.behavior));
  if (Math.round(Number(bh.asGroupProb)) === n) return false;   // 没真改动＝不 save、不 toast
  bh.asGroupProb = n;
  data.chatSettings[cid] = bh;
  if (cid === data.activeChat) data.behavior = bh;   // data.behavior 恒为活跃那本的同一引用（db.ensureData 立的）
  return true;
}
function silentProbBatch(ids, v) {
  let n = 0;
  (ids || []).forEach(id => { if (setChatProb(id, v)) n++; });
  return n;
}
// 清死格：给了 id 只清那一格（删联系人／删群时由 chats.js 的 _deleteChat 调），不给就把不在册的
// 一次清干净（进这一页时清＝导入档里躺着已删对象的 id 不会变成永远的一行）。返回清掉几条
function silentPrune(id) {
  const s = silentCfg();
  if (!s || !Array.isArray(s.ids) || !s.ids.length) return 0;
  const before = s.ids.length;
  if (id) {
    s.ids = s.ids.filter(x => x !== id);
  } else {
    const live = new Set((data.contacts || []).map(c => c && c.id).filter(Boolean));
    s.ids = s.ids.filter(x => live.has(x));
  }
  return before - s.ids.length;
}
// 名单读数：单聊几位∶群几个（屏上计数与设置页入口行的小字同一份）
function silentCounts() {
  const ids = silentIds();
  let single = 0, group = 0;
  (data.contacts || []).forEach(c => {
    if (!c || !c.id || ids.indexOf(c.id) < 0) return;
    if (c.kind === 'group') group++; else single++;
  });
  return { single: single, group: group, total: single + group };
}
// 屏上那一行读数（设置页入口行那一句小字与这一页页头计数共用，文案只在这里有一份）
function silentStatusText() {
  const n = silentCounts();
  if (!n.total) return '都开着';
  const bits = [];
  if (n.single) bits.push(n.single + ' 位联系人');
  if (n.group) bits.push(n.group + ' 个群');
  return '已关 ' + bits.join(' · ');
}
function renderSilentEntry() {
  const el = $('#silentEntryState');
  if (el) el.textContent = silentStatusText();
}
// 一行＝头像∶名字∶一句现状∶一枚开关。开关不新画控件＝沿用设置页那枚复选框（accent-color 走主题墨）。
// 「TA 的设置 → 回复节奏」里那枚「开启主动发送」整个关着时，本页这一枚说了不算——画成禁用并
// 写明去处，不留「这里开着、那边一个字都不来」的假话（两个开关是同一件事的两层，不是两件事）
function _silentRowHTML(c) {
  const isGrp = c.kind === 'group';
  const muted = chatSilentOn(c.id);
  const bh = (!isGrp && data.chatSettings && data.chatSettings[c.id]) || defaults.behavior;
  const locked = !isGrp && bh.asEnabled === false;
  const av = isGrp
    ? `<span class="avatar silent-row-av">${groupAvatarHTML(c)}</span>`
    : `<span class="avatar silent-row-av">${avatarHTML(chatAvatarOf(c))}</span>`;
  // 落点那一句只给「他确实会主动开口」的行：总闸关着（locked）或被本页关着（muted）时这一格根本不参与
  // 掷点，还给它写「说给群 30%」＝屏上一句正在生效的假话（#095·#161 那条「读数别重复／不冒充」）
  const prob = (!isGrp && !locked && !muted) ? ' · 说给群 ' + chatProbOf(c.id) + '%' : '';
  const sub = (locked ? '主动发送已在 TA 的设置里关掉'
    : muted ? (isGrp ? '群里不会有主动消息' : '不会主动发来新消息')
      : (isGrp ? '群里会有主动消息' : 'TA 会主动发消息')) + prob;
  return `<div class="silent-row${muted ? ' off' : ''}${locked ? ' locked' : ''}" data-cid="${escapeHTML(c.id)}">`
    + av
    + `<div class="silent-row-main"><b>${escapeHTML(fixedNameOf(c))}</b><small>${sub}</small></div>`
    + `<input type="checkbox" class="silent-chk"${muted ? '' : ' checked'}${locked ? ' disabled' : ''} aria-label="${escapeHTML(fixedNameOf(c))} 主动消息">`
    + `</div>`;
}
// 落点那一排 chips（批量设每人自己的 asGroupProb）：只给单聊那一节，群那节一枚都不许多
// ——asGroupProb 住在人身上，群那份档里没有任何钟读它（理由逐条写在 setChatProb 头上）。
// 选中态与 disabled 都按「这一排真会写到的那批人」＝在册全部单聊算（与节头那两枚批量钮同一口径：
// 它们也不看筛选），不是按当前列出的那几行——否则筛「只看已关闭」时会亮出一枚并不代表这次动作结果的假选中态
function _silentProbRowHTML() {
  const ids = (data.contacts || []).filter(c => c && c.id && c.kind !== 'group').map(c => c.id);
  if (!ids.length) return '';
  return '<div class="silent-probs"><span class="silent-prob-ti">说给群</span><div class="fchips">'
    + SILENT_PROBS.map(p => {
        const on = ids.every(id => chatProbOf(id) === p.v);
        return `<button type="button" class="fchip silent-prob${on ? ' on' : ''}" data-v="${p.v}"${on ? ' disabled' : ''} aria-label="把所有单聊联系人的说给群概率设为 ${p.v}%">${p.t}</button>`;
      }).join('')
    + '</div></div>';
}
// 一节＝节头（标题∶计数∶两枚批量钮）＋若干行。整节为空就不画这一节（不给空壳标题）
function _silentSecHTML(title, list, kind) {
  if (!list.length) return '';
  const allOff = list.every(c => chatSilentOn(c.id));
  const allOn = list.every(c => !chatSilentOn(c.id));
  return `<div class="silent-sec"><div class="silent-sec-hd"><span class="silent-sec-ti">${title}<em>${list.length}</em></span>`
    + `<span class="silent-sec-btns"><button type="button" class="silent-batch" data-kind="${kind}" data-on="1"${allOff ? ' disabled' : ''}>全部关闭</button>`
    + `<button type="button" class="silent-batch" data-kind="${kind}" data-on="0"${allOn ? ' disabled' : ''}>全部开启</button></span></div>`
    + (kind === 'single' ? _silentProbRowHTML() : '')
    + `<div class="silent-rows">${list.map(_silentRowHTML).join('')}</div></div>`;
}
function renderSilentPage() {
  const body = $('#silentBody');
  if (!body) return;
  if (silentPrune()) save();   // 先清死格再画（读过脏档的人不该永远看见一行不存在的人）
  const all = (data.contacts || []).filter(c => c && c.id);
  const show = c => (_silentFilter === 'off') ? chatSilentOn(c.id) : true;
  const singles = all.filter(c => c.kind !== 'group' && show(c));
  const groups = all.filter(c => c.kind === 'group' && show(c));
  const stat = $('#silentStat');
  if (stat) stat.textContent = silentStatusText();
  const secs = _silentSecHTML('单聊联系人', singles, 'single') + _silentSecHTML('群聊', groups, 'group');
  // 空态两句话说的是两件事：一个联系人都没有 ∶ 都开着（筛「只看已关闭」时没有任何一行）
  if (secs) body.innerHTML = secs;
  else body.innerHTML = `<div class="silent-empty">${all.length ? '当前没有关掉任何联系人或群的主动消息' : '还没有联系人或群'}</div>`;
}
function _silentToastAfter(c, muted) {
  const isGrp = c.kind === 'group';
  showToast(muted
    ? (isGrp ? '已关闭：群里不会有主动消息' : '已关闭：TA 不会主动发来新消息')
    : (isGrp ? '已开启：群里恢复主动消息' : '已开启：TA 会主动发来新消息'));
}
// 改动落地统一一处：存∶刷本页∶刷设置页入口∶刷首页会话列表（最后一项＝行上那枚「静音」小签跟着翻面）
function _silentCommit(changed) {
  if (!changed) return false;
  save();
  renderSilentPage();
  renderSilentEntry();
  if (typeof renderChatsList === 'function') renderChatsList();
  return true;
}

// 这一页的开关与批量钮：一处委托（行是现画现绑的，逐行绑必漏）
const _silentBody = $('#silentBody');
if (_silentBody) {
  _silentBody.addEventListener('change', e => {
    const chk = e.target.closest('.silent-chk');
    if (!chk) return;
    const row = chk.closest('.silent-row');
    const cid = row && row.dataset.cid;
    const c = (data.contacts || []).find(x => x && x.id === cid);
    if (!c) return;
    // 框勾着＝主动消息开着；本功能记的是「关掉」，所以取反
    if (_silentCommit(setChatSilent(cid, !chk.checked))) _silentToastAfter(c, !chk.checked);
  });
  _silentBody.addEventListener('click', e => {
    // 落点那一排走同一条委托（行与节头都是现画现绑的，再开一个监听器必漏）。作用口径与下面那两枚
    // 批量钮一字不差＝在册全部单聊、不看筛选；筛选态只影响屏上列出哪几行，不影响「这一排改谁」
    const pb = e.target.closest('.silent-prob');
    if (pb) {
      if (pb.disabled) return;   // disabled 的那枚就是「整群已经是这一档」＝它显示的是现状，不是一枚死钮
      const v = Math.round(Number(pb.dataset.v));
      const ids = (data.contacts || []).filter(c => c && c.id && c.kind !== 'group').map(c => c.id);
      const n = silentProbBatch(ids, v);
      if (!n) { showToast('这几位已经都是这一档了'); return; }
      _silentCommit(true);
      showToast('已把 ' + n + ' 位联系人的「说给群」设为 ' + v + '%');
      return;
    }
    const bb = e.target.closest('.silent-batch');
    if (!bb || bb.disabled) return;
    const kind = bb.dataset.kind === 'group' ? 'group' : 'single';
    const muted = bb.dataset.on === '1';
    const ids = (data.contacts || [])
      .filter(c => c && c.id && (kind === 'group' ? c.kind === 'group' : c.kind !== 'group'))
      .map(c => c.id);
    const n = silentBatch(ids, muted);
    _silentCommit(n > 0);
    const label = kind === 'group' ? '个群' : '位联系人';
    if (!n) showToast(muted ? '这些' + label + '都已经关着了' : '这些' + label + '都已经开着了');
    else showToast((muted ? '已关闭 ' : '已开启 ') + n + ' ' + label + '的主动消息');
  });
}
const _silentFilterEl = $('#silentFilter');
if (_silentFilterEl) _silentFilterEl.addEventListener('click', e => {
  const chip = e.target.closest('.silent-fchip');
  if (!chip) return;
  const f = chip.dataset.f === 'off' ? 'off' : 'all';
  if (f === _silentFilter) return;
  _silentFilter = f;
  _silentFilterEl.querySelectorAll('.silent-fchip').forEach(x => x.classList.toggle('active', x === chip));
  renderSilentPage();
});
// 设置页 → 提醒「主动消息管理」那一行的入口（该行随设置页改版可能不在，故做存在性判断）
const _silentEntryBtn = $('#silentEntry');
if (_silentEntryBtn) _silentEntryBtn.addEventListener('click', () => { if (typeof showView === 'function') showView('silent'); });
