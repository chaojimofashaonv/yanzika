// ===== 聊天情绪标签（前作「星言」三级链 ＋ 前作「mochi」逻辑连接词） =====
// 一条回复上最多挂三枚标签：情绪 → 心意 → 交流意图，逐环节各自掷，可以只出一枚、也可以三枚都出。
// 词表是**出厂默认 ＋ 用户那一本**（data.emotionLib，只在整字段缺失时补出厂表＝用户删掉的词永不复活）；
// 停用的那几张三档一律不吃进抽样（词库是用户对词的控制，不是机制差异，哪一档都不许让它变成死设置）。
//
// 三档的真实差别只有两处（源码取证见 设计稿-聊天情绪系统与逻辑连接词.md §一）：
//   ①概率：星言档按前作原值写死 70∶40∶40 且屏上不长 stepper；mochi∶混合档那几格可调。
//   ②逻辑连接词：星言档整族不参与；mochi 档两种用法都开、追加按 TA 这句话的**形状**选类；
//     混合档两种用法都开、但**纯随机选类**（把前作那句式派生换成抽签，见 §五-3 的取舍）。
// 前作另外那两处「按行为累积」的机制（连续命中递进降档 70→60→45→30→20、特殊心意要聊满 20 次
// 再隔 24 小时）**三档都不搬**——用户 2026-10-05 明文定过「不要硬额度限次，也禁随行为累积/递进的概率」。
// 设置面两处**同一份填法**：全局那一页与「TA 的设置」里那张按联系人折叠卡都走 _emoModesHTML／_emoFieldsHTML／
//   _emoProbsInto，切到不调的那一档时那五格连内容一起撤（只挂 hidden＝下次切回来是一屏看不见的旧数字，#282 那一课）。
// 词库那一面两枚小钮各管一件事：停用／启用人人有（可逆）、「删」只给自填那张（不可逆、出厂那张删错只能整本恢复）。
const EMOTION_MODES = ['off', 'xingyan', 'mochi', 'mixed'];
const EMOTION_MODE_LABEL = { off: '关', xingyan: '星言', mochi: 'mochi', mixed: '混合' };
const EMOTION_XY_PROB = { mood: 70, heart: 40, intent: 40 };   // 星言档那份写死的原值（前作代码里的默认）
const EMOTION_RARITY_W = { normal: 80, rare: 15, special: 5 };
const EMOTION_HEART_LEVEL_W = { 1: 80, 2: 18, 3: 2 };
const EMOTION_TAG_LABEL = { mood: '情绪', heart: '心意', intent: '意图' };
const EMOTION_CONNECT_LABEL = {
  echo: '应声', confirm: '确认', keep: '追问', probe: '探问',
  bridge: '转话', shift: '换角度', tone: '缓一缓', close: '收尾'
};

// 读侧唯一口径：全局默认那份 ＋ 只存被改过的那一位（与信箱 _mbCfg、播放器 _plCfg 同族＝新增一格自动跟随）
function _emoCfg(cid) {
  const base = (data.emotion && typeof data.emotion === 'object') ? data.emotion : defaults.emotion;
  const one = (data.emotionBy && cid && data.emotionBy[cid]);
  return (one && typeof one === 'object') ? Object.assign({}, base, one) : Object.assign({}, base);
}
function _emoMode(cid) {
  const m = _emoCfg(cid).mode;
  return EMOTION_MODES.indexOf(m) >= 0 ? m : defaults.emotion.mode;
}

