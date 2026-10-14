// ===== 聊天统计（独立功能视图）=====
// 只读展示，从各会话消息实时统计
// 统计范围：'all'=全部会话合并，否则为会话 id（按联系人/群聊分开统计）
let statsScope = 'all';

// ── tag 分类（用户「聊天统计和写信统计里 缺少tag分类，太杂」）──────────────────
// 五节不再一屏平铺：一行 tag 切档，**每档只画自己那一节**（一屏一块内容，往下滚不用在五节里找）。
// 节标（.sec-label）随之不画——tag 上已经写着这件事的名字，再画一条节标＝同一件事说两遍
//（与 #095 顶栏那枚 26px 大字被撤、#161 那枚「情绪」标签不加同一条口径）；
// 一张卡里分两段的，第二段仍留一句小标（.stats-hour-label）——那是段名不是节名，去掉会读不出谁领起。
// 件复用现成的 .stats-tabs/.stats-tab（播放器选项行同一族）＝全站每种件只有一份，不新写选择器；
// 选中切 .active 不切 .on（mono.css ③ 那条带 `body ` 前缀的 `.stats-tab.active` 才压得住各页的
// (0,2,0) `.scope-chip.on`，写 .on 是死选择器＝BUGS #311 那个黑底黑字的同一课）。
// 停留哪一档记本机 ordinal-stats-tab·脏值与没存过都回落「概览」（不做空白档）：
// 阅读档位不是外观设置，不进 data、不进备份（同世界感知 ordinal-cjian-tab·信箱 ordinal-mailbox-scope 那一族）。
const STATS_TABS = [
  { k: 'overview', name: '概览' },
  { k: 'hours', name: '时段' },
  { k: 'cards', name: '字卡' },
  { k: 'calls', name: '通话' },
  { k: 'timeline', name: '时光线' },
];
const STATS_TAB_KEY = 'ordinal-stats-tab';
let statsTab = 'overview';
function _statsTabLoad() {
  let v = null;
  try { v = localStorage.getItem(STATS_TAB_KEY); } catch (e) { }
  statsTab = STATS_TABS.some(x => x.k === v) ? v : 'overview';
}
function _statsTabSet(k) {
  if (!STATS_TABS.some(x => x.k === k) || k === statsTab) return;
  statsTab = k;
  try { localStorage.setItem(STATS_TAB_KEY, k); } catch (e) { }
}

function _statsScopeMsgs() {
  if (statsScope !== 'all' && data.chats && data.chats[statsScope]) return data.chats[statsScope].msgs || [];
  let all = [];
  for (const c of data.contacts || []) { const ch = data.chats && data.chats[c.id]; if (ch && ch.msgs) all = all.concat(ch.msgs); }
  return all;
}

// 千分位：三格那几枚大数字按演示稿带分隔符（12,340 比 12340 一眼能读位数量级）。
// 不用 toLocaleString——各引擎/各语言环境的分组符不一致（有的回逗号、有的回空格），这里手写规则只认逗号。
function _statsNum(n) {
  const v = Math.max(0, Math.round(Number(n) || 0));
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// 连续天数：把有记录的日期收成「第几天」的整数（本地零点归一，Math.round 吸收时区偏移与夏令时的 ±1h），
// 再去重排序数最长的一串。解析不出日期的那条直接跳过——不替它猜一天（同信箱 #110「站戳不重掷」那条口径）。
function _statsStreak(daySet) {
  const dayNo = [];
  for (const k of daySet) {
    const d = new Date(String(k).replace(/-/g, '/'));
    if (isNaN(d.getTime())) continue;
    dayNo.push(Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000));
  }
  if (!dayNo.length) return 0;
  const uniq = [...new Set(dayNo)].sort((a, b) => a - b);
  let best = 1, run = 1;
  for (let i = 1; i < uniq.length; i++) {
    if (uniq[i] === uniq[i - 1] + 1) { run++; if (run > best) best = run; }
    else run = 1;
  }
  return best;
}

