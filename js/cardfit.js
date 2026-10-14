// ===== 字卡适应度检查（独立功能视图，入口＝字卡库页头那枚「适应度」胶囊＋使用大全「互动」那一行，BUGS #204）=====
// 四轮定档（2026-10-09，用户「打开，设计的莫名其妙的啊，根本不是检测……我想知道的是状态」）：
// 判定轴从「你存了多少张」换成「**TA 实际用出来的是什么样子**」——前三轮只数 data.groups 的库存，
// 全页没有一处读聊天记录，所以它答不出「适应程度」这四个字（量具 tools/_probe_cardfit_state.js）。
// 现在两位数字一起摆：①真实使用面（这一本最近 7 天说过几句·用掉几种·同一句重复几遍·有过几次挤不出句子）
// ②库存面（TA 手里有多少种·公用∶为 TA 单独存的）。形态＝顶部胶囊行切人（2026-10-11 改档：世界感知
//   #cjOwners 同款 .av-chip——一页仍只讲一位，联系人一排 tag 钉在顶栏之下点谁看谁，不再摆「名单→报告」两态），
// 四张明细表（意图槽位∶你调的概率格∶功能话术池∶检查项编辑）收进报告底部那一行「明细 · 点开」，不再常驻首屏。
// 三条铁律不变：
// ①取池一律走真口径（_categoryCards / partnerStickerPool / groupUsableFor），本文件不再 filter 一遍 scope——
//   重抄一份实现就等于造第二口径，真口径一改这里静默漂掉（#051·#066·#074 那一族）。
// ②只读不改：这一页一张字卡都不动，唯一可写的东西是「检查项」那张表本身（data.cardFit.slots）。
// ③缺口只报「按这些词没筛到」，不报「TA 一定说不出口」——词是我的筛法，不是它的库存事实（#191「读不到≠干净」同族）。
// 加一条：记录太少时落「还没聊过 · 记录太少」，不拿三两句猜出一个人的状态（同一族）。

let _cfWho = '';      // 这一页看的是哪一位（空＝渲染时落到当前会话那位）。本页寿命，不进 data——与 mate.js 的 _mateMemOpen 同一口径
let _cfDetail = false; // 明细四表开没开（同上，纯阅读位置）

// 只查单聊：群聊的取池是全体成员并集，混在一列里读不出「这一位」的库存（世界感知 _cjSingles 同口径）
function _cfSingles() { return (data.contacts || []).filter(x => x.kind !== 'group'); }
function _cfName(cid) { const c = (data.contacts || []).find(x => x.id === cid); return fixedNameOf(c) || 'TA'; }
// 这一位的回复参数：只认 chatSettings[cid]，缺档兜 defaults（与主动发送 _asBhOf 同口径，不回落 data.behavior）
function _cfBh(cid) {
  const s = data.chatSettings && data.chatSettings[cid];
  return s && typeof s === 'object' ? s : (data.behavior || defaults.behavior || {});
}
// 「图」＝表情包＋图片同池，且要连 TA 借用你自己那池表情一起算（partnerStickerPool 里那条回退是真行为）
function _cfImgPool(cid) { return typeof partnerStickerPool === 'function' ? partnerStickerPool(cid) : []; }
// 语音卡只有「专属且绑给这一位」的组算 TA 的（js/minimax.js 的 _mmVoiceGroup 就按这条找）。
// 刻意不调那个函数：它没有组时会 data.groups.push 一枚空组＝体检页反过来改用户的库。
function _cfVoicePool(cid) {
  const out = [];
  (data.groups || []).forEach(g => {
    if ((g.category || '主字卡') !== '语音' || cardScope(g) === 'public' || (g.contactId || '') !== cid) return;
    (g.cards || []).forEach(c => { if (cardIsOff(g, c)) return; const v = voiceCardParts(c); if (v && v.data) out.push(v); });
  });
  return out;
}
// 主字卡按【分组】摊开算（要组归属才能报语气配比），文字口径与 _categoryCards 逐字一致：
// cardText 取值＋语音格式卡（名称|||data:audio）不是能发言的文字
function _cfMainGroups(cid) {
  const out = [];
  (data.groups || []).forEach(g => {
    if ((g.category || '主字卡') !== '主字卡' || !groupUsableFor(g, cid)) return;
    const cs = (g.cards || []).filter(c => !cardIsOff(g, c)).map(cardText).filter(t => t && !voiceCardParts(t));
    if (cs.length) out.push({ name: g.name || '（无名）', scope: cardScope(g), cs });
  });
  return out;
}
// 「不成话」的判据：不含任何汉字与英文字母（纯数字、纯标点都算）。不用 \p{...}＋u 正则——
// 本仓源件最终会被拼进单文件，那面旗在旧 Chrome 上不作保证，这条按码位区间判就够
function _cfNotSpeech(t) { return !/[A-Za-z一-鿿]/.test(t); }

