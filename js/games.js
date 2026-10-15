// ===== 游戏中心：合成大西瓜 / 2048 / 消灭星星 / 连连看 / 滑块拼图 / 俄罗斯方块 =====
// 多联系人：data.games.with=一起玩的人（chips 可切）；六款技巧游戏按联系人各记一套成绩与 TA 挑战分。
// 聊天触点：m.game 消息（战绩/挑战/信送到那一张）由 _gameCardHTML 渲染，TA 回应走 _deliverToChat。
// 小鸟邮差那一族（十站清单∶明信片画法∶稀有度∶星级∶特产）2026-10-12 随信箱「在路上」一起退役＝本文件不再引它；
// 老聊天记录里那张到达卡仍报得出来（走 _gameCardHTML 里那一支），但不给「看明信片」——宿主没了。
// 合成大西瓜：拖动瞄准松手落瓜，Q弹物理（挤压回弹/旋转/爆汁粒子）；每级水果可换自己的图（data.games.mergeSkins）。

/* ---------- 常量 ---------- */
const G_LABELS = { merge: '合成', g2048: '2048', pop: '消灭星星', link: '连连看', puzzle: '滑块拼图', tetris: '俄罗斯方块' };
const G_UNITS = { merge: '分', g2048: '分', pop: '分', link: '分', puzzle: '分', tetris: '分' };
/* 已下线的两款（2026-10-11 用户「我只需要留 6 款游戏」）：游戏中心里再没有它们的面板，
   但老聊天记录里那张卡还写着这两款的名字与成绩——名字留着只为把旧卡报得出，不给任何入口。 */
const G_RETIRED_LABELS = { stack: '积木', tower: '推塔' };
// 音效音高：把「合出第几档／连掉几块」换成往上偏的半音数，钳在一个八度内（不越玩越尖）
function _gSfxStep(n) { return Math.max(0, Math.min(12, Math.round((Number(n) || 0) * 1.4))); }
const G_SKILLS = ['merge', 'g2048', 'pop', 'link', 'puzzle', 'tetris'];
const G_FRUITS = [
  { n: '樱桃', c: ['#e86a6a', '#c74343'], r: 13 },
  { n: '草莓', c: ['#ef8a7a', '#d45545'], r: 17 },
  { n: '葡萄', c: ['#a97fd1', '#8457b2'], r: 22 },
  { n: '橘子', c: ['#f2a355', '#dd7f2e'], r: 28 },
  { n: '柿子', c: ['#f2894f', '#d9622a'], r: 35 },
  { n: '苹果', c: ['#e05e52', '#bb3b31'], r: 43 },
  { n: '桃子', c: ['#f2b3a0', '#dd8471'], r: 52 },
  { n: '菠萝', c: ['#f2c94f', '#d9a832'], r: 62 },
  { n: '哈密瓜', c: ['#b8d98a', '#93bb60'], r: 73 },
  { n: '柚子', c: ['#f2d06b', '#dbb045'], r: 84 },
  { n: '西瓜', c: ['#5fae5c', '#3f8c3e'], r: 96 }
];
const G_MERGE_VAL = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
const G_START_TA = { g2048: [128, 256, 384, 512], merge: [60, 100, 160, 240], pop: [500, 800, 1100, 1500], link: [140, 220, 300, 380], puzzle: [180, 260, 340, 420], tetris: [800, 1200, 1600, 2000] };
const G_CHALLENGE_SAY = {
  g2048: ['来比比 2048？我先立个数：{n}，超过了才算你赢。', '玩 2048 吧，我的数是 {n}——别太快输给我。', '{n}。立在这了，什么时候破随你。'],
  merge: ['罐子我玩过了：{n} 分。你丢一个试试？', '合成这件事，{n} 分及格。', '{n} 分。丢了多少颗我才攒出来的，你慢慢算。'],
  pop: ['消灭星星我练过：{n} 分，你来试试？', '连片这件事，{n} 分及格——要又大又准。', '{n}。立在这了，全清了再来找我。'],
  link: ['连连看我立个数：{n}。你慢慢连。', '{n} 分。连对要快，四秒内连着对还有加成。', '{n} 分及格。洗牌次数我也记着呢。'],
  puzzle: ['滑块拼图我立个数：{n}。步数越少分越高，手要省着用。', '{n} 分及格。拼图这东西，急不得。', '{n}。立这了，什么时候拼完随你。'],
  tetris: ['俄罗斯方块我练过：{n} 分，你来堆堆看？', '消行这件事，{n} 分及格。', '{n}。立在这了，四行齐消了再来找我。']
};
const G_SAY = {
  beat: ['行啊你，这把我认了。', '破了我的数……行，重立一个，等着。', '可以，这把有点东西。', '服了，下次没那么容易了。'],
  best: ['新纪录？记下了，这可是你说的巅峰。', '又高了……你最近手感可以啊。', '这个数我先截图了。'],
  lose: ['就这？回炉再练练。', '我先笑一会儿，你再来。', '挑战分还在那摆着呢。', '差得有点多啊，要不要我让你一手。'],
  mid: ['嗯，离我的数还差一点。', '有点意思，再试一把？', '快了快了，就是还差口气。']
};
const G_COOP_SHARE = ['我们俩的成绩，我记着呢。', '这一局你一半我一半，下次接着推。', '你把它发给别人看也行，署我们两个的名。'];
const G_COOP_POP_CLEAR = ['全清了……这一盘是我们俩一点没剩。', '整盘消干净了！这一局得记住。', '一块不剩。我们俩这盘有点东西。'];
const G_COOP_LINK_CLEAR = ['连连看也被我们连光了……这盘得记住。', '最后那一对是关键——全清了，我们俩连的。', '一块不剩，牌全被我们连完了。'];
const G_COOP_PUZZLE_DONE = ['拼完了……这一张是我们俩一点没错位拼上的。', '最后那一块是谁放的？不重要——我们一起拼完的。', '这张得记住，我们俩拼的。'];
/* 成就文案归属：局终那一条按游戏取对应的一句（G_COOP_ACH 缺项＝该游戏没有这一号成就） */
const G_COOP_ACH = {
  merge: ['大西瓜……是我们一起合出来的，这颗得记住。', '合出大西瓜了！这罐我出了一半力，你可别赖账。'],
  g2048: ['2048……我们一起合出来了。这一块得留着，是我们俩的。', '真到 2048 了。我推的那几手没白推。'],
  puzzle: G_COOP_PUZZLE_DONE,
  tetris: ['四行齐消！这波是我们俩一起堆出来的。', '看见没，四行——你的手和我的手对上了。', '一次消四行，这个棋盘我们做主。']
};

/* ---------- 开局前：邀请 / 应答 ----------
   FIX 2026-10-08#050 游戏中心此前一进页面就 boot（renderGames 直接 gMergeBoot 等），
   「开始」这个动作根本不存在；同时合作模式沿途往聊天里撒里程碑消息（合出 2048、推倒一座塔、
   八连消…），用户没在玩也刷一屏噪音。两件事一起改：
     ① 进页先看准备画面（谁 · 什么玩法），点「开始游戏」或「邀请 TA 一起玩」才开局；
     ② 一起玩/对战要先发一封邀请，TA 答应（6 成）才开局、拒绝（4 成）这局就不开；
     ③ 局中一律不往聊天发消息，只在局终落一条（破纪录再补一条）。 */
const G_MODE_CN = { solo: '自己玩', coop: '一起合作', vs: '比分对战' };
const G_ASK_SAY = ['来一局{g}？', '{g}，陪我玩一把。', '一起玩{g}吧，我准备好了。', '{g}开一局？我先占个位。'];
const G_ASK_YES = ['好，来。', '行，开。', '等着，我这就把手机放下。', '来吧。'];
const G_ASK_NO = ['我在忙，等会儿。', '这会儿不行，回头吧。', '先不了，你找点别的玩。', '手头有点事，改天。'];
const G_END_SAY = {
  merge: ['这一罐 {n} 分，你丢得比我预想的稳。', '{n} 分——这罐我记下了。', '攒到 {n} 分了，下一罐我等着。'],
  g2048: ['{n} 分。棋盘清得挺干脆。', '这局 {n} 分，我看着呢。', '{n} 分，记下了。'],
  pop: ['{n} 分，这一盘连得挺准。', '{n} 分，手气可以。', '{n} 分，连片找得比我快。'],
  link: ['{n} 分。牌快被我们连光了。', '{n} 分，这盘打得干净。', '{n} 分，连对不少。'],
  puzzle: ['拼完了 · {m} 步 {n} 分。', '{m} 步拼完，{n} 分。', '{n} 分。少走两步就更好。'],
  tetris: ['{n} 分 · 消了 {l} 行。', '{l} 行，{n} 分，堆得挺稳。', '这局 {n} 分，消 {l} 行。']
};
/* 全清那句话只有合作模式会用（solo 全清由 _gEndReport 的普通那句兜），直接复用 G_COOP_*_CLEAR */
const G_END_CLEAR = { pop: G_COOP_POP_CLEAR, link: G_COOP_LINK_CLEAR, puzzle: G_COOP_PUZZLE_DONE };
const G_END_BEST = ['破纪录了……行，这把我认了。', '这个数我先截图了。', '又高了，最近手感可以啊。', '新纪录。这局是你的。'];
const G_COOP_END_SAY = ['这局我们俩 {n} 分，各记一半。', '{n} 分——你一半我一半。', '我们这局 {n} 分，谁也别谦虚。'];

/* ---------- 小工具 ---------- */
function _gPick(arr, r) { return arr[Math.floor(r * arr.length) % arr.length]; }
function _gContact(cid) { return (data.contacts || []).find(c => c.id === cid) || (data.contacts || [])[0] || null; }
function _gSingles() { return (data.contacts || []).filter(c => c.kind !== 'group'); }   // 游戏只和单聊的 TA 玩：群聊不进 chips、不收信、不立挑战
function _gName(cid) { const c = _gContact(cid); return c ? (c.name || 'TA') : 'TA'; }
function _gScore(cid, game) {
  if (!data.games || !data.games.scores) return { best: 0, plays: 0, ta: 0 };
  if (!data.games.scores[cid]) data.games.scores[cid] = {};
  if (!data.games.scores[cid][game]) data.games.scores[cid][game] = { best: 0, plays: 0, ta: 0 };
  return data.games.scores[cid][game];
}
/* 「自己玩」记一本不认人的公共账（BUGS #302）：solo 档屏上没有选人入口，成绩也就不能记在谁名下——
   记在谁名下就会随一枚屏上看不见的键变（换个联系人，「自己玩最高分」莫名跟着变）。
   记账与读数一律走 _gBook(game) 这一处：它按当前玩法挑本子（solo＝公共那本∶coop／vs＝那位名下那本），
   六款各自再写一份「该看哪本」的判断＝六份必漂的判据（本仓「一件事只有一处实现」那条）。 */
function _gSoloScore(game) {
  if (!data.games || typeof data.games !== 'object') return { best: 0, plays: 0 };
  if (!data.games.solo || typeof data.games.solo !== 'object' || Array.isArray(data.games.solo)) data.games.solo = {};
  if (!data.games.solo[game] || typeof data.games.solo[game] !== 'object') data.games.solo[game] = { best: 0, plays: 0 };
  return data.games.solo[game];
}
function _gBook(game) { return _gSkillMode(game) === 'solo' ? _gSoloScore(game) : _gScore(data.games.with, game); }
/* ---------- 棋盘尺寸：按「这块地方还剩多少」现算 ----------
   旧写法把 340px 宽／合成那 380px 高／方块那 15px 一格钉死在 CSS 与常量里：390×844 的屏上棋盘从 y=230
   才开始画、只占屏高 32%~45%，屏底还空着 150~250px——上下两层在跟棋盘抢地方（用户那句「很小、看不清」）。
   一处量法：宽＝容器盒，高＝视口底 − 它顶边 − 同面板里排在它下面那些件的高 − 面板底内距。
   四款方盘（2048／星星／拼图／连连看）与两型画布（合成／方块）都从它出发；换视口·转屏·进出沉浸整屏一律重算。
   长宽比仍按各盘自己旧钉死那两值的比（物理手感不随屏变形）——刻意不在文件顶部建一张表：连连看那一枚
   要用 LINK_COLS∶LINK_ROWS，而它们是下面那一段的 const，顶部读它＝「初始化前访问」把整块脚本崩掉。 */
function _gBoardBox(wrap) {
  const r = wrap.getBoundingClientRect();
  const pane = wrap.closest('.game-pane');
  const sc = wrap.closest('.view');                       // 真正滚的是这一面（.view{overflow:auto}）
  const cs = getComputedStyle(wrap);
  let below = 0;
  if (pane) for (const el of pane.children) {
    if (el === wrap) continue;
    const ecs = getComputedStyle(el);
    // 绝对／固定定位的兄弟是浮件（横屏整屏档把方块那列按键钉在了右侧）：不占文档流，
    // 却会被下面按 top 判成「排在棋盘下面」白吃一截高度——那一列 240+px，吃了它横屏盘面直接缩一半
    if (ecs.position === 'absolute' || ecs.position === 'fixed') continue;
    const b = el.getBoundingClientRect();
    if (b.height > 0 && b.top >= r.top - 1) below += b.height + (parseFloat(ecs.marginTop) || 0);
  }
  const w = Math.max(0, r.width - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0));
  // 高：按「这块棋盘在滚动内容里的位置」算，不按它此刻在屏上的位置算——后者会随阅读位置变，
  // 一改动就改尺寸＝上下抖（往下的件与面板底内距都要扣掉，它们此刻正占着那块地方）
  const sr = sc ? sc.getBoundingClientRect() : { top: 0 };
  const vh = sc ? sc.clientHeight : (window.visualViewport ? window.visualViewport.height : window.innerHeight);
  const top = sc ? (r.top - sr.top + sc.scrollTop) : r.top;
  const padB = pane ? (parseFloat(getComputedStyle(pane).paddingBottom) || 0) : 0;
  return { w, h: Math.max(0, vh - top - (parseFloat(cs.paddingTop) || 0) - below - padB) };
}
/* 本仓没有全局 border-box：内联 width 写的是内容宽，棋盘那圈描边会额外把总宽撑出去几像素＝横向溢出。
   故装盒时按各盘自己的描边扣一次（读数现取，不写死 1px／1.5px）。 */
function _gBoxInner(el, w) {
  const cs = getComputedStyle(el);
  return Math.max(40, w - (parseFloat(cs.borderLeftWidth) || 0) - (parseFloat(cs.borderRightWidth) || 0));
}
/* 全屏档「极限贴边」：把盘面内距与格间距各收 4px（地板 2px），让每一格在同一可用宽里更大＝真放大、不是拉长。
   普通档与横屏用各盘自己那组常量（与 games.css 内距/间距一致）；改这一处即整族生效。 */
function _gEffPG(pad, gap) {
  if (_gFull) return [Math.max(2, pad - 4), Math.max(2, gap - 4)];
  return [pad, gap];
}
/* 一格只写一处：把算好的内距/间距/格宽同时写进 CSS 变量，背景格·瓷砖·爆点全引它＝JS 与 CSS 不会各算各的 */
function _gSetCellVars(box, pad, gap, cw, ch) {
  box.style.setProperty('--pad', pad + 'px');
  box.style.setProperty('--gap', gap + 'px');
  box.style.setProperty('--cw', cw.toFixed(2) + 'px');
  box.style.setProperty('--ch', ch.toFixed(2) + 'px');
}
/* 把一块棋盘装进它的可用盒：只按可用空间算，不设魔法下限（窄屏 320 上量到的 280 就该是 280） */
function _gFitGrid(sel, ar) {
  const el = $(sel);
  if (!el || !el.parentElement) return;
  const box = _gBoardBox(el.parentElement);
  if (box.w < 40) return;                                   // 还没排版（视图刚点亮／面板藏着）：别拿 0 当读数
  const avail = _gBoxInner(el, box.w);
  // 正方口径：四款方盘的边长＝min(可用宽·可用高×ar)。**不拉非正方**（竖屏把格子拉高＝ pieces 只是变长、
  // 不是变大＝用户判定的「比例莫名其妙拉长·而不是真的放大」）。竖屏上宽是天花板·方盘本就吃满屏宽＝已尽量大。
  const w = Math.min(avail, box.h > 0 ? box.h * ar : avail);
  el.style.width = Math.round(w) + 'px';
  el.style.height = Math.round(w / ar) + 'px';
}
function _gFitBoards(game, _retry) {
  const pane = $(G_PANE[game]);
  if (!pane) return;
  if (!pane.getBoundingClientRect().width) {                 // 同一条：下一帧再量一次，量到才算
    if (!_retry) requestAnimationFrame(() => _gFitBoards(game, 1));
    return;
  }
  if (game === 'g2048') _gFitGrid('#g2048Grid', 1);
  else if (game === 'pop') _gFitGrid('#popGrid', 1);
  else if (game === 'puzzle') _gFitGrid('#puzzleGrid', 1);
  else if (game === 'link') _gFitGrid('#linkGrid', LINK_COLS / LINK_ROWS);
  else if (game === 'merge') gMergeSize();
  else if (game === 'tetris') gTetSize();
}
/* ---------- 沉浸整屏 ----------
   棋盘按视口算完，外面那一圈页面壳（顶栏 · 底栏 · 页头 · 六枚游戏 tab · 联系人行 · 皮肤面板）还在抢高度；
   这一档把那一圈摘掉，棋盘就能吃到整屏。刻意不用浏览器 Fullscreen API：安卓 WebView 各家支持不一，
   而且它没有可点的「退出」＝一个进得去出不来的开关。这里只是给 body 挂一枚属性，CSS 与 _gBoardBox 都现读，
   摘掉那条属性整族即回（同 #264 末位覆盖层那条「回退只需删一处」的规矩）。
   状态是内存态：刷新＝回普通档（屏上那枚钮写着什么就是什么，不留第二本账）。
   局内状态（六款的盘面·比分·TA 实时分）全在模块级对象里，进出整屏一律不碰——切的只是壳与尺寸。
   退出有三条路：屏上那枚钮（模式行右端）· 安卓返回键（popstate 消费那条压过的历史）· 桌面端 Esc。 */
let _gFull = false;
function _gFullIcon(on) {
  return on
    ? '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 4.5h3.5V1M11 4.5H7.5V1M1 7.5h3.5V11M11 7.5H7.5V11" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
    : '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 1H1v3.5M7.5 1H11v3.5M4.5 11H1V7.5M7.5 11H11V7.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
}
function _gFullBtnHTML() {
  return `<button type="button" class="merge-scheme gf-btn" data-gfull="1" aria-pressed="${_gFull ? 'true' : 'false'}">${_gFullIcon(_gFull)}<span>${_gFull ? '退出' : '全屏'}</span></button>`;
}
function _gSyncFull() {
  $$('[data-gfull]').forEach(b => {
    const s = b.querySelector('span'); if (s) s.textContent = _gFull ? '退出' : '全屏';
    const ic = b.querySelector('svg'); if (ic) ic.outerHTML = _gFullIcon(_gFull);
    b.setAttribute('aria-pressed', _gFull ? 'true' : 'false');
  });
  if (_gFull) document.body.dataset.gameFull = 'on'; else delete document.body.dataset.gameFull;
}
/* 六枚 tab 换过去时，各自的模式行都得有一枚这钮；只在这一处补，HTML 里不写六份（写六份＝六处要跟着改名） */
function _gEnsureFullBtn(game) {
  const pane = $(G_PANE[game]);
  const row = pane && pane.querySelector('.merge-modes');
  if (!row || row.querySelector('[data-gfull]')) return;
  row.insertAdjacentHTML('beforeend', _gFullBtnHTML());
}
function _gSetFull(on) {
  if (_gFull === on) return;
  _gFull = on;
  _gSyncFull();
  // 进出整屏都回到游戏页顶：模式行右端那枚「退出」是这一档唯一的屏上出口，
  // 普通档滚到半路才点全屏＝出口连同模式行一起在屏外，这一档就成了进得去出不来
  const scv = $('#gamesView'); if (scv) scv.scrollTop = 0;
  // 安卓返回键该先退出整屏，而不是直接把人踢出游戏页：进档压一条历史，退出时消费掉
  try { if (on) history.pushState({ gfull: 1 }, ''); else if (history.state && history.state.gfull) history.back(); } catch (e) {}
  const tab = data.games && data.games.tab;
  if (_gPhaseOf(tab) === 'playing') {
    _gFitBoards(tab);
    if (tab === 'g2048') g2048Render();
    if (tab === 'pop') _popRender();
    if (tab === 'link') _linkRender();
    if (tab === 'puzzle') _puzzleRender();
    if (tab === 'merge') gMergeDraw();
    if (tab === 'tetris') gTetDraw();
  } else _gamesRenderReady();
}
window.addEventListener('popstate', () => { if (_gFull && !(history.state && history.state.gfull)) _gSetFull(false); });



/* ---------- 开局闸门 ----------
   FIX 2026-10-08#050 此前 renderGames 无条件 boot 全部几款（切进去就已经在跑），用户要的
   「选择开始游戏就可以开始游戏」不存在这个动作。改成：未开局只画准备画面（谁 · 什么玩法 · 开始），
   点开始才 boot。一起玩/对战还要先发一封邀请，TA 应答了才真的开局；拒绝＝这局不开，仍停在准备画面。
   _gPhase: '' | 'ready' | 'waiting' | 'playing'（内存态，不进存档：重开页面又是一张干净的准备画面） */
const G_PANE = { merge: '#gameMerge', g2048: '#game2048', pop: '#gamePop', link: '#gameLink', puzzle: '#gamePuzzle', tetris: '#gameTetris' };
let _gPhase = '';        // 当前 tab 的阶段
let _gPhaseGame = '';    // 这个阶段属于哪款游戏（换 tab 即失效）
let _gAskTimer = 0;
function _gPhaseOf(game) { return (_gPhaseGame === game) ? _gPhase : ''; }
function _gSetPhase(p, game) {
  _gPhase = p || '';
  _gPhaseGame = game || '';
  if (_gAskTimer) { clearTimeout(_gAskTimer); _gAskTimer = 0; }
}
/* ---------- 面板渲染 ---------- */
function renderGames() {
  if (!data.games || !$('#gamesView')) return;
  // 一起玩的人只认单聊：旧档把群聊 id 留在 with 里（或指向已删联系人）就归位到第一个单聊
  const singles = _gSingles();
  if (!singles.some(c => c.id === data.games.with)) {
    data.games.with = (singles[0] || {}).id || 'c0';
    save();
  }
  _gamesRenderWho();
  const tabs = $$('#gamesTabs .games-tab');
  tabs.forEach(t => t.classList.toggle('active', t.dataset.game === data.games.tab));
  const tab = data.games.tab;
  const on = _gPhaseOf(tab) === 'playing';
  $('#gameMerge').hidden = tab !== 'merge' || !on;
  $('#game2048').hidden = tab !== 'g2048' || !on;
  $('#gamePop').hidden = tab !== 'pop' || !on;
  $('#gameLink').hidden = tab !== 'link' || !on;
  $('#gamePuzzle').hidden = tab !== 'puzzle' || !on;
  $('#gameTetris').hidden = tab !== 'tetris' || !on;
  const rd = $('#gamesReady');
  if (rd) rd.hidden = on;
  _gamesRenderReady();
  _gSyncFull();   // 屏上那枚钮写的必须就是此刻的状态（body 属性与卡片一同重画，不留「写着退出其实在普通档」）
  if (!on) return;   // 准备画面不 boot：不 boot 就没有 canvas 尺寸，也不会偷跑一局
  _gamesRenderTaLine(data.games.tab);
  _gFitBoards(tab);   // 先按「此刻这块地方还剩多少」定尺寸，再 boot：boot 里那些读数（画布后备存储／格宽）吃的就是这一步
  if (data.games.tab === 'merge') { gMergeBoot(); _gMergeApplyMode(); gMergeLoopKick(); if (_gMergeMode() === 'vs') _gamesEnsureChallenge('merge'); }
  if (data.games.tab === 'g2048') g2048Boot();
  if (data.games.tab === 'pop') { gPopBoot(); _gPopApplyMode(); }
  if (data.games.tab === 'link') { gLinkBoot(); _gLinkApplyMode(); }
  if (data.games.tab === 'puzzle') { gPuzzleBoot(); _gPzApplyMode(); }
  if (data.games.tab === 'tetris') { gTetBoot(); _gTetApplyMode(); gTetLoopKick(); }
  _gamesEnsureChallenge(data.games.tab);
}
/* ---------- 准备画面：游戏名 ·（和谁玩）· 什么玩法 · 开始游戏 ----------
   复用既有形制（chips 用 .games-ow，玩法用 .merge-scheme，主按钮用 .game-btn.primary），
   不另画一套：这一页刚开就看到的东西要和点开后的面板是同一套 UI。
   solo 档不画选人那一排（BUGS #302）：自己玩没有对手也没有队友，屏上留一枚「挑个人」＝让人以为这局记在谁名下。 */
function _gamesRenderReady() {
  const box = $('#gamesReady');
  if (!box) return;
  const game = data.games.tab;
  const phase = _gPhaseOf(game);
  const mode = _gSkillMode(game);
  const solo = mode === 'solo';
  const c = _gContact(data.games.with) || {};
  const sc = _gScore(data.games.with, game);
  const book = _gBook(game);          // 屏上那两个数取自哪一本＝_gBook 一处决定（solo＝公共账、vs＝那位那本）
  const co = _gCoopBook(game);
  const label = G_LABELS[game] || '游戏';
  const nm = escapeHTML(_gName(data.games.with));
  box.innerHTML =
      `<div class="gr-top"><b>${escapeHTML(label)}</b><span>${solo ? '挑玩法 · 点开始' : '挑个人 · 挑玩法 · 点开始'}</span></div>`
    + (solo ? '' : `<div class="gr-who" id="grWho">${_gSingles().map(x =>
        `<button type="button" class="games-ow${x.id === data.games.with ? ' on' : ''}" data-gwho="${x.id}"><span class="avatar">${avatarHTML(x.avatar)}</span>${escapeHTML(x.name || 'TA')}</button>`).join('')}</div>`)
    + `<div class="gr-modes" id="grModes">${['solo', 'coop', 'vs'].map(m =>
        `<button type="button" class="merge-scheme${m === mode ? ' on' : ''}" data-grmode="${m}">${G_MODE_CN[m]}</button>`).join('') + _gFullBtnHTML()}</div>`
    + `<div class="gr-note" id="grNote">${solo
        ? '自己玩 · 不惊动任何人，局终只在屏上报一声'
        : (mode === 'coop' ? '一起合作 · ' + nm + ' 答应才开局' : '比分对战 · ' + nm + ' 答应才开局')}</div>`
    + `<div class="gr-best" id="grBest">${mode === 'coop'
        ? `一起玩最高 ${co.best} · 玩过 ${co.plays} 局`
        : `最高 ${book.best} ${G_UNITS[game] || '分'} · 玩过 ${book.plays} 局${mode === 'vs' && sc.ta > 0 ? ' · TA 挑战 ' + sc.ta : ''}`}</div>`
    + `<button type="button" class="game-btn primary gr-go" id="grGo"${phase === 'waiting' ? ' disabled' : ''}>${phase === 'waiting' ? '等 TA 答应…' : (mode === 'solo' ? '开始游戏' : '邀请 ' + nm + ' 一起玩')}</button>`;
  if (phase === 'waiting') {
    const note = $('#grNote');
    if (note) note.innerHTML = '<span class="gr-wait">已发邀请 · 等 ' + nm + ' 回话</span>';
  }
}
function _gCoopBook(game) {
  const sc = _gScore(data.games.with, game);
  const co = sc.coop;
  return co && typeof co === 'object' ? co : { best: 0, plays: 0 };
}
function _gSetModeOf(game, m) {
  const setter = {
    merge: _gMergeSetMode, g2048: _g2048SetMode,
    pop: _gPopSetMode, link: _gLinkSetMode, puzzle: _gPzSetMode, tetris: _gTetSetMode
  }[game];
  if (setter) setter(m);
}
/* 点「开始游戏」：solo 立刻开局；一起玩/对战先发一封邀请到聊天，等 TA 应答 */
function _gStart(game) {
  game = game || data.games.tab;
  const mode = _gSkillMode(game);
  if (mode === 'solo') { _gBegin(game); return; }
  const cid = data.games.with;
  const label = G_LABELS[game] || '游戏';
  _gSetPhase('waiting', game);
  _gamesRenderReady();
  _deliverToChat({ id: nextId(), from: 'me', text: _gPick(G_ASK_SAY, Math.random()).replace('{g}', label) }, cid);
  _gAskTimer = setTimeout(() => {
    _gAskTimer = 0;
    if (_gPhaseOf(game) !== 'waiting' || data.games.tab !== game) return;   // 换人/换玩法/离开页面了，这条作废
    const yes = Math.random() < 0.62;
    if (yes) {
      _deliverToChat({ id: nextId(), from: 'partner', text: _gPick(G_ASK_YES, Math.random()) }, cid);
      _gBegin(game);
    } else {
      _deliverToChat({ id: nextId(), from: 'partner', text: _gPick(G_ASK_NO, Math.random()) }, cid);
      _gSetPhase('', '');   // 拒绝＝这局不开，回到准备画面等下一次
      renderGames();
      showToast('TA 这会儿不想玩 · 这局没开成');
    }
  }, 2000 + Math.random() * 4000);
}
function _gBegin(game) {
  _gSetPhase('playing', game);
  renderGames();
  showToast(G_LABELS[game] + ' 开始');
}
function _gamesRenderWho() {
  const box = $('#gamesWho');
  if (!box) return;
  box.innerHTML = _gSingles().map(c =>
    `<button type="button" class="games-ow${c.id === data.games.with ? ' on' : ''}" data-gwho="${c.id}"><span class="avatar">${avatarHTML(c.avatar)}</span>${escapeHTML(c.name || 'TA')}</button>`
  ).join('');
  // 提示行不再占一屏（#gamesWhoHint 恒空由 CSS :empty 隐藏）：挑战行已带「谁 · 挑战多少 · 实时比分」，收件人在场景卡里说
}
function _gSkillMode(game) {   // 六款技巧游戏的当前模式
  return game === 'merge' ? _gMergeMode() : game === 'g2048' ? _g2048Mode()
    : game === 'pop' ? _gPopMode() : game === 'link' ? _gLinkMode() : game === 'puzzle' ? _gPzMode()
    : game === 'tetris' ? _gTetMode() : 'solo';
}
function _gLineBox(game) { return '#taLine' + (game === 'g2048' ? '2048' : game.charAt(0).toUpperCase() + game.slice(1)); }
/* 玩法决定「跟人有关的那几件」露不露（BUGS #302）：自己玩＝不画那一行换人／对战读数（它说的就是「和谁」），
   也不画「告诉 TA」（那件事本质是给某人看我的成绩）。六款各写一遍必漂，收成这一处——renderGames 与各款 applyMode 都调它。 */