// 柱状那一节（两页∶两个统计页共用一份，不留第二套画法）。三件事一次给齐＝柱子∶刻度行∶一句峰值读数。
// 高亮只涂「等于最大值」那几根：一屏里最重的东西只该有一个答案，涂前三会把「最」这个字说糊。
// 全 0 时一根都不涂、改口「这一档还没有过记录」（量不出峰值就不写峰值），柱子仍画出来（那是「这几天确实没动静」的事实）。
// opts＝{ sm 矮一档, labels 刻度数组, tip(值,序) 每根柱的悬浮读数, peak 那句峰值读数（不给就不写那一行） }
function _statsBarsHTML(cnt, opts) {
  const o = opts || {};
  const max = cnt.length ? Math.max(...cnt) : 0;
  const bars = cnt.map((v, i) => `<div class="stats-hour${max > 0 && v === max ? ' hi' : ''}"${o.tip ? ` title="${escapeHTML(o.tip(v, i))}"` : ''}><i style="height:${max ? Math.max(Math.round(v / max * 100), 1) : 1}%"></i></div>`).join('');
  const x = (o.labels || []).map(s => `<span>${escapeHTML(String(s))}</span>`).join('');
  const note = max ? (o.peak ? `<p class="stats-note">${escapeHTML(o.peak)}</p>` : '') : '<p class="stats-note">这一档还没有过记录。</p>';
  return `<div class="stats-hours${o.sm ? ' sm' : ''}">${bars}</div>` + (x ? `<div class="stats-hours-x">${x}</div>` : '') + note;
}

// 按月份分桶：从「最早有记录的那一个月」到本月，逐月一格；跨度超过 24 个月只留最近 24 格（左端标注会写明
// 更早的没画进来——不拿「截了一段」冒充「全部」）。返回 [{label, y, m, n}]，label 跨年那几格带年份。
function _statsMonthCells(tsList) {
  let firstTs = 0;
  tsList.forEach(ts => { if (ts && (!firstTs || ts < firstTs)) firstTs = ts; });
  const now = new Date();
  const cur = { y: now.getFullYear(), m: now.getMonth() };
  if (!firstTs) return { cells: [], cut: 0, cur };
  const f = new Date(firstTs);
  let span = (cur.y - f.getFullYear()) * 12 + (cur.m - f.getMonth()) + 1;
  const cut = Math.max(0, span - 24);
  span = Math.min(span, 24);
  const cells = [];
  for (let i = 0; i < span; i++) {
    const d = new Date(cur.y, cur.m - (span - 1 - i), 1);
    cells.push({ y: d.getFullYear(), m: d.getMonth(), n: 0 });
  }
  tsList.forEach(ts => {
    const d = new Date(ts);
    const c = cells.find(x => x.y === d.getFullYear() && x.m === d.getMonth());
    if (c) c.n++;
  });
  return { cells, cut, cur };
}

// 月份小标：本月∶上月只写「X月」，跨年那几格补年份（一屏里同时出现 11月∶1月∶3月 时不补就是两个 11 月）
function _statsMonthLabel(c, cur) {
  return (c.y === cur.y ? '' : c.y + '年') + (c.m + 1) + '月';
}

