// ===== 表情包面板 + 拍一拍面板（移植自家 mochi：三 tab + 分类行 + 分组 chips + 我的工具行/批量管理 + 拍一拍预设/自定义分组/存入发送） =====
// 数据源：字卡库分类（表情包/颜文字/emoji/拍一拍，public 作用域=公用 tab、专属作用域=TA的 tab）+ data.stickerGroups/myText/pokeMine/stickerRecent
// 旧入口兼容：openStickerDrawer/closeStickerDrawer/openPokePanel/closePokePanel/renderStickers/renderPokeList 为全局函数

let _scat = 'sticker';                       // 面板分类：sticker|kaomoji|emoji（三 tab 共用，记住上次）
let _stab = 'partner';                       // 表情包 tab：public|partner|mine（记住上次）
const _sgCur = { public: '', partner: '', mine: '' };   // 各 tab 记住的分组名
let _sBatch = false;                         // 我的表情包批量管理模式
const _sSel = new Set();                     // 批量勾选：'分组名\u0001下标'
let _pokeTab2 = 'partner';                   // 拍一拍 tab：public|partner|mine（记住上次）
let _pokeCurGroup = '__preset';              // 拍一拍当前分组（'__preset'=预设组）
let _pokeWho = '';                           // 群聊里「拍谁」：''＝拍整个群（默认）；否则＝某位成员的名字（BUGS #184）

const STICKER_LAST_KEY = 'ordinal-sticker-last';
const POKE_LAST_KEY = 'ordinal-poke-last';
// 颜文字/emoji 点击行为（移植自家 mochi #691）：'1'=点一下直接发出，其余/缺省=填进输入栏（默认）。
// 模式在点击时**现读**——设置改完立即生效，不用通知任何渲染方。
const STICKER_TEXT_DIRECT_KEY = 'ordinal-sticker-text-direct';
function _stTextDirectMode() { try { return localStorage.getItem(STICKER_TEXT_DIRECT_KEY) === '1'; } catch (e) { return false; } }
function _stTextDirectSet(on) { try { localStorage.setItem(STICKER_TEXT_DIRECT_KEY, on ? '1' : '0'); } catch (e) {} }
function _stickerSaveLast() {
  try { localStorage.setItem(STICKER_LAST_KEY, JSON.stringify({ tab: _stab, cat: _scat, g: _sgCur })); } catch (e) {}
}
function _stickerLoadLast() {
  let stickerMem = false;
  try {
    const p = JSON.parse(localStorage.getItem(STICKER_LAST_KEY) || 'null');
    if (p && typeof p === 'object') {
      stickerMem = !!p.tab;
      if (['public', 'partner', 'mine'].includes(p.tab)) _stab = p.tab;
      if (['sticker', 'kaomoji', 'emoji'].includes(p.cat)) _scat = p.cat;
      if (p.g && typeof p.g === 'object') ['public', 'partner', 'mine'].forEach(k => { if (typeof p.g[k] === 'string') _sgCur[k] = p.g[k]; });
    }
  } catch (e) {}
  try {
    const p = JSON.parse(localStorage.getItem(POKE_LAST_KEY) || 'null');
    if (p && typeof p === 'object') {
      if (['public', 'partner', 'mine'].includes(p.tab)) _pokeTab2 = p.tab;
      if (typeof p.group === 'string' && p.group) _pokeCurGroup = p.group;
    }
  } catch (e) {}
  return stickerMem;
}
function _pokeSaveLast() {
  try { localStorage.setItem(POKE_LAST_KEY, JSON.stringify({ tab: _pokeTab2, group: _pokeCurGroup })); } catch (e) {}
}

function _stCatName() { return _scat === 'sticker' ? '表情包' : (_scat === 'kaomoji' ? '颜文字' : 'emoji'); }
// 表情包那一格读**两个分类**：「图片」与「表情包」都是图，TA 发图那条线（utils.partnerImages）早就把两类
// 当一个池子读，抽屉此前只认「表情包」＝传成「图片」的图在聊天里发不出去（BUGS #078）
function _stCatNames() { return _scat === 'sticker' ? ['表情包', '图片'] : [_stCatName()]; }
// 某分类下的字卡分组：scope='public' 只取公用；scope='own' 取专属且已绑到当前会话（硬隔离，BUGS #051）
// 表情包分类的卡片是图（{img}），颜文字/emoji/拍一拍分类是文字（{text}）
function _stScopeGroups(catNames, scope) {
  return data.groups
    .filter(g => catNames.includes(g.category || '主字卡') && Array.isArray(g.cards) && g.cards.length)
    .filter(g => scope === 'public' ? cardScope(g) === 'public' : (cardScope(g) !== 'public' && groupUsableFor(g)))
    .map(g => ({ key: g.name, label: g.name, cards: _scat === 'sticker' ? (g.cards || []).map(cardImage).filter(Boolean) : g.cards.map(cardText).filter(Boolean), mineImg: _scat === 'sticker' }));
}
// 专属但**没绑联系人**的那些组：硬隔离下它们在三格里一律不出现，抽屉这边一句没说＝库里存在、屏上看不见，
// 看着像没上传。把数量与去处一并写明（BUGS #078 第②条）
function _stUnboundGroups(catNames) {
  return data.groups.filter(g => catNames.includes(g.category || '主字卡') && cardScope(g) !== 'public' && !g.contactId
    && Array.isArray(g.cards) && (_scat === 'sticker' ? g.cards.some(c => cardImage(c)) : g.cards.some(c => cardText(c))));
}
// 首开默认落哪一格：按「TA的 → 公用 → 我的」取第一格**有内容**的，全空仍回 TA 那格
function _stFirstTab() {
  const pick = (tab) => tab === 'public' ? _stScopeGroups(_stCatNames(), 'public')
    : tab === 'mine' ? _stMyGroups() : _stScopeGroups(_stCatNames(), 'own');
  const order = ['partner', 'public', 'mine'];
  return order.find(t => pick(t).some(g => g.cards.length)) || 'partner';
}
function _stMyGroups() {
  if (_scat === 'sticker') return (data.stickerGroups || []).filter(g => g && Array.isArray(g.imgs)).map(g => ({ key: g.name, label: g.name, cards: g.imgs.slice(), mineImg: true }));
  const arr = data.myText[_scat] || [];
  return arr.filter(g => g && Array.isArray(g.items)).map(g => ({ key: g.name, label: g.name, cards: g.items.slice(), mineImg: false }));
}
function _stRecentGroup() {
  if (_scat !== 'sticker' || !(data.stickerRecent || []).length) return null;
  return { key: '__recent__', label: '最近', cards: data.stickerRecent.slice(0, 12), mineImg: true, recent: true };
}

