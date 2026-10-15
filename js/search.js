// ===== 统一搜索（聊天 / 信件 / 收藏 / 字卡 / 心愿）·两个口径：首页那条只搜聊天记录，使用大全那条搜全部五类 =====
// 首页搜索条打开半屏浮层，压在当前那一面之上（点遮罩或「取消」收回）：
// 实时检索五类内容，按分类分组展示，点结果直达对应位置（聊天跳定位、信件开信、收藏滚到卡片、字卡进分组、心愿进心愿页）。
// 每类单独限行数，防大数据量卡顿；状态栏给分类计数。
// 聊天那一类另有一行「按谁筛」（BUGS #438）：芯片＝会话名单，只影响「聊天」那一段，信件/收藏/字卡/心愿不牵连。

const SEARCH_MAX = { msg: 300, letter: 100, collect: 100, card: 60, wish: 60 };

// 「按谁筛」那一行的筛选态：与字卡库 #265／信箱分册 #091 同一写法——只存本机、不进 data 不进备份
// （筛的是阅读位置不是数据），'all' 直接删键；键名带 ordinal- 前缀＝「清空本站全部数据」那一族扫得到。
const SEARCH_WHO_KEY = 'ordinal-search-who';
let currentSearchWho = (() => { try { return localStorage.getItem(SEARCH_WHO_KEY) || 'all'; } catch (e) { return 'all'; } })();
function saveSearchWho(w) {
  currentSearchWho = w || 'all';
  try {
    if (currentSearchWho === 'all') localStorage.removeItem(SEARCH_WHO_KEY);
    else localStorage.setItem(SEARCH_WHO_KEY, currentSearchWho);
  } catch (e) {}
}
// 芯片名走 fixedNameOf（BUGS #407 那把尺：搜索面板不是聊天页那一本，写「聊天里那份昵称」会跟
// 信箱∶字卡∶播放器那几行「按谁筛」的芯片各叫一个名）；群聊补「 · 群」＝#237 定的那条标注。
// 认不出这位就说实话「已不在通讯录」，不拿 cid 当名字端上屏。
function _searchWhoLabel(cid) {
  const c = (data.contacts || []).find(x => x && x.id === cid);
  if (!c) return '已不在通讯录';
  return (fixedNameOf(c) || '未命名') + (c.kind === 'group' ? ' · 群' : '');
}
// 芯片那一行由这里一处画：不足两本就整行不出（只有一档时它是纯噪音）。名单给的是**所有会话**
// （这一发没命中的也列、数写 0）——只列命中的话，筛中某人而他换了个词没命中时他这枚会凭空消失，
// 用户刚点的东西回不去，只能靠清关键词出来。数＝点进去列得出的数（#079 那一刀）。
function _searchWhoRender(list, who) {
  const el = $('#searchWho');
  if (!el) return;
  if (!list || list.length < 2) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.innerHTML = [{ id: 'all', n: list.reduce((a, b) => a + b.n, 0), label: '全部' }].concat(list).map(b =>
    `<button type="button" class="fchip${who === b.id ? ' on' : ''}" data-search-who="${escapeHTML(b.id)}">${escapeHTML(b.label)}<span class="n">${b.n}</span></button>`).join('');
}

function _searchHlHTML(text, q) {
  // 对原文按关键词切段并高亮：先定位后逐段 escapeHTML，避免转义后下标错位
  const lq = q.toLowerCase();
  const src = String(text);
  let out = '';
  let rest = src;
  let idx = rest.toLowerCase().indexOf(lq);
  let guard = 0;
  while (idx > -1 && guard < 20) {
    if (idx > 0) out += escapeHTML(rest.slice(0, idx));
    out += '<mark class="hl">' + escapeHTML(rest.slice(idx, idx + q.length)) + '</mark>';
    rest = rest.slice(idx + q.length);
    idx = rest.toLowerCase().indexOf(lq);
    guard++;
  }
  return out + escapeHTML(rest);
}