// 词表：data.emotionLib（用户那一本）——ensureData 只在整字段缺失时补出厂全表，故这里直接读
function _emoLib() {
  const lib = data.emotionLib;
  return (lib && typeof lib === 'object' && Array.isArray(lib.mood)) ? lib : EMOTION_LIB_DEFAULT;
}
// 逐张停用：{ mood:{ 组名:[词…] }, connect:{ 类名:[词…] } }，只当排除名单用，不决定形状
function _emoStopped(kind, group, t) {
  const off = data.emotionOff;
  if (!off || typeof off !== 'object') return false;
  const one = off[kind];
  if (!one || typeof one !== 'object') return false;
  const arr = one[group];
  return Array.isArray(arr) && arr.indexOf(t) >= 0;
}
function _emoCards(kind, groupName) {
  const lib = _emoLib();
  const list = kind === 'connect' ? (lib.connect && lib.connect[groupName]) : ((lib[kind] || []).find(g => g && g.g === groupName) || {}).c;
  if (!Array.isArray(list)) return [];
  if (kind === 'connect') return list.filter(t => typeof t === 'string' && t.trim() && !_emoStopped('connect', groupName, t));
  return list.filter(c => c && typeof c.t === 'string' && c.t.trim() && !_emoStopped(kind, groupName, c.t));
}
function _emoGroups(kind) {
  const lib = _emoLib();
  if (kind === 'connect') return Object.keys(lib.connect || {});
  return (lib[kind] || []).map(g => g && g.g).filter(Boolean);
}
function _emoGroupWeight(kind, groupName) {
  const g = (_emoLib()[kind] || []).find(x => x && x.g === groupName);
  return g && isFinite(Number(g.w)) ? Math.max(0, Number(g.w)) : 0;
}
function _emoWeighted(items) {
  let total = 0;
  items.forEach(it => { total += Math.max(0, Number(it[1]) || 0); });
  if (total <= 0) return items.length ? items[0][0] : null;
  let roll = Math.random() * total;
  for (const it of items) { roll -= Math.max(0, Number(it[1]) || 0); if (roll < 0) return it[0]; }
  return items[items.length - 1][0];
}
// 组内再按稀有度加权（normal∶rare∶special＝80∶15∶5），这一档没词就退回整组，不空手
function _emoByRarity(kind, groupName) {
  const cards = _emoCards(kind, groupName);
  if (!cards.length) return null;
  const byR = {};
  cards.forEach(c => { const r = EMOTION_RARITY_W[c.r] !== undefined ? c.r : 'normal'; (byR[r] = byR[r] || []).push(c); });
  const keys = Object.keys(byR).map(r => [r, EMOTION_RARITY_W[r] !== undefined ? EMOTION_RARITY_W[r] : 80]);
  const r = _emoWeighted(keys);
  const pool = (r && byR[r] && byR[r].length) ? byR[r] : cards;
  const hit = pool[Math.floor(Math.random() * pool.length)];
  return hit ? { t: hit.t, r: r || 'normal' } : null;
}

function _emoMoodCard() {
  const groups = _emoGroups('mood').map(g => [g, _emoGroupWeight('mood', g)]).filter(x => x[1] > 0 && _emoCards('mood', x[0]).length);
  if (!groups.length) return null;
  const g = _emoWeighted(groups);
  const one = g && _emoByRarity('mood', g);
  return one ? { k: 'mood', t: one.t, g } : null;
}
// 心意：有情绪就按「情绪组→心意组」那张映射加权选池，映射没覆盖到就退回通用池；组内再按等级加权
function _emoHeartCard(mood) {
  const map = (_emoLib().map || {});
  const rows = (mood && mood.g && map.emotionToHeart && map.emotionToHeart[mood.g]) || map.generalHeartPool || [];
  const groups = (rows || []).map(x => [x[0], x[1]]).filter(it => it[0] && _emoCards('heart', it[0]).length);
  if (!groups.length) return null;
  const g = _emoWeighted(groups);
  const cards = _emoCards('heart', g);
  if (!cards.length) return null;
  const lvItems = {};
  cards.forEach(c => { const lv = Math.max(1, Math.min(3, Number(c.l) || 1)); (lvItems[lv] = lvItems[lv] || []).push(c); });
  const lv = _emoWeighted(Object.keys(lvItems).map(k => [k, EMOTION_HEART_LEVEL_W[k] !== undefined ? EMOTION_HEART_LEVEL_W[k] : 80]));
  const pool = (lv && lvItems[lv] && lvItems[lv].length) ? lvItems[lv] : cards;
  const hit = pool[Math.floor(Math.random() * pool.length)];
  return hit ? { k: 'heart', t: hit.t, g } : null;
}
function _emoIntentCard(heart) {
  const map = (_emoLib().map || {});
  const rows = (heart && heart.g && map.heartToIntent && map.heartToIntent[heart.g]) || (_emoGroups('intent').map(g => [g, _emoGroupWeight('intent', g)]));
  const groups = (rows || []).map(x => [x[0], x[1]]).filter(it => it[0] && _emoCards('intent', it[0]).length);
  if (!groups.length) return null;
  const g = _emoWeighted(groups);
  const one = g && _emoByRarity('intent', g);
  return one ? { k: 'intent', t: one.t, g } : null;
}

