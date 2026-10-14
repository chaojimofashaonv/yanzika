// ===== 世界感知（移植自家 mochi「此间」核心机制）：TA 的时间 + 感知距离 + 空闲/忙碌 + 状态签名（带历史） =====
// 面板：独立视图 view-cjian，入口 = 聊天页顶部状态 chip（cjChip）
// 数据：data.cjian = { enabled(靠近提示), moodOn(情绪感知·含「你」那一行), sgOn(情绪卡里的语气行), readOn(TA 读你的台词),
//   btOn(心动), undOn(接住), ngOn(干扰), by: { [联系人id]: entry } }
//   —— 这七枚开关只管「那一族在不在屏上·还不开口」：关掉一族＝它不进投递候选，其余各线照旧（各管各的，不牵连兄弟）
// entry = { offsetMin 这一本自己的时间流偏移（分钟，建档时抽一次存死）, world{hh,mm,last,next} TA 那边此刻的时刻（每 1-8 小时重抽一次），
//           2026-10-08 曾把「时间流偏移」连着设置卡一起删净（BUGS #190），当日按用户更正恢复＝删的只是那格入口，
//           「每位各有一条时间流」这件事本身是这一页的意义，不能没有；屏上零控件、值只由建档那一次抽签决定
//           p/sinceP/cdP 感知距离, a/sinceA/cdA 活动, status/sinceS/cdS 状态签名,
//           mo/mo2 情绪档（一次两枚＝主＋次；抽到平静只亮主档那一枚）, sinceMo/cdMo 那条钟, moSay/moSayTs 主档的自述（＝面板那一行；开口那句到点现抽，见 #312）,
//           moRead/moRead2/sinceMoRead/cdMoRead 「TA 读到的你的心情」（另一条独立随机钟，永远有主档）,
//           sg/sinceSg/cdSg 撒娇档（屏上＝情绪卡里那行「TA 语气」）,
//           rd/sinceRd/cdRd 读你档, rdSay/rdSayTs 该档台词,
//           sayNext 统一投递钟下一次开口的时刻（0＝还没摊起点）, spoken 最近说过的句子（≤10 条，同一句不说第二遍）,
//           hist[{k,t,ts}] }
// hist.k：s=状态签名 / n=靠近事件 / p=感知记录 / r=呢喃 / w=心愿 / d=梦 / b=碑 / f=体感 / m=情绪（2026-10-07 起新账带 ma/mb 主次档键，旧账从 t 前缀现认，见 _cjMoodKeysOf） / u=读你（含「TA 读到的你的心情」换档）/ i=旧「我」那一格的手工记账（写手已撤，旧账保留）；每联系人上限 80 条
// 调度：并入信箱 30s tick（mailbox.js 调 cjianTick）；世界时刻 1-8h 重抽，活动 8-25 分钟、
//       感知 20-45 分钟、状态 30-90 分钟、情绪 25-70 分钟、撒娇 15-40 分钟、读你 25-70 分钟、
//       TA 读到的你 45-110 分钟各自漂移（读别人比读自己慢）；靠近事件 = 感知超 2h 未变时约 0.4%/tick + 全局 20 分钟冷却
// 投递（2026-10-08 收成一条钟，BUGS #189）：这一页所有「TA 自己那一侧」的读数共用同一条随机钟
//       （sayNext 在 180-480 分钟这一区间里现掷，按会话各存一格），到点从此刻真有词可说的那些线里挑一条说出口。
//       此前是六条线六种口径（读你 22%·呢喃 6%/tick·体感 40% 挂靠近·闪回 1%/tick·梦 1.5%/tick·问卡 1.2%/tick），
//       且各带一枚「当日一次／每世界日一次／小时冷却」的硬额度——全部撤净，只留这一条区间。
//       不进这条钟的两类：里程碑（越阈值那一刻的事件，迟到就不是那句话）与连接感知（真实读数，屏上没有一句是 TA 说过的）
//       开口那一刻只念【此刻这一档】的话（BUGS #312）：签名／情绪自述／读你那三句在投递时按当前档现抽，
//       不读换档那一刻存好的那句——那三句各自跟着 25~90 分钟漂移，而这条钟 3~8 小时才走一格，
//       照存好的念＝61% 的开口说的是几小时前那一档（用户报的「TA 醒了还给我说梦话」）；
//       面板上那三行仍读存好的现值（每次重画都现抽＝签名每 30 秒抖一次，#189 那句「不替 TA 改口」在屏上照旧成立）。
// 情绪感知卡＝同族两张表合在一处（2026-10-06 用户定档「甲」）：卡里两行同序胶囊，
// 上「TA」＝TA 自己的心情，下「你」＝TA 读到的你的心情；两张表都从同一张 CJ_MOODS 取值。
// 每行一次亮两枚（2026-10-07 用户判「怎么可能只触发一个情绪，设计有缺陷」）：主档按全表权重掷，
// 次档从同一张表里排除「平静」与主档之后再按权重掷——同一条钟同一次掷出这一对，不开第二条钟。
// 主次在屏上分得出来（主＝白岛＋加粗＋落影，次＝只把文字给满墨、不浮起），自述那句只跟主档走。
// 「抽到平静就只亮它一枚」是用户定档：平静×雀跃 是打嘴不是复杂，所以平静不参与 pairing。
// 撞上＝两行**主档**相同（同一列上下各亮一枚再各挂一枚墨点），只标一下、不出声、不驱动任何行为；
// 刻意不认「任意一枚重合」——量过：两枚对两枚那样算，重合率从 15.2% 涨到 54.5%，那枚点就成了装饰。
// 「TA 读你」不再单占一张卡（一件事不两处各说一遍）：它那条钟照旧漂，只负责从【读到的你】抽一句台词
// 印在「你」那一行下面；这句连同其余各线一起进末尾那条统一投递钟（旧写法是「换档时 22%＋当日只一条」）；卡面不再列那七枚状态档名胶囊。
// 「我」那一格（旧 moodMine）已取消手工：2026-10-05 定档「只有你自己点」，2026-10-06 改判「由 TA 供值、不再手工」，
// 那一格就此换成 TA 读到的你——谁都不再替用户按按钮，两行结构对称、都不会空着
// 连接感知不走随机：cjConnOf() 每次从真实消息现算，是这一页唯一的事实读数

const CJ_PRESENCE = {
  near:   { label: '很近',     desc: '感觉就在身边' },
  nearby: { label: '附近',     desc: 'TA 可能就在附近' },
  far:    { label: '遥远',     desc: '能感觉到，但距离很远' },
  unfelt: { label: '感觉不到', desc: '暂时无法感知 TA' },
  gone:   { label: '离开',     desc: 'TA 暂时不在附近' }
};
const CJ_ACTIVITY = {
  free:    { label: '空闲', desc: '现在比较适合交流' },
  busy:    { label: '忙碌', desc: 'TA 正在做自己的事情' },
  rushed:  { label: '忙着', desc: '暂时不太方便' },
  rest:    { label: '休息', desc: 'TA 正在休息' },
  sleep:   { label: '睡着', desc: 'TA 那边已经入睡' },
  unknown: { label: '未知', desc: '暂时不知道 TA 在做什么' }
};
// 「TA 此刻在做什么」→ 主动发送间隔的倍率（2026-10-09 用户四问定档·表 I 双向·设计稿-状态调制主动发送.md）。
// 这张表与 CJ_ACTIVITY 贴在一起＝档名与倍率同源，不在两处各列一份名单；倍率不是数据，不进 data 也不进备份。
// 数字来自仿真的手感（免打扰关·每人每日开口）：现状 81 次 → 这套 60 次（−26%），
// 夜里 −55%、白天只 −14%；睡着那一档中位等 33 分／最长 60 分，空闲那一档中位 3.9 分。
// unknown 恒 1＝读不到就不浮动（与「读不到落『读不到』、不冒充 0」那条口径同族）
const CJ_ACTIVITY_MUL = { free: 0.7, busy: 1.6, rushed: 2.6, rest: 1.3, sleep: 6, unknown: 1 };
// 同一份档名 → 「已读不回」那一格概率的倍率（2026-10-11 BUGS #290·用户点「已读不回也按状态调」）。
// 为什么不与上面那张表共用：间隔与概率不是同一个量——睡着那一档 ×6 乘在等待分钟上是「等一小时变六小时」，
// 乘在 20% 上就成了 120%（顶穿＝永远不回，那是另一件事，不许悄悄发生），所以两张表各管一件事、方向一致：
// 越不方便回，越可能已读不回。倍率是表不是数据，不进 data 也不进备份。
// free 0.5＝空闲那一档把「不回」的可能性砍一半；unknown 恒 1＝读不到就不表态（与上面那条同口径）
const CJ_ACTIVITY_NR = { free: 0.5, busy: 1.8, rushed: 2.2, rest: 1.4, sleep: 3, unknown: 1 };
const CJ_SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
// 情绪感知七档：档名与权重都是固定名单（不按钟点/聊天内容推），calm＝中性档常驻显示、不藏
const CJ_MOODS = {
  joy:       { label: '雀跃',   desc: '心情很好，说话都轻' },
  soft:      { label: '柔软',   desc: '软软的，想挨着你' },
  calm:      { label: '平静',   desc: '中性档 · 不是没有情绪' },
  low:       { label: '低落',   desc: '有点提不起劲' },
  irritable: { label: '烦躁',   desc: '坐不住，想缓一缓' },
  miss:      { label: '想念',   desc: '想见你，就现在' },
  blank:     { label: '淡淡的', desc: '说不上好也说不上不好' }
};
const CJ_MOOD_ORDER = ['joy', 'soft', 'calm', 'low', 'irritable', 'miss', 'blank'];
const CJ_MOOD_W = { joy: 12, soft: 15, calm: 22, low: 12, irritable: 12, miss: 14, blank: 13 };
// 情绪一次掷一对＝[主档, 次档]（2026-10-07 用户判「怎么可能只触发一个情绪」）。次档从**同一张表**里
// 排除「平静」与主档之后再按各自权重掷：平静只单独出现（用户定档＝平静×雀跃 是打嘴不是复杂），
// 两枚同名等于只有一枚（不重复说同一件事）。这一对出自**同一条钟的同一次掷**，不开第二条「次档钟」——
// 那样两枚会在不同时刻各换各的，读起来像两个人共用一张嘴
function _cjMoodRoll(cur) {
  // 惯性只落在调用方递进来的那一档（情绪这条钟传 en.mo＝换档更黏；TA 读你那条不传＝照旧纯漂）
  const w0 = (cur && CJ_MOOD_W[cur]) ? Object.assign({}, CJ_MOOD_W) : CJ_MOOD_W;
  if (w0 !== CJ_MOOD_W) w0[cur] *= 1.6;
  const a = _cjPickWeighted(w0);
  if (a === 'calm') return ['calm', ''];
  const w = {};
  for (const k of CJ_MOOD_ORDER) if (k !== 'calm' && k !== a) w[k] = CJ_MOOD_W[k];
  return [a, _cjPickWeighted(w)];
}
// 这一对写成一行小字（时间线历史用它，界面自己另画胶囊）：次档为空就只剩主档那一枚
function _cjMoodPairLabel(a, b) {
  const la = (CJ_MOODS[a] || CJ_MOODS.calm).label;
  return b && CJ_MOODS[b] ? la + ' · ' + CJ_MOODS[b].label : la;
}
// 次档能不能上屏：主档是平静、次档不在名单、次档与主档同名 → 一律不画（读侧唯一口径，两处调用共用）
function _cjMood2(primary, second) {
  return primary !== 'calm' && second && CJ_MOODS[second] && second !== primary ? second : '';
}
// 示软四档（功能中心那一行叫「示软」，旧称撒娇；档名用程度词而不是动作词——四档里 62% 是平常与读不到）：
// 只报「有没有、到什么程度」；flat＝中性档常驻不藏。
// 2026-10-08 二批：这一族从「屏上只亮档名」改成「也能开口」——台词住在【TA心里话·示软的话】，
// 按当前那一档取词（该档没词就这一轮不参与，不拿别档凑）；旧定档那句「不替 TA 编台词」由用户本次指令反转
const CJ_SG = {
  on:   { label: '软着', desc: '语气软着，等你接一句' },
  some: { label: '有一点', desc: '绕了一下，没直说' },
  flat: { label: '平常',   desc: '中性档 · 不是没有' },
  none: { label: '读不到', desc: '这一会儿感应不到' }
};
const CJ_SG_ORDER = ['on', 'some', 'flat', 'none'];
const CJ_SG_W = { on: 16, some: 22, flat: 36, none: 26 };
// 心动四档（2026-10-06 用户三问定档＝双向·两组各一枚；2026-10-08 二批把「只报档不出声」改成「TA 那一枚也能开口」）：
// 量的是「这会儿心口有没有动」。
// 档名内敛、不写「心动」两字——那两个字已经在键上，一行只说一次（与「语气」那一枚同族）。
// flat＝中性档常驻不藏（第一版让平常档隐身，结果四分之三的时间里那一栏是空的，用户判「不见了」），
// none 是「这一会儿没顾上感觉心口」，不是坏消息，更不是闸门。
// 2026-10-08 二批：四枚档名整族换成「心口」自己的字根。旧写法与「语气」那一族共用 有一点／平常／读不到
// 三枚程度词，两枚并到同一行后屏上就是「语气 有一点 · 心动 有一点」＝同一件事说两遍（用户判「语义重复」）。
const CJ_BT = {
  hit:  { label: '心口一热', desc: '离你近一点就想碰你' },
  some: { label: '有点痒', desc: '动了一下，没到要说出口' },
  flat: { label: '平平的', desc: '中性档 · 不是没有' },
  none: { label: '没去留意', desc: '这一会儿没顾上感觉心口' }
};
const CJ_BT_ORDER = ['hit', 'some', 'flat', 'none'];
const CJ_BT_W = { hit: 14, some: 24, flat: 40, none: 22 };
const CJ_BT_MIN_MIN = 60, CJ_BT_MAX_MIN = 180;   // 这条钟自己的区间（分钟）：两端都高于这一页其余四条
// 接住五档（2026-10-08 用户「梦角不一定控制得好字卡，可能发错、表达错意思，或者我理解错了——
// 怎么设计一个理解行为的功能」）：一条钟一次抽两枚＝TA 这一句说明白了几分（un）＋你接住了几分（unYou），
// 两枚同表同序，抽到同一档＝对上了（各挂一枚墨点，照心动那条的现成记号）。
// 刻意**不从通信派生**：回复引擎抽卡本就是纯随机，库里没有「这一次控制住了没」这个事实，量不出的东西不编
// （与 #114「不从通信现算、也不从别的档位推」同口径；要它能派生得先给引擎加「想说什么→候选卡」那一层）。
// 也不做纠错：按用户的世界观，错开不是坏事，所以五档里最重的两档只到「词没对上」「想再说一遍」，
// 没有「说错了」「误会了」那一类词。不写历史·不驱动回复。
// 开口口径（2026-10-08 二批）：TA 那一枚「说明白」进统一投递候选（池＝【TA心里话·说明白的话】）；
// 「你接住」那一枚刻意不开口——从 TA 嘴里说出「你没接住我这句」＝给用户打分，与本表那句
// 「最重两档也不指责任何一方」直接相冲，它在屏上亮着就是它的表达方式
const CJ_UND = {
  got:   { label: '一说就懂' },
  flat:  { label: '都听见了' },
  half:  { label: '猜了一半' },
  slip:  { label: '词没对上' },
  again: { label: '想再说一遍' }
};
const CJ_UND_ORDER = ['got', 'flat', 'half', 'slip', 'again'];
const CJ_UND_W = { got: 26, flat: 24, half: 22, slip: 16, again: 12 };   // 合计 100：正面与中性占 72%，错开那 28% 也不是坏消息
const CJ_UND_MIN_MIN = 50, CJ_UND_MAX_MIN = 140;   // 比干扰那条（30-90 分）稀、比心动那条（60-180 分）密
// 干扰五档（连接感知卡底那一行）：这一页其余四条随机线说的都是「TA 此刻是什么状态」，这一条说的是
// 「有什么正占着 TA，所以这条线没接上」。它既不从通信量出来（那些数此刻已经在这张卡上各自印着：
// 中位间隔、连着没被接、已读不回——再加一枚就是同一个数说两遍），也不从别的档位推（被推的那一方
// 本身就是抽签抽的，两个随机数之间没有因果），所以它自己掷一条钟。
// 原因只报「哪一边」，不重报那一边的具体档位：那一格在它自己的卡上亮着，这里只写去哪看（to）。
// clear 是中性档、常驻不藏；outer（手边有东西）在这一页没有别的宿主，to 留空＝永不指路。
const CJ_NG = {
  clear:     { label: '没被什么占着', to: '' },
  outer:     { label: '手边有东西',   to: '' },
  taMood:    { label: '那边的情绪',   to: '情绪感知 TA 那一组' },
  taState:   { label: '那边的事情',   to: '此刻那一格' },
  yourState: { label: '你这头的事',   to: '情绪感知你那一组' }
};
const CJ_NG_ORDER = ['clear', 'outer', 'taMood', 'taState', 'yourState'];
const CJ_NG_W = { clear: 42, outer: 15, taMood: 15, taState: 14, yourState: 14 };
const CJ_NG_MIN_MIN = 30, CJ_NG_MAX_MIN = 90;   // 这条钟自己的区间（分钟）：比撒娇稀疏、比心动稠
// TA 读你七档（2026-10-06 起不再单列一张卡：只按档从「读到的你」抽一句台词，印在情绪卡「你」那一行下面）：
// TA 看不见你，这份判断纯属它单方面觉得的，故与情绪／撒娇同族＝独立随机漂移，
// 不从你的真实消息派生（那件事归连接感知）；steady 是这一表里的中性一档、常驻不藏，
// 但它的说明不写「中性档」三个字——那四个字整页只留给情绪感知卡那一枚（2026-10-05 用户判两张卡撞词）
const CJ_READ = {
  bright: { label: '有劲',       desc: '状态不错，说话有精神' },
  steady: { label: '跟平时一样', desc: 'TA 没读出什么异样' },
  tired:  { label: '有点累',     desc: '像是没睡够' },
  raw:    { label: '有点烦',     desc: '不太想绕' },
  needy:  { label: '想说话',     desc: '像是憋着话，想找 TA' },
  quiet:  { label: '想静静',     desc: '有点往后收，但不是躲' },
  unk:    { label: '读不出',     desc: 'TA 够不着你的那一段时间' }
};
const CJ_READ_W = { bright: 11, steady: 24, tired: 14, raw: 12, needy: 13, quiet: 12, unk: 14 };
// 连接感知五档（强→弱）：全部由 cjConnOf() 现算的真实通信量判出，量不出时不给档
const CJ_CONN_LEVELS = [
  { k: 'hot',     label: '热线',   desc: '你一句我一句，接得住' },
  { k: 'smooth',  label: '通畅',   desc: '你发一句，TA 接得住' },
  { k: 'normal',  label: '平常',   desc: '有来有回，只是这一句还没接' },
  { k: 'slow',    label: '慢半拍', desc: 'TA 会回，只是这轮隔得比平时久' },
  { k: 'oneWay',  label: '单向',   desc: '这一阵只有一边在说' }
];
const CJ_SHICHEN_START = [23, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21];
const CJ_SENSE_HIT = ['可以感觉到一点熟悉的气息。', '呼吸忽然静了半拍——是那种熟悉的存在感。', '空气好像暖了一下。', '很轻的一点动静，像是谁路过了这个时刻。', '风停了一下，像是有人在看你。'];
const CJ_SENSE_MISS = ['没有感觉到谁。', '周围很安静，安静得像隔着很远。', '什么都没有，只有时间在走。'];
// 这一页的分组 tag：一屏只出一组（卡片用 data-cj-group 认领所属组，隐藏由 css/cjian.css 那条属性选择器做）
const CJ_TABS = [
  { k: 'state', name: '状态', cards: ['now', 'conn', 'mood'] },
  { k: 'world', name: '世界', cards: ['time', 'today'] },
  { k: 'log',   name: '记录', cards: ['moodstrip', 'hist'] }
];
const CJ_TAB_KEY = 'ordinal-cjian-tab';
let _cjTab = 'state';
try { const _tv = localStorage.getItem(CJ_TAB_KEY); if (CJ_TABS.some(t => t.k === _tv)) _cjTab = _tv; } catch (e) {}