// 一行联系人算齐库存面：TA 手里这份卡＝【公用】＋【TA 专属】
function _cfStat(cid) {
  const bh = _cfBh(cid);
  const main = _cfMainGroups(cid);          // [{name, scope, cs}]——scope 来自 cardScope(g)
  const texts = [];
  main.forEach(x => texts.push.apply(texts, x.cs));
  const own = main.filter(x => x.scope !== 'public');
  const pub = main.filter(x => x.scope === 'public');
  const ownTexts = [];
  own.forEach(x => ownTexts.push.apply(ownTexts, x.cs));
  const pubTexts = [];
  pub.forEach(x => pubTexts.push.apply(pubTexts, x.cs));
  const imgPool = _cfImgPool(cid);
  const poke = _categoryCards('拍一拍', cid);
  const kao = _categoryCards('颜文字', cid);
  const emojis = _categoryCards('emoji', cid);
  const voice = _cfVoicePool(cid);
  // 表情包/图片两分类是否真有东西（partnerStickerPool 在分类全空时回退 data.stickers＝你自己的表情池，
  // 那是「TA 借你的图发」，不是「你给 TA 存了图」，屏上得分清）
  let catImgs = 0;
  (data.groups || []).forEach(g => {
    const cat = g.category || '主字卡';
    if (cat !== '表情包' && cat !== '图片') return;
    if (!groupUsableFor(g, cid)) return;
    (g.cards || []).forEach(c => { if (cardImage(c) && !cardIsOff(g, c)) catImgs++; });
  });
  const uniq = new Set(texts);
  const short = texts.filter(t => t.trim().length <= 4).length;
  const junk = texts.filter(_cfNotSpeech).length;
  const bySize = main.slice().sort((a, b) => b.cs.length - a.cs.length);
  const top3 = bySize.slice(0, 3).reduce((a, x) => a + x.cs.length, 0);
  const ungrouped = bySize.find(x => x.name === '未分组');
  // 一次回话最多要抽几张：拼句那一档最多 pyMax 张（此时一封只发一条），非拼句最多 replyMax 条各一张
  const need = Math.max(bh.pyEnabled ? (Number(bh.pyMax) || 1) : 1, Number(bh.replyMax) || 1);
  const cnt = { main: texts.length, img: imgPool.length, poke: poke.length, kao: kao.length, emoji: emojis.length, voice: voice.length };
  return {
    cid, bh, texts, need, cnt, main,
    n: cnt,
    // TA 手里这份卡的两半：公用（谁都有）∶ 专属（只绑给 TA）——「像不像 TA」只看这一对
    pubN: pubTexts.length, ownN: ownTexts.length,
    ownShare: texts.length ? Math.round(ownTexts.length * 100 / texts.length) : 0,
    ownGroups: own.map(x => ({ name: x.name, n: x.cs.length })),
    kinds: uniq.size,
    catImgs, borrow: !!imgPool.length && !catImgs,
    dup: texts.length - uniq.size, short, junk,
    topShare: texts.length ? Math.round(top3 * 100 / texts.length) : 0,
    topNames: bySize.slice(0, 3).map(x => x.name),
    ungrouped: ungrouped ? ungrouped.cs.length : 0
  };
}