// 按月趋势折线：一个月亮一个点、最高的那个月顶到上沿。两个数：本月句数与相对上月的增减。
// 只有一个月可画时不画线（一条线说不出趋势，画了就是冒充），改成一句实话读数。
function _statsTrendHTML(tsList) {
  const buckets = _statsMonthCells(tsList);
  const cells = buckets.cells;
  const cur = buckets.cur;
  if (cells.length < 2) {
    const only = cells.length ? cells[0].n : 0;
    return `<p class="stats-note">记录还在第一个月里 · 本月 ${only} 句</p>`;
  }
  const max = Math.max(...cells.map(c => c.n)) || 1;
  const pts = cells.map((c, i) => `${(i / (cells.length - 1) * 300).toFixed(1)},${(56 - c.n / max * 46).toFixed(1)}`);
  const thisM = cells[cells.length - 1], lastM = cells[cells.length - 2];
  let right = '本月 ' + thisM.n + ' 句';
  if (lastM.n > 0) {
    const diff = Math.round((thisM.n - lastM.n) / lastM.n * 100);
    right = '本月 ' + thisM.n + ' 句 · ' + (diff === 0 ? '与上月持平' : (diff > 0 ? '↑' : '↓') + Math.abs(diff) + '%');
  }
  return `<svg class="stats-trend" viewBox="0 0 300 64" aria-hidden="true"><polyline points="${pts.join(' ')}"/><circle cx="300" cy="${(56 - thisM.n / max * 46).toFixed(1)}" r="3"/></svg>` +
    `<div class="stats-trend-x"><span>${escapeHTML(_statsMonthLabel(cells[0], cur))}</span><span>${escapeHTML(right)}</span></div>`;
}