let _cjSel = '';          // 面板当前选中的联系人
let _cjLastApproach = 0;  // 靠近事件全局冷却
let _cjPerceiveCd = 0;    // 感知按钮冷却
let _cjEvCd = 0;          // 事件钩子全局冷却（_cjEvent）

function _cjPad(n) { return (n < 10 ? '0' : '') + n; }
function _cjRi(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
function _cjShichenAt(hour) { return Math.floor(((hour + 1) % 24) / 2); }
function _cjEsc(v) { return escapeHTML(String(v == null ? '' : v)); }
function _cjRoot() { if (!data.cjian || typeof data.cjian !== 'object') data.cjian = { enabled: true, moodOn: true, sgOn: true, by: {} }; if (!data.cjian.by || typeof data.cjian.by !== 'object') data.cjian.by = {}; return data.cjian; }
function _cjContact(cid) { return (data.contacts || []).find(x => x.id === cid) || null; }
// 世界感知投进会话的消息统一打 src:'cjian'（消息已有 taAsk/game/asBadge 这类结构化标记的先例）。
// 渲染侧 render.js 据此出签；以后别家（信箱/心愿）要加来源，是加一个 src 值而不是又一套类名。
// 口径：**九处投递一律挂**——含体感与 TA读你那两句读起来像即时反应的。用户原话是「不知道是因为这个
// 功能发的」，若一部分不挂，用户学到的规则会变成「有时候有签有时候没有」，比全挂更难懂。
// 这枚签自此没有开关（面板里那格勾选框 2026-10-08 整族下线，BUGS #190）：src 落库与渲染都无条件。
// 第三枚形参＝这一句出自哪一行功能（status/mood/read/soft/beat/und/ng/pres/act/sky/feel/dream/flash/ask）。
// 消息上只存线键、不存文案：改一次措辞不打断旧消息（#156 的 m.call 同一条手法），渲染侧按 CJ_LINE_LABEL 现取。
// 不传＝按「世界感知」这一页出签（旧消息与家 outside 的调用都走这一条，不替它们猜是哪条线）
function _cjDeliver(msg, cid, line) {
  msg.src = 'cjian';
  if (line) msg.cjLine = line;
  return _deliverToChat(msg, cid);
}
// 世界感知只面向单聊（群聊没有唯一的「TA」）：胶囊不列、不选、聊天页小字不显示、感知一下不响应
function _cjSingles() { return (data.contacts || []).filter(x => x.kind !== 'group'); }
function _cjIsGroup(cid) { const c = _cjContact(cid); return !!c && c.kind === 'group'; }
// 这一本的时间流：建档那一刻抽一次就存死，之后不再重掷（重掷＝她的时刻每次冷启动都跳一大截）
// 刻意不抽到 0：0 是「与现实同步」，两位都同步就又变回同一个数，正是这次要修的那件事
function _cjRollOffset() {
  let v = _cjRi(10, 540) * (Math.random() < 0.5 ? -1 : 1);
  if (v % 60 === 0) v += 17;   // 落在整点上就挪一分，免得读成「和另一位一模一样」
  return v;
}
// 懒建：首次访问某联系人的世界感知即建档
function _cjEntry(cid) {
  const root = _cjRoot();
  const now = Date.now();
  if (!root.by[cid] || typeof root.by[cid] !== 'object') {
    const mo0 = _cjMoodRoll();
    const say0 = _cjMoodSay(mo0[0]);
    const mr0 = _cjMoodRoll();                  // 「TA 读到的你」那一行也是两枚，与上面同一条规矩、各掷各的
    const rd0 = _cjPickWeighted(CJ_READ_W);
    const rdSay0 = _cjReadSay(rd0);
    root.by[cid] = { offsetMin: _cjRollOffset(), world: { hh: 0, mm: 0, last: 0, next: 0 },
      p: 'nearby', sinceP: now, cdP: _cjRi(20, 45) * 60000,
      a: 'free', sinceA: now, cdA: _cjRi(8, 25) * 60000,
      status: '', sinceS: now, cdS: _cjRi(30, 90) * 60000, hist: [],
      mo: mo0[0], mo2: mo0[1], sinceMo: now, cdMo: _cjRi(25, 70) * 60000, moSay: say0, moSayTs: say0 ? now : 0,
      sg: _cjPickWeighted(CJ_SG_W), sinceSg: now, cdSg: _cjRi(15, 40) * 60000,
      rd: rd0, sinceRd: now, cdRd: _cjRi(25, 70) * 60000, rdSay: rdSay0, rdSayTs: rdSay0 ? now : 0,
      moRead: mr0[0], moRead2: mr0[1], sinceMoRead: now, cdMoRead: _cjRi(45, 110) * 60000,
      bt: _cjPickWeighted(CJ_BT_W), btRead: _cjPickWeighted(CJ_BT_W), sinceBt: now, cdBt: _cjRi(CJ_BT_MIN_MIN, CJ_BT_MAX_MIN) * 60000,
      un: _cjPickWeighted(CJ_UND_W), unYou: _cjPickWeighted(CJ_UND_W), sinceUn: now, cdUn: _cjRi(CJ_UND_MIN_MIN, CJ_UND_MAX_MIN) * 60000,
      ng: _cjPickWeighted(CJ_NG_W), sinceNg: now, cdNg: _cjRi(CJ_NG_MIN_MIN, CJ_NG_MAX_MIN) * 60000,
      // 统一投递钟：sayNext＝这一条钟下一次开口的时刻（0＝还没摊过起点，首轮只摊不投）；
      // spoken＝最近说过的句子（同一条钟不把同一句说第二遍）
      sayNext: 0, spoken: [],
      weather: null };
  }
  const en = root.by[cid];
  // 旧档补这一格：#190 那段窗口里连旧档的 offsetMin 一起删过，不补就永远抽不到自己的时间流。
  // 0 同样按「还没抽过」处理——抽过的人不可能抽到 0，留着它只会让两位共用一个数
  if (typeof en.offsetMin !== 'number' || !en.offsetMin) { en.offsetMin = _cjRollOffset(); save(); }
  return en;
}
// 这一位此刻的活动档名——「TA 在做什么」这件事的唯一读侧（BUGS #290 起有两位消费者：
// 主动发送的间隔倍率 ∶ 已读不回的概率倍率，两处各引一张表、共用这一处取档，不留第二份读档口径）。
// 读侧刻意不建档：那会让「你从没打开过的那位」凭空多出一份世界感知数据；建档统一交给 _cjEntry／_cjEnsureAll 一处摊。
function _cjActOf(cid) {
  const by = data.cjian && data.cjian.by;
  const en = by ? by[cid] : null;
  return (en && en.a && CJ_ACTIVITY[en.a]) ? en.a : '';
}
// 这一位此刻的活动对「主动找你」间隔的倍率——消费方只有 js/chat.js 的 nextActiveDelay。
// 两种情况一律回 1＝此刻不表态：这一族被关掉／档名读不到（没建档与 unknown 都在其中）。
// bh 由调用方递进来（chat.js 手里就有那一份档），不在这里第二次去取档＝不留第二个读档口径
function cjActivityMul(cid, bh) {
  if (bh && bh.asByState === false) return 1;
  const mul = CJ_ACTIVITY_MUL[_cjActOf(cid)];
  return (typeof mul === 'number' && mul > 0) ? mul : 1;
}
// 同一份档名对「已读不回」那一格概率的倍率（BUGS #290·2026-10-11 用户「已读不回也按状态调」）——
// 消费方只有 js/chat.js 的 _rnProbOf。开关是这一格自己的那一枚（rnByState），不与上面那族共用：
// 两件事各有各的闸，关掉「浮动间隔」不该把「浮动不回」一起关掉（AGENTS §6 那条「关了 A、B 还在」的错位）
function cjActivityNrMul(cid, bh) {
  if (bh && bh.rnByState === false) return 1;
  const mul = CJ_ACTIVITY_NR[_cjActOf(cid)];
  return (typeof mul === 'number' && mul > 0) ? mul : 1;
}
// 每位单聊联系人都得有一份档案，活动这条钟才会对他照漂（世界感知只面向单聊·#179，_cjSingles 已滤掉群）。
// 建档只走 _cjEntry 那一处，不在这里抄第二份形状；这条钟 30 秒一轮，新加的人下一跳就在册
function _cjEnsureAll() {
  const by = _cjRoot().by;
  _cjSingles().forEach(c => { if (c && c.id && !by[c.id]) _cjEntry(c.id); });
}

// ===== TA 那边的天气（世界感知扩展；信箱掷戳的雨雪加权也用它） =====
const CJ_WEATHER = { sunny: '晴', cloudy: '多云', rain: '雨', wind: '风', snow: '雪' };
// 这一本的时间流偏移：读侧唯一口径（脏值/缺键一律当 0＝与本地同刻，绝不抛也不 NaN）
function _cjOffsetMin(en) { const v = en && en.offsetMin; return (typeof v === 'number' && isFinite(v)) ? Math.max(-1440, Math.min(1440, Math.round(v))) : 0; }
function _cjWorldDate(en) { return new Date(Date.now() + _cjOffsetMin(en) * 60000); }   // TA 那边的此刻＝本地此刻加这一本自己的时间流偏移
function _cjDayKey(d) { return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
function _cjEnsureWeather(en) {
  const key = _cjDayKey(_cjWorldDate(en));
  if (!en.weather || en.weather.day !== key || !CJ_WEATHER[en.weather.k]) {
    const m = _cjWorldDate(en).getMonth();
    let pool = [['sunny', 38], ['cloudy', 26], ['rain', 20], ['wind', 12]];
    if (m >= 11 || m <= 1) pool = [['sunny', 34], ['cloudy', 24], ['snow', 20], ['wind', 14], ['rain', 4]];
    else if (m >= 6 && m <= 8) pool = [['sunny', 34], ['cloudy', 22], ['rain', 30], ['wind', 6]];
    const total = pool.reduce((s, x) => s + x[1], 0);
    let rr = Math.random() * total, k = 'sunny';
    for (const [kk, w] of pool) { rr -= w; if (rr < 0) { k = kk; break; } }
    en.weather = { k, day: key };
  }
  return en.weather.k;
}
// 天空景（设计稿 tools/mockup_cjian_page.html）：TA 世界的小时分四段墨色天带，css/cjian.css 按 data-dp 接
// （「夜里」这一档只有天空景与梦那两扇窗在用，都直接看 _cjDaypart／小时；2026-10-12 BUGS #313 起天色线不再按夜里开口，
//   原先那枚 `_cjIsNight` 的唯一读方就是被摘掉的「夜里说月亮」那一发＝留着一个没人读的判据等于给下一个改动当陷阱）
function _cjDaypart(h) { return h >= 21 || h < 5 ? 'night' : h < 8 ? 'dawn' : h < 17 ? 'day' : 'dusk'; }
function _cjWxSVG(k) {
  const P = {
    sunny: '<circle cx="12" cy="12" r="4.2"/><path d="M12 3.2v2.4M12 18.4v2.4M3.2 12h2.4M18.4 12h2.4M5.8 5.8l1.7 1.7M16.5 16.5l1.7 1.7M18.2 5.8l-1.7 1.7M7.5 16.5l-1.7 1.7"/>',
    cloudy: '<path d="M7 15a4.5 4.5 0 1 1 .9-8.9A5.5 5.5 0 0 1 18.6 8 3.5 3.5 0 0 1 18 15z"/>',
    rain: '<path d="M7 13a4.5 4.5 0 1 1 .9-8.9A5.5 5.5 0 0 1 18.6 6 3.5 3.5 0 0 1 18 13z"/><path d="M9 16l-1 2.6M13 16l-1 2.6M17 16l-1 2.6"/>',
    wind: '<path d="M3 9h9a2.6 2.6 0 1 0-2.6-2.6M3 14h13a2.8 2.8 0 1 1-2.8 2.8"/>',
    snow: '<path d="M7 13a4.5 4.5 0 1 1 .9-8.9A5.5 5.5 0 0 1 18.6 6 3.5 3.5 0 0 1 18 13z"/><path d="M9 17.5h.01M13 19.5h.01M16.5 17h.01M11 15.6h.01"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${P[k] || P.sunny}</svg>`;
}
// 睡着态的月牙角标（此刻卡活动标签里那枚，与天空景同族描线；不用 emoji 当 UI）
const CJ_MOON_TAG_SVG = '<svg class="cj-tag-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/></svg>';
// 汇总某会话 TA 世界的天色（信箱掷戳的雨雪加权∶册页「预告下一枚」∶心愿促成三处共用）：只报天气键与天气名。
// 月相 2026-10-11 下线（BUGS #278），「夜里」那格 2026-10-12 一起撤（BUGS #313）＝这一枚读数再没有第三个消费者，
// 多报一个键就是给下一个接手的人留一个「看着有值其实没人读」的洞（#110 那条「同一个数不在两处说」同一族）。
function cjSkyFor(cid) {
  try {
    const en = _cjEntry(cid);
    if (!en) return null;
    const w = _cjEnsureWeather(en);
    return { weather: w, weatherName: CJ_WEATHER[w] };
  } catch (e) { return null; }
}
// 天色那句台词：只按当天真实天气取词（雨∶雪∶风），取不到整池凑一句也不编——这一族从此没有「月亮」可说
function _cjRemarkPick(weather) {
  const g = (data.groups || []).find(x => (x.name || '') === '天气的话' && (x.category || '主字卡') === 'TA心里话' && !x.off);
  const cards = ((g && g.cards) || []).filter(c => typeof c === 'string' && c.trim() && !voiceCardParts(c) && !cardIsOff(g, c));
  if (!cards.length) return '';
  const re = weather === 'rain' ? /雨/ : weather === 'snow' ? /雪/ : /风/;
  const hit = cards.filter(c => re.test(c));
  const pool = hit.length ? hit : cards;
  return pool[Math.floor(Math.random() * pool.length)].trim();
}
function _cjHist(cid, e) {
  const en = _cjEntry(cid);
  if (!Array.isArray(en.hist)) en.hist = [];
  en.hist.push(e);
  if (en.hist.length > 80) en.hist.splice(0, en.hist.length - 80);
}
function _cjStatusPool() {
  const g = (data.groups || []).find(x => (x.name || '') === '状态签名' && (x.category || '主字卡') === 'TA心里话' && !x.off);
  return ((g && g.cards) || []).filter(c => typeof c === 'string' && c.trim() && !voiceCardParts(c) && !cardIsOff(g, c));
}
// 一池台词里「档名：」前缀对得上的那几条中抽一句——这一页所有会开口的线共用这一个出口（不留六份实现）。
// 该档没有对应句子就返回空：宁可这条线这一轮不开口，也不拿别档的话冒充；整组删掉＝这条线从此只亮档名
function _cjPoolSay(name, label) {
  if (!label) return '';
  const g = (data.groups || []).find(x => (x.name || '') === name && (x.category || '主字卡') === 'TA心里话' && !x.off);
  const pre = label + '：';
  const hit = ((g && g.cards) || []).filter(c => typeof c === 'string' && c.trim().startsWith(pre) && !voiceCardParts(c) && !cardIsOff(g, c));
  if (!hit.length) return '';
  return hit[Math.floor(Math.random() * hit.length)].trim().slice(pre.length).trim();
}
// 情绪自述：只从【TA心里话·情绪的话】里「档名：」前缀对得上的那几条抽
function _cjMoodSay(key) { return _cjPoolSay('情绪的话', (CJ_MOODS[key] || {}).label || ''); }
// 「TA 读你」的台词：只从【TA心里话·读到的你】里「档名：」前缀对得上的那几条抽
function _cjReadSay(key) { return _cjPoolSay('读到的你', (CJ_READ[key] || {}).label || ''); }
// 情绪感知卡＝两组归主，一屏只有两个主语（2026-10-06 用户判「UI 混在一起，看不懂说的对象是我还是联系人」）：
// 上组「TA」＝TA 自己的心情（档名·自述·语气·心动全收在这组里），下组「你」＝TA 读到的你的心情（档名·那句台词·心动收在这组里）。
// 之前是「按数据种类排」：档名大字、两行胶囊、两句台词、语气行各成一段，于是两句都用第一人称「我」的台词
// 被一行「TA 语气」隔开交错排列，主语只躺在落款里——读的人得先撞上「我」再回头找是谁。
// 两行胶囊仍同表·同序·同尺寸（CJ_MOODS），每行各亮一到两枚（主＝.on，次＝.sub）；
// 撞上＝两行的**主档**落在同一列，上下各挂一枚墨点，只标一下不出声（次档永不带那枚点，见下面那行注释）。
// 顶栏那枚 26px 大字撤掉：它和「TA」那一行亮的是同一个数，说两遍且它自己没有主语（那句「xx 起」随之一起去，
// 它与自述落款同刻＝同一件事在两处）。两行各由自己的随机钟供值，永远有档、不会空着。
// 2026-10-08 二批·收成一行（用户「语义重复，你帮我收吧」）：语气／心动／接住 原本各占一行，一张卡里三行同族
// 小字连排，而 TA 组那两行的值还常常一模一样（「有一点」∶「有一点」）＝同一件事像说了三遍。现在一组只有一行，
// 键上不再各带「TA」前缀——主语由段头那行「TA · TA 自己的心情」说一次（一件事只说一次）；三族档名两两不重合
// 由探针 H9 钉住，否则并到一行就是三枚同词。墨点改成不占位：占位版一撞档那两枚点就把这一行顶到第二行
// （实测需宽 313 ∶ 可用 298），而「对上」恰恰是最该好看的那一态。
function _cjMoodPair(en) {
  const root = _cjRoot();
  const ta = CJ_MOODS[en.mo] ? en.mo : 'calm';
  const you = CJ_MOODS[en.moRead] ? en.moRead : 'calm';
  const ta2 = _cjMood2(ta, en.mo2), you2 = _cjMood2(you, en.moRead2);
  const clash = ta === you;
  const onCls = clash ? 'on same' : 'on';
  // 次档只多一个 .sub，且**永不**带 .same：那枚墨点说的是「两行主档撞上」，一枚记号不能同时说两件事
  const row = (k, k2) => CJ_MOOD_ORDER.map(x => `<span${x === k ? ` class="${onCls}"` : (x === k2 ? ' class="sub"' : '')}>${CJ_MOODS[x].label}</span>`).join('');
  const say = (txt, at) => !txt ? '' : `<div class="cj-mood-say">${_cjEsc(txt)}</div><div class="cj-mood-say-at">${at}</div>`;
  // 心动与接住各自一条钟一次抽两枚，所以「撞上」判定就是「这两枚同档」——记号仍是一枚墨点（与上面两行胶囊
  // 同款），不写「同频」「双向奔赴」那句话；中性档照旧常驻
  const beatClash = (CJ_BT[en.bt] ? en.bt : 'flat') === (CJ_BT[en.btRead] ? en.btRead : 'flat');
  const unClash = (CJ_UND[en.un] ? en.un : 'flat') === (CJ_UND[en.unYou] ? en.unYou : 'flat');
  const mark = (k, v, same) => `<span class="cj-mark"><span class="cj-mark-k">${k}</span><span class="cj-mark-v${same ? ' same' : ''}">${_cjEsc(v)}</span></span>`;
  const btOf = k => CJ_BT[CJ_BT[k] ? k : 'flat'].label;
  const unOf = k => CJ_UND[CJ_UND[k] ? k : 'flat'].label;
  // 每一枚只管自己那一族的开关：关掉一族＝那一枚不在、其余照旧（不是整行消失，也不牵连同一行的兄弟）
  const marks = list => list.length ? `<div class="cj-marks">${list.join('')}</div>` : '';
  const taMarks = marks([
    root.sgOn === false ? '' : mark('语气', CJ_SG[CJ_SG[en.sg] ? en.sg : 'flat'].label, false),
    root.btOn === false ? '' : mark('心动', btOf(en.bt), beatClash),
    root.undOn === false ? '' : mark('说明白', unOf(en.un), unClash)
  ].filter(Boolean));
  const youMarks = marks([
    root.btOn === false ? '' : mark('读到的心动', btOf(en.btRead), beatClash),
    root.undOn === false ? '' : mark('接住', unOf(en.unYou), unClash)
  ].filter(Boolean));
  return `<div class="cj-read-pair">
      <div class="cj-read-line">
        <div class="cj-read-hd"><span class="cj-read-who">TA</span><span class="cj-read-note">TA 自己的心情</span></div>
        <div class="cj-moods cj-moods-ta">${row(ta, ta2)}</div>
        ${say(en.moSay, `TA 自述 · ${_cjEsc(_cjClock(en.moSayTs))}`)}
        ${taMarks}
      </div>
      <div class="cj-read-line">
        <div class="cj-read-hd"><span class="cj-read-who">你</span><span class="cj-read-note">TA 读到的你的心情</span></div>
        <div class="cj-moods cj-moods-read">${row(you, you2)}</div>
        ${root.readOn === false ? '' : say(en.rdSay, `TA 读你时说的 · ${_cjEsc(_cjClock(en.rdSayTs))}`)}
        ${youMarks}
      </div>
    </div>`;
}
function _cjGroupCards(name) {
  const g = (data.groups || []).find(x => (x.name || '') === name && (x.category || '主字卡') === 'TA心里话' && !x.off);
  return ((g && g.cards) || []).filter(c => typeof c === 'string' && c.trim() && !voiceCardParts(c) && !cardIsOff(g, c)).map(c => c.trim());
}
function _cjGroupText(name, filterRe) {
  const cards = _cjGroupCards(name);
  const hit = filterRe ? cards.filter(c => filterRe.test(c)) : cards;
  return hit.length ? hit[Math.floor(Math.random() * hit.length)] : '';
}

// ===== 回忆闪回 / TA 的梦 / 里程碑 / TA 想问你（挂在 cjianTick 末尾，全局每 30s 判定一次）=====
// 心愿已升格为独立功能（js/wish.js 的 wishTick），本函数不再负责许愿与回响
// 闪回：1%/tick、每日至多 1 次、全局冷却 4h；素材=TA 3 天前的旧话（50%）或 TA 3 天前收藏的你的话（50%）
// 闪回素材按会话取（旧写法两处写死 c0＝别人那本里的旧话永远翻不出来，而投过去的又是 c0 那一本）
const CJ_FLASH_MIN_AGE = 3 * 86400000;
function _cjOldOwnLine(cid) {
  const ch = data.chats && data.chats[cid];
  const msgs = (ch && Array.isArray(ch.msgs)) ? ch.msgs : [];
  const cutoff = Date.now() - CJ_FLASH_MIN_AGE;
  const pool = [];
  for (const m of msgs) {
    if (!m || m.from !== 'partner' || !m.text || m.text === '[表情包]' || m.sticker) continue;
    if (m.recalled || m.sentAgain) continue;
    const t = new Date(`${m.date || ''} ${m.time || ''}`).getTime();
    if (isFinite(t) && t < cutoff) pool.push(m.text);
  }
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : '';
}
function _cjOldCollectedLine(cid) {
  try {
    const list = JSON.parse(localStorage.getItem('collect-msgs:' + cid) || '[]');
    const cutoff = Date.now() - CJ_FLASH_MIN_AGE;
    const pool = list.filter(x => x && x.by === 'ta' && (x.kind || 'msg') === 'msg' && x.text && x.text !== '[表情包]' && typeof x.ts === 'number' && x.ts < cutoff);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)].text : '';
  } catch (e) { return ''; }
}
// 里程碑档位：取「已达的最高一档」。findIndex 取的是第一个满足项，句数只要 ≥100 就恒停在 100 那一档
function _cjMileTop(tiers, v) {
  let i = -1;
  for (let k = 0; k < tiers.length; k++) if (v >= tiers[k]) i = k;
  return i;
}
// 里程碑话术里出现过的具体数（句数档与天数档共用一张表）
const CJ_MILE_NUM = [[7, /七天|7天/], [30, /三十天|30天/], [100, /一百|100/], [365, /三百六十五|365/], [500, /五百|500/], [1000, /一千|1000/], [2000, /两千|二千|2000/], [5000, /五千|5000/]];
// 这一档能配哪句：①说的是另一族的不算（句数档不冒天数句）；②句子里报的数不是正好这一档的不算
//（第一百句那一档不许说「第一千句」，第一千句那一档也不必回头说「数到一百句」）
function _cjMileText(kind, tier) {
  const isMsg = kind === 'm';
  const hit = _cjGroupCards('里程碑').filter(s => {
    const saysMsg = /句/.test(s), saysDay = /天|日子/.test(s);
    if (isMsg ? (saysDay && !saysMsg) : (saysMsg && !saysDay)) return false;
    return !CJ_MILE_NUM.some(x => x[0] !== tier && x[1].test(s));
  });
  return hit.length ? hit[Math.floor(Math.random() * hit.length)] : '';
}
// ===== 统一投递：这一页所有「TA 自己那一侧」的读数共用一条随机钟 =====
// 之前是同一件事六种口径：读你换档时 22%、天气（旧名「月与天气」）6%/tick、体感挂在靠近事件 40%、闪回 1%/tick、
// 梦 1.5%/tick、问卡 1.2%/tick——每枚都是钉死的概率，还各带一枚「当日一次／每世界日一次／小时冷却」的硬额度；
// 于是屏上看着像六件不相干的功能，而两条线撞在同一轮里就可能各说一句。收成一条钟：
// 到点从「此刻真有词可说」的线里挑一条发出去，说完立刻把下一格排回这条钟自己区间里的未来时刻。
// 三条规矩：①没有「每天最多几条」这类封顶，也没有「超过多久就不算了」的一刀切；
// ②说过的句子记账（最近 CJ_SAY_MEMORY 条），同一句不会被说第二遍；
// ③某一轮候选全说过了＝这一轮静默、照旧排下一次，不硬凑一句、也不攒着欠账。
// 保持不开口的四条，理由各不相同，都写在取词处与下面这张表的注释里：
//   · 连接感知＝真实通信现算的读数，屏上没有一句是 TA 说过的话，发出去就是替它编一句它没有依据的（#114 同一条铁律）
//   · moRead「TA 读到的你的心情」与 btRead「读到的心动」＝借的正是情绪／心动那两张表，替它们另配一池＝同一件事两处各一套词
//   · unYou「接住」那一枚＝TA 给用户的成绩打分，从它嘴里说出「你没接住我这句」是指责向，与 CJ_UND 表自己那句
//     「最重两档也不指责任何一方」相冲；它在屏上亮着就是它的表达方式
const CJ_SAY_MIN_MIN = 180, CJ_SAY_MAX_MIN = 480;   // 这条钟自己的区间（分钟）＝3~8 小时，按会话各存一格
const CJ_SAY_MEMORY = 10;                            // 说过的句子记住最近这么多条
// 「TA 想问你」那张单选卡要等你回答，屏上还挂着一张没答完的就不再掏第二张
function _cjAskWaiting(cid) {
  const ch = data.chats && data.chats[cid];
  const msgs = (ch && Array.isArray(ch.msgs)) ? ch.msgs : [];
  return msgs.some(m => m && m.taAsk && m.taAsk.status === 'waiting');
}
// 此刻有资格开口的线：每一项＝{ line, text }，取不到词的那一项根本不进池（不留空串占位，也不拿别档的话凑）
function _cjSayCandidates(cid, en) {
  const r = _cjRoot(), out = [];
  const add = (line, text, extra) => { if (text) out.push(Object.assign({ line, text }, extra || {})); };
  // 三条「换档那一刻算死存好」的线在【开口这一刻】现抽（BUGS #312）：它们存的时候各自跟着自己的钟
  // （签名 30~90 分／情绪 25~70 分／读你 25~70 分），而投递钟 3~8 小时才走一格、活动钟 8~25 分就漂一次——
  // 按区间常数仿真 400 天＝到点那一刻 61% 说的是「几小时前那一档」的话（tools/_sim_stale_say.mjs，
  // 用户报的「TA 醒了还给我说梦话」就是这一发）。现抽＝说的一定是此刻这一档；
  // 面板上那三行仍读存好的现值（每次 render 现抽会让签名每 30 秒抖一次，且 #189 那条「不替 TA 改口」在面板上仍成立）。
  const sayStatus = _cjPickStatus(en);
  if (sayStatus) add('status', sayStatus);
  if (r.moodOn !== false) add('mood', _cjMoodSay(CJ_MOODS[en.mo] ? en.mo : 'calm'));
  if (r.readOn !== false) add('read', _cjReadSay(CJ_READ[en.rd] ? en.rd : 'unk'));
  // 其余五条线：档名现读，按当前那一档去自己那一池取词
  if (r.sgOn !== false) add('soft', _cjPoolSay('示软的话', CJ_SG[CJ_SG[en.sg] ? en.sg : 'flat'].label));
  if (r.btOn !== false) add('beat', _cjPoolSay('心动的话', CJ_BT[CJ_BT[en.bt] ? en.bt : 'flat'].label));
  if (r.undOn !== false) add('und', _cjPoolSay('说明白的话', CJ_UND[CJ_UND[en.un] ? en.un : 'flat'].label));
  if (r.ngOn !== false) add('ng', _cjPoolSay('干扰的话', CJ_NG[CJ_NG[en.ng] ? en.ng : 'clear'].label));
  add('pres', _cjPoolSay('距离的话', CJ_PRESENCE[CJ_PRESENCE[en.p] ? en.p : 'nearby'].label));
  add('act', _cjPoolSay('此刻在做的话', CJ_ACTIVITY[CJ_ACTIVITY[en.a] ? en.a : 'free'].label));
  // 体感（两个世界「能摸到」的那一句）：旧写法只在靠近事件那一刻掷 40%，屏上多数时候根本没这个时刻
  add('feel', _cjGroupText('体感'), { histK: 'f' });
  // 天色：只有真的下雨∶下雪∶起风才算数（旧写法多一条「夜里就可以说一句月亮」，2026-10-12 BUGS #313 摘净＝
  // 月相下线后「夜里」这个前提撑不起一句话，屏上那枚签也因此从「月与天气」收成「天气」，名字与内容对上）
  const wk = _cjEnsureWeather(en);
  if (wk === 'rain' || wk === 'snow' || wk === 'wind') add('sky', _cjRemarkPick(wk));
  // 梦：只在清晨那一窗有资格（梦是醒过来才说的事），窗内它一直可挑，不再自己掷 1.5%、也不再当日一次
  const hr = new Date().getHours();
  if (hr >= 5 && hr < 11) add('dream', _cjGroupText('梦境'), { histK: 'd' });
  // 回忆闪回：得真翻得出三天前的旧话才有资格；引子先落地、旧话随后（那一组的现成节奏不动）
  if (data.flashOn !== false) {
    const old = Math.random() < 0.5 ? _cjOldOwnLine(cid) : _cjOldCollectedLine(cid);
    const intro = old ? _cjGroupText('回忆引子', /收藏/.test(old) ? /收藏/ : null) : '';
    if (old && intro) add('flash', intro, { follow: old });
  }
  // TA 想问你：单选卡（题面进 text、选项进 taAsk 结构化字段，点击委托在本文件末尾）
  if (data.taAskOn !== false && !_cjAskWaiting(cid)) {
    const parts = String(_cjGroupText('TA的问题') || '').split('||');
    const q = String(parts[0] || '').trim();
    const opts = String(parts[1] || '').split('|').map(s => s.trim()).filter(Boolean).slice(0, 4);
    if (q && opts.length >= 2) add('ask', q, { card: { opts, status: 'waiting' } });
  }
  return out;
}
// 到点挑一条说出去；首轮只摊起点、不投递（老档升级／导入旧档那一下不该当场喷一条）
// 返回 true＝这条钟动过（要么摊了起点、要么掷完排好下一格），调用处据此写盘
function _cjSayTick(cid, en, now) {
  const next = typeof en.sayNext === 'number' && isFinite(en.sayNext) ? en.sayNext : 0;
  if (!next) { en.sayNext = now + _cjRi(CJ_SAY_MIN_MIN, CJ_SAY_MAX_MIN) * 60000; return true; }
  if (now < next) return false;
  const spoken = Array.isArray(en.spoken) ? en.spoken : (en.spoken = []);
  const pool = _cjSayCandidates(cid, en).filter(c => !spoken.includes(c.text) && !(c.follow && spoken.includes(c.follow)));
  // 掷前先把下一格推回未来＝同一位不会被相邻两轮 tick 各掷一次（#135 同一课）
  en.sayNext = now + _cjRi(CJ_SAY_MIN_MIN, CJ_SAY_MAX_MIN) * 60000;
  const pick = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  if (!pick) return true;   // 这一轮无话可说：静默，下一格照旧排着，不硬凑也不攒账
  const msg = { id: nextId(), from: 'partner', text: pick.text, unread: true };
  if (pick.card) msg.taAsk = pick.card;
  _cjDeliver(msg, cid, pick.line);
  if (pick.histK) _cjHist(cid, { k: pick.histK, t: pick.text, ts: now });
  spoken.push(pick.text);
  if (pick.follow) {
    spoken.push(pick.follow);
    setTimeout(() => { try { _cjDeliver({ id: nextId(), from: 'partner', text: pick.follow, unread: true }, cid, pick.line); } catch (e) {} }, 2200 + Math.random() * 2500);
  }
  if (spoken.length > CJ_SAY_MEMORY) spoken.splice(0, spoken.length - CJ_SAY_MEMORY);
  return true;
}
function cjMemoryTick() {
  if (typeof _cjDeliver !== 'function' || typeof _deliverToChat !== 'function') return;
  const now = Date.now();
  // ⑥ 里程碑：累计句数/相伴天数越过阈值，TA 主动说一句（每档只过一次）；进世界感知历史标「碑」。
  // 这一条刻意不进上面那张候选表：它是「越过去那一刻」的事件，等下一条钟到点再说就成了迟到的话
  let totalMsgs = 0, firstTs = 0;
  for (const cid of Object.keys(data.chats || {})) {
    const ms = (data.chats[cid] && Array.isArray(data.chats[cid].msgs)) ? data.chats[cid].msgs : [];
    totalMsgs += ms.length;
    for (const m of ms) {
      if (!m || m.from === 'system') continue;
      const t = new Date(`${m.date || ''} ${m.time || ''}`).getTime();
      if (isFinite(t) && (!firstTs || t < firstTs)) firstTs = t;
    }
  }
  const days = firstTs ? Math.floor((now - firstTs) / 86400000) : 0;
  const MSG_MILE = [100, 500, 1000, 2000, 5000], DAY_MILE = [7, 30, 100, 365];
  // 旧实现的账把 0 同时当初始值和「100 档已报」用，两种存档分不清：老账按当前读数重算一次——
  // 已达的档视为已报（不补历史也不重播），没达过的留 -1，到点才报。新档不走这条，白纸一张欠着就报。
  if (!data._mile) data._mile = { v: 2, m: -1, d: -1 };
  else if (data._mile.v !== 2) data._mile = { v: 2, m: _cjMileTop(MSG_MILE, totalMsgs), d: _cjMileTop(DAY_MILE, days) };
  const mIdx = _cjMileTop(MSG_MILE, totalMsgs), dIdx = _cjMileTop(DAY_MILE, days);
  const mileNewM = mIdx > data._mile.m, mileNewD = dIdx > data._mile.d;
  // 先掷那一发、说出去了才记账：反过来写，30% 落空的那一档就永远补不回来（账已记，下轮不再试）
  if ((mileNewM || mileNewD) && Math.random() < 0.7) {
    // 一轮只说一句：句数优先，天数那一档跟着一起认账，不留到下一轮再补一句
    const mileKind = mileNewM ? 'm' : 'd';
    const mileTier = mileKind === 'm' ? MSG_MILE[mIdx] : DAY_MILE[dIdx];
    const card = _cjMileText(mileKind, mileTier);
    if (card) {
      if (mileNewM) data._mile.m = mIdx;
      if (mileNewD) data._mile.d = dIdx;
      _cjHist('c0', { k: 'b', t: card, ts: now });
      _cjDeliver({ id: nextId(), from: 'partner', text: card, unread: true }, 'c0', 'mile');
      showToast(mileKind === 'm' ? '你们的第 ' + mileTier + ' 句' : '你们在一起第 ' + mileTier + ' 天');
      save();
    }
  }
  // ⑦「TA 想问你」与⑤「梦」⑧「回忆闪回」2026-10-08 一起搬进上面那张候选表（同一口钟·同一条节奏），
  // 各自的「每日一次＋小时冷却＋钉死的 1.2%/1.5%/1%」三枚硬额度随之删净；你选完 TA 从「TA的回答」回一句那条委托在本文件末尾，未动
}
function _cjPickStatus(en) {
  const pool = _cjStatusPool();
  if (!pool.length) return '';
  let cards = pool;
  // 天气偏向：雨天多说「在听雨声」，雪天、风天各挑各的那批句子
  if (en) {
    const wk = _cjEnsureWeather(en);
    const bias = wk === 'rain' ? /雨/ : wk === 'snow' ? /雪/ : wk === 'wind' ? /风/ : null;
    if (bias) { const hit = pool.filter(c => bias.test(c)); if (hit.length && Math.random() < 0.7) cards = hit; }
  }
  return cards[Math.floor(Math.random() * cards.length)].trim();
}

// ===== 世界时间 =====
function _cjWorldMinuteRaw(en) {
  const d = _cjWorldDate(en);
  return d.getHours() * 60 + d.getMinutes();
}
function _cjRollWorld(en, now) {
  const wm = _cjWorldMinuteRaw(en);
  const hh = Math.floor(wm / 60) % 24, mm = wm % 60;
  const idx = _cjShichenAt(hh);
  const stH = CJ_SHICHEN_START[idx];
  const mInto = hh * 60 + mm - stH * 60;
  const half = mInto < 60 ? CJ_SHICHEN[idx] + '初' : CJ_SHICHEN[idx] + '正';
  return { hh, mm, half, sh: CJ_SHICHEN[idx], last: now, next: 1 + Math.random() * 7 };
}
// 卡面上那句「这一本的时间流跟现实差多少」＝由存死的那格现算，每位各不相同（旧版是三档 chips 的标签，
// 入口撤掉后仍要有一句能解释「为什么她和别人不是一个时刻」，否则屏上只剩一个看不出由来的数）
function _cjOffsetLabel(en) {
  const off = _cjOffsetMin(en);
  if (!off) return '与现实同步';
  const a = Math.abs(off), hh = Math.floor(a / 60), mm = a % 60;
  return '比现实' + (off > 0 ? '快 ' : '慢 ') + (hh ? hh + ' 小时' : '') + (mm ? (hh ? ' ' : '') + mm + ' 分' : '');
}
// ===== 感知/活动 按小时段加权（mochi cjian 口径） =====
function _cjWorldHour(en) {
  const now = Date.now();
  if (!en.world || !en.world.last || en.world.last > now || (now - en.world.last) / 36e5 >= (en.world.next || 0)) en.world = _cjRollWorld(en, now);
  return en.world.hh;
}
function _cjPresenceWeights(wh) {
  if (wh >= 23 || wh < 5) return { near: 8, nearby: 18, far: 26, unfelt: 33, gone: 15 };
  if (wh < 9) return { near: 22, nearby: 30, far: 18, unfelt: 18, gone: 12 };
  if (wh < 17) return { near: 18, nearby: 30, far: 20, unfelt: 20, gone: 12 };
  if (wh < 22) return { near: 30, nearby: 32, far: 14, unfelt: 14, gone: 10 };
  return { near: 20, nearby: 26, far: 20, unfelt: 22, gone: 12 };
}
function _cjActivityWeights(wh) {
  if (wh >= 23 || wh < 6) return { free: 4, busy: 8, rushed: 4, rest: 12, sleep: 62, unknown: 10 };
  if (wh < 9) return { free: 28, busy: 24, rushed: 14, rest: 10, sleep: 14, unknown: 10 };
  if (wh < 12) return { free: 34, busy: 30, rushed: 18, rest: 2, sleep: 2, unknown: 14 };
  if (wh < 14) return { free: 32, busy: 26, rushed: 16, rest: 16, sleep: 2, unknown: 8 };
  if (wh < 18) return { free: 34, busy: 32, rushed: 18, rest: 4, sleep: 2, unknown: 10 };
  if (wh < 21) return { free: 36, busy: 26, rushed: 16, rest: 8, sleep: 4, unknown: 10 };
  return { free: 24, busy: 22, rushed: 14, rest: 18, sleep: 12, unknown: 10 };
}
function _cjPickWeighted(w) {
  const keys = Object.keys(w);
  const total = keys.reduce((s, k) => s + w[k], 0);
  let acc = 0, rr = Math.random() * total;
  for (const k of keys) { acc += w[k]; if (rr < acc) return k; }
  return keys[keys.length - 1];
}
// 惯性（2026-10-14）：把「当前档」的权重乘一个倍率再抽＝换档更黏，观感上不再是每半小时换一个人。
// 不按族维护转移表：小时段加权、事件偏置、事实反压三套机制天然叠在这一层之外
function _cjInertia(w, cur, stay) { const x = Object.assign({}, w); if (cur && x[cur] != null) x[cur] *= stay; return x; }
// 事件偏置（_cjEvent 写入的 en.evBias）：只管到期前的那几次重掷，过期当没有
function _cjBias(w, en, fam) {
  const b = en && en.evBias && en.evBias[fam];
  if (!b || Date.now() >= (en.evBiasUntil || 0)) return w;
  const x = Object.assign({}, w);
  for (const k in b) if (x[k] != null) x[k] = Math.max(0, x[k] * b[k]);
  return x;
}
function _cjRecentChatBoost(cid) {
  const ch = data.chats && data.chats[cid];
  const msgs = ch && Array.isArray(ch.msgs) ? ch.msgs : [];
  const last = msgs[msgs.length - 1];
  if (!last) return false;
  const t = new Date(`${last.date || ''} ${last.time || ''}`).getTime();
  return isFinite(t) && Date.now() - t < 30 * 60000;
}
// 事实反压的硬窗口：近 10 分钟双方各几句（比 _cjRecentChatBoost 的 30 分钟更「实」）。
// 从消息尾倒着扫、出了窗就 break；唯一消费方是「事实压虚构」那三处——虚构层永不回写事实
function _cjLiveTalk(cid) {
  const msgs = ((data.chats || {})[cid] || {}).msgs || [];
  const t0 = Date.now() - 600000;
  let n = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i], t = _cjTsOf(m);
    if (!m || (m.from !== 'me' && m.from !== 'partner')) continue;
    if (!t || t < t0) break;
    n++;
  }
  return n;
}
// 事件钩子（2026-10-14）：聊天侧三处真实事件（我方发出／TA 回话／已读不回）唯一的入口，
// 手法同 avlibFeed＝挂投递口不挂各功能。事件只写偏置、不换档不写史不弹话——
// 虚构层对「你做了什么」有反应，但屏上不因此多出一句台词（那件事仍归统一投递钟）
function _cjEvent(cid, kind) {
  if (!cid || typeof _cjEntry !== 'function') return;
  if (_cjRoot().enabled === false || _cjIsGroup(cid) || !_cjContact(cid)) return;
  const now = Date.now();
  if (now < (_cjEvCd || 0)) return;   // 全局冷却 90s：机关枪式连发不反复摇
  _cjEvCd = now + 90000;
  const en = _cjEntry(cid);
  if (kind === 'meSent') en.evBias = { a: { free: 2.2, rest: 0.4 }, p: { near: 1.6, nearby: 1.6 } };
  else if (kind === 'taReplied') en.evBias = { p: { near: 1.8, nearby: 1.8, gone: 0.3 } };
  else if (kind === 'nr') en.evBias = { a: { busy: 2, rest: 1.6 }, ng: { outer: 2.2, taState: 1.8 } };
  else return;
  en.evBiasUntil = now + 120000;
}
function _cjPredictPhrase(p, a) {
  if (a === 'sleep' || a === 'rest') return '可能在休息';
  if (a === 'unknown') return '此时尚不可知';
  if (p === 'near') return '可能就在身边';
  if (p === 'nearby') return a === 'free' ? '可能在附近' : '可能较忙';
  if (p === 'far') return '在远处';
  if (p === 'gone') return '离开中';
  return '可能感知不到';
}

