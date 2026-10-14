// ===== 纪念日 =====
// 多条纪念日/倒数日。**contactId 就是「绑定给谁」**，是这条纪念日唯一的联系人维度（2026-10-08
// 拆掉原 chatAnniv 那套「会话显示」：两套并排的绑定语义撞车，且投递压根不读它）。
// 屏上承诺＝实际行为，三处口径必须一致：
//①分隔条天数：归属主纪念日 → 通用主纪念日（annMainFor）；②TA 主动提起：只发到 contactId 那个会话，
//   contactId 为空就没人来说（annWishTick）；③屏上每行 .ann-extra-talk 把「谁·哪天·多少概率」写出来。
// main:true 为该归属的主纪念日（每个归属至多一条）。
// yearly:true 为每年重复型（生日等不知道年份的），date 只存 'MM-DD'；普通型 date 存 'YYYY-MM-DD'。
// wish/wishProb 控制 TA 会不会主动提起这条（前几天预告/当天祝福/里程碑前夜），wishProb 概率掷一次定当天。
// 月历选日期不依赖原生 date 控件（机型差异大）；未来日期自动按倒数日、当天「就是今天」、过去日期自动累计天数

// TA 开口的时机表（annWishTick 与屏上文案共用这一份，不各写一套）
const ANN_HEADUP = [7, 3, 1];   // 倒数第几天预告
const ANN_MILE = [100, 200, 300, 365, 400, 520, 600, 700, 777, 800, 900, 1000, 1314, 2000, 3000, 4000, 5000, 10000];   // 相伴天数里程碑（前夜提）