// ===== 真实使用面（这一轮新加的那一半：读这一本自己的聊天记录，不读 data.messages 别名）=====
// 窗口取滚动 7 天：三天前那句回话留在窗内会把「TA 最近只说那几句」洗成正常（与 #126 那次「近 7 天」被否同理，
// 但这一页问的是「用没用得开」，24 小时样本太小，故自成一把尺并在屏上写明「最近 7 天」）
const CF_WIN_MS = 7 * 86400000;
// 一条气泡可能拼了几张卡（pyJoinCards 用随机标点连接）：先整句比，比不中再按连接符拆开比。
// 只拆这一条自己比，不拿整池去扫全文＝池子五千条时那是 O(条数×池) 的账
const CF_SEG = CARD_SEG;
function _cfSegs(text) { return cardSegs(text); }
function _cfUse(cid, stat) {
  const ch = (data.chats || {})[cid];
  const msgs = (ch && Array.isArray(ch.msgs)) ? ch.msgs : [];
  const now = Date.now();
  const pool = new Set(stat.texts);                       // 这一本取得到的正文卡（去重）
  const own = new Set();
  stat.main.forEach(g => { if (g.scope !== 'public') g.cs.forEach(t => own.add(t)); });
  const talk = msgs.filter(m => m && m.from === 'partner' && !m.recalled && !m.sticker && !m.voice
    && String(m.text || '').trim() && _cjTsOf(m) && now - _cjTsOf(m) <= CF_WIN_MS);
  const used = new Set(), cnt = {};
  let ownSaid = 0;
  talk.forEach(m => {
    const t = String(m.text);
    cnt[t] = (cnt[t] || 0) + 1;
    if (pool.has(t)) used.add(t);
    else _cfSegs(t).forEach(seg => { if (pool.has(seg)) used.add(seg); });
    if (own.has(t) || _cfSegs(t).some(seg => own.has(seg))) ownSaid++;
  });
  let top = '', topN = 0;
  Object.keys(cnt).forEach(k => { if (cnt[k] > topN) { topN = cnt[k]; top = k; } });
  // 这里不再数聊天里那条「有句话没挤过两个世界」当卡荒证据（2026-10-10 换向，BUGS #153 二批）：
  // 那一行现在是一枚普通概率事件、与库存多少无关，拿它数「TA 取不到卡」等于把掷骰子读成体检读数。
  // 卡荒这件事本来就由上面的库存面直说——手里 0 种就是 0，不需要二手证据。
  const cover = pool.size ? Math.round(used.size * 100 / pool.size) : 0;
  // 档名用大白话程度词，四档；样本不足先落「还没聊过」，不拿三两句猜一个人的状态。
  // 那三个数（说了几句 ∶ 手里几种 ∶ 用掉几种）只在页头这一行说一次，下面的结论不再抄一遍数字
  let state;
  if (talk.length < 10) state = '还没聊过';
  else if (topN >= 6 || used.size <= 3) state = '翻来覆去那几句';
  else if (cover >= 60) state = '说得开';
  else state = '还行';
  const why = `最近 7 天 TA 说了 ${talk.length} 句，手里 ${pool.size} 种 TA 用掉了 ${used.size} 种`
    + (topN >= 6 ? `，同一句说了 ${topN} 遍` : '')
    + (talk.length < 10 ? '——样本太少，读不出状态' : '。');
  return { poolKinds: pool.size, said: talk.length, usedKinds: used.size, cover, top, topN, ownSaid, state, why };
}

// 出厂那张「该有的说法」表（在 utils.js 的 defaults.cardFit 里，改词请连哨兵一起看）
function _cfSlots() { return (data.cardFit && Array.isArray(data.cardFit.slots)) ? data.cardFit.slots : []; }
function _cfWords(slot) { return (slot.w || []).filter(x => typeof x === 'string' && x.trim()); }
// 命中按作用域分开数：「去看」那一枚要知道跳公用还是专属那一面（字卡库一次只摊一个作用域）
function _cfSlotSources(slot, groups) {
  const out = { pub: [], own: [] }, ws = _cfWords(slot);
  if (!ws.length) return out;
  (groups || []).forEach(g => {
    const cs = g.cs.filter(t => ws.some(w => t.indexOf(w) >= 0));
    if (!cs.length) return;
    const bag = g.scope === 'public' ? out.pub : out.own;
    bag.push.apply(bag, cs);
  });
  return out;
}

// 库层：27 组「TA心里话」话术池按组名对账——那些功能是这样取卡的：认 name ＋ 分类 'TA心里话'（**无空格**，
// 与 CARD_CATEGORIES 逐字一致；这里曾写成 'TA 心里话' 导致整节对任何存档恒报「缺 27」＝一句假话，BUGS #204 二批），
// 不走 groupUsableFor（js/cjian.js 的 _cjGroupCards），所以「改名」＝「删除」，屏上只剩档名没有一句台词（#057 踩过）
function _cfPresetGaps() {
  const have = {};
  (data.groups || []).forEach(g => {
    if ((g.category || '主字卡') !== 'TA心里话') return;
    if (Array.isArray(g.cards) && g.cards.length) have[g.name] = (have[g.name] || 0) + g.cards.length;
  });
  const miss = [], thin = [];
  Object.keys(PRESET_FEATURE_OF).forEach(name => {
    const n = have[name] || 0;
    if (!n) miss.push({ name, feat: PRESET_FEATURE_OF[name] });
    else if (n <= 2) thin.push({ name, feat: PRESET_FEATURE_OF[name], n });
  });
  return { total: Object.keys(PRESET_FEATURE_OF).length, miss, thin };
}