// ===== 30s 调度：世界时刻重抽 / 活动 / 感知 / 状态 / 靠近事件 =====
function cjianTick() {
  _cjEnsureAll();   // 新加／合并进来的那位此刻起也有一条自己的时间流，不用等他先被谁打开
  const root = _cjRoot();
  const now = Date.now();
  let dirty = false;
  for (const cid of Object.keys(root.by)) {
    if (!_cjContact(cid)) { delete root.by[cid]; dirty = true; continue; }
    const en = root.by[cid];
    if (en.evBias && now >= (en.evBiasUntil || 0)) { delete en.evBias; delete en.evBiasUntil; }   // 过期偏置静默清掉，不为此单独存一次盘
    if (!en.world || typeof en.world.last !== 'number' || en.world.last > now || (now - en.world.last) / 36e5 >= (en.world.next || 0)) {
      en.world = _cjRollWorld(en, now); dirty = true;
    }
    // 靠近事件（⑥）：感知状态停了 2h 以上，低概率忽然靠近；可开关
    if (root.enabled && now - en.sinceP >= 120 * 60000 && now - _cjLastApproach >= 20 * 60000 && Math.random() < 0.004) {
      en.p = Math.random() < 0.1 ? 'near' : 'nearby';
      en.sinceP = now; en.cdP = _cjRi(20, 45) * 60000;
      _cjHist(cid, { k: 'n', t: '……好像有什么靠近了。', ts: now });
      _cjLastApproach = now;
      showToast('……好像有什么靠近了。');
      // 体感那一句 2026-10-08 从这里摘出：它原本是「靠近那一刻 40% 才发」，而那个时刻一天未必有一次，
      // 屏上大多数时候根本没有这一刻可以挂——现由下面那条统一投递钟接管（进候选表，仍记历史 k='f'）
      dirty = true;
    }
    if (now - en.sinceA >= en.cdA) {
      const oldA = en.a;
      const wA = _cjActivityWeights(_cjWorldHour(en));
      // 事实反压：近 10 分钟有双向来回＝红线正在聊，sleep 直接归零、rest 折到三成（事实压虚构，单向）
      if (_cjLiveTalk(cid) >= 2) { wA.sleep = 0; wA.rest *= 0.3; wA.free *= 1.5; }
      en.a = _cjPickWeighted(_cjBias(_cjInertia(wA, en.a, 2.2), en, 'a'));
      en.sinceA = now; en.cdA = _cjRi(8, 25) * 60000; dirty = true;
      // 档【真换了】才去叫聊天侧那一格——同档重掷不动节奏（否则每 8~25 分钟抖一次）。
      // 那一头是单向的「只拉回不推后」，理由与仿真读数写在 js/chat.js 的 _asPullIn 头上
      if (en.a !== oldA && typeof _asPullIn === 'function') _asPullIn(cid);
    }
    if (now - en.sinceP >= en.cdP) {
      const w = _cjPresenceWeights(_cjWorldHour(en));
      if (_cjRecentChatBoost(cid)) { w.near += 16; w.nearby += 16; w.far = Math.max(2, w.far - 8); w.unfelt = Math.max(2, w.unfelt - 8); w.gone = Math.max(2, w.gone - 6); }
      if (_cjLiveTalk(cid) >= 2) { w.near += 10; w.nearby += 10; }   // 事实反压：正聊着，距离不该往远处漂
      en.p = _cjPickWeighted(_cjBias(_cjInertia(w, en.p, 1.8), en, 'p')); en.sinceP = now; en.cdP = _cjRi(20, 45) * 60000; dirty = true;
    }
    if (now - en.sinceS >= en.cdS) {
      const t = _cjPickStatus(en);
      if (t && t !== en.status) { en.status = t; _cjHist(cid, { k: 's', t, ts: now }); }
      en.sinceS = now; en.cdS = _cjRi(30, 90) * 60000; dirty = true;
    }
    // 情绪感知（⑦）：另一条独立随机时钟，25-70 分钟掷一次；**一次掷一对**（主＋次），自述随主档那一刻现抽并算死存进记录
    // 这一维只给面板读，回复引擎与主动消息概率都不读它（用户定档：不生效，纯读数）
    // 存的那句＝面板那句；投递那一刻照旧按当前档另抽一次（BUGS #312，见 _cjSayCandidates 顶上那段）
    if (root.moodOn !== false && now - en.sinceMo >= en.cdMo) {
      const pair = _cjMoodRoll(CJ_MOODS[en.mo] ? en.mo : 'calm');   // 传当前主档＝情绪这条钟带惯性（TA 读你那条刻意不带）
      en.sinceMo = now; en.cdMo = _cjRi(25, 70) * 60000; dirty = true;
      const oldP = CJ_MOODS[en.mo] ? en.mo : 'calm', oldS = _cjMood2(oldP, en.mo2);
      const nk = CJ_MOODS[pair[0]] ? pair[0] : 'calm', nk2 = _cjMood2(nk, pair[1]);
      // 「换没换」按**这一对**判：只换次档也算换了（那一团情绪确实变了，时间线该有一条）；
      // 两枚都没变才既不记新账、也不重抽自述——重抽会把 TA 说过的那句悄悄换成另一句
      if (nk !== oldP || nk2 !== oldS) {
        en.mo = nk; en.mo2 = nk2;
        if (nk !== oldP) { en.moSay = _cjMoodSay(nk); en.moSayTs = en.moSay ? now : 0; }
        _cjHist(cid, { k: 'm', t: _cjMoodPairLabel(nk, nk2) + (en.moSay ? '：' + en.moSay : ''), ts: now, ma: nk, mb: nk2 || '' });
      }
    }
    // TA 读到的你的心情（情绪卡里「你」那一行）：又一条独立随机时钟，45-110 分钟掷一次——读别人比读自己慢。
    // 与情绪那条互不推算，只是同一张表两份抽法、各掷一对；撞上（两行主档相同）只在屏上标一下，不驱动任何行为
    if (root.moodOn !== false && now - en.sinceMoRead >= en.cdMoRead) {
      const pairR = _cjMoodRoll();
      en.sinceMoRead = now; en.cdMoRead = _cjRi(45, 110) * 60000; dirty = true;
      const oldRP = CJ_MOODS[en.moRead] ? en.moRead : 'calm', oldRS = _cjMood2(oldRP, en.moRead2);
      const nkR = CJ_MOODS[pairR[0]] ? pairR[0] : 'calm', nkR2 = _cjMood2(nkR, pairR[1]);
      if (nkR !== oldRP || nkR2 !== oldRS) {
        en.moRead = nkR; en.moRead2 = nkR2;
        _cjHist(cid, { k: 'u', t: _cjMoodPairLabel(nkR, nkR2) + ' · TA 读到的你', ts: now });
      }
    }
    // 撒娇感知（⑧）：又一条独立随机时钟，15-40 分钟掷一次；与情绪互不推算，也只给面板读、不生效
    if (root.sgOn !== false && now - en.sinceSg >= en.cdSg) {
      const nk2 = _cjPickWeighted(CJ_SG_W);
      en.sinceSg = now; en.cdSg = _cjRi(15, 40) * 60000; dirty = true;
      if (nk2 !== en.sg) en.sg = CJ_SG[nk2] ? nk2 : 'flat';
    }
    // 心动（⑩）：**一条**时钟一次抽两档——TA 自己的心动＋TA 读到的你的心动。
    // 抽到同一档＝撞上（两行各挂一枚墨点），这是「双向」这件事在屏上唯一的说法；不写历史（只报此刻）、
    // 不驱动任何行为。词住在【TA心里话·心动的话】那一池（TA 那一枚可说，`btRead` 不开口＝它借的正是这张表），
    // 说不说归末尾那条统一投递钟（BUGS #189）。区间 60-180 分钟，比这一页其余四条都稀疏＝心动不是随时都有的事。
    // 间隔的合法性刻意判在**这里**而不是 db.ensureData：这条线的唯一读方就是这个 tick，脏值/缺字段当「到点」
    // 处理、掷完当场写回一个区间内的合法值＝自愈，不需要第二处补；负数与 0 若放过去会每 tick 重掷（#072 踩过）
    const btCd = typeof en.cdBt === 'number' && en.cdBt >= CJ_BT_MIN_MIN * 60000 && en.cdBt <= CJ_BT_MAX_MIN * 60000 ? en.cdBt : 0;
    const btSince = typeof en.sinceBt === 'number' && isFinite(en.sinceBt) ? en.sinceBt : 0;
    if (root.btOn !== false && now - btSince >= btCd) {
      const nkB = _cjPickWeighted(CJ_BT_W), nkB2 = _cjPickWeighted(CJ_BT_W);
      en.sinceBt = now; en.cdBt = _cjRi(CJ_BT_MIN_MIN, CJ_BT_MAX_MIN) * 60000; dirty = true;
      if (CJ_BT[nkB]) en.bt = nkB;
      if (CJ_BT[nkB2]) en.btRead = nkB2;
    }
    // 接住（⑫）：与心动同族的一条钟、一次抽两枚（TA 说明白／你接住）。合法性照心动那条判在**这里**
    // 而不是 db.ensureData＝这条线的唯一读方就是这个 tick，脏值与缺字段一律当「到点」，掷完当场写回一个
    // 区间内的合法值＝自愈，不必留第二处补；负数与 0 若放过去会让下面那条判定恒真＝每 tick 重掷（#072 踩过）。
    // 两枚各掷各的、互不推算（对上 15% 上下＝随机撞出来的，不是设计出来的）；不写历史，撞上只在屏上标一下。
    // 开口那一半（2026-10-09 统一投递钟）：`un` 的词在【说明白的话】那一池里，`unYou` 永不开口——那是 TA 给用户打的分。
    const unCd = typeof en.cdUn === 'number' && en.cdUn >= CJ_UND_MIN_MIN * 60000 && en.cdUn <= CJ_UND_MAX_MIN * 60000 ? en.cdUn : 0;
    const unSince = typeof en.sinceUn === 'number' && isFinite(en.sinceUn) ? en.sinceUn : 0;
    if (root.undOn !== false && now - unSince >= unCd) {
      const nkU = _cjPickWeighted(CJ_UND_W), nkU2 = _cjPickWeighted(CJ_UND_W);
      en.sinceUn = now; en.cdUn = _cjRi(CJ_UND_MIN_MIN, CJ_UND_MAX_MIN) * 60000; dirty = true;
      if (CJ_UND[nkU]) en.un = nkU;
      if (CJ_UND[nkU2]) en.unYou = nkU2;
    }
    // 干扰（⑪）：又一条独立随机钟，30-90 分钟现掷一次。与心动那条同口径＝合法性判在这里而不是
    // db.ensureData（这条线的唯一读方就是这个 tick，脏值与缺字段一律当「到点」，掷完当场写回一个
    // 区间内的合法值＝自愈，不必留第二处补）；负数与 0 若放过去会让下面那条判定恒真＝每 tick 重掷（#072 踩过）
    const ngCd = typeof en.cdNg === 'number' && en.cdNg >= CJ_NG_MIN_MIN * 60000 && en.cdNg <= CJ_NG_MAX_MIN * 60000 ? en.cdNg : 0;
    const ngSince = typeof en.sinceNg === 'number' && isFinite(en.sinceNg) ? en.sinceNg : 0;
    if (root.ngOn !== false && now - ngSince >= ngCd) {
      const wN = Object.assign({}, CJ_NG_W);
      if (_cjLiveTalk(cid) >= 2) wN.clear *= 2;   // 事实反压：正聊着，干扰更可能是「没被什么占着」
      const nkN = _cjPickWeighted(_cjBias(_cjInertia(wN, en.ng, 1.7), en, 'ng'));
      en.sinceNg = now; en.cdNg = _cjRi(CJ_NG_MIN_MIN, CJ_NG_MAX_MIN) * 60000; dirty = true;
      if (CJ_NG[nkN]) en.ng = nkN;
    }
    // TA 读你（⑨）：TA 觉得你怎么样——同族随机时钟，25-70 分钟掷一次，不从你的真实消息派生。
    // 换档那一刻把台词算死存库（照 moSay 手法，之后重画面板不改口）——存的是【面板那一行】；
    // 开口说的是下面那条统一投递钟到点那一刻按【当前档】现抽的那一句（BUGS #312，两者可以不同句、同档）。
    // 旧写法＝「换档时 22% 且当日只发一条」：一枚钉死的概率加一枚硬额度，2026-10-08 随统一口径一起撤掉
    if (root.readOn !== false && now - en.sinceRd >= en.cdRd) {
      const nk3 = _cjPickWeighted(CJ_READ_W);
      en.sinceRd = now; en.cdRd = _cjRi(25, 70) * 60000; dirty = true;
      if (nk3 !== en.rd) {
        en.rd = CJ_READ[nk3] ? nk3 : 'steady';
        en.rdSay = _cjReadSay(en.rd);
        en.rdSayTs = en.rdSay ? now : 0;
        _cjHist(cid, { k: 'u', t: CJ_READ[en.rd].label + (en.rdSay ? '：' + en.rdSay : ''), ts: now });
      }
    }
    // 统一投递钟（BUGS #189）：这一页所有「TA 自己那一侧」的读数共用这一条随机钟——
    // 签名／情绪自述／读你那句／示软／心动／说明白／干扰／距离／活动／天气／体感／梦／回忆闪回／问卡，
    // 到点从「此刻真有词可说」的那些里挑一条说出口。群聊没有唯一的 TA，这条钟不为它跑。
    // 「夜里／雨雪风日的呢喃」与「靠近时 40% 体感」两块旧触发已并进来（天气那句仍按真天色取词，
    // 而「夜里」那一发 2026-10-12 整条摘掉＝月相下线后夜里没有可说的天象，撑着一句月亮话＝量不出的话（#110 同一课）
    if (!_cjIsGroup(cid) && typeof _cjDeliver === 'function' && typeof nextId === 'function') {
      if (_cjSayTick(cid, en, now)) dirty = true;
    }
  }
  if (dirty) save();
  cjMemoryTick();   // 只剩里程碑那一条（它必须在越过去那一刻说）；闪回／梦／问卡已进上面那条钟；心愿独立走 wishTick
  updateCjChip();
}