// 连接词的类：mochi 档按 TA 这句话的形状选，混合档纯随机
function _emoConnectClass(text) {
  const cats = _emoGroups('connect').filter(c => _emoCards('connect', c).length);
  if (!cats.length) return null;
  if (_emoModeLast !== 'mochi') return cats[Math.floor(Math.random() * cats.length)];
  const s = String(text == null ? '' : text);
  const has = k => cats.indexOf(k) >= 0 ? k : null;
  if (/[?？]/.test(s) || /(什么|哪|怎么|为什么|吗|呢)$/.test(s.trim())) return has('probe') || cats[0];
  if (s.trim().length <= 4) return has('echo') || cats[0];
  if (/[。！]$/.test(s.trim()) && s.trim().length > 8) return Math.random() < 0.5 ? (has('bridge') || cats[0]) : (has('shift') || cats[0]);
  if (s.trim().length > 10) return Math.random() < 0.5 ? (has('keep') || cats[0]) : (has('probe') || cats[0]);
  return Math.random() < 0.5 ? (has('echo') || cats[0]) : (has('confirm') || cats[0]);
}
let _emoModeLast = 'off';   // 只在一次掷签里用（省得把 mode 一路传进三个函数），不跨消息复用

// ★ 唯一出口：一条 **已有正文** 的 TA 回话该挂哪几枚标签、要不要挂（或追加）一句连接词。
//   chat.js 的回复批与主动发送两处都走这里，不留第二条掷签路径。
//   返回 { tags:[{k,t}], word:'…', replace:bool }；replace＝整条换成那一句连接词（前作的用法①）。
//   规则：正文池空（_categoryCards('主字卡') 为空）时调用方根本不会走到这里——
//   「先有正文才谈连接词」＝不许凭空造一枚只有标签没有话、或只有「嗯嗯」的气泡（设计稿 §五-6）。
function _emotionForMessage(cid, text) {
  const mode = _emoMode(cid);
  _emoModeLast = mode;
  if (mode === 'off') return { tags: [], word: '', replace: false };
  const cfg = _emoCfg(cid);
  const prob = mode === 'xingyan' ? EMOTION_XY_PROB : {
    mood: Math.max(0, Math.min(100, Number(cfg.probMood) || 0)),
    heart: Math.max(0, Math.min(100, Number(cfg.probHeart) || 0)),
    intent: Math.max(0, Math.min(100, Number(cfg.probIntent) || 0))
  };
  const tags = [];
  const mood = _rand(prob.mood) ? _emoMoodCard() : null;
  if (mood) tags.push({ k: 'mood', t: mood.t });
  // 三环节各自独立掷（前作口径）：情绪只决定心意抽哪一池，**不替心意决定要不要出**；意图同理
  const heart = _rand(prob.heart) ? _emoHeartCard(mood) : null;
  if (heart) tags.push({ k: 'heart', t: heart.t });
  const intent = _rand(prob.intent) ? _emoIntentCard(heart) : null;
  if (intent) tags.push({ k: 'intent', t: intent.t });
  if (mode === 'xingyan') return { tags, word: '', replace: false };   // 星言档：连接词这一族整族不参与
  const rc = { replace: _rand(Math.max(0, Math.min(100, Number(cfg.rcReplaceProb) || 0))), append: _rand(Math.max(0, Math.min(100, Number(cfg.rcAppendProb) || 0))) };
  if (!rc.replace && !rc.append) return { tags, word: '', replace: false };
  const cls = _emoConnectClass(text);
  const pool = cls ? _emoCards('connect', cls) : [];
  if (!pool.length) return { tags, word: '', replace: false };
  const word = pool[Math.floor(Math.random() * pool.length)];
  return { tags, word, replace: rc.replace };
}

// ===== 设置那一面（html/view-emotion.html ∶ 入口＝「更多」那一行＋使用大全那一行） =====
// 字段表是唯一来源：屏上那几行·保存时夹的区间·星言档该藏哪几行，全从这里派生（加一格不必改三处）。
const EMOTION_FIELDS = [
  { k: 'probMood', label: '情绪字卡概率', hint: '一条回话挂上「情绪」那枚标签的概率' },
  { k: 'probHeart', label: '心意字卡概率', hint: '挂上「心意」那枚的概率，抽哪一池由上面那枚情绪决定' },
  { k: 'probIntent', label: '交流意图字卡概率', hint: '挂上「意图」那枚的概率' },
  { k: 'rcReplaceProb', label: '连接词·整条替换', hint: 'TA 这一句就只回一个词（嗯、其实、然后呢…）' },
  { k: 'rcAppendProb', label: '连接词·末尾追加', hint: '说完那句话再补一句连接词，用空格相接' }
];
// 词表那一面的四枚 tab：k 就是 data.emotionLib 与 data.emotionOff 的键名（内部键名不上屏，屏上只露 label）
const EMOTION_LIB_TABS = [
  { k: 'mood', label: '情绪' }, { k: 'heart', label: '心意' },
  { k: 'intent', label: '意图' }, { k: 'connect', label: '连接词' }
];
function _emoWrite(cid, patch) {
  if (!cid) { Object.assign(data.emotion, patch); }
  else {
    if (!data.emotionBy || typeof data.emotionBy !== 'object') data.emotionBy = {};
    data.emotionBy[cid] = Object.assign({}, data.emotionBy[cid] || {}, patch);
  }
  save();
}
// 「恢复跟随全局」＝整本删掉。留一本空的等于留一笔「存过但全空」的死账（下次加载 ensureData 也剪这种壳）
function _emoFollowGlobal(cid) {
  if (!cid || !data.emotionBy || typeof data.emotionBy !== 'object') return;
  delete data.emotionBy[cid];
  save();
}