function renderStats() {
  const el = $('#statsOutput'); if (!el) return;
  const msgs = _statsScopeMsgs();
  const total = msgs.length;
  let mine = 0, partner = 0, sys = 0;
  const typeCnt = { text: 0, sticker: 0, cardParts: 0, ask: 0, quote: 0, recall: 0, game: 0 };
  const days = new Set();
  const hourCnt = new Array(24).fill(0);
  let first = null, last = null;
  const classify = m => {
    if (m.recalled) return 'recall';
    if (m.ask) return 'ask';
    if (m.game) return 'game';   // 游戏卡（战绩/挑战/明信片）单独一档，不混进文字
    if (m.sticker) return 'sticker';   // 表情包/图片按图片消息统计
    if (Array.isArray(m.cardParts) && m.cardParts.length) return 'cardParts';
    if (m.quote || m.quoteImg) return 'quote';
    return 'text';
  };
  for (const m of msgs) {
    if (m.from === 'system') sys++;
    else if (m.from === 'me') mine++;
    else partner++;
    const cat = m.from === 'system' ? null : classify(m);
    if (cat) typeCnt[cat]++;
    if (m.date) days.add(m.date);
    const t = m.time || '';
    if (t) {
      const h = parseInt(String(t).split(':')[0], 10);
      if (h >= 0 && h <= 23) hourCnt[h]++;
      const stamp = (m.date ? m.date + ' ' : '') + t;
      if (!first || stamp < first) first = stamp;
      if (!last || stamp > last) last = stamp;
    }
  }
  const dayCount = days.size;
  const avg = dayCount ? (total / dayCount).toFixed(1) : '0';
  const streak = _statsStreak(days);
  // 全部会话的时间戳在这里收一次：折线与下面的里程碑列表共用同一份（同一节里两处各扫一遍必漂）
  const allTs = [];
  for (const cid of Object.keys(data.chats || {})) {
    const ms = (data.chats[cid] && Array.isArray(data.chats[cid].msgs)) ? data.chats[cid].msgs : [];
    for (const m of ms) { const t = _tsOf(m.date, m.time); if (t) allTs.push(t); }
  }
  // 消息类型构成
  const typeNames = { text: '文字', sticker: '表情包 / 图片', cardParts: '多字卡', ask: '问问TA', quote: '引用', recall: '撤回', game: '游戏卡' };
  const maxType = Math.max(1, ...Object.values(typeCnt));
  const typeBars = Object.keys(typeNames).map(k => {
    const n = typeCnt[k];
    const w = n ? Math.round(n / maxType * 100) : 0;
    const pct = total ? Math.round(n / total * 100) : 0;
    return `<div class="stats-bar-row"><span class="stats-bar-label">${typeNames[k]}</span><div class="stats-bar-track"><i style="width:${w}%"></i></div><b>${n}<em>${pct}%</em></b></div>`;
  }).join('');
  // 24 小时活跃分布（并列最热时取最早那一小时：一句里只报一个答案）
  const hourMax = hourCnt.length ? Math.max(...hourCnt) : 0;
  const peakHour = hourCnt.findIndex(v => hourMax > 0 && v === hourMax);
  const hourBars = _statsBarsHTML(hourCnt, {
    labels: ['0', '6', '12', '18', '24'],
    tip: (v, i) => i + ':00 共 ' + v + ' 条',
    peak: '最热闹的是 ' + peakHour + ' 点 · 说了 ' + hourCnt[peakHour] + ' 句'
  });
  // 陪伴天数：主纪念日按统计范围联系人取（专属优先回退通用），无则首条消息；每年重复型没有年份，不计天数
  const _annMain = (typeof annMainFor === 'function') ? annMainFor(statsScope !== 'all' ? statsScope : '') : null;
  const _annDated = (_annMain && !_annMain.yearly) ? _annMain : null;
  let accompany;
  if (_annDated) {
    const d = Math.max(0, Math.floor((Date.now() - new Date(_annDated.date + 'T00:00:00').getTime()) / 86400000));
    const who = _annDated.contactId ? `（和 ${escapeHTML(annContactName(_annDated.contactId))}）` : '';
    accompany = `自${who}纪念日 <b>${d}</b> 天以来，「${escapeHTML(partnerName())}」一直陪在你身边`;
  } else if (first) {
    // 只把 - 换成 /（iOS 老引擎不吃 ISO 串），别再补 T：「2026/09/20T10:00」两个引擎都不认＝Invalid Date，
    // 那一步曾让这一行在屏上印成「NaN 天前起」
    const d = Math.max(0, Math.floor((Date.now() - new Date(String(first).replace(/-/g, '/')).getTime()) / 86400000));
    accompany = `从第一条消息（<b>${escapeHTML(first)}</b>）收录的 <b>${d}</b> 天前起，「${escapeHTML(partnerName())}」被你收进心里了`;
  } else {
    accompany = `还没有聊天记录，去和「${escapeHTML(partnerName())}」聊聊天吧`;
  }
  // 近 7 天（含今天）每天条数：按消息 date 现算，没聊的那天留 0 不藏
  const dayCnt = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString('zh-CN');
    let n = 0; for (const m of msgs) if (m.date === key) n++;
    dayCnt.push({ label: (d.getMonth() + 1) + '/' + d.getDate(), n });
  }
  const weekMax = dayCnt.reduce((mx, x) => Math.max(mx, x.n), 0);
  const peakDay = dayCnt.find(x => x.n === weekMax);
  const weekBars = _statsBarsHTML(dayCnt.map(x => x.n), {
    sm: true,
    labels: dayCnt.map(x => x.label),
    tip: (v, i) => dayCnt[i].label + ' 共 ' + v + ' 条',
    peak: '这七天里 ' + (peakDay ? peakDay.label : '') + ' 说得最多 · ' + (peakDay ? peakDay.n : 0) + ' 条'
  });
  // 一屏一块：三格（选谁一共多少＝每一档都要看的大前提，故常驻）→ 一行 tag → 当前那一档的一张卡。
  // 陪伴那一句归「概览」档（它是一句长文案，不是每档都要读的读数），字卡榜那枚「联系人∶我的」切换归「字卡」档。
  _statsTabLoad();
  const panels = {
    overview: `<div class="stats-sec">
      <div class="stats-accompany">${accompany}</div>
      <div class="stats-hour-label">说得多少</div>
      <div class="stats-lines">
        <div><span>我发送</span><b>${_statsNum(mine)} 条</b></div>
        <div><span>对方发送</span><b>${_statsNum(partner)} 条</b></div>
        <div><span>系统消息</span><b>${_statsNum(sys)} 条</b></div>
        <div><span>平均每天</span><b>${avg} 条</b></div>
        <div><span>最早互动</span><b>${first ? escapeHTML(first) : '—'}</b></div>
        <div><span>最近互动</span><b>${last ? escapeHTML(last) : '—'}</b></div>
      </div>
      <div class="stats-hour-label">说是哪种消息</div>
      <div class="stats-bars">${typeBars}</div>
      <p class="stats-note">共 ${total} 条消息：含 ${typeCnt.sticker} 张表情包/图片、${typeCnt.quote} 次引用、${typeCnt.recall} 条撤回、${typeCnt.ask} 张问问TA卡片、${typeCnt.cardParts} 次多字卡回复、${typeCnt.game} 张游戏卡。</p>
    </div>`,
    hours: `<div class="stats-sec"><div class="stats-hour-label">一天里哪几个钟头说得最多</div>${hourBars}<div class="stats-hour-label">近 7 天每天条数</div>${weekBars}</div>`,
    cards: `<div class="stats-sec">
      <div class="stats-switch" id="statsCardSwitch"><button class="stats-switch-btn" data-side="partner">联系人</button><button class="stats-switch-btn" data-side="me">我的</button></div>
      <div id="statsCardRank"></div>
    </div>`,
    calls: `<div class="stats-sec">${callStatsHTML()}</div>`,
    timeline: `<div class="stats-sec">${_statsTimelineHTML(allTs)}</div>`,
  };
  el.innerHTML = `
    <div class="stats-scope" id="statsScope"></div>
    <div class="stats-grid">
      <div class="stats-tile"><b>${_statsNum(total)}</b><span>消息条数</span></div>
      <div class="stats-tile"><b>${_statsNum(dayCount)}</b><span>聊天天数</span></div>
      <div class="stats-tile"><b>${_statsNum(streak)}</b><span>连续天数</span></div>
    </div>
    <div class="stats-tabs" id="statsTabs">${STATS_TABS.map(t => `<button type="button" class="stats-tab${statsTab === t.k ? ' active' : ''}" data-stats-tab="${t.k}">${t.name}</button>`).join('')}</div>
    <div class="stats-panel" data-tab="${statsTab}">${panels[statsTab]}</div>
  `;
  // tag 那一行只挂一条委托（on* 赋值＝重渲染不叠加监听）；点一枚切一档并重画整页
  const tabsEl = $('#statsTabs');
  if (tabsEl) tabsEl.onclick = e => {
    const b = e.target.closest('.stats-tab'); if (!b) return;
    _statsTabSet(b.dataset.statsTab);
    renderStats();
  };
  // 会话范围芯片：全部 / 每个联系人 / 每个群聊（群标「群」）
  const scopeEl = el.querySelector('#statsScope');
  if (scopeEl) {
    const chips = [{ id: 'all', label: '全部' }]
      .concat((data.contacts || []).map(c => ({ id: c.id, label: (c.kind === 'group' ? '群·' : '') + c.name })));
    scopeEl.innerHTML = chips.map(c => `<button type="button" class="scope-chip${statsScope === c.id ? ' on' : ''}" data-scope="${escapeHTML(c.id)}">${escapeHTML(c.label)}</button>`).join('');
    scopeEl.onclick = function (e) {
      const b = e.target.closest('.scope-chip'); if (!b) return;
      statsScope = b.dataset.scope;
      renderStats();
    };
  }
  // 常用字卡 Top 切换：用 on* 赋值避免重渲染重复绑定
  const sw = $('#statsCardSwitch');
  if (sw) {
    sw.querySelector('[data-side="' + statsCardSide + '"]').classList.add('on');
    sw.onclick = function (e) {
      const b = e.target.closest('.stats-switch-btn'); if (!b) return;
      statsCardSide = b.dataset.side;
      sw.querySelectorAll('.stats-switch-btn').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      buildCardRank(statsCardSide);
    };
  }
  buildCardRank(statsCardSide);
}