function _searchGroupHTML(name, count) {
  return '<div class="search-group"><span class="search-group-name">' + name + '</span><span class="search-group-n">' + count + '</span></div>';
}
function _simpleRowHTML(kind, attrs, title, meta, snippetHtml) {
  return '<div class="search-row search-row-simple" role="button" tabindex="0" data-kind="' + kind + '" ' + attrs + '>'
    + '<span class="search-kind-ic search-kind-' + kind + '"></span>'
    + '<span class="search-main"><span class="search-top"><span class="search-who">' + title + '</span>'
    + '<span class="search-time">' + meta + '</span></span>'
    + '<span class="search-text">' + snippetHtml + '</span></span></div>';
}

let _searchTimer = null;

function doSearch() {
  const input = $('#searchInput');
  const status = $('#searchStatus');
  const body = $('#searchBody');
  const q = input.value.trim();
  const clearBtn = $('#searchClear');
  clearBtn.hidden = !q;
  if (!q) {
    status.textContent = '';
    _searchWhoRender([], 'all');
    body.innerHTML = '<div class="search-empty"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="20.5" y1="20.5" x2="15.8" y2="15.8"></line></svg>' + (_searchMode === 'all' ? '搜索聊天、信件、收藏、字卡和心愿' : '搜索聊天记录') + '<br>输入关键词，点结果直达</div>';
    return;
  }
  const lq = q.toLowerCase();
  const html = [];
  const counts = [];

  // 聊天：全部会话（排除系统提示/已撤回/纯表情包）
  // 逐本会话各收各的命中（BUGS #438）：限行由「整类一条」改成「每本一条」——旧写法整类攒满就停止收，
  // 聊得最多的那一位能把后面所有人的命中整本挤掉＝芯片少一枚、下面也搜不到他，
  // 这是「我明明有多个联系人，却只搜得出一个」那一读感里真存在的那一半（另一半是行上的名字读成了同一个人）。
  const _searchAll = _searchMode === 'all'; const chatBuckets = [];
  for (const cid of Object.keys(data.chats || {})) {
    const rows = []; let n = 0;
    const ms = (data.chats[cid].msgs || []).slice().reverse();
    for (const m of ms) {
      if (!m || m.from === 'system' || m.recalled) continue;
      const t = m.text;
      if (!t || t === '[表情包]' || !t.toLowerCase().includes(lq)) continue;
      n++;
      if (rows.length >= SEARCH_MAX.msg) continue;
      const mine = m.from === 'me';
      // 我方那一枚按**这一本会话**取名与取脸（2026-10-08 按会话分开）。
      // 对方那一侧仍走 chatPartnerName()/chatPartnerAvatar()＝读当前开着的联系人，跨会话搜出来的行
      // 名字会串到一个人身上——那是另一件事（#128 那一族），本批不顺手改，已如实报。
      const who = mine ? chatMyName(cid) : chatPartnerName();
      const av = mine ? avatarHTML(chatMyAvatar(cid), firstChar(who)) : avatarHTML(chatPartnerAvatar(), firstChar(who));
      const dateLabel = m.date ? '<small>' + escapeHTML(formatDateLabel(m.date)) + '</small>' : '';
      rows.push('<div class="search-row" role="button" tabindex="0" data-kind="msg" data-cid="' + escapeHTML(cid) + '" data-id="' + escapeHTML(m.id) + '">'
        + '<span class="mini-avatar">' + av + '</span>'
        + '<span class="search-main"><span class="search-top"><span class="search-who">' + escapeHTML(who) + dateLabel + '</span>'
        + '<span class="search-time">' + escapeHTML(m.time || '') + '</span></span>'
        + '<span class="search-text">' + _searchHlHTML(m.text || '', q) + '</span></span></div>');
    }
    chatBuckets.push({ id: cid, n, rows, label: _searchWhoLabel(cid) });
  }
  // 顺序跟通讯录名单（#066 那一课：随 data.chats 的键序漂＝同一位在屏上来回跳位），认不出的那位排最后
  const whoOrder = (data.contacts || []).map(c => c.id);
  const whoRank = id => { const i = whoOrder.indexOf(id); return i < 0 ? 9e9 : i; };
  chatBuckets.sort((a, b) => whoRank(a.id) - whoRank(b.id));
  // 停在一条已删掉的会话上＝一屏空白，当场回落「全部」（#265 同一刀，不留第三种屏）
  const who = chatBuckets.some(b => b.id === currentSearchWho) ? currentSearchWho : 'all';
  _searchWhoRender(chatBuckets, who);
  // 筛中某人＝那一本的额度整份给他（「细化」这一步正是这行芯片该做到的事）；「全部」那一档按**有命中的本数**
  // 分额度＝谁也不许把谁挤掉，而总量仍锁在 SEARCH_MAX.msg 内（第 4 行那句「防大数据量卡顿」的承诺不作废；
  // 只有一本命中时分到整 300＝与旧写法一字不差的观感，不会为公平把唯一那位削成 100 条）
  const hitBuckets = chatBuckets.filter(b => b.n > 0);
  const perBucket = Math.ceil(SEARCH_MAX.msg / Math.max(1, hitBuckets.length));
  const kept = who === 'all' ? hitBuckets : chatBuckets.filter(b => b.id === who);
  const msgRows = kept.reduce((a, b) => a.concat(who === 'all' ? b.rows.slice(0, perBucket) : b.rows), []);
  const msgN = kept.reduce((a, b) => a + b.n, 0);
  if (msgN) { counts.push('聊天 ' + msgN); html.push(_searchGroupHTML('聊天', msgN)); html.push(msgRows.join('')); }

  // 信件：来信 + 寄出的
  const letterRows = []; let letterN = 0;
  const addLetter = (arr, m, isSent, label) => {
    letterN++;
    if (letterRows.length >= SEARCH_MAX.letter) return;
    letterRows.push(_simpleRowHTML('letter', 'data-idx="' + arr.indexOf(m) + '" data-sent="' + (isSent ? 1 : 0) + '"',
      escapeHTML(label), escapeHTML(m.postmark || ''), _searchHlHTML(m.text || '', q)));
  };
  const recv = _searchAll ? (data.receivedLetters || []).slice().reverse() : [];
  for (const m of recv) if (m && m.text && m.text.toLowerCase().includes(lq)) addLetter(data.receivedLetters || [], m, false, _mbOwnerName(m.cid || mainChatId()) + ' 的来信');
  const sent = _searchAll ? (data.sentLetters || []).slice().reverse() : [];
  for (const m of sent) if (m && m.text && m.text.toLowerCase().includes(lq)) addLetter(data.sentLetters || [], m, true, '寄给 ' + _mbOwnerName(m.cid || mainChatId()));
  if (letterN) { counts.push('信件 ' + letterN); html.push(_searchGroupHTML('信件', letterN)); html.push(letterRows.join('')); }

  // 收藏：遍历各会话的 collect-msgs:<cid>
  const collectRows = []; let collectN = 0;
  try {
    for (const cid of (_searchAll ? Object.keys(data.chats || {}) : [])) {
      const list = JSON.parse(localStorage.getItem('collect-msgs:' + cid) || '[]');
      for (const f of list.slice().reverse()) {
        if (!f || !f.text || !f.text.toLowerCase().includes(lq)) continue;
        collectN++;
        if (collectRows.length >= SEARCH_MAX.collect) continue;
        const kindLabel = f.kind === 'mail' ? '信件' : '聊天';
        collectRows.push(_simpleRowHTML('collect', 'data-cid="' + escapeHTML(cid) + '" data-cts="' + escapeHTML(f.ts || '') + '"',
          escapeHTML(((f.by || 'me') === 'ta' ? partnerName() + ' 的收藏' : '我的收藏') + ' · ' + kindLabel),
          '', _searchHlHTML(f.text, q)));
      }
    }
  } catch (e) {}
  if (collectN) { counts.push('收藏 ' + collectN); html.push(_searchGroupHTML('收藏', collectN)); html.push(collectRows.join('')); }

  // 朋友圈那一类随整族下线删净（2026-10-10 用户点名「相关全部删掉」，BUGS #268）：动态不再存在，
  // 留着就是一个永远零结果的分组与一条点不动的直达

  // 字卡：卡片内容命中（图片字卡无文本，跳过）
  const cardRows = []; let cardN = 0;
  for (const g of (_searchAll ? (data.groups || []) : [])) {
    const cat = g.category || '主字卡';
    for (const c of (g.cards || [])) {
      const text = typeof c === 'string' ? c : '';
      if (!text || !text.toLowerCase().includes(lq)) continue;
      cardN++;
      if (cardRows.length >= SEARCH_MAX.card) break;
      // 「内置」挂在分组名后面＝这一族唯一混排两面（出厂预置组与你自建的组）的地方：字卡库里预置组
      // 根本不出现、预置页整页都是预置，那里再挂一枚就是把页题说第二遍（2026-10-11 BUGS #281）。
      // 复用聊天那行日期同款 .search-who small＝零新组件零新规则。
      // data-preset/data-grp＝直达要知道该落哪一面：预置组在字卡库里被筛掉了，跳过去只能看见
      // 「没有匹配的字卡」＝一枚点得动却落在空屏上的行（本仓「看着能点实则无反应」那一族）。
      cardRows.push(_simpleRowHTML('card', 'data-cat="' + escapeHTML(cat) + '" data-q="' + escapeHTML(q) + '"'
        + ' data-grp="' + escapeHTML(g.name || '') + '" data-scope="' + escapeHTML(cardScope(g)) + '" data-preset="' + (g.preset ? 1 : 0) + '"',
        escapeHTML(g.name || '未分组') + (g.preset ? '<small>内置</small>' : ''), escapeHTML(cat), _searchHlHTML(text, q)));
    }
  }
  if (cardN) { counts.push('字卡 ' + cardN); html.push(_searchGroupHTML('字卡', cardN)); html.push(cardRows.join('')); }

  // 心愿：按 wid 直达心愿页并闪烁定位（旧档没 wid 的条目 ensureData 会补）
  const wishRows = []; let wishN = 0;
  for (const w of (_searchAll ? (data.wishlist || []).slice().reverse() : [])) {
    if (!w || !w.t || !w.t.toLowerCase().includes(lq)) continue;
    wishN++;
    if (wishRows.length >= SEARCH_MAX.wish) continue;
    const d = new Date(w.ts);
    const who = (w.by === 'me' ? '你记下的' : chatPartnerName() + ' 说的') + (w.done ? ' · 已实现' : '');
    wishRows.push(_simpleRowHTML('wish', 'data-wid="' + escapeHTML(w.wid || '') + '"',
      escapeHTML(who), (d.getMonth() + 1) + '/' + d.getDate(), _searchHlHTML(w.t, q)));
  }
  if (wishN) { counts.push('心愿 ' + wishN); html.push(_searchGroupHTML('心愿', wishN)); html.push(wishRows.join('')); }

  const shown = msgRows.length + letterRows.length + collectRows.length + cardRows.length + wishRows.length;
  const total = msgN + letterN + collectN + cardN + wishN;
  // 筛在人身上时那句「共找到 N 条」得说清是这一位的 N 条，否则读起来像全站只有这么多（#265 同一刀）
  const whoTip = who === 'all' ? '' : '<span class="search-filter-who">只看 ' + escapeHTML(_searchWhoLabel(who)) + '</span> · ';
  if (!total) {
    status.textContent = '';
    // 芯片此刻就在上面（这一发没命中也要留着那枚出口），故这句得指它——只说「换个关键词」＝把人困在一屏空白里
    body.innerHTML = '<div class="search-empty">没有找到与「<span class="hl">' + escapeHTML(q) + '</span>」相关的内容<br>' + (who !== 'all' && chatBuckets.length >= 2 ? '「' + escapeHTML(_searchWhoLabel(who)) + '」的聊天里没有这一句 · 点上面「全部」看所有会话' : (_searchMode === 'all' ? '换个关键词试试' : '这里只搜聊天记录 · 换个关键词试试')) + '</div>';
    return;
  }
  status.innerHTML = whoTip + '共找到 <b>' + total + '</b> 条 · ' + counts.join(' · ') + (total > shown ? '（部分已省略，请细化）' : '');
  body.innerHTML = html.join('');
}