function _annPad2(n) { return n < 10 ? '0' + n : '' + n; }
function _annToday() { const d = new Date(); return d.getFullYear() + '-' + _annPad2(d.getMonth() + 1) + '-' + _annPad2(d.getDate()); }
// 日期收口：只接受 YYYY-MM-DD（容忍无连字符与点/斜杠形态），非法返回 ''
function _annNormDate(v) {
  const s = String(v == null ? '' : v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (!m) m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (!m) m = /^(\d{4})[./](\d{1,2})[./](\d{1,2})$/.exec(s);
  if (!m) return '';
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1900 || y > 2999 || mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return '';
  return y + '-' + _annPad2(mo) + '-' + _annPad2(d);
}
// 月日收口：只接受 MM-DD（容忍无连字符与点/斜杠形态），非法返回 ''（每年重复型用；按闰年样本验 2/29）
function _annNormMD(v) {
  const s = String(v == null ? '' : v).trim();
  let m = /^(\d{1,2})-(\d{1,2})$/.exec(s);
  if (!m) m = /^(\d{2})(\d{2})$/.exec(s);
  if (!m) m = /^(\d{1,2})[./](\d{1,2})$/.exec(s);
  if (!m) return '';
  const mo = +m[1], d = +m[2];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  const dt = new Date(2024, mo - 1, d);
  if (dt.getMonth() !== mo - 1 || dt.getDate() !== d) return '';
  return _annPad2(mo) + '-' + _annPad2(d);
}
function _annToday0() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
// 相伴天数：与聊天「今天」分隔条同口径（当天=第 1 天）。只用于带年份的普通型
function _annDays(since) {
  const d = new Date(since + 'T00:00:00');
  return Math.max(1, Math.round((_annToday0() - d) / 864e5));
}
// 下一个周年纪念日（同月同日）：{ cd 距今天数(0=就是今天), date }；start 传 YYYY-MM-DD 或每年重复型 MM-DD 均可
function _annNext(start) {
  const p = String(start).split('-');
  const mo = +p[p.length - 2], d = +p[p.length - 1];
  const ann = new Date(new Date().getFullYear(), mo - 1, d);
  if (ann.getTime() < _annToday0().getTime()) ann.setFullYear(ann.getFullYear() + 1);
  return { cd: Math.round((ann - _annToday0()) / 864e5), date: ann };
}

function annList() { return Array.isArray(data.anniversaries) ? data.anniversaries : []; }
// 归属显示名：''=通用；联系人已删除时给兜底文案
function annContactName(cid) {
  if (!cid) return '通用';
  const c = (data.contacts || []).find(x => x.id === cid);
  return fixedNameOf(c) || '已删除的联系人';
}
// 某联系人的主纪念日：专属优先，回退通用；无则 null（聊天分隔条/统计共用）
function annMainFor(cid) {
  const l = annList();
  return l.find(a => a.main && a.contactId === cid) || l.find(a => a.main && !a.contactId) || null;
}
// 删除联系人后调用：其专属纪念日退回通用；退回产生多个通用主纪念日时只保留第一条
function annReleaseContact(cid) {
  let hit = false;
  annList().forEach(a => { if (a.contactId === cid) { a.contactId = ''; hit = true; } });
  if (hit) {
    let firstMain = true;
    annList().forEach(a => {
      if (a.main && !a.contactId) { if (firstMain) firstMain = false; else a.main = false; }
    });
  }
  return hit;
}

function renderAnniversary() {
  const hero = $('#annHero');
  if (!hero) return;
  const cid = (typeof currentContact === 'function' && (currentContact() || {}).id) || '';
  const main = annMainFor(cid);
  if (!main) {
    hero.innerHTML = '<div class="ann-hero-empty">还没有主纪念日<small>点「＋ 添加」，绑定一位联系人后 TA 就会按你设的概率在特定日子里到聊天里提起这件事；勾「设为主纪念日」还会让聊天首页显示你们的天数</small></div>';
  } else if (main.yearly) {
    const next = _annNext(main.date);
    const who = main.contactId ? `和 ${escapeHTML(annContactName(main.contactId))}` : '通用 · 所有聊天都会显示';
    const nextHtml = next.cd === 0
      ? '<span class="ann-hero-next today">今天就是纪念日</span>'
      : `<span class="ann-hero-next">下次纪念日 还有 ${next.cd} 天 · ${next.date.getMonth() + 1} 月 ${next.date.getDate()} 日</span>`;
    // 这一支的数是「距下次纪念日还有几天」＝倒计时，不是序数，所以**不挂** ordSup（挂上去是假话）
    hero.innerHTML = `<div class="ann-hero-name">${escapeHTML(main.name || '纪念日')}</div><div class="ann-hero-days">${next.cd}<em>天</em></div><div class="ann-hero-date">每年 ${next.date.getMonth() + 1} 月 ${next.date.getDate()} 日 · ${who}</div>${nextHtml}`;
  } else {
    const next = _annNext(main.date);
    const who = main.contactId ? `和 ${escapeHTML(annContactName(main.contactId))}` : '通用 · 所有聊天都会显示';
    const nextHtml = next.cd === 0
      ? '<span class="ann-hero-next today">今天就是纪念日</span>'
      : `<span class="ann-hero-next">下次纪念日 还有 ${next.cd} 天 · ${next.date.getMonth() + 1} 月 ${next.date.getDate()} 日</span>`;
    // 站内唯一一枚「独立成块且语义真是序数」的大数字：相伴第 N 天（BUGS #225）
    hero.innerHTML = `<div class="ann-hero-name">${escapeHTML(main.name || '纪念日')}</div><div class="ann-hero-days">${ordSup(_annDays(main.date))}<em>天</em></div><div class="ann-hero-date">${main.date.split('-').join('.')} 起 · ${who}</div>${nextHtml}`;
  }
  renderAnnExtras();
}

function renderAnnExtras() {
  const list = $('#annExtraList');
  if (!list) return;
  // 排序键：每年重复型取下次到来的时刻（永远在未来组）；普通型取日期本身
  const tsOf = it => it.yearly ? _annNext(it.date).date.getTime() : new Date(it.date + 'T00:00:00').getTime();
  const items = annList().slice().sort((a, b) => {
    const ta = tsOf(a), tb = tsOf(b);
    const t = _annToday0().getTime();
    const ga = ta >= t ? 0 : 1, gb = tb >= t ? 0 : 1;
    if (ga !== gb) return ga - gb;
    return ta - tb; // 未来：近的在前；过去：近的也在前
  });
  if (!items.length) {
    list.innerHTML = '<div class="ann-empty">还没有添加。点下方按钮记一个日子，<b>绑定一位联系人</b>后 TA 就会按你设的概率，在那几天里到聊天里跟你说这件事</div>';
    return;
  }
  const t0 = _annToday0().getTime();
  const tStr = _annToday();
  const tMD = tStr.slice(5), tY = +tStr.slice(0, 4);
  list.innerHTML = items.map(it => {
    let cls = '', label, dateStr;
    if (it.yearly) {
      const p = it.date.split('-');
      dateStr = '每年 ' + (+p[0]) + '.' + (+p[1]);
      const cd = _annNext(it.date).cd;
      if (cd === 0) { cls = ' today'; label = '就是今天'; }
      else { cls = ' count'; label = '还有 ' + cd + ' 天'; }
    } else {
      dateStr = it.date.split('-').join('.');
      const diff = Math.round((new Date(it.date + 'T00:00:00').getTime() - t0) / 864e5);
      if (diff > 0) { cls = ' count'; label = '还有 ' + diff + ' 天'; }
      else if (diff === 0) { cls = ' today'; label = '就是今天'; }
      else if (it.date.slice(5) === tMD) { cls = ' today'; label = `今天 ${tY - +it.date.slice(0, 4)} 周年`; }
      else label = '已 ' + (-diff) + ' 天';
    }
    const who = it.contactId ? ` · 和 ${escapeHTML(annContactName(it.contactId))}` : '';
    const mainTag = it.main ? '<i class="ann-extra-main">主</i>' : '';
    // 「谁加的」标出来（2026-10-11 BUGS #271）：TA 自己建的那条若与用户手动加的都长得一样，用户只会以为程序乱改他的册子
    const byTag = it.by === 'ta' ? '<i class="ann-extra-by">TA 加的</i>' : '';
    // TA 主动提起这件事必须写在每条上（2026-10-08 用户报「纪念日功能莫名其妙」）：
    // 以前只有归属人，屏上读不出「谁会开口、哪几天开口、开口概率多少」，配完像没生效
    const wc = annWishChance(it);
    const whens = annWishWhen(it);
    let talkHtml;
    if (!wc.on) {
      talkHtml = '<div class="ann-extra-talk off">TA 不会提起这条</div>';
    } else if (!it.contactId) {
      talkHtml = '<div class="ann-extra-talk warn">没绑定联系人，TA 不会在某个聊天里提起</div>';
    } else {
      const whenTxt = whens.length ? whens.map(w => w.when).join(' / ') : '当天';
      talkHtml = `<div class="ann-extra-talk">${escapeHTML(annContactName(it.contactId))} 会在 ${escapeHTML(whenTxt)} 提起 · ${wc.prob}%</div>`;
    }
    return `<div class="ann-extra" data-id="${escapeHTML(it.id)}"><div class="ann-extra-info"><div class="ann-extra-name">${mainTag}${byTag}${escapeHTML(it.name)}</div><div class="ann-extra-date">${dateStr}${who}</div>${talkHtml}</div><span class="ann-extra-days${cls}">${label}</span><button class="ann-extra-del" data-id="${escapeHTML(it.id)}" aria-label="删除">×</button></div>`;
  }).join('');
}

// 主纪念日增删改后刷新聊天「今天」分隔条的天数文案
function _annRefreshChat() {
  if (typeof resetMessageRender === 'function') { resetMessageRender(); renderMessages(); }
}

// 这条纪念日 TA 会不会开口、开口概率多少（屏上与编辑器共用同一份口径，不各算一套）
function annWishChance(a) {
  if (!a || a.wish === false) return { on: false, prob: 0 };
  const p = (typeof a.wishProb === 'number') ? Math.max(0, Math.min(100, a.wishProb)) : 100;
  return { on: p > 0, prob: p };
}
// TA 会开口的时机（用户要的「什么时间内」）：当天祝福 / 前 7·3·1 天预告 / 相伴天数里程碑前夜。
// 屏上把这些日子直接印出来，别让用户猜；返回如「10 月 1 日 · 80%」的短句数组。
function annWishWhen(a) {
  if (!a) return [];
  const p = String(a.date || '').split('-');
  const mo = +p[p.length - 2], d = +p[p.length - 1];
  if (!mo || !d) return [];
  const out = [];
  const md = (m, dd) => (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd;
  // ① 当天（含每年重复型；普通型当天=就是今天）
  out.push({ when: '当天', date: md(mo, d) });
  // ② 前 7·3·1 天预告（只取还没过去的那几个）
  ANN_HEADUP.forEach(cd => {
    const t = new Date(_annToday0().getTime() + cd * 864e5);
    if (t.getMonth() + 1 === mo && t.getDate() === d) out.push({ when: cd === 1 ? '前一天' : '前 ' + cd + ' 天', date: md(mo, d) });
  });
  // ③ 相伴天数里程碑前夜（只有带年份的普通型数得出来）
  if (!a.yearly && /^\d{4}-/.test(a.date)) {
    const tomorrow = _annDays(a.date) + 1;
    if (ANN_MILE.includes(tomorrow)) out.push({ when: '满 ' + tomorrow + ' 天前夜', date: md(mo, d) });
  }
  return out;
}

// ===== 月历共用件 =====
const _ANN_CAL_NAV =
  '<div class="ann-cal-nav">' +
  '<button class="ann-cal-btn" data-nav="-12" title="上一年"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11 17l-5-5 5-5"/><path d="M18 17l-5-5 5-5"/></svg></button>' +
  '<button class="ann-cal-btn" data-nav="-1" title="上个月"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>' +
  '<span class="ann-cal-title"></span>' +
  '<button class="ann-cal-btn" data-nav="1" title="下个月"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></button>' +
  '<button class="ann-cal-btn" data-nav="12" title="下一年"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13 7l5 5-5 5"/><path d="M6 7l5 5-5 5"/></svg></button>' +
  '</div>';
// 12 枚月份直达（2026-10-11 BUGS #271）：只跳月、不动年——从 1 月走到 12 月原先要连点 11 次「下个月」
const _ANN_CAL_MONTHS =
  '<div class="ann-cal-months">' +
  Array.from({ length: 12 }, (_, i) => `<button type="button" class="ann-cal-m" data-m="${i}">${i + 1}月</button>`).join('') +
  '</div>';

// 画一个月（ym 就地归一化；sel 打选中态、今天打点；marks 标注已有纪念日——full=普通型全集 YYYY-MM-DD、
// md=每年重复型全集 MM-DD、nameFull/nameMd=对应日期→名称数组用于 title 提示；matchMd 传 MM-DD 时按月日匹配选中态=每年重复型）
function _annCalPaint(panel, ym, sel, marks, matchMd) {
  while (ym.m < 0) { ym.m += 12; ym.y--; }
  while (ym.m > 11) { ym.m -= 12; ym.y++; }
  const title = panel.querySelector('.ann-cal-title');
  const grid = panel.querySelector('.ann-cal-grid');
  if (!title || !grid) return;
  title.textContent = ym.y + ' 年 ' + (ym.m + 1) + ' 月';
  // 月份直达的高亮跟着 ym 走（重绘即同步，不在点击处另写一遍选中态）
  panel.querySelectorAll('.ann-cal-m').forEach(b => b.classList.toggle('on', +b.dataset.m === ym.m));
  const days = new Date(ym.y, ym.m + 1, 0).getDate();
  const startWd = new Date(ym.y, ym.m, 1).getDay();
  const t = _annToday();
  let html = ['日', '一', '二', '三', '四', '五', '六'].map(w => `<span class="ann-cal-wd">${w}</span>`).join('');
  for (let i = 0; i < startWd; i++) html += '<span class="ann-cal-cell blank"></span>';
  for (let d = 1; d <= days; d++) {
    const ds = ym.y + '-' + _annPad2(ym.m + 1) + '-' + _annPad2(d);
    const selCls = (ds === sel || (matchMd && ds.slice(5) === matchMd)) ? ' sel' : '';
    let names = null;
    if (marks && (marks.full.has(ds) || marks.md.has(ds.slice(5)))) {
      names = ((marks.nameFull && marks.nameFull.get(ds)) || []).concat((marks.nameMd && marks.nameMd.get(ds.slice(5))) || []).join('、');
    }
    html += `<span class="ann-cal-cell${ds === t ? ' today' : ''}${selCls}${names ? ' mark' : ''}" data-d="${ds}"${names ? ` title="${escapeHTML('这天已有：' + names)}"` : ''}>${d}</span>`;
  }
  grid.innerHTML = html;
}
function _annCalNavBind(panel, ym, repaint) {
  panel.querySelectorAll('.ann-cal-btn').forEach(b => b.addEventListener('click', () => {
    ym.m += parseInt(b.dataset.nav, 10) || 0;
    repaint();
  }));
}
function _annCalMonthBind(panel, ym, repaint) {
  const row = panel.querySelector('.ann-cal-months');
  if (!row) return;
  row.addEventListener('click', e => {
    const b = e.target.closest('.ann-cal-m');
    if (!b) return;
    const m = parseInt(b.dataset.m, 10);
    if (!(m >= 0 && m <= 11)) return;
    ym.m = m;
    repaint();
  });
}

function _annCalGridBind(panel, ym, sel, repaint) {
  panel.querySelector('.ann-cal-grid').addEventListener('click', e => {
    const cell = e.target.closest('.ann-cal-cell[data-d]');
    if (!cell) return;
    sel.v = cell.dataset.d;
    (repaint || (() => _annCalPaint(panel, ym, sel.v)))();
  });
}

// ===== 添加 / 编辑纪念日弹层（名称 + 类型 + 归属联系人选择 + 月历 + 主纪念日 + TA提起开关与概率） =====
let _annEditorMask = null;
let _annPickMask = null;
// entry=null 添加（归属默认「通用」，点字段弹列表再选联系人）；否则编辑该条
function openAnnEditor(entry) {
  const contacts = data.contacts || [];
  // 每年重复型存档只有 MM-DD：借当前年份补全成完整日期喂给月历
  let d0 = '';
  if (entry) d0 = entry.yearly ? (_annToday().slice(0, 4) + '-' + (_annNormMD(entry.date) || '01-01')) : _annNormDate(entry.date);
  const st = {
    id: entry ? entry.id : null,
    date: d0 || _annToday(),
    cid: entry ? (entry.contactId || '') : '',
    yearly: entry ? !!entry.yearly : false,
    wish: entry ? entry.wish !== false : true,
    wishProb: (entry && typeof entry.wishProb === 'number' && entry.wishProb >= 0 && entry.wishProb <= 100) ? entry.wishProb : 100,
  };
  if (!contacts.some(c => c.id === st.cid)) st.cid = '';
  const p = st.date.split('-');
  const ym = { y: +p[0], m: +p[1] - 1 };
  const sel = { v: st.date };
  // 已有纪念日标注到月历上（普通型标到具体年，每年重复型年年都标），悬停/长按可见名称
  const marks = { full: new Set(), md: new Set(), nameFull: new Map(), nameMd: new Map() };
  annList().forEach(a => {
    if (!a || !a.date || a.id === st.id) return;
    if (a.yearly) {
      marks.md.add(a.date);
      const arr = marks.nameMd.get(a.date) || []; arr.push(a.name || '纪念日'); marks.nameMd.set(a.date, arr);
    } else {
      marks.full.add(a.date);
      const arr = marks.nameFull.get(a.date) || []; arr.push(a.name || '纪念日'); marks.nameFull.set(a.date, arr);
    }
  });
  if (_annEditorMask) _annEditorMask.remove();
  if (_annPickMask) { _annPickMask.remove(); _annPickMask = null; }
  const mask = document.createElement('div');
  mask.className = 'ann-mask';
  mask.innerHTML =
    '<div class="ann-panel">' +
    `<div class="ann-panel-head"><span class="ann-panel-title">${entry ? '编辑纪念日' : '添加纪念日 / 倒数日'}</span><button class="ann-panel-close">×</button></div>` +
    '<input id="annEdName" class="ann-name-input" maxlength="16" placeholder="名称（如：在一起 / 生日 / 见面倒数）">' +
    '<div class="ann-type-row"><button type="button" class="ann-type-chip" data-t="full">普通日期</button><button type="button" class="ann-type-chip" data-t="yearly">每年重复（生日等）</button></div>' +
    '<button type="button" class="ann-cid-pick" id="annEdCidPick"><span class="ann-cid-pick-label">绑定联系人</span><span class="ann-cid-pick-val" id="annEdCidVal"></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></button>' +
    _ANN_CAL_NAV +
    _ANN_CAL_MONTHS +
    '<div class="ann-cal-grid"></div>' +
    '<label class="ann-main-row"><input type="checkbox" id="annEdMain"><span>设为主纪念日 · 聊天首页「今天」会显示天数</span></label>' +
    '<label class="ann-main-row"><input type="checkbox" id="annEdWish"><span>让 TA 到聊天里主动提起这件事</span></label>' +
    '<div class="ann-prob-row" id="annProbRow"><span class="ann-prob-label">提起概率</span>' +
    [100, 80, 60, 40, 20].map(v => `<button type="button" class="ann-prob-chip" data-p="${v}">${v}%</button>`).join('') +
    '</div>' +
    '<div class="ann-talk-when" id="annTalkWhen"></div>' +
    '<p class="ann-type-hint"></p>' +
    '<div class="ann-panel-foot"><button class="soft-btn ann-cancel">取消</button><button class="soft-btn ann-ok">保存</button></div>' +
    '</div>';
  (document.querySelector('.app-shell') || document.body).appendChild(mask);
  const close = () => { mask.hidden = true; if (_annPickMask) { _annPickMask.remove(); _annPickMask = null; } };
  mask.querySelector('.ann-panel-close').addEventListener('click', close);
  mask.querySelector('.ann-cancel').addEventListener('click', close);
  mask.addEventListener('click', e => { if (e.target === mask) close(); });
  const paintCid = () => {
    const c = contacts.find(x => x.id === st.cid);
    mask.querySelector('#annEdCidVal').textContent = c ? (c.chatName || c.name) + (c.kind === 'group' ? ' · 群' : '') : '不绑定';
    paintTalk();
  };
  mask.querySelector('#annEdCidPick').addEventListener('click', () => {
    openAnnCidPick(st.cid, id => { st.cid = id; paintCid(); });
  });
  // 「TA 会在哪几天、说什么样的话」写死给用户看：概率掷骰是黑盒，不写出来他只能猜配没配生效
  const paintTalk = () => {
    const box = mask.querySelector('#annTalkWhen');
    if (!box) return;
    if (!st.wish) { box.textContent = '关着：TA 完全不会提起这件事'; box.className = 'ann-talk-when off'; return; }
    const c = contacts.find(x => x.id === st.cid);
    if (!c) { box.textContent = '还没绑定联系人 —— 这样 TA 不会到聊天里提起这件事（通用纪念日只记日期）'; box.className = 'ann-talk-when warn'; return; }
    const whenTxt = annWishWhen({ date: st.yearly ? st.date.slice(5) : st.date, yearly: st.yearly })
      .map(w => w.when).join(' / ') || '当天';
    box.textContent = `${c.chatName || c.name} 会在 ${whenTxt} 以 ${st.wishProb}% 的概率 跟你提起这件事`;
    box.className = 'ann-talk-when';
  };
  paintCid();
  const repaintCal = () => { _annCalPaint(mask, ym, sel.v, marks, st.yearly ? sel.v.slice(5) : ''); paintTalk(); };
  const paintType = () => {
    mask.querySelectorAll('.ann-type-chip').forEach(b => b.classList.toggle('on', (b.dataset.t === 'yearly') === st.yearly));
    mask.querySelector('.ann-type-hint').textContent = st.yearly ? '每年重复：只记 月/日，到点自动倒数' : '未来日期自动倒数，过去日期自动累计';
    repaintCal();
  };
  mask.querySelector('.ann-type-row').addEventListener('click', e => {
    const b = e.target.closest('.ann-type-chip');
    if (!b) return;
    st.yearly = b.dataset.t === 'yearly';
    paintType();
  });
  const paintWish = () => {
    mask.querySelector('#annEdWish').checked = st.wish;
    mask.querySelector('#annProbRow').hidden = !st.wish;
    mask.querySelectorAll('.ann-prob-chip').forEach(b => b.classList.toggle('on', +b.dataset.p === st.wishProb));
    paintTalk();
  };
  mask.querySelector('#annEdWish').addEventListener('change', e => { st.wish = e.target.checked; paintWish(); });
  mask.querySelector('#annProbRow').addEventListener('click', e => {
    const b = e.target.closest('.ann-prob-chip');
    if (!b) return;
    st.wishProb = +b.dataset.p || 100;
    paintWish();
  });
  // 编辑态回显名称与两个勾选
  mask.querySelector('#annEdName').value = entry ? (entry.name || '') : '';
  mask.querySelector('#annEdMain').checked = entry ? !!entry.main : false;
  _annCalNavBind(mask, ym, repaintCal);
  _annCalMonthBind(mask, ym, repaintCal);
  _annCalGridBind(mask, ym, sel, repaintCal);
  paintType();
  paintWish();
  mask.querySelector('.ann-ok').addEventListener('click', () => {
    const nameInput = mask.querySelector('#annEdName');
    const name = (nameInput.value || '').trim();
    if (!name) { nameInput.focus(); showToast('请填写名称'); return; }
    const dsFull = _annNormDate(sel.v);
    const dsMd = _annNormMD(sel.v.slice(5));
    if (st.yearly ? !dsMd : !dsFull) { showToast('请选择日期'); return; }
    const wantMain = mask.querySelector('#annEdMain').checked;
    const cid = contacts.some(c => c.id === st.cid) ? st.cid : '';
    if (!Array.isArray(data.anniversaries)) data.anniversaries = [];
    let rec = st.id ? annList().find(a => a.id === st.id) : null;
    if (!rec) { rec = { id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }; data.anniversaries.push(rec); }
    rec.name = name; rec.date = st.yearly ? dsMd : dsFull; rec.yearly = st.yearly;
    rec.contactId = cid; rec.main = wantMain;
    rec.wish = st.wish; rec.wishProb = st.wishProb;
    // 主纪念日唯一性：同归属下只保留本条
    if (wantMain) annList().forEach(a => { if (a !== rec && a.main && a.contactId === cid) a.main = false; });
    save();
    _annEditorMask.hidden = true;
    renderAnniversary();
    if (wantMain || rec.main) _annRefreshChat();
    showToast(entry ? '已保存' : '已添加');
  });
  _annEditorMask = mask;
  mask.hidden = false;
  if (!entry) setTimeout(() => { const i = mask.querySelector('#annEdName'); if (i) i.focus(); }, 80);
}

// 归属联系人选择列表：通用 + 各联系人，小字显示该归属现有主纪念日（防重复设主）
function openAnnCidPick(cur, onPick) {
  const contacts = data.contacts || [];
  const mainNameOf = cid => {
    const m = annList().find(a => a.main && (a.contactId || '') === cid);
    return m ? '现有主纪念日「' + (m.name || '纪念日') + '」' : '还没有主纪念日';
  };
  if (_annPickMask) { _annPickMask.remove(); _annPickMask = null; }
  const mask = document.createElement('div');
  mask.className = 'ann-mask';
  mask.innerHTML =
    '<div class="ann-panel">' +
    '<div class="ann-panel-head"><span class="ann-panel-title">绑定给谁 · 谁来说这件事</span><button class="ann-panel-close">×</button></div>' +
    '<div class="ann-bind-list">' +
    `<button type="button" class="ann-bind-opt${cur ? '' : ' on'}" data-cid="">不绑定（只记日期）<i>TA 不会到聊天里提起这件事</i></button>` +
    contacts.map(c => `<button type="button" class="ann-bind-opt${cur === c.id ? ' on' : ''}" data-cid="${escapeHTML(c.id)}">${escapeHTML(c.chatName || c.name)}${c.kind === 'group' ? ' · 群' : ''}<i>TA 会在这位那儿提起 · ${escapeHTML(mainNameOf(c.id))}</i></button>`).join('') +
    '</div>' +
    '</div>';
  (document.querySelector('.app-shell') || document.body).appendChild(mask);
  const close = () => { mask.remove(); if (_annPickMask === mask) _annPickMask = null; };
  mask.querySelector('.ann-panel-close').addEventListener('click', close);
  mask.addEventListener('click', e => { if (e.target === mask) close(); });
  mask.querySelector('.ann-bind-list').addEventListener('click', e => {
    const b = e.target.closest('.ann-bind-opt');
    if (!b) return;
    close();
    onPick(b.dataset.cid || '');
  });
  _annPickMask = mask;
}

// ===== TA 提起纪念日：当天祝福 / 前几天预告 / 里程碑前夜埋伏笔（annWishTick 挂 mailbox 30s 调度） =====
// 每条每天至多提起一次（a.lastMention 记日期，掷概率未中也算今天已决定，不逐 tick 重掷）；
// wish=false 整条静音；wishProb=提起概率（0-100）。离线错过当天内 tick 补上，跨天自然失效。
// 投递口径：只发到绑定的那个联系人的会话；没绑定联系人就没人来说这件事。

function _annWishText(a, years) {
  const name = (a.name || '').trim() || '纪念日';
  // 这条日子本来是一条已实现的心愿（心愿页「存为纪念日」带 wishId 回链）：措辞改成认账的语气
  const w = (a.wishId && typeof wishById === 'function') ? wishById(a.wishId) : null;
  if (w) {
    const pool = years > 0 ? [
      `今天还是「${name}」——那条我们一起实现的心愿，到今天${years}年了，我一直记着`,
      `「${name}」${years}周年。那条心愿成真的时候我高兴了很久，今天也一样`,
      `又是一年「${name}」。它从一句「想」变成真的，${years}年了还是想说一遍：真好`,
    ] : [
      `今天是「${name}」。你还记得吗，它本来是一条心愿——现在是真的了`,
      `「${name}」到啦。它以前只是一句想说的话，谢谢你把它变成了日子`,
      `今天是「${name}」呀。从心愿清单上划掉它的那天，我就想着以后每年都要提一次`,
    ];
    return pool[Math.floor(Math.random() * pool.length)];
  }
  if (years > 0) {
    const pool = [
      `今天是「${name}」${years}周年，这个日子我一直记着，往后的每一年也想和你一起过`,
      `「${name}」${years}周年快乐，谢谢你陪我走了这么远`,
      `又是一年「${name}」，${years}年了，还想和你继续走下去`,
    ];
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const pool = [
    `今天是「${name}」的日子，我记着呢，祝你今天顺顺利利`,
    `「${name}」到啦，这一天我等了很久，要开开心心的`,
    `今天是「${name}」呀，想和你说：有你在真好`,
  ];
  return pool[Math.floor(Math.random() * pool.length)];
}

function _annHeadsUpText(a, cd) {
  const name = (a.name || '').trim() || '纪念日';
  const when = cd === 1 ? '明天' : `还有 ${cd} 天`;
  const pool = [
    `悄悄说，${when}就到「${name}」了，我先记着`,
    `翻日历才看到，「${name}」${when}就到了，到时候要好好过`,
    `${when}就是「${name}」啦，已经开始期待了`,
  ];
  return pool[Math.floor(Math.random() * pool.length)];
}

function _annMileText(a, mile) {
  const name = (a.name || '').trim() || '在一起';
  const pool = [
    `明天，「${name}」就满 ${mile} 天啦`,
    `明天是个小日子——「${name}」第 ${mile} 天`,
    `明天就是我们「${name}」的第 ${mile} 天了，先跟你说一声`,
  ];
  return pool[Math.floor(Math.random() * pool.length)];
}

function annWishTick() {
  if (typeof isSchedulerLeader === 'function' && !isSchedulerLeader()) return;
  const today = _annToday();
  const md = today.slice(5), cy = today.slice(0, 4);
  let changed = false, mentioned = false;
  annList().forEach(a => {
    if (!a || a.lastMention === today) return;   // 每条每天至多一次 TA 提起
    const yearly = !!a.yearly;
    const isSameDay = yearly ? a.date === md : a.date === today;
    const isAnniv = !yearly && !isSameDay && a.date.slice(5) === md && a.date.slice(0, 4) < cy;
    const headsUp = !isSameDay && ANN_HEADUP.includes(_annNext(a.date).cd) ? _annNext(a.date).cd : 0;
    let mile = 0;
    if (!yearly && !isSameDay) {
      const dTom = _annDays(a.date) + 1;
      if (ANN_MILE.includes(dTom)) mile = dTom;
    }
    if (!isSameDay && !isAnniv && !headsUp && !mile) return;
    // 提起门：开关 + 概率；无论中不中，今天都不再掷第二次
    a.lastMention = today;
    mentioned = true;
    const prob = (typeof a.wishProb === 'number') ? Math.max(0, Math.min(100, a.wishProb)) : 100;
    if (a.wish === false || Math.random() * 100 >= prob) return;
    // 投递只认「绑定联系人」这一条路（2026-10-08 用户报「纪念日功能莫名其妙」）：
    // 原先没绑定时 fallback 到 data.activeChat，等于「谁碰巧开着谁的会话 TA 就去说」——
    // 一条谁都不属于的纪念日会凭空出现在某个聊天里。现在没绑定就没人来说这件事，
    // 屏上 .ann-extra-talk.warn 与编辑器那行提示说的是同一件事。
    const cid = a.contactId;
    if (!cid) return;
    const ch = (data.chats || {})[cid];
    if (!ch || !Array.isArray(ch.msgs)) return;
    const c = (data.contacts || []).find(x => x.id === cid);
    let text;
    if (isSameDay || isAnniv) {
      const years = isAnniv ? (+cy - +a.date.slice(0, 4)) : 0;
      text = _annWishText(a, years);
      a.lastWish = today;   // 兼容旧字段：当天祝福仍记 lastWish
    } else if (headsUp) text = _annHeadsUpText(a, headsUp);
    else text = _annMileText(a, mile);
    const msg = { id: (typeof nextId === 'function') ? nextId() : 'm' + Date.now(), from: 'partner', text, asBadge: true };
    if (c && c.kind === 'group' && Array.isArray(c.members) && c.members.length) {
      msg.sender = c.members[Math.floor(Math.random() * c.members.length)];
    }
    if (typeof _deliverToChat === 'function') _deliverToChat(msg, cid);
    else { ch.msgs.push(msg); if (cid === data.activeChat) renderMessages(); }
    changed = true;
  });
  if (mentioned) save();   // lastMention/lastWish 落盘（投递路径 _deliverToChat 内部也会 save，此处兜底守卫 return 的分支）
  if (changed) renderAnnExtras();
}

// ===== TA 自己想起一个日子（2026-10-11 BUGS #271）=====
// 每位一条钟：间隔在 30~90 天这个区间里【现掷】（不钉死成一个数、不设每日上限、没有快进开关），
// 到点再掷一次 annSelfProb 决定这一发建不建。建出来的形状定档为「每年重复」＝只存 MM-DD，
// 从 12 个月里挑一个月、再挑那个月真实存在的一天。
// 名字与聊天那句都只是「TA 想把这天记下来」这一件事，不写「我们曾经如何如何」＝不替用户编关系事实
// （与本文件 _annWishText 那一族同为函数内派生池，不走字卡库：这一族的台词从来不在库里）。
const ANN_SELF_MIN_D = 30, ANN_SELF_MAX_D = 90;
const ANN_SELF_NAMES = ['我想记着这天', '给自己留个日子', '一个新的小日子', '想和你多过一天', '偷偷存下的日子', '想起一个日子', '值得记一下的这天', '往后每年这天找你', '我挑的一天', '这天看着很顺眼'];
function _annSelfRollMs() { return Math.round((ANN_SELF_MIN_D + Math.random() * (ANN_SELF_MAX_D - ANN_SELF_MIN_D)) * 864e5); }
// 挑一个「还没被记过」的月-日：每月按该月真实天数抽（2024 为闰年样本），同一天已有日子就换一天再试
function _annSelfPickMd(exist) {
  for (let k = 0; k < 6; k++) {
    const mo = 1 + Math.floor(Math.random() * 12);
    const len = new Date(2024, mo, 0).getDate();
    const d = 1 + Math.floor(Math.random() * len);
    // 平年不存在 2-29：_annNext 会把它溢出到 3-01，于是当天祝福四年才轮到一次、预告又指着 3-01，
    // 造出来是一条「屏上看着有、那一天永远不亮」的日子——所以这一档直接跳过，不越界去改 _annNext
    if (mo === 2 && d === 29) continue;
    const md = _annPad2(mo) + '-' + _annPad2(d);
    if (!exist.has(md)) return md;
  }
  return '';
}
// 取档只认这一位自己那份（与 js/chat.js 的 _asBhOf 同一条判据）：缺档回落 defaults，
// 绝不拿 data.behavior 顶——那是【此刻开着的那位】的同一引用，串的就不是别人就是自己
function _annSelfBh(cid) {
  const s = (data && data.chatSettings) ? data.chatSettings[cid] : null;
  if (s && typeof s === 'object') return s;
  return defaults.behavior;
}
function _annSelfText(name, md) {
  const when = (+md.slice(0, 2)) + ' 月 ' + (+md.slice(3)) + ' 日';
  const pool = [
    `我在日历上给你圈了个日子——「${name}」，${when}，以后每年这天我都想找你`,
    `刚给自己定了个小日子：「${name}」，${when}，到时候你要陪我`,
    `多了一天要记，「${name}」，${when}，先跟你说一声`,
  ];
  return pool[Math.floor(Math.random() * pool.length)];
}
// 到点没过的位各掷各的；这一发无论中不中都先把那一格推回未来（同 #135：不被相邻两轮各掷一次）。
// 缺格＝只摊起点不掷（同 _nextWriteAtBy 那条「首轮只摊起点」口径＝导入旧档那一下不当场涌出一条）
function annSelfTick() {
  if (typeof isSchedulerLeader === 'function' && !isSchedulerLeader()) return;
  if (!data._nextAnnSelfAtBy || typeof data._nextAnnSelfAtBy !== 'object' || Array.isArray(data._nextAnnSelfAtBy)) data._nextAnnSelfAtBy = {};
  const now = Date.now();
  const tbl = data._nextAnnSelfAtBy;
  let made = 0;
  (data.contacts || []).forEach(c => {
    if (!c || !c.id || c.kind === 'group') return;   // 只按单聊建档（世界感知那一族同口径）
    const cid = c.id;
    const bh = _annSelfBh(cid);
    if (bh.annSelfOn === false) return;
    const next = tbl[cid];
    if (typeof next !== 'number' || !isFinite(next)) { tbl[cid] = now + _annSelfRollMs(); return; }
    if (next > now) return;
    tbl[cid] = now + _annSelfRollMs();
    const prob = (typeof bh.annSelfProb === 'number' && isFinite(bh.annSelfProb)) ? Math.max(0, Math.min(100, Math.round(bh.annSelfProb))) : 60;
    if (Math.random() * 100 >= prob) return;
    const exist = new Set();
    annList().forEach(a => {
      if (!a || typeof a.date !== 'string') return;
      if (a.yearly) exist.add(a.date);
      else if (/^\d{4}-\d{2}-\d{2}$/.test(a.date)) exist.add(a.date.slice(5));
    });
    const md = _annSelfPickMd(exist);
    if (!md) return;
    const name = ANN_SELF_NAMES[Math.floor(Math.random() * ANN_SELF_NAMES.length)];
    if (!Array.isArray(data.anniversaries)) data.anniversaries = [];
    data.anniversaries.push({ id: 'a' + now.toString(36) + Math.random().toString(36).slice(2, 6), name, date: md, yearly: true, contactId: cid, main: false, wish: true, wishProb: 100, lastWish: '', lastMention: '', by: 'ta' });
    const msg = { id: (typeof nextId === 'function') ? nextId() : 'm' + now, from: 'partner', text: _annSelfText(name, md), asBadge: true };
    if (typeof _deliverToChat === 'function') _deliverToChat(msg, cid);
    else { const ch = (data.chats || {})[cid]; if (ch && Array.isArray(ch.msgs)) { ch.msgs.push(msg); if (cid === data.activeChat) renderMessages(); } }
    made++;
  });
  if (made) { save(); renderAnniversary(); }
}

// ===== 事件绑定 =====
$('#annAddBtn') && $('#annAddBtn').addEventListener('click', () => openAnnEditor(null));
$('#annAddBtn2') && $('#annAddBtn2').addEventListener('click', () => openAnnEditor(null));
// 点 hero：有主纪念日则编辑它，没有则进入添加
$('#annHero') && $('#annHero').addEventListener('click', () => {
  const cid = (typeof currentContact === 'function' && (currentContact() || {}).id) || '';
  openAnnEditor(annMainFor(cid) || null);
});
$('#annExtraList') && $('#annExtraList').addEventListener('click', e => {
  const del = e.target.closest('.ann-extra-del');
  if (del) {
    const rec = annList().find(a => a.id === del.dataset.id);
    if (!rec) return;
    openModal('删除纪念日', '', () => {
      data.anniversaries = annList().filter(a => a.id !== rec.id);
      save();
      renderAnniversary();
      if (rec.main) _annRefreshChat();
      showToast('已删除');
    }, { noInput: true, staticText: `删除「${rec.name}」？不可恢复。`, okText: '删除', danger: true });
    return;
  }
  const row = e.target.closest('.ann-extra');
  if (row) {
    const rec = annList().find(a => a.id === row.dataset.id);
    if (rec) openAnnEditor(rec);
  }
});