// 字卡榜那一切换属于谁（跨重渲染保留）。与 tag 档位是两件事∶档决定「看哪一节」，这一枚决定「那一节里数谁」，
// 所以切档不清它、切它也不换档——两枚各自一处写手，屏上不会互相顶。
let statsCardSide = 'partner';

// 通话记录统计：从 data.calls 汇总，认本页的范围筛选（statsScope）
// 归属靠每条记录的 cid；cid 为空串＝更早那批「那时还没记下是谁」，只在「全部」那一档计入并单列一句，
// 不冒充到任何一位名下（同印象簿 #074 那条口径）。
function callStatsHTML() {
  const all = data.calls || [];
  const calls = statsScope === 'all' ? all : all.filter(c => (c && c.cid) === statsScope);
  const legacy = statsScope === 'all' ? all.filter(c => !c || !c.cid).length : 0;
  const total = calls.length;
  if (!total) return '<p class="stats-note">' + (statsScope === 'all' ? '还没有通话记录。' : '这位还没有通话记录。') + '</p>';
  const cnt = { answer: 0, reject: 0, miss: 0, busy: 0, cancel: 0 };
  let durMs = 0;
  for (const c of calls) { cnt[c.outcome] = (cnt[c.outcome] || 0) + 1; if (c.durationMs) durMs += c.durationMs; }
  const answered = cnt.answer;
  const unconnected = total - answered;
  const min = Math.floor(durMs / 60000), sec = Math.round((durMs % 60000) / 1000);
  const durStr = min + ':' + String(sec).padStart(2, '0');
  const parts = [];
  parts.push(`接通 ${answered} 通`);
  parts.push(`未接 ${cnt.miss} 通`);
  parts.push(`忙线 ${cnt.busy} 通`);
  parts.push(`拒绝 ${cnt.reject} 通`);
  if (cnt.cancel) parts.push(`取消 ${cnt.cancel} 通`);
  return `
    <div class="stats-grid">
      <div class="stats-tile"><b>${_statsNum(total)}</b><span>总通话</span></div>
      <div class="stats-tile"><b>${_statsNum(answered)}</b><span>已接通</span></div>
      <div class="stats-tile"><b>${durStr}</b><span>累计时长</span></div>
    </div>
    <p class="stats-note">未接通 ${unconnected} 通。共 ${total} 通：${parts.join('、')}。${legacy ? '另有更早的 ' + legacy + ' 通 · 那时还没记下是谁。' : ''}</p>`;
}