// FIX 2026-10-09 #226 口径由入口决定：'chat'＝只搜聊天记录（首页那条），'all'＝全部五类（使用大全那条）；缺省 'all' 不静默收窄未传参的调用方
let _searchMode = 'all';
function openSearch(mode) {
  _searchMode = (mode === 'chat') ? 'chat' : 'all'; const _si = $('#searchInput'); if (_si) { _si.placeholder = _searchMode === 'all' ? '搜索聊天 / 信件 / 心愿' : '搜索聊天记录'; _si.setAttribute('aria-label', _searchMode === 'all' ? '搜索全部内容' : '搜索聊天记录'); }
  $('#searchMask').hidden = false;
  const inp = $('#searchInput');
  inp.value = '';
  doSearch();
  setTimeout(() => { try { inp.focus(); } catch {} }, 60);
}

function closeSearch() {
  const mask = $('#searchMask');
  if (!mask.hidden) {
    mask.hidden = true;
    if (_searchTimer) { clearTimeout(_searchTimer); _searchTimer = null; }
  }
}

// 命中闪烁提示
function _searchFlash(el) {
  if (!el) return;
  el.classList.add('search-hit');
  setTimeout(() => el.classList.remove('search-hit'), 1600);
}
// 打开信件（收/寄 + 原数组下标）：不依赖列表行点击（列表现在按册筛，下标仍是全局数组的那个），
// 直接把信箱切到那封信所在的册，再走信箱自己的打开函数（撕开/重看/落款/投递全部同源，不做第二份实现）
function _searchOpenLetter(isSent, idx) {
  const arr = isSent ? (data.sentLetters || []) : (data.receivedLetters || []);
  const m = arr[idx];
  if (!m) return;
  _mbScopeSet(m.cid || 'all');
  showView('mailbox');
  setTimeout(() => {
    // 三册信箱（2026-10-14 BUGS #402）：来信按 kind 落册——回信去「TA 的回信」，其余（含旧档无 kind 的）去「TA 的来信」
    const tab = document.querySelector(`.mailbox-tab[data-tab="${isSent ? 'sent' : (m.kind === 'reply' ? 'reply' : 'proactive')}"]`);
    if (tab) tab.click();
    if (isSent) { _openSentLetter(m); return; }
    if (m.read) { openLetterView(m); return; }
    const row = document.querySelector(`#${m.kind === 'reply' ? 'replyList' : 'proactiveList'} .mailbox-row[data-idx="${idx}"]`);
    if (!row) { _openReceivedLetter(m); return; }
    row.dataset.animated = 'true';
    row.classList.add('tearing');
    setTimeout(() => {
      _openReceivedLetter(m);
      row.dataset.animated = 'false';
    }, 450);
  }, 420);
}
// 滚动定位到收藏卡片
function _searchOpenCollect(cid, cts) {
  showView('collect');
  setTimeout(() => {
    if (cid && cid !== data.activeChat && typeof switchChat === 'function') switchChat(cid);
    setTimeout(() => {
      const card = document.querySelector('#collectList .fav-card[data-cts="' + cts + '"]');
      if (card) { card.scrollIntoView({ block: 'center' }); _searchFlash(card); }
    }, 260);
  }, 340);
}
// 进入字卡库对应分类并带上关键词；预置组那一条落「系统预设字卡」那一面并当场展开那组
function _searchOpenCard(cat, q, grp, preset, scope) {
  if (preset) {
    // 预置组在字卡库那一面被筛掉了（它只住在独立页＝两页完全分开是 2026-10-04 用户定档），
    // 按老路子跳过去只能看见一句「没有匹配的字卡」＝一枚点得动、落在空屏上的行。
    // 那一面的分类档是「功能」不是物理分类，故按组名现取，不写死。
    const g = (data.groups || []).find(x => x && x.preset && x.name === grp);
    selectedGroupName = grp; groupSearch = '';
    currentSysCardsTab = (g && typeof presetFeatureOf === 'function') ? presetFeatureOf(g) : currentSysCardsTab;
    showView('syscards');
    setTimeout(() => { if (typeof renderSysCards === 'function') renderSysCards(); }, 60);
    return;
  }
  showView('cards');
  // 字卡库一次只摊一个作用域（还可能有「按谁筛」那一层），落错那一面＝跳过去看见一句「没有匹配的字卡」。
  // 写法与字卡适应度页那枚「去看」（cardfit 的 _cfGoCards）同一条口径，不留第二份判断。
  if (scope === 'own' || scope === 'public') { currentCardsScope = scope; if (typeof saveCardsScope === 'function') saveCardsScope(); }
  if (typeof saveCardsWho === 'function') saveCardsWho('all');
  selectedGroupName = '';
  setTimeout(() => {
    try {
      const tab = document.querySelector('.cards-tab[data-cards-tab="' + cat + '"]');
      if (tab) tab.click();
    } catch (e) {}
    const row = document.getElementById('cardsSearchRow');
    if (row) row.hidden = false;
    const inp = document.getElementById('groupSearchInput');
    if (inp) { inp.value = q; if (typeof renderGroups === 'function') renderGroups(); }
  }, 380);
}