function _gModeChrome(game) {
  const mode = _gSkillMode(game);
  const tl = $(_gLineBox(game));
  if (tl) tl.hidden = mode !== 'vs';
  const pane = $(G_PANE[game]);
  if (pane) pane.querySelectorAll('[data-gshare]').forEach(b => { b.hidden = mode === 'solo'; });
  if (mode === 'solo') { const w = $('#gamesWho'); if (w) w.hidden = true; }   // 换人 chips 的入口就是那行头像，行没了 chips 不许留在屏上
  _gEnsureFullBtn(game);
  return mode;
}
function _gamesRenderTaLine(game) {
  _gModeChrome(game);
  if (_gSkillMode(game) !== 'vs') return;   // solo 不出现这一行；合作那一行由各自的 coopLine 说
  const box = $(_gLineBox(game));
  if (!box) return;
  const c = _gContact(data.games.with) || {};
  const sc = _gScore(data.games.with, game);
  const last = _gLast[game];
  const L = _gLive[game];
  let right, cap, note, hot = false;
  if (L && L.playing) {
    right = L.score; cap = '实时'; hot = true;
    note = '正在和你同时玩 · 挑战 ' + (sc.ta > 0 ? sc.ta : '–');
  } else if (L && L.done && last && last.taScore != null) {
    right = last.taScore; cap = '终局'; hot = !last.win;
    note = (last.win ? '你赢了 · ' : 'TA 赢了 · ') + (L.note || 'TA 的成绩定格');
  } else if (sc.ta > 0) {
    right = sc.ta; cap = '挑战';
    note = last && last.beaten ? '「行，这把我认了」' : '「先过了我这一关再说」';
  } else {
    right = '–'; cap = '挑战'; note = '正在想一个数……';
  }
  box.className = 'ta-line' + (last && (last.beaten || last.win) ? ' done' : '');
  box.innerHTML = `<span class="avatar">${avatarHTML(c.avatar)}</span>`
    + `<div class="ta-tt"><b>${escapeHTML(_gName(data.games.with))}</b><span>${note}</span></div>`
    + `<div class="ta-score${hot ? ' live' : ''}"><b>${right}</b><span>${cap}</span></div>`;
}
function _gamesSetTab(g) {
  if (!G_PANE[g]) return;   // 只认在册的几款：切到已下线那两款＝换成一屏空白，不受理（BUGS #297）
  if (data.games.tab === g) return;
  data.games.tab = g;
  save();
  // 换游戏＝上一局的阶段（尤其「等 TA 答应」）随之作废，否则那句迟到的应答会去开另一款游戏
  _gSetPhase(_gPhaseOf(g), g);
  renderGames();
}
function _gamesSetWho(cid) {
  if (!cid || cid === data.games.with) return;
  if (!_gSingles().some(c => c.id === cid)) return;   // 群聊不接（chips 里也不会出现，防御手拼调用）
  data.games.with = cid;
  save();
  const wRow = $('#gamesWho');
  if (wRow) wRow.hidden = true;   // 选完人把 chips 收回去
  // 准备画面上换人：只换「和谁」，没开局的东西不该在这里被重开
  if (_gPhaseOf(data.games.tab) !== 'playing') {
    _gSetPhase('', '');
    renderGames();
    return;
  }
  // 换人＝换队友/换对手：这一局的账（合作的「我们」／对战的实时比分）不能记到新人头上，非单人档就地重开一局
  if (data.games.tab === 'g2048' && _g2048Mode() !== 'solo' && _g2048.tiles) g2048Restart();
  if (data.games.tab === 'pop' && _gPopMode() !== 'solo' && _pop.cells) gPopRestart();
  if (data.games.tab === 'link' && _gLinkMode() !== 'solo' && _link.tiles) gLinkRestart();
  if (data.games.tab === 'puzzle' && _gPzMode() !== 'solo' && _puzzle.cells) gPuzzleRestart();
  if (data.games.tab === 'tetris' && _gTetMode() !== 'solo' && _tet.g) gTetRestart();
  renderGames();   // 整页重渲：邮差场景卡的收件人、chips 高亮、挑战行全部即时跟手
  showToast('现在和 ' + _gName(cid) + ' 一起玩');
}

/* ---------- TA 实时对局：你玩的同时 TA 也在玩（本地随机模拟，无任何网络） ----------
   你落第一子 TA 开局，成绩每秒跳动走向一个隐含目标（绕着挑战分±50% 抽签）；
   你局终那一刻 TA 同步定格，比分定胜负。 */
const _gLive = {};   // { [game]: {score, target, playing, done, note, t} }
let _gLiveTimer = 0;
function _gTaTarget(game) {
  const sc = _gScore(data.games.with, game);
  const base = sc.ta > 0 ? sc.ta : ({ g2048: 300, merge: 160, pop: 900, link: 260, puzzle: 280, tetris: 1200 }[game]);
  return Math.max(1, Math.round(base * (0.75 + Math.random() * 0.5)));
}
function _gTaLiveStart(game) {
  const L = _gLive[game];
  if (L && L.playing) return;
  _gLive[game] = { score: 0, target: _gTaTarget(game), playing: true, done: false, note: '', t: 0 };
  if (!_gLiveTimer) _gLiveTimer = setInterval(_gLiveTick, 1000);
  if (document.body.dataset.view === 'games' && data.games.tab === game) _gamesRenderTaLine(game);
}
function _gLiveTick() {
  let any = false;
  for (const game of G_SKILLS) {
    const L = _gLive[game];
    if (!L || !L.playing) continue;
    any = true;
    L.t++;
    L.score += game === 'g2048' ? 6 + Math.floor(Math.random() * 16) : game === 'pop' ? 16 + Math.floor(Math.random() * 38) : game === 'link' ? 8 + Math.floor(Math.random() * 20) : game === 'tetris' ? 12 + Math.floor(Math.random() * 28) : game === 'puzzle' ? 4 + Math.floor(Math.random() * 10) : 3 + Math.floor(Math.random() * 9);
    if (Math.random() < 0.1) L.score += 24 + Math.floor(Math.random() * 40);
    if (L.score >= L.target) { L.score = L.target; L.playing = false; L.done = true; }
    if (document.body.dataset.view === 'games' && data.games.tab === game) _gamesRenderTaLine(game);
  }
  if (!any && _gLiveTimer) { clearInterval(_gLiveTimer); _gLiveTimer = 0; }
}
function _gTaLiveFinal(game) {   // 你的局终了：TA 同步定格（没玩完的也按当前成绩收）
  const L = _gLive[game];
  if (!L) return null;
  if (L.playing) { L.playing = false; L.done = true; }
  return L.score;
}

/* ---------- 挑战分 ----------
   FIX 2026-10-08#050 挑战卡此前由 _gamesEnsureChallenge 挂在 8~28 秒的定时器上，局中随时往聊天
   里丢一条「来比比？」。现在只在**局外**（准备画面里挑玩法时 / 局终收尾后）立挑战并落卡，
   局中一律不发——见 _gEndReport。 */
const _gLast = {};   // 本局结果缓存：{score, beaten}，restart 清空
let _gTaTimers = {};
function _gamesEnsureChallenge(game) {
  const cid = data.games.with;
  if (!G_START_TA[game]) return;   // 小鸟邮差不比大小＝没有起点分这一档，没起点就别立（旧写法在定时器里拿 undefined 抽数，抛一次未捕获 TypeError）
  if (_gPhaseOf(game) === 'playing') return;   // 局中不打扰
  const sc = _gScore(cid, game);
  if (sc.ta > 0) return;
  if (_gTaTimers[cid + game]) return;
  _gTaTimers[cid + game] = setTimeout(() => {
    delete _gTaTimers[cid + game];
    if (!data.games || !data.contacts) return;
    if (_gPhaseOf(game) === 'playing') return;   // 定时器等的那段时间里可能已经点开始进了局，作废
    if (game === 'merge' && _gMergeMode() !== 'vs') return;   // 合成的挑战只属对战模式
    if (game === 'g2048' && _g2048Mode() !== 'vs') return;    // 2048 同上：自己玩与合作都不立挑战分
    if (game === 'pop' && _gPopMode() !== 'vs') return;       // 消灭星星同上
    if (game === 'link' && _gLinkMode() !== 'vs') return;     // 连连看同上
    if (game === 'puzzle' && _gPzMode() !== 'vs') return;     // 滑块拼图同上
    if (game === 'tetris' && _gTetMode() !== 'vs') return;    // 俄罗斯方块同上
    const s = _gScore(cid, game);
    if (s.ta > 0) return;
    const range = G_START_TA[game];
    let ta;
    if (s.best > 0) ta = Math.ceil(s.best * (1.2 + Math.random() * 0.4) / 10) * 10;
    else ta = _gPick(range, Math.random());
    s.ta = ta;
    save();
    _deliverToChat({
      id: nextId(), from: 'partner',
      text: _gPick(G_CHALLENGE_SAY[game], Math.random()).replace('{n}', ta),
      game: { kind: 'challenge', game, ta }
    }, cid);
    if (document.body.dataset.view === 'games') { _gamesRenderTaLine(game); _gamesRenderWho(); }
  }, 8000 + Math.random() * 20000);
}

/* ---------- 战绩分享 ---------- */
function _gShare(game) {
  if (game === 'g2048' && _g2048Mode() === 'coop') { _g2048CoopShare(); return; }   // 合作的账不在个人 best 上，另走一句
  if (game === 'pop' && _gPopMode() === 'coop') { _gPopCoopShare(); return; }
  if (game === 'link' && _gLinkMode() === 'coop') { _gLinkCoopShare(); return; }
  if (game === 'puzzle' && _gPzMode() === 'coop') { _gPzCoopShare(); return; }
  if (game === 'tetris' && _gTetMode() === 'coop') { _gTetCoopShare(); return; }
  const last = _gLast[game];
  const sc = _gScore(data.games.with, game);
  const score = last ? last.score : sc.best;
  if (!score) { showToast('先玩一局再告诉 TA'); return; }
  const beaten = sc.ta > 0 && score >= sc.ta;
  const isBest = score >= sc.best && score > 0;
  _deliverToChat({
    id: nextId(), from: 'me',
    text: beaten ? '挑战成功！' : (last && last.taScore != null ? (last.win ? '这局比你多，服不服？' : '这局输你一分都不止…再来') : '给你看我的成绩：'),
    game: { kind: 'score', game, score, best: sc.best, ta: sc.ta, beaten, newBest: isBest && score === sc.best && last, taScore: last && last.taScore, win: last && last.win }
  }, data.games.with);
  const delay = 1400 + Math.random() * 2600;
  setTimeout(() => {
    if (!data.games || !data.contacts) return;
    const s = _gScore(data.games.with, game);
    let say;
    if (beaten) {
      say = _gPick(G_SAY.beat, Math.random());
      s.ta = 0;   // 旧挑战作废，TA 缓一会儿重立更高的
      delete _gLast[game];
      save();
      setTimeout(() => {
        if (!data.games) return;
        _gamesEnsureChallenge(game);
        if (document.body.dataset.view === 'games' && data.games.tab === game) _gamesRenderTaLine(game);
      }, 30000 + Math.random() * 40000);
    } else if (last && last.taScore != null && last.win === false) say = _gPick(G_SAY.lose, Math.random());
    else if (last && last.taScore != null && last.win) say = _gPick(G_SAY.best, Math.random());   // 实时对局你赢了：TA 不服但认
    else if (isBest && last) say = _gPick(G_SAY.best, Math.random());
    else if (s.ta > 0 && score < s.ta * 0.6) say = _gPick(G_SAY.lose, Math.random());
    else say = _gPick(G_SAY.mid, Math.random());
    _deliverToChat({ id: nextId(), from: 'partner', text: say }, data.games.with);
  }, delay);
  showToast('战绩已发给 ' + _gName(data.games.with));
}

/* ================= 2048 =================
   瓷砖带身份（id）随 DOM 节点常驻，位移靠 transform 过渡滑动；合并=两块滑到同格后新值弹跳，
   新生的格子回弹登场。图片皮肤：data.games.g2048Skins[数字]=dataURL，有图的瓷砖以图为本体＋角标数字。
   三模式（与合成大西瓜同源口径）：solo=自己玩；coop=和 TA 严格轮流推同一块棋盘，分数合成一笔「我们」；
   vs=比分对战（你滑你的、TA 那边实时跳分，终局比大小）。coop 成绩单独记在 scores[cid].g2048.coop，
   不污染个人 best／挑战分——一把合作局的高分不是你的技巧水平。 */
const _g2048 = { tiles: null, score: 0, over: false, _id: 0, _els: new Map(), prev: null, bestTier: 0,
  mode: 'solo', turn: 'me', taTimer: 0, lastTa: '', gotTile: false };
const G2048_PAD = 10, G2048_GAP = 9;   // 与 games.css .g2048-grid/.g2048-bg 的内距与格间距一致
const G2048_DIR_CN = { left: '左', right: '右', up: '上', down: '下' };
function g2048Boot(force) {
  g2048RenderSkins();
  _g2048SchemesInit();
  if (_g2048.tiles && !force) { _g2048ApplyMode(); g2048Render(); return; }
  g2048Restart();
}
function _g2048SchemesInit() {
  if (!data.games.g2048Skins || typeof data.games.g2048Skins !== 'object' || Array.isArray(data.games.g2048Skins)) data.games.g2048Skins = {};
  if (!Array.isArray(data.games.g2048SkinSchemes)) data.games.g2048SkinSchemes = [];
  else data.games.g2048SkinSchemes = data.games.g2048SkinSchemes.filter(s => s && typeof s === 'object' && typeof s.id === 'string' && s.name && typeof s.skins === 'object' && s.skins && !Array.isArray(s.skins)).slice(0, 6);
  if (typeof data.games.g2048SkinScheme !== 'string') data.games.g2048SkinScheme = '';
  // 方案体系之前传过的散装一套，自动收进「方案 1」保住
  if (!data.games.g2048SkinSchemes.length && Object.keys(data.games.g2048Skins).length) {
    data.games.g2048SkinSchemes.push({ id: 'gs' + Date.now().toString(36), name: '方案 1', skins: Object.assign({}, data.games.g2048Skins) });
    data.games.g2048SkinScheme = data.games.g2048SkinSchemes[0].id;
    save();
  }
}
function g2048Restart() {
  _g2048.tiles = [];
  _g2048.score = 0;
  _g2048.over = false;
  _g2048.gotTile = false;   // 本局成就标记随新局清（FIX #050：局终那条才报成就）
  _g2048.prev = null;
  _g2048.bestTier = 0;
  if (_g2048.taTimer) { clearTimeout(_g2048.taTimer); _g2048.taTimer = 0; }   // TA 那一手还在路上就作废
  _g2048.turn = 'me';
  _g2048.lastTa = '';
  if (_g2048._els) _g2048._els.forEach(el => el.remove());
  _g2048._els = new Map();
  delete _gLast.g2048;
  delete _gLive.g2048;   // TA 的实时对局跟着这局重来
  const ov = $('#g2048Over');
  if (ov) ov.textContent = '';
  g2048Spawn(); g2048Spawn();
  g2048Render();
  _g2048ApplyMode();
}
function g2048Spawn() {
  const used = new Set(_g2048.tiles.filter(t => !t.dead).map(t => t.r * 4 + t.c));
  const empty = [];
  for (let i = 0; i < 16; i++) if (!used.has(i)) empty.push(i);
  if (!empty.length) return;
  const idx = empty[Math.floor(Math.random() * empty.length)];
  _g2048.tiles.push({ id: ++_g2048._id, v: Math.random() < 0.9 ? 2 : 4, r: Math.floor(idx / 4), c: idx % 4, spawn: true });
}
function _g2048Color(v) {
  const map = { 2: '#f6f3ea', 4: '#f0e8d5', 8: '#e9d9b4', 16: '#e0be8a', 32: '#d9a06b', 64: '#cf7f52', 128: '#c0614a', 256: '#b34f42', 512: '#a83f3a', 1024: '#9c3040', 2048: '#8c2238' };
  return map[v] || '#6e1a30';
}
function _g2048TileSkin(el, t) {
  const img = (data.games.g2048Skins || {})[t.v];
  if (img) {
    el.style.background = 'var(--surface)';
    el.innerHTML = `<img src="${img}" alt="" draggable="false"><i class="g2048-num">${t.v}</i>`;
    return;
  }
  el.style.background = _g2048Color(t.v);
  const fs = t.v >= 1024 ? 16 : (t.v >= 128 ? 19 : 22);
  el.innerHTML = `<b style="font-size:${fs}px;color:${t.v <= 4 ? '#1a1c22' : '#fff'}">${t.v}</b>`;
}
function g2048Render() {
  const box = $('#g2048Grid');
  // 没开局就没有棋盘可画：窗口的 resize 处理器会在这一刻叫到这里（面板还藏着、_g2048.tiles 是 null），
  // 不判空就是 `for (const t of null)` 抛 TypeError。另外几款靠 *Geom() 拿不到尺寸自己早退，只有这一款
  // 宽度给了 `|| 320` 兜底，所以守卫必须写在这里。
  if (!box || !_g2048.tiles) return;
  let bg = box.querySelector('.g2048-bg');
  if (!bg) {
    bg = document.createElement('div');
    bg.className = 'g2048-bg';
    bg.innerHTML = '<i></i>'.repeat(16);
    box.appendChild(bg);
  }
  const W = box.clientWidth || 320, H = box.clientHeight || W;
  const pg = _gEffPG(G2048_PAD, G2048_GAP), PAD = pg[0], GAP = pg[1];
  const cw = (W - PAD * 2 - GAP * 3) / 4;
  const ch = (H - PAD * 2 - GAP * 3) / 4;
  _gSetCellVars(box, PAD, GAP, cw, ch);   // 同一组读数写进 --pad/--gap/--cw/--ch，背景与瓷砖都引它
  const posOf = t => `translate(${Math.round(t.c * (cw + GAP))}px,${Math.round(t.r * (ch + GAP))}px)`;
  const els = _g2048._els;
  const alive = new Set();
  for (const t of _g2048.tiles) {
    if (t.dead) {
      const el = els.get(t.id);
      if (el) { el.style.transform = posOf(t); els.delete(t.id); setTimeout(() => el.remove(), 220); }
      continue;
    }
    let el = els.get(t.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'g2048-tile';
      el.dataset.tid = t.id;
      els.set(t.id, el);
      box.appendChild(el);
    }
    alive.add(t.id);
    if (t.mergedNow) { el.classList.remove('merged'); void el.offsetWidth; el.classList.add('merged'); }   // 已有节点要重触发弹跳
    else if (t.spawn) el.classList.add('spawn');
    _g2048TileSkin(el, t);
    el.style.transform = posOf(t);
    t.spawn = false; t.mergedNow = false;
  }
  els.forEach((el, id) => { if (!alive.has(id)) { el.remove(); els.delete(id); } });
  _g2048.tiles = _g2048.tiles.filter(t => !t.dead);
}
function _g2048ScoreView(bump) {
  const wrap = $('#g2048ScoreWrap');
  const coop = _g2048Mode() === 'coop';
  if (wrap) {
    // 名字不放这一行（长昵称会把行挤爆），合作那句只说规则；是谁在合作由上面那一行说
    wrap.innerHTML = (coop ? '我们 <b id="g2048Score">' : '本局 <b id="g2048Score">')
      + _g2048.score + '</b> · ' + (coop ? '一人一手' : '滑动合并');
  }
  const el = $('#g2048Score');
  if (!el) return;
  if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}
function _g2048FloatScore(n, r, c) {   // 飘在合并发生的那一格（不给坐标则维持右上角旧位）
  const box = $('#g2048Grid');
  if (!box) return;
  const f = document.createElement('span');
  f.className = 'g2048-float';
  f.textContent = '+' + n;
  if (r != null) {
    const g = _g2048Geom();
    if (g) {
      f.style.left = (c * g.sx + g.cw / 2) + 'px';
      f.style.top = (r * g.sy + g.ch / 2) + 'px';
    }
  }
  box.appendChild(f);
  setTimeout(() => f.remove(), 800);
}
function g2048RefreshStat() {
  const el = $('#g2048Stat');
  if (!el) return;
  const cid = data.games.with;
  if (_g2048Mode() === 'coop') {
    const co = _g2048CoopScore(cid);
    el.textContent = `合作最高 ${co.best} 分 · ${co.plays} 局${co.tile ? ' · 一起合出过 2048' : ''}`;
    _g2048CoopRender();
    return;
  }
  const sc = _gBook('g2048');   // 自己玩读公共那本、对战读那位那本（BUGS #302）：口径只有 _gBook 一处
  el.textContent = `最高 ${sc.best} · ${sc.plays} 局${_g2048Mode() === 'vs' && sc.ta > 0 ? ` · 挑战 ${sc.ta}` : ''}`;
}
function _g2048Step(dir) {   // 走一步的核心（你和 TA 共用同一条）：只动棋盘、只回读数，落子与重画交给调用方
  const cells = new Map();
  _g2048.tiles.forEach(t => cells.set(t.r * 4 + t.c, t));
  let moved = false, gain = 0;
  const born = [];   // 本步合并出的新值（爆点＋里程碑用）
  // 四条线各按「靠边先落位」的顺序排出坐标；线内紧凑合并，合过的格子本回合不再吃
  for (let i = 0; i < 4; i++) {
    const line = [];
    for (let j = 0; j < 4; j++) {
      if (dir === 'left') line.push([i, j]);
      else if (dir === 'right') line.push([i, 3 - j]);
      else if (dir === 'up') line.push([j, i]);
      else line.push([3 - j, i]);
    }
    let slot = 0, last = null;
    for (const [r, c] of line) {
      const t = cells.get(r * 4 + c);
      if (!t) continue;
      const [tr, tc] = line[slot];
      if (last && last.v === t.v && !last.mergedNow) {
        t.r = tr; t.c = tc; t.dead = true;          // 滑过去被吞
        last.v *= 2; last.mergedNow = true;          // 留下的原地翻倍＋弹一下
        gain += last.v; moved = true;
        born.push(last);
      } else {
        if (t.r !== tr || t.c !== tc) moved = true;
        t.r = tr; t.c = tc;
        last = t; slot++;
      }
    }
  }
  return { moved, gain, born };
}
function _g2048AfterMove(res, byTa) {   // 落子→重画→爆点→里程碑：你和 TA 走同一条，不另做第二份
  if (res.gain) {
    _g2048.score += res.gain;
    const at = res.born[0];   // 浮字落在本手第一处合并的新格上（一次多合取第一处）
    if (at) _g2048FloatScore(res.gain, at.r, at.c); else _g2048FloatScore(res.gain);
  }
  g2048Spawn();
  g2048Render();
  // 一滑可能合出好几处，只响一发，音高取这一手里最大的那一格——几十发一起响就成了噪声
  if (res.born.length) {
    let top = 0;
    res.born.forEach(t => { if (t.v > top) top = t.v; });
    const firstBig = res.born.some(t => t.v > _g2048.bestTier && t.v >= 128);
    playSfx(firstBig ? 'mile' : 'blend', { step: _gSfxStep(Math.log2(top)), weak: !!byTa });
  }
  res.born.forEach(t => {
    _g2048Burst(t);
    if (t.v > _g2048.bestTier && t.v >= 128) {
      _g2048.bestTier = t.v;
      showToast('本局首次合出 ' + t.v + '！');
      if (_g2048Mode() === 'coop') _g2048CoopMilestone(t.v);   // 只记成就不说话，见该函数
    }
  });
  _g2048ScoreView(!!res.gain);
  g2048RefreshStat();
}
function g2048Move(dir) {
  if (_g2048.over || !_g2048.tiles) return;
  const mode = _g2048Mode();
  if (mode === 'coop' && _g2048.turn === 'ta') return;   // 轮到 TA：你这一滑不算数，上面那行写着「TA 正在想」
  const snap = _g2048.tiles.filter(t => !t.dead).map(t => ({ v: t.v, r: t.r, c: t.c }));   // 撤销快照（走之前那步）
  const snapScore = _g2048.score;
  const res = _g2048Step(dir);
  if (!res.moved) {
    // 无路可走也是局终（满盘且四向都不能动）：用户再滑也不会有变化，就地结算
    if (_g2048Stuck()) _g2048Finish();
    return;
  }
  // 快照只按「你这手之前」留：合作里撤销要连 TA 那手一起退，退回到还能轮到你滑的状态
  _g2048.prev = { tiles: snap, score: snapScore };
  if (mode === 'vs') _gTaLiveStart('g2048');   // 对战：你落第一子，TA 那边才开始实时玩（自己玩/合作都不长这一条线）
  _g2048AfterMove(res);
  if (_g2048Stuck()) { _g2048Finish(); return; }
  if (mode === 'coop') _g2048TaSchedule();
}

/* ---------- 2048 三模式（chips 复用合成的 .merge-modes/.merge-scheme，零新 CSS） ---------- */
function _g2048Mode() {
  const m = data.games && data.games.g2048Mode;
  return ['solo', 'coop', 'vs'].includes(m) ? m : 'solo';   // 老档缺字段与脏值一律回落自己玩
}
function _g2048CoopScore(cid) {   // 合作成绩单独记账：一把合作局的高分不是你的技巧水平，不进个人 best／挑战那套
  const sc = _gScore(cid, 'g2048');
  if (!sc.coop || typeof sc.coop !== 'object' || Array.isArray(sc.coop)) sc.coop = { best: 0, plays: 0, tile: false };
  const co = sc.coop;
  if (typeof co.best !== 'number' || !isFinite(co.best) || co.best < 0) co.best = 0;
  if (typeof co.plays !== 'number' || !isFinite(co.plays) || co.plays < 0) co.plays = 0;
  if (co.tile !== true) co.tile = false;
  return co;
}
function _g2048ApplyMode() {
  const mode = _g2048Mode();
  _g2048.mode = mode;
  _g2048.turn = 'me';
  _gModeChrome('g2048');   // 那一行只属对战（BUGS #302）：自己玩不出现、合作由 coopLine 那条说
  const cl = $('#coopLine2048'); if (cl) cl.hidden = mode !== 'coop';
  $$('#g2048Modes .merge-scheme').forEach(b => b.classList.toggle('on', b.dataset.gmode === mode));
  _g2048ScoreView(false);
  if (mode === 'coop') _g2048CoopRender(); else _gamesRenderTaLine('g2048');
  g2048RefreshStat();
}
function _g2048SetMode(m) {
  if (!['solo', 'coop', 'vs'].includes(m) || _g2048Mode() === m) return;
  data.games.g2048Mode = m;
  save();
  g2048Restart();   // 三种玩法的棋盘状态不能混用（合作里切回自己玩＝TA 那一手没人接），换模式即重开一局
}
function _g2048CoopRender() {
  const box = $('#coopLine2048');
  if (!box) return;
  const c = _gContact(data.games.with) || {};
  const nm = _gName(data.games.with);
  let say;
  if (_g2048.over) say = '这局推完了 · 重新开始或换个玩法';
  else if (_g2048.turn === 'ta') say = nm + ' 正在想往哪儿推…';
  else if (_g2048.lastTa) say = 'TA 刚往' + _g2048.lastTa + '推了一把 · 该你了';
  else say = '你滑一手，TA 滑一手';
  box.innerHTML = `<span class="avatar">${avatarHTML(c.avatar)}</span>`
    + `<div class="ta-tt"><b>和 ${escapeHTML(nm)} 一起</b><span>${escapeHTML(say)}</span></div>`
    + `<div class="ta-score${_g2048.over ? '' : ' live'}"><b>${_g2048.score}</b><span>我们</span></div>`;
}
function _g2048CoopMilestone(v) {   // FIX 2026-10-08#050 只记成就，不往聊天发：这一局还没结束
  const co = _g2048CoopScore(data.games.with);
  if (v === 2048 && !co.tile) { co.tile = true; save(); }   // 双人成就只记一次，说话留到局终
  if (v === 2048) _g2048.gotTile = true;   // 本局达成（gotTile 随 restart 清，co.tile 是跨局的）
}
function _g2048CoopEnd(score) {
  const co = _g2048CoopScore(data.games.with);
  co.plays++;
  if (score > co.best) co.best = score;
  _gLast.g2048 = { score, coop: true };
  save();
  playSfx('over');
  g2048RefreshStat();
  _gEndReport('g2048', score, { coop: true, ach: _g2048.gotTile ? G_COOP_ACH.g2048 : null });
}
function _g2048CoopShare() {   // 「告诉 TA」在合作里报的是我们那一笔，不是你的个人最高
  const co = _g2048CoopScore(data.games.with);
  const score = _g2048.score || co.best;
  if (!score) { showToast('先一起推一局再告诉 TA'); return; }
  const cid = data.games.with;
  _deliverToChat({
    id: nextId(), from: 'me', text: '这局是我们俩推的，' + score + ' 分',
    game: { kind: 'score', game: 'g2048', score, best: co.best, ta: 0, beaten: false, newBest: score >= co.best && score > 0 }
  }, cid);
  setTimeout(() => {
    if (!data.games || !data.contacts) return;
    _deliverToChat({ id: nextId(), from: 'partner', text: _gPick(G_COOP_SHARE, Math.random()) }, cid);
  }, 1400 + Math.random() * 2600);
  showToast('已发给 ' + _gName(cid));
}