// 排行榜那一节（两个统计页共用一份画法，不留第二套 markup）。
// rows＝[[句子,次数]]（调用方按次数排好、最多前 50 条）∶libTag＝句子 → 库里的分类名（比不到＝虚线框「历史」）。
// 默认只画前 10 行，其余收进一枚「展开其余 N 张」——50 行会把下面几节整个挤出视口（本仓量过那一族）。
// moreNote＝名额截断后补的那一句实话（不给就不写）。
function _statsRankFill(el, rows, libTag, moreNote) {
  const maxN = Math.max(1, rows.length ? rows[0][1] : 1);
  const totalN = rows.reduce((s, [, n]) => s + n, 0);
  const rankTop = 10;
  el.innerHTML = rows.map(([k, n], i) => {
    const cat = libTag[k];
    const w = Math.max(1, Math.round(n / maxN * 100));
    const pct = totalN ? Math.round(n / totalN * 100) : 0;
    const tag = cat ? `<span class="ck-tag">${escapeHTML(cat)}</span>` : '<span class="ck-tag hist">历史</span>';
    const row = `<div class="ck-row"${i < rankTop ? '' : ' hidden'}><span class="ck-rk">${i + 1}</span><div class="ck-head">${tag}<b class="ck-text">${escapeHTML(k)}</b></div><div class="ck-track"><i style="width:${w}%"></i></div><em class="ck-cnt">${n}<i>${pct}%</i></em></div>`;
    if (i === rankTop - 1 && rows.length > rankTop) {
      return row + `<button type="button" class="stats-more" data-rank-more>展开其余 ${rows.length - rankTop} 张</button>`;
    }
    return row;
  }).join('') + (moreNote || '');
  const more = el.querySelector('[data-rank-more]');
  if (more) more.onclick = () => {
    el.querySelectorAll('.ck-row[hidden]').forEach(r => { r.hidden = false; });
    more.remove();
  };
}