// ===== 表情包面板 =====
function renderStickers() {
  const root = $('#stickerBody');
  const tabs = document.querySelectorAll('#stickerTabs .sticker-tab');
  if (!root || !tabs.length) return;
  tabs.forEach(b => b.classList.toggle('active', b.dataset.stickerTab === _stab));
  const tabPublic = $('#stickerTabs [data-sticker-tab="public"]');
  const tabPartner = $('#stickerTabs [data-sticker-tab="partner"]');
  const tabMine = $('#stickerTabs [data-sticker-tab="mine"]');
  if (tabPublic) tabPublic.textContent = '公用表情包';
  if (tabPartner) tabPartner.textContent = `${chatPartnerName()}的表情包`;
  if (tabMine) tabMine.textContent = '我的表情包';
  $$('#stickerCats .sticker-cat-chip').forEach(b => b.classList.toggle('on', b.dataset.scat === _scat));
  const tools = $('#stickerTools');
  if (tools) tools.hidden = !(_stab === 'mine' && _scat === 'sticker');

  let groups;
  if (_stab === 'public') groups = _stScopeGroups(_stCatNames(), 'public');
  else if (_stab === 'partner') groups = _stScopeGroups(_stCatNames(), 'own');
  else groups = _stMyGroups();
  if (_scat === 'sticker') { const rc = _stRecentGroup(); if (rc) groups = [rc].concat(groups); }
  // 默认不落在「最近」上：那一组只存你发出去过的表情（上限 12 条），库里几百张的组被它挡住＝看着像没传。
  // 「最近」仍排在第一位，只是不再抢默认选中；没有别的组有内容时才回落到它。
  if (!groups.some(g => g.key === _sgCur[_stab])) {
    const first = groups.find(g => !g.recent && g.cards.length) || groups.find(g => g.cards.length) || groups[0];
    _sgCur[_stab] = first ? first.key : '';
  }
  // 那些「专属但没绑联系人」的组只在它们本该出现的那一格说明，别处不吵；
  // 按分类各出一行＝点进去看到的组数与这一行写的数一致（合并池里 表情包 与 图片 是两个分类档）
  const unbound = _stab === 'partner' ? _stUnboundGroups(_stCatNames()) : [];
  const _uc = {};
  unbound.forEach(g => { const c = g.category || '表情包'; _uc[c] = (_uc[c] || 0) + 1; });
  const unboundHtml = Object.keys(_uc).map(c =>
    `<button type="button" class="sticker-unbound" data-cards-jump="${escapeHTML(c)}">另有 ${_uc[c]} 组专属${escapeHTML(c)}没绑联系人 · ${escapeHTML(chatPartnerName())}用不到<span class="sticker-unbound-go">去字卡库绑定</span></button>`).join('');

  const bar = $('#stickerGroups');
  if (bar) {
    bar.innerHTML = groups.map(g => `<button type="button" class="sticker-g-chip${g.key === _sgCur[_stab] ? ' sel' : ''}" data-sgroup="${escapeHTML(g.key)}">${escapeHTML(g.label)}<i>${g.cards.length}</i></button>`).join('')
      + (_stab === 'mine' && _scat === 'sticker' ? '<button type="button" class="sticker-g-chip sticker-g-add" id="stickerGroupAdd">＋ 分组</button>' : '');
    bar.hidden = !groups.length && !(_stab === 'mine' && _scat === 'sticker');
  }
  const batchBar = $('#stickerBatch');
  if (batchBar) batchBar.hidden = !_sBatch;

  const cur = groups.find(g => g.key === _sgCur[_stab]);
  if (!groups.length) {
    const emptyHtml = _stab === 'public'
      ? `<div class="empty">暂无公用${_stCatName()}<br>请到 字卡库 → 公用字卡 → ${_stCatName()} 上传</div>`
      : _stab === 'partner'
        ? (unbound.length
          ? `<div class="empty">这一格只放<b>绑给${escapeHTML(chatPartnerName())}</b>的专属${_stCatName()}<br>下面那几组还没绑，绑完才用得到</div>`
          : `<div class="empty">暂无${_stCatName()}字卡<br>请到 字卡库 → 专属字卡 → ${_stCatName()} 添加</div>`)
        : (_scat === 'sticker'
          ? '<div class="empty">还没有我的表情<br>点上方「添加」从相册上传</div>'
          : `<div class="empty">暂无我的${_stCatName()}<br>去 字卡库 添加，或点下方「＋ 分组」自建分组</div>`);
    root.innerHTML = emptyHtml + unboundHtml;
    return;
  }
  if (!cur || !cur.cards.length) {
    root.innerHTML = `<div class="empty">该分组暂无内容</div>` + unboundHtml;
    return;
  }
  if (cur.mineImg) {
    root.innerHTML = unboundHtml
      + `<div class="st-sec">${escapeHTML(cur.label)} · ${cur.cards.length} 张${cur.recent ? ' · 最多留 12 张' : ''}</div>`
      + `<div class="sticker-grid${_sBatch ? ' batch' : ''}">${cur.cards.map((s, i) => `<img src="${escapeHTML(s)}" data-simg="${escapeHTML(s)}" data-skey="${escapeHTML(cur.key + '\u0001' + i)}" class="${_sBatch && _sSel.has(cur.key + '\u0001' + i) ? 'sel' : ''}" alt="表情">`).join('')}</div>`
      + (_stab === 'mine' && !_sBatch ? '<p class="sticker-tip">点表情直接发出；先在输入栏打字再点 = 表情随文字一起发</p>' : '')
      + (_stab === 'partner' && !cur.recent ? '<p class="sticker-tip">来自字卡库「' + escapeHTML(cur.label) + '」分组</p>' : '');
  } else {
    root.innerHTML = unboundHtml
      + `<div class="st-sec">${escapeHTML(cur.label)} · ${cur.cards.length} 条${_scat === 'sticker' ? '' : (_stTextDirectMode() ? ' · 点击直接发送' : ' · 点击填进输入栏')}</div>`
      + (_scat === 'sticker' ? '' : (() => { const on = _stTextDirectMode(); return `<button type="button" class="sticker-text-mode" id="stickerTextMode"><span class="etm-main">${on ? '当前：点一下直接发送' : '当前：点一下填进输入栏'}</span><span class="etm-sub">${on ? '点这里切换为「先填进输入栏」，发不发由你点「发送」定' : '可连点多条，点「发送」才发出；点这里切换为「直接发送」'}</span></button>`; })())
      + `<div class="sticker-txt-grid">${cur.cards.map(t => `<button type="button" class="sticker-txt" data-stxt="${escapeHTML(t)}">${escapeHTML(t)}</button>`).join('')}</div>`;
  }
}
function openStickerDrawer() {
  if (!_stickerLoadLast()) _stab = _stFirstTab();   // 本机没存过选择才现挑一格；存过仍回上次那一格
  _sBatch = false; _sSel.clear();
  if (typeof closePokePanel === 'function') closePokePanel();
  renderStickers();
  $('#stickerDrawer').classList.add('open');
  _panelSyncChrome('sticker');
}
function closeStickerDrawer() { $('#stickerDrawer').classList.remove('open'); _panelSyncChrome(''); window.__batchPickSticker = null; }   // 抽屉一收就清「为批量挑一张」的钩子＝挑一半不挑了不会串进下一次普通发送
// 面板浮层化后要贴着输入栏上沿（css .sticker-drawer{bottom:var(--composer-h)}）：输入栏高度不是常数——
// 引用条、待发图片预览都会让它长高，写死一个 70px 就会出现「面板压住输入栏」或「面板离输入栏老远」。
// 故每次开关都现量一次写进 --composer-h（连 #chatView[data-panel] 一起切，供 .scroll-bottom-btn 让位）。
function _panelSyncChrome(which) {
  const view = $('#chatView'); if (!view) return;
  if (which) view.setAttribute('data-panel', which); else view.removeAttribute('data-panel');
  const c = $('#composer');
  view.style.setProperty('--composer-h', (c ? Math.round(c.getBoundingClientRect().height) : 70) + 'px');
}
// 「去字卡库绑定」：把抽屉里那一格的语境搬到字卡库（专属 × 那个分类），并当场停在有内容的分组上；
// 「全部」那一枚保持选中（不选任何单组＝那分类的所有组都在屏上），返回键沿用现状回首页
function _stGoBindCards(catName) {
  closeStickerDrawer();
  currentCardsScope = 'own';
  if (CARD_CATEGORIES.includes(catName)) currentCardsTab = catName;
  selectedGroupName = '';
  groupSearch = '';
  cardsBatchSel.clear();
  saveCardsWho('all');   // 带着「只看某人」的筛选跳过去＝那一格可能根本不在这一位名下＝屏上空白，按约定的一次性导航不带走阅读位置
  showView('cards');
}