/* ---------- 合作里 TA 的那一手：四个方向各演一遍挑局面最好的 ----------
   它是人不是引擎，故 12% 随手一推，并在读数差不多的几手里随机取一个。 */
const G2048_SNAKE = [15, 14, 13, 12, 8, 9, 10, 11, 7, 6, 5, 4, 0, 1, 2, 3];   // 蛇形位权：大数往角上堆
function _g2048GridOf() {
  const g = new Array(16).fill(0);
  _g2048.tiles.forEach(t => { if (!t.dead) g[t.r * 4 + t.c] = t.v; });
  return g;
}
function _g2048Sim(g0, dir) {   // 在一个 16 格数组上演一遍，不碰真棋盘
  const out = new Array(16).fill(0);
  let gain = 0, moved = false;
  for (let i = 0; i < 4; i++) {
    const idx = [];
    for (let j = 0; j < 4; j++) {
      idx.push(dir === 'left' ? i * 4 + j : dir === 'right' ? i * 4 + 3 - j : dir === 'up' ? j * 4 + i : (3 - j) * 4 + i);
    }
    const vals = idx.map(k => g0[k]).filter(v => v);
    const line = [];
    for (let k = 0; k < vals.length; k++) {
      if (k + 1 < vals.length && vals[k] === vals[k + 1]) { line.push(vals[k] * 2); gain += vals[k] * 2; k++; }
      else line.push(vals[k]);
    }
    for (let j = 0; j < 4; j++) {
      const v = line[j] || 0;
      out[idx[j]] = v;
      if (v !== g0[idx[j]]) moved = true;
    }
  }
  return { g: out, gain, moved };
}
function _g2048Eval(g, gain) {
  let s = 0, empty = 0, mx = 0;
  for (let i = 0; i < 16; i++) {
    const v = g[i];
    if (!v) { empty++; continue; }
    s += G2048_SNAKE[i] * v;
    if (v > mx) mx = v;
  }
  return s + empty * 900 + gain * 240 + mx * 12;
}
function _g2048TaPick() {
  const g0 = _g2048GridOf();
  const legal = [];
  for (const dir of ['left', 'right', 'up', 'down']) {
    const s = _g2048Sim(g0, dir);
    if (s.moved) legal.push({ dir, v: _g2048Eval(s.g, s.gain) });
  }
  if (!legal.length) return '';
  if (Math.random() < 0.12) return legal[Math.floor(Math.random() * legal.length)].dir;   // 偶尔随手一推
  legal.sort((a, b) => b.v - a.v);
  const near = legal.filter(x => legal[0].v - x.v <= 1200);
  return near[Math.floor(Math.random() * near.length)].dir;
}
function _g2048TaSchedule() {
  if (_g2048.taTimer) clearTimeout(_g2048.taTimer);   // 只许一发在飞：切走再切回不该攒出两手
  _g2048.turn = 'ta';
  _g2048CoopRender();
  _g2048.taTimer = setTimeout(_g2048TaMove, 760 + Math.random() * 1000);   // 想一下，但不钉死一个数
}
function _g2048TaMove() {
  _g2048.taTimer = 0;
  _g2048.turn = 'me';
  // 不在这一页就不推：TA 不隔着页面动你的棋盘（这一手就此作废，回来照常轮到你）
  if (_g2048Mode() !== 'coop' || _g2048.over || data.games.tab !== 'g2048' || document.body.dataset.view !== 'games') return;
  const dir = _g2048TaPick();
  if (!dir) { _g2048Finish(); return; }   // 四向都推不动＝局终
  const res = _g2048Step(dir);
  if (!res.moved) { _g2048CoopRender(); return; }
  _g2048.lastTa = G2048_DIR_CN[dir] || '';
  _g2048AfterMove(res, true);
  if (_g2048Stuck()) { _g2048Finish(); return; }
  _g2048CoopRender();
}
function _g2048Finish() {
  if (_g2048.over) return;
  _g2048.over = true;
  if (_g2048.taTimer) { clearTimeout(_g2048.taTimer); _g2048.taTimer = 0; }
  _g2048.turn = 'me';
  const mode = _g2048Mode();
  if (mode === 'coop') _g2048CoopEnd(_g2048.score);
  else _gGameEnd('g2048', _g2048.score, mode === 'solo' ? { noTa: true } : undefined);
  _g2048OverView();
}
function _g2048Geom() {   // 棋盘几何（瓷砖定位与爆点共用）：PAD/GAP 改动须与 games.css 同步；内距随全屏档现算（见 _gEffPG）
  const box = $('#g2048Grid');
  if (!box) return null;
  const W = box.clientWidth || 320, H = box.clientHeight || W;
  const pg = _gEffPG(G2048_PAD, G2048_GAP), PAD = pg[0], GAP = pg[1];
  const cw = (W - PAD * 2 - GAP * 3) / 4;
  const ch = (H - PAD * 2 - GAP * 3) / 4;
  return { box, pad: PAD, gap: GAP, cw, ch, sx: cw + GAP, sy: ch + GAP };
}
function _g2048Burst(t) {   // 合并处的扩散光环（纯 CSS 动画，一瞬即逝）
  const g = _g2048Geom();
  if (!g) return;
  const b = document.createElement('i');
  b.className = 'g2048-burst' + (t.v >= 128 ? ' gold' : '');
  b.style.width = g.cw + 'px';
  b.style.height = g.ch + 'px';
  b.style.transform = `translate(${Math.round(t.c * g.sx)}px,${Math.round(t.r * g.sy)}px)`;
  g.box.appendChild(b);
  setTimeout(() => b.remove(), 520);
}
function g2048Undo() {   // 撤销一步：只退棋盘与分数，不退已结算的局数与挑战
  if (!_g2048.prev || !_g2048.tiles) return;
  const prev = _g2048.prev;
  _g2048.prev = null;
  if (_g2048.taTimer) { clearTimeout(_g2048.taTimer); _g2048.taTimer = 0; }   // 合作里连 TA 那手一起退，就别让它在路上再补一手
  _g2048.turn = 'me';
  _g2048.lastTa = '';
  _g2048.tiles.forEach(t => { const el = _g2048._els.get(t.id); if (el) el.remove(); });
  _g2048._els.clear();
  _g2048.tiles = prev.tiles.map(s => ({ id: ++_g2048._id, v: s.v, r: s.r, c: s.c }));
  _g2048.score = prev.score;
  _g2048.over = false;
  const ov = $('#g2048Over');
  if (ov) ov.textContent = '';
  g2048Render();
  _g2048ScoreView(false);
  g2048RefreshStat();
  showToast(_g2048Mode() === 'coop' ? '退回你上一手之前（TA 那手也跟着退）' : '退回一步');
}
function _g2048OverView() {
  const ov = $('#g2048Over');
  if (!ov) return;
  if (_g2048Mode() === 'coop') {
    ov.textContent = `这局我们一起推了 ${_g2048.score} 分${_g2048.bestTier >= 2048 ? ' · 还合出了 2048' : ''}`;
    return;
  }
  ov.textContent = `局终 · ${_g2048.score} 分${_gLast.g2048 && _gLast.g2048.beaten ? ' · 挑战告捷' : ''}`;
}
function _g2048Stuck() {
  const g = new Array(16).fill(0);
  _g2048.tiles.forEach(t => { if (!t.dead) g[t.r * 4 + t.c] = t.v; });
  if (g.some(v => !v)) return false;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    if (c < 3 && g[r * 4 + c] === g[r * 4 + c + 1]) return false;
    if (r < 3 && g[r * 4 + c] === g[(r + 1) * 4 + c]) return false;
  }
  return true;
}

/* ---------- 2048 图片皮肤：g2048Skins=当前生效一套，整套装进方案（g2048SkinSchemes）随时切 ---------- */
function _g2048SkinSchemes() {
  if (!data.games || !Array.isArray(data.games.g2048SkinSchemes)) data.games.g2048SkinSchemes = [];
  return data.games.g2048SkinSchemes;
}
function _g2048SkinSchemeOn() {   // 当前选中（跟着编辑的那套）；''=散装
  return _g2048SkinSchemes().find(s => s.id === data.games.g2048SkinScheme) || null;
}
function _g2048SchemeUse(id) {
  const sc = id ? _g2048SkinSchemes().find(s => s.id === id) : null;
  if (id && !sc) return;
  const fresh = {};
  if (sc) Object.keys(sc.skins).forEach(k => { if (sc.skins[k]) fresh[k] = sc.skins[k]; });
  data.games.g2048Skins = fresh;
  data.games.g2048SkinScheme = sc ? sc.id : '';
  save();
  g2048RenderSkins(); g2048Render();
  showToast(sc ? '已切到「' + sc.name + '」' : '已切回配色字面');
}
function _g2048SchemeSave() {
  const list = _g2048SkinSchemes();
  if (list.length >= 6) { showToast('方案最多存 6 套，删一套再存'); return; }
  const cur = data.games.g2048Skins || {};
  const skins = {};
  Object.keys(cur).forEach(k => { if (cur[k]) skins[k] = cur[k]; });
  if (!Object.keys(skins).length) { showToast('先传几张图再存'); return; }
  let n = 1;
  while (list.some(s => s.name === '方案 ' + n)) n++;
  list.push({ id: 'gs' + Date.now().toString(36) + Math.floor(Math.random() * 99), name: '方案 ' + n, skins });
  data.games.g2048SkinScheme = list[list.length - 1].id;
  save();
  g2048RenderSkins();
  showToast('已存「方案 ' + n + '」，随时切');
}
function _g2048SchemeDel(id) {
  const list = _g2048SkinSchemes();
  const i = list.findIndex(s => s.id === id);
  if (i < 0) return;
  const gone = list.splice(i, 1)[0];
  if (data.games.g2048SkinScheme === id) data.games.g2048SkinScheme = '';   // 画面上那套先留着，切走才换
  save();
  g2048RenderSkins();
  showToast('已删「' + gone.name + '」');
}
/* 一次传一套：按选文件的先后顺序逐格铺（第 1 张→最小的那格），格子序号跟着文件序号走＝
   某张读不出来时它那一格空着，后面的图不会往前挪一位（挪了就和用户心里的顺序对不上了） */
let _skinBatchBusy = false;
async function _gSkinsBatch(files, slots, put) {
  if (_skinBatchBusy) return { ok: 0, tooBig: 0 };
  _skinBatchBusy = true;
  const r = { ok: 0, tooBig: 0 };
  try {
    for (let i = 0; i < files.length && i < slots.length; i++) {
      if (files[i].size > MAX_FILE_SIZE) { r.tooBig++; continue; }   // 先自己挡一道：fileData 里那枚超限提示会一张弹一次
      const durl = await fileData(files[i], 320, 0.85);
      if (!durl) continue;
      put(slots[i], durl);
      r.ok++;
    }
  } finally { _skinBatchBusy = false; }
  return r;
}
function g2048RenderSkins() {
  const box = $('#g2048Skins');
  if (!box) return;
  const skins = data.games.g2048Skins || {};
  const on = data.games.g2048SkinScheme || '';
  box.innerHTML = `<div class="merge-skin-row">`
    + `<button type="button" class="merge-scheme${on === '' ? ' on' : ''}" data-gscheme="">配色字面</button>`
    + _g2048SkinSchemes().map(s => `<button type="button" class="merge-scheme${s.id === on ? ' on' : ''}" data-gscheme="${s.id}">${escapeHTML(s.name)}<u data-gsdel="${s.id}" title="删这套">×</u></button>`).join('')
    + `<button type="button" class="merge-scheme add" id="g2048SchemeSave">＋存为方案</button>`
    + `<button type="button" class="merge-scheme add" id="g2048SkinBatchBtn">一次传一套</button>`
    + `</div>`
    + `<div class="g2048-skins-t">给数字传一张图，合成到它就变成它 · 上面整套装成方案，玩着随时切<br>「一次传一套」按你选的先后从 2 铺到 2048，已有的格子直接换掉（一次最多 11 张，不够就只铺前几格）</div>`
    + `<div class="g2048-skin-grid">` + G_MERGE_VAL.map(v => {
      const im = skins[v];
      return `<button type="button" class="g2048-skin${im ? ' has' : ''}" data-gskin="${v}" aria-label="${im ? '更换' : '上传'}${v}的图片">`
        + (im ? `<img src="${im}" alt="" draggable="false"><span>${v}</span>`
          : `<i style="background:${_g2048Color(v)};color:${v <= 4 ? '#1a1c22' : '#fff'}">${v}</i>`)
        + (im ? `<u data-gskinx="${v}" aria-label="移除${v}的图片">×</u>` : '')
        + `</button>`;
    }).join('') + `</div>`
    + `<button type="button" class="game-btn g2048-skin-reset" id="g2048SkinReset">这套全部恢复配色字面</button>`;
}
let _g2048SkinPick = 0;

/* ================= 合成大西瓜 ================= */
const _merge = { balls: [], fx: [], cur: 2, next: 3, score: 0, over: false, dangerT: 0, dropX: 0, aim: false, w: 320, h: 380, raf: 0, cool: 0, scorePop: 0, bestTier: 0, mode: 'solo', coop: { taAt: 0 }, gotMelon: false };
const _mergeImgs = {};   // tier → Image：自定义皮肤加载缓存
let _mergeSkinTier = -1, _mergeSkinOpen = false;
function _gEaseBack(k) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); }
function _mergeImg(t) {
  const url = data.games && data.games.mergeSkins && data.games.mergeSkins[t];
  if (!url) return null;
  let im = _mergeImgs[t];
  if (!im || im.src !== url) { im = new Image(); im.src = url; _mergeImgs[t] = im; }
  return im.complete && im.naturalWidth ? im : null;
}
/* 合成那一罐的尺寸：宽由「这块地方还剩多少」现算（见 _gBoardBox），高始终按 340∶380 那一档比例跟上去。
   半径与落点全由 _merge.w/_merge.h 派生（G_FRUITS[t].r * (_merge.w / 340)），所以「棋盘变大」＝水果与罐子一起变大；
   量不到宽度（视图还没排版）时一个字都不写：_merge.w 保留上一份可用读数，写 0 会让半径算成负数、
   createRadialGradient 当场抛 IndexSizeError（#103 那条同因）。 */
