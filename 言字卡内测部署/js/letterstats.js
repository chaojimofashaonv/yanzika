// ===== 写信统计（独立功能视图）=====
// 只读：从 data.sentLetters ∶ data.receivedLetters 现算，零 data 字段零迁移。
// 四件按用户点名的——数量 ∶ 时间 ∶ 类型 ∶ 常用字卡（内容一字未增减；「通话记录」不属于写信，故没有）。
// 版式与【聊天统计】逐件同族（同一份 css/stats.css∶同一排 tag∶一种卡）：**一行 tag + 当前那一档的一张卡**。
// 两面原先都是五节一屏平铺，用户判「缺少 tag 分类，太杂」→ 收成可切换的五档，每档只画自己那一节；
// 节标（.sec-label）随之不画——tag 上已写着这件事的名字，再画一条＝同一件事说两遍（#095∶#161 同一条口径）。
// 柱∶排行榜∶刻度行∶月份分桶全部共用 js/stats.js 那一份画法（js_order 里它排在本件之前），
// 样式全复用 css/stats.css 的 .stats-*∶.ck-* 一族＝**不为本页新写一条选择器**（两面骨架逐件相同，改一处两面同变）。
// tag 那一行也复用现成的 .stats-tabs/.stats-tab/.stats-panel（播放器选项行同一族），选中切 .active 不切 .on
//（mono.css ③ 那条带 `body ` 前缀的 .active 才压得住各页 (0,2,0) 的 .on＝BUGS #311 那个黑底黑字同一课）。
// 停留哪一档记本机 ordinal-letterstats-tab（与聊天统计那份各一枚键∶都不进 data∶不进备份∶脏值回落「概览」）。
// 三条口径先写清，免得下一轮被当成 bug：
// ① 「用了哪些字卡」是**拿信文回你现在的库里比对**出来的——信里只存最终文字，composeLetterText 当时抽了
//    哪几张卡没有记账。库里已被删改的句子数不到，屏上那句「另有 N 段在库里没找到」就是这件事的账
//    （同【字卡适应度】#204 那条「拿说过的话回库里比」的限制，两页各数各的：那一页数聊天，这一页数信）。
// ② 只有 TA 写来的信算「抽卡」；你寄出去的是你自己打的字，不拿它冒充卡。比库还按**那一本的 cid**
//    取（专属卡硬隔离 #051）：筛中谁就只认那位取得到的组，否则「绑给别人的句子」会被算成这位抽过的卡。
// ③ 筛选态只活在本页（lsScope），既不读信箱页那一行 chips（ordinal-mailbox-scope），也不读聊天统计那份
//    statsScope——三处各一份，切来切去不互相顶。
let lsScope = 'all';

// tag 五档＝旧五节，一节不多一节不少（用户点名的那四件「数量∶时间∶类型∶常用字卡」全在名单里；
// 「按月」是演示稿那页有而旧四格里没有的一节＝第五档）。名单是唯一来源：门 A6 现读它比对档名。
const LS_TABS = [
  { k: 'overview', name: '概览' },
  { k: 'cards', name: '字卡' },
  { k: 'months', name: '按月' },
  { k: 'hours', name: '时段' },
  { k: 'types', name: '类型' },
];
const LS_TAB_KEY = 'ordinal-letterstats-tab';
let lsTab = 'overview';
function _lsTabLoad() {
  let v = null;
  try { v = localStorage.getItem(LS_TAB_KEY); } catch (e) { }
  lsTab = LS_TABS.some(x => x.k === v) ? v : 'overview';
}
function _lsTabSet(k) {
  if (!LS_TABS.some(x => x.k === k) || k === lsTab) return;
  lsTab = k;
  try { localStorage.setItem(LS_TAB_KEY, k); } catch (e) { }
}

// 两本一起摊平：r.sent＝你寄出的那方向，r.cid＝归哪一册（旧档没 cid 的按主会话认，与信箱读侧同口径）
function _lsRows() {
  const out = [];
  (data.sentLetters || []).forEach(m => { if (m) out.push({ m, sent: true, cid: m.cid || mainChatId() }); });
  (data.receivedLetters || []).forEach(m => { if (m) out.push({ m, sent: false, cid: m.cid || mainChatId() }); });
  return lsScope === 'all' ? out : out.filter(r => r.cid === lsScope);
}