// ===== 感知一下：手动感知，可能改变一次状态 =====
function cjianPerceive() {
  const cid = _cjSel || data.activeChat;
  const c = _cjContact(cid);
  if (!c || c.kind === 'group') { showToast('先选择一个联系人'); return null; }
  if (Date.now() < _cjPerceiveCd) { showToast('刚刚才感知过，先等一等'); return null; }
  _cjPerceiveCd = Date.now() + 3000;
  const en = _cjEntry(cid);
  const now = Date.now();
  const chance = { near: 95, nearby: 75, far: 40, gone: 25, unfelt: 12 }[en.p] || 12;
  const lines = [];
  const hit = Math.random() * 100 < chance;
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  if (hit) {
    lines.push('你安静了一会儿。', '好像有人就在附近。', pick(CJ_SENSE_HIT));
  } else {
    lines.push(pick(CJ_SENSE_MISS), '但这并不代表 TA 不在。');
  }
  if (now - en.sinceP > 15 * 60000) {
    const r = Math.random();
    en.p = r < 0.45 ? 'nearby' : (r < 0.75 ? 'unfelt' : (r < 0.9 ? 'near' : 'far'));
    en.sinceP = now; en.cdP = _cjRi(20, 45) * 60000;
    _cjHist(cid, { k: 'p', t: CJ_PRESENCE[en.p].label, ts: now });
    lines.push('「' + _cjName(cid) + '」似乎改变了状态——现在' + CJ_PRESENCE[en.p].label + '。');
  }
  save();
  return lines;
}
function _cjName(cid) {
  const c = _cjContact(cid);
  return fixedNameOf(c) || partnerName();
}