// off 与星言档都不长概率那几行：前者整族不参与、后者按前作原值写死——留一组改了不生效的框
// ＝本仓零容忍的「看着能调实则不生效」（#159 那一族），所以是**不出现**，不是出现且禁用。
// 2026-10-13 BUGS #356：那一档不调时整张卡连内容一起没（全局页的卡壳就是 #emoProbs 自己，subhead 也并进
// 这里的内容里）＝切走那档不剩一张空卡壳，也不留一屏看不见的旧数字（#282 那一课）。
// withHead 只给全局那一页：「TA 的设置」那张折叠卡有自己的卡头（.fold-ti 已写着「聊天情绪」）＝不再画第二枚小标。
function _emoProbsShow(mode) { return mode === 'mochi' || mode === 'mixed'; }
// 两面同一处填法。收起那一档时**内容一起清空**而不是只挂 hidden：只藏不换的话，那几枚框子仍留在 DOM 里
// 带着上一次的数字（#282 群成员面板同一课＝隐藏不等于没有），下次切回来才重算＝中间那一眼是旧值。
function _emoProbsInto(el, cfg, withHead) {
  if (!el) return;
  const show = _emoProbsShow(cfg.mode);
  el.hidden = !show;
  el.innerHTML = show ? (withHead ? '<div class="setting-subhead">概率</div>' : '') + _emoFieldsHTML(cfg) : '';
}
function _emoModesHTML(cfg) {
  return EMOTION_MODES.map(m =>
    `<button type="button" class="scope-chip${cfg.mode === m ? ' on' : ''}" data-emo-mode="${m}">${escapeHTML(EMOTION_MODE_LABEL[m])}</button>`).join('');
}
function _emoFieldsHTML(cfg) {
  return EMOTION_FIELDS.map(f => `<div class="emo-row"><span>${escapeHTML(f.label)}</span>` +
    `<div class="stepper" data-emo-field="${f.k}" data-min="0" data-max="100" data-step="5">` +
    `<button type="button" class="stp-min" aria-label="减少${escapeHTML(f.label)}">−</button>` +
    `<input class="stp-val" readonly inputmode="numeric" value="${Math.max(0, Math.min(100, Number(cfg[f.k]) || 0))}">` +
    `<button type="button" class="stp-max" aria-label="增加${escapeHTML(f.label)}">+</button></div>` +
    `<p class="emo-hint">${escapeHTML(f.hint)}</p></div>`).join('');
}
function _emoModeNote(mode) {
  return mode === 'off' ? '关掉＝一条回话都不挂标签、也不插连接词（已挂过的旧消息照原样留在记录里，不回改）。'
    : mode === 'xingyan' ? '星言那一档：三级标签链按前作原值 70∶40∶40 掷，不给调；逻辑连接词整族不参与。'
    : mode === 'mochi' ? 'mochi 那一档：三枚标签的概率与连接词两用法都可调；追加哪一类的连接词按 TA 这句话的形状选（问句挑探问、短句挑应声…）。'
    : '混合那一档：控件与 mochi 档相同，只把「按句子形状选类」换成纯随机抽签——两套机制都不按连发次数累积、也不设每日上限。';
}
function renderEmotionPage() {
  const box = document.getElementById('emoModes');
  if (!box) return;
  const cfg = _emoCfg(null);
  box.innerHTML = _emoModesHTML(cfg);
  _emoProbsInto(document.getElementById('emoProbs'), cfg, true);   // #emoProbHead 随 #356 重排撤下：小标并进这张卡的内容里（mate 那张卡有自己的卡头，withHead 不传）
  const note = document.getElementById('emoModeNote');
  if (note) note.textContent = _emoModeNote(cfg.mode);
  renderEmoLib();
}
// 「TA 的设置」里那一格：同一份字段表、同一套控件，只是读写落在这一位自己那本上。
// 群态停在「本群」＝这一群共用那份（发言人认不到本人时兜底就读它）；切到某一位＝他本人那一份，
// 与同页「形象／TA 的声音」同一口径（他在哪儿都按这份，不只在这个群里）。
function _emoMateCid() {
  const t = (typeof _mateTarget === 'function') ? _mateTarget()
    : ((typeof currentContact === 'function') ? currentContact() : null);
  return (t && t.id) || '';
}
function renderEmoMateCard() {
  const box = document.getElementById('mateEmoModes');
  if (!box) return;
  const cid = _emoMateCid();
  const cfg = _emoCfg(cid);
  const own = (data.emotionBy && typeof data.emotionBy === 'object') ? data.emotionBy[cid] : null;
  const hasOwn = !!(own && typeof own === 'object' && Object.keys(own).length);
  box.innerHTML = _emoModesHTML(cfg);
  const probs = document.getElementById('mateEmoProbs');
  _emoProbsInto(probs, cfg);
  const follow = document.getElementById('mateEmoFollow');
  if (follow) follow.hidden = !hasOwn;   // 没单独设过＝没有可收回去的东西，不留一枚按不动的钮
  const note = document.getElementById('mateEmoNote');
  const _mt = (typeof _mateTarget === 'function') ? _mateTarget() : null;
  const who = (_mt && _mt.kind === 'group') ? '这一群' : '这一位';
  if (note) note.textContent = `这里改的只给${who}：屏上显示的是${who}此刻生效的那一档，没单独动过的格子仍跟随「聊天情绪」那一页的全局默认（全局改了它们跟着变）。`
    + (hasOwn ? `想收回去点下面那枚「恢复跟随全局」，一次收掉${who}存过的全部格子。` : '');
}

