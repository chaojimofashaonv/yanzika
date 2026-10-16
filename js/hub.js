// ===== 使用大全（整册功能目录）：全部功能一页看全（分组 + 一句话说明 + 直达/开关） =====
// 这一张表同时是**两处**的唯一名单：①下面那面整册目录；②「更多」那一页那一列（每行靠 more 那一格
// 认领自己上不上屏·排第几组·叫什么，见文件末 renderMorePage——2026-10-13 用户定档「两处不再各抄一份」）。
// 册子自己的入口不住这一列里＝目录不列它自己，它在「更多」那一页的**页头**那一枚（html/view-more.html 的 #hubEntry，
// 2026-10-11 由设置页「TA 的世界」那一格搬来、该行 10-13 起改成页头入口，BUGS #300 二批）
// 开关行直接读写各功能的状态字段（世界感知面板不再重复放氛围开关）
// 行定义：nav=跳转（view/target），sw=开关（get/set 返回布尔状态），more=上「更多」那一列（见那里三个字段的说明）
// 「已开启」统计口径：无开关的行=常驻功能恒计入，带开关的行只在开时计入
// ⚠ 每一行都得指着真东西：删功能要连这一张表一起删——常驻门 tools/_smoke_hub_rows.js 静态校「nav 还在映射里 ∶ '#' 直达有分支 ∶ 开关那一格在 hub.js 之外还有读方」