// ===== 连接感知：这条线现在通不通（每次现算：不写库、不掷骰子、没有随机源）=====
// 读数只来自这个会话真实的消息流——谁最后说、几个钟点、TA 有没有接、双向各几句、系统提示里「已读不回」几次
// 判档的时间阈值只引「这一条线自己的节奏」（该联系人在 TA 的设置里填的最长回复秒数），不新写死分钟数
// 判读窗口＝滚动 24 小时；这 24 小时一句都没有（低频线）就兜底回看最近几轮完整来回，卡面 tag 随之改口「最近几轮」
// 2026-10-07 由「近 7 天」改档（用户两次报「为什么显示近 7 天」）：7 天窗把三天前那句回复留在窗内，「TA 也说过」于是成立，
// 现在只有你在说的那条线被洗成慢半拍。不取「这一小时」与「今天零点起」，两条的空窗率见 FEATURES 那一节
// 「刚发出、还没等到回」不落单向——等超过这条线自己的节奏 3 倍（两个方向同一个规矩）才算一边在说
// 量不出（这个会话还没有话）时不给档，明写原因，绝不硬挑一档
function _cjTsOf(m) { const t = new Date(`${m.date || ''} ${m.time || ''}`).getTime(); return isFinite(t) ? t : 0; }
function _cjClock(t) {
  if (!t) return '—';
  const d = new Date(t), n = new Date(), hm = _cjPad(d.getHours()) + ':' + _cjPad(d.getMinutes());
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
    ? hm : (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
}
function _cjDur(sec) {
  if (sec < 90) return Math.max(1, Math.round(sec)) + ' 秒';
  if (sec < 5400) return Math.round(sec / 60) + ' 分';
  return Math.round(sec / 180) / 10 + ' 时';
}
function cjConnOf(cid) {
  const ch = (data.chats || {})[cid];
  const msgs = (ch && Array.isArray(ch.msgs)) ? ch.msgs : [];
  const now = Date.now();
  const name = _cjName(cid);
  const out = { level: null, label: '', desc: '', rank: 0, rows: [], note: '', reason: '', tag: '近 24 小时' };
  const talk = msgs.filter(m => m && (m.from === 'me' || m.from === 'partner') && _cjTsOf(m));
  if (!talk.length) { out.reason = '这条线还没有可判的通信'; out.tag = '还没有通信'; return out; }
  const WIN_MS = 86400000;
  let win = talk.filter(m => now - _cjTsOf(m) <= WIN_MS);
  let span = WIN_MS;   // 「已读不回」计数与阈值的观察跨度：默认近 24 小时，兜底时收成最近几轮的实际跨度
  if (!win.length) {   // 低频线兜底：回看最近几轮完整来回，tag 改口「最近几轮」
    win = talk.slice(-6);
    span = Math.max(1, now - _cjTsOf(win[0]));
    out.tag = '最近几轮';
  }
  let lastMe = null, lastTa = null, pending = 0;
  for (let i = talk.length - 1; i >= 0; i--) {
    const m = talk[i];
    if (!lastMe && m.from === 'me') lastMe = m;
    if (!lastTa && m.from === 'partner') lastTa = m;
  }
  for (let i = talk.length - 1; i >= 0 && talk[i].from === 'me'; i--) pending++;
  out.rows = [['你最后发出', _cjClock(lastMe ? _cjTsOf(lastMe) : 0)], [name + ' 最后回于', _cjClock(lastTa ? _cjTsOf(lastTa) : 0)]];
  const meN = win.filter(m => m.from === 'me').length;
  const taN = win.filter(m => m.from === 'partner').length;
  const sysWin = msgs.filter(m => m && m.from === 'system' && _cjTsOf(m) && now - _cjTsOf(m) <= span);
  const nrN = sysWin.filter(m => String(m.text || '').indexOf('已读不回') >= 0).length;
  const unreadTa = Math.max(0, Number(ch.unread) || 0);
  // 实测间隔：你某一句 → 其后第一条 TA 的话；判读窗口内全部轮次取中位数（轮数一并报出，不藏样本）
  const gaps = [];
  for (let i = 0; i < win.length; i++) {
    if (win[i].from !== 'partner') continue;
    const bt = _cjTsOf(win[i]);
    let prev = 0;
    for (let j = talk.length - 1; j >= 0; j--) { const t = _cjTsOf(talk[j]); if (talk[j].from === 'me' && t < bt) { prev = t; break; } }
    if (prev) gaps.push((bt - prev) / 1000);
  }
  const rounds = gaps.length;
  const medS = rounds ? gaps.slice().sort((a, b) => a - b)[Math.floor(rounds / 2)] : 0;
  const bh = (data.chatSettings && data.chatSettings[cid]) || (cid === data.activeChat && data.behavior) || {};
  const paceMax = Math.max(1, Number(bh.rsMax) || 40), paceMin = Math.min(paceMax, Math.max(1, Number(bh.rsMin) || 1));
  // 判档：等待规则两个方向同一个规矩——对方还没到「该回的时候」（这条线自己的节奏 3 倍）就不落「单向」。
  // 刚发出还在等＝平常（descAlt 说清楚在等什么，不冒称「有来有回」）；等过阈值＝单向；末句被接住才轮得到热线/通畅
  let level, descAlt = '';
  const waited = lastMe ? (now - _cjTsOf(lastMe)) / 1000 : 0;
  const waitedTa = lastTa ? (now - _cjTsOf(lastTa)) / 1000 : 0;
  if (meN === 0) {
    level = waitedTa > paceMax * 3 ? 'oneWay' : 'normal';
    if (level === 'normal') descAlt = 'TA 刚说了话，还没等到你接';
  } else if (taN === 0) {
    level = waited > paceMax * 3 ? 'oneWay' : 'normal';
    if (level === 'normal') descAlt = '刚发出去，TA 还没到该回的时候';
  } else if (pending > 0) level = waited > paceMax * 3 ? 'slow' : 'normal';
  else level = (rounds >= 5 && taN * 5 >= meN * 3) ? 'hot' : 'smooth';
  const idx = CJ_CONN_LEVELS.findIndex(x => x.k === level);
  const def = CJ_CONN_LEVELS[idx];
  out.level = level; out.rank = idx + 1; out.label = def.label; out.desc = descAlt || def.desc;
  out.rows.push(['你连着没被接', pending + ' 句'], [name + ' 发来你没读', unreadTa + ' 句'],
    ['双向', `你 ${meN} 句 · ${name} ${taN} 句`]);
  out.note = (rounds ? '你发出去到 ' + name + ' 回话，中位 ' + _cjDur(medS) + '（' + rounds + ' 轮）' : '还没有一轮完整的来回')
    + ' · 这条线自己的节奏 ' + paceMin + '–' + paceMax + ' 秒'
    + (nrN ? ' · 已读不回 ' + nrN + ' 次' : '');
  return out;
}
// 连接卡底那一行「干扰」：归属照抽，指路只在被指那一格此刻真有事时才写——那一格若是中性档
// （平静／空闲），指过去就是指一处空白，那句指路成了假话，于是只报时刻。
// outer（手边有东西）在别处没有宿主，CJ_NG.outer.to 是空串＝永不指路。
// 不用墨点当记号：.cj-moods span.on.same 那枚点的语义已被「TA 与你的心情撞档」占用，一枚点不能有两个意思。
function _cjNgLine(en) {
  if (_cjRoot().ngOn === false) return '';
  const k = CJ_NG[en.ng] ? en.ng : 'clear';
  const lit = {
    taMood: (CJ_MOODS[en.mo] ? en.mo : 'calm') !== 'calm',
    yourState: (CJ_MOODS[en.moRead] ? en.moRead : 'calm') !== 'calm',
    taState: ['busy', 'rushed', 'rest', 'sleep'].indexOf(en.a) >= 0
  };
  let at = '';
  if (k !== 'clear') at = 'TA 说的 · ' + (lit[k] ? CJ_NG[k].to : _cjClock(en.sinceNg));
  return `<div class="cj-ng"><span class="cj-ng-k">干扰</span><span class="cj-ng-v">${_cjEsc(CJ_NG[k].label)}</span>${at ? `<span class="cj-ng-at">${_cjEsc(at)}</span>` : ''}</div>`;
}

// ===== 聊天页状态 chip =====
function updateCjChip() {
  const b = $('#cjChip');
  if (!b || typeof data === 'undefined' || !data.activeChat) return;
  const cid = data.activeChat;
  const c = _cjContact(cid);
  if (!c || c.kind === 'group') { b.hidden = true; return; }
  const en = _cjEntry(cid);
  if (!en.world || !en.world.last) en.world = _cjRollWorld(en, Date.now());   // 懒建后先摇一次世界时刻再显示
  b.hidden = false;
  // 心情那一枚只在情绪感知这一族开着时才上屏（关掉一族＝它不在屏上任何一处，与面板那张卡同口径）。
  // 档名前面刻意不挂「心情」两字标签：最坏那一发（忙碌 · 淡淡的 · TA那边 16:06）文字 139.2px、整枚盒 151.3px
  // （rect 就是 border-box、内距已含＝别再加一次），而 320 屏那一轨只剩 164.0px（两翼实测 36.0＋80.0 反推）；
  // 多挂一枚「心情 · 」前缀那一发量得 182.7px＝顶出屏，挤不下不是折行而是压上右侧两枚键。三个数由 tools/_probe_cj_chip_mood.js 现量。
  const mood = _cjRoot().moodOn === false ? '' : _cjMoodPairLabel(en.mo, '');
  // 输出口（2026-10-14）：连接感知判出单向/慢半拍＝等待已过这条线自己的节奏，chip 接上判读词。
  // 心情那一节让位给判读词：心情在面板里总有宿主，而 320 屏 164px 的宽度预算（tools/_probe_cj_chip_mood.js 现量）只够装一节
  let conn = null;
  if (typeof cjConnOf === 'function') { const _c = cjConnOf(cid); if (_c.level === 'oneWay' || _c.level === 'slow') conn = _c; }
  if (conn) b.dataset.conn = conn.level; else b.removeAttribute('data-conn');
  const connTag = conn ? (conn.level === 'oneWay' ? '单向' : '慢半拍') : '';
  b.textContent = CJ_ACTIVITY[en.a].label + (mood && !conn ? ' · ' + mood : '') + (connTag ? ' · ' + connTag : '') + ' · TA那边 ' + _cjPad(en.world.hh) + ':' + _cjPad(en.world.mm);
}

// ===== 时间线（记录卡）：按日分组＋类型筛选 =====
// 筛选记在页内变量（刷新回「全部」，不进 localStorage——停留组那份记忆已有 tag 行管着，一处够用）
let _cjHistF = 'all';
// 归堆口径：情绪＝m u／TA 说的话＝呢喃梦碑体感（r d b f）／感知＝签名靠近感知（s n p）／心愿＝w；
// i（旧「我」那一格的手工记账，写手已撤）不在任何一枚 chips 里，只在「全部」出现
function _cjHistCat(k) { return k === 'm' || k === 'u' ? 'mood' : k === 'r' || k === 'd' || k === 'b' || k === 'f' ? 'said' : k === 'n' || k === 'p' || k === 's' ? 'sense' : k === 'w' ? 'wish' : 'old'; }
const CJ_HIST_F = [
  { k: 'all', name: '全部' }, { k: 'mood', name: '情绪' }, { k: 'said', name: 'TA 说的话' },
  { k: 'sense', name: '感知' }, { k: 'wish', name: '心愿' }
];
function _cjDayLabel(ts) {
  const d = new Date(ts), n = new Date();
  const same = a => a.getFullYear() === n.getFullYear() && a.getMonth() === n.getMonth() && a.getDate() === n.getDate();
  if (same(d)) return '今天';
  const y = new Date(n.getTime() - 86400000);
  if (d.getFullYear() === y.getFullYear() && d.getMonth() === y.getMonth() && d.getDate() === y.getDate()) return '昨天';
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}
function _cjHistList(en) {
  const all = (en.hist || []).slice().reverse();
  return _cjHistF === 'all' ? all : all.filter(e => _cjHistCat(e.k) === _cjHistF);
}
function _cjHistMonthLabel(key) {
  const i = key.indexOf('-');
  const y = Number(key.slice(0, i)), m = Number(key.slice(i + 1));
  const n = new Date();
  return y === n.getFullYear() ? m + '月' : y + '年' + m + '月';
}
// 月份折叠（2026-10-13 用户「每天当天的只显示当天的，然后按月份全部折叠起来」）：
// 屏上默认只剩今天那条线，今天之外的整月折成一行头（点行翻那一个月，行上带条数）。
// 展开状态记页内 Set：翻折是「此刻怎么看」不是「账」，刷新回折起（同筛选 chips 那族口径，不进 localStorage）。
let _cjHistOpen = new Set();
function _cjHistHTML(en) {
  const all = (en.hist || []).length;
  const list = _cjHistList(en);
  if (!all) return '<div class="cj-empty">还没有记录</div>';
  if (!list.length) return '<div class="cj-empty">这一类还没有记录</div>';
  const hl = t => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${_cjPad(d.getHours())}:${_cjPad(d.getMinutes())}`; };
  const kName = e => e.k === 's' ? '签名' : e.k === 'n' ? '靠近' : e.k === 'r' ? '呢喃' : e.k === 'w' ? '心愿' : e.k === 'd' ? '梦' : e.k === 'b' ? '碑' : e.k === 'f' ? '体感' : e.k === 'm' ? '情绪' : e.k === 'u' ? '读你' : e.k === 'i' ? '我的' : '感知';
  const item = e => `<div class="cj-hist-item"><span class="cj-hist-k k-${e.k}">${kName(e)}</span><span class="cj-hist-t">${_cjEsc(e.t)}</span><span class="cj-hist-ts">${hl(e.ts)}</span></div>`;
  const withDays = items => {
    let out = '', lastDay = '';
    for (const e of items) {
      const day = _cjDayLabel(e.ts);
      if (day !== lastDay) { out += `<div class="cj-day-sep">${_cjEsc(day)}</div>`; lastDay = day; }
      out += item(e);
    }
    return out;
  };
  const todays = [], months = new Map();   // key 'YYYY-M' → items；list 新在前，Map 按插入序＝最近的月在上
  for (const e of list) {
    if (_cjDayLabel(e.ts) === '今天') { todays.push(e); continue; }
    const d = new Date(e.ts);
    const key = d.getFullYear() + '-' + (d.getMonth() + 1);
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(e);
  }
  let out = todays.length ? withDays(todays) : '';
  for (const [key, items] of months) {
    const open = _cjHistOpen.has(key);
    out += `<div class="cj-hist-mh${open ? ' on' : ''}" data-cj-m="${key}"><span class="cj-hist-mlab">${_cjEsc(_cjHistMonthLabel(key))}</span><span class="cj-hist-mn">${items.length} 条</span><i class="cj-hist-marr"></i><span class="cj-hist-mln"></span></div>`
      + `<div class="cj-hist-mbody" data-cj-mb="${key}"${open ? '' : ' hidden'}>${withDays(items)}</div>`;
  }
  return out;
}

// ===== 情绪轨迹（记录卡，旧名「情绪条带」）：按天分节，一枚 chip＝一次换档 =====
// 2026-10-13 第三轮（用户「还是很丑啊，根本看不懂这个东西，帮我重新设计美观一点的」）：散点阵整个撤掉。
// 三轮下来量明白的一件事＝**图就要学**：七行是什么、点压在哪行、大点小点谁是谁，三件事都得先学会才读得到第一口，
// 车道版只是把「丑」治了，「看不懂」没治。这轮换成零学习成本的读法：
// 一枚 chip＝一次换档（时刻＋档名），天与天分节、节内时间正序，读起来就是一句话
// 「今天：09:12 平静 → 15:40 烦躁 → 现在 18:22 淡淡的」；次档写进同一枚 chip（「＋柔软」）＝图例整行删，没有符号要解释；
// 「她现在什么档」＝最深那枚 chip（ink 实底），不用找。点任意 chip＝底下读出条换成那一次的全文（t 是「档名 · 次档：自述」）。
// 新账带 ma/mb（2026-10-07 起），旧账从 t 的档名前缀现认（_cjMoodKeysOf）＝老记录照样画
let _cjMsEvents = [];
// 2026-10-13 第四轮（用户「应该只显示今天的内容，其他日期的内容自动折叠起来」）：天节头折起来。
// 常开的只有最上面那一节＝有今天的记录时就是今天；今天一次都没记过时＝最近的那一天（否则整卡只剩几行日子、
// 一次换档都读不到，而读出条只有最新那一条的全文）。更早的天折成一行「日子＋换档数＋横线＋箭头」，
// 点行才铺开那一天的 chip 流。行态存这里＝页内变量，不进 data 也不进备份、每次重开面板回到折起
// （同历史记录的 _cjHistOpen／信箱筛选那一族口径）；换人时清空（上一本展开的天不该带到下一位身上）
let _cjMsOpen = new Set();
function _cjMoodKeysOf(e) {
  if (e.ma && CJ_MOODS[e.ma]) return [e.ma, e.mb && CJ_MOODS[e.mb] && e.mb !== e.ma ? e.mb : ''];
  const t = String(e.t || '');
  for (const k of CJ_MOOD_ORDER) {
    if (!t.startsWith(CJ_MOODS[k].label)) continue;
    const m = t.slice(CJ_MOODS[k].label.length).match(/^ · (\S+)/);
    const sec = m ? CJ_MOOD_ORDER.find(x => x !== k && CJ_MOODS[x].label === m[1]) || '' : '';
    return [k, sec];
  }
  return ['calm', ''];
}
function _cjMsDayLabel(ts) {
  const d = new Date(ts); d.setHours(0, 0, 0, 0);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((t - d) / 86400000);
  return diff === 0 ? '今天' : diff === 1 ? '昨天' : (d.getMonth() + 1) + '/' + d.getDate();
}
function _cjMsStrip(en) {
  const ev = (en.hist || []).filter(e => e.k === 'm').slice(-20);
  _cjMsEvents = ev;
  if (!ev.length) return '<div class="cj-empty">还没有情绪换档的记录</div>';
  const lab = k => CJ_MOODS[k] ? CJ_MOODS[k].label : k;
  const day0 = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
  // 按天分节：节内正序（读成一句话），节与节新的在上（跟历史记录卡同一节奏）
  const groups = {}, order = [];
  for (const e of ev) { const d = day0(e.ts); if (!groups[d]) { groups[d] = []; order.push(d); } groups[d].push(e); }
  const lastTs = ev[ev.length - 1].ts;
  const topDay = Math.max.apply(null, order);   // 常开那一节＝时间上最新的一天（不取「数组末位」：那要靠 hist 严格正序，新旧账混着导进来时说不准）
  // chip 里只写时刻：日期由节头说（节头写「昨天」chip 再写「10/12 00:45」＝同一件事说两遍）
  const hm = ts => { const d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const sections = order.slice().reverse().map(dk => {
    const list = groups[dk];
    const chips = list.map(e => {
      const [a, b] = _cjMoodKeysOf(e);
      const isNow = e.ts === lastTs;
      return `<button type="button" class="ms-ev${isNow ? ' now' : ''}" data-ms-i="${ev.indexOf(e)}"><span class="ms-ev-at">${isNow ? '现在 · ' : ''}${_cjEsc(hm(e.ts))}</span><span class="ms-ev-mo">${_cjEsc(lab(a))}${b ? `<i class="ms-ev-sec">＋${_cjEsc(lab(b))}</i>` : ''}</span></button>`;
    }).join('<i class="ms-ev-arr" aria-hidden="true"></i>');
    const isTop = dk === topDay;                       // 最上面那节常开（＝今天；今天没记录时＝最近那天）
    const open = isTop || _cjMsOpen.has(dk);
    // 折叠头跟历史记录卡的月份头 .cj-hist-mh 同族（名＋数＋横线＋箭头）；常开那节不画箭头也不可点＝少一件要解释的控件
    const hcls = 'ms-day-h' + (isTop ? '' : ' ms-day-tog') + (open && !isTop ? ' on' : '');
    const hat = isTop ? '' : ` data-ms-d="${dk}"`;
    return `<div class="ms-day${open ? '' : ' off'}"><div class="${hcls}"${hat}><span class="ms-day-name">${_cjEsc(_cjMsDayLabel(dk))}</span><span class="ms-day-n">换档 ${list.length} 次</span><i class="ms-day-ln"></i>${isTop ? '' : '<i class="ms-day-arr"></i>'}</div><div class="ms-flow"${open ? '' : ' hidden'}>${chips}</div></div>`;
  }).join('');
  const last = ev[ev.length - 1];
  return `${sections}<div class="cj-ms-cap" id="cjMsCap">${_cjEsc(last.t)} · ${_cjEsc(_cjClock(last.ts))}</div>`;
}

// ===== 面板 =====
function renderCjianPage() {
  if (!_cjSel || !_cjContact(_cjSel) || _cjIsGroup(_cjSel)) {
    const list = _cjSingles();
    const own = list.find(c => c.id === data.activeChat) || list[0];
    _cjSel = own ? own.id : '';
  }
  cjianTick();
  const hero = new Date();
  const hIdx = _cjShichenAt(hero.getHours());
  const stH = CJ_SHICHEN_START[hIdx];
  const half = (hero.getHours() * 60 + hero.getMinutes()) - stH * 60 < 60 ? CJ_SHICHEN[hIdx] + '初' : CJ_SHICHEN[hIdx] + '正';
  $('#cjHeroHalf').textContent = half;
  $('#cjHeroRange').textContent = _cjPad(stH) + ':00–' + _cjPad((stH + 2) % 24) + ':59 · 现实此刻 ' + _cjPad(hero.getHours()) + ':' + _cjPad(hero.getMinutes());
  const bar = $('#cjOwners');
  bar.innerHTML = _cjSingles().map(c =>
    `<button type="button" class="av-chip cj-ow${c.id === _cjSel ? ' on' : ''}" data-cj-cid="${_cjEsc(c.id)}"><span class="av-chip-name">${_cjEsc(c.chatName || c.name || 'TA')}</span></button>`
  ).join('');
  const on = bar.querySelector('.cj-ow.on');
  if (on) bar.scrollLeft = on.offsetLeft - (bar.clientWidth - on.offsetWidth) / 2;
  _cjRenderBody();
}

function _cjRenderBody() {
  const root = $('#cjBody');
  if (!root) return;
  const cid = _cjSel;
  const c = _cjContact(cid);
  if (!c) { root.innerHTML = '<div class="cj-empty">还没有联系人</div>'; return; }
  const en = _cjEntry(cid);
  const r = _cjRoot();
  _cjWorldHour(en);   // 先把这一本的时刻追平（到点会重抽一次），下面几处读的都是同一份
  const w = en.world || {};
  const since = t => {
    const m = Math.floor((Date.now() - t) / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return m + ' 分钟前';
    if (m < 1440) return Math.floor(m / 60) + ' 小时前';
    return Math.floor(m / 1440) + ' 天前';
  };
  const histTotal = (en.hist || []).length;
  const histN = _cjHistF === 'all' ? histTotal : _cjHistList(en).length;
  const curSh = _cjShichenAt(w.hh || 0);   // 时辰轴上那一格亮的是「她那边现在是几时」，不是你手机上的几时
  const shStrip = `<div class="cj-sh-strip">${CJ_SHICHEN.map((s, i) => `<i class="${(i <= 2 || i === 11) ? 'n ' : ''}${i === curSh ? 'on' : ''}">${s}</i>`).join('')}</div>`;
  const todayRows = (() => {
    const cur = curSh;
    let out = '';
    for (let k = 0; k < 12; k++) {
      const idx = (cur + k) % 12;
      const rowH = CJ_SHICHEN_START[idx];
      const ph = k === 0 ? _cjPredictPhrase(en.p, en.a) : _cjPredictPhrase(_cjPickWeighted(_cjPresenceWeights(rowH)), _cjPickWeighted(_cjActivityWeights(rowH)));
      out += `<div class="cj-today-row"><span class="cj-today-sh">${CJ_SHICHEN[idx]}时</span><span class="cj-today-range">${_cjPad(rowH)}:00–${_cjPad((rowH + 2) % 24)}:59</span><span class="cj-today-ph">${ph}</span></div>`;
    }
    return out;
  })();
  const conn = cjConnOf(cid);
  const moodDesc = (CJ_MOODS[en.mo] || CJ_MOODS.calm).desc;
  const wxK = _cjEnsureWeather(en);
  const msHtml = _cjMsStrip(en);
  const skyBand = `<div class="cj-skyband" data-dp="${_cjDaypart(_cjWorldHour(en))}">
      <div class="cj-wx">${_cjWxSVG(wxK)}</div>
      <span class="cj-sky-cap">${_cjEsc(CJ_WEATHER[wxK])}</span>
      <div class="cj-sky-ghost"></div>
    </div>`;
  root.innerHTML = `<div class="cj-tabs" id="cjTabs">${CJ_TABS.map(t => `<button type="button" class="cj-tab${t.k === _cjTab ? ' on' : ''}" data-cj-tab="${t.k}">${t.name}</button>`).join('')}</div>
    <div class="cj-card" data-cj-card="time">
      <div class="cj-card-title">TA那边的时间 <span class="cj-card-tag">${_cjEsc(_cjOffsetLabel(en))}</span></div>
      ${skyBand}
      <div class="cj-time-row"><span class="cj-time-hhmm">${_cjPad(w.hh || 0)}:${_cjPad(w.mm || 0)}</span><span class="cj-time-half">${_cjEsc(w.half || '')}</span></div>
      <div class="cj-time-note">TA 自己抽的当地时刻 · 每隔 1-8 小时重新抽</div>
    </div>
    <div class="cj-card" data-cj-card="now">
      <div class="cj-card-title">此刻</div>
      <div class="cj-tags">
        <span class="cj-tag cj-tag-p" title="${_cjEsc(CJ_PRESENCE[en.p].desc)}">${CJ_PRESENCE[en.p].label}</span>
        <span class="cj-tag cj-tag-a" title="${_cjEsc(CJ_ACTIVITY[en.a].desc)}">${en.a === 'sleep' ? CJ_MOON_TAG_SVG : ''}${CJ_ACTIVITY[en.a].label}</span>
      </div>
      ${en.a === 'sleep' ? '<div class="cj-note">TA 那边似乎已经睡了。</div>' : ''}
      ${en.a === 'rest' ? '<div class="cj-note">TA 正在休息。</div>' : ''}
      ${en.status ? `<div class="cj-status"><span class="cj-status-label">签名</span><span class="cj-status-txt">${_cjEsc(en.status)}</span><span class="cj-status-since">${since(en.sinceS)}</span></div>` : ''}
      <div class="cj-acts"><button type="button" class="cj-btn" id="cjPerceiveBtn">感知一下</button></div>
      <div class="cj-perceive-result" id="cjPerceiveResult" hidden></div>
    </div>
    <div class="cj-card" data-cj-card="conn">
      <div class="cj-card-title">连接感知 <span class="cj-card-tag">${_cjEsc(conn.tag)}</span></div>
      ${conn.level ? `
        <div class="cj-conn-top"><span class="cj-conn-level">${_cjEsc(conn.label)}</span><span class="cj-conn-desc">${_cjEsc(conn.desc)}</span></div>
        <div class="cj-conn-scale">${CJ_CONN_LEVELS.map((x, i) => `<i${i < conn.rank ? ' class="on"' : ''}></i>`).join('')}</div>
        <div class="cj-conn-lab">${CJ_CONN_LEVELS.map(x => `<span>${x.label}</span>`).join('')}</div>`
        : `<div class="cj-conn-none">${_cjEsc(conn.reason)}</div>`}
      <div class="cj-facts">${conn.rows.map(r => `<span>${_cjEsc(r[0])}</span><b>${_cjEsc(r[1])}</b>`).join('')}</div>
      ${conn.note ? `<div class="cj-note">${_cjEsc(conn.note)}</div>` : ''}
      ${_cjNgLine(en)}
    </div>
    ${r.moodOn === false ? '' : `
    <div class="cj-card" data-cj-card="mood">
      <div class="cj-card-title">情绪感知 <span class="cj-card-tag">${_cjEsc(moodDesc)}</span></div>
      ${_cjMoodPair(en)}
    </div>`}
    <div class="cj-card" data-cj-card="today">
      <div class="cj-card-title">TA 的今日 <span class="cj-card-tag">按十二时辰猜的，不是日程表</span></div>
      ${shStrip}
      <div class="cj-today">${todayRows}</div>
    </div>
    <div class="cj-card" data-cj-card="moodstrip">
      <div class="cj-card-title">情绪轨迹 <span class="cj-card-tag">近 ${_cjMsEvents.length} 次换档</span></div>
      ${msHtml}
    </div>
    <div class="cj-card" data-cj-card="hist">
      <div class="cj-card-title">历史记录 <span class="cj-card-tag" id="cjHistCount">${histN === histTotal ? histTotal + ' 条' : histN + '/' + histTotal + ' 条'}</span><button type="button" class="cj-clear" id="cjHistClear"${histTotal ? '' : ' hidden'}>清空</button></div>
      <div class="cj-chips cj-hist-f" id="cjHistF">${CJ_HIST_F.map(f => `<button type="button" class="cj-chip-set${f.k === _cjHistF ? ' on' : ''}" data-cj-hf="${f.k}">${f.name}</button>`).join('')}</div>
      <div class="cj-hist" id="cjHistList">${_cjHistHTML(en)}</div>
    </div>`;
  // 分组名单只有 CJ_TABS 这一处：卡片按 data-cj-card 认领，组别在写完后现派生（不在 CSS 里再抄一份）
  const _g = {}; CJ_TABS.forEach(t => t.cards.forEach(c => { _g[c] = t.k; }));   // 分组名单只有 CJ_TABS 这一处，卡片只认领不重复声明
  root.querySelectorAll('[data-cj-card]').forEach(el => { el.dataset.cjGroup = _g[el.dataset.cjCard] || 'state'; });
  root.dataset.cjCur = _cjTab;
}

function bindCjianView() {
  $('#cjOwners').addEventListener('click', e => {
    const chip = e.target.closest('[data-cj-cid]');
    if (!chip || chip.dataset.cjCid === _cjSel) return;
    _cjSel = chip.dataset.cjCid;
    _cjMsOpen.clear();   // 换人＝情绪轨迹回到「只铺开最新那一天」（展开的天是上一本的状态，不该带到下一位身上）
    renderCjianPage();
  });
  $('#cjBody').addEventListener('click', e => {
    // 分组 tag：只切「哪一组在屏上」，不重画面板（重画会把「感知一下」的结果框清掉）
    const tb = e.target.closest('[data-cj-tab]');
    if (tb) {
      const k = tb.dataset.cjTab;
      if (k === _cjTab) return;
      _cjTab = k;
      const body = $('#cjBody');
      body.dataset.cjCur = k;
      body.querySelectorAll('.cj-tab').forEach(b => b.classList.toggle('on', b.dataset.cjTab === k));
      try { localStorage.setItem(CJ_TAB_KEY, k); } catch (err) {}
      const pg = $('.cj-page');
      if (pg) pg.scrollTop = 0;
      return;
    }
    const pv = e.target.closest('#cjPerceiveBtn');
    if (pv) {
      const lines = cjianPerceive();
      if (!lines) return;
      _cjRenderBody();   // 先重建面板刷新标签/历史，再填结果框（结果框在 cjBody 内，后填防被重建冲掉）
      const box = $('#cjPerceiveResult');
      box.innerHTML = lines.map(l => `<p>${_cjEsc(l)}</p>`).join('');
      box.hidden = false;
      return;
    }
    const hc = e.target.closest('#cjHistClear');
    if (hc) {
      const sel = _cjSel;   // 面板开着时用户可能切走人选＝当场钉住
      openModal('清空历史', '', () => {
        _cjEntry(sel).hist = [];
        save();
        _cjRenderBody();
      }, { noInput: true, staticText: '清空这条时间线上的全部历史记录？不可恢复。', okText: '清空', danger: true });
      return;
    }
    // 月份折叠头：只翻那一个月（hidden＋箭头转向），不重画整页——「感知一下」的结果框与滚动位置都留住
    // （同筛选 chips 的「改哪块画哪块」；状态落 _cjHistOpen，重画后哪几本开着照旧）
    const mh = e.target.closest('[data-cj-m]');
    if (mh) {
      const key = mh.dataset.cjM;
      const open = !_cjHistOpen.has(key);
      if (open) _cjHistOpen.add(key); else _cjHistOpen.delete(key);
      mh.classList.toggle('on', open);
      const mb = document.querySelector('#cjBody [data-cj-mb="' + key + '"]');
      if (mb) mb.hidden = !open;
      return;
    }
    // 时间线类型筛选：只重画列表（#cjHistList）与计数，不动整页——「感知一下」的结果框不被冲掉，
    // 滚动位置也留住（与分组 tag 同一手法：改哪块画哪块）
    const hf = e.target.closest('[data-cj-hf]');
    if (hf) {
      _cjHistF = CJ_HIST_F.some(f => f.k === hf.dataset.cjHf) ? hf.dataset.cjHf : 'all';
      document.querySelectorAll('#cjBody [data-cj-hf]').forEach(b => b.classList.toggle('on', b.dataset.cjHf === _cjHistF));
      const en0 = _cjEntry(_cjSel);
      const total = (en0.hist || []).length, n = _cjHistList(en0).length;
      const cnt = $('#cjHistCount');
      if (cnt) cnt.textContent = n === total ? total + ' 条' : n + '/' + total + ' 条';
      const list = $('#cjHistList');
      if (list) list.innerHTML = _cjHistHTML(en0);
      return;
    }
    // 情绪轨迹的折叠头：只翻那一天（hidden＋箭头转向），不重画整页——读出条与滚动位置都留住
    // （同月份折叠头的「改哪块画哪块」；行态落 _cjMsOpen，重画后哪几天开着照旧）
    const md = e.target.closest('[data-ms-d]');
    if (md) {
      const key = Number(md.dataset.msD);
      const open = !_cjMsOpen.has(key);
      if (open) _cjMsOpen.add(key); else _cjMsOpen.delete(key);
      md.classList.toggle('on', open);
      const day = md.parentElement;
      const box = day ? day.querySelector('.ms-flow') : null;
      if (box) box.hidden = !open;
      if (day) day.classList.toggle('off', !open);
      return;
    }
    // 情绪条带：点一枚点＝落款那句换成那一次漂移（t 本来就是「档名 · 次档：自述」的全文）
    const ms = e.target.closest('[data-ms-i]');
    if (ms) {
      const ev = _cjMsEvents[Number(ms.dataset.msI)];
      const cap = $('#cjMsCap');
      if (ev && cap) cap.textContent = ev.t + ' · ' + _cjClock(ev.ts);
      return;
    }
  });
}

function openCjian(cid) {
  if (cid) _cjSel = cid;
  showView('cjian');
}

bindCjianView();
// 页面藏起来时跳过（耗电优化）：回前台后下一跳（≤20s）自然补算
setInterval(function () { if (document.hidden) return; updateCjChip(); }, 20000);
const _cjChipEl = $('#cjChip');
if (_cjChipEl) _cjChipEl.addEventListener('click', () => openCjian(data.activeChat));
if (typeof updateCjChip === 'function') { try { updateCjChip(); } catch (e) {} }   // init 数据就绪前先静默尝试，就绪后由 20s 定时补上

// ===== ⑦ TA 想问你：选项点击委托（消息列表事件委托，命中卡片 id 找消息） =====
(function () {
  const list = $('#messageList');
  if (!list) return;
  list.addEventListener('click', e => {
    const opt = e.target.closest('[data-taq-opt]');
    if (!opt) return;
    const cardEl = opt.closest('[data-taq-id]');
    if (!cardEl) return;
    const m = data.messages.find(x => String(x.id) === cardEl.dataset.taqId);
    if (!m || !m.taAsk || m.taAsk.status !== 'waiting') return;
    const pick = String(opt.dataset.taqOpt || '');
    if (!pick) return;
    m.taAsk.pick = pick;
    m.taAsk.status = 'answered';
    // 你的选择作为一条带引用的消息落进会话，TA 稍后用「TA的回答」回一句
    data.messages.push({ id: nextId(), from: 'me', text: pick, quote: m.text, time: time(), date: new Date().toLocaleDateString('zh-CN') });
    save();
    // 增量渲染不重建改过的旧气泡 → 整表重渲染一次让卡片显示已选态
    if (typeof resetMessageRender === 'function') resetMessageRender();
    if (typeof inLocateMode === 'function' && inLocateMode()) { try { jumpToLatest(); } catch (err) {} }
    else renderMessages();
    const reply = _cjGroupText('TA的回答');
    if (reply) setTimeout(() => _cjDeliver({ id: nextId(), from: 'partner', text: reply, unread: true }, 'c0'), 2200 + Math.random() * 2600);
  });
})();