// 卡头那句摘要有两处宿主（TA 的设置那一格 ∶ 设置页那一行），刷新一律走现成那个写手，不在这里再拼一套文案
function _emoSumRefresh() {
  if (typeof renderFoldSummaries === 'function') renderFoldSummaries();
}

// ===== 词表那一面（#emotionView 下面那一段）=====
// 一张词上只放一枚钮，两种命运分开：出厂里的词只能「停用/启用」（可逆、且恢复出厂也清停用），
// 自己填进来的才有「删」（真从这一本里拿走）。一行三个控件＝读的人得先猜哪枚管什么。
// ⚠ data.emotionLib 出厂是 null：第一次改动才整本拷一份出来（出厂那 425 张住在 js/emotion-data.js、不进备份）。
//   清洗只在整字段缺失时补出厂表（#204 同一条＝「少于 N 项就补」等于用户删不掉任何东西），所以这里删掉的词，
//   下次加载不会自己长回来——只有「恢复出厂词表」能带回来，屏上那行说明因此不许写成「删了就没了」以外的话。
let _emoLibTab = 'mood';
let _emoRestoreTimer = 0;
const _emoRestoreLabel = '恢复出厂词表';
const _emoFactoryMemo = {};
function _emoFactoryWords(kind, g) {
  if (!_emoFactoryMemo[kind]) {
    const m = {};
    if (kind === 'connect') Object.keys(EMOTION_LIB_DEFAULT.connect || {}).forEach(k => { m[k] = new Set((EMOTION_LIB_DEFAULT.connect[k] || []).map(String)); });
    else (EMOTION_LIB_DEFAULT[kind] || []).forEach(gr => { m[gr.g] = new Set((gr.c || []).map(c => c && c.t).filter(Boolean)); });
    _emoFactoryMemo[kind] = m;
  }
  return _emoFactoryMemo[kind][g] || new Set();
}
function _emoLibGroups(kind) {
  const lib = _emoLib();
  if (kind === 'connect') return Object.keys(lib.connect || {}).map(g => ({ g, list: (lib.connect[g] || []).map(t => ({ t })) }));
  return (lib[kind] || []).map(gr => ({ g: gr && gr.g, list: ((gr && gr.c) || []).filter(c => c && typeof c.t === 'string') }));
}
function _emoLibCopy() {
  if (!data.emotionLib || typeof data.emotionLib !== 'object' || !Array.isArray(data.emotionLib.mood)) {
    data.emotionLib = JSON.parse(JSON.stringify(EMOTION_LIB_DEFAULT));
  }
  return data.emotionLib;
}
function _emoLibHas(kind, g, t) {
  const grp = _emoLibGroups(kind).find(x => x.g === g);
  return !!grp && grp.list.some(c => c.t === t);
}
function _emoLibAdd(kind, g, t) {
  const lib = _emoLibCopy();
  if (kind === 'connect') { (lib.connect[g] = Array.isArray(lib.connect[g]) ? lib.connect[g] : []).push(t); }
  else {
    const gr = (lib[kind] || []).find(x => x && x.g === g);
    if (!gr) return false;
    (gr.c = Array.isArray(gr.c) ? gr.c : []).push(kind === 'heart' ? { t, l: 1, r: 'normal' } : { t, r: 'normal' });
  }
  save();
  return true;
}
function _emoLibDel(kind, g, t) {
  const lib = _emoLibCopy();
  const cut = a => (Array.isArray(a) ? a : []).filter(x => (kind === 'connect' ? String(x) : (x && x.t)) !== t);
  if (kind === 'connect') lib.connect[g] = cut(lib.connect[g]);
  else { const gr = (lib[kind] || []).find(x => x && x.g === g); if (!gr) return false; gr.c = cut(gr.c); }
  save();
  return true;
}
function _emoStopSet(kind, g, t, stop) {
  if (!data.emotionOff || typeof data.emotionOff !== 'object' || Array.isArray(data.emotionOff)) data.emotionOff = {};
  const box = data.emotionOff;
  if (!box[kind] || typeof box[kind] !== 'object' || Array.isArray(box[kind])) box[kind] = {};
  const one = box[kind];
  const arr = (Array.isArray(one[g]) ? one[g] : []).filter(x => typeof x === 'string' && x && x !== t);
  if (stop) arr.push(t);
  if (arr.length) one[g] = arr; else delete one[g];
  if (!Object.keys(one).length) delete box[kind];   // 停用的名单也只留真有内容的格，不留空壳
  save();
}
function _emoWordRowHTML(kind, g, w) {
  const stopped = _emoStopped(kind, g, w.t);
  const del = !_emoFactoryWords(kind, g).has(w.t);
  return `<span class="emo-word${stopped ? ' off' : ''}"><i>${escapeHTML(w.t)}</i>` +
    // 「停用」人人有（这是可逆的那一下）；「删」只给自己填的那张（不可逆、删错回不来＝出厂词不给这枚钮）。
    //   两枚各管一件事、不按互斥排：自填那张也可以只停用不删（留着但不抽它），缺一枚就是半套。
    (del ? `<button type="button" class="emo-del" data-emo-del data-emo-kind="${kind}" data-emo-group="${escapeHTML(g)}" data-emo-word="${escapeHTML(w.t)}" aria-label="删掉${escapeHTML(w.t)}">删</button>` : '') +
    `<button type="button" class="emo-off" data-emo-off data-emo-kind="${kind}" data-emo-group="${escapeHTML(g)}" data-emo-word="${escapeHTML(w.t)}">${stopped ? '启用' : '停用'}</button>` +
    `</span>`;
}
/* 组折叠（2026-10-13 BUGS #356）——旧的形态把当前 tab 全部组连成一面墙（情绪档 11 组 209 张、
   整页 3613px≈4.3 屏），读一个词要在两百枚 chip 里捞。现在缺省只铺第一组，其余折成
   「组名＋张数＋横线＋箭头」一行；展开哪些组落 _emoLibOpen（页内变量、按 tab 各一本：
   不进 data、不进备份，同 _cjMsOpen／信箱筛选那一族）。
   ⚠ 组头画成 BUTTON 而不是 div＋role＝键盘与读屏各就各位，且通栏件自己在 CSS 里给足 44px；
     data-emo-fold 的值＝「档:组名」，点它只翻这一组（不重画整页＝滚动位置与别的组的展开态都留住）。 */