function gMergeSize() {
  const cv = $('#mergeCv');
  if (!cv || !cv.parentElement) return;
  const box = _gBoardBox(cv.parentElement);
  if (box.w < 40) return;
  const avail = _gBoxInner(cv, box.w);
  const ar = 340 / 380;
  const w = Math.round(Math.min(avail, box.h > 0 ? box.h * ar : avail));
  const h = Math.round(w / ar);
  const dpr = window.devicePixelRatio || 1;
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  cv.width = w * dpr; cv.height = h * dpr;
  _merge.w = w; _merge.h = h;
  cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
}
function gMergeBoot(force) {
  const cv = $('#mergeCv');
  if (!cv) return;
  gMergeSize();
  if (!data.games.mergeSkins) data.games.mergeSkins = {};   // 旧档懒补（db.js 本轮被并行会话占用）
  if (!Array.isArray(data.games.mergeSkinSchemes)) data.games.mergeSkinSchemes = [];
  if (typeof data.games.mergeSkinScheme !== 'string') data.games.mergeSkinScheme = '';
  // 早于方案体系传过的那套图，自动收进「方案 1」保住
  if (!data.games.mergeSkinSchemes.length && Object.keys(data.games.mergeSkins).length) {
    data.games.mergeSkinSchemes.push({ id: 'ms' + Date.now().toString(36), name: '方案 1', skins: Object.assign({}, data.games.mergeSkins) });
    data.games.mergeSkinScheme = data.games.mergeSkinSchemes[0].id;
    save();
  }
  for (let i = 0; i < 11; i++) _mergeImg(i);   // 皮肤图预热
  if (!_merge.balls.length || force) gMergeRestart();
  else { gMergeRefreshStat(); _gMergeRail(); }
}
function gMergeRestart() {
  _merge.balls = []; _merge.fx = []; _merge.score = 0; _merge.over = false; _merge.dangerT = 0; _merge.cool = 0;
  _merge.aim = false; _merge.bestTier = 0; _merge.scorePop = 0; _merge.gotMelon = false;   // FIX #050 本局成就随新局清
  _merge.mode = _gMergeMode();
  _merge.coop = { taAt: _merge.mode === 'coop' ? Date.now() + 1800 : 0 };
  _merge.cur = Math.floor(Math.random() * 5);
  _merge.next = Math.floor(Math.random() * 5);
  delete _gLast.merge;
  delete _gLive.merge;   // TA 的实时对局跟着这局重来
  gMergeRefreshStat(); _gMergeRail();
}
function _gMergeMode() { return (data.games && data.games.mergeMode) || 'solo'; }
function _gMergeCoopScore(cid) {   // 合作成绩单独记账，不进对战那套 best/挑战
  const sc = _gScore(cid, 'merge');
  if (!sc.coop || typeof sc.coop !== 'object') sc.coop = { best: 0, plays: 0, melon: false };
  return sc.coop;
}
function _gMergeApplyMode() {
  const mode = _gMergeMode();
  _merge.mode = mode;
  _gModeChrome('merge');   // 那一行只属对战（BUGS #302）：自己玩不出现、合作由 coopLine 那条说
  const cl = $('#coopLine'); if (cl) cl.hidden = mode !== 'coop';
  $$('#mergeModes .merge-scheme').forEach(b => b.classList.toggle('on', b.dataset.mmode === mode));
  if (mode === 'coop') _gMergeCoopRender();
  gMergeRefreshStat();
}
function _gMergeSetMode(m) {
  if (!['solo', 'coop', 'vs'].includes(m) || _gMergeMode() === m) return;
  data.games.mergeMode = m;
  save();
  gMergeRestart();
  _gMergeApplyMode();
  showToast(m === 'coop' ? '和 ' + _gName(data.games.with) + ' 一起玩：你丢一颗，TA 也丢一颗' : (m === 'solo' ? '自己玩，练手无压力' : '比分对战，可别输给 TA'));
}
function _gMergeCoopRender() {
  const box = $('#coopLine');
  if (!box) return;
  const co = _gContact(data.games.with) || {};
  const goal = Math.min(10, _merge.bestTier + 1);
  box.innerHTML = `<span class="avatar">${avatarHTML(co.avatar)}</span>`
    + `<div class="ta-tt"><b>和 ${escapeHTML(_gName(data.games.with))} 一起</b><span>${_merge.over ? '这罐攒完了 · 满了再来一罐' : '一起的目标：' + G_FRUITS[goal].n + (goal === 10 ? '（大西瓜！）' : '')}</span></div>`
    + `<div class="ta-score${_merge.over ? '' : ' live'}"><b>${_merge.score}</b><span>这罐</span></div>`;
}
function _gMergeCoopEnd(score) {
  const co = _gMergeCoopScore(data.games.with);
  co.plays++;
  if (score > co.best) co.best = score;
  save();
  playSfx('over');
  if (document.body.dataset.view === 'games' && data.games.tab === 'merge') gMergeRefreshStat();
  _gEndReport('merge', score, { coop: true, ach: _merge.gotMelon ? G_COOP_ACH.merge : null });
}
function _gMergeRail() {
  const rail = $('#mergeRail');
  if (!rail) return;
  const skins = (data.games && data.games.mergeSkins) || {};
  rail.innerHTML = G_FRUITS.map((f, i) => {
    const face = skins[i] ? `<img src="${skins[i]}" alt="">` : `<i style="background:radial-gradient(circle at 34% 30%,${f.c[0]},${f.c[1]})"></i>`;
    return `<b class="${i === _merge.cur ? 'on' : (i === _merge.next && i !== _merge.cur ? 'nx' : '')}">${face}</b>`;
  }).join('');
}
function gMergeRefreshStat() {
  const el = $('#mergeStat');
  if (!el) return;
  const cid = data.games.with;
  if (_gMergeMode() === 'coop') {
    const co = _gMergeCoopScore(cid);
    el.textContent = `合作最高 ${co.best} 分 · ${co.plays} 罐${co.melon ? ' · 合出过大西瓜' : ''}`;
    _gMergeCoopRender();
    return;
  }
  const sc = _gBook('merge');
  el.textContent = `最高 ${sc.best} · ${sc.plays} 局${sc.ta > 0 ? ` · 挑战 ${sc.ta}` : ''}`;
}
function gMergeLoopKick() {
  if (_merge.raf) return;
  const step = () => {
    _merge.raf = 0;
    const active = document.body.dataset.view === 'games' && data.games && data.games.tab === 'merge' && !$('#gameMerge').hidden;
    if (!active) return;
    gMergePhysics();
    gMergeDraw();
    _merge.raf = requestAnimationFrame(step);
  };
  _merge.raf = requestAnimationFrame(step);
}
function _mergeHit(b, axis, power) {   // 撞击挤压：power 越大压得越扁，交给弹簧 Q 弹回
  if (power < 1.4) return;
  const amt = Math.min(0.32, power * 0.05);
  if (amt > Math.abs(b.sq || 0)) { b.sq = amt; b.sqv = 0; b.sqA = axis; }
}
function _mergeFxSpawn(tier, x, y, r) {   // 合成瞬间：冲击环 + 果汁飞溅，西瓜加码
  const f = G_FRUITS[tier];
  const big = tier === 10;
  _merge.fx.push({ type: 'ring', x, y, r, life: big ? 480 : 360, t: 0, c: f.c[1] });
  const n = big ? 26 : 10;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = (big ? 2.2 : 1.4) + Math.random() * (big ? 3.2 : 2);
    _merge.fx.push({ type: 'drop', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, r: 1.5 + Math.random() * 2.2, life: 480 + Math.random() * 300, t: 0, c: [f.c[0], f.c[1], '#fff'][i % 3] });
  }
}
// 托住＝罐底，或正下方那一枚与自己真压着（含 1.2px 接触余量）；只认「在下面」的，斜上方擦过的不算
function _mergeSupported(b, balls, R) {
  const rb = R(b.tier);
  if (b.y > _merge.h - rb - 0.8) return true;
  for (const o of balls) {
    if (o === b || o.y <= b.y + 0.01) continue;
    if (Math.hypot(o.x - b.x, o.y - b.y) < rb + R(o.tier) + 1.2) return true;
  }
  return false;
}
function gMergePhysics() {
  const R = t => G_FRUITS[t].r * (_merge.w / 340);
  const balls = _merge.balls;
  if (_merge.mode === 'coop' && !_merge.over && Date.now() >= (_merge.coop.taAt || 0)) {   // 合作：TA 也往这罐丢
    _merge.coop.taAt = Date.now() + 1100 + Math.random() * 1400;
    const t = Math.floor(Math.random() * 5);
    const x = 24 + Math.random() * (_merge.w - 48);
    const r = R(t);
    _merge.balls.push({ x, y: 30 + r, vx: 0, vy: 0.5, tier: t, born: Date.now(), sq: 0, sqv: 0, sqA: 0, rot: 0, va: 0, ta: true });
    if (Math.random() < 0.3) _merge.fx.push({ type: 'txt', x, y: 30 + r * 2 + 10, val: 'TA 丢了一颗', life: 800, t: 0, c: 'rgba(26,28,34,.55)' });
    _gMergeCoopRender();
  }
  // 「被托住」在帧首统一判（都在积分之前，用的是上一帧末尾的位置；一边积分一边判会读到半新的邻居）
  // #103 那批只认地面那一档（贴地＝罐底 0.8px 内），叠在邻居上的球于是被当成「在空中」：
  // 重力一路攒着没人卸，攒到跨层相对法向速度 >1.4 就又被注一次转，而空气阻尼 τ≈66 帧追不上每帧注入＝堆里的球一直转。
  // 现在正下方压着的那枚也算托住，托住的球一律改用「真走过的路」算转角（见末尾那块），角速度不再驱动它
  for (const b of balls) b.gnd = _mergeSupported(b, balls, R);
  for (const b of balls) {
    if (b.sq === undefined) { b.sq = 0; b.sqv = 0; b.sqA = 0; b.rot = 0; b.va = 0; }
    const r = R(b.tier);
    b.px = b.x;                        // 帧起点：末尾按「真走过的路」决定这一帧转多少
    b.vy += 0.34;
    b.x += b.vx; b.y += b.vy;
    if (!b.gnd) {                      // 没被托住的球按角速度转；被托住的留到末尾用位移算
      b.rot += b.va;
      b.va *= 0.985;   // 空气阻尼：转起来要能停得下（修「水果一直转」）
      if (Math.abs(b.va) < 0.002) b.va = 0;
    }
    // 贴墙不算撞墙：只有真以速度 v 撞上才带转，否则被邻居挤在墙上会每帧积一点转、阻尼追不上＝球转到飞起来
    if (b.x < r) { b.x = r; if (b.vx < 0) { const v = -b.vx; _mergeHit(b, 0, v); b.vx = v * 0.45; if (v > 1.4) b.va += Math.min(0.06, v * 0.02); } }
    if (b.x > _merge.w - r) { b.x = _merge.w - r; if (b.vx > 0) { const v = b.vx; _mergeHit(b, 0, v); b.vx = -v * 0.45; if (v > 1.4) b.va -= Math.min(0.06, v * 0.02); } }
    if (b.y > _merge.h - r) {
      b.y = _merge.h - r;
      if (b.vy > 0) { _mergeHit(b, Math.PI / 2, Math.abs(b.vy)); b.vy = -Math.abs(b.vy) * 0.24; }
      b.vx *= 0.86;
      b.gnd = true;
    }
    if (b.y < r + 2) { b.y = r + 2; if (b.vy < 0) b.vy = 0; }
    b.sqv += -0.22 * b.sq; b.sqv *= 0.8; b.sq += b.sqv;   // Q弹回弹弹簧
    if (Math.abs(b.sq) < 0.003 && Math.abs(b.sqv) < 0.003) { b.sq = 0; b.sqv = 0; }
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], b = balls[j];
      if (a.dead || b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const rr = R(a.tier) + R(b.tier);
      const dist = Math.hypot(dx, dy) || 0.01;
      if (dist < rr) {
        if (a.tier === b.tier && a.tier < 10 && dist < rr - 1) {
          a.dead = b.dead = true;
          const nt = a.tier + 1;
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          _merge.balls.push({ x: mx, y: my, vx: (Math.random() - 0.5) * 1.2, vy: -1, tier: nt, dead: false, born: Date.now(), sq: 0, sqv: 0, sqA: 0, rot: 0, va: 0 });
          _mergeFxSpawn(nt, mx, my, R(nt));
          // 合成音随档位往上走；菠萝（第 6 档）起、且是这一局第一次破纪录才报一记小礼乐，平时一声轻点
          playSfx(nt >= 6 && nt > _merge.bestTier ? 'mile' : 'blend', { step: _gSfxStep(nt), weak: !!(a.ta || b.ta) });
          if (nt > _merge.bestTier) {
            _merge.bestTier = nt;
            _merge.fx.push({ type: 'txt', x: mx, y: my - R(nt) - 10, val: nt === 10 ? '大西瓜！' : G_FRUITS[nt].n + '！', life: 900, t: 0, c: '#1a1c22' });
            // FIX 2026-10-08#050 合作里程碑此前每破一档就往聊天里发一条（菠萝起），局未结束就刷屏。
            // 现在只记成就（成就仍会进「合出过大西瓜」那一行），说话留到局终 _gEndReport。
            if (_merge.mode === 'coop' && nt === 10) {
              _merge.gotMelon = true;   // 本局合出（大西瓜），随 restart 清
              const co = _gMergeCoopScore(data.games.with);
              if (!co.melon) { co.melon = true; save(); }
            }
          }
          _merge.score += G_MERGE_VAL[nt];
          _merge.scorePop = Date.now();
          gMergeRefreshStat();
          continue;
        }
        const push = (rr - dist) / 2;
        const nx = dx / dist, ny = dy / dist;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
        const vn = rvx * nx + rvy * ny;
        if (vn < 0) {
          const imp = vn * 0.38;
          a.vx += nx * imp; a.vy += ny * imp;
          b.vx -= nx * imp; b.vy -= ny * imp;
          const axis = Math.atan2(ny, nx);   // 挤压轴＝碰撞法线
          _mergeHit(a, axis, Math.abs(vn) * 0.6);
          _mergeHit(b, axis, Math.abs(vn) * 0.6);
          // 只有真撞上去那一下才带转（阈值与 _mergeHit 同一条），而且两颗对滚——同向会把转速越蹭越高、永远停不下来
          const spin = Math.abs(vn) > 1.4 ? (rvx * ny - rvy * nx) * 0.004 : 0;
          a.va -= spin; b.va += spin;
        }
      }
    }
  }
  // 被托住的球：这一帧转过的角度＝真走过的路 ÷ 半径（被邻居挤开的那一下也算数）。
  // 旧写法拿 vx 当滚动量，而堆里挤着的球 vx 来回翻却压根没挪窝＝转的是空气，看着就是「球一直转」
  for (const b of balls) {
    if (!b.gnd) continue;
    const roll = (b.x - b.px) / R(b.tier);
    if (Math.abs(roll) < 0.0008) { b.va = 0; continue; }
    b.rot += roll; b.va = roll;
  }
  for (const p of _merge.fx) {
    p.t += 16;
    if (p.type === 'drop') { p.vy += 0.22; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; }
    else if (p.type === 'txt') p.y -= 0.7;
  }
  _merge.fx = _merge.fx.filter(p => p.t < p.life);
  _merge.balls = _merge.balls.filter(b => !b.dead);
  const lineY = 64;
  let danger = false;
  for (const b of _merge.balls) {
    if (Date.now() - (b.born || 0) > 1200 && b.y - R(b.tier) < lineY) danger = true;
  }
  if (danger) {
    _merge.dangerT += 16;
    if (_merge.dangerT > 2000 && !_merge.over) {
      _merge.over = true;
      if (_merge.mode === 'coop') _gMergeCoopEnd(_merge.score);
      else _gGameEnd('merge', _merge.score, _merge.mode === 'solo' ? { noTa: true } : undefined);
      if (_merge.mode === 'coop') _gMergeCoopRender();
    }
  } else _merge.dangerT = 0;
}
function _gMergeBallFace(ctx, tier, x, y, r, rot, sq, sqA, born) {
  const f = G_FRUITS[tier];
  let s = 1;
  if (born) { const age = (Date.now() - born) / 300; if (age < 1) s = Math.max(0.05, _gEaseBack(age)); }   // 出生回弹
  ctx.save();
  ctx.translate(x, y);
  if (sq) { ctx.rotate(sqA); ctx.scale(1 - sq, 1 + sq * 0.8); ctx.rotate(-sqA); }   // 沿撞击轴压扁
  ctx.rotate(rot || 0);
  ctx.scale(s, s);
  const img = _mergeImg(tier);
  if (img) {
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.clip();
    const k = Math.max(r * 2 / img.naturalWidth, r * 2 / img.naturalHeight);
    ctx.drawImage(img, -img.naturalWidth * k / 2, -img.naturalHeight * k / 2, img.naturalWidth * k, img.naturalHeight * k);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7);
    const hl = ctx.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.1, 0, 0, r);
    hl.addColorStop(0, 'rgba(255,255,255,.42)');
    hl.addColorStop(0.55, 'rgba(255,255,255,.05)');
    hl.addColorStop(1, 'rgba(26,28,34,.12)');
    ctx.fillStyle = hl; ctx.fill();
  } else {
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.2, 0, 0, r);
    g.addColorStop(0, f.c[0]); g.addColorStop(1, f.c[1]);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fillStyle = g; ctx.fill();
    if (r >= 16) {
      ctx.rotate(-(rot || 0));   // 名字不跟着球转
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.font = `${Math.max(9, r * 0.28)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(f.n, 0, 3);
    }
  }
  ctx.restore();
}
function gMergeDraw() {
  const cv = $('#mergeCv');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = _merge.w, H = _merge.h;
  const now = Date.now();
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const danger = _merge.dangerT > 0;
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = danger ? `rgba(194,85,75,${(0.45 + 0.3 * Math.abs(Math.sin(now / 130))).toFixed(2)})` : 'rgba(26,28,34,.2)';
  ctx.beginPath(); ctx.moveTo(6, 64); ctx.lineTo(W - 6, 64); ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = '9px sans-serif';
  ctx.fillStyle = danger ? 'rgba(194,85,75,.75)' : 'rgba(26,28,34,.4)';
  ctx.textAlign = 'right';
  ctx.fillText(danger ? '警戒线 · 快满了' : '警戒线', W - 10, 60);
  const R = t => G_FRUITS[t].r * (W / 340);
  if (!_merge.over && now >= _merge.cool) {   // 瞄准：悬浮球 + 落点参考线
    const r = R(_merge.cur);
    const x = _merge.dropX || W / 2;
    const y = 30 + r;
    ctx.globalAlpha = 0.35;
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = 'rgba(26,28,34,.3)';
    ctx.beginPath(); ctx.moveTo(x, y + r + 4); ctx.lineTo(x, H - 8); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    _gMergeBallFace(ctx, _merge.cur, x, y, r, 0, 0);
  }
  for (const b of _merge.balls) _gMergeBallFace(ctx, b.tier, b.x, b.y, R(b.tier), b.rot, b.sq, b.sqA, b.born);
  for (const p of _merge.fx) {
    const k = p.t / p.life;
    if (p.type === 'drop') {
      ctx.globalAlpha = 1 - k;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - k * 0.5), 0, 7); ctx.fillStyle = p.c; ctx.fill();
    } else if (p.type === 'ring') {
      ctx.globalAlpha = (1 - k) * 0.7;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.6 + k * 1.1), 0, 7);
      ctx.strokeStyle = p.c; ctx.lineWidth = 2.5 * (1 - k) + 0.5; ctx.stroke(); ctx.lineWidth = 1;
    } else if (p.type === 'txt') {
      ctx.globalAlpha = k < 0.7 ? 1 : (1 - k) / 0.3;
      ctx.fillStyle = p.c;
      ctx.font = '600 14px Georgia,serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.val, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }
  const pop = Math.max(0, 1 - (now - _merge.scorePop) / 220);
  ctx.save();
  ctx.translate(12, 30);
  ctx.scale(1 + pop * 0.22, 1 + pop * 0.22);
  ctx.fillStyle = 'rgba(26,28,34,.78)';
  ctx.font = '20px Georgia,serif';
  ctx.textAlign = 'left';
  ctx.fillText(String(_merge.score), 0, 0);
  ctx.restore();
  if (_merge.over) {
    ctx.fillStyle = 'rgba(240,242,246,.5)';
    ctx.fillRect(0, 0, W, H);
    const pw = Math.min(W - 48, 230), ph = 96, px = (W - pw) / 2, py = H / 2 - ph / 2 - 10;
    ctx.save();
    ctx.shadowColor = 'rgba(24,32,54,.16)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 10;
    ctx.fillStyle = 'rgba(255,255,255,.94)';
    _gRoundRect(ctx, px, py, pw, ph, 18);
    ctx.restore();
    ctx.fillStyle = '#1a1c22';
    ctx.font = '600 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(_merge.mode === 'coop' ? '这罐我们攒了 ' + _merge.score + ' 分' : '罐子满了 · ' + _merge.score + ' 分', W / 2, py + 42);
    ctx.fillStyle = 'rgba(26,28,34,.5)';
    ctx.font = '11px sans-serif';
    ctx.fillText('点「重新开始」再来一局', W / 2, py + 66);
  }
}

/* ---------- 水果皮肤：每级可上传自己的图（mergeSkins=当前生效一套），整套装进方案随时切 ---------- */
function _gSkinSchemes() {
  if (!data.games || !Array.isArray(data.games.mergeSkinSchemes)) data.games.mergeSkinSchemes = [];
  return data.games.mergeSkinSchemes;
}
function _gSkinSchemeOn() {   // 当前选中（跟着编辑的那套）；''=默认水果/散装
  return _gSkinSchemes().find(s => s.id === data.games.mergeSkinScheme) || null;
}
function _gMergeSkinsRender() {
  const box = $('#mergeSkins');
  if (!box) return;
  const skins = (data.games && data.games.mergeSkins) || {};
  const on = data.games.mergeSkinScheme || '';
  box.innerHTML = `<div class="merge-skin-row">`
    + `<button type="button" class="merge-scheme${on === '' ? ' on' : ''}" data-mscheme="">默认水果</button>`
    + _gSkinSchemes().map(s => `<button type="button" class="merge-scheme${s.id === on ? ' on' : ''}" data-mscheme="${s.id}">${escapeHTML(s.name)}<u data-msdel="${s.id}" title="删这套">×</u></button>`).join('')
    + `<button type="button" class="merge-scheme add" id="mergeSchemeSave">＋存为方案</button>`
    + `<button type="button" class="merge-scheme add" id="mergeSkinBatchBtn">一次传一套</button>`
    + `</div>`
    + `<div class="merge-skins-t">点哪颗换哪颗，当场就玩（图只存本机）· 上面整套装成方案，玩着随时切<br>「一次传一套」按你选的先后从樱桃铺到西瓜，已有的那颗直接换掉（一次最多 11 张，不够就只铺前几颗）</div>`
    + `<div class="merge-skin-grid">`
    + G_FRUITS.map((f, i) => `<button type="button" class="merge-skin${skins[i] ? ' has' : ''}" data-mskin="${i}">`
      + (skins[i] ? `<img src="${skins[i]}" alt=""><u data-mclear="${i}" title="恢复默认">×</u>` : `<i style="background:radial-gradient(circle at 34% 30%,${f.c[0]},${f.c[1]})"></i>`)
      + `<span>${f.n}</span></button>`).join('')
    + `</div>`
    + `<button type="button" class="game-btn merge-skin-reset" id="mergeSkinReset">这套全部恢复默认水果</button>`;
}
function _gMergeSkinClear(t) {
  if (!data.games.mergeSkins || !data.games.mergeSkins[t]) return;
  delete data.games.mergeSkins[t];
  const sc = _gSkinSchemeOn();   // 选中哪套就同步改哪套
  if (sc) delete sc.skins[t];
  delete _mergeImgs[t];
  save();
  _gMergeSkinsRender(); _gMergeRail();
  showToast(G_FRUITS[t].n + ' 恢复默认');
}
function _gMergeSchemeUse(id) {
  const sc = id ? _gSkinSchemes().find(s => s.id === id) : null;
  if (id && !sc) return;
  const fresh = {};
  if (sc) Object.keys(sc.skins).forEach(k => { fresh[k] = sc.skins[k]; });
  data.games.mergeSkins = fresh;
  data.games.mergeSkinScheme = sc ? sc.id : '';
  Object.keys(_mergeImgs).forEach(k => delete _mergeImgs[k]);
  save();
  _gMergeSkinsRender(); _gMergeRail();
  showToast(sc ? '已切到「' + sc.name + '」' : '已切回默认水果');
}
function _gMergeSchemeSave() {
  const list = _gSkinSchemes();
  if (list.length >= 6) { showToast('方案最多存 6 套，删一套再存'); return; }
  const cur = data.games.mergeSkins || {};
  const skins = {};
  Object.keys(cur).forEach(k => { if (cur[k]) skins[k] = cur[k]; });
  if (!Object.keys(skins).length) { showToast('先换几颗再存'); return; }
  let n = 1;
  while (list.some(s => s.name === '方案 ' + n)) n++;
  list.push({ id: 'ms' + Date.now().toString(36) + Math.floor(Math.random() * 99), name: '方案 ' + n, skins });
  data.games.mergeSkinScheme = list[list.length - 1].id;
  save();
  _gMergeSkinsRender();
  showToast('已存「方案 ' + n + '」，随时切');
}
function _gMergeSchemeDel(id) {
  const list = _gSkinSchemes();
  const i = list.findIndex(s => s.id === id);
  if (i < 0) return;
  const gone = list.splice(i, 1)[0];
  if (data.games.mergeSkinScheme === id) data.games.mergeSkinScheme = '';   // 画面上那套先留着，切走才换
  save();
  _gMergeSkinsRender();
  showToast('已删「' + gone.name + '」');
}

/* 圆角矩形＝canvas 上的共用画法（合成大西瓜与俄罗斯方块都在用）。原本住在堆塔那一段里，
   2026-10-11 那两款下线（BUGS #297）时若连段一起删会带走它，故单独立在这里＝不属于任何一款。 */
function _gRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.fill();
}

/* ================= 消灭星星 =================
   10×10 五色，点同色连片（≥2）选中、再点一次消除：n²×5 分，上方整列下落、空列左移
   （瓷砖带身份常驻 DOM 走 transform 过渡＝Q弹回落）。全清 +2000。
   三模式与 2048/合成同源口径：solo=自己玩；coop=和 TA 严格轮流消同一盘，分数合账「我们」
   单独记 scores[cid].pop.coop{best,plays,clear}；vs=比分对战（挑战分＋TA 实时对局）。 */
const G_POP_COLORS = [
  { n: '红', c: ['#ec8a80', '#d26055'] },
  { n: '橙', c: ['#f4b06a', '#e08a38'] },
  { n: '绿', c: ['#96cf8e', '#64a95e'] },
  { n: '蓝', c: ['#8ab8e6', '#5488c2'] },
  { n: '紫', c: ['#b6a0e8', '#8a70c6'] }
];
const POP_N = 10, POP_PAD = 8, POP_GAP = 4;   // 与 games.css .pop-grid/.pop-bg 的内距与格间距一致
const _pop = { cells: null, score: 0, over: false, _id: 0, _els: new Map(), _pos: new Map(), mode: 'solo', turn: 'me', taTimer: 0, lastTa: '' };
function _gPopMode() {
  const m = data.games && data.games.popMode;
  return ['solo', 'coop', 'vs'].includes(m) ? m : 'solo';
}
function _gPopCoopScore(cid) {   // 合作成绩单独记账，不进个人 best／挑战分
  const sc = _gScore(cid, 'pop');
  if (!sc.coop || typeof sc.coop !== 'object' || Array.isArray(sc.coop)) sc.coop = { best: 0, plays: 0, clear: false };
  const co = sc.coop;
  if (typeof co.best !== 'number' || !isFinite(co.best) || co.best < 0) co.best = 0;
  if (typeof co.plays !== 'number' || !isFinite(co.plays) || co.plays < 0) co.plays = 0;
  if (co.clear !== true) co.clear = false;
  return co;
}
function gPopBoot(force) {
  if (_pop.cells && !force) { _gPopApplyMode(); _popRender(); return; }
  gPopRestart();
}
function gPopRestart() {
  _pop.cells = new Array(POP_N * POP_N).fill(null);
  for (let i = 0; i < POP_N * POP_N; i++) _pop.cells[i] = { id: ++_pop._id, v: Math.floor(Math.random() * G_POP_COLORS.length) };
  _pop.score = 0;
  _pop.over = false;
  _pop._pos.clear();   // 上一局的落点账清掉，新局不误判「跌落」
  _pop.turn = 'me';
  _pop.lastTa = '';
  if (_pop.taTimer) { clearTimeout(_pop.taTimer); _pop.taTimer = 0; }
  if (_pop._els) { _pop._els.forEach(el => el.remove()); _pop._els.clear(); }
  delete _gLast.pop;
  delete _gLive.pop;   // TA 的实时对局跟着这局重来
  const ov = $('#popOver');
  if (ov) ov.textContent = '';
  _popRender();
  _popScoreView(false);
  gPopRefreshStat();
  _gPopApplyMode();
}
function _popColorGrid() { return _pop.cells.map(b => b ? b.v : -1); }
function _popGroupsOf(g) {   // 色板 → 同色连片（≥2）列表；g 长度 100，-1=空
  const seen = new Array(POP_N * POP_N).fill(false);
  const groups = [];
  for (let i = 0; i < POP_N * POP_N; i++) {
    if (g[i] < 0 || seen[i]) continue;
    const col = g[i];
    const st = [i], grp = [];
    seen[i] = true;
    while (st.length) {
      const x = st.pop();
      grp.push(x);
      const r = Math.floor(x / POP_N), c = x % POP_N;
      if (r > 0 && !seen[x - POP_N] && g[x - POP_N] === col) { seen[x - POP_N] = true; st.push(x - POP_N); }
      if (r < POP_N - 1 && !seen[x + POP_N] && g[x + POP_N] === col) { seen[x + POP_N] = true; st.push(x + POP_N); }
      if (c > 0 && !seen[x - 1] && g[x - 1] === col) { seen[x - 1] = true; st.push(x - 1); }
      if (c < POP_N - 1 && !seen[x + 1] && g[x + 1] === col) { seen[x + 1] = true; st.push(x + 1); }
    }
    if (grp.length >= 2) groups.push(grp);
  }
  return groups;
}
function _popSettle() {   // 整列下落＋空列左移（块对象保持身份，位置重排交给 render 过渡）
  const cols = [];
  for (let c = 0; c < POP_N; c++) {
    const col = [];
    for (let r = POP_N - 1; r >= 0; r--) { const b = _pop.cells[r * POP_N + c]; if (b) col.push(b); }
    cols.push(col);
  }
  const live = cols.filter(a => a.length);
  _pop.cells = new Array(POP_N * POP_N).fill(null);
  live.forEach((col, nc) => col.forEach((b, i) => { _pop.cells[(POP_N - 1 - i) * POP_N + nc] = b; }));
}
function _popGeom() {   // 棋盘几何（块定位共用）：POP_PAD/POP_GAP 改动须与 games.css 同步；内距随全屏档现算
  const box = $('#popGrid');
  if (!box) return null;
  const W = box.clientWidth || 320, H = box.clientHeight || W;
  const pg = _gEffPG(POP_PAD, POP_GAP), PAD = pg[0], GAP = pg[1];
  const cw = (W - PAD * 2 - GAP * (POP_N - 1)) / POP_N;
  const ch = (H - PAD * 2 - GAP * (POP_N - 1)) / POP_N;
  return { box, pad: PAD, gap: GAP, cw, ch, sx: cw + GAP, sy: ch + GAP };
}
function _popRender() {
  const g = _popGeom();
  if (!g) return;
  _gSetCellVars(g.box, g.pad, g.gap, g.cw, g.ch);
  let bg = g.box.querySelector('.pop-bg');
  if (!bg) {
    bg = document.createElement('div');
    bg.className = 'pop-bg';
    bg.innerHTML = '<i></i>'.repeat(POP_N * POP_N);
    g.box.appendChild(bg);
  }
  for (let i = 0; i < POP_N * POP_N; i++) {
    const b = _pop.cells[i];
    if (!b) continue;
    let el = _pop._els.get(b.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'pop-tile';
      const col = G_POP_COLORS[b.v];
      el.style.background = `radial-gradient(circle at 34% 30%,${col.c[0]},${col.c[1]})`;
      _pop._els.set(b.id, el);
      g.box.appendChild(el);
      el.classList.add('in');   // 登场回弹（错峰）
      el.style.animationDelay = ((Math.floor(i / POP_N) + i % POP_N) * 22) + 'ms';
      setTimeout(() => { el.classList.remove('in'); el.style.animationDelay = ''; }, 1300);
    }
    el.dataset.pidx = i;   // 列移动后点击指向要跟上
    let delay = 0;   // 瀑布错峰：跌落行数越多越晚起落，左移也按距离排
    const prev = _pop._pos.get(b.id);
    if (prev != null && prev !== i) {
      const fr = Math.floor(i / POP_N) - Math.floor(prev / POP_N);
      const fc = Math.abs((i % POP_N) - (prev % POP_N));
      delay = Math.max(0, fr) * 22 + fc * 16;
    }
    el.style.transitionDelay = delay ? delay + 'ms' : '';
    _pop._pos.set(b.id, i);
    el.style.transform = `translate(${Math.round((i % POP_N) * g.sx)}px,${Math.round(Math.floor(i / POP_N) * g.sy)}px)`;
  }
}
function _popBurst(x, y, size) {   // 消除组的扩散光环（纯 CSS 一瞬即逝）
  const box = $('#popGrid');
  if (!box) return;
  const b = document.createElement('i');
  b.className = 'pop-burst';
  b.style.width = b.style.height = size + 'px';
  b.style.left = x + 'px';
  b.style.top = y + 'px';
  box.appendChild(b);
  setTimeout(() => b.remove(), 560);
}
function popTap(idx) {
  if (_pop.over || !_pop.cells) return;
  if (_gPopMode() === 'coop' && _pop.turn === 'ta') return;   // 轮到 TA：你这一下不算数
  const grp = _popGroupAt(idx);
  if (grp) { _popDoPop(grp); return; }   // 单点即消（经典口径）：点中 ≥2 连片直接爆，不留选中态＝没有一直在抖的动画
  const b = _pop.cells[idx];   // 点了单块：摇头示意「这块消不了」
  const el = b && _pop._els.get(b.id);
  if (el) { el.classList.add('no'); setTimeout(() => el.classList.remove('no'), 320); }
}
function _popGroupAt(idx) {
  if (!_pop.cells[idx]) return null;
  const grp = _popGroupsOf(_popColorGrid());
  return grp.find(g => g.indexOf(idx) >= 0) || null;
}
function _popDoPop(grp, opts) {
  opts = opts || {};
  const n = grp.length;
  const g0 = _popGeom();   // 消除前抓质心（浮字与光环的落点）
  let cx = 0, cy = 0;
  if (g0) {
    cx = (grp.reduce((s, i) => s + (i % POP_N), 0) / n) * g0.sx + g0.cw / 2;
    cy = (grp.reduce((s, i) => s + Math.floor(i / POP_N), 0) / n) * g0.sy + g0.ch / 2;
  }
  grp.forEach((i, k) => {
    const b = _pop.cells[i];
    if (!b) return;
    const el = _pop._els.get(b.id);
    if (el) {
      el.classList.add('bye');   // 爆开消散（错峰）
      el.style.animationDelay = (k % 5) * 30 + 'ms';
      setTimeout(() => el.remove(), 560);
      _pop._els.delete(b.id);
      _pop._pos.delete(b.id);
    }
    _pop.cells[i] = null;
  });
  const gain = n * n * 5;
  playSfx('blend', { step: _gSfxStep(n), weak: !!opts.ta });   // 一次连掉越多，响得越高
  _pop.score += gain;
  _popSettle();
  if (_gPopMode() === 'vs' && !opts.ta) _gTaLiveStart('pop');   // 对战：你消第一片 TA 才开始实时玩
  if (g0) {
    _popBurst(cx, cy, Math.min(120, ((g0.cw + g0.ch) / 2) * 1.4 + n * 4));
    _popFloatScore('+' + gain, cx, cy);
  } else _popFloatScore('+' + gain);
  _popScoreView(true);
  if (n >= 8) showToast(n + ' 连消！');
  setTimeout(() => {
    if (!data.games) return;
    _popRender();
    const more = _popGroupsOf(_popColorGrid());
    if (!more.length) { _gPopFinish(); return; }
    if (_gPopMode() === 'coop') {
      if (!opts.ta) {
        _popTaSchedule();   // FIX 2026-10-08#050 八连消那句曾在这里发进聊天：局中不发，见 _gEndReport
      } else _gPopCoopRender();
    }
  }, 240);
}
function _popTaSchedule() {
  if (_pop.taTimer) clearTimeout(_pop.taTimer);   // 只许一发在飞：切走再切回不该攒出两手
  _pop.turn = 'ta';
  _gPopCoopRender();
  _pop.taTimer = setTimeout(_popTaMove, 760 + Math.random() * 1000);   // 想一下，但不钉死一个数
}
function _popSimPop(g0, grp) {   // 在色板上演一遍（下落+左移），不碰真盘
  const ng = g0.slice();
  grp.forEach(i => { ng[i] = -1; });
  const cols = [];
  for (let c = 0; c < POP_N; c++) {
    const col = [];
    for (let r = POP_N - 1; r >= 0; r--) if (ng[r * POP_N + c] >= 0) col.push(ng[r * POP_N + c]);
    cols.push(col);
  }
  const live = cols.filter(a => a.length);
  const out = new Array(POP_N * POP_N).fill(-1);
  live.forEach((col, nc) => col.forEach((v, i) => { out[(POP_N - 1 - i) * POP_N + nc] = v; }));
  return out;
}
function _popTaPick() {   // 合作里 TA 的那一片：这一手的分＋消完留下的最大连片（留后劲），12% 随手一消
  const g0 = _popColorGrid();
  const groups = _popGroupsOf(g0);
  if (!groups.length) return null;
  if (Math.random() < 0.12) return groups[Math.floor(Math.random() * groups.length)];
  const scored = groups.map(grp => {
    const nxt = _popGroupsOf(_popSimPop(g0, grp));
    return { grp, v: grp.length * grp.length * 5 + (nxt.length ? Math.max.apply(null, nxt.map(x => x.length)) * 14 : 0) };
  });
  scored.sort((a, b) => b.v - a.v);
  const near = scored.filter(x => scored[0].v - x.v <= 60);
  return near[Math.floor(Math.random() * near.length)].grp;
}
function _popTaMove() {
  _pop.taTimer = 0;
  _pop.turn = 'me';
  // 不在这一页就不消：TA 不隔着页面动你的盘（这一手就此作废，回来照常轮到你）
  if (_gPopMode() !== 'coop' || _pop.over || data.games.tab !== 'pop' || document.body.dataset.view !== 'games') return;
  const grp = _popTaPick();
  if (!grp) { _gPopFinish(); return; }   // 无片可消＝局终
  _pop.lastTa = G_POP_COLORS[_pop.cells[grp[0]].v].n;
  _popDoPop(grp, { ta: true });
}
function _popScoreView(bump) {
  const wrap = $('#popScoreWrap');
  const coop = _gPopMode() === 'coop';
  if (wrap) {
    wrap.innerHTML = (coop ? '我们 <b id="popScore">' : '本局 <b id="popScore">')
      + _pop.score + '</b> · ' + (coop ? '一人一片' : '点连片直接消除');
  }
  const el = $('#popScore');
  if (el && bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}
function _popFloatScore(txt, x, y) {   // 飘在消除组质心（不给坐标则维持右上角旧位）
  const box = $('#popGrid');
  if (!box) return;
  const f = document.createElement('span');
  f.className = 'pop-float';
  f.textContent = txt;
  if (x != null) { f.style.left = x.toFixed(1) + 'px'; f.style.top = y.toFixed(1) + 'px'; }
  box.appendChild(f);
  setTimeout(() => f.remove(), 800);
}
function gPopRefreshStat() {
  const el = $('#popStat');
  if (!el) return;
  const cid = data.games.with;
  if (_gPopMode() === 'coop') {
    const co = _gPopCoopScore(cid);
    el.textContent = `合作最高 ${co.best} 分 · ${co.plays} 局${co.clear ? ' · 一起清过盘' : ''}`;
    _gPopCoopRender();
    return;
  }
  const sc = _gBook('pop');
  el.textContent = `最高 ${sc.best} · ${sc.plays} 局${_gPopMode() === 'vs' && sc.ta > 0 ? ` · 挑战 ${sc.ta}` : ''}`;
}
function _gPopApplyMode() {
  const mode = _gPopMode();
  _pop.mode = mode;
  _pop.turn = 'me';
  _gModeChrome('pop');   // 那一行只属对战（BUGS #302）：自己玩不出现、合作由 coopLine 那条说
  const cl = $('#coopLinePop'); if (cl) cl.hidden = mode !== 'coop';
  $$('#popModes .merge-scheme').forEach(b => b.classList.toggle('on', b.dataset.pmode === mode));
  _popScoreView(false);
  if (mode === 'coop') _gPopCoopRender(); else _gamesRenderTaLine('pop');
  gPopRefreshStat();
}
function _gPopSetMode(m) {
  if (!['solo', 'coop', 'vs'].includes(m) || _gPopMode() === m) return;
  data.games.popMode = m;
  save();
  gPopRestart();   // 三种玩法的盘面状态不能混用（合作里切回自己玩＝TA 那一手没人接），换模式即重开一局
  showToast(m === 'coop' ? '和 ' + _gName(data.games.with) + ' 一起玩：你消一片，TA 消一片' : (m === 'solo' ? '自己玩，练手无压力' : '比分对战，可别输给 TA'));
}
function _gPopCoopRender() {
  const box = $('#coopLinePop');
  if (!box) return;
  const c = _gContact(data.games.with) || {};
  const nm = _gName(data.games.with);
  let say;
  if (_pop.over) say = '这盘消完了 · 重新开始或换个玩法';
  else if (_pop.turn === 'ta') say = nm + ' 正在挑哪一片…';
  else if (_pop.lastTa) say = 'TA 刚消了一片' + _pop.lastTa + '的 · 该你了';
  else say = '你消一片，TA 消一片';
  box.innerHTML = `<span class="avatar">${avatarHTML(c.avatar)}</span>`
    + `<div class="ta-tt"><b>和 ${escapeHTML(nm)} 一起</b><span>${escapeHTML(say)}</span></div>`
    + `<div class="ta-score${_pop.over ? '' : ' live'}"><b>${_pop.score}</b><span>我们</span></div>`;
}
function _gPopCoopEnd(score, cleared) {
  const co = _gPopCoopScore(data.games.with);
  co.plays++;
  if (score > co.best) co.best = score;
  if (cleared) co.clear = true;
  _gLast.pop = { score, coop: true };
  save();
  if (!cleared) playSfx('over');   // 全清那一发由 _gPopFinish 报，这里不叠第二声
  gPopRefreshStat();
  _gEndReport('pop', score, { coop: true, cleared });
}
function _gPopCoopShare() {   // 「告诉 TA」在合作里报的是我们那一笔
  const co = _gPopCoopScore(data.games.with);
  const score = _pop.score || co.best;
  if (!score) { showToast('先一起消一盘再告诉 TA'); return; }
  const cid = data.games.with;
  _deliverToChat({
    id: nextId(), from: 'me', text: '这盘是我们俩消的，' + score + ' 分',
    game: { kind: 'score', game: 'pop', score, best: co.best, ta: 0, beaten: false, newBest: score >= co.best && score > 0 }
  }, cid);
  setTimeout(() => {
    if (!data.games || !data.contacts) return;
    _deliverToChat({ id: nextId(), from: 'partner', text: _gPick(G_COOP_SHARE, Math.random()) }, cid);
  }, 1400 + Math.random() * 2600);
  showToast('已发给 ' + _gName(cid));
}
function _gPopFinish() {
  if (_pop.over) return;
  _pop.over = true;
  if (_pop.taTimer) { clearTimeout(_pop.taTimer); _pop.taTimer = 0; }
  _pop.turn = 'me';
  const cleared = _pop.cells.every(c => !c);
  if (cleared) {
    _pop.score += 2000;
    const gf = _popGeom();
    if (gf) _popFloatScore('全清 +2000', gf.box.clientWidth / 2, gf.box.clientHeight / 2); else _popFloatScore('全清 +2000');
    playSfx('clear');
  }
  const mode = _gPopMode();
  if (mode === 'coop') {
    const co = _gPopCoopScore(data.games.with);
    if (cleared && !co.clear) { co.clear = true; save(); }   // FIX #050 成就只记，全清那句并进局终那条
    _gPopCoopEnd(_pop.score, cleared);
  } else {
    _gGameEnd('pop', _pop.score, { noTa: mode === 'solo', quiet: cleared, cleared });
  }
  const ov = $('#popOver');
  if (ov) {
    if (mode === 'coop') ov.textContent = `这盘我们一起消了 ${_pop.score} 分${cleared ? ' · 整盘清空！' : ''}`;
    else ov.textContent = `局终 · ${_pop.score} 分${cleared ? ' · 全清 +2000' : ' · 剩 ' + _pop.cells.filter(c => c).length + ' 块'}${_gLast.pop && _gLast.pop.beaten ? ' · 挑战告捷' : ''}`;
  }
}

/* ================= 连连看 =================
   8×10 盘面（外圈留一环走线），同牌连线 ≤2 折成对消除：每对 +10、4 秒内连对 +5、清空整盘 +100；
   死局自动洗牌重排（次数不作弊扣分，只报一句）。牌面优先用你表情包库的图（stickerGroups 全池），
   不足 10 张由内置线稿图腾补齐——跟应用本身的素材联动。
   三模式与 2048/合成同源口径：solo / coop 严格轮流（分数合账单独记 scores[cid].link.coop）/ vs 实时对局。 */
const G_LINK_TINTS = [   // 图腾糖果渐变底（浅→深），12 槽各配一色＝同种恒同色、邻种不同色
  ['#f2a09a', '#d96a5f'], ['#f6c489', '#e09a4a'], ['#f2d97e', '#d9b44a'], ['#a9d9a2', '#78b871'],
  ['#8fd0c8', '#57a89e'], ['#9ed4e8', '#6aa8c8'], ['#a3c6ee', '#7296d6'], ['#c9b4f2', '#a184de'],
  ['#f2b4cd', '#de86ac'], ['#e8b8a0', '#cf8a66'], ['#c8d49a', '#9cb068'], ['#b8c4cc', '#8a98a4']
];
const G_LINK_ICONS = [
  '<path d="M12 20S4.8 15.2 2.9 10.8A5.1 5.1 0 0 1 12 6.2a5.1 5.1 0 0 1 9.1 4.6C19.2 15.2 12 20 12 20Z"/>',
  '<path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8Z"/>',
  '<path d="M20.2 13.6A8.2 8.2 0 1 1 10.4 3.8a6.6 6.6 0 0 0 9.8 9.8Z"/>',
  '<path d="M7 18.5h10.2a3.8 3.8 0 0 0 .5-7.57A6 6 0 0 0 6.2 12a3.6 3.6 0 0 0 .8 6.5Z"/>',
  '<path d="M5.5 19C5.5 10 12.5 5 20 5c0 8.5-5.5 14-13 14Z"/><path d="M5.5 19c2.5-5 6.5-8.5 10.5-10"/>',
  '<path d="M5 5.5h11v6.5a5.5 5.5 0 0 1-11 0Z"/><path d="M16 7h2.2a2.4 2.4 0 0 1 0 4.8H16"/><path d="M4.5 20h12"/>',
  '<circle cx="8.5" cy="8.5" r="4.5"/><path d="M11.7 11.7 20 20M17 17l2-2M14.5 14.5l2-2"/>',
  '<path d="M6 16.5v-5a6 6 0 0 1 12 0v5l1.8 2.5H4.2Z"/><path d="M10 21.5a2.2 2.2 0 0 0 4 0"/>',
  '<path d="M12 3.5a9 9 0 0 1 9 8.5H3a9 9 0 0 1 9-8.5Z"/><path d="M12 12v6.5a2.2 2.2 0 0 0 4.4 0"/>',
  '<path d="M3.5 12c2.8-3.8 6.8-5.8 10.5-5.8l6.5 5.8-6.5 5.8C10.3 17.8 6.3 15.8 3.5 12Z"/><circle cx="15.5" cy="12" r="1"/>',
  '<path d="M9 3.5 4.5 5v15.5L9 19l6 1.5 4.5-1.5V3.5L15 5 9 3.5Z"/><path d="M9 3.5V19M15 5v15.5"/>',
  '<path d="M8 5h8a2 2 0 0 1 2 2v12l-6-3-6 3V7a2 2 0 0 1 2-2Z"/>',
  '<path d="M9 18V6.5l9-2V16"/><circle cx="6.8" cy="18" r="2.3"/><circle cx="15.8" cy="16" r="2.3"/>',
  '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M4 12h16M12 8v12"/><path d="M8.5 8c-2 0-3-1.2-3-2.5S7 3 8.5 3c2 0 3.5 2.5 3.5 5 0-2.5 1.5-5 3.5-5 1.5 0 3 .9 3 2.5S18 8 15.5 8"/>',
  '<path d="M12 3v18M3.8 7.5l16.4 9M20.2 7.5l-16.4 9"/>',
  '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9 19 19M19 5l-2.1 2.1M7.1 16.9 5 19"/>'
];
const LINK_ROWS = 8, LINK_COLS = 10, LINK_PAD = 8, LINK_GAP = 4;   // 与 games.css .link-grid/.link-bg 的内距与格间距一致
const LINK_PAIR_PT = 10, LINK_COMBO_PT = 5, LINK_CLEAR_PT = 100;
const _link = { tiles: null, sel: null, score: 0, over: false, _id: 0, left: 0, streakAt: 0, faces: [], reshuffles: 0, mode: 'solo', turn: 'me', taTimer: 0, lastTa: false, _els: new Map() };
function _gLinkMode() {
  const m = data.games && data.games.linkMode;
  return ['solo', 'coop', 'vs'].includes(m) ? m : 'solo';
}
function _gLinkCoopScore(cid) {   // 合作成绩单独记账，不进个人 best／挑战分
  const sc = _gScore(cid, 'link');
  if (!sc.coop || typeof sc.coop !== 'object' || Array.isArray(sc.coop)) sc.coop = { best: 0, plays: 0, clear: false };
  const co = sc.coop;
  if (typeof co.best !== 'number' || !isFinite(co.best) || co.best < 0) co.best = 0;
  if (typeof co.plays !== 'number' || !isFinite(co.plays) || co.plays < 0) co.plays = 0;
  if (co.clear !== true) co.clear = false;
  return co;
}
function _gLinkSkins() {   // 当前生效一套图腾皮肤（懒补；键=0~11 槽位）
  if (!data.games.linkSkins || typeof data.games.linkSkins !== 'object' || Array.isArray(data.games.linkSkins)) data.games.linkSkins = {};
  return data.games.linkSkins;
}
function _gLinkSkinSchemes() {
  if (!data.games || !Array.isArray(data.games.linkSkinSchemes)) data.games.linkSkinSchemes = [];
  return data.games.linkSkinSchemes;
}
function _gLinkSkinSchemeOn() {   // 当前选中（跟着编辑的那套）；''=散装/默认图腾
  return _gLinkSkinSchemes().find(s => s.id === data.games.linkSkinScheme) || null;
}
function _linkStickerImgs() {   // 表情包库全池去重（槽位没传图时自动上桌）
  const imgs = [];
  (data.stickerRecent || []).forEach(u => { if (typeof u === 'string' && u) imgs.push(u); });
  (data.stickerGroups || []).forEach(g => { if (g && Array.isArray(g.imgs)) g.imgs.forEach(u => { if (typeof u === 'string' && u) imgs.push(u); }); });
  (data.stickers || []).forEach(u => { if (typeof u === 'string' && u) imgs.push(u); });
  const seen = new Set(), out = [];
  for (const u of imgs) { if (!seen.has(u)) { seen.add(u); out.push(u); } }
  return out;
}
function _linkKinds() {   // 12 个固定槽位：上传的皮肤 > 表情包库的图（自动上桌）> 设计图腾
  const skins = _gLinkSkins();
  const imgs = _linkStickerImgs();
  const kinds = [];
  for (let i = 0; i < 12; i++) {
    if (skins[i]) kinds.push({ img: skins[i] });
    else if (imgs[i]) kinds.push({ img: imgs[i] });
    else kinds.push({ icon: i });
  }
  return kinds;
}
function gLinkBoot(force) {
  if (!data.games.linkSkins || typeof data.games.linkSkins !== 'object' || Array.isArray(data.games.linkSkins)) data.games.linkSkins = {};
  if (!Array.isArray(data.games.linkSkinSchemes)) data.games.linkSkinSchemes = [];
  if (typeof data.games.linkSkinScheme !== 'string') data.games.linkSkinScheme = '';
  if (_link.tiles && !force) { _gLinkApplyMode(); _linkRender(); return; }
  gLinkRestart();
}
/* ---------- 图腾皮肤：12 个固定槽位，逐格上传／一次传一套／整套存方案（与合成、2048 同族） ---------- */
function _gLinkSkinsRender() {
  const box = $('#linkSkins');
  if (!box) return;
  const skins = _gLinkSkins();
  const on = data.games.linkSkinScheme || '';
  box.innerHTML = `<div class="merge-skin-row">`
    + `<button type="button" class="merge-scheme${on === '' ? ' on' : ''}" data-lsch="">设计图腾</button>`
    + _gLinkSkinSchemes().map(s => `<button type="button" class="merge-scheme${s.id === on ? ' on' : ''}" data-lsch="${s.id}">${escapeHTML(s.name)}<u data-lschdel="${s.id}" title="删这套">×</u></button>`).join('')
    + `<button type="button" class="merge-scheme add" id="linkSchemeSave">＋存为方案</button>`
    + `<button type="button" class="merge-scheme add" id="linkSkinBatchBtn">一次传一套</button>`
    + `</div>`
    + `<div class="g2048-skins-t">点哪格换哪格，当场就玩（图只存本机）· 没传图的格子会自动拿表情包库的图补位<br>「一次传一套」按你选的先后从第 1 格铺到第 12 格，已有的格子直接换掉（一次最多 12 张，超大图跳过）</div>`
    + `<div class="link-skin-grid">` + [...Array(12).keys()].map(i => {
      const im = skins[i];
      return `<button type="button" class="link-skin${im ? ' has' : ''}" data-lskin="${i}" aria-label="更换第${i + 1}格的图">`
        + (im ? `<img src="${im}" alt="" draggable="false">` : _linkFaceHTML(i))
        + (im ? `<u data-lskinx="${i}" aria-label="移除第${i + 1}格的图">×</u>` : '')
        + `</button>`;
    }).join('') + `</div>`
    + `<button type="button" class="game-btn link-skin-reset" id="linkSkinReset">这套全部恢复默认图腾</button>`;
}
function _gLinkSkinsAfter() {   // 皮肤变了：面板重画＋在玩的牌面整套换装（节点常驻后 innerHTML 不会自己跟上，全量重登）
  const bx = $('#linkSkins');
  if (bx && !bx.hidden) _gLinkSkinsRender();
  _link.faces = _linkKinds();
  if (_link.tiles) {
    _link._els.forEach(el => el.remove());
    _link._els.clear();
    _linkRender();
  }
}
function _gLinkSkinSlotPut(i, durl) {
  _gLinkSkins()[i] = durl;
  const sc = _gLinkSkinSchemeOn();   // 选中哪套方案就同步进哪套
  if (sc) sc.skins[i] = durl;
  save();
  _gLinkSkinsAfter();
}
function _gLinkSkinClear(i) {
  if (!_gLinkSkins()[i]) return;
  delete data.games.linkSkins[i];
  const sc = _gLinkSkinSchemeOn();
  if (sc) delete sc.skins[i];
  save();
  _gLinkSkinsAfter();
  showToast('第 ' + (i + 1) + ' 格恢复默认');
}
function _gLinkSchemeUse(id) {
  const sc = id ? _gLinkSkinSchemes().find(s => s.id === id) : null;
  if (id && !sc) return;
  const fresh = {};
  if (sc) Object.keys(sc.skins).forEach(k => { if (sc.skins[k]) fresh[k] = sc.skins[k]; });
  data.games.linkSkins = fresh;
  data.games.linkSkinScheme = sc ? sc.id : '';
  save();
  _gLinkSkinsAfter();
  showToast(sc ? '已切到「' + sc.name + '」' : '已切回设计图腾');
}
function _gLinkSchemeSave() {
  const list = _gLinkSkinSchemes();
  if (list.length >= 6) { showToast('方案最多存 6 套，删一套再存'); return; }
  const cur = _gLinkSkins();
  const skins = {};
  Object.keys(cur).forEach(k => { if (cur[k]) skins[k] = cur[k]; });
  if (!Object.keys(skins).length) { showToast('先传几张图再存'); return; }
  let n = 1;
  while (list.some(s => s.name === '方案 ' + n)) n++;
  list.push({ id: 'ls' + Date.now().toString(36) + Math.floor(Math.random() * 99), name: '方案 ' + n, skins });
  data.games.linkSkinScheme = list[list.length - 1].id;
  save();
  const bx = $('#linkSkins');
  if (bx && !bx.hidden) _gLinkSkinsRender();
  showToast('已存「方案 ' + n + '」，随时切');
}
function _gLinkSchemeDel(id) {
  const list = _gLinkSkinSchemes();
  const i = list.findIndex(s => s.id === id);
  if (i < 0) return;
  const gone = list.splice(i, 1)[0];
  if (data.games.linkSkinScheme === id) data.games.linkSkinScheme = '';   // 画面上那套先留着，切走才换
  save();
  const bx = $('#linkSkins');
  if (bx && !bx.hidden) _gLinkSkinsRender();
  showToast('已删「' + gone.name + '」');
}
let _linkSkinPick = -1;
function gLinkRestart() {
  _link.faces = _linkKinds();
  const pairs = LINK_ROWS * LINK_COLS / 2;
  const deck = [];
  for (let i = 0; i < pairs; i++) { const k = Math.floor(Math.random() * _link.faces.length); deck.push(k, k); }
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
  _link.tiles = deck.map(k => ({ id: ++_link._id, k }));
  _link.score = 0;
  _link.over = false;
  _link.sel = null;
  _link.left = LINK_ROWS * LINK_COLS;
  _link.streakAt = 0;
  _link.reshuffles = 0;
  _link.turn = 'me';
  _link.lastTa = false;
  if (_link.taTimer) { clearTimeout(_link.taTimer); _link.taTimer = 0; }
  delete _gLast.link;
  delete _gLive.link;   // TA 的实时对局跟着这局重来
  const ov = $('#linkOver');
  if (ov) ov.textContent = '';
  _linkRender();
  _linkScoreView(false);
  gLinkRefreshStat();
  _gLinkApplyMode();
}
function _linkGeom() {   // 牌面几何（定位与连线共用）：LINK_PAD/LINK_GAP 改动须与 games.css 同步；内距随全屏档现算
  const box = $('#linkGrid');
  if (!box) return null;
  const W = box.clientWidth || 320, H = box.clientHeight || W;
  const pg = _gEffPG(LINK_PAD, LINK_GAP), PAD = pg[0], GAP = pg[1];
  const cw = (W - PAD * 2 - GAP * (LINK_COLS - 1)) / LINK_COLS;
  const ch = (H - PAD * 2 - GAP * (LINK_ROWS - 1)) / LINK_ROWS;
  return { box, pad: PAD, gap: GAP, cw, ch, sx: cw + GAP, sy: ch + GAP };
}
function _linkFaceHTML(k) {
  const f = _link.faces[k];
  if (!f) return '';
  if (f.img) return `<img src="${f.img}" alt="" draggable="false">`;
  const t = G_LINK_TINTS[f.icon % G_LINK_TINTS.length];   // 线稿图腾配糖果渐变底＋白线＝不再死白
  return `<i class="link-ic" style="background:linear-gradient(155deg,${t[0]},${t[1]})"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${G_LINK_ICONS[f.icon]}</svg></i>`;
}
function _linkRender() {
  const g = _linkGeom();
  if (!g) return;
  _gSetCellVars(g.box, g.pad, g.gap, g.cw, g.ch);
  let bg = g.box.querySelector('.link-bg');
  if (!bg) {
    bg = document.createElement('div');
    bg.className = 'link-bg';
    bg.innerHTML = '<i></i>'.repeat(LINK_ROWS * LINK_COLS);
    g.box.appendChild(bg);
  }
  const alive = new Set();
  for (let i = 0; i < LINK_ROWS * LINK_COLS; i++) {
    const t = _link.tiles[i];
    if (!t) continue;
    alive.add(t.id);
    let el = _link._els.get(t.id);
    if (!el) {
      el = document.createElement('button');
      el.type = 'button';
      el.className = 'link-tile';
      el.innerHTML = _linkFaceHTML(t.k);
      _link._els.set(t.id, el);
      g.box.appendChild(el);
      el.classList.add('in');   // 登场回弹（沿对角线错峰）
      el.style.animationDelay = ((Math.floor(i / LINK_COLS) + i % LINK_COLS) * 14) + 'ms';
      setTimeout(() => { el.classList.remove('in'); el.style.animationDelay = ''; }, 1000);
    }
    el.dataset.lidx = i;
    el.classList.toggle('sel', _link.sel === i);
    el.style.transform = `translate(${Math.round((i % LINK_COLS) * g.sx)}px,${Math.round(Math.floor(i / LINK_COLS) * g.sy)}px)` + (_link.sel === i ? ' scale(1.08)' : '');
  }
  _link._els.forEach((el, id) => { if (!alive.has(id)) { el.remove(); _link._els.delete(id); } });   // 换局/清场：不在盘上的旧牌退场
}
function _linkPath(a, b) {   // ≤2 折连线判定（外圈留一环走线）：返回 {turns, pts 折点序列（含端点，外圈坐标）} 或 null
  const R = LINK_ROWS + 2, C = LINK_COLS + 2;
  const occ = new Uint8Array(R * C);
  for (let r = 0; r < LINK_ROWS; r++) for (let c = 0; c < LINK_COLS; c++) if (_link.tiles[r * LINK_COLS + c]) occ[(r + 1) * C + (c + 1)] = 1;
  const ar = Math.floor(a / LINK_COLS) + 1, ac = a % LINK_COLS + 1;
  const br = Math.floor(b / LINK_COLS) + 1, bc = b % LINK_COLS + 1;
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const best = new Int8Array(R * C).fill(9);
  let queue = [[ar, ac, -1, 0, [[ar, ac]]]];
  best[ar * C + ac] = 0;
  while (queue.length) {
    const cur = queue.shift();
    const r = cur[0], c = cur[1], dir = cur[2], turns = cur[3], path = cur[4];
    for (let d = 0; d < 4; d++) {
      const nr = r + DIRS[d][0], nc = c + DIRS[d][1];
      if (nr < 0 || nr >= R || nc < 0 || nc >= C) continue;
      if (occ[nr * C + nc] && !(nr === br && nc === bc)) continue;
      const nt = dir === -1 ? turns : (d === dir ? turns : turns + 1);
      if (nt > 2) continue;
      const npath = (dir === -1 || d === dir) ? path : path.concat([[r, c]]);
      if (nr === br && nc === bc) return { turns: nt, pts: npath.concat([[nr, nc]]) };
      if (nt >= best[nr * C + nc]) continue;
      best[nr * C + nc] = nt;
      queue.push([nr, nc, d, nt, npath]);
    }
  }
  return null;
}
function _linkMatches() {   // 当前所有可连的对（死局检测与 TA 选牌共用）
  const out = [];
  const t = _link.tiles;
  for (let i = 0; i < t.length; i++) {
    if (!t[i]) continue;
    for (let j = i + 1; j < t.length; j++) {
      if (t[j] && t[j].k === t[i].k && _linkPath(i, j)) out.push([i, j]);
    }
  }
  return out;
}
function _linkDrawLine(pts, color) {   // 连线跟随所连牌的专属深色（不给色则维持墨色）
  const g = _linkGeom();
  if (!g || !pts || pts.length < 2) return;
  let svg = g.box.querySelector('.link-lines');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'link-lines');
    g.box.appendChild(svg);
  }
  const W = g.box.clientWidth, H = g.box.clientHeight;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const cx = p => Math.max(2, Math.min(W - 2, (p[1] - 1) * g.sx + g.cw / 2));   // 外圈坐标压回边框内画
  const cy = p => Math.max(2, Math.min(H - 2, (p[0] - 1) * g.sy + g.ch / 2));
  const d = pts.map((p, i) => (i ? 'L' : 'M') + cx(p).toFixed(1) + ' ' + cy(p).toFixed(1)).join(' ');
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  el.setAttribute('d', d);
  el.setAttribute('class', 'link-line');
  if (color) el.style.stroke = color;
  el.setAttribute('pathLength', '100');
  svg.appendChild(el);
  setTimeout(() => el.remove(), 620);
}
function linkTap(i) {
  if (_link.over || !_link.tiles || !_link.tiles[i]) return;
  if (_gLinkMode() === 'coop' && _link.turn === 'ta') return;   // 轮到 TA：你这一下不算数
  if (_link.sel === i) { _link.sel = null; _linkRender(); return; }
  if (_link.sel == null) { _link.sel = i; _linkRender(); return; }
  const a = _link.sel;
  if (_link.tiles[a].k === _link.tiles[i].k) {
    const path = _linkPath(a, i);
    if (path) { _linkDoMatch(a, i, path); return; }
  }
  _link.sel = i; _linkRender();   // 不成对：改选这块
  const el = _link._els.get(_link.tiles[i] && _link.tiles[i].id);   // 新点的牌摇头示意「这两张连不上」
  if (el) { el.classList.add('no'); setTimeout(() => el.classList.remove('no'), 320); }
}
function _linkDoMatch(a, b, path, opts) {
  opts = opts || {};
  const ta = _link.tiles[a], tb = _link.tiles[b];
  const ea = ta && _link._els.get(ta.id);   // 先抓牌面节点再清盘（bye 动画要用）
  const eb = tb && _link._els.get(tb.id);
  _link.tiles[a] = null;
  _link.tiles[b] = null;
  _link.left -= 2;
  _link.sel = null;
  let gain = LINK_PAIR_PT;
  const now = Date.now();
  const chained = now - _link.streakAt < 4000;   // 4 秒内连对有小加成
  if (chained) gain += LINK_COMBO_PT;
  _link.streakAt = now;
  _link.score += gain;
  playSfx('blend', { step: _gSfxStep(chained ? 4 : 0), weak: !!opts.ta });   // 连上才响，点错改选不出声
  const kc = ta && G_LINK_TINTS[ta.k % G_LINK_TINTS.length];   // 连线跟随所连牌的专属深色
  _linkDrawLine(path.pts, kc ? kc[1] : null);
  [ea, eb].forEach((el, k) => {   // 线描到位再爆开（错峰 90ms），爆完摘节点
    if (!el) return;
    el.classList.remove('sel');
    el.classList.add('bye');
    el.style.animationDelay = (90 + k * 40) + 'ms';
    setTimeout(() => el.remove(), 520);
  });
  if (ta) _link._els.delete(ta.id);
  if (tb) _link._els.delete(tb.id);
  if (_gLinkMode() === 'vs' && !opts.ta) _gTaLiveStart('link');   // 对战：你连第一对 TA 才开始实时玩
  setTimeout(() => {
    if (!data.games) return;
    const g = _linkGeom();
    if (g) {   // 分数在两牌中点飘出（连对换个叫法）
      const mx = ((a % LINK_COLS) + (b % LINK_COLS)) / 2 * g.sx + g.cw / 2;
      const my = (Math.floor(a / LINK_COLS) + Math.floor(b / LINK_COLS)) / 2 * g.sy + g.ch / 2;
      _linkFloat((chained ? '连对 +' : '+') + gain, mx, my);
    }
    _linkRender();
    _linkScoreView(true);
    if (!_link.left) { setTimeout(_gLinkFinish, 480); return; }
    if (!_linkMatches().length) _linkReshuffle();   // 死局自动洗牌（牌面滑到新位置）
    if (_gLinkMode() === 'coop') {
      if (!opts.ta) _linkTaSchedule();
      else _gLinkCoopRender();
    }
  }, 300);
}
function _linkReshuffle() {
  const alive = [];
  _link.tiles.forEach(t => { if (t) alive.push(t); });
  for (let tries = 0; tries < 80; tries++) {
    for (let i = alive.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = alive[i]; alive[i] = alive[j]; alive[j] = t; }
    let k = 0;
    _link.tiles = _link.tiles.map(t => t ? alive[k++] : null);
    if (_linkMatches().length) break;
  }
  _link.reshuffles++;
  showToast('没有能连的了，自动洗了一轮牌');
}
function _linkTaSchedule() {
  if (_link.taTimer) clearTimeout(_link.taTimer);   // 只许一发在飞
  _link.turn = 'ta';
  _gLinkCoopRender();
  _link.taTimer = setTimeout(_linkTaMove, 760 + Math.random() * 1000);
}
function _gLinkTaPick() {   // 合作里 TA 的那一对：一眼看得见的短路径先连（同分随机），12% 随手一连
  const ms = _linkMatches();
  if (!ms.length) return null;
  if (Math.random() < 0.12) return ms[Math.floor(Math.random() * ms.length)];
  const scored = ms.map(pr => { const p = _linkPath(pr[0], pr[1]); return { pr, v: (p ? p.turns : 2) * 10 + Math.random() * 6 }; });
  scored.sort((a, b) => a.v - b.v);
  return scored[0].pr;
}
function _linkTaMove() {
  _link.taTimer = 0;
  _link.turn = 'me';
  // 不在这一页就不连：TA 不隔着页面动你的盘
  if (_gLinkMode() !== 'coop' || _link.over || data.games.tab !== 'link' || document.body.dataset.view !== 'games') return;
  const pr = _gLinkTaPick();
  if (!pr) { _gLinkFinish(); return; }   // 无对可连＝局终
  _link.lastTa = true;
  _linkDoMatch(pr[0], pr[1], _linkPath(pr[0], pr[1]), { ta: true });
}
function _linkScoreView(bump) {
  const wrap = $('#linkScoreWrap');
  const coop = _gLinkMode() === 'coop';
  if (wrap) {
    wrap.innerHTML = (coop ? '我们 <b id="linkScore">' : '本局 <b id="linkScore">')
      + _link.score + '</b> · ' + (coop ? '一人一对' : '剩 ' + _link.left + ' 块');
  }
  const el = $('#linkScore');
  if (el && bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}
function _linkFloat(txt, x, y) {   // 分数飘在两牌中点（不给坐标则维持右上角旧位）
  const box = $('#linkGrid');
  if (!box) return;
  const f = document.createElement('span');
  f.className = 'link-float';
  f.textContent = txt;
  if (x != null) { f.style.left = x.toFixed(1) + 'px'; f.style.top = y.toFixed(1) + 'px'; }
  box.appendChild(f);
  setTimeout(() => f.remove(), 800);
}
function gLinkRefreshStat() {
  const el = $('#linkStat');
  if (!el) return;
  const cid = data.games.with;
  if (_gLinkMode() === 'coop') {
    const co = _gLinkCoopScore(cid);
    el.textContent = `合作最高 ${co.best} 分 · ${co.plays} 局${co.clear ? ' · 一起连完过' : ''}`;
    _gLinkCoopRender();
    return;
  }
  const sc = _gBook('link');
  el.textContent = `最高 ${sc.best} · ${sc.plays} 局${_gLinkMode() === 'vs' && sc.ta > 0 ? ` · 挑战 ${sc.ta}` : ''}`;
}
function _gLinkApplyMode() {
  const mode = _gLinkMode();
  _link.mode = mode;
  _link.turn = 'me';
  _gModeChrome('link');   // 那一行只属对战（BUGS #302）：自己玩不出现、合作由 coopLine 那条说
  const cl = $('#coopLineLink'); if (cl) cl.hidden = mode !== 'coop';
  $$('#linkModes .merge-scheme').forEach(b => b.classList.toggle('on', b.dataset.lmode === mode));
  _linkScoreView(false);
  if (mode === 'coop') _gLinkCoopRender(); else _gamesRenderTaLine('link');
  gLinkRefreshStat();
}
function _gLinkSetMode(m) {
  if (!['solo', 'coop', 'vs'].includes(m) || _gLinkMode() === m) return;
  data.games.linkMode = m;
  save();
  gLinkRestart();   // 换模式即重开一局（三种玩法的盘面状态不能混用）
  showToast(m === 'coop' ? '和 ' + _gName(data.games.with) + ' 一起玩：你连一对，TA 连一对' : (m === 'solo' ? '自己玩，练手无压力' : '比分对战，可别输给 TA'));
}
function _gLinkCoopRender() {
  const box = $('#coopLineLink');
  if (!box) return;
  const c = _gContact(data.games.with) || {};
  const nm = _gName(data.games.with);
  let say;
  if (_link.over) say = '这盘连完了 · 重新开始或换个玩法';
  else if (_link.turn === 'ta') say = nm + ' 正在找那一对…';
  else if (_link.lastTa) say = 'TA 刚连走一对 · 该你了';
  else say = '你连一对，TA 连一对';
  box.innerHTML = `<span class="avatar">${avatarHTML(c.avatar)}</span>`
    + `<div class="ta-tt"><b>和 ${escapeHTML(nm)} 一起</b><span>${escapeHTML(say)}</span></div>`
    + `<div class="ta-score${_link.over ? '' : ' live'}"><b>${_link.score}</b><span>我们</span></div>`;
}
function _gLinkCoopEnd(score, cleared) {
  const co = _gLinkCoopScore(data.games.with);
  co.plays++;
  if (score > co.best) co.best = score;
  if (cleared) co.clear = true;
  _gLast.link = { score, coop: true };
  save();
  if (!cleared) playSfx('over');   // 全清那一发由 _gLinkFinish 报，这里不叠第二声
  gLinkRefreshStat();
  _gEndReport('link', score, { coop: true, cleared });
}
function _gLinkCoopShare() {
  const co = _gLinkCoopScore(data.games.with);
  const score = _link.score || co.best;
  if (!score) { showToast('先一起连一盘再告诉 TA'); return; }
  const cid = data.games.with;
  _deliverToChat({
    id: nextId(), from: 'me', text: '这盘是我们俩连的，' + score + ' 分',
    game: { kind: 'score', game: 'link', score, best: co.best, ta: 0, beaten: false, newBest: score >= co.best && score > 0 }
  }, cid);
  setTimeout(() => {
    if (!data.games || !data.contacts) return;
    _deliverToChat({ id: nextId(), from: 'partner', text: _gPick(G_COOP_SHARE, Math.random()) }, cid);
  }, 1400 + Math.random() * 2600);
  showToast('已发给 ' + _gName(cid));
}
function _gLinkFinish() {
  if (_link.over) return;
  _link.over = true;
  if (_link.taTimer) { clearTimeout(_link.taTimer); _link.taTimer = 0; }
  _link.turn = 'me';
  _link.sel = null;
  const cleared = !_link.left;
  if (cleared) {
    _link.score += LINK_CLEAR_PT;
    _linkFloat('全清 +' + LINK_CLEAR_PT);
    playSfx('clear');
  }
  const mode = _gLinkMode();
  if (mode === 'coop') {
    const co = _gLinkCoopScore(data.games.with);
    if (cleared && !co.clear) { co.clear = true; save(); }   // FIX #050 成就只记，全清那句并进局终那条
    _gLinkCoopEnd(_link.score, cleared);
  } else {
    _gGameEnd('link', _link.score, { noTa: mode === 'solo', quiet: cleared, cleared });
  }
  const ov = $('#linkOver');
  if (ov) {
    if (mode === 'coop') ov.textContent = `这盘我们一起连了 ${_link.score} 分${cleared ? ' · 整盘连完！' : ''}`;
    else ov.textContent = `局终 · ${_link.score} 分${cleared ? ' · 全清 +100' : ''}${_link.reshuffles ? ' · 洗了 ' + _link.reshuffles + ' 轮牌' : ''}${_gLast.link && _gLast.link.beaten ? ' · 挑战告捷' : ''}`;
  }
}

/* ================= 滑块拼图 =================
   4×4 滑块（15 数 + 1 空），点空格旁的滑块移动（方向键也行），全归位即拼完：
   得分 = max(100, 600 - 步数×4)，步数越少分越高。开局由已解状态随机走 140 步洗出＝必然可解。
   图源两档（与连连看皮肤同族口径：自己的图 > 库里的图）＝
   ①「传我的图」存进来的 `data.games.puzzleImgs`（≤8 张，抽中哪张拼哪张，传完当场就换上这张）；
   ②没有自己的图才抽表情包库（stickerRecent/stickerGroups 全池随机），「换一张图」重抽；
   ③两处都空＝不开局：面板里那行「还没有可拼的图」直接说缺什么，并且这一面本来就留着「用自己的图」那枚钮
     （旧写法在这里回落小鸟邮差的明信片，而明信片与「在路上」2026-10-12 一起退役了＝没有别的图可兜，
      硬开只能给一块空白棋盘。刻意不把「开始游戏」置灰＝那枚上传钮住在面板里，置灰会断掉唯一的出路）。
   「撤掉我的图」把这池清空（两段式确认，源图本身在表情包库/相册里不动）＝抽图回到 ②③，不留一条回不去的路。
   三模式同源口径：solo / coop 严格轮流（你一格 TA 一格，TA 走曼哈顿距离下降最大的一手、12% 随手；
   分数合账 scores[cid].puzzle.coop{best,plays,done}）/ vs（挑战分＋TA 实时对局）。 */
const PUZZLE_N = 4, PUZZLE_PAD = 8, PUZZLE_GAP = 4;   // 与 games.css .puzzle-grid/.puzzle-bg 的内距与格间距一致
const _puzzle = { cells: null, empty: PUZZLE_N * PUZZLE_N - 1, moves: 0, over: false, solved: false, src: '', _els: {}, mode: 'solo', turn: 'me', taTimer: 0 };
function _gPzMode() {
  const m = data.games && data.games.puzzleMode;
  return ['solo', 'coop', 'vs'].includes(m) ? m : 'solo';
}
function _gPzCoopScore(cid) {
  const sc = _gScore(cid, 'puzzle');
  if (!sc.coop || typeof sc.coop !== 'object' || Array.isArray(sc.coop)) sc.coop = { best: 0, plays: 0, done: false };
  const co = sc.coop;
  if (typeof co.best !== 'number' || !isFinite(co.best) || co.best < 0) co.best = 0;
  if (typeof co.plays !== 'number' || !isFinite(co.plays) || co.plays < 0) co.plays = 0;
  if (co.done !== true) co.done = false;
  return co;
}
const PUZZLE_OWN_MAX = 8;   // 自己传的图最多存 8 张（拼一张只需一张；db.js 的清洗段有同一个数，两处一起改）
/* 我自己传进拼图的图：脏项就地丢掉（非字符串／空串／超 400KB 的不进池），上限 PUZZLE_OWN_MAX 张、新的在前 */
function _puzzleOwn() {
  const g = data.games;
  if (!g) return [];
  if (!Array.isArray(g.puzzleImgs)) { g.puzzleImgs = []; return g.puzzleImgs; }
  const clean = g.puzzleImgs.filter(u => typeof u === 'string' && u && u.length < 400000);
  if (clean.length !== g.puzzleImgs.length) g.puzzleImgs = clean;
  return g.puzzleImgs;
}
function _puzzleOwnAdd(durl) {
  const arr = _puzzleOwn();
  const i = arr.indexOf(durl);
  if (i >= 0) arr.splice(i, 1);   // 同一张图重传不占两格
  arr.unshift(durl);
  if (arr.length > PUZZLE_OWN_MAX) arr.length = PUZZLE_OWN_MAX;
  return arr;
}
/* 换图不换局：瓷砖的 backgroundImage 在建节点时写死，改源要逐枚重写，否则屏上还是旧图 */
function _puzzleSetSrc(src) {
  _puzzle.src = src;
  Object.keys(_puzzle._els).forEach(k => { _puzzle._els[k].style.backgroundImage = `url("${src}")`; });
}
let _puzzleOwnArmed = 0;   // 两段式确认的计时器（本机状态，不进存档）
function _puzzleOwnView() {
  const n = _puzzleOwn().length;
  const cl = $('#puzzleOwnClear');
  if (!cl) return;
  cl.hidden = n === 0;   // 池空时这枚不出现＝不留一枚点了没反应的钮
  if (n) cl.textContent = _puzzleOwnArmed ? '确认撤掉？' : `撤掉我的图 ${n}`;
}
function _puzzleOwnTap() {
  const b = $('#puzzleOwnClear');
  if (!b) return;
  if (!_puzzleOwnArmed) {   // 两段式：先问一句，2.5 秒不点就收回（删的是用户传进来的东西）
    _puzzleOwnArmed = setTimeout(() => { _puzzleOwnArmed = 0; _puzzleOwnView(); }, 2500);
    b.textContent = '确认撤掉？';
    return;
  }
  clearTimeout(_puzzleOwnArmed); _puzzleOwnArmed = 0;
  data.games.puzzleImgs = [];
  save();
  if (_puzzle.cells) _puzzleSetSrc(_puzzlePickImg());   // 手上这一局继续拼，只是换回库里的图
  _puzzleOwnView();
  showToast('撤掉了，换回库里的图');
}
function _puzzleImgPool() {
  const pool = [];
  (data.stickerRecent || []).forEach(u => { if (typeof u === 'string' && u) pool.push(u); });
  (data.stickerGroups || []).forEach(g => { if (g && Array.isArray(g.imgs)) g.imgs.forEach(u => { if (typeof u === 'string' && u) pool.push(u); }); });
  return pool;
}
function _puzzlePickImg() {
  const own = _puzzleOwn();
  if (own.length) return own[Math.floor(Math.random() * own.length)];   // 有自己的图就先拼自己的
  const pool = _puzzleImgPool();
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : '';   // 一张都没有＝交空串，由开局那一道闸拦下
}
function gPuzzleBoot(force) {
  if (_puzzle.cells && !force) { _gPzApplyMode(); _puzzleRender(); return; }
  gPuzzleRestart();
}
function gPuzzleRestart(newImg) {
  if (!_puzzle.src || newImg === true) {
    const src = _puzzlePickImg();   // 「换一张图」才重抽；普通重开沿用这张
    if (!src) {
      // 一张可拼的图都没有＝不洗棋盘、不建瓷砖。那一句写在棋盘下面那一行里（「用自己的图」那排就在它下面，指得着），
      // 不留一块点下去什么都不长的棋盘——旧写法在这里拿小鸟邮差的明信片兜底，那个宿主已随「在路上」退役
      const ov = $('#puzzleOver');
      if (ov) ov.textContent = '还没有可拼的图 · 点下面「用自己的图」传一张，或先往表情包库里存几张';
      showToast('还没有可拼的图');
      return;
    }
    _puzzle.src = src;
  }
  _puzzle.cells = [];
  for (let i = 0; i < PUZZLE_N * PUZZLE_N - 1; i++) _puzzle.cells.push(i);
  _puzzle.cells.push(-1);   // 末格空
  _puzzle.empty = PUZZLE_N * PUZZLE_N - 1;
  let last = -1;
  for (let k = 0; k < 140; k++) {   // 从已解状态随机走＝必然可解
    const er = Math.floor(_puzzle.empty / PUZZLE_N), ec = _puzzle.empty % PUZZLE_N;
    const opts = [];
    if (er > 0) opts.push(_puzzle.empty - PUZZLE_N);
    if (er < PUZZLE_N - 1) opts.push(_puzzle.empty + PUZZLE_N);
    if (ec > 0) opts.push(_puzzle.empty - 1);
    if (ec < PUZZLE_N - 1) opts.push(_puzzle.empty + 1);
    const pick = opts.filter(x => x !== last);
    const idx = pick[Math.floor(Math.random() * pick.length)];
    _puzzle.cells[_puzzle.empty] = _puzzle.cells[idx];
    _puzzle.cells[idx] = -1;
    last = _puzzle.empty;
    _puzzle.empty = idx;
  }
  _puzzle.moves = 0;
  _puzzle.over = false;
  _puzzle.solved = false;
  _puzzle.turn = 'me';
  if (_puzzle.taTimer) { clearTimeout(_puzzle.taTimer); _puzzle.taTimer = 0; }
  delete _gLast.puzzle;
  delete _gLive.puzzle;
  const ov = $('#puzzleOver');
  if (ov) ov.textContent = '';
  _puzzleRender(true);
  _pzScoreView(false);
  gPuzzleRefreshStat();
  _gPzApplyMode();
}
function _pzGeom() {   // 内距随全屏档现算（见 _gEffPG）
  const box = $('#puzzleGrid');
  if (!box) return null;
  const W = box.clientWidth || 320, H = box.clientHeight || W;
  const pg = _gEffPG(PUZZLE_PAD, PUZZLE_GAP), PAD = pg[0], GAP = pg[1];
  const cw = (W - PAD * 2 - GAP * (PUZZLE_N - 1)) / PUZZLE_N;
  const ch = (H - PAD * 2 - GAP * (PUZZLE_N - 1)) / PUZZLE_N;
  return { box, pad: PAD, gap: GAP, cw, ch, sx: cw + GAP, sy: ch + GAP };
}
function _puzzleRender(rebuild) {
  const g = _pzGeom();
  if (!g) return;
  _puzzleOwnView();   // 「撤掉我的图 N」随池子现写（这一面唯一一处刷新它的地方）
  if (!_puzzle.cells) return;   // 没有图就没开局（cells 仍为 null）：这一屏交给准备画面那句实话，不在这里画半块棋盘
  _gSetCellVars(g.box, g.pad, g.gap, g.cw, g.ch);
  let bg = g.box.querySelector('.puzzle-bg');
  if (!bg) {
    bg = document.createElement('div');
    bg.className = 'puzzle-bg';
    bg.innerHTML = '<i></i>'.repeat(PUZZLE_N * PUZZLE_N);
    g.box.appendChild(bg);
  }
  if (rebuild) {
    Object.keys(_puzzle._els).forEach(k => { _puzzle._els[k].remove(); delete _puzzle._els[k]; });
  }
  for (let i = 0; i < PUZZLE_N * PUZZLE_N; i++) {
    const t = _puzzle.cells[i];
    if (t < 0) continue;
    let el = _puzzle._els[t];
    if (!el) {
      el = document.createElement('div');
      el.className = 'puzzle-tile';
      el.dataset.zidx = i;
      el.style.backgroundImage = `url("${_puzzle.src}")`;
      const hr = Math.floor(t / PUZZLE_N), hc = t % PUZZLE_N;
      el.style.backgroundSize = (PUZZLE_N * 100) + '% ' + (PUZZLE_N * 100) + '%';
      el.style.backgroundPosition = (hc / (PUZZLE_N - 1) * 100).toFixed(2) + '% ' + (hr / (PUZZLE_N - 1) * 100).toFixed(2) + '%';
      _puzzle._els[t] = el;
      g.box.appendChild(el);
      el.classList.add('in');
      setTimeout(() => el.classList.remove('in'), 500);
    }
    el.dataset.zidx = i;
    el.style.transform = `translate(${Math.round((i % PUZZLE_N) * g.sx)}px,${Math.round(Math.floor(i / PUZZLE_N) * g.sy)}px)`;
  }
}
function _pzSlideLegal(idx) {
  if (idx < 0 || idx >= PUZZLE_N * PUZZLE_N || _puzzle.cells[idx] < 0) return false;
  const er = Math.floor(_puzzle.empty / PUZZLE_N), ec = _puzzle.empty % PUZZLE_N;
  const tr = Math.floor(idx / PUZZLE_N), tc = idx % PUZZLE_N;
  return (er === tr && Math.abs(ec - tc) === 1) || (ec === tc && Math.abs(er - tr) === 1);
}
function puzzleTap(idx) {
  if (_puzzle.over || !_puzzle.cells) return;
  if (_gPzMode() === 'coop' && _puzzle.turn === 'ta') return;   // 轮到 TA：你这一下不算数
  puzzleSlide(idx);
}
function puzzleSlide(idx, byTa) {
  if (_puzzle.over || !_pzSlideLegal(idx)) return;
  const t = _puzzle.cells[idx];
  _puzzle.cells[_puzzle.empty] = t;
  _puzzle.cells[idx] = -1;
  _puzzle.empty = idx;
  _puzzle.moves++;
  if (_gPzMode() === 'vs') _gTaLiveStart('puzzle');   // 对战：你滑第一格 TA 才开始实时拼
  _pzScoreView(true);
  const solved = _puzzle.cells.every((v, i) => v === i || (v === -1 && i === PUZZLE_N * PUZZLE_N - 1));
  const el = _puzzle._els[t];
  if (el) el.classList.add('bump');
  _puzzleRender();
  if (solved) { setTimeout(_gPzFinish, 420); return; }
  if (_gPzMode() === 'coop' && !byTa) _pzTaSchedule();
}
function _pzTaSchedule() {
  if (_puzzle.taTimer) clearTimeout(_puzzle.taTimer);
  _puzzle.turn = 'ta';
  _gPzCoopRender();
  _puzzle.taTimer = setTimeout(_pzTaMove, 760 + Math.random() * 1000);
}
function _pzManhattan(cells) {
  let md = 0;
  for (let i = 0; i < cells.length; i++) {
    const t = cells[i];
    if (t < 0) continue;
    md += Math.abs(Math.floor(i / PUZZLE_N) - Math.floor(t / PUZZLE_N)) + Math.abs((i % PUZZLE_N) - (t % PUZZLE_N));
  }
  return md;
}
function _pzTaPick() {   // 合作里 TA 的那格：曼哈顿距离下降最多的一手（12% 随手一滑）
  const er = Math.floor(_puzzle.empty / PUZZLE_N), ec = _puzzle.empty % PUZZLE_N;
  const opts = [];
  if (er > 0) opts.push(_puzzle.empty - PUZZLE_N);
  if (er < PUZZLE_N - 1) opts.push(_puzzle.empty + PUZZLE_N);
  if (ec > 0) opts.push(_puzzle.empty - 1);
  if (ec < PUZZLE_N - 1) opts.push(_puzzle.empty + 1);
  if (!opts.length) return -1;
  if (Math.random() < 0.12) return opts[Math.floor(Math.random() * opts.length)];
  const md0 = _pzManhattan(_puzzle.cells);
  const scored = opts.map(idx => {
    const cells = _puzzle.cells.slice();
    cells[_puzzle.empty] = cells[idx];
    cells[idx] = -1;
    return { idx, v: md0 - _pzManhattan(cells) + Math.random() * 0.6 };
  });
  scored.sort((a, b) => b.v - a.v);
  return scored[0].idx;
}
function _pzTaMove() {
  _puzzle.taTimer = 0;
  _puzzle.turn = 'me';
  // 不在这一页就不滑：TA 不隔着页面动你的拼图
  if (_gPzMode() !== 'coop' || _puzzle.over || data.games.tab !== 'puzzle' || document.body.dataset.view !== 'games') return;
  const idx = _pzTaPick();
  if (idx < 0) { _gPzFinish(); return; }
  puzzleSlide(idx, true);
  if (!_puzzle.over) _gPzCoopRender();
}
function _pzScoreView(bump) {
  const wrap = $('#puzzleScoreWrap');
  const coop = _gPzMode() === 'coop';
  if (wrap) {
    wrap.innerHTML = (coop ? '我们 <b id="puzzleMoves">' : '步数 <b id="puzzleMoves">')
      + _puzzle.moves + '</b> · ' + (coop ? '一格换一格' : '点空格旁的滑块');
  }
  const el = $('#puzzleMoves');
  if (el && bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}
function gPuzzleRefreshStat() {
  const el = $('#puzzleStat');
  if (!el) return;
  const cid = data.games.with;
  if (_gPzMode() === 'coop') {
    const co = _gPzCoopScore(cid);
    el.textContent = `合作最高 ${co.best} 分 · ${co.plays} 张${co.done ? ' · 一起拼完过' : ''}`;
    _gPzCoopRender();
    return;
  }
  const sc = _gBook('puzzle');
  el.textContent = `最高 ${sc.best} · ${sc.plays} 张${_gPzMode() === 'vs' && sc.ta > 0 ? ` · 挑战 ${sc.ta}` : ''}`;
}
function _gPzApplyMode() {
  const mode = _gPzMode();
  _puzzle.mode = mode;
  _puzzle.turn = 'me';
  _gModeChrome('puzzle');   // 那一行只属对战（BUGS #302）：自己玩不出现、合作由 coopLine 那条说
  const cl = $('#coopLinePuzzle'); if (cl) cl.hidden = mode !== 'coop';
  $$('#puzzleModes .merge-scheme').forEach(b => b.classList.toggle('on', b.dataset.zmode === mode));
  _pzScoreView(false);
  if (mode === 'coop') _gPzCoopRender(); else _gamesRenderTaLine('puzzle');
  gPuzzleRefreshStat();
}
function _gPzSetMode(m) {
  if (!['solo', 'coop', 'vs'].includes(m) || _gPzMode() === m) return;
  data.games.puzzleMode = m;
  save();
  gPuzzleRestart();
  showToast(m === 'coop' ? '和 ' + _gName(data.games.with) + ' 一起拼：你一格，TA 一格' : (m === 'solo' ? '自己玩，慢慢拼' : '比分对战，可别输给 TA'));
}
function _gPzCoopRender() {
  const box = $('#coopLinePuzzle');
  if (!box) return;
  const c = _gContact(data.games.with) || {};
  const nm = _gName(data.games.with);
  let say;
  if (_puzzle.over) say = '这张拼完了 · 换一张或换个玩法';
  else if (_puzzle.turn === 'ta') say = nm + ' 正在想滑哪格…';
  else say = '你滑一格，TA 滑一格';
  box.innerHTML = `<span class="avatar">${avatarHTML(c.avatar)}</span>`
    + `<div class="ta-tt"><b>和 ${escapeHTML(nm)} 一起</b><span>${escapeHTML(say)}</span></div>`
    + `<div class="ta-score${_puzzle.over ? '' : ' live'}"><b>${_puzzle.moves}</b><span>步数</span></div>`;
}
function _gPzCoopEnd(score) {
  const co = _gPzCoopScore(data.games.with);
  co.plays++;
  if (score > co.best) co.best = score;
  if (score > 0) co.done = true;
  _gLast.puzzle = { score, coop: true, solved: true };
  save();
  gPuzzleRefreshStat();
  _gEndReport('puzzle', score, { coop: true, moves: _puzzle.moves, ach: G_COOP_ACH.puzzle });
}
function _gPzCoopShare() {
  const co = _gPzCoopScore(data.games.with);
  const score = _gLast.puzzle && _gLast.puzzle.coop ? _gLast.puzzle.score : co.best;
  if (!score) { showToast('先一起拼完一张再告诉 TA'); return; }
  const cid = data.games.with;
  _deliverToChat({
    id: nextId(), from: 'me', text: '这张是我们俩拼完的，' + score + ' 分',
    game: { kind: 'score', game: 'puzzle', score, best: co.best, ta: 0, beaten: false, newBest: score >= co.best && score > 0 }
  }, cid);
  setTimeout(() => {
    if (!data.games || !data.contacts) return;
    _deliverToChat({ id: nextId(), from: 'partner', text: _gPick(G_COOP_PUZZLE_DONE, Math.random()) }, cid);
  }, 1400 + Math.random() * 2600);
  showToast('已发给 ' + _gName(cid));
}
function _gPzFinish() {
  if (_puzzle.over) return;
  _puzzle.over = true;
  _puzzle.solved = true;
  if (_puzzle.taTimer) { clearTimeout(_puzzle.taTimer); _puzzle.taTimer = 0; }
  _puzzle.turn = 'me';
  const score = Math.max(100, 600 - _puzzle.moves * 4);
  _puzzle.score = score;
  const mode = _gPzMode();
  if (_puzzle._els) {   // 通关庆祝：全盘沿对角线波浪式回弹一轮
    let w = 0;
    Object.values(_puzzle._els).forEach(el => { el.classList.add('in'); el.style.animationDelay = (w++ % 4 + Math.floor(w / 4)) * 24 + 'ms'; });
    setTimeout(() => Object.values(_puzzle._els).forEach(el => { el.classList.remove('in'); el.style.animationDelay = ''; }), 1500);
  }
  playSfx('clear');   // 拼图只有「整张拼完」这一个结果声（它没有失败局终这条路），故这一发就是它的收尾，下面那记局终声就此收掉
  if (mode === 'coop') {
    const co = _gPzCoopScore(data.games.with);
    if (!co.done) { co.done = true; save(); }   // FIX #050 成就只记，那句话并进局终那条
    _gPzCoopEnd(score);
  } else {
    _gGameEnd('puzzle', score, { noTa: mode === 'solo', quiet: true, moves: _puzzle.moves });
  }
  const ov = $('#puzzleOver');
  if (ov) ov.textContent = `拼完了 · ${_puzzle.moves} 步 · ${score} 分${_gLast.puzzle && _gLast.puzzle.beaten ? ' · 挑战告捷' : ''}`;
  showToast('拼完了！' + score + ' 分');
}

/* ================= 俄罗斯方块 =================
   10×20 经典七块，Canvas 渲染（与合成同族 rAF 自停循环）：←→移 ↓软降 ↑/旋转键转 空格硬降
   （手机用下方按键行）。消行计分 100/300/500/800，每 10 行提速一级；顶部堵死＝局终。
   三模式同源口径：solo / coop 严格轮流（你放一块 TA 放一块，TA 挑洞最少的一手落、12% 随手；
   分数合账 scores[cid].tetris.coop{best,plays,tetris4}，合作四行消＝双人成就卡）/ vs（挑战分＋实时对局）。 */
const TET_W = 10, TET_H = 20, TET_CELL = 15, TET_PAD = 6;   // 与 games.css #tetCv 的内距与格尺寸一致
const G_TET_PIECES = [
  { k: 0, cells: [[1, 0], [1, 1], [1, 2], [1, 3]] },   // I
  { k: 1, cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },   // O
  { k: 2, cells: [[0, 1], [1, 0], [1, 1], [1, 2]] },   // T
  { k: 3, cells: [[0, 1], [1, 0], [1, 1], [2, 0]] },   // S
  { k: 4, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },   // Z
  { k: 5, cells: [[0, 0], [1, 0], [1, 1], [1, 2]] },   // J
  { k: 6, cells: [[0, 2], [1, 0], [1, 1], [1, 2]] }    // L
];
const G_TET_COLORS = ['#6fc7e0', '#f2c94f', '#b6a0e8', '#96cf8e', '#ec8a80', '#8ab8e6', '#f4b06a'];
const G_TET_CLEAR_PT = [0, 100, 300, 500, 800];
const _tet = { g: null, cur: null, next: 0, score: 0, lines: 0, over: false, dropAt: 0, raf: 0, flash: null, shake: null, fx: [], mode: 'solo', turn: 'me', taTimer: 0, _bag: [], gotTetris4: false };
function _gTetMode() {
  const m = data.games && data.games.tetrisMode;
  return ['solo', 'coop', 'vs'].includes(m) ? m : 'solo';
}
function _gTetCoopScore(cid) {
  const sc = _gScore(cid, 'tetris');
  if (!sc.coop || typeof sc.coop !== 'object' || Array.isArray(sc.coop)) sc.coop = { best: 0, plays: 0, tetris4: false };
  const co = sc.coop;
  if (typeof co.best !== 'number' || !isFinite(co.best) || co.best < 0) co.best = 0;
  if (typeof co.plays !== 'number' || !isFinite(co.plays) || co.plays < 0) co.plays = 0;
  if (co.tetris4 !== true) co.tetris4 = false;
  return co;
}
function _tetBagNext() {   // 七袋随机：每轮把七种洗匀抽光再补，出手比纯随机舒服
  if (!_tet._bag.length) {
    _tet._bag = [0, 1, 2, 3, 4, 5, 6];
    for (let i = _tet._bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = _tet._bag[i]; _tet._bag[i] = _tet._bag[j]; _tet._bag[j] = t; }
  }
  return _tet._bag.pop();
}
function _tetSpawn(k) {
  const p = G_TET_PIECES[k];
  const mxw = Math.max.apply(null, p.cells.map(c => c[1]));
  const cur = { k: p.k, cells: p.cells.map(c => c.slice()), r: 0, c: Math.floor((TET_W - mxw - 1) / 2) };
  if (_tetHit(cur, 0, 0)) { _gTetFinish(); return null; }
  return cur;
}
function _tetHit(cur, dr, dc, cells) {
  const cs = cells || cur.cells;
  for (const [pr, pc] of cs) {
    const r = cur.r + pr + dr, c = cur.c + pc + dc;
    if (c < 0 || c >= TET_W || r >= TET_H) return true;
    if (r >= 0 && _tet.g[r][c] >= 0) return true;
  }
  return false;
}
function _tetRotate(cur) {   // 简易踢墙：原位 → 左一格 → 右一格
  const rot = cur.cells.map(([r, c]) => [c, cur.cells.reduce((m, x) => Math.max(m, x[0]), 0) - r]);
  for (const dc of [0, -1, 1, -2, 2]) {
    if (!_tetHit(cur, 0, dc, rot)) { cur.cells = rot; cur.c += dc; return true; }
  }
  return false;
}
function _tetGhostDrop(cur) {   // 从当前位置一路落到底
  let d = 0;
  while (!_tetHit(cur, d + 1, 0)) d++;
  return d;
}
/* 方块这一款只有它自己能变大：格尺寸 15px 是钉在常量里的，物理与判线全按格算（改一格＝改手感）。
   故放大走「整张画布按一个倍率缩放」——绘图代码继续在 15px 那套虚拟格里写，只在 transform 上乘 _tet.z，
   后备存储与 CSS 尺寸一起乘，屏幕上的块就跟着变清晰（不缩放会糊＝位图拉伸）。
   倍率两端夹住：竖屏与宽屏宽是天花板，z 不小于 1＝不比今天这一版小（窄屏不必比现在小）；
   横屏高不够 316 时放行到 0.6——那一档高是天花板，死守 z≥1 就是 canvas 撑破 flex 盒：
   屏底读数与按键行被顶出屏外、盘面被 .view 裁掉一截（横屏「玩不了」量的就是这段）。
   0.6 是地板：再小一格不到 10px，手指点的命中区与「这是块什么」一起失真。 */
function gTetSize() {
  const cv = $('#tetCv');
  if (!cv || !cv.parentElement) return;
  const box = _gBoardBox(cv.parentElement);
  if (box.w < 40) return;
  const side = $('.tet-wrap .tet-side');
  const rail = (side ? side.getBoundingClientRect().width : 0) + 10;   // 右侧那一列（NEXT 与行数）＋那条 flex gap
  const W = TET_PAD * 2 + TET_W * TET_CELL, H = TET_PAD * 2 + TET_H * TET_CELL;
  let z = Math.min(_gBoxInner(cv, box.w - rail) / W, (box.h > 0 ? box.h : H) / H);
  z = Math.max((box.h > 0 && box.h < H) ? 0.6 : 1, Math.min(2, z));
  const dpr = window.devicePixelRatio || 1;
  _tet.z = z;
  cv.style.width = Math.round(W * z) + 'px'; cv.style.height = Math.round(H * z) + 'px';
  cv.width = Math.round(W * z * dpr); cv.height = Math.round(H * z * dpr);
  cv.getContext('2d').setTransform(dpr * z, 0, 0, dpr * z, 0, 0);
}
function gTetBoot(force) {
  const cv = $('#tetCv');
  if (!cv) return;
  const dpr = window.devicePixelRatio || 1;
  gTetSize();
  const nc = $('#tetNextCv');
  if (nc) { nc.width = 64 * dpr; nc.height = 64 * dpr; }   // 预览小图同样按 dpr 扩后备存储，否则画被裁
  if (!_tet.g || force) gTetRestart();
  else { gTetRefreshStat(); _gTetApplyMode(); }
}
function gTetRestart() {
  _tet.g = [];
  for (let r = 0; r < TET_H; r++) _tet.g.push(new Array(TET_W).fill(-1));
  _tet.score = 0; _tet.lines = 0; _tet.over = false; _tet.flash = null; _tet.dropAt = Date.now();
  _tet.gotTetris4 = false;   // FIX #050
  _tet.turn = 'me';
  _tet._bag = [];
  if (_tet.taTimer) { clearTimeout(_tet.taTimer); _tet.taTimer = 0; }
  _tet.next = _tetBagNext();
  _tet.cur = _tetSpawn(_tetBagNext());
  delete _gLast.tetris;
  delete _gLive.tetris;
  const ov = $('#tetOver');
  if (ov) ov.textContent = '';
  _tetHud();
  gTetRefreshStat();
  _gTetApplyMode();
}
function gTetLoopKick() {
  if (_tet.raf) return;
  const step = ts => {
    _tet.raf = 0;
    const active = document.body.dataset.view === 'games' && data.games && data.games.tab === 'tetris' && !$('#gameTetris').hidden;
    if (!active) return;
    if (!_tet.over && _tet.cur && !_tet.flash) {
      const level = Math.floor(_tet.lines / 10);
      const interval = Math.max(130, 820 - level * 68);
      if (Date.now() - _tet.dropAt >= interval) {
        _tet.dropAt = Date.now();
        if (!_tetHit(_tet.cur, 1, 0)) _tet.cur.r++;
        else _tetLock();
      }
    }
    gTetDraw();
    _tet.raf = requestAnimationFrame(step);
  };
  _tet.raf = requestAnimationFrame(step);
}
function tetAct(act) {
  if (_tet.over || !_tet.cur || _tet.flash) return;
  if (_gTetMode() === 'coop' && _tet.turn === 'ta') return;   // 轮到 TA：你这一下不算数
  if (act === 'left' && !_tetHit(_tet.cur, 0, -1)) { _tet.cur.c--; gTetDraw(); }
  else if (act === 'right' && !_tetHit(_tet.cur, 0, 1)) { _tet.cur.c++; gTetDraw(); }
  else if (act === 'rot') { _tetRotate(_tet.cur); gTetDraw(); }
  else if (act === 'down') {
    if (!_tetHit(_tet.cur, 1, 0)) { _tet.cur.r++; _tet.score += 1; _tet.dropAt = Date.now(); _tetHud(); gTetDraw(); gTetRefreshStat(); }
    else _tetLock();
  } else if (act === 'drop') {
    const d = _tetGhostDrop(_tet.cur);
    if (d > 0) _tet.score += d * 2;
    _tet.cur.r += d;
    _tetLock();
  }
}
function _tetClearSfx(n, byTa) {   // 消行才响（落子·旋转·左右移·硬降都不出声，同「只报结果」口径）；四行齐消单独一记
  playSfx(n >= 4 ? 'mile' : 'blend', { step: _gSfxStep(n * 2), weak: !!byTa });
}
function _tetLock() {
  const cur = _tet.cur;
  for (const [pr, pc] of cur.cells) {
    const r = cur.r + pr, c = cur.c + pc;
    if (r >= 0) _tet.g[r][c] = cur.k;
  }
  if (_gTetMode() === 'vs') _gTaLiveStart('tetris');   // 对战：你落第一块 TA 才开始实时玩
  const rows = [];
  for (let r = 0; r < TET_H; r++) if (_tet.g[r].every(v => v >= 0)) rows.push(r);
  _tet.cur = null;
  _tet.shake = { at: Date.now(), a: rows.length ? 6 : 3 };   // 消行震得更狠
  if (rows.length) {
    _tet.score += G_TET_CLEAR_PT[rows.length];
    _tet.lines += rows.length;
    _tet.flash = { rows, at: Date.now() };
    _tetClearSfx(rows.length);
    for (const r of rows) for (let c = 0; c < TET_W; c += 2) {   // 被消的块化作同色彩粒飞散
      const col = G_TET_COLORS[_tet.g[r][c]] || '#fff';
      _tet.fx.push({ x: TET_PAD + c * TET_CELL + TET_CELL / 2, y: TET_PAD + r * TET_CELL + TET_CELL / 2, vx: (Math.random() - 0.5) * 3.4, vy: -1.6 - Math.random() * 2, s: 2 + Math.random() * 2.5, c: col, t: 0, life: 460 + Math.random() * 240 });
    }
    if (rows.length === 4) showToast('四行齐消！');
    setTimeout(() => {
      rows.sort((a, b) => a - b).forEach(r => { _tet.g.splice(r, 1); _tet.g.unshift(new Array(TET_W).fill(-1)); });
      _tet.flash = null;
      _tetAfterLock(rows.length);
    }, 160);
  } else {
    _tetAfterLock(0);
  }
  _tetHud();
}
function _tetHud() {   // 局内分数与行数屏显
  const el = $('#tetScore');
  if (el) el.textContent = _tet.score;
  const ln = $('#tetLines');
  if (ln) ln.textContent = _tet.lines + ' 行';
}
function _tetAfterLock(cleared) {
  _tetHud();
  if (_gTetMode() === 'coop' && cleared === 4) {   // 合作四行消＝双人成就
    const co = _gTetCoopScore(data.games.with);
    if (!co.tetris4) {
      co.tetris4 = true;
      save();   // FIX #050 四行消是局中事件：只记成就，那句话并进局终那条
    }
    _tet.gotTetris4 = true;   // 本局消过四行（随 restart 清）
  }
  gTetRefreshStat();
  if (_tet.over) return;
  _tet.cur = _tetSpawn(_tetBagNext());
  _tet.dropAt = Date.now();
  if (_tet.over) return;
  if (_gTetMode() === 'coop') {
    if (_tet.turn !== 'ta') _tetTaSchedule();
    else _tet.turn = 'me';
  }
}
function _tetTaSchedule() {
  if (_tet.taTimer) clearTimeout(_tet.taTimer);
  _tet.turn = 'ta';
  _gTetCoopRender();
  _tet.taTimer = setTimeout(_tetTaMove, 760 + Math.random() * 1000);
}
function _tetSimPlace(g, cur, rot, dc) {   // 在副本上把某手落到底，返回 {g2, cleared, holes, aggH, bump}
  const cells = rot === 0 ? cur.cells : (() => {
    let cs = cur.cells;
    for (let i = 0; i < rot; i++) cs = cs.map(([r, c]) => [c, Math.max.apply(null, cs.map(x => x[0])) - r]);
    return cs;
  })();
  let c0 = cur.c + dc;
  const probe = { r: cur.r, c: c0, cells };
  if (_tetHitOn(g, probe, 0, 0)) return null;
  for (const [pr, pc] of cells) { if (c0 + pc < 0 || c0 + pc >= TET_W) return null; }
  let d = 0;
  while (!_tetHitOn(g, probe, d + 1, 0)) d++;
  const g2 = g.map(row => row.slice());
  for (const [pr, pc] of cells) g2[probe.r + d + pr][c0 + pc] = cur.k;
  let cleared = 0;
  for (let r = TET_H - 1; r >= 0; r--) {
    if (g2[r].every(v => v >= 0)) { g2.splice(r, 1); g2.unshift(new Array(TET_W).fill(-1)); cleared++; r++; }
  }
  let holes = 0, aggH = 0, bump = 0;
  const heights = [];
  for (let c = 0; c < TET_W; c++) {
    let h = 0, seen = false;
    for (let r = 0; r < TET_H; r++) {
      if (g2[r][c] >= 0) { if (!seen) { h = TET_H - r; seen = true; } }
      else if (seen) holes++;
    }
    heights.push(h);
    aggH += h;
  }
  for (let c = 0; c < TET_W - 1; c++) bump += Math.abs(heights[c] - heights[c + 1]);
  return { g2, cleared, holes, aggH, bump };
}
function _tetHitOn(g, probe, dr, dc) {
  for (const [pr, pc] of probe.cells) {
    const r = probe.r + pr + dr, c = probe.c + pc + dc;
    if (c < 0 || c >= TET_W || r >= TET_H) return true;
    if (r >= 0 && g[r][c] >= 0) return true;
  }
  return false;
}
function _tetTaPick() {   // 合作里 TA 的那块：四组经典权重挑洞最少的一手（12% 随手一放）
  if (!_tet.cur) return null;
  const scored = [];
  for (const rot of [0, 1, 2, 3]) {
    for (let dc = -TET_W; dc <= TET_W; dc++) {
      const s = _tetSimPlace(_tet.g, _tet.cur, rot, dc);
      if (!s) continue;
      scored.push({ s, v: s.cleared * 76 - s.holes * 36 - s.aggH * 5.1 - s.bump * 1.8 + Math.random() * 2 });
    }
  }
  if (!scored.length) return null;
  if (Math.random() < 0.12) return scored[Math.floor(Math.random() * scored.length)].s;
  scored.sort((a, b) => b.v - a.v);
  return scored[0].s;
}
function _tetTaMove() {
  _tet.taTimer = 0;
  _tet.turn = 'me';
  // 不在这一页就不放：TA 不隔着页面动你的棋盘
  if (_gTetMode() !== 'coop' || _tet.over || data.games.tab !== 'tetris' || document.body.dataset.view !== 'games') return;
  const s = _tetTaPick();
  if (!s) { _gTetFinish(); return; }
  _tet.g = s.g2;
  _tet.shake = { at: Date.now(), a: s.cleared ? 6 : 3 };   // TA 落块同样震屏
  _tet.score += G_TET_CLEAR_PT[s.cleared];
  _tet.lines += s.cleared;
  const cur = _tet.cur;
  _tet.cur = null;
  const rows = [];
  for (let r = 0; r < TET_H; r++) if (_tet.g[r].every(v => v >= 0)) rows.push(r);
  if (rows.length) {
    _tet.flash = { rows, at: Date.now() };
    _tetClearSfx(rows.length, true);   // TA 那一手消的行也响，轻一档
    setTimeout(() => {
      rows.sort((a, b) => a - b).forEach(r => { _tet.g.splice(r, 1); _tet.g.unshift(new Array(TET_W).fill(-1)); });
      _tet.flash = null;
      _tetAfterLockTa();
    }, 160);
  } else _tetAfterLockTa();
}
function _tetAfterLockTa() {
  _tetHud();
  if (_tet.over) return;
  _tet.cur = _tetSpawn(_tetBagNext());
  _tet.dropAt = Date.now();
  if (_tet.over) return;
  _gTetCoopRender();
  gTetLoopKick();
}
function gTetRefreshStat() {
  const el = $('#tetStat');
  if (!el) return;
  const cid = data.games.with;
  if (_gTetMode() === 'coop') {
    const co = _gTetCoopScore(cid);
    el.textContent = `合作最高 ${co.best} 分 · ${co.plays} 局${co.tetris4 ? ' · 一起消过四行' : ''}`;
    _gTetCoopRender();
    return;
  }
  const sc = _gBook('tetris');
  el.textContent = `最高 ${sc.best} · ${sc.plays} 局${_gTetMode() === 'vs' && sc.ta > 0 ? ` · 挑战 ${sc.ta}` : ''}`;
}
function _gTetApplyMode() {
  const mode = _gTetMode();
  _tet.mode = mode;
  _tet.turn = 'me';
  _gModeChrome('tetris');   // 那一行只属对战（BUGS #302）：自己玩不出现、合作由 coopLine 那条说
  const cl = $('#coopLineTetris'); if (cl) cl.hidden = mode !== 'coop';
  $$('#tetModes .merge-scheme').forEach(b => b.classList.toggle('on', b.dataset.tetmode === mode));
  if (mode === 'coop') _gTetCoopRender(); else _gamesRenderTaLine('tetris');
  gTetRefreshStat();
}
function _gTetSetMode(m) {
  if (!['solo', 'coop', 'vs'].includes(m) || _gTetMode() === m) return;
  data.games.tetrisMode = m;
  save();
  gTetRestart();
  showToast(m === 'coop' ? '和 ' + _gName(data.games.with) + ' 一起堆：你一块，TA 一块' : (m === 'solo' ? '自己玩，慢慢堆' : '比分对战，可别输给 TA'));
}
function _gTetCoopRender() {
  const box = $('#coopLineTetris');
  if (!box) return;
  const c = _gContact(data.games.with) || {};
  const nm = _gName(data.games.with);
  let say;
  if (_tet.over) say = '这局堆完了 · 重新开始或换个玩法';
  else if (_tet.turn === 'ta') say = nm + ' 正在挑往哪儿放…';
  else say = '你放一块，TA 放一块';
  box.innerHTML = `<span class="avatar">${avatarHTML(c.avatar)}</span>`
    + `<div class="ta-tt"><b>和 ${escapeHTML(nm)} 一起</b><span>${escapeHTML(say)}</span></div>`
    + `<div class="ta-score${_tet.over ? '' : ' live'}"><b>${_tet.score}</b><span>我们</span></div>`;
}
function _gTetCoopEnd(score) {
  const co = _gTetCoopScore(data.games.with);
  co.plays++;
  if (score > co.best) co.best = score;
  _gLast.tetris = { score, coop: true };
  save();
  playSfx('over');   // 方块的合作局终＝堆死了（与拼图那面不同：拼图没有失败这条路，只有拼完一声 clear）
  gTetRefreshStat();
  _gEndReport('tetris', score, { coop: true, lines: _tet.lines, ach: _tet.gotTetris4 ? G_COOP_ACH.tetris : null });
}
function _gTetCoopShare() {
  const co = _gTetCoopScore(data.games.with);
  const score = _tet.score || co.best;
  if (!score) { showToast('先一起堆一局再告诉 TA'); return; }
  const cid = data.games.with;
  _deliverToChat({
    id: nextId(), from: 'me', text: '这局是我们俩堆的，' + score + ' 分',
    game: { kind: 'score', game: 'tetris', score, best: co.best, ta: 0, beaten: false, newBest: score >= co.best && score > 0 }
  }, cid);
  setTimeout(() => {
    if (!data.games || !data.contacts) return;
    _deliverToChat({ id: nextId(), from: 'partner', text: _gPick(G_COOP_SHARE, Math.random()) }, cid);
  }, 1400 + Math.random() * 2600);
  showToast('已发给 ' + _gName(cid));
}
function _gTetFinish() {
  if (_tet.over) return;
  _tet.over = true;
  if (_tet.taTimer) { clearTimeout(_tet.taTimer); _tet.taTimer = 0; }
  _tet.turn = 'me';
  const mode = _gTetMode();
  if (mode === 'coop') _gTetCoopEnd(_tet.score);
  else _gGameEnd('tetris', _tet.score, mode === 'solo' ? { noTa: true, lines: _tet.lines } : { lines: _tet.lines });
  const ov = $('#tetOver');
  if (ov) {
    if (mode === 'coop') ov.textContent = `这局我们一起堆了 ${_tet.score} 分 · 消了 ${_tet.lines} 行`;
    else ov.textContent = `局终 · ${_tet.score} 分 · 消了 ${_tet.lines} 行${_gLast.tetris && _gLast.tetris.beaten ? ' · 挑战告捷' : ''}`;
  }
  gTetDraw();
}
function gTetDraw() {
  const cv = $('#tetCv');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const z = _tet.z || 1;                                  // 整张画布的放大倍率（见 gTetSize）：格仍按 15 那套虚拟格画
  ctx.setTransform(dpr * z, 0, 0, dpr * z, 0, 0);
  const W = TET_PAD * 2 + TET_W * TET_CELL, H = TET_PAD * 2 + TET_H * TET_CELL;
  ctx.clearRect(0, 0, W, H);
  if (_tet.shake) {   // 落块/消行震屏：150ms 内衰减的随机抖动
    const k = 1 - (Date.now() - _tet.shake.at) / 150;
    if (k <= 0) _tet.shake = null;
    else ctx.translate((Math.random() - 0.5) * _tet.shake.a * k, (Math.random() - 0.5) * _tet.shake.a * 0.7 * k);
  }
  ctx.fillStyle = 'rgba(26,28,34,.045)';
  ctx.fillRect(TET_PAD, TET_PAD, TET_W * TET_CELL, TET_H * TET_CELL);
  for (let r = 0; r < TET_H; r++) for (let c = 0; c < TET_W; c++) {
    if (_tet.g[r][c] >= 0) _tetCell(ctx, TET_PAD + c * TET_CELL, TET_PAD + r * TET_CELL, G_TET_COLORS[_tet.g[r][c]]);
  }
  if (_tet.flash) {
    const k = Math.min(1, (Date.now() - _tet.flash.at) / 160);
    ctx.fillStyle = `rgba(255,255,255,${(0.85 * (1 - k * 0.4)).toFixed(2)})`;
    _tet.flash.rows.forEach(r => ctx.fillRect(TET_PAD, TET_PAD + r * TET_CELL, TET_W * TET_CELL, TET_CELL));
  }
  if (_tet.cur && !_tet.over) {
    ctx.globalAlpha = 0.18;
    const d = _tetGhostDrop(_tet.cur);
    for (const [pr, pc] of _tet.cur.cells) _tetCell(ctx, TET_PAD + (_tet.cur.c + pc) * TET_CELL, TET_PAD + (_tet.cur.r + d + pr) * TET_CELL, G_TET_COLORS[_tet.cur.k], true);
    ctx.globalAlpha = 1;
    for (const [pr, pc] of _tet.cur.cells) _tetCell(ctx, TET_PAD + (_tet.cur.c + pc) * TET_CELL, TET_PAD + (_tet.cur.r + pr) * TET_CELL, G_TET_COLORS[_tet.cur.k]);
  }
  for (const p of _tet.fx) { p.t += 16; p.vy += 0.14; p.x += p.vx; p.y += p.vy; }   // 彩粒重力飞散
  _tet.fx = _tet.fx.filter(p => p.t < p.life);
  for (const p of _tet.fx) {
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
    ctx.fillStyle = p.c;
    ctx.fillRect(p.x, p.y, p.s, p.s);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(26,28,34,.28)';
  ctx.strokeRect(TET_PAD + 0.5, TET_PAD + 0.5, TET_W * TET_CELL, TET_H * TET_CELL);
  const nc = $('#tetNextCv');
  if (nc) {
    const nctx = nc.getContext('2d');
    nctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    nctx.clearRect(0, 0, nc.width, nc.height);
    const p = G_TET_PIECES[_tet.next];
    const mxr = Math.max.apply(null, p.cells.map(x => x[0])), mxc = Math.max.apply(null, p.cells.map(x => x[1]));
    const ox = (4 - mxc - 1) / 2, oy = (4 - mxr - 1) / 2;
    for (const [pr, pc] of p.cells) _tetCell(nctx, (ox + pc) * TET_CELL + 2, (oy + pr) * TET_CELL + 2, G_TET_COLORS[p.k]);
  }
}
function _tetCell(ctx, x, y, color, ghost) {
  ctx.fillStyle = color;
  if (ghost) { ctx.fillRect(x + 2, y + 2, TET_CELL - 4, TET_CELL - 4); return; }
  _gRoundRect(ctx, x + 1, y + 1, TET_CELL - 2, TET_CELL - 2, 3);
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.fillRect(x + 2, y + 2, TET_CELL - 4, 2);
}

/* ---------- 局终播报：整轮唯一一处往聊天发游戏消息的地方 ----------
   FIX 2026-10-08#050 局中沿途的里程碑消息（合出 2048 / 倒一座塔 / 八连消 / 四行消 / 全清）
   已全部摘掉，这里补回一次性的收尾：**局终一条**（成绩 + 结果），破纪录再补一条。
   solo 也发一条——自己玩也是玩完了跟 TA 说一声，只是不打扰过程。
   2026-10-15 BUGS #454：这一处同时落**那张成绩单卡**（以前只有 TA 那句点评，卡要用户自己按「告诉 TA」才发得出去）。 */
/* 局终那张卡的载荷＝唯一构造处：对战读那位名下那本、合作读「我们」那本（两本同一把尺 _gBook∶_gCoopBook）。
   beaten 按挑战分的本义**现算**（ta>0 且这一局够得上），不取 _gLast.beaten——那一格里还混进「超过旧最高」，
   拿去写「挑战 N · 已打破」就是说谎；newBest 用调用方在写账之前算好的那一枚（同一件事不重算第二遍）。
   卡上没有量不到的读数：分数∶最高∶TA 的实时终局分∶胜负全部来自刚结算完的那一本账。 */
function _gRoundCard(game, score, o) {
  if (o.coop) {
    const co = _gCoopBook(game);
    return { kind: 'score', game, score, best: co.best, ta: 0, beaten: false, newBest: score >= co.best && score > 0 };
  }
  const sc = _gBook(game);
  const last = _gLast[game] || {};
  return {
    kind: 'score', game, score, best: sc.best, ta: sc.ta,
    beaten: sc.ta > 0 && score >= sc.ta, newBest: !!o.newBest,
    taScore: last.taScore == null ? null : last.taScore,
    win: last.win == null ? undefined : !!last.win
  };
}
function _gEndReport(game, score, o) {
  o = o || {};
  // 自己玩不惊动任何人（BUGS #302）：屏上那条「局终 · N 分」由各款结算行自己写，聊天里不再落一句 TA 的点评。
  // 旧写法把这句投进「当时选中那位」的会话——而 solo 档屏上已经没有任何选人入口＝还在往别人家里发消息，正是那句假话。
  if (_gSkillMode(game) === 'solo') return;
  const cid = data.games.with;
  if (!cid) return;
  let text;
  if (o.coop) {
    // 成就类文案（曾经一条一条发在局中）收进局终这一条：同一件事说一次，且说在「玩完了」之后
    const ach = o.ach;   // 调用方给的就是这一款那组句子（G_COOP_ACH.g2048 之类），不再按 game 索引一遍
    text = ach ? _gPick(ach, Math.random())
      : (o.cleared && (game === 'pop' ? G_COOP_POP_CLEAR : game === 'link' ? G_COOP_LINK_CLEAR : null)
        ? _gPick(game === 'pop' ? G_COOP_POP_CLEAR : G_COOP_LINK_CLEAR, Math.random())
        : _gPick(G_COOP_END_SAY, Math.random()).replace('{n}', score));
    if (ach && !/分/.test(text)) text += '我们' + score + ' 分。';
  } else {
    text = _gPick(G_END_SAY[game] || G_END_SAY.merge, Math.random())
      .replace('{n}', score).replace('{m}', o.moves == null ? 0 : o.moves).replace('{l}', o.lines == null ? 0 : o.lines);
    if (o.cleared && G_END_CLEAR[game]) text = _gPick(G_END_CLEAR[game], Math.random());
  }
  // 卡先落（局终那一刻就是它），TA 那句点评随后到；合作那张额外带一句「是我们俩的」，
  // 因为 kind:'score' 那一张的头写的是「· 战绩」＝一个人玩的读法（与 _g*CoopShare 同一口径）
  const card = _gRoundCard(game, score, o);
  _deliverToChat({ id: nextId(), from: 'me', game: card, text: o.coop ? '这局是我们俩的' : '' }, cid);
  setTimeout(() => {
    if (!data.games || !data.contacts) return;
    _deliverToChat({ id: nextId(), from: 'partner', text }, cid);
    // 破纪录单独再报一声：那是值得被单独说一句的事，不该混在结算里被稀释
    if (!o.coop && o.newBest) {
      setTimeout(() => {
        if (!data.games || !data.contacts) return;
        _deliverToChat({ id: nextId(), from: 'partner', text: _gPick(G_END_BEST, Math.random()) }, cid);
      }, 1400 + Math.random() * 1400);
    }
  }, 700 + Math.random() * 900);
}

/* ---------- 局终结算 ---------- */
function _gGameEnd(game, score, opts) {
  const sc = _gBook(game);   // 记在哪一本由玩法决定（BUGS #302）：自己玩＝不认人的公共账、比分对战＝那位名下那本（coop 走各自那条路径，不经这里）
  sc.plays++;
  const beaten = !(opts && opts.noTa) && sc.ta > 0 && score >= sc.ta;
  const taScore = _gTaLiveFinal(game);   // TA 同一局的实时成绩同步定格
  const newBest = score > sc.best && score > 0;
  _gLast[game] = { score, beaten: beaten || (sc.best > 0 && score > sc.best), taScore, win: taScore != null ? score > taScore : undefined };
  if (score > sc.best) sc.best = score;
  save();
  // 局终收一声：破挑战分或实时对局赢过 TA 报上行，其余报下行；调用方已为「全清」响过的场合不再叠一声
  if (!(opts && opts.quiet)) playSfx(beaten || (taScore != null && score > taScore) ? 'win' : 'over');
  _gEndReport(game, score, {
    newBest, moves: opts && opts.moves, lines: opts && opts.lines, cleared: opts && opts.cleared
  });
  if (document.body.dataset.view === 'games' && data.games.tab === game) {
    _gamesRenderTaLine(game);
    if (game === 'merge') gMergeRefreshStat();
    if (game === 'g2048') g2048RefreshStat();
    if (game === 'pop') gPopRefreshStat();
    if (game === 'link') gLinkRefreshStat();
    if (game === 'puzzle') gPuzzleRefreshStat();
    if (game === 'tetris') gTetRefreshStat();
  }
}

/* ================= 聊天里的游戏卡 ================= */
function _gameCardHTML(m) {
  const g = m.game || {};
  /* 已下线的两款（BUGS #297）：老聊天记录里那两张卡照旧报得出名字与成绩，但游戏中心再没有它们的面板，
     故不给「去玩一局 / 一起再来」——留一枚点了没反应的钮，比少一枚钮糟得多（本仓零容忍那一族）。 */
  if (G_RETIRED_LABELS[g.game]) {
    const rl = escapeHTML(G_RETIRED_LABELS[g.game]);
    const head = g.kind === 'coop' ? rl + ' · 一起玩的' : (g.kind === 'challenge' ? rl + ' · 挑战分' : rl + ' · 战绩');
    const num = g.kind === 'challenge' ? (g.ta || 0) : (g.score || 0);
    return `<div class="gcard"><div class="gc-head"><b>${head}</b><span>GAME</span></div>`
      + `<div class="gc-body"><div class="gc-score"><b>${num}</b><span>${g.kind === 'challenge' ? 'TARGET' : 'SCORE'}</span></div>`
      + `<div class="gc-note">这一款已经不在游戏中心里了<br>这一条是你当时玩过的记录</div></div></div>`;
  }
  if (g.kind === 'score') {
    const beaten = g.beaten ? '<span class="gc-tag new">NEW BEST</span>' : (g.newBest ? '<span class="gc-tag new">BEST</span>' : (g.ta ? '<span class="gc-tag">挑战 ' + g.ta + '</span>' : ''));
    return `<div class="gcard"><div class="gc-head"><b>${G_LABELS[g.game] || '游戏'} · 战绩</b><span>GAME</span></div>`
      + `<div class="gc-body"><div class="gc-score"><b>${g.score || 0}</b><span>SCORE</span></div>`
      + `<div class="gc-note">${g.beaten ? '挑战 ' + g.ta + ' · 已打破<br>' : ''}${g.taScore != null ? '实时对局 · TA ' + g.taScore + ' 分 · ' + (g.win ? '你赢了' : 'TA 赢了') + '<br>' : ''}历史最高 ${g.best || 0}</div>${beaten}</div>`
      + `<div class="gc-foot"><button type="button" data-gbtn="play:${g.game}">去玩一局</button></div></div>`;
  }
  if (g.kind === 'challenge') {
    return `<div class="gcard"><div class="gc-head"><b>${G_LABELS[g.game] || '游戏'} · 挑战分</b><span>CHALLENGE</span></div>`
      + `<div class="gc-body"><div class="gc-score"><b>${g.ta}</b><span>TARGET</span></div>`
      + `<div class="gc-note">TA 立下的数<br>超过了才算赢</div></div>`
      + `<div class="gc-foot"><button type="button" data-gbtn="play:${g.game}">应战</button></div></div>`;
  }
  if (g.kind === 'coop') {
    if (g.game === 'puzzle') {
      return `<div class="gcard gc-coop"><div class="gc-head"><b>滑块拼图 · 一起拼完了</b><span>TOGETHER</span></div>`
        + `<div class="gc-body"><div class="gc-score"><b>${g.moves || 0}</b><span>MOVES</span></div>`
        + `<div class="gc-note">${g.done ? '这是我们第一次一起拼完整张图<br>' : ''}这张我们走了 <b>${g.moves || 0}</b> 步拼完</div>`
        + (g.done ? '<span class="gc-tag new">一起的</span>' : '') + `</div>`
        + `<div class="gc-foot"><button type="button" data-gbtn="coop:puzzle">一起再来</button></div></div>`;
    }
    if (g.game === 'tetris') {
      return `<div class="gcard gc-coop"><div class="gc-head"><b>俄罗斯方块 · 一起堆的</b><span>TOGETHER</span></div>`
        + `<div class="gc-body"><div class="gc-score"><b>${g.tier || 0}</b><span>LINES</span></div>`
        + `<div class="gc-note">${g.tier === 4 ? '这是我们第一次一起消掉四行<br>' : ''}这局我们攒到 <b>${g.score || 0}</b> 分</div>`
        + (g.tier === 4 ? '<span class="gc-tag new">一起的</span>' : '') + `</div>`
        + `<div class="gc-foot"><button type="button" data-gbtn="coop:tetris">一起再来</button></div></div>`;
    }
    if (g.game === 'pop') {
      const clear = !!g.clear;
      return `<div class="gcard gc-coop"><div class="gc-head"><b>消灭星星 · 一起消的</b><span>TOGETHER</span></div>`
        + `<div class="gc-body"><div class="gc-score"><b>${clear ? '全清' : (g.tier || 0) + '连'}</b><span>CO-OP</span></div>`
        + `<div class="gc-note">${clear ? '这是我们第一次一起清空整盘<br>' : ''}这盘我们攒到 <b>${g.score || 0}</b> 分</div>`
        + (clear ? '<span class="gc-tag new">一起的</span>' : '') + `</div>`
        + `<div class="gc-foot"><button type="button" data-gbtn="coop:pop">一起再来</button></div></div>`;
    }
    if (g.game === 'link') {
      return `<div class="gcard gc-coop"><div class="gc-head"><b>连连看 · 一起连的</b><span>TOGETHER</span></div>`
        + `<div class="gc-body"><div class="gc-score"><b>全清</b><span>CO-OP</span></div>`
        + `<div class="gc-note">${g.clear ? '这是我们第一次一起连完整盘<br>' : ''}这盘我们攒到 <b>${g.score || 0}</b> 分</div>`
        + (g.clear ? '<span class="gc-tag new">一起的</span>' : '') + `</div>`
        + `<div class="gc-foot"><button type="button" data-gbtn="coop:link">一起再来</button></div></div>`;
    }
    if (g.game === 'g2048') {
      const tile = g.tier === 2048;
      return `<div class="gcard gc-coop"><div class="gc-head"><b>2048 · 一起合成了</b><span>TOGETHER</span></div>`
        + `<div class="gc-body"><div class="gc-score"><b>${g.tier || 0}</b><span>CO-OP</span></div>`
        + `<div class="gc-note">${tile ? '这是我们第一次一起合出 2048<br>' : ''}这局我们推到 <b>${g.score || 0}</b> 分</div>`
        + (tile ? '<span class="gc-tag new">一起的</span>' : '') + `</div>`
        + `<div class="gc-foot"><button type="button" data-gbtn="coop:g2048">一起再来</button></div></div>`;
    }
    const f = G_FRUITS[g.tier] || G_FRUITS[0];
    const melon = g.tier === 10;
    return `<div class="gcard gc-coop"><div class="gc-head"><b>合成大西瓜 · 一起合成了</b><span>TOGETHER</span></div>`
      + `<div class="gc-body"><div class="gc-score"><b>${f.n}</b><span>CO-OP</span></div>`
      + `<div class="gc-note">${melon ? '这是我们第一次一起合出大西瓜<br>' : ''}这罐我们攒到 <b>${g.score || 0}</b> 分</div>`
      + (melon ? '<span class="gc-tag new">一起的</span>' : '') + `</div>`
      + `<div class="gc-foot"><button type="button" data-gbtn="coop:merge">一起再来</button></div></div>`;
  }
  if (g.kind === 'catcard') {
    // 邮差那一族 2026-10-12 随「在路上／站点／明信片」一起退役（BUGS #308）：老聊天记录里那一趟照旧报得出来，
    // 但站点清单与明信片画法已无宿主——不给「看明信片」（点了必是空浮层），只留一句实话。
    return `<div class="gcard"><div class="gc-head"><b>信已送到</b><span>MAIL</span></div>`
      + `<div class="gc-body"><div class="gc-note">这一趟走的是当时的「在路上」<br>站点与明信片已下线，这一条是你收到的记录</div></div></div>`;
  }
  return '';
}

/* ---------- 事件绑定 ---------- */
(function () {
  document.addEventListener('click', e => {
    const tab = e.target.closest('#gamesTabs .games-tab');
    if (tab) { _gamesSetTab(tab.dataset.game); return; }
    // 准备画面：玩法与开始（FIX 2026-10-08#050）
    const grm = e.target.closest('#gamesReady [data-grmode]');
    if (grm) { _gSetModeOf(data.games.tab, grm.dataset.grmode); _gSetPhase('', ''); renderGames(); return; }
    if (e.target.closest('#grGo')) { _gStart(data.games.tab); return; }
    // 沉浸整屏：准备画面与六块面板的模式行里那一枚都走这一处（钮文案自己写着当前能做什么）
    if (e.target.closest('[data-gfull]')) { _gSetFull(!_gFull); return; }
    const mm = e.target.closest('[data-mmode]');
    if (mm) { _gMergeSetMode(mm.dataset.mmode); return; }
    const gm = e.target.closest('[data-gmode]');
    if (gm) { _g2048SetMode(gm.dataset.gmode); return; }
    const pm = e.target.closest('[data-pmode]');
    if (pm) { _gPopSetMode(pm.dataset.pmode); return; }
    const lm = e.target.closest('[data-lmode]');
    if (lm) { _gLinkSetMode(lm.dataset.lmode); return; }
    const lsch = e.target.closest('[data-lsch]');
    if (lsch) { _gLinkSchemeUse(lsch.dataset.lsch); return; }
    const lschd = e.target.closest('[data-lschdel]');
    if (lschd) { _gLinkSchemeDel(lschd.dataset.lschdel); return; }
    const lss = e.target.closest('#linkSchemeSave');
    if (lss) { _gLinkSchemeSave(); return; }
    const lsbb = e.target.closest('#linkSkinBatchBtn');
    if (lsbb) { const f = $('#linkSkinBatch'); if (f) f.click(); return; }
    const lsx = e.target.closest('[data-lskinx]');
    if (lsx) { _gLinkSkinClear(+lsx.dataset.lskinx); return; }
    const lsk = e.target.closest('[data-lskin]');
    if (lsk) { _linkSkinPick = +lsk.dataset.lskin; const f = $('#linkSkinFile'); if (f) f.click(); return; }
    const lsr = e.target.closest('#linkSkinReset');
    if (lsr) {
      data.games.linkSkins = {};
      const sc = _gLinkSkinSchemeOn();
      if (sc) sc.skins = {};
      save(); _gLinkSkinsAfter(); showToast('这套已恢复默认图腾');
      return;
    }
    const lskb = e.target.closest('#linkSkinBtn');
    if (lskb) { const bx = $('#linkSkins'); if (bx) { bx.hidden = !bx.hidden; if (!bx.hidden) _gLinkSkinsRender(); } return; }
    const zm = e.target.closest('[data-zmode]');
    if (zm) { _gPzSetMode(zm.dataset.zmode); return; }
    const ttm = e.target.closest('[data-tetmode]');
    if (ttm) { _gTetSetMode(ttm.dataset.tetmode); return; }
    const who = e.target.closest('[data-gwho]');
    if (who) { _gamesSetWho(who.dataset.gwho); return; }
    const wo = e.target.closest('.ta-line .avatar, .cat-st');   // 点头像/邮差收件人＝弹出（收起）换人 chips
    if (wo) { const w = $('#gamesWho'); if (w) w.hidden = !w.hidden; return; }
    const share = e.target.closest('[data-gshare]');
    if (share) { _gShare(share.dataset.gshare); return; }
    const mclr = e.target.closest('[data-mclear]');
    if (mclr) { _gMergeSkinClear(+mclr.dataset.mclear); return; }
    const msdel = e.target.closest('[data-msdel]');
    if (msdel) { _gMergeSchemeDel(msdel.dataset.msdel); return; }
    const msch = e.target.closest('[data-mscheme]');
    if (msch) { _gMergeSchemeUse(msch.dataset.mscheme); return; }
    const mss = e.target.closest('#mergeSchemeSave');
    if (mss) { _gMergeSchemeSave(); return; }
    const msb = e.target.closest('#mergeSkinBatchBtn');
    if (msb) { const bf = $('#mergeSkinBatch'); if (bf) bf.click(); return; }
    const msk = e.target.closest('[data-mskin]');
    if (msk) { _mergeSkinTier = +msk.dataset.mskin; const f = $('#mergeSkinFile'); if (f) f.click(); return; }
    const msr = e.target.closest('#mergeSkinReset');
    if (msr) {
      data.games.mergeSkins = {};
      const sc = _gSkinSchemeOn();
      if (sc) sc.skins = {};   // 选中哪套就清哪套
      Object.keys(_mergeImgs).forEach(k => delete _mergeImgs[k]);
      save(); _gMergeSkinsRender(); _gMergeRail(); showToast('已恢复默认水果');
      return;
    }
    const skb = e.target.closest('#mergeSkinBtn');
    if (skb) { _mergeSkinOpen = !_mergeSkinOpen; const bx = $('#mergeSkins'); if (bx) { bx.hidden = !_mergeSkinOpen; if (_mergeSkinOpen) _gMergeSkinsRender(); } return; }
    const gsc = e.target.closest('[data-gsdel]');
    if (gsc) { _g2048SchemeDel(gsc.dataset.gsdel); return; }
    const gsch = e.target.closest('[data-gscheme]');
    if (gsch) { _g2048SchemeUse(gsch.dataset.gscheme); return; }
    const gss = e.target.closest('#g2048SchemeSave');
    if (gss) { _g2048SchemeSave(); return; }
    const gsb = e.target.closest('#g2048SkinBatchBtn');
    if (gsb) { const bf = $('#g2048SkinBatch'); if (bf) bf.click(); return; }
    const skx = e.target.closest('[data-gskinx]');
    if (skx) {
      const k = skx.dataset.gskinx;
      delete data.games.g2048Skins[k];
      const sc = _g2048SkinSchemeOn();   // 选中哪套方案就同步删哪套
      if (sc) delete sc.skins[k];
      save(); g2048RenderSkins(); g2048Render(); showToast('已移除，这个数字回到配色字面'); return;
    }
    const sk = e.target.closest('[data-gskin]');
    if (sk) { _g2048SkinPick = +sk.dataset.gskin; const f = $('#g2048SkinFile'); if (f) f.click(); return; }
    const skr = e.target.closest('#g2048SkinReset');
    if (skr) {
      data.games.g2048Skins = {};
      const sc = _g2048SkinSchemeOn();
      if (sc) sc.skins = {};   // 选中哪套就清哪套
      save(); g2048RenderSkins(); g2048Render(); showToast('这套已恢复配色字面'); return;
    }
    const gskb = e.target.closest('#g2048SkinBtn');
    if (gskb) { const bx = $('#g2048Skins'); if (bx) { bx.hidden = !bx.hidden; if (!bx.hidden) g2048RenderSkins(); } return; }
    const gbtn = e.target.closest('[data-gbtn]');
    if (gbtn) {
      const [kind, arg] = gbtn.dataset.gbtn.split(':');
      // FIX 2026-10-08#050 从聊天点「去玩一局/应战/一起再来」不再直接开跑：切过去停在准备画面，
      // 自己点开始（或点「邀请 TA 一起玩」走应答）。抢在别人回复前替你开局，正是这次要去掉的行为。
      if (kind === 'play') { showView('games'); _gSetPhase('', arg); _gamesSetTab(arg); return; }
      if (kind === 'coop') {
        showView('games');
        const key = { g2048: 'g2048Mode', pop: 'popMode', link: 'linkMode', puzzle: 'puzzleMode', tetris: 'tetrisMode', merge: 'mergeMode' }[arg];
        if (key) { data.games[key] = 'coop'; save(); }
        _gSetPhase('', arg);
        _gamesSetTab(arg);
        return;
      }
      return;
    }
  });
  const mr = $('#mergeRestart');
  if (mr) mr.addEventListener('click', () => { gMergeRestart(); });
  const gr = $('#g2048Restart');
  if (gr) gr.addEventListener('click', () => { g2048Restart(); });
  const pr = $('#popRestart');
  if (pr) pr.addEventListener('click', () => { gPopRestart(); });
  const lr = $('#linkRestart');
  if (lr) lr.addEventListener('click', () => { gLinkRestart(); });
  const lsf = $('#linkSkinFile');
  if (lsf) lsf.addEventListener('change', async () => {
    const file = lsf.files && lsf.files[0];
    lsf.value = '';
    if (!file || _linkSkinPick < 0) return;
    const durl = await fileData(file, 320, 0.85);
    if (!durl) return;
    _gLinkSkinSlotPut(_linkSkinPick, durl);
    showToast('第 ' + (_linkSkinPick + 1) + ' 格换好了，下一局就是它');
    _linkSkinPick = -1;
  });
  const lbt = $('#linkSkinBatch');
  if (lbt) lbt.addEventListener('change', async () => {
    const files = Array.from(lbt.files || []);
    lbt.value = '';
    if (!files.length) return;
    const r = await _gSkinsBatch(files, [...Array(12).keys()], (i, durl) => _gLinkSkinSlotPut(i, durl));
    showToast('换好 ' + r.ok + ' 张' + (r.tooBig ? ' · ' + r.tooBig + ' 张超过 5MB 没收' : ''));
  });
  const pg = $('#popGrid');
  if (pg) pg.addEventListener('click', e => {
    const t = e.target.closest('[data-pidx]');
    if (t) popTap(+t.dataset.pidx);
  });
  const lg = $('#linkGrid');
  if (lg) lg.addEventListener('click', e => {
    const t = e.target.closest('.link-tile');
    if (t) linkTap(+t.dataset.lidx);
  });
  const zr = $('#puzzleRestart');
  if (zr) zr.addEventListener('click', () => { gPuzzleRestart(); });
  const zi = $('#puzzleImgBtn');
  if (zi) zi.addEventListener('click', () => {
    const was = _puzzle.src;
    gPuzzleRestart(true);
    // 只传了一张图时重抽必然还是它＝屏上那句「换了一张图」会是假话，按抽到的到底变没变说
    showToast(_puzzle.src === was ? '又洗了一局 · 还是这张图' : '换了一张图');
  });
  const zob = $('#puzzleOwnBtn');
  if (zob) zob.addEventListener('click', () => { const f = $('#puzzleImgFile'); if (f) f.click(); });
  const zof = $('#puzzleImgFile');
  if (zof) zof.addEventListener('change', async () => {
    const files = Array.from(zof.files || []);
    zof.value = '';
    if (!files.length) return;
    let first = '';   // 用户选的第一张＝当场换上这张（顺序跟着文件走，与「一次传一套」同一口径）
    // 复用那族已有的批量件：并发闸·超大图先挡一道（fileData 里的超限提示会一张弹一次）·读不出来的只空自己那一格
    const r = await _gSkinsBatch(files, [...Array(PUZZLE_OWN_MAX).keys()], (i, durl) => { if (!first) first = durl; _puzzleOwnAdd(durl); });
    save();
    if (!r.ok) { showToast('这几张没读出来，换一张试试'); return; }
    if (_puzzle.cells) _puzzleSetSrc(first);
    else { _puzzle.src = first; gPuzzleRestart(); }   // 刚才因没图没开局：图到了，当场把这一局开起来
    _puzzleOwnView();
    showToast('换上你的图了' + (r.tooBig ? ` · ${r.tooBig} 张超过 5MB 没收` : '') + (files.length > PUZZLE_OWN_MAX ? ` · 只收前 ${PUZZLE_OWN_MAX} 张` : ''));
  });
  const zoc = $('#puzzleOwnClear');
  if (zoc) zoc.addEventListener('click', () => { _puzzleOwnTap(); });
  const zg = $('#puzzleGrid');
  if (zg) zg.addEventListener('click', e => {
    const t = e.target.closest('[data-zidx]');
    if (t) puzzleTap(+t.dataset.zidx);
  });
  const tr2 = $('#tetRestart');
  if (tr2) tr2.addEventListener('click', () => { gTetRestart(); });
  const tc = $('#tetControls');
  if (tc) tc.addEventListener('click', e => {
    const b = e.target.closest('[data-tetact]');
    if (b) tetAct(b.dataset.tetact);
  });

  const cvM = $('#mergeCv');
  if (cvM) {
    const setX = e => {
      const rect = cvM.getBoundingClientRect();
      _merge.dropX = Math.max(14, Math.min(_merge.w - 14, e.clientX - rect.left));
    };
    cvM.addEventListener('pointerdown', e => {
      if (_merge.over) return;
      _merge.aim = true;
      setX(e);
      e.preventDefault();
    });
    cvM.addEventListener('pointermove', e => {
      if (_merge.over) return;
      if (_merge.aim || e.pointerType === 'mouse') setX(e);
    });
    cvM.addEventListener('pointerup', e => {
      if (!_merge.aim) return;
      _merge.aim = false;
      if (_merge.over || Date.now() < _merge.cool) return;
      setX(e);
      const r = G_FRUITS[_merge.cur].r * (_merge.w / 340);
      _merge.balls.push({ x: _merge.dropX, y: 30 + r, vx: 0, vy: 0.5, tier: _merge.cur, born: Date.now(), sq: 0, sqv: 0, sqA: 0, rot: 0, va: 0 });
      if (_merge.mode === 'vs') _gTaLiveStart('merge');   // 对战：你丢第一颗 TA 也开始玩
      else if (_merge.mode === 'coop') _merge.coop.taAt = Date.now() + 1000 + Math.random() * 1200;   // 合作：TA 隔一会儿回一颗
      _merge.cur = _merge.next;
      _merge.next = Math.floor(Math.random() * 5);
      _merge.cool = Date.now() + 420;
      _gMergeRail();
      gMergeLoopKick();
    });
  }
  const sf = $('#mergeSkinFile');
  if (sf) sf.addEventListener('change', async () => {
    const file = sf.files && sf.files[0];
    sf.value = '';
    if (!file || _mergeSkinTier < 0) return;
    const durl = await fileData(file, 320, 0.85);
    if (!durl) return;
    if (!data.games.mergeSkins) data.games.mergeSkins = {};
    data.games.mergeSkins[_mergeSkinTier] = durl;
    const sc = _gSkinSchemeOn();   // 选中哪套方案就同步进哪套
    if (sc) sc.skins[_mergeSkinTier] = durl;
    delete _mergeImgs[_mergeSkinTier];
    save();
    _gMergeSkinsRender(); _gMergeRail();
    showToast(G_FRUITS[_mergeSkinTier].n + ' 换好了，掉下来就是它');
  });
  const mbf = $('#mergeSkinBatch');
  if (mbf) mbf.addEventListener('change', async () => {
    const files = Array.prototype.slice.call(mbf.files || []);
    mbf.value = '';
    if (!files.length) return;
    if (!data.games.mergeSkins) data.games.mergeSkins = {};
    const sc = _gSkinSchemeOn();   // 选中哪套方案就同步进哪套
    const r = await _gSkinsBatch(files, G_FRUITS.map((f, i) => i), (t, durl) => {
      data.games.mergeSkins[t] = durl;
      if (sc) sc.skins[t] = durl;
      delete _mergeImgs[t];
    });
    if (!r.ok) { if (r.tooBig) showToast(r.tooBig + ' 张超过 5MB，一张都没铺上'); return; }
    save();
    _gMergeSkinsRender(); _gMergeRail();
    if (r.tooBig) showToast(r.tooBig + ' 张超过 5MB，没铺上');
  });
  const skf = $('#g2048SkinFile');
  if (skf) skf.addEventListener('change', async () => {
    const file = skf.files && skf.files[0];
    skf.value = '';
    if (!file || !_g2048SkinPick) return;
    const durl = await fileData(file, 320, 0.85);
    if (!durl) return;
    if (!data.games.g2048Skins) data.games.g2048Skins = {};
    data.games.g2048Skins[_g2048SkinPick] = durl;
    const sc = _g2048SkinSchemeOn();   // 选中哪套方案就同步进哪套
    if (sc) sc.skins[_g2048SkinPick] = durl;
    save();
    g2048RenderSkins(); g2048Render();
    showToast('合成到 ' + _g2048SkinPick + ' 就会变成这张图');
    _g2048SkinPick = 0;
  });
  const g2bf = $('#g2048SkinBatch');
  if (g2bf) g2bf.addEventListener('change', async () => {
    const files = Array.prototype.slice.call(g2bf.files || []);
    g2bf.value = '';
    if (!files.length) return;
    if (!data.games.g2048Skins) data.games.g2048Skins = {};
    const sc = _g2048SkinSchemeOn();   // 选中哪套方案就同步进哪套
    const r = await _gSkinsBatch(files, G_MERGE_VAL, (v, durl) => {
      data.games.g2048Skins[v] = durl;
      if (sc) sc.skins[v] = durl;
    });
    if (!r.ok) { if (r.tooBig) showToast(r.tooBig + ' 张超过 5MB，一张都没铺上'); return; }
    save();
    g2048RenderSkins(); g2048Render();
    if (r.tooBig) showToast(r.tooBig + ' 张超过 5MB，没铺上');
  });
  const gu = $('#g2048Undo');
  if (gu) gu.addEventListener('click', () => g2048Undo());
  // 桌面鼠标拖动也能滑（触屏走上面 touch 事件，键盘走方向键）
  const ggrid = $('#g2048Grid');
  if (ggrid) {
    let mx = 0, my = 0, mon = false;
    ggrid.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') return; mx = e.clientX; my = e.clientY; mon = true; });
    ggrid.addEventListener('pointerup', e => {
      if (!mon || e.pointerType !== 'mouse') return; mon = false;
      const dx = e.clientX - mx, dy = e.clientY - my;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      g2048Move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    });
  }
  const pane2048 = $('#game2048');
  if (pane2048) {
    let sx = 0, sy = 0, on = false;
    pane2048.addEventListener('touchstart', e => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; on = true; }, { passive: true });
    pane2048.addEventListener('touchend', e => {
      if (!on) return; on = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
      g2048Move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    }, { passive: true });
  }
  document.addEventListener('keydown', e => {
    if (document.body.dataset.view !== 'games' || !data.games) return;
    // 桌面端 Esc＝退出整屏（与浏览器原生全屏同一习惯）；移动端靠那枚钮与安卓返回键
    if (e.key === 'Escape') { if (_gFull) _gSetFull(false); return; }
    if (data.games.tab === 'g2048') {
      const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
      if (map[e.key]) { e.preventDefault(); g2048Move(map[e.key]); }
      return;
    }
    if (data.games.tab === 'tetris') {
      const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'rot', ' ': 'drop' };
      if (map[e.key]) { e.preventDefault(); tetAct(map[e.key]); }
      return;
    }
    if (data.games.tab === 'puzzle') {
      const map = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
      if (map[e.key]) { e.preventDefault(); puzzleSlide(_puzzle.empty - map[e.key][0] * PUZZLE_N - map[e.key][1]); }
    }
  });
  /* 转屏／系统栏收放／窗口改尺寸都汇到这一处重排：rAF 去抖（一段连续 resize 只量最后一次），
     先装棋盘再重画（顺序反了＝拿旧格子画新尺寸）。
     orientationchange 单靠 resize 在部分安卓 WebView 上不 fire，visualViewport 兜地址栏收起那一下。 */
  let _gRefitRaf = 0;
  function _gRefitActive() {
    if (_gRefitRaf) return;
    _gRefitRaf = requestAnimationFrame(() => {
      _gRefitRaf = 0;
      if (document.body.dataset.view !== 'games' || !data.games) return;
      const tab = data.games.tab;
      if (_gPhaseOf(tab) !== 'playing') { _gamesRenderReady(); return; }   // 准备画面不占棋盘：重画卡片就行
      _gFitBoards(tab);                                                     // 先按新视口重装棋盘，再重画（顺序反了＝拿旧格子画新尺寸）
      if (tab === 'g2048') g2048Render();
      if (tab === 'pop') _popRender();
      if (tab === 'link') _linkRender();
      if (tab === 'puzzle') _puzzleRender();
      if (tab === 'merge') gMergeDraw();
      if (tab === 'tetris') gTetDraw();
    });
  }
  window.addEventListener('resize', _gRefitActive);
  window.addEventListener('orientationchange', _gRefitActive);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', _gRefitActive);

})();