// 常用字卡 Top：统计 我的/联系人 双方各自使用的字卡频率，尝试匹配当前字卡库标注分类
function buildCardRank(side) {
  const el = $('#statsCardRank'); if (!el) return;
  const who = side === 'me' ? '我的' : '联系人';
  // 建立字卡库索引：content -> 分类名（与写信统计共用一把尺，见 utils.js 的 cardLibIndex）
  const lib = cardLibIndex();
  const freq = {};
  for (const m of _statsScopeMsgs()) {
    if (!m || m.from !== side) continue;
    if (m.sticker) continue; // 表情包/图片不纳入字卡频率
    // 双方：文字消息（含多字卡片段）都计入字卡频率，别名/自由打字也算
    let frags = [];
    if (Array.isArray(m.cardParts) && m.cardParts.length) frags = m.cardParts;
    else if (m.text) frags = [m.text];
    else continue;
    for (const f of frags) {
      const k = String(f).trim();
      if (k) freq[k] = (freq[k] || 0) + 1;
    }
  }
  const rows = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 50);
  if (!rows.length) { el.innerHTML = `<div class="stats-empty">「${who}」还没有字卡记录</div>`; return; }
  const kinds = Object.keys(freq).length;
  _statsRankFill(el, rows, lib, kinds > rows.length ? `<div class="stats-empty">仅显示前 ${rows.length} 张，共 ${kinds} 种</div>` : '');
}