const _emoLibOpen = {};   // kind → Set<组名>；缺省那一本只放第一组
function _emoLibOpenSet(kind, firstG) {
  if (!_emoLibOpen[kind]) _emoLibOpen[kind] = new Set(firstG ? [firstG] : []);
  return _emoLibOpen[kind];
}
function _emoGrpHTML(kind, grp, open) {
  const stopped = grp.list.filter(w => _emoStopped(kind, grp.g, w.t)).length;
  const name = kind === 'connect' ? (EMOTION_CONNECT_LABEL[grp.g] || grp.g) : grp.g;
  return `<div class="emo-grp${open ? ' open' : ''}">`
    + `<button type="button" class="emo-grp-hd" data-emo-fold="${kind}:${escapeHTML(grp.g)}" aria-expanded="${open ? 'true' : 'false'}">`
    + `<b>${escapeHTML(name)}</b><small>${grp.list.length} 张${stopped ? ' · 停用 ' + stopped + ' 张' : ''}</small><i class="emo-grp-ar" aria-hidden="true"></i></button>`
    + `<div class="emo-grp-bd"${open ? '' : ' hidden'}>`
    + (grp.list.length ? `<div class="emo-words">${grp.list.map(w => _emoWordRowHTML(kind, grp.g, w)).join('')}</div>`
      : `<p class="emo-empty">这一组的词都删掉了 · 点下面「恢复出厂词表」把它们带回来</p>`)
    + `<div class="emo-addrow"><input class="emo-add" data-emo-add="${escapeHTML(grp.g)}" maxlength="16" placeholder="加一张" aria-label="给${escapeHTML(name)}加一张">`
    + `<button type="button" class="emo-addgo" data-emo-addgo="${escapeHTML(grp.g)}" hidden>添加</button></div></div></div>`;
}
function renderEmoLib() {
  const tabs = document.getElementById('emoTabs');
  if (!tabs) return;
  const kind = EMOTION_LIB_TABS.some(t => t.k === _emoLibTab) ? _emoLibTab : 'mood';
  tabs.innerHTML = EMOTION_LIB_TABS.map(t =>
    `<button type="button" class="scope-chip${kind === t.k ? ' on' : ''}" data-emo-tab="${t.k}">${escapeHTML(t.label)}</button>`).join('');
  const grps = _emoLibGroups(kind);
  const total = grps.reduce((n, x) => n + x.list.length, 0);
  const offTotal = grps.reduce((n, x) => n + x.list.filter(w => _emoStopped(kind, x.g, w.t)).length, 0);
  const openSet = _emoLibOpenSet(kind, grps[0] ? grps[0].g : '');
  const box = document.getElementById('emoLibGroups');
  if (box) box.innerHTML = grps.map(g => _emoGrpHTML(kind, g, openSet.has(g.g))).join('');
  const note = document.getElementById('emoLibNote');
  if (note) note.textContent = `${kind === 'connect' ? '连接词' : '三级链的「' + (EMOTION_LIB_TABS.find(t => t.k === kind) || {}).label + '」'}：${grps.length} 组 ${total} 张`
    + (offTotal ? `，停用 ${offTotal} 张（停用的不进抽样，三档一律不吃进）` : '')
    + '。你改过的才存进这一本；出厂那张表本身不进备份文件。点组头展开或收起那一组。';
}
// 一处委托：两面（全局那一页 ∶ TA 的设置那一格）＋词表那一面都只认这一族属性，不留第二处写手
function _emoScopeOf(node) {
  const view = document.getElementById('emotionView');
  if (view && view.contains(node)) return null;                 // null＝全局默认那一份
  const mate = document.getElementById('mateView');
  if (mate && mate.contains(node)) return _emoMateCid();        // 这一位（群态＝本群或那位本人）
  return undefined;                                             // 不在这两面＝不归本模块管
}
document.addEventListener('click', (ev) => {
  const scope = _emoScopeOf(ev.target);
  if (scope === undefined) return;
  // 组折叠（#356）：点组头只翻这一组——hidden 收放＋箭头转向＋行头 aria，**不重画整页**
  // （同 #337 情绪轨迹天折行：重画会把滚动位置与别组的展开态一起冲掉）。_emoLibOpen 同步记，
  // 这样下面任何一次 renderEmoLib（停用∶加词∶删词∶切 tab 回来）都按同一本账展开。
  const fold = ev.target.closest('[data-emo-fold]');
  if (fold) {
    const raw = fold.dataset.emoFold, cut = raw.indexOf(':');
    const kind = raw.slice(0, cut), g = raw.slice(cut + 1);
    const set = _emoLibOpenSet(kind, '');
    const grp = fold.closest('.emo-grp');
    const open = set.has(g);
    if (open) set.delete(g); else set.add(g);
    if (grp) {
      grp.classList.toggle('open', !open);
      const bd = grp.querySelector('.emo-grp-bd');
      if (bd) bd.hidden = open;
    }
    fold.setAttribute('aria-expanded', open ? 'false' : 'true');
    return;
  }
  const mode = ev.target.closest('[data-emo-mode]');
  if (mode) { _emoWrite(scope, { mode: mode.dataset.emoMode }); renderEmotionPage(); renderEmoMateCard(); _emoSumRefresh(); return; }
  const step = ev.target.closest('.stp-min, .stp-max');
  if (step) {
    const row = step.closest('[data-emo-field]');
    if (!row) return;
    const key = row.dataset.emoField;
    const input = row.querySelector('.stp-val');
    if (!input) return;
    const min = Number(row.dataset.min) || 0, max = Number(row.dataset.max) || 100, inc = Number(row.dataset.step) || 5;
    const cur = Math.max(min, Math.min(max, Number(input.value) || 0));
    const next = step.classList.contains('stp-max') ? Math.min(max, cur + inc) : Math.max(min, cur - inc);
    if (next === cur) return;   // 已到端点：不做「按了数字不动」的假反馈
    input.value = String(next);
    _emoWrite(scope, { [key]: next });
    renderEmoMateCard();   // 全局那一页改完，TA 那一格显示的是「这一位此刻生效的值」，得跟着重算
    _emoSumRefresh();      // 卡头那句摘要与格子里的数同源，不许留着一句旧摘要
    return;
  }
  if (ev.target.closest('#mateEmoFollow')) { _emoFollowGlobal(scope); renderEmotionPage(); renderEmoMateCard(); _emoSumRefresh(); return; }
  const tab = ev.target.closest('[data-emo-tab]');
  if (tab) { _emoLibTab = tab.dataset.emoTab; renderEmoLib(); return; }
  const off = ev.target.closest('[data-emo-off]');
  if (off) {
    const k = off.dataset.emoKind, g = off.dataset.emoGroup, t = off.dataset.emoWord;
    _emoStopSet(k, g, t, !_emoStopped(k, g, t));
    renderEmoLib();
    return;
  }
  const del = ev.target.closest('[data-emo-del]');
  if (del) { _emoLibDel(del.dataset.emoKind, del.dataset.emoGroup, del.dataset.emoWord); renderEmoLib(); return; }
  const go = ev.target.closest('[data-emo-addgo]');
  if (go) {
    const kind = _emoLibTab, g = go.dataset.emoAddgo;
    const input = go.closest('.emo-addrow') && go.closest('.emo-addrow').querySelector('.emo-add');
    const t = input ? String(input.value || '').trim() : '';
    if (!t || _emoLibHas(kind, g, t)) return;   // 空框与重复：那枚钮本就不该出现（见下面 input 委托）
    if (_emoLibAdd(kind, g, t) && input) input.value = '';
    renderEmoLib();
    return;
  }
  const back = ev.target.closest('#emoRestore');
  if (back) {
    // 两步确认（信箱读信页删信那一族同一口径）：首点只问一遍，2.5 秒不点自己收回，不弹原生 confirm
    if (!back.classList.contains('arm')) {
      back.classList.add('arm');
      back.textContent = '确认恢复？停了与删掉的都会回来';
      clearTimeout(_emoRestoreTimer);
      _emoRestoreTimer = setTimeout(() => { back.classList.remove('arm'); back.textContent = _emoRestoreLabel; }, 2500);
      return;
    }
    clearTimeout(_emoRestoreTimer);
    back.classList.remove('arm');
    back.textContent = _emoRestoreLabel;
    data.emotionLib = null;        // 交回出厂整表（_emoLib 读不到副本就用出厂表，故 null 即「没改过」）
    data.emotionOff = {};           // 停用名单一起清：留着会让恢复后的词莫名其妙仍不上屏
    save();
    renderEmotionPage();
  }
});
// 加词那枚钮跟着框里的字走：空着 ∶ 已有这一张都不出现＝不留一枚按下去什么都不发生的钮（#174 那族反面）
document.addEventListener('input', (ev) => {
  const input = ev.target.closest && ev.target.closest('[data-emo-add]');
  if (!input) return;
  const row = input.closest('.emo-addrow');
  if (!row) return;
  const go = row.querySelector('.emo-addgo');
  if (!go) return;
  const t = String(input.value || '').trim();
  const dup = !!t && _emoLibHas(_emoLibTab, input.dataset.emoAdd, t);
  go.hidden = !(t && !dup);
  go.textContent = dup ? '已有这张' : '添加';
});

// 群聊里按**发言人自己那一份**掷（与「按联系人各一份」这一族同口径：#051·#066·#074·#104·#156）；
// 认不到那位（走散的署名）就退回这一本那份，不冒充别人的设置。
function _emoCidFor(msg, origin) {
  if (!msg || !msg.sender) return origin;
  const one = (data.contacts || []).find(c => c && c.name === msg.sender && c.kind !== 'group');
  return (one && one.id) || origin;
}