// 一封信的时间：邮戳拆不出年月日（旧档「9/28」那种没年份）回 0＝不进时间类读数，不替它猜一个日子
function _lsTs(m) {
  const p = _mbParsePostmark(m && m.postmark);
  if (!p) return 0;
  const t = /(\d{1,2}):(\d{2})/.exec((m && m.time) || '');
  return new Date(p.y, p.m - 1, p.d, t ? +t[1] : 0, t ? +t[2] : 0).getTime() || 0;
}

// TA 信里用到的字卡：整段比∶按连接符拆开比（与【字卡适应度】共用 cardSegs 那把尺）。
// 比库按**那一本的 cid** 取（专属卡硬隔离，#051）＝筛中谁就只认那位取得到的那几组；
// 「全部」那一档没有具体会话可比，退回全库。一趟遍历顺带把「每封几张卡」记下来，不在上面再扫第二遍
function _lsCards(rows) {
  const freq = {}, catCnt = {}, libTag = {};
  const cache = {};
  let hits = 0, miss = 0, taLetters = 0, perN = 0, perSum = 0, perMax = 0;
  rows.filter(r => !r.sent).forEach(r => {
    const segs = cardSegs(r.m.text || '');
    if (!segs.length) return;
    taLetters++;
    const key = lsScope === 'all' ? '' : r.cid;
    if (!cache[key]) cache[key] = cardLibIndex(key || undefined);
    const lib = cache[key];
    let n = 0;
    segs.forEach(s => {
      const cat = lib[s];
      if (cat === undefined) { miss++; return; }
      if (libTag[s] === undefined) libTag[s] = cat;
      freq[s] = (freq[s] || 0) + 1;
      catCnt[cat] = (catCnt[cat] || 0) + 1;
      hits++; n++;
    });
    perN++; perSum += n; if (n > perMax) perMax = n;
  });
  return { freq, catCnt, libTag, hits, miss, taLetters, kinds: Object.keys(freq).length, perN, perSum, perMax };
}

function _lsBarRow(label, n, max, total) {
  const w = n ? Math.round(n / Math.max(1, max) * 100) : 0;
  const pct = total ? Math.round(n / total * 100) : 0;
  return `<div class="stats-bar-row"><span class="stats-bar-label">${escapeHTML(label)}</span><div class="stats-bar-track"><i style="width:${w}%"></i></div><b>${n}<em>${pct}%</em></b></div>`;
}