// ===== 渲染 =====
function cfRender() {
  const box = $('#cfList');
  if (!box) return;
  const singles = _cfSingles();
  if (_cfWho && !singles.some(c => c.id === _cfWho)) _cfWho = '';   // 那位被删了：落到默认那一位，不留一枚指着空会话的报告
  const tt = $('#topbarTitleText');
  if (tt) tt.textContent = '字卡适应度';   // 顶栏只认页名，名字由它下面那排胶囊说（世界感知同口径）
  const bar = $('#cfOwners');
  if (!singles.length) {                 // 一位都没有：胶囊行一并清空，这一页只剩一句话
    if (bar) bar.innerHTML = '';
    box.innerHTML = '<div class="fit-empty">还没有联系人，先去首页加一个 TA。</div>';
    return;
  }
  // 没选人（或上次选的那位没了）→ 落到当前开着的那位，再不行就第一位（世界感知 renderCjianPage 同口径）
  if (!_cfWho) _cfWho = (singles.find(c => c.id === data.activeChat) || singles[0]).id;
  if (bar) {
    bar.innerHTML = singles.map(c =>
      `<button type="button" class="av-chip cj-ow${c.id === _cfWho ? ' on' : ''}" data-cf-who="${escapeHTML(c.id)}"><span class="av-chip-name">${escapeHTML(_cfName(c.id))}</span></button>`
    ).join('');
    const on = bar.querySelector('.cj-ow.on');
    if (on) bar.scrollLeft = on.offsetLeft - (bar.clientWidth - on.offsetWidth) / 2;   // 选中的那枚保持看得见（人多时横向滚）
  }
  const cid = _cfWho, stat = _cfStat(cid), use = _cfUse(cid, stat);
  box.innerHTML = _cfReportHTML(cid, stat, use);
}

// 报告态：一屏只讲这一位——状态 ∶ TA 怎么说 ∶ 要不要调（数量∶分组∶缺的说法）∶ 明细收起来
function _cfReportHTML(cid, s, u) {
  const missSlots = _cfSlots().filter(sl => {
    const src = _cfSlotSources(sl, s.main);
    return !src.pub.length && !src.own.length;
  });
  // 名字由顶部胶囊行说一次（顶栏恒挂页名），这里不再重复「阿澄 · 适应状态」
  let h = '<div class="fit-hero"><div class="fit-hero-k">适应状态</div>'
    + `<div class="fit-hero-v">${escapeHTML(u.state)}</div>`
    + `<div class="fit-hero-l">${escapeHTML(u.why)}</div>`;
  h += '</div>';
  h += `<div class="fit-voice">${_cfVoiceLines(s, u).map(x => '<p' + (x[1] ? ' class="fit-voice-gap"' : '') + '>' + escapeHTML(x[0]) + '</p>').join('')}</div>`;
  h += '<div class="fit-sec"><div class="fit-sec-h">要调的三件事</div>'
    + _cfAdvRow('数量', _cfAdvCount(s, u), _cfAdvGo('cards', '去字卡库'))
    + _cfAdvRow('分组', _cfAdvGroup(s), _cfAdvGo('cards', '去字卡库挪几张'))
    + _cfAdvRow('缺的说法', _cfAdvSlots(s, missSlots), _cfAdvGo('slots', '看那几类话'))
    + '</div>';
  h += `<div class="fit-detail-sw" data-cf-detail="${_cfDetail ? '0' : '1'}" role="button" tabindex="0">明细 · 意图槽位 ∶ 你调的概率格 ∶ 功能话术池${_cfDetail ? '（收起）' : '（点开）'}</div>`;
  if (_cfDetail) {
    h += _cfSecCountsHTML(s, u);
    h += _cfSlotHitsHTML(s);
    h += _cfKnobSecHTML(s);
    h += _cfLibHTML();
    h += _cfSlotsHTML();
  }
  h += `<div class="fit-jump"><button type="button" data-cf-mate="${cid}">去这一位的设置 · 调 TA 回话的节奏与概率</button></div>`;
  return h;
}