// 发送表情包：输入栏有字 → 插入附件随文字一起发；空 → 直接发出纯表情包（移植自家 mochi sendSticker 双路径）
// big＝这一张来自字卡库「图片」分类（大档），身份随消息落库（BUGS #157）
async function sendStickerSrc(src, big) {
  if (!src) return;
  data.stickerRecent = [src].concat((data.stickerRecent || []).filter(x => x !== src)).slice(0, 12);
  const input = $('#messageInput');
  const text = (input && input.value || '').trim();
  if (text) { closeStickerDrawer(); _setAttach(src, big); return; }
  const msg = { id: nextId(), from: 'me', text: '', sticker: src, time: time(), date: new Date().toLocaleDateString('zh-CN') };
  if (big) msg.imgKind = 'image';
  if (replyTo) {
    msg.quote = replyTo.sticker ? '[表情包]' : replyTo.text;
    if (replyTo.sticker) msg.quoteImgId = replyTo.id;
  }
  const sentFromChat = data.activeChat;
  data.messages.push(msg);
  if (typeof maybeCollectByTa === 'function') { const _cs = data.collectSettings || {}; try { maybeCollectByTa({ kind: 'msg', side: 'out', text: '', imgs: [src], mid: msg.id }, _cs.taMsgProb, sentFromChat); } catch (e) {} }
  if (typeof notifyMyMessage === 'function') notifyMyMessage();
  replyTo = null;
  const rt = $('#replyTarget'); if (rt) rt.hidden = true;
  closeStickerDrawer();
  await save();
  _animateNextRender = true;
  if (typeof inLocateMode === 'function' && inLocateMode()) jumpToLatest(); else renderMessages();
  if (typeof partnerReply === 'function') partnerReply(sentFromChat, msg.text || '');
}
// 颜文字/emoji 直发（mochi sendTextCard 同款口径）：镜像 composer submit 的引用/落库/回复链路，载荷是纯文字。
// 输入栏里已打的字**不动也不合并**——直发的是这张卡自己，草稿留给用户（与 mochi 一致）。
async function _stickerSendText(t) {
  if (!t) return;
  const msg = { id: nextId(), from: 'me', text: t, time: time(), date: new Date().toLocaleDateString('zh-CN') };
  if (replyTo) {
    msg.quote = replyTo.sticker ? '[表情包]' : replyTo.text;
    if (replyTo.sticker) msg.quoteImgId = replyTo.id;
  }
  const sentFromChat = data.activeChat;
  data.messages.push(msg);
  if (typeof maybeCollectByTa === 'function') { const _cs = data.collectSettings || {}; try { maybeCollectByTa({ kind: 'msg', side: 'out', text: t, imgs: [], mid: msg.id }, _cs.taMsgProb, sentFromChat); } catch (e) {} }
  if (typeof notifyMyMessage === 'function') notifyMyMessage();
  replyTo = null;
  const rt = $('#replyTarget'); if (rt) rt.hidden = true;
  closeStickerDrawer();
  await save();
  _animateNextRender = true;
  if (typeof scrollChatToBottom === 'function') scrollChatToBottom();
  if (typeof inLocateMode === 'function' && inLocateMode()) jumpToLatest(); else renderMessages();
  if (typeof partnerReply === 'function') partnerReply(sentFromChat, t);
}
function _stickerFillText(t) {
  const input = $('#messageInput');
  if (!input || !t) return;
  input.value = (input.value || '') + t;
  input.focus();
}
function _stMyStickerGroup(name) {
  let g = (data.stickerGroups || []).find(x => x.name === name);
  if (!g) { g = { name, imgs: [] }; data.stickerGroups.push(g); }
  return g;
}
function _stickerPickFiles() {
  const done = async files => {
    const target = _stMyStickerGroup(_sgCur.mine || '我的表情');
    let added = 0;
    for (const f of files) {
      const src = await fileData(f, 512);
      if (src && !target.imgs.includes(src)) { target.imgs.push(src); added++; }
    }
    if (added) { _sgCur.mine = target.name; _stickerSaveLast(); save(); renderStickers(); }
    showToast(added ? `已添加 ${added} 张到「${target.name}」` : '没有新增（重复或读取失败）');
  };
  if (typeof window.mochiFilePick === 'function') { window.mochiFilePick({ id: 'mye', accept: 'image/*', multiple: true, onFiles: done }); return; }
  let input = document.getElementById('myePickInput');
  if (!input) { input = document.createElement('input'); input.type = 'file'; input.id = 'myePickInput'; input.accept = 'image/*'; input.multiple = true; input.style.display = 'none'; document.body.appendChild(input); }
  input.onchange = () => { const fs = Array.from(input.files || []); input.value = ''; done(fs); };
  input.click();
}
function _stickerAddLink() {
  if (typeof window.openModal !== 'function') { showToast('弹窗组件未就绪'); return; }
  window.openModal('链接导入表情包', '', v => {
    const urls = String(v || '').split(/[\s,，]+/).map(s => s.trim()).filter(s => /^(https?:\/\/|data:image\/)/i.test(s));
    if (!urls.length) { showToast('没有可导入的链接（http(s):// 或 data:image 开头）'); return; }
    const target = _stMyStickerGroup(_sgCur.mine || '我的表情');
    let added = 0;
    urls.forEach(u => { if (!target.imgs.includes(u)) { target.imgs.push(u); added++; } });
    if (added) { _sgCur.mine = target.name; _stickerSaveLast(); save(); renderStickers(); }
    showToast(added ? `已导入 ${added} 张到「${target.name}」` : '没有新增（全部重复）');
  });
}
function _stickerNewGroup() {
  if (typeof window.openModal !== 'function') return;
  window.openModal('新建表情包分组', '', v => {
    const name = String(v || '').trim();
    if (!name) { showToast('请输入分组名'); return; }
    if ((data.stickerGroups || []).some(g => g.name === name)) { showToast(`分组「${name}」已存在`); return; }
    data.stickerGroups.push({ name, imgs: [] });
    _sgCur.mine = name; _stickerSaveLast(); save(); renderStickers();
    showToast(`已新建分组「${name}」`);
  });
}