function renderLetterStats() {
  const el = $('#lsOutput'); if (!el) return;
  const rows = _lsRows();
  const sent = rows.filter(r => r.sent), recv = rows.filter(r => !r.sent);
  const card = _lsCards(rows);
  const wordsOf = list => list.reduce((s, r) => s + String(r.m.text || '').length, 0);
  const sentWords = wordsOf(sent), recvWords = wordsOf(recv);
  const perAvg = card.perN ? (Math.round(card.perSum / card.perN * 10) / 10) : 0;
  // 时间：写信天数 ∶ 最早最近一封 ∶ 几点写的。tsList＝能拆出年月日的那几封，同时喂下面「按月」那一节
  const days = new Set(), hourCnt = new Array(24).fill(0), tsList = [];
  let first = 0, last = 0;
  rows.forEach(r => {
    const ts = _lsTs(r.m);
    if (ts) {
      days.add(new Date(ts).toLocaleDateString('zh-CN'));
      tsList.push(ts);
      if (!first || ts < first) first = ts;
      if (ts > last) last = ts;
      const hm = /(\d{1,2}):(\d{2})/.exec(r.m.time || '');
      if (hm) { const h = +hm[1]; if (h >= 0 && h <= 23) hourCnt[h]++; }
    }
  });
  const fmt = ts => { if (!ts) return '—'; const d = new Date(ts); return d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate(); };
  // 近 7 天（含今天）每天几封：没写的那天留 0 不藏（与聊天统计那把尺同一条口径）
  const dayCnt = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString('zh-CN');
    let n = 0; rows.forEach(r => { const ts = _lsTs(r.m); if (ts && new Date(ts).toLocaleDateString('zh-CN') === key) n++; });
    dayCnt.push({ label: (d.getMonth() + 1) + '/' + d.getDate(), n });
  }
  // 三块柱（24 小时∶近 7 天∶按月）全部引 js/stats.js 那一份画法＝柱子∶刻度行∶一句峰值读数一次给齐，
  // 两页不留第二套。峰值那句没数据时由那份画法自己改口「这一档还没有过记录」，不硬凑一句
  const hourMax = Math.max(...hourCnt);
  const peakHour = hourCnt.findIndex(v => hourMax > 0 && v === hourMax);
  const hourBars = _statsBarsHTML(hourCnt, {
    labels: ['0', '6', '12', '18', '24'],
    tip: (v, i) => i + ':00 共 ' + v + ' 封',
    peak: '最热闹的是 ' + peakHour + ' 点 · 写了 ' + hourCnt[peakHour] + ' 封'
  });
  const weekMax = Math.max(...dayCnt.map(x => x.n));
  const peakDay = dayCnt.find(x => weekMax > 0 && x.n === weekMax);
  const weekBars = _statsBarsHTML(dayCnt.map(x => x.n), {
    sm: true,
    labels: dayCnt.map(x => x.label),
    tip: (v, i) => dayCnt[i].label + ' 写了 ' + v + ' 封',
    peak: '这七天里 ' + (peakDay ? peakDay.label : '') + ' 写得最多 · ' + (peakDay ? peakDay.n : 0) + ' 封'
  });
  // 按月：演示稿那一页有这一节（本站此前四格里没有），从上面那份 tsList 现算的真实聚合。
  // 月份多于 8 格只标首∶中∶末三枚（演示稿那页 12 根柱也只标三枚）——24 枚标签会互相压字
  const mo = _statsMonthCells(tsList);
  const moLabelsAll = mo.cells.map(c => _statsMonthLabel(c, mo.cur));
  const moLabels = moLabelsAll.length > 8
    ? [moLabelsAll[0], moLabelsAll[Math.floor((moLabelsAll.length - 1) / 2)], moLabelsAll[moLabelsAll.length - 1]]
    : moLabelsAll;
  const moMax = Math.max(0, ...mo.cells.map(c => c.n));
  const moPeak = mo.cells.find(c => moMax > 0 && c.n === moMax);
  const monthBars = tsList.length
    ? _statsBarsHTML(mo.cells.map(c => c.n), {
      sm: true,
      labels: moLabels,
      tip: (v, i) => _statsMonthLabel(mo.cells[i], mo.cur) + ' 写了 ' + v + ' 封',
      peak: '写得最多的是 ' + (moPeak ? _statsMonthLabel(moPeak, mo.cur) : '') + ' · ' + (moPeak ? moPeak.n : 0) + ' 封'
        + (mo.cut ? '（更早的 ' + mo.cut + ' 个月没画进来）' : '')
    })
    : `<p class="stats-note">${rows.length ? '这些信的邮戳拆不出年月日（旧档那种只写「9/28」的），按月这一节量不出来。' : '还没有信，按月这一节没有东西可画。'}</p>`;
  // 类型·信（旧档没 kind 的一律视为主动信，与信箱「每天最多 N 封」那条计数同口径）
  const kindCnt = {
    'TA 主动写的': recv.filter(r => (r.m.kind || 'proactive') !== 'reply').length,
    'TA 回你的': recv.filter(r => r.m.kind === 'reply').length,
    '你寄出的': sent.length,
    '夹了图的': rows.filter(r => !!r.m.img).length
  };
  const kindMax = Math.max(1, ...Object.values(kindCnt));
  const kindBars = Object.keys(kindCnt).map(k => _lsBarRow(k, kindCnt[k], kindMax, sent.length + recv.length)).join('');
  // 类型·卡（按分类）
  const catKeys = Object.keys(card.catCnt).sort((a, b) => card.catCnt[b] - card.catCnt[a]);
  const catMax = Math.max(1, ...catKeys.map(k => card.catCnt[k]));
  const catBars = catKeys.length
    ? catKeys.map(k => _lsBarRow(k, card.catCnt[k], catMax, card.hits)).join('')
    : '<div class="stats-empty">TA 的信里还没比到库里的字卡</div>';
  // 常用字卡榜（行markup 与展开那一发都交回 _statsRankFill 那一份实现，两页同形）
  const rankRows = Object.entries(card.freq).sort((a, b) => b[1] - a[1]).slice(0, 50);
  // 一行 tag ＋ 当前那一档的一张卡：五节不再一屏平铺（用户判「太杂」），一档只画自己那一节。
  // 三格常驻＝它们答的是「选谁一共多少」，与切到哪一档无关；节标不画（tag 上已经写着这件事的名字）。
  // 卡内还有两段时才给 .stats-hour-label（一段一个名字，与【聊天统计】同一档的写法逐字同族）
  _lsTabLoad();
  const panels = {
    overview: `<div class="stats-sec">
      <div class="stats-lines">
        <div><span>TA 的信共</span><b>${_statsNum(recvWords)} 字</b></div>
        <div><span>你写的信共</span><b>${_statsNum(sentWords)} 字</b></div>
        <div><span>写信天数</span><b>${days.size} 天</b></div>
        <div><span>最早一封</span><b>${fmt(first)}</b></div>
        <div><span>最近一封</span><b>${fmt(last)}</b></div>
      </div>
    </div>`,
    cards: `<div class="stats-sec">
      <div class="stats-hour-label">用了多少张卡</div>
      <div class="stats-lines">
        <div><span>用掉字卡</span><b>${_statsNum(card.hits)} 张</b></div>
        <div><span>TA 一封平均几张</span><b>${perAvg} 张</b></div>
        <div><span>一封最多几张</span><b>${card.perMax} 张</b></div>
        <div><span>出现过的卡</span><b>${card.kinds} 种 · ${catKeys.length} 类</b></div>
      </div>
      <div class="stats-hour-label">哪几句被抽到最多</div>
      <div id="lsRank"></div>
      <p class="stats-note">「用掉字卡」是拿 TA 信里的句子回你现在的库里比对出来的，另有 ${card.miss} 段没比到（删过∶改过的句子∶${lsScope === 'all' ? '没限到人时不区分专属与公用' : '绑给别人的专属卡'}就落在这一段里）。你寄出去的是你自己打的字，不算进抽卡这一格。</p>
    </div>`,
    months: `<div class="stats-sec">${monthBars}</div>`,
    hours: `<div class="stats-sec"><div class="stats-hour-label">一天里哪几个钟头写得最多</div>${hourBars}<div class="stats-hour-label">近 7 天每天封数</div>${weekBars}</div>`,
    types: `<div class="stats-sec">
      <div class="stats-hour-label">信是哪一类</div>
      <div class="stats-bars">${kindBars}</div>
      <div class="stats-hour-label">信里的卡是哪一类</div>
      <div class="stats-bars">${catBars}</div>
      <p class="stats-note">「夹了图」是同一批信里的另一件事（一封主动信也可能夹着图），所以这一行的百分比不按封数归一。</p>
    </div>`,
  };
  el.innerHTML = `
    <div class="stats-scope" id="lsScope"></div>
    <div class="stats-grid">
      <div class="stats-tile"><b>${_statsNum(recv.length)}</b><span>收到的信</span></div>
      <div class="stats-tile"><b>${_statsNum(sent.length)}</b><span>寄出的信</span></div>
      <div class="stats-tile"><b>${_statsNum(sentWords + recvWords)}</b><span>总字数</span></div>
    </div>
    <div class="stats-tabs" id="lsTabs">${LS_TABS.map(t => `<button type="button" class="stats-tab${lsTab === t.k ? ' active' : ''}" data-ls-tab="${t.k}">${t.name}</button>`).join('')}</div>
    <div class="stats-panel" data-tab="${lsTab}">${panels[lsTab]}</div>
  `;
  const tabsEl = $('#lsTabs');
  if (tabsEl) tabsEl.onclick = e => {
    const b = e.target.closest('.stats-tab'); if (!b) return;
    _lsTabSet(b.dataset.lsTab);
    renderLetterStats();
  };
  // 范围芯片：全部 / 每位联系人（名字走聊天里那一份 chatNameOf，与信箱∶首页同一把尺）
  const scopeEl = el.querySelector('#lsScope');
  if (scopeEl) {
    const chips = [{ id: 'all', label: '全部' }].concat((data.contacts || []).map(c => ({ id: c.id, label: fixedNameOf(c) })));
    scopeEl.innerHTML = chips.map(c => `<button type="button" class="scope-chip${lsScope === c.id ? ' on' : ''}" data-scope="${escapeHTML(c.id)}">${escapeHTML(c.label)}</button>`).join('');
    scopeEl.onclick = e => {
      const b = e.target.closest('.scope-chip'); if (!b) return;
      lsScope = b.dataset.scope;
      renderLetterStats();
    };
  }
  const rankEl = $('#lsRank');
  if (rankEl) {
    if (!rankRows.length) {
      rankEl.innerHTML = '<div class="stats-empty">TA 还没有写信，或信里的句子都没比到库里的卡</div>';
    } else {
      _statsRankFill(rankEl, rankRows, card.libTag,
        card.kinds > rankRows.length ? `<div class="stats-empty">仅显示前 ${rankRows.length} 张，共 ${card.kinds} 种</div>` : '');
    }
  }
}