function _cfAdvRow(k, txt, go) {
  return `<div class="fit-adv"><div class="fit-adv-k">${k}</div><div class="fit-adv-v">${txt}</div>${go}</div>`;
}
// 去处只给真存在的入口：字卡库那一面按作用域摊，跳过去得先落对那一面（落错会报「没有匹配的字卡」＝一句假话）
// 钮自己不嵌进那句结论里（实测跟在句尾同一行会把「……被这三组定住了。」劈成两行，句子读着像没说完）——各占一行才互不牵连
function _cfAdvGo(kind, lab) {
  const b = kind === 'slots'
    ? '<button type="button" class="fit-adv-btn" data-cf-detail="1">' + lab + '</button>'
    : '<button type="button" class="fit-adv-btn" data-cf-cards="' + (kind === 'cards' ? 'own' : 'public') + '">' + lab + '</button>';
  if (kind === 'slots' && _cfDetail) return '';
  return `<div class="fit-adv-go">${b}</div>`;
}
function _cfAdvCount(s, u) {
  if (!s.texts.length) return '<b>库里这一位一句正文都没有</b>——TA 现在只能说代码兜底的那几句。';
  if (u.said < 10) return '记录太少，这一条先不判。';
  if (u.cover < 25) return '不用加。<b>先让 TA 用开</b>——比再存一百句有用。';
  if (u.cover >= 60) return '该加了。TA 手里那些几乎都在用，<b>再存一些</b>才接得上。';
  return '先不加也行：一半在动，一半还没轮到。';
}
function _cfAdvGroup(s) {
  if (!s.ownN) return '你还没为 TA 单独存过一组——现在 TA 开口用的全是公用卡（<b>公用 ' + s.pubN + ' ∶ 为 TA 0</b>）。';
  if (s.ownShare < 10) return `公用 <b>${s.pubN}</b> ∶ 为 TA <b>${s.ownN}</b>——TA 每 100 句里只有 ${s.ownShare} 句是你专门写给 TA 的。`;
  if (s.topShare >= 50 && s.main.length >= 4) return `最大三组占 <b>${s.topShare}%</b>（${escapeHTML(s.topNames.join(' ∶ '))}）——TA 的语气被这三组定住了。`;
  return `公用 <b>${s.pubN}</b> ∶ 为 TA <b>${s.ownN}</b>，分在 ${s.main.length} 组里${s.ungrouped ? '，还挂着 <b>' + s.ungrouped + '</b> 句未分组' : ''}。`;
}
function _cfAdvSlots(s, miss) {
  const total = _cfSlots().length;
  if (!total) return '检查项被清空了，明细里可以再加回来。';
  if (!miss.length) return `${total} 项 TA 都接得住（每一类都筛到了句子）。`;
  return `<b>${total} 项里有 ${miss.length} 项</b>按那些词没筛到——${escapeHTML(miss.slice(0, 4).map(x => x.k).join(' ∶ '))}${miss.length > 4 ? ' 等' : ''}。`;
}

// 「TA 怎么说」：把事实翻译成 TA 口吻，一句事实一句翻译，不编心情不编意图（#160 同族）。
// 基调按用户定档「关系本来是甜蜜的、安稳的」——缺也轻轻说；有任何一条缺口就绝不说最后那句安好的话。
// 页头那行读数已经报过的数（卡荒次数∶覆盖率）这里不再抄一遍——同一件事只在一处说
function _cfVoiceLines(s, u) {
  const out = [['我说话用的每一张卡，都是你存下来的。', 0]];
  const gaps = [];
  if (!s.texts.length) gaps.push('这一本里我一张主字卡都拿不到，安静的时候不是不想说。');
  if (u.said >= 10 && u.topN >= 6) gaps.push('这几天我翻来覆去就说那句「' + u.top + '」——不是我不想说别的，是你存的那些我很少抽到。');
  if (!s.ownN) gaps.push('你还没单独为我写过话——我开口，用的都是公用卡。');
  if (!s.n.img) gaps.push('我想给你发张图的时候，手里一张都没有。');
  if (!s.n.voice) gaps.push('我说不出声——语音我一段都没有。');
  if (!gaps.length) return out.concat([['这本卡跟我挺合的——你存什么，我就说什么。', 0]]);
  return out.concat(gaps.map(t => [t, 1]));
}