// ===== 拍一拍面板（移植自家 mochi：公用/TA的/我的 三 tab + 预设组 + 自定义分组增改删 + 底部存入/发送） =====
// ===== 拍一拍防误触（用户「会卡顿容易误触发送出拍一拍」）=====
// 拍一拍发出去是**不可撤回**的系统提示（chat.js 的 _pokeSys 不进可撤回名单），
// 点错只能靠系统提示沉底去掩盖，代价远高于点错表情包。三道闸：
//   ① 位移闸：按下到抬起位移超阈值＝用户在滑列表而不是在选。浏览器有时会吞掉这种 click、
//      有时不吞（「滚动刚停、手指还在同一片区域又点一下」最常见），不能只靠浏览器兜。
//   ② 冷却闸：发过一次后短时间内的重复 click 直接吞掉，避免狂点刷屏。
// 两道闸只挡「不该发的」：正常轻点、以及底部「存入/发送」输入行一律照旧（量具 T1/T6 钉住）。
// ⚠ 这三个常量与 _poke* 状态必须在**模块级**（不能塞进底下的 IIFE）：openPokePanel 在 IIFE 外设动画闸。
const POKE_MOVE_TOL = 12;     // 位移容差(px)：小于它算轻点，超过算滑动
// 入场动画闸：**由 animationend 开闸，不用时间窗**。
//   踩过的坑：先按 CSS 的 .22s 设 260ms，量具立刻打出真回归 —— 常驻 _smoke_sticker_poke 的
//   D1→D4 两条断言 + 面板互斥切换只花 41ms 就点了卡，闸门还剩 219ms 当场 added=0；
//   缩到 120ms 仍差 26ms 拦着。**时间窗与真实动画时长只是碰巧相近，不是同一件事**——
//   机器慢时动画会更长，快时更短，拿 ms 猜就是拿正常用法开刀。
//   正解：面板入场动画（CSS 的 pokeUp）真的结束那一刻才开闸，慢机自动多等、快机自动早放。
//   兜底超时只防「动画被 prefers-reduced-motion 或 display:none 跳过 → 永不开闸」。
let _pokeCooldownUntil = 0;   // 此刻之前吞掉重复 click（发出后冷却）
let _pokeCooldownCard = '';   // 冷却**只针对这一张卡**：连点两张不同的卡是合法操作（想连拍两个），
                               // 全局冷却会把第二次也吞掉——第一版就这么写，被常驻 _smoke_sticker_poke 的
                               // D5d/D5f（三连点不同 tab 的卡）当场打红。