// 进入心愿对应那条（已实现/待实现各回各的栏）并闪烁定位
function _searchOpenWish(wid) {
  const w = (data.wishlist || []).find(x => x && x.wid === wid);
  if (!w || typeof openWish !== 'function') { showView('wish'); return; }
  openWish(w.cid, w.done ? 'done' : 'todo');
  setTimeout(() => {
    const el = document.querySelector('#wishList .wish-row[data-wish-id="' + wid + '"]');
    if (el) { el.scrollIntoView({ block: 'center' }); _searchFlash(el); }
  }, 420);
}

const _searchTopBtn = $('#searchTopBtn');
if (_searchTopBtn) _searchTopBtn.addEventListener('click', () => openSearch('chat'));
$('#searchBack').addEventListener('click', closeSearch);
$('#searchMask').addEventListener('click', e => { if (e.target === e.currentTarget) closeSearch(); });
$('#searchClear').addEventListener('click', () => {
  const inp = $('#searchInput');
  inp.value = '';
  doSearch();
  inp.focus();
});
$('#searchInput').addEventListener('input', () => {
  if (_searchTimer) clearTimeout(_searchTimer);
  _searchTimer = setTimeout(doSearch, 120);
});
$('#searchInput').addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSearch();
});
// 「按谁筛」那一行的委托：芯片在 #searchBody **外面**（那一段的委托按 .search-row 认，两者互不牵连），
// 点一枚只重跑一次检索——关键词不动∶滚动位置由浏览器自己留着，不重建输入框也不关面板
const _searchWhoEl = $('#searchWho');
if (_searchWhoEl) _searchWhoEl.addEventListener('click', e => {
  const chip = e.target.closest('.fchip');
  if (!chip || !_searchWhoEl.contains(chip)) return;
  saveSearchWho(chip.dataset.searchWho);
  doSearch();
});
$('#searchBody').addEventListener('click', e => {
  const row = e.target.closest('.search-row');
  if (!row) return;
  const kind = row.dataset.kind;
  if (kind === 'msg') {
    closeSearch();
    const cid = row.dataset.cid;
    if (cid && cid !== data.activeChat && typeof switchChat === 'function') switchChat(cid);
    if (typeof jumpToMessage === 'function') setTimeout(() => jumpToMessage(row.dataset.id), 80);
    return;
  }
  if (kind === 'letter') { closeSearch(); _searchOpenLetter(row.dataset.sent === '1', Number(row.dataset.idx)); return; }
  if (kind === 'collect') { closeSearch(); _searchOpenCollect(row.dataset.cid, row.dataset.cts); return; }
  if (kind === 'card') { closeSearch(); _searchOpenCard(row.dataset.cat, row.dataset.q, row.dataset.grp, row.dataset.preset === '1', row.dataset.scope); return; }
  if (kind === 'wish') { closeSearch(); _searchOpenWish(row.dataset.wid); }
});