// ===== 时光线：把散落各处的「第一次 / 里程碑」聚合成一条时间线（自动从现有数据挖掘，不新增存储） =====
function _tsOf(dateStr, timeStr) {
  const t = new Date(`${dateStr || ''} ${timeStr || ''}`).getTime();
  return isFinite(t) ? t : 0;
}
function _statsTimelineHTML(tsList) {
  const items = [];   // {ts, label, detail}
  const push = (ts, label, detail) => { if (ts) items.push({ ts, label, detail: detail || '' }); };
  // 第一次对话 + 相伴天数 + 句数
  let firstMsg = 0, totalMsgs = 0;
  for (const cid of Object.keys(data.chats || {})) {
    const ms = (data.chats[cid] && Array.isArray(data.chats[cid].msgs)) ? data.chats[cid].msgs : [];
    totalMsgs += ms.length;
  }
  (tsList || []).forEach(t => { if (t && (!firstMsg || t < firstMsg)) firstMsg = t; });
  if (firstMsg) {
    const d = new Date(firstMsg);
    push(firstMsg, '第一次对话', `${d.getFullYear()} 年 ${d.getMonth() + 1} 月的一切从这里开始`);
  }
  // 第一次通话
  let firstCall = null;
  for (const c of (data.calls || [])) { const t = _tsOf(c.date, c.time || '00:00:00'); if (t && (!firstCall || t < firstCall.ts)) firstCall = { ts: t, c }; }
  if (firstCall) push(firstCall.ts, '第一次通话', (firstCall.c.duration || '00:00') + ' · ' + (firstCall.c.date || ''));
  // 第一封来信 / 第一封寄出的信
  let firstRecv = null, firstSent = null;
  for (const m of (data.receivedLetters || [])) {
    const t = _tsOf(m.postmark, m.time || '12:00:00');
    if (t && (!firstRecv || t < firstRecv.ts)) firstRecv = { ts: t, m };
  }
  for (const m of (data.sentLetters || [])) {
    const t = _tsOf(m.postmark, m.time || '12:00:00');
    if (t && (!firstSent || t < firstSent.ts)) firstSent = { ts: t, m };
  }
  if (firstRecv) push(firstRecv.ts, '收到第一封来信', (firstRecv.m.text || '').slice(0, 24) + '…');
  if (firstSent) push(firstSent.ts, '寄出第一封信', (firstSent.m.text || '').slice(0, 24) + '…');
  // 第一次收藏 / TA 第一次收藏
  let firstFav = null, firstTaFav = null;
  try {
    for (const cid of Object.keys(data.chats || {})) {
      for (const f of JSON.parse(localStorage.getItem('collect-msgs:' + cid) || '[]')) {
        if (!f || !f.ts) continue;
        if ((f.by || 'me') === 'ta') { if (!firstTaFav || f.ts < firstTaFav.ts) firstTaFav = f; }
        if (!firstFav || f.ts < firstFav.ts) firstFav = f;
      }
    }
  } catch (e) {}
  if (firstFav) { const d = new Date(firstFav.ts); push(firstFav.ts, '第一次收藏', `「${(firstFav.text || '').slice(0, 18)}」`); }
  if (firstTaFav) { const d = new Date(firstTaFav.ts); push(firstTaFav.ts, partnerName() + ' 第一次收藏你的话', `「${(firstTaFav.text || '').slice(0, 18)}」`); }
  // 第一个心愿 / 第一个实现的心愿
  let firstWish = null, firstDone = null;
  for (const w of (data.wishlist || [])) {
    if (w.ts && (!firstWish || w.ts < firstWish.ts)) firstWish = w;
    if (w.done && w.doneTs && (!firstDone || w.doneTs < firstDone.ts)) firstDone = w;
  }
  if (firstWish) push(firstWish.ts, '第一个心愿', `「${(firstWish.t || '').slice(0, 18)}」`);
  if (firstDone) push(firstDone.ts, '第一个实现的心愿', `「${(firstDone.t || '').slice(0, 18)}」`);
  // 第一次靠近 / 第一个梦 / 第一次里程碑语
  let firstNear = null, firstDream = null;
  for (const cid of Object.keys((data.cjian || {}).by || {})) {
    for (const e of ((data.cjian.by[cid] || {}).hist || [])) {
      if (e.k === 'n' && (!firstNear || e.ts < firstNear.ts)) firstNear = e;
      if (e.k === 'd' && (!firstDream || e.ts < firstDream.ts)) firstDream = e;
    }
  }
  if (firstNear) push(firstNear.ts, '第一次「好像有什么靠近了」', '');
  if (firstDream) push(firstDream.ts, '第一个梦', `「${(firstDream.t || '').slice(0, 18)}」`);
  // 句数里程碑（当前已达的档位，时间未知 → 放「此刻」区）
  const MSG_MILE = [100, 500, 1000, 2000, 5000];
  const reached = MSG_MILE.filter(n => totalMsgs >= n);
  // 纪念日（每年重复型没有固定年份，落到今年的那个日子并标注「每年」）
  for (const a of (data.anniversaries || [])) {
    if (!a || !a.date) continue;
    let t, detail = a.date;
    if (a.yearly) {
      const p = a.date.split('-');
      const now = new Date();
      t = new Date(now.getFullYear(), +p[0] - 1, +p[1]).getTime();
      detail = '每年 ' + (+p[0]) + '.' + (+p[1]);
    } else {
      t = new Date(a.date + 'T00:00:00').getTime();
    }
    if (t) push(t, '纪念日 · ' + (a.name || '那一天'), detail);
  }
  items.sort((a, b) => a.ts - b.ts);
  const fmt = ts => { const d = new Date(ts); return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`; };
  const days = firstMsg ? Math.floor((Date.now() - firstMsg) / 86400000) + 1 : 0;
  let html = _statsTrendHTML(tsList || []) + `<div class="tl-head">相伴第 <b>${days}</b> 天 · 说过 <b>${totalMsgs}</b> 句${reached.length ? ' · 已跨过 ' + reached.join('/') + ' 句' : ''}</div>`;
  if (!items.length) return html + '<div class="tl-empty">时间线会随着你们的记录慢慢长出来</div>';
  html += '<div class="stats-tl">' + items.map(it => `<div class="tl-item"><span class="tl-dot"></span><div class="tl-main"><div class="tl-date">${fmt(it.ts)}</div><div class="tl-label">${it.label}</div>${it.detail ? `<div class="tl-detail">${escapeHTML(it.detail)}</div>` : ''}</div></div>`).join('') + '</div>';
  return html;
}