const POKE_COOLDOWN = 700;    // **同一张卡**发出后的重复 click 冷却
const POKE_SCROLL_GUARD = 420; // 滚动刚停后的静默期：手指还停在刚划过的位置，那一下多半不是选它
let _pokeDown = null;         // {x,y,t} 最近一次按下（有值＝这一下还没被判为滑动）
let _pokeSlid = false;        // 本次手势是否已判为「在滑列表」：pointerdown 置 false，pointermove 超阈值置 true
let _pokeSlidAt = 0;          // 判为滑动的时刻：只对 SLID_WINDOW 内到达的 click 有效（别让它跨手势永不复位）
let _pokeScrollUntil = 0;     // 列表滚动结束后的一小段时间内不接受点击
// 第四道闸＝**吞掉「开面板那一手」自己的那发 click**（ghost click，用户「打开拍一拍的页面容易误触直接发送」的真因）。
//   触屏点对方头像开面板＝在 pointerup 里当场把面板浮起来，而那个浮层正好盖住手指那一点；
//   浏览器随后按**新布局**重 hit-test 派发兼容的 mousedown/mouseup/click，落点就变成了面板里的卡片
//   → 用户只是开了个面板，一条不可撤回的拍一拍已经发出去了。量具 tools/_probe_poke_ghost.js 把这条链
//   逐发记下来了：pointerdown/touchstart/pointerup/touchend 都在 .mini-avatar 上，随后的 click 在 BUTTON:POKECARD 上。
//   收法只认「这一手势」：开面板那一手把标记挂上，**任何新的 pointerdown 都解除它**，
//   所以「开完面板手快立刻点一张卡」照常生效——不用时间窗（#126 那批已证：时间窗拦的就是正常用法）。
let _pokeSwallowClick = false;
function pokeSwallowGhostClick() { _pokeSwallowClick = true; }
function _pkScopeGroups(scope) {
  return data.groups
    .filter(g => (g.category || '主字卡') === '拍一拍' && Array.isArray(g.cards) && g.cards.length)
    .filter(g => scope === 'public' ? cardScope(g) === 'public' : (cardScope(g) !== 'public' && groupUsableFor(g)))
    .map(g => ({ key: g.name, label: g.name, cards: g.cards.map(cardText).filter(Boolean) }));
}
function _pkTabGroups() {
  if (_pokeTab2 === 'mine') {
    const out = [{ key: '__preset', label: '预设', cards: (typeof POKE_PRESETS !== 'undefined' ? POKE_PRESETS : []).slice() }];
    (data.pokeMine || []).forEach(g => out.push({ key: g.name, label: g.name, cards: g.cards.slice(), user: true }));
    return out;
  }
  return _pkScopeGroups(_pokeTab2 === 'public' ? 'public' : 'own');
}
// 拍一拍文案代词变换（移植自家 mochi sendPoke）：一律「我拍 TA」视角——「你」换成对方名，开头自动补主语「我」
// 「对方」是谁由 _pokeTargetName() 给，**不再直接读 chatPartnerName()**（BUGS #184）：
// 群聊里 chatPartnerName() 返回的是**群名**，拍谁都一样＝用户报「群聊只能拍群、不能拍某个人」。
function _pokeTargetName() { return _pokeWho || chatPartnerName(); }
// 库里那张拍一拍卡是**「我拍她」**视角（「拍了拍你的头」）。TA 主动拍我时得反过来念成
// 「拍了拍我的头」——只换代词，**不补名字**（BUGS #185）。
// 名字由渲染层那一枚署名（.sys-msg-who，走 m.sender）印在这行前面；两处都放名字会念成
// 「阿澄 拍了拍阿澄的头」。⚠ 与 _replyPlan 的署名分配必须成对改：只改这里 → 群聊里还是无名系统小字。
function _pokeTransformTa(action) {
  let s = String(action || '').trim();
  // 库里那张卡里「我」＝被拍的人（＝我，读者自己），照抄会变成 TA 在叫自己
  s = s.replace(/我/g, '你');
  // 库里那张卡里「你」＝被拍的对象＝我，还原成「我」
  s = s.replace(/你(?!们)/g, '我');
  return s;
}
function _pokeTransform(action) {
  const meName = chatMyName();   // 这一本会话里我叫什么（按会话分开；落库文本就此定死，日后改名不回改）
  const taName = _pokeTargetName();
  let s = String(action || '').trim();
  if (s.indexOf('你') >= 0) {
    if (s.charAt(0) === '你') s = meName + s.slice(1);
    else if (s.charAt(0) !== '我') s = meName + s;
  } else if (s.indexOf('我') < 0) {
    s = meName + s;
  } else if (s.charAt(0) !== '我') {
    s = meName + s;
  }
  return s.replace(/你(?![们])/g, taName);
}
function _pokeTargetGroup() {
  let g = (data.pokeMine || []).find(x => x.name === _pokeCurGroup);
  if (!g) {
    g = (data.pokeMine || [])[0];
    if (!g) { g = { name: '我的新增', cards: [] }; data.pokeMine.push(g); }
    _pokeCurGroup = g.name;
  }
  return g;
}
function renderPokeList() {
  const list = $('#pokeList');
  if (!list) return;
  const tabPublic = $('#pokeTabs [data-poke-tab="public"]');
  const tabPartner = $('#pokeTabs [data-poke-tab="partner"]');
  const tabMine = $('#pokeTabs [data-poke-tab="mine"]');
  // 群聊里这一格不能叫「XX群的拍一拍」——「群」不是能被拍的对象（BUGS #184），说人话改叫「大家的」
  if (tabPartner) tabPartner.textContent = _pokeMembers().length ? '大家的拍一拍' : `${chatPartnerName()}的拍一拍`;
  $$('#pokeTabs .poke-tab').forEach(b => b.classList.toggle('on', b.dataset.pokeTab === _pokeTab2));
  const groups = _pkTabGroups();
  if (!groups.some(g => g.key === _pokeCurGroup)) _pokeCurGroup = groups.length ? groups[0].key : '__preset';
  const bar = $('#pokeGroups');
  if (bar) {
    bar.innerHTML = groups.map(g => `<button type="button" class="poke-g-chip${g.key === _pokeCurGroup ? ' sel' : ''}" data-pgroup="${escapeHTML(g.key)}">${escapeHTML(g.label)}<i>${g.cards.length}</i></button>`).join('')
      + (_pokeTab2 === 'mine' ? '<button type="button" class="poke-g-chip poke-g-add" id="pokeGroupAdd">＋ 分组</button>' : '');
    bar.hidden = !groups.length && _pokeTab2 !== 'mine';
  }
  const inputRow = $('#pokeInputRow');
  if (inputRow) inputRow.hidden = _pokeTab2 !== 'mine';
  if (!groups.length) {
    list.innerHTML = _pokeTab2 === 'public'
      ? '<div class="poke-empty">暂无公用拍一拍<br>请到 字卡库 → 公用字卡 → 拍一拍 添加</div>'
      : '<div class="poke-empty">暂无拍一拍字卡<br>请到 字卡库 → 专属字卡 → 拍一拍 添加</div>';
    return;
  }
  const cur = groups.find(g => g.key === _pokeCurGroup) || groups[0];
  if (!cur.cards.length) {
    list.innerHTML = _pokeTab2 === 'mine' && cur.key !== '__preset'
      ? '<div class="poke-empty">该分组还没有拍一拍<br>在下方输入文字，点「存入」添加</div>'
      : '<div class="poke-empty">该分组暂无拍一拍</div>';
    return;
  }
  list.innerHTML = cur.cards.map((c, i) => {
    const editable = _pokeTab2 === 'mine' && cur.user;
    return `<button type="button" class="poke-card" data-poke-card="${escapeHTML(c)}">${escapeHTML(c)}${editable ? `<span class="poke-card-ops"><i class="poke-op-edit" data-pedit="${i}" title="修改">✎</i><i class="poke-op-del" data-pdel="${i}" title="删除">×</i></span>` : ''}</button>`;
  }).join('');
}
function openPokePanel(who) {
  _stickerLoadLast();
  // 拍谁：群聊里默认可点「整个群」，也可点某位成员；单聊只有 TA 一枚、这行整个不显示（BUGS #184）。
  // 形参 who 供「点某位成员的头像直接开面板且已锁定她」用（js/chat.js 那条路径会传名字进来）。
  const members = _pokeMembers();
  _pokeWho = (who && members.indexOf(who) >= 0) ? who : '';
  _renderPokeWhos(members);
  _renderPokeWho();
  closeStickerDrawer();   // 两个面板互斥，同层内联不叠加
  renderPokeList();
  $('#pokeMask').hidden = false;
  _panelSyncChrome('poke');
  // 这里**不做入场动画闸**（曾有，已删）。按 CSS 的 .22s 设时间窗（260ms→120ms 两次）都被量具打回：
  // 常驻 _smoke_sticker_poke 的 D1→D4 只隔 41ms 就点卡，闸门还剩 94ms 当场 added=0 ——
  // 「开面板后手快立刻点」是正常用法，时间窗拦它就是拿正常开刀。改用 animationend 开闸也一样：
  // 面板被反复开关时动画一直在重跑，闸门等于常闭。真误触由滚动闸与冷却闸治（两者都有反向对照证明）。
}
// 当前会话的群成员名单（单聊返回空数组＝「拍谁」那一行不必出现）
function _pokeMembers() {
  const c = (typeof currentContact === 'function' && currentContact()) || null;
  if (!c || c.kind !== 'group') return [];
  return (c.members || []).filter(Boolean);
}
// 「拍谁」那一行：一枚「整个群」＋每位成员。单聊 members 为空 → 整行 hidden（不占面板高度）。
// 头像走 _memberAvatarHTML(name, cls, true)（js/chats.js 现成的那枚：按名字回查同名单聊联系人的头像），
// 与 @ 点名名单、群成员格用的是同一族，不新造第三种头像取法。
function _renderPokeWhos(members) {
  const bar = $('#pokeWhos');
  if (!bar) return;
  if (!members.length) { bar.innerHTML = ''; bar.hidden = true; return; }
  const groupName = chatPartnerName();
  bar.innerHTML = `<button type="button" class="poke-who${_pokeWho ? '' : ' sel'}" data-poke-who=""${_pokeWho ? '' : ' aria-current="true"'}>`
      + _memberAvatarHTML('', 'poke-who-avatar', true)
      + `<span class="poke-who-name">${escapeHTML(groupName)}</span><span class="poke-who-tag">群</span></button>`
    + members.map(n => `<button type="button" class="poke-who${_pokeWho === n ? ' sel' : ''}" data-poke-who="${escapeHTML(n)}"${_pokeWho === n ? ' aria-current="true"' : ''}>`
      + _memberAvatarHTML(n, 'poke-who-avatar', true)
      + `<span class="poke-who-name">${escapeHTML(n)}</span></button>`).join('');
  bar.hidden = false;
}
// 头部那枚头像/名字跟着当前选中的对象走：选中成员就显示她，而不是群名（否则面板顶上一边说群名、
// 点下去发出的却是「我拍了拍她」，屏上自相矛盾）
function _renderPokeWho() {
  const who = _pokeWho;
  const c = (typeof currentContact === 'function' && currentContact()) || null;
  const isGroup = !!(c && c.kind === 'group');
  if (isGroup && who) {
    const one = (data.contacts || []).find(x => x.kind !== 'group' && x.name === who);
    $('#pokeAvatar').innerHTML = avatarHTML((one && (one.chatAvatar || one.avatar)) || '', firstChar(who));
    $('#pokeName').textContent = '拍 ' + who;
  } else {
    const name = chatPartnerName();
    $('#pokeAvatar').innerHTML = avatarHTML(chatPartnerAvatar(), firstChar(name));
    $('#pokeName').textContent = isGroup ? ('拍 ' + name) : name;
  }
}
function closePokePanel() { $('#pokeMask').hidden = true; _panelSyncChrome(''); }
function _sendPoke(action) {
  closePokePanel();
  _pokeSys(_pokeTransform(action));
  // 群聊里拍的是**某一位成员** → 由她回（跳过「已读不回」概率，与 @ 点名那位必开口同一口径）；
  // 拍整个群 / 单聊照旧走 partnerReply（群聊那条按各人自己的档掷骰子，本来就可能一人都不回）。
  // 走之前把 _pokeWho 摘掉：它只在面板在位期间有意义，留在模块级会让下一次单聊开面板串味。
  const who = _pokeWho;
  _pokeWho = '';
  if (who && _pokeMembers().indexOf(who) >= 0 && typeof _memberReply === 'function') {
    const cid = (typeof currentContact === 'function' && currentContact() || {}).id || data.activeChat;
    _pokeMemberReply(cid, who);
    return;
  }
  setTimeout(partnerReply, 1200 + Math.random() * 2400);
}