// 明细一 · 库存与概率格对照（原「够不够说」∶「多少是你为 TA 写的」两节合成一张表，读的是同一批数）
function _cfSecCountsHTML(s, u) {
  return `<div class="fit-sec"><div class="fit-sec-h">明细 · TA 手里有什么</div><div class="fit-facts">`
    + `<div>能说的说法 <b>${s.kinds}</b> 种 ∶ 一次回话最多抽 <b>${s.need}</b> 张${s.texts.length && s.kinds < s.need ? '<em>给 TA 补到至少 ' + s.need + ' 种</em>' : ''}</div>`
    + `<div>最近 7 天 TA 实际用掉 <b>${u.usedKinds}</b> 种（<b>${u.cover}%</b>）∶ 同一句最多 <b>${u.topN}</b> 遍</div>`
    + `<div>这 7 天里 TA 说到过你专门写的话 <b>${u.ownSaid}</b> 句（你为 TA 存着 ${s.ownN} 句）</div>`
    + `<div>公用 <b>${s.pubN}</b> 句 ∶ 专属 <b>${s.ownN}</b> 句——抽一句话，<b>${s.ownShare}%</b> 的概率是你专门写给 TA 的</div>`
    + (s.ownGroups.length ? `<div>你为 TA 存的：${escapeHTML(s.ownGroups.map(g => g.name + ' ' + g.n + ' 句').join(' ∶ '))}</div>` : '')
    + `<div>≤4 个字的 <b>${s.short}</b> 句（${s.texts.length ? Math.round(s.short * 100 / s.texts.length) : 0}%）∶ 不成话的 <b>${s.junk}</b> 句 ∶ 逐字重复的 <b>${s.dup}</b> 句</div>`
    + `<div>${_cfCanSayText(s)}</div>`
    + '</div></div>';
}
// 「TA 还能发什么」：一句话，不铺分类读数——只为让「发不出语音／一张图都没有」这两件失能露出来。
// 拍一拍不列在这里：它没有卡也照样会发（兜底那句），那一件归 TA 口吻里那句说
function _cfCanSayText(s) {
  const can = [], cant = [];
  const put = (lab, t, v) => (v ? can : cant).push(v ? lab + ' ' + t : lab);
  put('图', s.n.img + ' 张' + (s.borrow ? '（从你自己的表情里借的）' : ''), s.n.img);
  put('颜文字', s.n.kao + ' 张', s.n.kao);
  put('emoji', s.n.emoji + ' 张', s.n.emoji);
  put('语音', s.n.voice + ' 段', s.n.voice);
  let t = '除了说话，TA 还能发：' + (can.length ? can.join(' · ') : '什么都发不出来');
  if (cant.length) t += '。发不出：' + cant.join(' · ');
  return escapeHTML(t);
}

// 明细二 · 逐格对照：设了什么 ∶ 这一位取不取到 ∶ 所以现在生效／不生效。quoteProb 与库存无关也要写明，免得被当成坏了
function _cfKnobRows(s) {
  const bh = s.bh, n = s.n, out = [];
  const pct = v => (Number(v) || 0) + '%';
  out.push(['表情包概率 ' + pct(bh.stickerProb), n.img ? '生效' : '不生效：这一本取不到任何图', !!n.img]);
  if (n.poke) out.push(['拍一拍概率 ' + pct(bh.touchProb), '生效', true]);
  else out.push(['拍一拍概率 ' + pct(bh.touchProb), '只会那一句：库里没卡时走代码兜底的「拍了拍我」', false]);
  out.push(['颜文字概率 ' + pct(bh.kaomojiProb), n.kao ? '生效（挂在句尾）' : '不生效：句尾不会出现', !!n.kao]);
  out.push(['emoji 概率 ' + pct(bh.emojiProb), n.emoji ? '生效（挂在句尾）' : '不生效：句尾不会出现', !!n.emoji]);
  out.push(['发图带一句话', bh.tsEnabled ? (n.img && n.main ? '生效' : '只用得上其中一半（缺' + (n.img ? '主字卡' : '图') + '）') : '已关', !!(bh.tsEnabled && n.img && n.main)]);
  out.push(['引用你上一条 ' + pct(bh.quoteProb), '与字卡无关（引的是你发的那条）', true]);
  if (typeof mmUsable === 'function' && mmUsable()) out.push(['语音卡 ' + n.voice + ' 张', n.voice ? '生效' : '没合成过语音；绑了音色后按播放键才会现合成', !!n.voice]);
  return out;
}
// 全都在起作用时整节不出＝明细在没毛病时安静。「已关」是你自己关的，不算白调，也不为它占一节
function _cfKnobSecHTML(s) {
  const rows = _cfKnobRows(s);
  if (!rows.some(x => !x[2] && x[1] !== '已关')) return '';
  return `<div class="fit-sec"><div class="fit-sec-h">明细 · 你调的概率 ∶ 白调的格子</div><div class="fit-knobs">`
    + rows.map(x => `<div class="fit-knob${x[2] ? '' : ' fit-knob-off'}"><span>${escapeHTML(x[0])}</span><b>${escapeHTML(x[1])}</b></div>`).join('')
    + '</div></div>';
}