function _hubIco(paths) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}
const HUB_GROUPS = [
  {
    name: '陪伴', sub: 'TA 会主动的', rows: [
      { ico: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', name: '世界感知', desc: 'TA 那边的时间 · 天气 · 感知他此刻；这一页每一条读数偶尔会被 TA 当成一句话发进聊天（同一条随机钟，3~8 小时里现掷一次，说过的句子不重说），那条消息角上挂的就是它自己那一行的名字', nav: 'cjian' },
      { ico: '<path d="M12 3c3 3.5 6 6.2 6 9.5a6 6 0 0 1-12 0C6 9.2 9 6.5 12 3z"/>', name: '靠近感知', desc: '他停了很久时，小概率「好像有什么靠近了」', sw: () => (data.cjian || {}).enabled !== false, set: v => { if (!data.cjian) data.cjian = { enabled: true, moodOn: true, by: {} }; data.cjian.enabled = v; } },
      { ico: '<path d="M5 12.5a9.9 9.9 0 0 1 14 0"/><path d="M8.3 16a5 5 0 0 1 7.4 0"/><circle cx="12" cy="19.6" r="1.2"/>', name: '连接感知', desc: '这条线现在通不通：谁最后说、TA 有没有接、双向各几句', nav: 'cjian' },
      { ico: '<path d="M3 12h5M16 12h5"/><path d="M10.6 9.4l6.8 5.2M17.4 9.4l-6.8 5.2"/>', name: '干扰', desc: '连接感知卡底那一行：这一阵有什么占着 TA。只说在哪一边（手边有东西／那边的情绪／那边的事情／你这头的事），不重报那一格是什么——那一格在它自己的卡上亮着；它自己一条随机钟 30-90 分钟掷一次，不从通信量、也不从别的档位推，不驱动回复；词住在【TA心里话·干扰的话】那一池，按当前那一档取，偶尔会说出口', nav: 'cjian', sw: () => (data.cjian || {}).ngOn !== false, set: v => { if (!data.cjian) data.cjian = { enabled: true, moodOn: true, sgOn: true, btOn: true, ngOn: true, by: {} }; data.cjian.ngOn = v; } },
      { ico: '<path d="M3 12h3l2.2-5.4L11.6 18l2.2-6.2 1.4 2.2H21"/>', name: '情绪感知', desc: '这张卡分两组：上「TA」＝TA 自己的心情，下「你」＝TA 读到的你的心情（另一条随机钟，45-110 分钟重读一次）；每行一次亮两枚（主档实心、次档淡一档，抽到平静只亮一枚），档名·那句话各归自己那一组，语气／心动／接住 三枚收成一组一行；TA 那一组的每一枚都能开口（各配一池话术，按当前档取词），你那一组的「接住」不开口——从 TA 嘴里说「你没接住」＝替你打分', nav: 'cjian', sw: () => (data.cjian || {}).moodOn !== false, set: v => { if (!data.cjian) data.cjian = { enabled: true, moodOn: true, by: {} }; data.cjian.moodOn = v; } },
      { ico: '<path d="M12 20.5S4.5 15.2 4.5 9.9A4.9 4.9 0 0 1 12 7.1a4.9 4.9 0 0 1 7.5 2.8c0 5.3-7.5 10.6-7.5 10.6z"/><path d="M8.4 11.2h1.6M14 11.2h1.6"/>', name: '示软', desc: '情绪感知卡「TA」那一行里的「语气」那一枚：TA 这会儿软不软（平常档也显示）；话在【示软的话】那一池，按当前档取，偶尔会说出口；关掉这一枚随之不见', nav: 'cjian', sw: () => (data.cjian || {}).sgOn !== false, set: v => { if (!data.cjian) data.cjian = { enabled: true, moodOn: true, sgOn: true, by: {} }; data.cjian.sgOn = v; } },
      { ico: '<path d="M12 20.5S4.5 15.2 4.5 9.9A4.9 4.9 0 0 1 12 7.1a4.9 4.9 0 0 1 7.5 2.8c0 5.3-7.5 10.6-7.5 10.6z"/><path d="M8.2 11.4h1.7l1-1.8 1.4 3.6.9-1.8h1.7"/>', name: '心动', desc: '情绪感知卡那一行里的「心动」与「读到的心动」两枚：一条钟一次抽两枚＝TA 这会儿心口有没有动＋TA 读到的你有没有动，抽到同一档就各标一枚墨点；TA 那一枚的话在【心动的话】那一池、偶尔会说出口，「读到的心动」那一枚不开口', nav: 'cjian', sw: () => (data.cjian || {}).btOn !== false, set: v => { if (!data.cjian) data.cjian = { enabled: true, moodOn: true, sgOn: true, btOn: true, by: {} }; data.cjian.btOn = v; } },
      { ico: '<path d="M4 8.5h9.6M11 6l2.6 2.5L11 11"/><path d="M20 15.5h-9.6M13 13l-2.6 2.5L13 18"/>', name: '接住', desc: '情绪感知卡那一行里的「说明白」与「接住」两枚：一条钟 50-140 分钟抽一次＝TA 这一句说明白了几分＋你接住了几分，抽到同一档各挂一枚墨点；TA 那一枚「说明白」的话在【说明白的话】那一池、偶尔会说出口，「接住」那一枚不开口（替用户的成绩说话＝指责向）。它不从通信量出来——回话本就是随机抽卡，库里没有「这次控制住了没」这个事实，量不出的不编；也不纠错，五档最重只到「词没对上」「想再说一遍」', nav: 'cjian', sw: () => (data.cjian || {}).undOn !== false, set: v => { if (!data.cjian) data.cjian = { enabled: true, moodOn: true, sgOn: true, btOn: true, undOn: true, by: {} }; data.cjian.undOn = v; } },
      { ico: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M3 19h18"/><path d="M6.5 21.5l3-2.5M17.5 21.5l-3-2.5"/>', name: '话没挤过来', desc: 'TA 这一轮想说却挤不出句子时，聊天里落一条居中系统小字「有句话没挤过两个世界」，不发成气泡＝不替它编一句它没能说出来的话。概率那一格在【TA 的设置 → 回复节奏】里（按联系人各一份，出厂 5%，填 0＝从不）；这一族不再有总闸，故这里只直达', nav: 'mate' },
      { ico: '<path d="M2.6 12S6.2 5.9 12 5.9 21.4 12 21.4 12S17.8 18.1 12 18.1 2.6 12 2.6 12z"/><circle cx="12" cy="12" r="2.9"/>', name: 'TA 读你', desc: 'TA 觉得你现在怎么样——它看不见你，全是猜的；不再单列一张卡，只把那句猜想印在情绪感知卡「你」那一组里，偶尔会说出口', nav: 'cjian', sw: () => (data.cjian || {}).readOn !== false, set: v => { if (!data.cjian) data.cjian = { enabled: true, moodOn: true, sgOn: true, readOn: true, by: {} }; data.cjian.readOn = v; } },
      { ico: '<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.3 8.6 8.6 0 0 1-3.8-.9L3 21l2-5.5a8.3 8.3 0 0 1-.9-3.8A8.4 8.4 0 0 1 12.5 3a8.4 8.4 0 0 1 8.5 8.5z"/><path d="M8 12h2l1.5-2.5L13 14l1.5-2H16"/>', name: 'TA 想问你', desc: 'TA 偶尔发一张单选卡，等你回答', sw: () => data.taAskOn !== false, set: v => { data.taAskOn = v; } },
      { ico: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4a2 2 0 0 0-2-2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>', name: '回忆闪回', desc: 'TA 偶尔重提三天前的旧话、旧收藏', sw: () => data.flashOn !== false, set: v => { data.flashOn = v; } },
      { ico: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>', name: '群里谁冒话', desc: '没有「按群那条钟」了（BUGS #216）：每位联系人只有一条自己的主动发送钟，到点后按【那位】的「主动找你 ∶ 其中说给群」（默认 10%，均分给他所在的每个群）决定这一发是说给你还是说给群。所以群里多吵由人决定，与你开了几个群无关', nav: 'mate' },
      // ↓ 以下六项的开关字段都在 behavior 里，而 behavior 按联系人隔离（db.js: chatSettings[activeChat]），
      // 所以这里只给「直达 TA 的设置」，不在总览页做全局开关——否则改的只是当前联系人的那份副本。
      { ico: '<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.3 8.6 8.6 0 0 1-3.8-.9L3 21l2-5.5a8.3 8.3 0 0 1-.9-3.8A8.4 8.4 0 0 1 12.5 3a8.4 8.4 0 0 1 8.5 8.5z"/>', name: '已读不回', desc: 'TA 有时看见了，先不回你（概率可调 ∶ 那一格还按 TA 此刻在做什么浮动——空闲砍一半、睡着抬三倍，那一枚开关在「回复节奏」里）', nav: 'mate' },
      { ico: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>', name: '别频繁主动找', desc: '按人调的一格频率闸：开着时 TA 主动找你的间隔最长 3 小时一次（在 TA 的设置 → 回复节奏里）。它调的是【多久】，与「夜间免打扰」那条按时间窗硬拦的不是同一件事', nav: 'mate' },
      { ico: '<rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5"/><rect x="3" y="15" width="7" height="7" rx="1.5"/><rect x="14" y="15" width="7" height="7" rx="1.5"/>', name: '多字卡拼句', desc: 'TA 一句话由好几张字卡拼起来', nav: 'mate' },
      { ico: '<path d="M4 7h16M4 12h10M4 17h6"/><path d="M18 14v6M15 17h6"/>', name: '标点拼接', desc: '拼句中间会带一点语气标点', nav: 'mate' },
      { ico: '<path d="M12 20.5S4.5 15.2 4.5 9.9A4.9 4.9 0 0 1 12 7.1a4.9 4.9 0 0 1 7.5 2.8c0 5.3-7.5 10.6-7.5 10.6z"/><path d="M9 11.5h.01M15 11.5h.01" stroke-width="2.4"/>', name: '回复时夹带', desc: 'TA 回话时顺手丢个表情或一张图', nav: 'mate' },
      { ico: '<path d="M4 4.5h10.5L19 9v10.5H4z"/><path d="M14.5 4.5V9H19"/><path d="M8 13h8M8 16.5h5"/>', name: '主动消息小签', desc: 'TA 主动找你的那条会标个小签', nav: 'mate' }
    ]
  },
  {
    name: '记录', sub: '都留着', rows: [
      { ico: '<path d="M12 20.5S4.5 15.2 4.5 9.9A4.9 4.9 0 0 1 12 7.1a4.9 4.9 0 0 1 7.5 2.8c0 5.3-7.5 10.6-7.5 10.6z"/>', name: '收藏', desc: '聊天 / 信 都能收；TA 也会收藏你的话', nav: 'collect', more: { d: '存下的句子 · 信', i: '<path d="M6 3h12v18l-6-4.5L6 21z"/>' } },
      { ico: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>', name: '信箱', desc: '写信寄信收信；寄出一封到手一封，按联系人各一册', nav: 'mailbox', badge: () => (data.receivedLetters || []).filter(m => !m.read).length, more: { d: '寄信 · 拆信 · 按联系人分册', b: 'tileMailDot' } },
      { ico: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><circle cx="12" cy="9.6" r="3"/><path d="M5.6 20.4a6.4 6.4 0 0 1 12.8 0z"/>', name: '朋友圈', desc: '大家按各自的发圈节奏冒一条动态；你也能发，他们会来点赞评论', nav: 'moments', badge: () => momentsUnreadTotal(), more: { d: '大家的动态 · 按时间收', b: 'tileMomentDot' } },
      { ico: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 8.5 12 14l9-5.5"/><path d="M7.5 3.6h9"/>', name: '邀请', desc: '一句约一次：可以让 TA 来约你、也可以你去约 TA，双方都能说不（与心愿各算各的，2026-10-11 分家）', nav: 'invite', more: { d: '一句约一次 · 双方都能说不' } },
      { ico: '<path d="M12 20.5S4.5 15.2 4.5 9.9A4.9 4.9 0 0 1 12 7.1a4.9 4.9 0 0 1 7.5 2.8c0 5.3-7.5 10.6-7.5 10.6z"/>', name: '心愿', desc: 'TA 说过与你记下的心愿：回应、置顶、促成与回响', nav: 'wish', sw: () => wishOn(), set: v => { data.wishOn = v; }, badge: () => wishCountTodo(''), more: { d: '说出的 · 记下的', i: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>' } },
      { ico: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 9.5h18"/><path d="M12 17.6s-3.2-2-3.2-4.1a1.85 1.85 0 0 1 3.2-1.25 1.85 1.85 0 0 1 3.2 1.25c0 2.1-3.2 4.1-3.2 4.1z"/>', name: '纪念日', desc: '多条纪念日，当天 TA 会来祝福、信盖心戳；TA 也会自己想起一个日子（在 TA 的设置里可调）', nav: 'anniversary', more: { d: '倒数日 · 周年 · 月历' } },
      { ico: '<path d="M4 20V12M12 20V5M20 20V9"/>', name: '聊天统计', desc: '句数 / 常用字卡 / 二十四小时分布', nav: 'stats', more: { d: '时段 · 字卡榜 · 时光线' } },
      { ico: '<path d="M3.5 6.5h11.5v9.5H3.5z"/><path d="M3.5 6.5 9.25 11 15 6.5"/><path d="M18.5 16v-3M21.5 16V10"/>', name: '写信统计', desc: '寄出与收到的信：封数 / 字数 / 信里用到哪几类字卡', nav: 'letterstats', more: { d: '封数 · 字数 · 常用字卡' } }
    ]
  },
  {
    name: '互动', sub: '一起玩的', rows: [
      { ico: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>', name: '播放器', desc: '曲库全站一份；TA 能不能邀你一起听、曲终替你做哪几件事，这些权限按人各一套（没单独调过的人共用「默认」那一套）', nav: 'player', more: { d: '曲库 · 权限按人各一套' } },
      { ico: '<rect x="8" y="3" width="13" height="13" rx="2"/><path d="M16 17v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2h2"/>', name: '字卡库', desc: '你自己新建的分组与字卡，公用 / 专属两档', nav: 'cards', more: { d: '公用 · 专属两档' } },
      { ico: '<path d="M12 3 3 7.5 12 12l9-4.5z"/><path d="M3 12.5 12 17l9-4.5"/>', name: '系统预设字卡', desc: '出厂自带的话术与 TA 心里话各池', nav: 'syscards', more: { d: '出厂话术 · 按功能分' } },
      { ico: '<path d="M4.5 6.5h9M4.5 12h7M4.5 17.5h5"/><path d="m14.5 15.5 2.2 2.2 4.3-5"/>', name: '字卡适应度', desc: '按人对账：这位现在说得出哪几类·哪些说法库里筛不到', nav: 'cardfit', more: { d: '按人对账 · 说得出的说法' } },
      { ico: '<path d="M12 8.6A4.6 4.6 0 0 1 20.6 9.6C20.6 14.2 17.4 17.6 12 20.6C6.6 17.6 3.4 14.2 3.4 9.6A4.6 4.6 0 0 1 12 8.6Z"/>', name: '聊天情绪', desc: '三级标签链与逻辑连接词：星言 ∶ mochi ∶ 混合 三档可切（出厂走「混合」，2026-10-14 用户定档）', nav: 'emotion', more: { d: '标签链 · 连接词 · 三档可切' } }, 
      { ico: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0M16 4.6a3.5 3.5 0 0 1 0 6.8M17.5 14.4A6 6 0 0 1 21 20"/>', name: '头像昵称', desc: '互相换形象，TA 会留下印象', nav: 'avatarlib', more: { d: '头像池 · 昵称池 · 印象' } },
      { ico: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>', name: '问问 TA', desc: '你出题 TA 选，或你写字卡 TA 回', nav: '#ask', more: { d: '你出题 · TA 选' } },
      { ico: '<rect x="2.5" y="7" width="19" height="10.5" rx="5"/><path d="M7 10v4.5M4.8 12.2h4.4M15.5 11h.01M18 13.5h.01"/>', name: '游戏中心', desc: '合成 · 2048 · 星星 · 连连看 · 拼图 · 方块（屏上那一排 tab 就是这六款），TA 立挑战分等你破', nav: 'games', more: { d: '六款 · 合作 · 对战' } },
      { ico: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.1 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.5 2.8.7a2 2 0 0 1 1.7 2z"/>', name: '通话', desc: '入口在聊天页顶部（名字右边那枚听筒），接通·拒绝·时长与铃声在设置里调', nav: '#chat' },
      { ico: '<path d="M12 20.5S4.5 15.2 4.5 9.9A4.9 4.9 0 0 1 12 7.1a4.9 4.9 0 0 1 7.5 2.8c0 5.3-7.5 10.6-7.5 10.6z"/><path d="M3.5 11.5h3l1.2-2 1.8 3.5 1.5-2.5h3.5"/>', name: '拍一拍', desc: '点一下 TA 的头像，轻轻拍一拍', nav: '#poke' },
      { ico: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5s1.3 1.6 3.5 1.6 3.5-1.6 3.5-1.6"/><path d="M9 9.5h.01M15 9.5h.01" stroke-width="2.6"/>', name: '表情包 · 颜文字', desc: '抽屉里翻表情包，也能整批链接导入', nav: '#stickers' },
      { ico: '<path d="M9 7h6M9 7l-5 8a2.2 2.2 0 0 0 1.9 3.3h12.2A2.2 2.2 0 0 0 20 15l-5-8"/><path d="M7.5 13h9"/>', name: '引用回复', desc: '长按一条消息引用它，再回一句', nav: '#chat' },
      { ico: '<path d="M4 7h11M4 12h7M4 17h11"/><path d="M17 9.5l3.5 3.5L17 16.5"/>', name: '撤回与删除', desc: '说错了能撤回，也能直接删掉。删除默认关闭——右边这枚开关就是它，开了长按才会多出那枚「删除」（设置 · 数据里同一枚，两处同一个字段）', nav: '#chat', sw: () => data.delMsgOn === true, set: v => { data.delMsgOn = v === true; if (typeof resetMessageRender === 'function') resetMessageRender(); if (typeof renderMessages === 'function') renderMessages(); } },
      { ico: '<path d="M21 12a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-3.8-.8L3 21l1.5-4.4A8.4 8.4 0 0 1 4 12a8.5 8.5 0 1 1 17 0z"/><path d="M9.8 9.8a2.3 2.3 0 1 1 3.1 2.2c-.6.3-.9.8-.9 1.5"/><path d="M12 16.4h.01"/>', name: '这句说谁', desc: '长按 TA 发来的那句问「这句说的是谁」：三档里现掷一枚挂在气泡角上（说TA／说你／说我们），再问一次就换。全是猜的，TA 并不真知道。你发的那句∶已撤回的∶功能生成的那一条没这一问（与「这句本意」共用同一道资格，两枚钮要么一起给要么一起不给）。想让 TA 不等你问就自己标，去 TA 的设置 → 回复节奏 最后那两格（出厂 0＝从不）', sw: () => data.referOn !== false, set: v => { data.referOn = v; if (typeof renderMessages === 'function') { resetMessageRender(); renderMessages(); } } },
      { ico: '<path d="M4 6h16v9H9l-5 4z"/><path d="M8.5 10.5h7"/><path d="M12 2.5v2"/>', name: '这句本意', desc: '长按 TA 的消息再问一次「这句本意」：同一颗签上多出一段（' + MEANT_KEYS.map(k => MEANT_LABEL[k]).join('／') + '）。世界观里 TA 只能用库里已有的字卡，有时控得住、有时是系统随机跳的——所以这一段也是掷出来的，不解析句子。问问TA 那张卡里 TA 抽出来的答复也算一句，长按那张卡同样能问（还没答的不给＝没有答案可指）。想让 TA 自己标，去 TA 的设置 → 回复节奏 最后那两格（出厂 0＝从不）', sw: () => data.meantOn !== false, set: v => { data.meantOn = v; if (typeof renderMessages === 'function') { resetMessageRender(); renderMessages(); } } },
      { ico: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M21 16l-5-5-5 5"/>', name: '插入图片', desc: '插一张图，和字卡一起发过去', nav: '#image' },
      { ico: '<path d="M11 5 6.5 9H3v6h3.5L11 19z"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10"/>', name: '语音朗读', desc: '点气泡右下角那枚小喇叭，听 TA 念一遍（没给这位绑音色的不长这枚键，也不借用别人的声音）', nav: '#speak' },
      { ico: '<path d="M12 3v12M8 7l4-4 4 4"/><rect x="4" y="15" width="16" height="6" rx="2"/>', name: '让对方继续说', desc: '你戳一下，TA 多说两句', nav: '#continue' },
      { ico: '<path d="M4 5h16v11H4z"/><path d="M8 20h8M12 16v4"/><path d="M9 9.5l2 2 4-4"/>', name: '会话外观 · 气泡背景', desc: '换气泡颜色、圆角和聊天背景图', nav: 'mate' }
    ]
  },
  {
    name: '工具', sub: '收拾用的', rows: [
      { ico: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>', name: '搜索聊天记录', desc: '一句话搜全部：聊天 / 信 / 收藏 / 字卡 / 心愿', nav: '#search', more: { d: '聊天 · 信 · 收藏 · 字卡 · 心愿' } },
      { ico: '<path d="M12 20.5S4.5 15.2 4.5 9.9A4.9 4.9 0 0 1 12 7.1a4.9 4.9 0 0 1 7.5 2.8c0 5.3-7.5 10.6-7.5 10.6z"/>', name: '联系人与群聊', desc: '加几个 TA，建一个群聊一起聊', nav: 'chats', more: { d: '加几个 TA · 建个群' } },
      { ico: '<path d="M4 7h9M4 12h6M4 17h8"/><path d="M17 5v14M14 8l3-3 3 3"/>', name: '置顶 · 归档 · 删除', desc: '常聊的置顶，不聊的收进归档', nav: 'chats' },
      { ico: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/>', name: '桌面前台横幅', desc: '前台来消息，顶部弹一条横幅', sw: () => (data.appearance || {}).deskPopup !== false, set: v => { if (!data.appearance) data.appearance = {}; data.appearance.deskPopup = v; } },
      { ico: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/>', name: '系统通知', desc: '切后台收到消息·来信·来电，弹系统通知（点通知直达那一本）', sw: () => !!(data.appearance || {}).bgNotify, set: v => { if (!data.appearance) data.appearance = {}; data.appearance.bgNotify = v; } },
      { ico: '<path d="M12 3v18M5 8l7-5 7 5"/><path d="M4 21h16"/>', name: '后台保活', desc: '切后台也活着，消息不会漏掉', sw: () => !!(data.appearance || {}).bgKeepAlive, set: v => { if (!data.appearance) data.appearance = {}; data.appearance.bgKeepAlive = v; } },
      { ico: '<path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z"/>', name: '夜间免打扰', desc: '夜里 23:00–07:00 那一档，TA 不主动发消息、也不主动打来；三档（每晚问我／到点自动开／不用了）在设置 → 提醒 里选，只有直达不做第二份开关', nav: '#night' },
      { ico: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/><line x1="4" y1="4" x2="20" y2="20"/>', name: '主动消息管理', desc: '批量关闭哪些联系人和群不再有 TA 主动发消息；单聊群聊同一道闸，回话与来电不受影响', nav: 'silent', more: { d: '批量关闭谁主动发消息 · 单聊群聊都算' } },
      { ico: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>', name: '提示音', desc: '消息和来电各配一声提示音', nav: '#sound' },
      { ico: '<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M9.5 18.5h5"/>', name: '安装到桌面', desc: '装到桌面，像 App 一样打开', nav: '#install' },
      { ico: '<path d="M4 7V5h16v2M12 5v14M9 19h6"/>', name: '字号', desc: '全站文字 80~140% 拖杆调节，拖到哪当场变多大', nav: '#uifont', more: { d: '80~140% 拖杆 · 实时预览' } },
      { ico: '<path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z"/><path d="M12 8v5M12 16h.01" stroke-width="2.2"/>', name: '诊断信息', desc: '设备与存储的体检报告，能复制导出', nav: '#diag', more: { d: '排障报告 · 可复制导出' } },
      { ico: '<path d="M4 4.5h16v15H4z"/><path d="M8 9h8M8 13h8M8 17h5"/>', name: '许可与关于', desc: '禁止二传二改，禁止商用倒卖', nav: '#about' },
      { ico: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>', name: '桌面美化', desc: '壁纸（六款内置渐变或自己选一张）· 压暗 · 缩放 · 取景 · 铺到 只有首页/所有页面 · 导航条薄纱', nav: '#desk', more: { d: '壁纸 · 压暗 · 铺到哪' } },
      { ico: '<path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2.5h6.5A2.5 2.5 0 0 1 21 9v9.5A2.5 2.5 0 0 1 18.5 21h-13A2.5 2.5 0 0 1 3 18.5z"/>', name: '数据备份', desc: '导出 / 导入，7 天没备份会提醒', nav: '#data', more: { d: '导出 · 导入 · 7 天提醒' } },
      { ico: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', name: '设置', desc: '四格：提醒 · 外观 · 数据 · 关于', nav: 'settings', more: { d: '提醒 · 外观 · 数据 · 关于', i: '<line x1="3" y1="6" x2="5.5" y2="6"/><line x1="10.5" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="12.5" y2="12"/><line x1="17.5" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="7.5" y2="18"/><line x1="12.5" y1="18" x2="21" y2="18"/><circle cx="8" cy="6" r="2.5"/><circle cx="15" cy="12" r="2.5"/><circle cx="10" cy="18" r="2.5"/>' } }
    ]
  }
];

// 功能页里「切 tab + 展开折叠卡」的直达（设置页分区入口用）：当场给那张卡挂 open，不写任何账
// （折叠状态本就只活在当前这一屏，BUGS #228）
function _hubGoFold(tab, fold) {
  showView('settings');
  const t = document.querySelector(`.settings-tab[data-tab="${tab}"]`);
  if (t) t.click();
  const card = document.querySelector(`.setting-card[data-fold="${fold}"]`);
  if (!card) return;
  card.classList.add('open');
  setTimeout(() => card.scrollIntoView({ block: 'center' }), 60);
}

function renderHubPage() {
  const body = $('#hubBody');
  if (!body) return;
  const rows = [];
  let onCount = 0, rowCount = 0;
  body.innerHTML = HUB_GROUPS.map(g => {
    const rowsHtml = g.rows.map(r => {
      rowCount++;
      let right = '<span class="hub-chev">›</span>', badge = '';
      if (r.badge) {
        const n = r.badge() || 0;
        if (n > 0) badge = `<span class="hub-badge">${n > 99 ? '99+' : n}</span>`;
      }
      if (r.sw) {
        const on = !!r.sw();
        if (on) onCount++;
        right = `<span class="hub-tg${on ? '' : ' off'}" data-hub-sw="${rows.length}"></span>`;
      } else {
        onCount++;
      }
      rows.push({ r });
      return `<button type="button" class="hub-row" data-hub-idx="${rows.length - 1}"><span class="hub-ico">${_hubIco(r.ico)}</span><span class="hub-tx"><b>${r.name}</b><small>${r.desc}</small></span>${badge}${right}</button>`;
    }).join('');
    return `<div class="sec"><b>${g.name}</b><span>${g.sub}</span><i></i></div><div class="hub-list">${rowsHtml}</div>`;
  }).join('');
  const stat = $('#hubStat');
  if (stat) stat.innerHTML = `已开启 ${onCount} 项<br>共 ${rowCount} 项`;
  body.dataset.rows = JSON.stringify(rows.map(x => ({ nav: x.r.nav, sw: !!x.r.sw })));
}

function bindHubView() {
  const body = $('#hubBody');
  if (!body) return;
  body.addEventListener('click', e => {
    const rows = JSON.parse(body.dataset.rows || '[]');
    const rowEl = e.target.closest('[data-hub-idx]');
    if (!rowEl) return;
    const def = rows[Number(rowEl.dataset.hubIdx)] || {};
    const conf = (HUB_GROUPS.flatMap(g => g.rows))[Number(rowEl.dataset.hubIdx)] || {};
    if (def.sw && conf.sw) {
      // 既有开关又能直达的行：点开关钮＝切开关，点行身＝进那一页（纯开关行仍整行可切）
      if (!def.nav || e.target.closest('[data-hub-sw]')) {
        conf.set(!conf.sw());
        save();
        renderHubPage();
        return;
      }
    }
    const nav = def.nav;
    if (!nav) return;
    _hubRoute(nav);
  });
}

// '#' 那种动作直达的**唯一路由**（2026-10-14 BUGS：原本这段只活在 bindHubView 里，而「更多」那一列的行
// 走的是 js/settings.js 的 [data-view] 一次性绑定＝showView 只认纯视图名，'#' 开头一律静默 return
// ＝更多页那四枚（字号·诊断信息·桌面美化·数据备份，同病的还有 搜索聊天记录·问问TA）点了没反应。
// 抽成全局函数后两处共用一个投递口：bindHubView 走这里，settings.js 见 '#' 开头的 data-view 也交到这里。
// 冒烟尺 _smoke_hub_rows.js 的 A2 静态扫的是 hub.js 全文找 "nav === '#…'" 分支，抽函数不挪走分支＝尺照过）
function _hubRoute(nav) {
    if (nav === '#ask') { showView('chat'); const b = document.getElementById('askBtn'); if (b) b.click(); return; }
    if (nav === '#chat') { showView('chat'); enterChatAtLatest(); return; }   // 功能中心进聊天＝打开会话，定位到最新（BUGS #014）
    if (nav === '#data') { _hubGoFold('data', 'data'); return; }   // 数据备份那一格住在 数据 这一格里（:195 的「安装到桌面」走的是同一条路）
    if (nav === '#desk') { _hubGoFold('desk', 'deskbg'); return; }   // 桌面背景已内联进 设置→外观（原浮层美化台 2026-10-15 改版），直达那一格
    if (nav === '#search') { if (typeof openSearch === 'function') openSearch('all'); return; }   // 统一搜索是全屏浮层，不走 showView（这一条搜全部五类＝聊天/信/收藏/字卡/心愿，首页那条只搜聊天记录，FIX 2026-10-09 #226）
    // ↓ 以下是聊天页内的动作行：先进会话，再触发对应的按钮/面板（入口全在 view-chat.html 输入栏与消息长按条）
    if (nav === '#poke') { showView('chat'); enterChatAtLatest(); if (typeof openPokePanel === 'function') openPokePanel(); return; }
    if (nav === '#stickers') { showView('chat'); enterChatAtLatest(); const b = document.getElementById('openStickers'); if (b) b.click(); return; }
    if (nav === '#image') { showView('chat'); enterChatAtLatest(); const b = document.getElementById('chatImageBtn'); if (b) b.click(); return; }
    if (nav === '#speak') { showView('chat'); enterChatAtLatest(); showToast('点气泡右下角那枚小喇叭，就能听 TA 念一遍'); return; }
    // 「让对方继续说」的首页入口：入口已收成「点顶部昵称」，输入栏那枚按钮没了，
    // 这里不再去 click 一个不存在的按钮（原先查不到就弹「去设置里打开」，等于入口彻底失效），
    // 直接调同一份 continueChat。仍守 csTriggerName：那个开关关掉＝整个功能停用，首页也不该绕过它
    if (nav === '#continue') {
      showView('chat'); enterChatAtLatest();
      if (!(data.behavior && data.behavior.csTriggerName)) { showToast('「点昵称触发」在 TA 的设置里关着'); return; }
      if (typeof continueChat === 'function') continueChat();
      return;
    }
    // ↓ 设置页内的分区直达：切 tab 再当场展开对应折叠卡（展开不记账，见 _hubGoFold 上方注释）
    if (nav === '#sound') { _hubGoFold('notify', 'sfx'); return; }
    if (nav === '#night') { _hubGoFold('notify', 'night'); return; }   // 夜间免打扰那一格住在 提醒 这一格里（三档 chips 在页内选，这里只带路）
    if (nav === '#uifont') { _hubGoFold('desk', 'uifont'); return; }   // 「字号」那一格住在 外观 那一格里（uifont 折叠卡），不是设置页顶上
    if (nav === '#diag') { _hubGoFold('data', 'diag'); return; }
    if (nav === '#about') { _hubGoFold('about', 'about'); return; }   // 许可卡 2026-10-13 晚独立成「关于」格（原挂数据格末尾）
    if (nav === '#install') {
      _hubGoFold('data', 'data');
      const btn = document.getElementById('installAppBtn');
      if (btn && !btn.hidden) btn.click();
      else showToast('浏览器还没给安装入口 —— 用菜单里的「添加到主屏幕」');
      return;
    }
    showView(nav);
}

// ===== 「更多」那一列：名单·顺序·组别·名字全从上面那本册子现派生（2026-10-13 BUGS #300 二批）=====
// 一行上不上这一列 ⟺ 它带 more 那一格。三个字段各有来由：
//   d = 这一列自己的短句（册子里那句 desc 是「一整段说明」，最长的有九十字＝搬进一行会折成三四行，
//       两族形制各有读法，不是抄漏）
//   i = 图标线稿**只在**这一列画的与册子不同的那三枚才给（收藏＝书签∶心愿＝星∶设置＝三滑杆；
//       册子里 收藏 与 心愿 用的是同一枚心形，搬过来这一列就分出两枚一样的人形——一枚记号一个意思）
//   b = 未读角标的 id（写手仍是下面那个 updateHomeIndex 一处，id 不换名＝tileMailDot 从首页搬来时那条先例）
// 只有带 nav 的行才进这一列：这一列是「直达」，没地方可去的行摆上去就是一枚点不动的死件
const MORE_TAB_KEY = 'ordinal-more-tab';
const MORE_CHEV = '<svg viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1.6 1.4 6.8 7l-5.2 5.6"/></svg>';

function _moreGroups() {
  return HUB_GROUPS.map(g => ({ name: g.name, rows: g.rows.filter(r => r.more && r.nav) })).filter(g => g.rows.length);
}

function _moreLineHTML(r) {
  const m = r.more;
  return `<button type="button" class="more-line" data-view="${r.nav}"><span class="more-ico">${_hubIco(m.i || r.ico)}</span><span class="more-tx"><b>${r.name}</b><small>${m.d}</small></span>${m.b ? `<span class="unread-badge" id="${m.b}" hidden></span>` : ''}<span class="more-chev" aria-hidden="true">${MORE_CHEV}</span></button>`;
}

function renderMorePage() {
  const list = $('#moreList'), tagRow = $('#moreTags');
  if (!list || !tagRow) return;
  const gs = _moreGroups();
  if (!gs.length) return;
  let cur = '';
  try { const v = localStorage.getItem(MORE_TAB_KEY); if (gs.some(g => g.name === v)) cur = v; } catch (e) {}
  if (!cur) cur = gs[0].name;
  // 只剩一组还摆一排 tag＝一枚永远选中·点了什么都不变的假控件（本仓「只剩一档别留控件」那条）
  tagRow.hidden = gs.length < 2;
  tagRow.innerHTML = tagRow.hidden ? '' : gs.map(g =>
    `<button type="button" class="more-tag${g.name === cur ? ' on' : ''}" data-more-tab="${g.name}">${g.name}</button>`).join('');
  list.dataset.moreCur = cur;
  // 哪一组在屏上由 JS 当场挂 hidden：CSS 里按组名列一份白名单＝第二份名单（册子加一组，
  // 那一组要么永远藏不住、要么被那条选择器整组漏掉），两本账必漂（同 #065 那条「名单只有一处」）
  list.innerHTML = gs.map(g => `<div class="more-grp"${g.name === cur ? '' : ' hidden'} data-more-grp="${g.name}">${g.rows.map(_moreLineHTML).join('')}</div>`).join('');
  updateHomeIndex();   // 两枚角标只在它们各自那一组里有宿主：换组后不重算＝屏上留着上一组的空位
}

function bindMoreView() {
  const tagRow = $('#moreTags');
  if (!tagRow) return;
  tagRow.addEventListener('click', e => {
    const tb = e.target.closest('[data-more-tab]');
    if (!tb) return;
    const name = tb.dataset.moreTab, list = $('#moreList');
    if (!list || list.dataset.moreCur === name) return;
    list.dataset.moreCur = name;
    list.querySelectorAll('.more-grp').forEach(g => { g.hidden = g.dataset.moreGrp !== name; });
    tagRow.querySelectorAll('.more-tag').forEach(b => b.classList.toggle('on', b.dataset.moreTab === name));
    try { localStorage.setItem(MORE_TAB_KEY, name); } catch (err) {}
    updateHomeIndex();
    // 不滚页：这一列每组最多八行、设计承诺是一屏装完（css/more.css 那条 C2 预算），
    // 而 tag 行本来就坐在列表上方——用户看得见切完的结果，不需要把他拽回顶
  });
}

// 未读角标与整册入口行的小字：信箱未拆那一枚 ∶ 朋友圈未看提醒那一枚（2026-10-12 功能重做回来，两处都只写「更多」页那两行）
// 信箱那侧只算已到站的：路上那一程还没到手，不算未读
// 2026-10-09：这枚宿主从首页磁贴搬进「更多」那一页（用户定档「只跟到更多页那两行」），id 与写手一字未动
// 函数名沿用 updateHomeIndex＝历史名（它原来写首页那条「使用大全」入口行，该行 2026-10-07 按用户判定已删；
// 2026-10-11 起它写的是「更多」那一页最后一行的小字，那一行由设置页那一格搬来＝id 仍不改名，BUGS #300）；
// 不改名是因为调用面跨 5 个文件 8 处，其中 mailbox/render 等件常被并行整文件覆盖，改名会造出「调用方指向已删符号」那一类崩（BUGS #111 同族）
// 2026-10-13 二批：那一行整册入口的小字随「列改为派生」没了宿主（项数与组名只剩册子自己那一处读数 #hubStat），
// 这一支自此只画两枚角标＝删的是没人的那一支，不是「不再报项数」这件事丢了
function _setTileBadge(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  el.hidden = n <= 0;
  el.textContent = n > 99 ? '99+' : (n > 0 ? String(n) : '');
}

function updateHomeIndex() {
  if (typeof data === 'undefined' || !data) return;
  _setTileBadge('tileMailDot', (data.receivedLetters || []).filter(m => !m.read).length);
  _setTileBadge('tileMomentDot', typeof momentsUnreadTotal === 'function' ? momentsUnreadTotal() : 0);
}

bindHubView();
// 「更多」那一列的行在册子的件里就画好＝settings.js 那条 $$('[data-view]') 是加载时一次性绑定的（不是委托），
// 晚一步生成的行拿不到点击；js_order 里 hub 排在 settings 之前，故这里画完、那边绑定时这些行已在 DOM 里。
renderMorePage();
bindMoreView();
// 页面藏起来时跳过（耗电优化）：回前台后下一跳（≤5s）自然补算；相关事件路径里另有 8 处直调
setInterval(function () { if (document.hidden) return; updateHomeIndex(); }, 5000);