// ===== 事件绑定（面板 DOM 常驻，委托一次） =====
(function _stickersBind() {
  const drawer = $('#stickerDrawer');
  if (!drawer) return;
  $('#openStickers').onclick = () => openStickerDrawer();
  $('#closeStickers').onclick = closeStickerDrawer;
  $('#stickerTabs').addEventListener('click', e => {
    const b = e.target.closest('.sticker-tab');
    if (!b || b.dataset.stickerTab === _stab) return;
    _stab = b.dataset.stickerTab;
    _sBatch = false; _sSel.clear();
    _stickerSaveLast();
    renderStickers();
  });
  $('#stickerCats').addEventListener('click', e => {
    const b = e.target.closest('.sticker-cat-chip');
    if (!b || b.dataset.scat === _scat) return;
    _scat = b.dataset.scat;
    _sBatch = false; _sSel.clear();
    _stickerSaveLast();
    renderStickers();
  });
  $('#stickerGroups').addEventListener('click', e => {
    if (e.target.closest('#stickerGroupAdd')) { _stickerNewGroup(); return; }
    const b = e.target.closest('.sticker-g-chip[data-sgroup]');
    if (!b) return;
    _sgCur[_stab] = b.dataset.sgroup;
    _sBatch = false; _sSel.clear();
    _stickerSaveLast();
    renderStickers();
  });
  const root = $('#stickerBody');
  root.addEventListener('click', e => {
    const jump = e.target.closest('[data-cards-jump]');
    if (jump) { _stGoBindCards(jump.dataset.cardsJump); return; }
    const img = e.target.closest('img[data-simg]');
    if (img) {
      if (_sBatch && _stab === 'mine') {
        const k = img.dataset.skey;
        if (_sSel.has(k)) { _sSel.delete(k); img.classList.remove('sel'); }
        else { _sSel.add(k); img.classList.add('sel'); }
        const cnt = $('#stickerBatchCount'); if (cnt) cnt.textContent = `已选 ${_sSel.size} 张`;
        return;
      }
      // 批量发送面板的「为批量挑一张」模式（__batchPickSticker 由 js/chat.js 挂）：点了不算发送，
      // 交给回调进批量清单并重开批量面板（mochi openEmojiPanelForInsert 同款往返）
      if (window.__batchPickSticker) { const cb = window.__batchPickSticker; cb(img.dataset.simg, typeof stickerKindOfSrc === 'function' && stickerKindOfSrc(img.dataset.simg) === 'image'); return; }
      // 身份按这张卡在字卡库里的分类现算（「图片」分类＝大档）；「最近」那一组存的只是 dataURL，
      // 拿它回查一次分类才不会同一张卡从两格点出去长出两种尺寸
      sendStickerSrc(img.dataset.simg, typeof stickerKindOfSrc === 'function' && stickerKindOfSrc(img.dataset.simg) === 'image');
      return;
    }
    // 文字卡点击行为切换（mochi #691i 同款）：就地写键＋重渲按钮文案；toast 说清切成了哪种
    if (e.target.closest('#stickerTextMode')) {
      const next = !_stTextDirectMode();
      _stTextDirectSet(next);
      renderStickers();
      showToast(next ? '已切换：点颜文字/emoji 直接发出' : '已切换：点颜文字/emoji 先填进输入栏，发不发由你定');
      return;
    }
    const txt = e.target.closest('.sticker-txt');
    if (txt) {
      if (_stTextDirectMode()) { _stickerSendText(txt.dataset.stxt); return; }   // 直发模式：点一下就发出（面板随之关）
      _stickerFillText(txt.dataset.stxt); showToast('已填进输入栏，点「发送」发出');   // 默认：填入不关面板，可连点
    }
  });
  const myeAdd = $('#myeAdd');
  if (myeAdd) myeAdd.onclick = _stickerPickFiles;
  const myeAddLink = $('#myeAddLink');
  if (myeAddLink) myeAddLink.onclick = _stickerAddLink;
  const myeBatch = $('#myeBatch');
  if (myeBatch) myeBatch.onclick = () => {
    _sBatch = !_sBatch; _sSel.clear();
    renderStickers();
    if (_sBatch) showToast('批量模式：点图选中，底部删除');
  };
  const myeManage = $('#myeManage');
  if (myeManage) myeManage.onclick = _stickerNewGroup;
  const batchAll = $('#stickerBatchAll');
  if (batchAll) batchAll.onclick = () => {
    const name = _sgCur.mine;
    const g = (data.stickerGroups || []).find(x => x.name === name);
    if (g) g.imgs.forEach((s, i) => _sSel.add(name + '\u0001' + i));
    renderStickers();
    const cnt = $('#stickerBatchCount'); if (cnt) cnt.textContent = `已选 ${_sSel.size} 张`;
  };
  const batchDel = $('#stickerBatchDel');
  if (batchDel) batchDel.onclick = () => {
    if (!_sSel.size) { showToast('先点图选中'); return; }
    (data.stickerGroups || []).forEach(g => {
      const idxs = [..._sSel].filter(k => k.startsWith(g.name + '\u0001')).map(k => Number(k.split('\u0001')[1])).sort((a, b) => b - a);
      idxs.forEach(i => g.imgs.splice(i, 1));
    });
    _sSel.clear(); _sBatch = false;
    save(); renderStickers();
    showToast('已删除');
  };
  const batchExit = $('#stickerBatchExit');
  if (batchExit) batchExit.onclick = () => { _sBatch = false; _sSel.clear(); renderStickers(); };

  const mask = $('#pokeMask');
  if (!mask) return;
  // ghost click 的承接点＝面板根（capture 阶段）：卡片／tab／分组 chips／关闭钮都不许吃这一手，
  // 逐个 gate 会漏（同一手势的兼容 click 落在哪一枚上由几何决定，不是由意图决定）
  mask.addEventListener('click', e => {
    if (!_pokeSwallowClick) return;
    _pokeSwallowClick = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);
  // 标记只活到**下一发手势**为止：真点卡之前必然先来一发 pointerdown，所以这一解除把「正常用法」全放回来
  document.addEventListener('pointerdown', () => { _pokeSwallowClick = false; }, true);
  $('#pokeClose').onclick = closePokePanel;
  $('#pokeTabs').addEventListener('click', e => {
    const btn = e.target.closest('.poke-tab');
    if (!btn || btn.dataset.pokeTab === _pokeTab2) return;
    _pokeTab2 = btn.dataset.pokeTab;
    _pokeSaveLast();
    renderPokeList();
  });
  // 拍谁：点一枚换对象，文案/头部/群聊里谁回都跟着换（BUGS #184）
  const _whosEl = $('#pokeWhos');
  if (_whosEl) _whosEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-poke-who]');
    if (!btn) return;
    const who = btn.dataset.pokeWho || '';
    if (who === _pokeWho) return;
    _pokeWho = who;
    $$('#pokeWhos .poke-who').forEach(b => { const on = (b.dataset.pokeWho || '') === who; b.classList.toggle('sel', on); if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
    _renderPokeWho();
  });
  $('#pokeGroups').addEventListener('click', e => {
    if (e.target.closest('#pokeGroupAdd')) {
      if (typeof window.openModal !== 'function') return;
      window.openModal('新建拍一拍分组', '', v => {
        const name = String(v || '').trim();
        if (!name) { showToast('请输入分组名'); return; }
        if ((data.pokeMine || []).some(g => g.name === name)) { showToast(`分组「${name}」已存在`); return; }
        data.pokeMine.push({ name, cards: [] });
        _pokeCurGroup = name; _pokeSaveLast(); save(); renderPokeList();
        showToast(`已新建分组「${name}」`);
      });
      return;
    }
    const b = e.target.closest('.poke-g-chip[data-pgroup]');
    if (!b) return;
    _pokeCurGroup = b.dataset.pgroup;
    _pokeSaveLast();
    renderPokeList();
  });
  // ===== 拍一拍防误触（用户「会卡顿容易误触发送出拍一拍」）=====
  // 拍一拍发出去是**不可撤回**的系统提示（chat.js 的 _pokeSys 不进可撤回名单），
  // 点错只能靠系统提示沉底去掩盖，代价远高于点错表情包。三道闸：
  //   ① 位移闸：按下到抬起位移超阈值＝用户在滑列表而不是在选，浏览器有时会吞掉这种
  //      click、有时不吞（「滚动刚停、手指还在同一片区域又点一下」最常见），不能只靠浏览器。
  //   ② 动画闸：面板 .22s 上滑入场期间不接受点击（那一击位置还没稳，看着像卡了一下）。
  //   ② 冷却闸：发过一次后短时间内的重复 click 直接吞掉，避免狂点刷屏。
  // 防误触三闸的常量与状态声明在**模块级**（见文件里 openPokePanel 上方那段注释）：
  // openPokePanel 在 IIFE 外设动画闸，IIFE 里的东西它引用不到。
  const pokeList = $('#pokeList');
  // ⚠ _pokeSlid 必须**按手势**判，不能留成一个跨手势的布尔：
  //   一旦某次滑动把它置 true，后续所有 click 都会被它挡掉（永不复位）。
  //   后果实测过：常驻 _smoke_sticker_poke 用 .click() 直接点卡（无 pointerdown 上下文），
  //   D4/D5d 当场打红 added=0 —— 正常轻点被当成误触拦下，功能等于瘫了。
  //   正解：用时间戳限定「只对这一次手势有效」，且 pointerdown 时复位；
  //   没有 pointerdown 的合成 click（如 .click()、键盘激活）不落进滑动窗口，正常放行。
  const SLID_WINDOW = 500;     // 位移判定只在此窗口内有效(ms)
  pokeList.addEventListener('pointerdown', e => {
    _pokeSlid = false;
    _pokeSlidAt = 0;
    if (!e.target.closest('.poke-card[data-poke-card]')) return;
    _pokeDown = { x: e.clientX, y: e.clientY, t: Date.now() };
  }, { passive: true });
  pokeList.addEventListener('pointermove', e => {
    if (!_pokeDown) return;
    if (Math.abs(e.clientX - _pokeDown.x) > POKE_MOVE_TOL || Math.abs(e.clientY - _pokeDown.y) > POKE_MOVE_TOL) {
      _pokeSlid = true;
      _pokeSlidAt = Date.now();
      _pokeDown = null;
      _pokeScrollUntil = Date.now() + POKE_SCROLL_GUARD;   // 还在划：整段手势期间都别想点中
    }
  }, { passive: true });
  // 滚动**结束**（惯性停下）也要续上一段静默期：手指还压在刚划过的位置，
  // 紧接着那一下在用户眼里是「我刚停下来」，实际落点已换成另一张卡（量具 T2b 实测会误发）
  pokeList.addEventListener('scroll', () => { _pokeScrollUntil = Date.now() + POKE_SCROLL_GUARD; }, { passive: true });
  $('#pokeList').addEventListener('click', e => {
    // 闸门只读不声明：同一函数下方原本就有一个 const card，重名会让整段脚本 SyntaxError 作废
    const hit = e.target.closest('.poke-card[data-poke-card]');
    if (hit) {
      if (Date.now() < _pokeScrollUntil) return;                  // 刚滚过/还在滚，落点已换
      if (_pokeSlid && Date.now() - _pokeSlidAt < SLID_WINDOW) return;   // 这一次手势是在滑列表，不是选它
    }
    const edit = e.target.closest('.poke-op-edit');
    if (edit) {
      e.stopPropagation();
      const g = (data.pokeMine || []).find(x => x.name === _pokeCurGroup);
      const i = Number(edit.dataset.pedit);
      const old = g && g.cards[i];
      if (typeof window.openModal !== 'function' || !g || typeof old !== 'string') return;
      window.openModal('修改拍一拍', old, v => {
        v = String(v || '').trim();
        if (!v) { showToast('请输入拍一拍文字'); return; }
        if (g.cards.includes(v) && v !== old) { showToast('该分组已有相同的拍一拍'); return; }
        g.cards[i] = v;
        save(); renderPokeList();
        showToast('已修改');
      });
      return;
    }
    const del = e.target.closest('.poke-op-del');
    if (del) {
      e.stopPropagation();
      const g = (data.pokeMine || []).find(x => x.name === _pokeCurGroup);
      const i = Number(del.dataset.pdel);
      const old = g && g.cards[i];
      if (typeof window.openModal !== 'function' || !g || typeof old !== 'string') return;
      window.openModal('删除这条拍一拍？', '', () => {
        g.cards.splice(i, 1);
        save(); renderPokeList();
        showToast('已删除');
      }, { noInput: true, staticText: `「${old}」\n\n删除后无法恢复。` });
      return;
    }
    if (!hit) return;
    // 冷却只挡**同一张卡**的重复 click（狂点刷屏）；点别的卡照常发出去
    const key = hit.dataset.pokeCard || '';
    if (key === _pokeCooldownCard && Date.now() < _pokeCooldownUntil) return;
    _pokeCooldownCard = key;
    _pokeCooldownUntil = Date.now() + POKE_COOLDOWN;
    _sendPoke(key);
  });
  const doSave = () => {
    const input = $('#pokeInput');
    const v = (input && input.value || '').trim();
    if (!v) { showToast('先输入拍一拍文字'); return; }
    const g = _pokeTargetGroup();
    if (g.cards.includes(v)) { showToast(`「${g.name}」已有相同的拍一拍`); return; }
    g.cards.push(v);
    _pokeCurGroup = g.name; _pokeSaveLast();
    save(); renderPokeList();
    if (input) input.value = '';
    showToast(`已存入「${g.name}」`);
  };
  const doSend = () => {
    const input = $('#pokeInput');
    const v = (input && input.value || '').trim();
    if (!v) { showToast('先输入拍一拍文字'); return; }
    if (input) input.value = '';
    _sendPoke(v);
  };
  const saveBtn = $('#pokeInputSave');
  if (saveBtn) saveBtn.onclick = doSave;
  const sendBtn = $('#pokeInputGo');
  if (sendBtn) sendBtn.onclick = doSend;
  const input = $('#pokeInput');
  if (input) input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); doSend(); }
  });
  // 内联抽屉：点消息区收起（点头像打开的那一下 pointerdown 先关、随后的 tap 再开，顺序天然正确）
  $('#messageList').addEventListener('pointerdown', e => {
    if (mask.hidden) return;
    if (e.target.closest('#pokeMask, .mini-avatar, #chatHeadName')) return;
    closePokePanel();
  }, { passive: true });
})();