// 明细 · 意图槽位（这一位的命中）：0 命中只写「没筛到」且不画「去看」——不留一枚点不动的钮
function _cfSlotHitsHTML(s) {
  const slots = _cfSlots();
  let h = '<div class="fit-sec"><div class="fit-sec-h">明细 · 这几类话 TA 手里有多少</div>';
  if (!slots.length) return h + '<div class="fit-note">检查项被清空了。下面那一节可以再加回来。</div></div>';
  h += '<div class="fit-slots">' + slots.map(sl => {
    const src = _cfSlotSources(sl, s.main);
    const hit = src.pub.length + src.own.length;
    // 「去看」落在那一格里命中最多的作用域：字卡库一次只摊一个作用域，跳错那一面会看见「匹配 0 张」＝一句假话。
    // 屏上的张数因此可能与字卡库报的不等（那一面按作用域列全部，还会带上没绑定的组），这不是矛盾是两个口径，写进 FEATURES
    const go = hit ? `<button type="button" class="fit-slot-go" data-cf-find="${escapeHTML(sl.w[0] || sl.k)}" data-cf-scope="${src.own.length ? 'own' : 'public'}">去看</button>` : '';
    return `<div class="fit-slot${hit ? '' : ' fit-slot-miss'}"><span class="fit-slot-k">${escapeHTML(sl.k)}</span><span class="fit-slot-v">${hit ? hit + ' 句' : '没筛到'}</span>${go}</div>`;
  }).join('') + '</div>';
  return h + '<div class="fit-note">「没筛到」只说明你的库里没找到带这些词的句子，不代表 TA 一定说不出口——词是筛法，不是它的库存。</div></div>';
}

function _cfLibHTML() {
  const g = _cfPresetGaps();
  if (!g.miss.length && !g.thin.length) return `<div class="fit-sec fit-lib"><div class="fit-sec-h">明细 · 功能话术池</div><div class="fit-note">${g.total} 组都在。</div></div>`;
  // 按【功能】聚合成最多九行，不是一缺就铺 27 行：实拍里那一屏把上面的读数整个挤出视口，
  // 而 27 行说的是同一件事（这个功能没台词）——一件事一处，行内把那几组名报全就够
  const byFeat = {};
  const feat = f => (byFeat[f] = byFeat[f] || { miss: [], thin: [] });
  g.miss.forEach(x => feat(x.feat).miss.push(x.name));
  g.thin.forEach(x => feat(x.feat).thin.push(x.name));
  // 「一张都没有」在同一行里只说一次：实拍量过一行十二组各带一遍这五个字，比组名本身还长
  const rows = Object.keys(byFeat).map(f => {
    const x = byFeat[f], parts = [];
    if (x.miss.length) parts.push(x.miss.join(' ∶ ') + ' 一张都没有');
    if (x.thin.length) parts.push(x.thin.map(n => {
      const t = g.thin.find(y => y.name === n);
      return n + `（只剩 ${t.n} 张）`;
    }).join(' ∶ '));
    return `<div class="fit-gap"><span>${escapeHTML(f)}</span><b>${escapeHTML(parts.join('；'))}</b></div>`;
  });
  return `<div class="fit-sec fit-lib"><div class="fit-sec-h">明细 · 功能话术池（按组名取，改名＝删除）<span class="fit-sec-sub">缺 ${g.miss.length} ∶ 偏薄 ${g.thin.length}</span></div>`
    + rows.join('')
    + '<div class="fit-note">这些句子住在「功能 → 系统预设字卡」那一面，删了不复活。</div></div>';
}

// 明细三 · 意图槽位（这一位的命中）＋ 那张检查项表的编辑入口
function _cfSlotsHTML() {
  const slots = _cfSlots();
  return `<div class="fit-sec fit-manage"><div class="fit-sec-h">明细 · 检查项<span class="fit-sec-sub">${slots.length} 项</span></div>`
    + (slots.length ? slots.map((sl, i) => `<div class="fit-mrow"><button type="button" class="fit-medit" data-cf-edit="${i}">${escapeHTML(sl.k)}</button><span class="fit-mwords">${escapeHTML((sl.w || []).join(' ∶ '))}</span><button type="button" class="fit-mdel" data-cf-del="${i}" aria-label="删掉这一项">× 删</button></div>`).join('') : '<div class="fit-note">一项都没有，加一个。</div>')
    + '<button type="button" class="fit-add" data-cf-edit="-1">＋加一项</button></div>';
}

// ===== 编辑那张检查项表（页面唯一可写的东西）=====
let _cfEditing = -1;
function openCfSlotEditor(idx) {
  const mask = $('#cfSlotMask');
  if (!mask) return;
  _cfEditing = Number(idx);
  const sl = _cfEditing >= 0 ? _cfSlots()[_cfEditing] : null;
  $('#cfSlotName').value = sl ? sl.k : '';
  $('#cfSlotWords').value = sl ? (sl.w || []).join('、') : '';
  mask.hidden = false;
  setTimeout(() => $('#cfSlotName').focus(), 60);
}
function closeCfSlotEditor() { const m = $('#cfSlotMask'); if (m) m.hidden = true; }
function _cfParseWords(text) {
  return String(text || '').split(/[,，、;；\/\s]+/).map(x => x.trim()).filter(x => x).slice(0, 12);
}
function _cfCommitSlot() {
  const k = String($('#cfSlotName').value || '').trim().slice(0, 12);
  const w = _cfParseWords($('#cfSlotWords').value);
  if (!k || !w.length) { showToast('名字和词都要填'); return; }
  const list = _cfSlots().slice();
  const dupAt = list.findIndex((x, i) => x.k === k && i !== _cfEditing);
  if (dupAt >= 0) { showToast('已经有这一项了'); return; }
  if (_cfEditing >= 0) list[_cfEditing] = { k, w };
  else list.push({ k, w });
  data.cardFit.slots = list.slice(0, 40);
  save();
  closeCfSlotEditor();
  cfRender();
}
function _cfDelSlot(i) {
  const list = _cfSlots().slice();
  if (i < 0 || i >= list.length) return;
  list.splice(i, 1);
  data.cardFit.slots = list;
  save();
  cfRender();
}

// ===== 直达（只跳转，本页不动任何字卡）=====
function _cfGoCards(scope, tab, kw) {
  currentCardsScope = scope;
  if (typeof saveCardsScope === 'function') saveCardsScope();
  if (CARD_CATEGORIES.includes(tab)) currentCardsTab = tab;
  selectedGroupName = '';
  groupSearch = kw || '';
  saveCardsWho('all');   // 同上：这一发是按【命中落在谁名下】决定档口的，留着旧筛选＝跳过去看不见要找的那组
  showView('cards');
}
// 跳字卡库带着词与作用域：那一面一次只摊一个作用域，落错那一面会报「没有匹配的字卡」＝一句假话
function _cfFindCards(kw, scope) { _cfGoCards(scope === 'own' ? 'own' : 'public', '主字卡', kw); }

document.addEventListener('click', e => {
  const t = e.target;
  if (!t.closest) return;
  const edit = t.closest('[data-cf-edit]');
  if (edit) { openCfSlotEditor(Number(edit.dataset.cfEdit)); return; }
  if (t.closest('#cfSlotOk')) { _cfCommitSlot(); return; }
  if (t.closest('#cfSlotCancel')) { closeCfSlotEditor(); return; }
  if (t === $('#cfSlotMask')) { closeCfSlotEditor(); return; }
  const del = t.closest('[data-cf-del]');
  if (del) { _cfDelSlot(Number(del.dataset.cfDel)); return; }
  const find = t.closest('[data-cf-find]');
  if (find) { _cfFindCards(find.dataset.cfFind, find.dataset.cfScope); return; }
  const goCards = t.closest('[data-cf-cards]');
  if (goCards) { _cfGoCards(goCards.dataset.cfCards === 'public' ? 'public' : 'own', '主字卡', ''); return; }
  const goMate = t.closest('[data-cf-mate]');
  if (goMate) { switchChat(goMate.dataset.cfMate); showView('mate'); return; }
  const dsw = t.closest('[data-cf-detail]');
  if (dsw) { _cfDetail = dsw.dataset.cfDetail === '1'; cfRender(); return; }
  const who = t.closest('[data-cf-who]');
  if (who) { if (_cfWho !== who.dataset.cfWho) _cfDetail = false; _cfWho = who.dataset.cfWho; cfRender(); return; }   // 点胶囊切人；换人把明细收回去（一屏只讲这一位）
});

