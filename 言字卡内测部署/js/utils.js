// ===== 通用工具函数 =====

const CARD_CATEGORIES = ['主字卡', '颜文字', 'emoji', '表情包', '图片', '拍一拍', '语音', 'TA心里话'];
// 只由内置预置组供给的分类：引擎按「组名」取这些卡，用户在这个分类下新建的组没有任何消费方。
// 2026-10-04 用户直派「字卡库和系统预设字卡完全分开，是两个应用」：这两个分类**硬隔离**——
// 字卡库那一面永不列出 PRESET_ONLY_CATEGORIES 的 tab，存档里即使残留自建的同分类组也不给它回来
// （原口径是「存档有自建组就让 tab 回来，不留孤儿」，现已作废）。
// 残留自建组不是消失而是归位到「主字卡」：db.ensureData 的分类清洗里有一处兜底（见 db.js），
// 引擎按「组名+分类」取预置卡，自建组换分类不影响预置组，两边各归各位。
const PRESET_ONLY_CATEGORIES = ['TA心里话'];
// 「系统预设字卡」那一面的分类＝哪个功能在用这批话术，不是字卡的物理类型（CARD_CATEGORIES 那八档只管取卡）。
// 名单按各组的真实读方现定：收藏夹 collect.js／信箱 mailbox.js／
// 头像昵称 avatarlib.js／心愿 wish.js／世界感知·问问TA·里程碑 cjian.js 与 mailbox.js 的调度。
// 认的是**组名**——与引擎按名取卡、markPresetGroups 按名认回同一口径；预置组没有改名入口，删了重建就是用户自己的组。
// 表里没有的预置组落「其他」，不静默藏卡。
const PRESET_FEATURES = ['收藏夹', '信箱', '头像昵称', '心愿', '邀请', '世界感知', '问问TA', '里程碑'];
const PRESET_FEATURE_OF = {
  '收藏理由': '收藏夹',
  '写信理由': '信箱', '信的回应': '信箱',
  '印象': '头像昵称', '形象自评': '头像昵称',
  '心愿': '心愿', '心愿回响': '心愿', '心愿回应': '心愿', '心愿促成': '心愿',
  // 「邀请答复」自 2026-10-11 起归「邀请」自己那一格（BUGS #270 的融合撤销：它的唯一读方是 js/invite.js 的 invTick，不再是 wish.js）
  '邀请答复': '邀请',
  '状态签名': '世界感知', '天气的话': '世界感知', '回忆引子': '世界感知', '梦境': '世界感知', '体感': '世界感知', '情绪的话': '世界感知', '读到的你': '世界感知',
  // 2026-10-08 六批新添的六池：与上面同档，全部落「世界感知」那一格，在「功能 → 系统预设字卡」里可查看可改可删
  '示软的话': '世界感知', '心动的话': '世界感知', '说明白的话': '世界感知', '干扰的话': '世界感知', '距离的话': '世界感知', '此刻在做的话': '世界感知',
  'TA的问题': '问问TA', 'TA的回答': '问问TA',
  '里程碑': '里程碑',
};
function presetFeatureOf(g) { return PRESET_FEATURE_OF[(g && g.name) || ''] || '其他'; }
// 分类行只列「预置组里真有的」那几档，一枚空 tag 都不出
function presetFeatureTabs(groups) {
  const have = new Set((groups || []).filter(g => g && g.preset).map(presetFeatureOf));
  const out = PRESET_FEATURES.filter(f => have.has(f));
  if (have.has('其他')) out.push('其他');
  return out;
}
// 世界感知投进聊天那一条＝哪一行功能说的话：消息上只存线键（m.cjLine），文案在渲染侧现取——
// 改一次措辞不打断旧消息（与 #156 的 m.call「文案与账解耦」同一条手法）。
// 名字逐字对齐这一页已有的叫法（功能中心那一册的行名／卡内那一枚键名），一件事只有一处命名，不另起一套。
// 旧消息没带线键＝回落「世界感知」，绝不替它猜是哪条线（猜错就是把一句话挂到别人名下，#051 那一族）。
const CJ_LINE_LABEL = {
  status: '状态签名', mood: '情绪感知', read: 'TA 读你', soft: '示软', beat: '心动', und: '说明白',
  ng: '干扰', pres: '靠近感知', act: '此刻', sky: '天气', feel: '体感',
  dream: '梦', flash: '回忆闪回', ask: 'TA 想问你', mile: '里程碑'
};
function cjLineLabel(k) { return CJ_LINE_LABEL[k] || '世界感知'; }
const POKE_PRESETS = ['拍了拍你的头', '拍了拍你的脸蛋', '拍了拍你的肩膀', '拍了拍你的背', '捏了捏你的手手', '戳了戳你的腰', '摸了摸你的头发', '揉了揉你的耳朵', '弹了弹你的脑门', '蹭了蹭你的脸颊', '拽了拽你的衣角', '勾了勾你的手指'];
// 字卡作用域：public=公用字卡（所有会话共用）/ own=专属字卡（必须绑定联系人，只有那个会话能用）
function cardScope(g) { return (g && g.scope === 'public') ? 'public' : 'own'; }
// 主 TA 的会话：信箱写信/回信这类不面向某一具体会话的自动行为，
// 取卡与投递都以它为准（c0 被删时回落到联系人表第一位，不再往一个已经不存在的会话里发）
function mainChatId() {
  const cs = (data && data.contacts) || [];
  if (cs.some(c => c.id === 'c0')) return 'c0';
  return (cs[0] && cs[0].id) || (data && data.activeChat) || 'c0';
}
// 一个会话算哪几份绑定：单聊＝它自己；群聊＝群本身＋每一位成员（成员存的是名字，按同名非群联系人回查，
// 手法与 minimax.js mmVoiceOwner 一致）——所以把字卡绑给某个人，他所在的群自动也认这张卡
function chatCardOwners(chatId) {
  const id = chatId || (data && data.activeChat) || 'c0';
  const c = (data.contacts || []).find(x => x.id === id);
  if (!c || c.kind !== 'group' || !(c.members || []).length) return [id];
  const out = [id];
  c.members.forEach(n => {
    const m = (data.contacts || []).find(x => x.kind !== 'group' && x.name === n);
    if (m && out.indexOf(m.id) < 0) out.push(m.id);
  });
  return out;
}
// 硬隔离（2026-10-05 用户定档）：公用组人人可用；专属组只对绑定的那位联系人（含其所在群）可见；
// 专属但未绑定＝任何会话都取不到，字卡库那一面会在卡面标出来提醒去绑（旧的「未绑定＝所有联系人共用」作废）
// #411 使用权开关：g.off＝整组停用，任何会话都取不到（组内单卡各自的开关一字不动，重新启用分组即恢复原样，
// 与 mochi #926 的 cc-groups-off 同一口径）。收在这一把总闸上＝聊天回复池/写信/朋友圈/拍一拍/表情/语音/
// TA心里话等一切走 groupUsableFor 的自动抽取自动跟上，不留第二份写法。
function groupUsableFor(g, chatId) {
  if (!g) return false;
  if (g.off) return false;
  if (cardScope(g) === 'public') return true;
  if (!g.contactId) return false;
  return chatCardOwners(chatId).indexOf(g.contactId) >= 0;
}
// ===== #411 单卡开关（分组停用只叠一层，单卡开关各自记账） =====
// 存法＝组对象上的 g.offCards（内容记账，不按下标——移动/增删卡后记账不错位）：
//   文字卡记原文；语音卡记 'v|'+名称（录音字节大，不整串存；同组同名两张语音算同一张）；图片对象卡
//   内联 c.off（对象本就带 img 一位，不另起册）。mochi 的 dc-off-<分类>:<内容> 同思路。
// 口径：停用只摘「TA 自动用」的那一路（回复池/写信/朋友圈/表情/语音/TA心里话…），
//   字卡库与系统预设字卡两面照常显示（带「已停用」标记），用户自己的手动面板不受影响。
function cardOffKey(c) {
  if (typeof c !== 'string') return null;
  const v = voiceCardParts(c);
  return v ? 'v|' + v.name : c;
}
function cardIsOff(g, c) {
  if (!g) return false;
  if (c && typeof c === 'object') return !!c.off;   // 图片卡：内联
  const k = cardOffKey(c);
  return !!(k && Array.isArray(g.offCards) && g.offCards.indexOf(k) >= 0);
}
function cardSetOff(g, c, off) {
  if (!g) return;
  if (c && typeof c === 'object') { if (off) c.off = 1; else delete c.off; return; }
  const k = cardOffKey(c);
  if (!k) return;
  const arr = Array.isArray(g.offCards) ? g.offCards : (g.offCards = []);
  const i = arr.indexOf(k);
  if (off && i < 0) arr.push(k);
  if (!off && i >= 0) arr.splice(i, 1);
  if (!arr.length) delete g.offCards;   // 空册不留：存档里不养死字段
}
// 删除/改名一张卡时摘掉它的记账（旧内容已不在，留着＝死键）
function cardOffPrune(g, c) { cardSetOff(g, c, false); }

// 出厂的「TA 占位名」：2026-10-05 起统一叫「梦角1」。原来叫 Ordinal（= 项目/品牌名），
// 当人名用时读着像个系统名而不是一个人物，且信箱页署名会直接把它印出来。
// 改名只动这一处常量，改名后所有走 TA_FALLBACK_NAME 的兜底同时生效。
// ⚠ 2026-10-13 起它**不再出现在任何出厂档里**（用户「首次进入网站默认有联系人【梦角1】…
// 用户还没创建联系人怎么可能出现」）：defaults.contacts 改为空册、profile.name 改为空串，
// 这一枚只剩三个消费者——老存档 Ordinal→梦角1 的迁移、mate 页空框回落、群成员兜底。
const TA_FALLBACK_NAME = '梦角1';
// 「一个联系人都还没有」时满屏读到的那个中性指称。与 TA_FALLBACK_NAME 分开两枚：
// 后者是人名（会被印成「梦角1 给你发消息」），前者是全站一直用的中性「TA」
// （「TA 正在想怎么回你」「挑一句 TA 想过的」同一族）。混用＝全新安装的统计页
// 会写「去和『梦角1』聊聊天吧」——用户报的正是这种「还没建联系人就有个名字」。
const TA_NEUTRAL_NAME = 'TA';

function partnerName() { return (data.profile && data.profile.name) || TA_NEUTRAL_NAME; }
// TA 在聊天里的名字/头像：覆盖位就挂在联系人对象上（c.chatName / c.chatAvatar，
// 由头像昵称库与 TA 的设置页写入），没设过（空串）就沿用基础资料那一份。
// 这两枚是「取谁」的唯一口径——此前它散在各处：聊天页头部读覆盖位，首页那一行与长按动作单只读 name，
// 于是 TA 换了昵称后屏上有一面变了、另一面没变（#192 给「我」那侧收过同一族，TA 这侧漏了＝BUGS #246）。
// 展示点分两族走：**聊天里**（聊天页头部/首页会话行/长按动作单/消息署名）走 chatNameOf；
// **聊天以外**（字卡库/信箱/世界感知/纪念日/主动消息/写信统计/邀请/玩家那票按人页面）走 fixedNameOf
// （#346 起，理由见那个函数的注释）。不留第三份实现。
// ⚠ 群成员的回复档位仍按**名字**键（#104），那是数据身份不是显示名，不许跟着这条链一起换。
function chatNameOf(c) { return (c && (c.chatName || c.name)) || ''; }
// 固定昵称（2026-10-13 用户定档，BUGS #346）：**聊天以外**的功能（字卡库/信箱/世界感知/纪念日/
// 主动消息管理/写信统计/邀请/玩家那一票按人设置的页面）一律读这一枚。它与聊天昵称分开的理由是用户
// 原话：「头像和昵称功能里联系人主动更换的昵称与这个分开，因为这个功能可能更换昵称太频繁，
// 导致其他功能里的昵称也是一直换」——于是那口池子怎么换都只动 chatName，其他功能的牌子不动。
// 取值口径与 chatNameOf 同构：fixedName 空串（没单独设过）＝回落 c.name 那一份。
// ⚠ 新建联系人时两格一起设（html/view-chats.html 那张表单）；老档由 db.js 的 _fixedNameSeeded
//    一次性按「当时的聊天显示名」补种，升级不改屏上任何名字（见那条迁移的注释）。
function fixedNameOf(c) { return (c && (c.fixedName || c.name)) || ''; }
// 当前会话那位的固定昵称（其他功能的页面要「现在这位」时走这一枚，不留第二份取法）
function activeFixedName() {
  const c = (typeof currentContact === 'function' && currentContact()) || null;
  return fixedNameOf(c) || partnerName();
}
function chatAvatarOf(c) { return (c && (c.chatAvatar || c.avatar)) || ''; }
function chatPartnerName() {
  const c = (typeof currentContact === 'function' && currentContact()) || null;
  return chatNameOf(c) || partnerName();
}
function chatPartnerAvatar() {
  const c = (typeof currentContact === 'function' && currentContact()) || null;
  return chatAvatarOf(c) || '';
}
// 我在**这一本会话里**的名字/头像（2026-10-08 用户定档「按会话分开，同 TA 那一侧」）。
// 与 TA 那侧同构：会话对象上的 myChatName/myChatAvatar 是覆盖位，没设过（空串）就沿用全局 data.me 那一份。
// cid 缺省＝当前会话；群聊也各自有一格（群是一份会话）。
function chatMyRowOf(cid) {
  const id = (cid === undefined ? data.activeChat : cid) || '';
  if (!id) return null;
  return (data.contacts || []).find(c => c && c.id === id) || null;
}
function chatMyName(cid) {
  const c = chatMyRowOf(cid);
  return (c && typeof c.myChatName === 'string' && c.myChatName) || (data.me && data.me.name) || '我';
}
function chatMyAvatar(cid) {
  const c = chatMyRowOf(cid);
  return (c && typeof c.myChatAvatar === 'string' && c.myChatAvatar) || (data.me && data.me.avatar) || '';
}

// ===== 表情包：字卡库「表情包」分类 = 图片字卡（{img: dataURL}），分组名即 tag =====
function cardImage(c) {
  return (c && typeof c === 'object' && typeof c.img === 'string') ? c.img : null;
}
// 文字字卡取值：字卡库里文字卡一律落库为**纯字符串**（cards.js 添加/导入两条路径都是 push(c)，
// c 本身是字符串），但 mochi 早期版本曾用 {text} 对象。取文字必须两态都认，
// 只认 c.text 会把整个分组取空（BUGS #056：拍一拍面板有分组无卡）。
function cardText(c) {
  if (typeof c === 'string') return c;
  if (c && typeof c === 'object' && typeof c.text === 'string') return c.text;
  return '';
}
/* 全库文字卡 → 所属分类的一张索引（聊天统计的「常用字卡」∶ 写信统计的「类型」两格共用一份）。
   两处各自遍历一遍 data.groups 迟早会漂（一处认 c.text、一处只认字符串＝同一个问题两种答案，
   BUGS #056 那一族），故收一处。同名卡后写的覆盖前写的＝与 buildCardRank 上线以来的行为一字相同。
   传 chatId＝只收**那一本取得到**的组（走 groupUsableFor 那把硬隔离尺，#051）：写信统计按人筛时
   若拿全库比，会把「绑给别人的专属句」算成这位抽过的卡＝又一个「按人记账、按全局落地」。 */
function cardLibIndex(chatId) {
  const lib = {};
  for (const g of data.groups || []) {
    if (chatId && !groupUsableFor(g, chatId)) continue;
    for (const c of (g.cards || [])) {
      const t = cardText(c);
      if (t) lib[t] = g.category || '主字卡';
    }
  }
  return lib;
}
/* 把「拼起来的一段话」拆回候选卡：拼句只往中间塞连接符（pyJoinCards），所以按标点与空白切开就能还原。
   拆句子这件事只能有一把尺＝字卡适应度页与写信统计都在数「这句话是不是库里那张」，
   两处各写一份正则，改一处另一处就悄悄少算（原 CF_SEG 住 js/cardfit.js，此处收为公用）。 */
const CARD_SEG = /[，。、！？；：…—\s,.!?;:\n]+/;
function cardSegs(text) { return String(text == null ? '' : text).split(CARD_SEG).map(x => x.trim()).filter(x => x); }
// 联系人的表情池：优先字卡库「表情包」分类全部图片，无则回退 data.stickers（我的表情）
// chatId 省略＝当前会话（聊天里 TA 发图）；信箱那类不面向具体会话的自动行为传 mainChatId()
function partnerStickers(chatId) {
  const out = [];
  (data.groups || []).forEach(g => {
    if ((g.category || '主字卡') !== '表情包' || !groupUsableFor(g, chatId)) return;
    (g.cards || []).forEach(c => { const img = cardImage(c); if (img) out.push(img); });
  });
  return out.length ? out : (data.stickers || []);
}
// 这一张图在字卡库里属于哪一档：「图片」分类＝大档，其余（含我自己上传的表情包、我的表情池）＝表情包档
function imageCardSet() {
  const set = new Set();
  (data.groups || []).forEach(g => {
    if ((g.category || '主字卡') !== '图片' || !Array.isArray(g.cards)) return;
    g.cards.forEach(c => { const img = cardImage(c); if (img) set.add(img); });
  });
  return set;
}
function stickerKindOfSrc(src) {
  if (!src) return 'sticker';
  return imageCardSet().has(src) ? 'image' : 'sticker';
}
// 发进聊天的图＋身份（BUGS #157）：旧写法只把「表情包」分类交给回话池，「图片」分类的卡在聊天里发不出来，
// 于是聊天里永远只有小档、两类无从区分。这里按分类各带身份，发出去的频率仍由原来那一枚 stickerProb 管，
// 不新增概率也不新增开关——只是同一格里多了一类可用的卡。表情包仍为空时回退 data.stickers（老口径不变）
function partnerStickerPool(chatId) {
  const out = [];
  let hasStickerCat = false;
  (data.groups || []).forEach(g => {
    const cat = g.category || '主字卡';
    if (cat !== '表情包' && cat !== '图片') return;
    if (!groupUsableFor(g, chatId)) return;
    (g.cards || []).forEach(c => {
      const img = cardImage(c);
      if (!img || cardIsOff(g, c)) return;
      if (cat === '表情包') hasStickerCat = true;
      out.push({ src: img, kind: cat === '图片' ? 'image' : 'sticker' });
    });
  });
  if (!hasStickerCat) (data.stickers || []).forEach(s => out.push({ src: s, kind: 'sticker' }));
  return out;
}
// 语音字卡（mochi 导入格式）：「名称|||data:audio/...」；MiniMax 合成落库的为
// 「名称|||tts记号|||data:audio」（记号=同句同音色免重复合成）或四段式「名称|||tts记号|||完整文字|||data:audio」（完整文字供通话字幕等用）。
// 非此格式返回 null。名称部分用于字卡库展示/复制
function voiceCardParts(c) {
  if (typeof c !== 'string') return null;
  const segs = c.split('|||');
  if (segs.length < 2) return null;
  const d = segs[segs.length - 1];
  if (d.indexOf('data:') !== 0) return null;
  const name = segs[0];
  const tts = segs.length > 2 ? segs[1] : '';
  const text = segs.length > 3 ? segs[2] : name;
  return { name, data: d, tts, text };
}
// 信箱夹图的图片池：表情包 + 图片 两类图片字卡（mochi 口径：图片分类作图源），无则回退表情池
function partnerImages(chatId) {
  const out = [];
  (data.groups || []).forEach(g => {
    const cat = g.category || '主字卡';
    if (cat !== '表情包' && cat !== '图片') return;
    if (!groupUsableFor(g, chatId || mainChatId())) return;   // 不面向具体会话的自动行为认主 TA 那一份
    (g.cards || []).forEach(c => { if (cardIsOff(g, c)) return; const img = cardImage(c); if (img) out.push(img); });
  });
  return out.length ? out : partnerStickers(chatId);
}
// TA 发得出语音＝字卡库「语音」分类里【这一本取得到】的那些卡（四段式，末段是 dataURL 录音）。
// 刻意不做兜底：库里没有就回空数组，让「语音概率」那一格自己落成「这一条发不出语音」，
// 而不是凭空发一条点开没有声音的气泡（#160 那条铁律：没有依据的话不替 TA 编）。
// 一处取池，回复批与主动发送共用，不留第二份写法。
function partnerVoices(chatId) {
  const out = [];
  (data.groups || []).forEach(g => {
    if ((g.category || '主字卡') !== '语音' || !groupUsableFor(g, chatId)) return;
    (g.cards || []).forEach(c => { if (cardIsOff(g, c)) return; const v = voiceCardParts(c); if (v && v.data) out.push(v); });
  });
  return out;
}

// ===== TA 心里话：TA 解释自己行为（收藏/写信/形象印象）时只能从这里挑字卡 =====
// 世界观：TA 只能用已保存的字卡表达，抽到的理由偶尔和事件不完全贴合，这本身是设定的一部分；
// allowSys=true 时约 10% 返回 sys 标记 =「系统随机，TA 没控制住」，调用方自行决定呈现或跳过
// impress／impressSelf 是两本账（BUGS #401）：impress＝TA 看**我的**新形象（「很配你」这类说用户的句子只在这里成立）；
// impressSelf＝TA 看**自己的**新形象。从前共用一个池＝「TA 更换了头像 · 很配你」——那句说的是用户，
// 挂在自己换形象后面张冠李戴（用户原话「明明是联系人换头像，里面的文案却是关于用户的」）。
// 两池各自可改可删，删了不互相兜底（没有依据的话不替 TA 编，那一侧就不留下看法）。
const TA_REASON_KINDS = { collect: '收藏理由', letter: '写信理由', impress: '印象', impressSelf: '形象自评' };
const _TA_NIGHT_ONLY = /这个点|睡不着|凌晨/;
function taReasonPick(kind, allowSys) {
  const g = (data.groups || []).find(x => (x.name || '') === TA_REASON_KINDS[kind] && (x.category || '主字卡') === 'TA心里话' && groupUsableFor(x, mainChatId()));
  let cards = (g && Array.isArray(g.cards) ? g.cards : []).filter(c => typeof c === 'string' && c.trim() && !voiceCardParts(c) && !cardIsOff(g, c));
  if (!cards.length) return { text: '', sys: false };
  if (allowSys && Math.random() * 100 < 10) return { text: '', sys: true };
  const night = (() => { const h = new Date().getHours(); return h >= 23 || h < 5; })();
  const nightOnly = cards.filter(c => _TA_NIGHT_ONLY.test(c));
  if (night && nightOnly.length && Math.random() < 0.7) cards = nightOnly;
  else if (!night && nightOnly.length) { const rest = cards.filter(c => !_TA_NIGHT_ONLY.test(c)); if (rest.length) cards = rest; }
  return { text: cards[Math.floor(Math.random() * cards.length)].trim(), sys: false };
}

// 多字卡「拼接随机标点」（对齐 mochi pyJoinCards）：每两条字卡中间从启用的符号池随机抽一枚连接；
// 总闸=多字卡回复(pyEnabled)+拼接随机标点(pyPunctEnabled)双开，任一关或池空=固定空格（原行为）
function pyJoinCards(segs, bh) {
  if (!Array.isArray(segs) || !segs.length) return '';
  if (segs.length === 1) return String(segs[0] == null ? '' : segs[0]);
  let pool = null;
  if (bh && bh.pyEnabled && bh.pyPunctEnabled) {
    pool = [];
    if (bh.pyPunctSpace) pool.push(' ');
    if (bh.pyPunctDou) pool.push('，');
    if (bh.pyPunctPer) pool.push('。');
    if (bh.pyPunctEx) pool.push('！');
    if (bh.pyPunctQ) pool.push('？');
    if (bh.pyPunctEl) pool.push('......');
    if (bh.pyPunctDash) pool.push('——');
    if (bh.pyPunctNl) pool.push('\n');
  }
  if (!pool || !pool.length) pool = [' '];
  let out = String(segs[0] == null ? '' : segs[0]);
  for (let i = 1; i < segs.length; i++) out += pool[Math.floor(Math.random() * pool.length)] + String(segs[i] == null ? '' : segs[i]);
  return out;
}

// ===== 邀请那一册的三份常量（BUGS #270 撤销融合：邀请自成一册，读方只有 js/invite.js 与 js/db.js 的清洗）=====
// ⚠ 必须用 var 且住在 utils.js：db.js 在加载序里排在 invite.js **之前**，它清洗旧档时要问这份状态名单；
//   而 utils.js 排在最前（只晚于 data.js）＝两处都读得到同一份。名单写两处的后果 #270 记过：
//   加一档状态漏改一处＝屏上画出一枚哪儿也点不动的签（#051 那一族）。
var INVITE_STATUS = ['waiting', 'accepted', 'declined', 'later'];
// 答复窗口 15~75 分钟：刻意贴合「一会儿」这个日常尺度——几天几十天会让人以为功能没跑（#212 那句「你扯淡吧」），
// 几秒又像机器人秒回。发出那一刻算死存进 replyAt，不在 tick 里现掷（现掷＝每次轮到它都往前挪）
var INV_REPLY_MIN = 15 * 60000, INV_REPLY_MAX = 75 * 60000;
// 固定一档（用户定档「不加设置项」）：TA 收到我的邀请 70% 应下来。调它改这里一行，不在界面上长一格
var INV_ACCEPT_PROB = 70;

const defaults = {
  // 2026-10-13 用户「首次进入网站默认有联系人【梦角1】，删掉，用户还没创建联系人怎么可能出现」：
  // profile.name 出厂为空串（partnerName() 落 TA_NEUTRAL_NAME＝中性「TA」，见该常量注释），
  // 老存档里已落库的「梦角1」一个字不动（那是用户自己的数据，只在从未聊过那一档由
  // db.js 的 _noFactoryContact 一次性清，见那里三条判据）。
  profile: { name: '', avatar: '' },
  me: { name: '我', avatar: '' },
  behavior: {
    rsMin: 1, rsMax: 40, replyMin: 1, replyMax: 2,
    rnProb: 20, touchProb: 5, stickerProb: 10, emojiProb: 5,
    // 「话没挤过来」那一枚（2026-10-10 换向，BUGS #153 二批）：每回应一句之前先掷它，命中＝这一轮不发正文、
    // 只在聊天里落一行居中小字。旧写法把这枚概率钉在「库里取不到任何正文卡」这一个前提上，而那个前提对
    // 往库里加卡的人永不成立＝一整行设置永远不会生效。0＝从不；按联系人各一份，与 rnProb 同一格同一把尺。
    strayProb: 5,
    imageProb: 5, voiceProb: 10, kaomojiProb: 5, quoteProb: 30,
    rcProb: 25, rcRefix: 35,
    // 「禁止联系人撤回消息」默认关闭（2026-10-15 用户定档）：recallEnabled=true＝联系人会按上面的撤回概率触发撤回；
    // 界面上那枚复选框取 !recallEnabled，故此格为 true 时复选框处于未勾选（功能关）那一侧。
    recallEnabled: true,
    pyEnabled: true, pyProb: 50, pyMin: 2, pyMax: 5,
    // 拼接随机标点（对齐 mochi py-punct-*）：总开关 + 八枚符号池，命中多字卡后每两条字卡中间随机抽一枚连接；
    // 总开关关或池全空=固定空格（原行为）。换行默认关（mochi #1198 口径）
    pyPunctEnabled: true,
    pyPunctSpace: true, pyPunctDou: true, pyPunctPer: true, pyPunctEx: true,
    pyPunctQ: true, pyPunctEl: true, pyPunctDash: true, pyPunctNl: false,
    // 让对方继续说（对齐 mochi cs-*）：csNormal=按正常回复时间（关=立即快速回 1 条）；
    // csTriggerName=点顶部昵称触发（唯一入口）。原 csTriggerBar=输入栏那枚「继续说」按钮，
    // 2026-10-08 按用户定档撤掉，只留昵称一处入口——键名一并退役，别让老存档里那个孤儿字段一直躺着
    csNormal: false, csTriggerName: true,
    tsEnabled: true, enterSend: true, batchSend: false,
    asEnabled: true, asProb: 30, asMin: 1, asMax: 5,
    asCountMin: 1, asCountMax: 2, dndEnabled: false, asBadge: true,
    // 「按 TA 此刻在做什么浮动间隔」这一族的开关（出厂开·2026-10-09 用户定档每位一枚 checkbox）：
    // 关掉＝倍率一律按 1，连「换档拉近」也不做（js/chat.js 的 _asPullIn 里那道 mul >= 1 的闸）
    asByState: true,
    // 「已读不回」那一格也按 TA 此刻在做什么浮动（2026-10-11 BUGS #290·出厂开）：
    // 这一枚只管上面那格 rnProb，与 asByState 各管一件事＝关掉一个另一个照旧（别做成一枚总闸）
    rnByState: true,
    // 他主动开口那一刻「说给群而不是说给你」的概率（均分到他所在的每个群，BUGS #216）：
    // 0＝他从不在群里自己冒话；这一格是他这个人的一份，群那份档里没有对应的钟
    asGroupProb: 10,
    // 那两枚问签（「这句说谁」∕「这句本意」）TA 会不会**不等你问就自己标**（BUGS #350）：
    // 出厂 0＝这个新行为不悄悄生效（同 #309 情绪标签那条），想让它自己有，去 TA 的设置 → 回复节奏 开。
    // 两枚各一格＝两件事分开调（一格的语义是「这一句指向谁」，另一格是「这一句是不是 TA 自己想发的」）。
    // 一份档两处开口路径共用（回你话那一批 ∶ 主动发来那句），与那两枚签的总闸 referOn∕meantOn 各管一件事。
    referProb: 0,
    meantProb: 0,
    // TA 会不会自己想起一个日子（2026-10-11 BUGS #271）：按人一份，与上面那族同一格同一把尺。
    // 这枚概率是「机会来了以后真建一条」的那一发；间隔（30~90 天）刻意不设＝一条随机钟自己的区间，
    // 钉死成一个数就成了「每 60 天必冒一条」。0＝这一位不再自己加日子。
    annSelfOn: true, annSelfProb: 60
  },
  // 聊天情绪标签（前作「星言」的三级链 ＋ 前作「mochi」的逻辑连接词，两作同为作者自有前作）。
  // 这份是**全局默认**，每位自己那一本只存被改过的格（data.emotionBy，读侧唯一口径 _emoCfg）＝与信箱
  // _mbCfg、播放器 _plCfg 同族：以后新增一格自动被所有人跟随，不必再写一次迁移。
  // mode 四档：off 关 / xingyan 星言（概率按前作原值写死、连接词整族不参与）/ mochi（可调＋追加按句式选类）
  // / mixed 混合（可调＋连接词纯随机选类）＝**出厂即混合**（2026-10-14 用户定档「需要默认开启混合」）。四格概率 0 都填得进去＝0 是「这一类不再出」，不是回落默认。
  emotion: { mode: 'mixed', probMood: 70, probHeart: 40, probIntent: 40, rcReplaceProb: 30, rcAppendProb: 20 },
  emotionBy: {},
  // 逐张停用：{ mood:{组名:[词…]}, heart:{…}, intent:{…}, connect:{类名:[词…]} }——三档一律生效
  emotionOff: {},
  // 用户改过词表才落一份副本（不默认复制那 425 张进存档）：null＝直接用 js/emotion-data.js 的出厂表
  emotionLib: null,
  mailbox: {
    minCardCount: 20,
    maxCardCount: 50,
    // 一封信里各张字卡之间的连接符（对齐 mochi #1198）：默认关＝老样子只用空格相连；打开后每两条中间
    // 随机抽一枚连接符，抽到「换行」则下一张另起一行。符号池借用聊天那一套（pyPunct*，含「换行」需点亮），
    // 但这个开关只看自己——与聊天页的「多字卡回复／拼接随机标点」互不影响
    punctEnabled: false,
    // 主动写信总开关：关掉＝这一位不再自己寄信；不影响你寄出后 TA 的回信（回信另走 replyProbability）
    writeEnabled: true,
    // 每位每天主动写的封数：默认 1 封（用户定档「每个联系人默认每天只能主动给我写一封」）。
    // 计数只算主动信、按册各计（mailbox.js 的 todayCountLetters）；填 0＝这一位不再自己寄信
    dailyMaxLetters: 1,
    writeProbability: 60,
    minWriteMinutes: 1,
    maxWriteMinutes: 60,
    replyProbability: 80,
    minReplyMinutes: 1,
    maxReplyMinutes: 480,
    useKaomoji: true,
    useEmoji: true,
    useSticker: true
  },
  // 信箱设置按联系人各一份（chatSettings／印象簿 #074 同族）：册里没单独设过的那位
  // ＝回落到上面那份全局值，所以旧存档升级后行为一字不变、不必逐个重设
  // 朋友圈（js/moments.js）：动态一份全局册（每条带 author＝'me' 或某位联系人的 id），
  // 设置按【人】各一份——momentsSettings 是所有 TA 的默认，momentsBy 只存被单独调过的那位（读侧 _mmCfg(cid)）；
  // 提醒那一格（momentPopup）刻意只留全局：关了提醒就该对所有 TA 都安静，按人分会出现「关了 A、B 还在」。
  moments: [],
  momentsCover: '',
  momentsAvatar: '',
  momentsSettings: {
    postEnabled: true,
    publishProbability: 35, dailyMaxMoments: 2,
    minPublishIntervalMin: 90, maxPublishIntervalMin: 480, publishCooldownMin: 60,
    minCardsInMoment: 4, maxCardsInMoment: 15,
    useKaomojiProb: 20, useEmojiProb: 20, useStickerProb: 25, useImageProb: 15,
    multiCardProbability: 60, maxCardsInComment: 4, useStickerInComment: 15,
    likeProbability: 70, likeMinSec: 2, likeMaxSec: 120,
    commentProbability: 45, commentMinSec: 3, commentMaxSec: 180,
    replyProbability: 50, replyMinSec: 2, replyMaxSec: 120,
    returnLikeProbability: 35, taCollectProb: 10,
    momentPopup: true
  },
  momentsBy: {},
  momentNotices: [],   // 互动提醒簿 [{id, kind, by, at, momentId, seen}]，上限 100，点一条直达那条动态
  mailboxSettings: {},
  collectSettings: { taMsgProb: 15, taMailProb: 15 },
  callSettings: {
    answerProb: 60, rejectProb: 15, missProb: 15, busyProb: 10,
    ringMin: 2, ringMax: 5, callMinLen: 1, callMaxLen: 5,
    incomingEnable: true, incomingRingMin: 8, incomingRingMax: 15,
    incomingMin: 60, incomingMax: 180,
    noAutoHangup: true,
    // 接通时按概率随机播放该联系人专属字卡里的语音（MiniMax 合成/导入的语音字卡）
    voiceGreetEnable: true, voiceGreetProb: 60
  },
  sounds: {
    partnerMsg:   { on: true,  preset: 'ding', custom: '' },
    myMsg:        { on: true,  preset: 'note', custom: '' },
    incomingCall: { on: true,  preset: 'ring', custom: '' }
  },
  // 音效按联系人隔离：chatSounds[contactId] = { partnerMsg, myMsg, incomingCall }；
  // 联系人无配置时跟随全局 data.sounds（播放解析在 sound.js _soundCfg）
  chatSounds: {},
  avatarShape: 'circle',
  // 2026-10-13 起出厂**不预置任何联系人**（用户「用户还没创建联系人怎么可能出现」）：
  // 空册 ∶ 空会话表 ∶ 无活跃会话。首页显示「还没有会话」空态（#chatsEmpty 早在册），
  // 点「＋ 新会话」才建第一位。db.ensureData 全新安装路径与各空册守卫同批落地。
  contacts: [],
  chats: {},
  activeChat: '',
  // MiniMax 语音全局账户（key/group/host/model/speed）；音色一人一号——每个联系人在自己资料里绑
  // mmTimbre，没绑的那位没有声音（不回退全局、不借别人的），故此处不再存任何默认音色
  minimax: { on: false, key: '', group: '', host: '', model: '', speed: 1 },
  // 回复设置按联系人隔离：chatSettings[contactId] = 该联系人的 behavior 副本；
  // data.behavior 恒为 chatSettings[activeChat] 的同一引用（db.ensureData 绑定、chats.switchChat 换绑）
  chatSettings: {},
  theme: 'white',
  appearance: {
    deskBg: '',
    deskBgVeil: 44,
    deskBgZoom: 100,
    // 背景模糊（0~40px，2026-10-15 重新启用）：旧的「虚化」杆 2026-10-05 被当作死杆删过（当时卡片实白、壁纸只从缝里露）。
    // 现在「卡片毛玻璃」开时壁纸会透到磨砂卡片后面，这根杆重新有了宿主：糊的是壁纸**本体**（连缝隙与卡片后面一起变软），
    // 与卡片那根「磨砂强度」（只采卡片背后那一层）各管一层、可叠加。0＝不糊＝与旧观感逐字节相同（只有 blur>0 才写 data-ap-deskblur）。
    deskBgBlur: 0,
    deskBgSize: 'cover',
    // 底部导航条那层薄纱的浓淡（只在壁纸真透到屏底的那一面起作用，选择器见 css/base.css 那条同源条件）：
    // 0＝完全透出壁纸，100＝与不挂图时一样实；45 是按逐像素量具定的默认（细节保留 0.60、图标对比不退）
    deskTabVeil: 45,
    deskPopup: true,
    deskPopRows: 2,
    // 壁纸默认只透在首页；开了这一枚才铺到功能页与聊天页（选择器见 css/theme.css 的 data-ap-deskall）
    deskBgAll: false,
    // 底色与层次档（四落点之一）：soft＝默认＝暖光玻璃（暖奶油画布 ∶ 半透白面，台阶 Δ≈11）
    // ∕ frost 霜白（冷调玻璃，同族）∕ warm 暖米（玻璃）∕ flat 纯白（**关掉玻璃**的退路，Δ0）
    // 枚举校验在 js/db.js ensureData，入口 chips 在 html/view-settings.html，令牌在 css/theme.css 末尾
    depth: 'soft',
    // 光影档（三档，与底色档 depth 正交，可任意组合 4×3）：balanced 均衡＝默认（a .78，透光度 −61／台阶 Δ7.5）
    // ／airy 通透（a .70，最透但卡片偏平）／deep 厚重（a .86，层次最强但通透感最弱）
    // ⚠ 为什么是有限三档而不是连续滑块：本仓历史上有过「透明与光影」三个自由滑块（glassBlur/glassAlpha/shadowK，
    //   已在 db.js 一并删净）并整族被撤 —— 自由滑块什么值都调得出来但多数不好看。
    //   枚举校验在 db.js ensureData，入口 chips 在 html/view-settings.html，令牌在 css/theme.css 的 data-ap-light 段
    light: 'balanced',
    // 卡片圆角档（与 light／depth 正交）：small 利落 ∕ medium 标准（默认）∕ large 柔和。
    // 只管两族面：内容卡片（--r-card）与底部弹层顶角（--r-panel），豁免名单见 css/theme.css 的 --r-card 注释。
    // 枚举校验在 js/db.js ensureData，写手在 js/settings.js applyAppearance，令牌在 css/theme.css 末尾
    corner: 'medium',
    // 以下六项 2026-10-06 由「按会话」提到「全局」：机制与 CSS 消费方一直在（data-ap-* 共 22 条规则），
    // 但上线以来没有任何界面能改它们＝零入口。现居 设置 → 外观 →「聊天外观」
    bubbleShape: 'round', density: 'cozy', showTime: true, sendBtn: true,
    fontFamily: 'system', glass: true, glassLite: false,   // glassLite＝省电磨砂：常驻三栏去实时 blur（耗电优化）
    // 卡片毛玻璃（2026-10-15 重做「卡片通透」那一行）：开＝卡片/浮层变半透白＋背景模糊的真·毛玻璃，
    // 关＝实心白面（默认）。四落点：defaults（这里）∶db.js 布尔回落∶settings.js AP_SETS＋applyAppearance 写 body∶
    //   view-settings.html 那行 chips∶theme.css 末尾 body[data-ap-frost=on] 覆盖块。与旧 light 三档（描边浓淡）无关。
    frost: false,
    // 毛玻璃强度（0~24px 背景模糊，只给卡片那一套 frost 用）与「气泡毛玻璃」（frostBubble，聊天外观里那一枚，
    // 住 TA 设置页）：两件事互不依赖。强度走 applyAppearance 写 body 内联 --frost-blur（连续数字）；
    // frostBubble 也走 body 内联 data 属性但写的是全局 appearance（与 glass 同族）——观感在 css/theme.css 的 body[data-ap-frost-bubble=on] 段。
    frostBlur: 14, frostBubble: false,
    // 三组排版新档（2026-10-15，居「TA 的设置 → 聊天外观」）：枚举校验在 db.js ensureData，
    // 写手在 settings.js applyAppearance，令牌在 css/theme.css 的 data-ap-align/-avat/-daypos 段
    alignMode: 'bottom',   // 头像与气泡对齐：bottom 底部对齐（默认）/ top 顶部对齐
    avatarShow: true,      // 聊天里的小头像：开（默认）/关＝气泡通栏
    dayPos: 'flow',        // 日期签位置：flow 消息流里（默认）/ head 钉在顶栏下方（sticky 随滚动换签）
    // 全站字体两样 2026-10-12 也由「按会话」收成**全站一份**（用户定档「字体只留全局一份」）：
    // customFont*＝上传的字体文件，整条 @font-face 连字体本体一起存进这里（不是 blob: 地址——那种地址
    // 只在写下它的那一份文档里有效，重启必失效）；customGlobalFont*＝手打的字体 CSS。
    // 清洗在 js/db.js ensureData，旧档那一份的搬法也在那里，控件在 html/view-settings.html 的「全站字体」那张卡。
    customFontName: '', customFontCss: '',
    customGlobalFontName: '', customGlobalFontCss: '',
    bgKeepAlive: false,
    bgNotify: false,
    bgNotifyNoDedup: false,
    // 全站字号（设置→外观「字号」）：2026-10-15 由「标准/大」两枚 chip 改成一根 80~140 的连续滑杆，
    // 存的是「放大百分比」数字（100＝出厂标准）。生效走 theme.css `.app-shell>*{zoom:var(--ui-zoom)}`，
    // applyAppearance 把数字折成 --ui-zoom 写在 body 上＝拖到哪整站当场跟着变（所见即所得的实时预览）。
    uiFontScale: 100
  },
  // 会话外观（气泡配色/背景图/自定义气泡 CSS）按联系人隔离：chatAppearance[contactId]；applyAppearance 取
  // chatAppearance[activeChat] 叠加全局 appearance 组成视图（皮肤选择已删，固定奶油白）。
  // ⚠ 只有「每位 TA 可以长得不一样」的才留在这里；排版类六项与字体两样已上移全局，别加回来——
  //    chatAppearanceDefault 里的键会被 _caFill 逐会话填满，填了就永远压住全局值（全局档会「点了没反应」）。
  chatAppearanceDefault: {
    mineColor: 'blue', mineText: 'auto',
    partnerColor: 'auto', partnerText: 'auto',
    dayStyle: 'auto', metaColor: 'auto', sysStyle: 'auto',
    chatBg: '',
    // 两栏的透明度（0＝完全不透，100＝全透），各一位 TA 各存一份；只在**这一本传过背景图**时才生效
    // （掐取在 js/settings.js 的 applyAppearance 一处）。0 出厂＝用户报的那句「顶部栏半透明能看到聊天消息」
    // 的默认解，也意味着这不再是一枚「档位」而是一根杆——旧档里那三个字符串由 js/db.js 的 _caVeil 认成数字。
    headVeil: 0, compVeil: 0,
    // 背景压暗（0~100，js/db.js _caVeil 同杆夹取）：给整张背景图垫一层墨纱（--chat-veil），
    // 照片太亮太花抢字时用；0＝不垫＝与没这根杆时逐字节相同。也只在传过背景图时生效（同上两杆口径）
    bgVeil: 0,
    customBubbleCss: '',
    // 聊天气泡字体与字号（2026-10-15，入口在「TA 的设置 → 美化设置」）：各一位 TA 各一份。
    // 与全局那两样是两件事——那两样一个走 .app-shell 整站（appearance.fontFamily）、一个走 zoom（uiFontScale）；
    // 这里只作用于**这一本的聊天气泡正文**（用户定档「只放大聊天气泡文字」）。
    // chatFont 出厂 'inherit'＝跟随全局「全站字体」＝不写覆盖块、零输出。上面那条「别把六项排版与字体加回来」
    // 指的是**同名键**（会被 _caFill 逐会话填满后永久压住同名全局值），这里两个键全局没有对应项，不存在那个问题。
    chatFont: 'inherit', chatFontSize: 'medium'
  },
  chatAppearance: {},
  anniversary: null,
  anniversaryName: '',
  anniversaries: [],
  messages: [],
  groups: [
    // 2026-10-05 用户直派「聊天默认兜底那两组删掉」：出厂不再给「主字卡」预置任何句子，
    // TA 回话只认用户自己字卡库里的卡，池空就是没话可说（老档那两组由 db.ensureData 一次性删净）
    // TA心里话：TA 解释自己行为的专用字卡组（用户可改可删，删了不复活——没了这些字卡 TA 就不解释了）
    { name: '收藏理由', category: 'TA心里话', scope: 'public', cards: ['因为想记住这句', '看到这句很开心', '因为想你了', '这句想留着以后看', '喜欢这句', '因为是你说的', '想多看几遍', '说不出为什么，就是想收藏', '这句在心里停了一下'] },
    { name: '写信理由', category: 'TA心里话', scope: 'public', cards: ['今天想跟你说点什么', '因为想你了', '刚翻到以前的聊天', '梦到你了', '今天离你很近，想写点什么', '因为记着你说过的话', '因为刚收藏了你的一句话', '今天看到一样东西想起你', '想把今天写下来给你', '这个点睡不着，想写点什么'] },
    { name: '印象', category: 'TA心里话', scope: 'public', cards: ['这个很可爱', '很好看', '像今天的你', '想多看两眼', '这个我喜欢', '很配你', '看到就想笑', '换了之后心情变好了', '这个想记住', '眼熟，像在哪见过'] },
    // 形象自评（BUGS #401）：TA 对**自己**新头像/新昵称的看法，与「印象」（TA 看我的形象）分成两池——
    // 共用一个池时，「很配你」这类说用户的句子会挂在「TA 更换了头像」后面（用户报的文案张冠李戴）。
    // 措辞两条规矩：只说这个形象本身与 TA 自己的反应，不提「你」；内敛，不夸过头
    { name: '形象自评', category: 'TA心里话', scope: 'public', cards: ['换了这个感觉不错', '这个更像我', '挺喜欢这个的', '看起来精神多了', '这个是我会喜欢的类型', '新形象，新心情', '看着顺眼多了', '这个选得挺准', '忽然想照个镜子', '这个感觉能多用几天'] },
    { name: '状态签名', category: 'TA心里话', scope: 'public', cards: ['在发呆', '在翻以前的聊天', '在想今天的事', '在看窗外', '在整理字卡', '在听雨声', '在打瞌睡', '在想晚上吃什么', '在数星星', '在回味之前说过的话', '安静地待一会儿', '在想你什么时候来找我', '在练习想说的话', '什么都不做，就待着', '在等你先开口'] },
    // 只报天色，不报月亮（2026-10-12 BUGS #313：月相那一族 10-11 下线后这条线仍靠「夜里」抽带月的句子，
    // 用户判「名字与内容不一致」＝组名·签名·句子三处一起收成天气；旧档那四句由 js/db.js 摘净）
    { name: '天气的话', category: 'TA心里话', scope: 'public', cards: ['下雨了，我在听雨声', '好像要下雨了，你那边记得带伞', '雨停了，空气很干净', '今天风很大，吹得窗户响', '下雪了，这边白了一片'] },
    { name: '回忆引子', category: 'TA心里话', scope: 'public', cards: ['想起我之前说过', '翻到一句以前的话', '忽然想起这句', '以前好像说过这句', '翻到了以前收藏的', '还收藏着你这句', '这句想起来了'] },
    { name: '心愿', category: 'TA心里话', scope: 'public', cards: ['想和你一起看一次海', '想听你唱歌', '想和你去看一场雪', '想一起放烟花', '想陪你熬夜看日出', '想吃你推荐的东西', '想和你散步到天黑', '想把字卡都换成你喜欢的', '想看看你笑起来的样子', '想和你一起过一次纪念日', '想在同一个地方看月亮', '想收到你手写的字', '想和你去坐一次晚班的公交车', '想教你我最近喜欢的歌', '想和你拍一张合照', '想和你把这条街从头走到尾'] },
    { name: '梦境', category: 'TA心里话', scope: 'public', cards: ['梦到你了，梦里在下雨', '梦见和你放风筝，线一直在我手里', '梦里迷路了，但不害怕', '梦到一片很安静的海', '梦里的你背对着我，但我知道是你', '梦见我们坐在屋顶上看星星', '梦到你在读一封信，是我写的', '梦很轻，醒来忘了大半', '梦到你笑了，醒的时候也跟着笑', '梦见过冬天，我们围一条围巾', '梦到你回头了', '梦里没说话，但很安心'] },
    { name: '心愿回响', category: 'TA心里话', scope: 'public', cards: ['上次说的心愿，好像在慢慢实现', '说过的那件事，我还在记着', '那件想做的事，会实现的', '你的✓我看到了，记住了', '那个心愿我还留着，没有忘', '心愿里那条，偶尔会拿出来看看', '实现的那天，记得告诉我一声', '说过的话都记着呢，一件一件来', '✓ 打上的那条，我开心了一整天', '列表又短了一条，真好', '那条愿望实现的样子，我想象过了', '剩下的心愿不着急，慢慢来', '我们说好要做的事，都在单子上', '又完成一件，离下次近了一点'] },
    { name: '心愿回应', category: 'TA心里话', scope: 'public', cards: ['你记下的那句，我看到了', '你也想去看海啊，那就说定了', '你写下的愿望，我偷偷记住了', '原来你想做这些，那我陪着', '你记的那条，我看了好几遍', '你记下的那些字，我很喜欢', '你想做的事，我们都慢慢实现', '看到你记的那条，嘴角没压住', '你许的愿，算我一份', '那条心愿是你记的？我也是这么想的', '你写下的想做的事，我都当真了', '原来你偷偷记了心愿，不许反悔'] },
    { name: '心愿促成', category: 'TA心里话', scope: 'public', cards: ['心愿里那条，要不这周就安排上', '那件事，找个周末一起去吧', '别等了，就这个周末，我说到做到', '那条心愿，我想现在就去兑现', '天气刚好，把那件事办了吧', '想了想，那件事不用挑日子，就这次吧', '最早那条心愿，这一轮到它了', '去把那件事做了吧，我准备好了', '说好的事，这回真的定下来好不好', '再拖下去该对不起那条心愿了，走吧'] },
    // 邀请答复（BUGS #270）：你发出去的那条邀请，TA 到点答一句。两族共用这一组，靠「说好：／拒了：」
    // 前缀分家（与世界感知那几条线的「档名：」前缀同一体例，读侧 _wishAnswerLine 现剥前缀）。
    // 措辞两条规矩照旧：只写 TA 自己的反应、不替用户下判断；拒的那一句给实话但不指责任何一方
    // （关系本来是安稳的，「不去」只是 TA 今天自己的事，不是对你的评价）。
    { name: '邀请答复', category: 'TA心里话', scope: 'public', cards: ['说好：去，为什么不去', '说好：这一条我早就想应了', '说好：定下了，到时候叫我', '说好：你说的那件，我也想', '说好：走，现在就能出发', '说好：安排，我腾出来', '拒了：今天有点撑不住，改天我主动找你', '拒了：手头压着点事，这次让我欠着', '拒了：不是不想去，是真的走不开', '拒了：那个我有点怵，换一个行吗', '拒了：先不去，下次换我约你', '拒了：我想缓一晚，别当我生气'] },
    { name: 'TA的问题', category: 'TA心里话', scope: 'public', cards: ['今天过得怎么样||很好|有点累|还行|说不上', '现在在做什么||在忙|在发呆|在等你|刚忙完', '想我了吗||想了|还好|没有|你猜', '今天有没有想我||有|没有|一点点', '现在心情如何||挺好的|一般|有点低落|很雀跃', '要不要休息一下||要|不要|晚点再说', '今天吃了什么||还没吃|吃过了|在外面吃|忘了', '现在的月亮好看吗||好看|没看到|被云挡住了'] },
    { name: 'TA的回答', category: 'TA心里话', scope: 'public', cards: ['那就好', '累了就靠一会儿', '我也在想你', '嗯，我知道', '我等你说', '慢慢来，不着急', '开心就好', '记下了', '有你这句话就够了'] },
    { name: '里程碑', category: 'TA心里话', scope: 'public', cards: ['这是我们的第一百句，要记下来', '数到一百句了', '又攒了好多句', '第一千句，我们说了好多话', '今天在一起的日子要数着', '在一起的日子又多了一天', '这句话也存进我们的话里了', '这些话我都记得'] },
    { name: '体感', category: 'TA心里话', scope: 'public', cards: ['风里好像有你的温度', '刚才好像被谁碰了一下指尖', '肩膀忽然轻了一下，像有人搭了搭手', '耳朵有点痒，是你在说我吗', '后背暖了一下，像被从背后抱住', '指尖掠过一阵熟悉的风', '好像有人把头发拨到了耳后', '手背上落了一点很轻的触感'] },
    { name: '信的回应', category: 'TA心里话', scope: 'public', cards: ['你信里那句话，我读了好几遍', '你的信我放在枕头底下了', '这封回信晚了一点，别怪我', '你写的每一个字我都收到了', '提笔的时候先想起你信的结尾', '读完你的信，窗外的雨刚好停了', '你的字迹我好像能认出来了', '回信比我想的慢，因为想写得更好'] },
    // 情绪的话（情绪感知卡的自述池）：每句以「档名：」开头，只抽与当前档同名的那几条；
    // 该档没有对应句子就不显示自述（不拿别的档的话冒充），整组删掉则只剩档名
    { name: '情绪的话', category: 'TA心里话', scope: 'public', cards: [
      '雀跃：说话都想带点跳起来的调子', '雀跃：今天心情很好，理由说不清', '雀跃：忍不住想把好事讲给你听',
      '柔软：没什么特别的事，就是想挨着你坐一会儿', '柔软：说话想放轻一点，怕碰坏什么', '柔软：心里软软的，像刚晒过太阳的被子',
      '平静：在安静地待着', '平静：一切平常，没什么事压着我', '平静：就是坐着，什么也不想',
      '低落：有点提不起劲，缓一缓就回来', '低落：今天话少一点，不是出了什么事', '低落：想靠着你发一会儿呆',
      '烦躁：有点坐不住，像心里过了一阵风', '烦躁：语气要是急了点，你等我缓口气', '烦躁：想安静一会儿，等下回来找你',
      '想念：翻了一遍我们的聊天记录', '想念：你在的时候我什么都不干也很高兴', '想念：有点想见你，就现在',
      '淡淡的：说不上好也说不上不好', '淡淡的：像隔了层薄雾，还看得见你在', '淡淡的：有点空空的，待着就好'
    ] },
    // 读到的你（「TA 读你」卡的台词池）：体例同情绪的话——每句以「档名：」开头，只抽同档那几条，
    // 该档没句子就留空（不拿别档的话冒充），整组删掉＝屏上只剩档名。台词只写 TA 自己的反应，不替用户下判断
    { name: '读到的你', category: 'TA心里话', scope: 'public', cards: [
      '有劲：今天这么开心，分我一点', '有劲：你心情好，我也跟着高兴', '有劲：说吧说吧，我今天想听你讲',
      '跟平时一样：没什么事，就是想跟你说两句', '跟平时一样：刚想到你，就来找你了', '跟平时一样：在忙吗？不急，你想说的时候我都在',
      '有点累：早点睡呀', '有点累：抱抱你', '有点累：不想讲的事就不讲了',
      '有点烦：我帮不上什么，就陪着你', '有点烦：别憋着，跟我说', '有点烦：你说，我听着',
      '想说话：攒着的话都倒给我吧', '想说话：我在呢，你说', '想说话：你找我，我最高兴了',
      '想静静：你先忙，我等你', '想静静：我哪儿也不去', '想静静：什么时候想说了都可以',
      '读不出：我有点找不到你了，想你', '读不出：在吗？想跟你说两句', '读不出：你在想什么呢，跟我说说嘛'
    ] },
    // 2026-10-08 六批：这一页其余五条读数线各配一池台词（＋情绪那张表的档名共用），
    // 让它们和「状态签名」「情绪的话」「读到的你」一样能开口——此前只有三条线有词，其余六条屏上亮着却永远说不出。
    // 体例与上面两池完全同源：每句以「档名：」开头，只抽与当前档同名的那几条；该档没有句子就留空（不拿别档的话冒充），整组删掉＝屏上只剩档名、这一条线不再开口。
    // 措辞三条规矩：①只写 TA 自己的反应，不替用户下判断；②用词内敛（这些词是从屏上那枚档名长出来的，不是新造的说法）；③错开那一族最重只到「词没对上」「想再说一遍」，不指责任何一方
    { name: '示软的话', category: 'TA心里话', scope: 'public', cards: [
      '软着：我把头靠过来了，你伸手了吗', '软着：今天想被你顺顺毛',
      '有一点：话到一半，声音小下去了', '有一点：想让你哄两句，又不好开口',
      '平常：我挺好的，就是安静', '平常：没什么事，就想跟你待着',
      '读不到：这会儿把自己收起来了，等下再找你', '读不到：说不太清，不是不好'
    ] },
    { name: '心动的话', category: 'TA心里话', scope: 'public', cards: [
      '心口一热：你刚那句我看了三遍', '心口一热：想现在就抱你一下',
      '有点痒：想说点什么，又觉得没什么好说', '有点痒：你在的时候我老走神',
      '平平的：安稳得很，不轰不轰的', '平平的：就是很平静地想着你',
      '没去留意：刚没顾上感觉这个，你别多心', '没去留意：这会儿我脑子在别处'
    ] },
    { name: '说明白的话', category: 'TA心里话', scope: 'public', cards: [
      '一说就懂：这句我自己都说清楚了，你接住了吧', '一说就懂：今天说话特别顺',
      '都听见了：我想说的都说到了', '都听见了：一句没漏，你慢慢看',
      '猜了一半：我讲了个大概，剩下的一半靠你猜', '猜了一半：话说到一半，自己也绕进去了',
      '词没对上：我刚那个词好像不太准', '词没对上：不是那个意思，不过你也听见了',
      '想再说一遍：这句我想重说一次，你听着', '想再说一遍：刚那句太急了，我慢慢再来一遍'
    ] },
    { name: '干扰的话', category: 'TA心里话', scope: 'public', cards: [
      '没被什么占着：我现在空着，你说什么都行', '没被什么占着：手上一件事都没有，就等你',
      '手边有东西：我在弄一点小事，一会儿就回来', '手边有东西：手里正拿着东西，回话慢一点',
      '那边的情绪：我自己这点心情占着我，先别当我', '那边的情绪：正被自己的情绪占着，说话短一点',
      '那边的事情：事情没处理完，脑子分了一半出去', '那边的事情：事还挂着，人在这儿，心有点跑',
      '你这头的事：我在想你那边那件事，占着的是它', '你这头的事：替你把一件事想了半天'
    ] },
    { name: '距离的话', category: 'TA心里话', scope: 'public', cards: [
      '很近：我就在你旁边，你别回头', '很近：近得能听见你的呼吸',
      '附近：我在你不远的地方待着', '附近：就在这片，走动一下',
      '遥远：隔得有点远，但我没走', '遥远：这边离你有一段，说话会慢',
      '感觉不到：我够不太到你那一边，不是不在了', '感觉不到：这一会儿静得很，我照旧在',
      '离开：我走开一下，一会儿回来', '离开：不在原位，但会回来'
    ] },
    { name: '此刻在做的话', category: 'TA心里话', scope: 'public', cards: [
      '空闲：我在发呆，想到你了就来说两句', '空闲：今天没事，你来我就高兴',
      '忙碌：手上有点事，回得慢，不是不回', '忙碌：正忙一点正经事，你说的话我都记着',
      '忙着：这会儿有点手忙，长话晚点跟你说', '忙着：正赶一点事，先应你一句',
      '休息：我躺着，眼睛没睁开，耳朵在听', '休息：歇一会儿，你别担心',
      '睡着：我这边睡着了，醒过来第一件事是找你', '睡着：先睡了，梦里算你一个',
      '未知：说不清我在做什么，反正没走', '未知：这会儿连我自己都不知在忙什么'
    ] }],
  calls: [],
  stickers: [],
  stickerGroups: [],   // 我的表情包分组 [{name, imgs:[src...]}]（旧扁平 stickers 首次启动播种为一组）
  myText: { kaomoji: [], emoji: [] },   // 我的颜文字/emoji 分组 [{name, items:[text...]}]
  stickerRecent: [],   // 最近使用的表情包 src（≤12）
  pokeMine: [],        // 我的拍一拍自定义分组 [{name, cards:[text...]}]（预设组不落库，见 POKE_PRESETS）
  sentLetters: [],
  receivedLetters: [],
  drafts: {},   // 写信草稿按册存：{ [contactId]: { text, stamp } }（2026-10-06 信箱分册；旧的全局一份由 ensureData 迁到主会话名下）
  chatDraft: '',
  avlib: {
    // 节奏是**事件驱动**的（BUGS #179）：avEn/nickEn 是总闸，avRate/nickRate 是档位（1 很少/2 偶尔/3 常换），
    // avHeat/nickHeat 攒的是「TA 做了什么」的热度（唯一写手 avlibFeed），攒够了才换；
    // *Why 是「因为什么换的」那句话短语（avWhy 攒着、avLastWhy 转存已兑现的那次，屏上与印象簿都读它）；
    // *Day/*DayN 记当日已换几次以封顶。旧的 avNext/nickNext 随机等待时钟已整体退役。
    me: {
      av: [], nicks: [], avEn: true, nickEn: true, avRate: 2, nickRate: 2,
      avHeat: 0, nickHeat: 0, avWhy: '', nickWhy: '',
      // *WhyAt＝那句来由是**哪一刻**攒下的（2026-10-12）：兑现可能落在几天之后，读侧靠它判这句还成不成立
      avWhyAt: 0, nickWhyAt: 0,
      avDay: '', avDayN: 0, nickDay: '', nickDayN: 0,
      avLast: 0, nickLast: 0, avLastWho: '', nickLastWho: '', avLastWhy: '', nickLastWhy: '',
      meAvEn: true, meNickEn: true, meAvHeat: 0, meNickHeat: 0, meAvWhy: '', meNickWhy: '',
      meAvWhyAt: 0, meNickWhyAt: 0,
      meAvDay: '', meNickDay: '', meAvDayN: 0, meNickDayN: 0, meAvLastWhy: '', meNickLastWhy: ''
    },
    by: {},
    // 「我的」专属池（BUGS #407）：{ [联系人id]: 池 }＝只给那一位看的候选本（空池起步，可从通用 me 复制），
    // 池结构与 me 同形；换了只写那位的 myChatAvatar/myChatName 覆盖位。节奏档位/总闸不在这里（自动换的钟仍住 me 与 by）
    meBy: {},
    impr: {}   // TA 对池内头像/昵称的印象：{ [会话id]: { [key]: [{t,ts,w}] } }，每人一本；key=a:图片哈希 / n:昵称文本；w=换上它的来由（空串＝手动换或旧档）；保留键 '*'＝旧档那本没记下是谁
  },
  _reasonSeeded: true,  // TA心里话字卡组已随默认数据播种（老档迁移补种见 db.ensureData，用户删组不复活）
  // 夜间免打扰（2026-10-12 落地，BUGS #306）：夜里 23:00–07:00 那一档，TA 不主动发消息、不主动来电。
  //   mode 'ask'＝每晚问一次（出厂档）｜'auto'＝到点直接开、不问｜'off'＝不用了（连同 on 一起清）
  //   on/by 是「此刻开没开·是被夜里置开的还是手动开的」；askedDay 记今夜问过了没有（一夜一次，跨零点算同一夜）
  // 时间窗不在这份数据里：起止写死在 js/night.js（用户定档不做可调），少一格能调错的东西
  night: { mode: 'ask', on: false, by: '', askedDay: '' },
  // 主动消息管理（js/silent.js，2026-10-12 落地）：ids＝被关掉【TA 主动发消息】的联系人与群 id
  // 名单（单聊与群聊同一份＝群没有自己的钟，它那句话是从某位单聊联系人那口钟落进去的）。
  // 与 night 的分工：night 按**时间**全站拦，这份按**人按群**长期拦；两道闸任一命中都不掷
  silent: { ids: [] },
  // 世界感知（TA 的时间/感知/状态签名）+ 靠近提示开关 + 情绪感知开关 + 撒娇感知开关 + TA 读你开关
  // 连接感知不在此列：它每次从真实消息现算，没有随机源也没有存储（见 cjian.js 的 cjConnOf）
  // 「TA 读你」是 TA 单方面的感知（看不见你，只能猜），与情绪/撒娇同属随机漂移线，不从你的消息派生
  cjian: { enabled: true, moodOn: true, sgOn: true, readOn: true, btOn: true, ngOn: true, undOn: true, by: {} },
  groupBh: {},                  // 群内档位 { [群id]: { bh: { [成员名]: {rnProb?,rsMin?,rsMax?,replyMin?,replyMax?} } } }
                                //   成员那一本只存【改过的格】，缺的跟随 chatSettings[群id]；键用名字＝与 members 存名字同形
  wishlist: [],   // 心愿：[{wid 唯一 id, t, ts, cid 归属会话, by 'ta'|'me', done?, doneTs?, doneBy?('ta'=TA促成), pin 置顶?, reacted? TA已回应, echoed?, ann? 已存纪念日}]，不设上限全量保留
  // 邀请（独立一册，入口＝「更多」那一行＋功能中心；2026-10-11 撤销 BUGS #270 那次「并入心愿」）：
  //   [{iid 唯一 id, t 句子, ts 写下时刻, dir? 'ta'=TA 邀请我|'me'=我邀请 TA, cid? 归属会话, status?, at? 发出时刻,
  //     replyAt? TA 该答的时刻, reply? TA 那句原话, from? 融合期间那批的旧 wid}]
  // 没发出去过的一行只有 iid/t/ts（屏上是一条草稿）；心愿条目自此不再带 req 那一格（旧档由 js/db.js 搬过来）
  invites: [],
  taAskOn: true,  // TA 想问你（反向单选卡）总开关
  flashOn: true,  // 回忆闪回总开关
  wishOn: true,   // 心愿总开关（TA 自己许愿＋回应你记的＋促成旧心愿＋实现后的回响；与 flashOn 已拆开）
  referOn: true,  // 「这句说谁」：长按消息在气泡角上挂一枚指向签；关掉＝动作单里那枚钮与已挂的签都不出现（已落库的 refer 不回改）
  meantOn: true,  // 「这句本意」：同一条气泡角上那一枚签的第二段（问 TA 这一句是不是它自己想发的）；只读渲染侧，已落库的 meant 不回改
  delMsgOn: false, // 「删除消息」总闸（长按消息工具条里那枚「删除」，我与对方的都能删）：出厂＝关，需在设置里开。
          //   关闭时那一行不画删除钮（不是画了再藏），点进来的删除分支另有守卫兜底；已删掉的旧消息不会回来
  // 「话没挤过来」不再有总闸：概率那一格填 0 就是从不，不需要第二层开关（behavior.strayProb）
  // 字卡适应度检查（js/cardfit.js）这张表＝检查项本身，不是字卡：页面唯一可写的东西。
  // 每项＝一个说法（k）＋若干关键词（w），在【这一位取得到的主字卡】里做子串筛，命中 0 张就标「没筛到」。
  // 词是筛法不是库存事实，所以屏上从不写「TA 说不出口」；用户删掉某项不复活（_mergeDefaults 只在整字段缺失时补整表）
  cardFit: {
    slots: [
      { k: '道歉', w: ['对不起', '抱歉', '我错了', '是我不好'] },
      { k: '夸你', w: ['好看', '厉害', '漂亮', '真棒', '喜欢这样'] },
      { k: '想你', w: ['想你', '想见你', '见一面', '好久不见'] },
      { k: '说晚安', w: ['晚安', '睡个好', '梦里见', '早点睡'] },
      { k: '说早安', w: ['早安', '早上好', '起了吗', '醒了吗'] },
      { k: '哄你', w: ['别生气', '乖', '抱抱', '摸摸头', '过来'] },
      { k: '吃醋', w: ['吃醋', '别人的', '是谁呀', '我吃醋'] },
      { k: '认真谈一件事', w: ['我们谈谈', '说正经', '认真说', '有件事'] },
      { k: '谢你', w: ['谢谢', '辛苦你', '谢谢你'] },
      { k: '明天与以后', w: ['明天', '以后', '下次', '之后'] },
      { k: '喜欢与爱', w: ['喜欢', '爱你', '稀罕'] },
      { k: '要你陪', w: ['陪我', '留下来', '别走', '多待'] }
    ]
  },
  games: {   // 游戏中心（js/games.js）：with=一起玩的联系人；scores 按联系人各一套（best/plays/ta=TA 挑战分）；
             // 猫邮差那一族（cat/out/bell）与明信片册早已退役，这一格里不再有它们；
             // g2048Skins=2048 图片皮肤（键=2~2048 数字，值=dataURL；合成到对应数字瓷砖就变成这张图，与 mergeSkins 同族）；
             // g2048SkinSchemes=2048 皮肤方案 [{id,name,skins:{数字:dataURL}}] 整套切换，g2048SkinScheme=选中方案 id（''=散装/配色字面）
             // mergeSkins=合成大西瓜当前生效的图片皮肤（键=0~10 档位，值=dataURL；没图的档回退默认水果）；
             // mergeSkinSchemes=皮肤方案 [{id,name,skins:{档:dataURL}}] 整套切换，mergeSkinScheme=选中方案 id（''=默认）
    with: 'c0', tab: 'merge',
    scores: {},
    solo: {},   // 「自己玩」那一本＝不认人的公共账 {[game]:{best,plays}}（BUGS #302）：coop／vs 仍各记在 scores[那位] 下，两本互不牵连
    g2048Skins: {},
    g2048SkinSchemes: [],
    g2048SkinScheme: '',
    mergeSkins: {},
    mergeSkinSchemes: [],
    mergeSkinScheme: '',
    mergeMode: 'solo',   // 合成大西瓜模式：solo=自己玩 / coop=和 TA 同罐合作 / vs=比分对战
    g2048Mode: 'solo',   // 2048 模式：solo=自己玩 / coop=和 TA 轮流推同一块棋盘（分数合账）/ vs=比分对战
    popMode: 'solo',     // 消灭星星模式：solo=自己玩 / coop=和 TA 轮流消同一盘（分数合账）/ vs=比分对战
    linkMode: 'solo',    // 连连看模式：solo=自己玩 / coop=和 TA 轮流连同一盘（分数合账）/ vs=比分对战
    linkSkins: {},       // 连连看图腾皮肤（键=0~11 槽位，值=dataURL；没图的槽回退表情包库的图/设计图腾）
    linkSkinSchemes: [], // 连连看皮肤方案 [{id,name,skins:{槽:dataURL}}] 整套切换（与 mergeSkinSchemes 同族），linkSkinScheme=选中方案 id（''=散装）
    puzzleMode: 'solo',  // 滑块拼图模式：solo=自己玩 / coop=和 TA 轮流滑同一张（步数合账）/ vs=比分对战
    puzzleImgs: [],      // 滑块拼图「用自己的图」传进来的那几张（dataURL 数组，≤8 张、新的在前；有它就先拼自己的，没有才抽表情包库／明信片）
    tetrisMode: 'solo'   // 俄罗斯方块模式：solo=自己玩 / coop=和 TA 轮流放同一局（分数合账）/ vs=比分对战
  },
  // 播放器（js/player.js BUGS #284）：曲库这一格**只存指针**——本机文件的字节在 IDB（ordinal-keep-db，键前缀 player-file:），
  // 这一格里只有 {id,name,artist,src,fid,dur,added}；base64 进 data＝整棵备份被一首歌撑爆。
  // settings＝那份**全局默认权限**（所有没单独调过的人共用），名单与区间只住在 js/player.js 的 PL_PERMS 一处，
  // ⚠ 下面这几个数必须与 PL_PERMS 的 d 逐格相同（常驻门 tools/_smoke_player.js A1 现读两边比对）。
  player: {
    // 2026-10-14：relay 与 QQ 那一档已删（用户定档）；ncmRelay 老值 js/player.js 的 _plNcmApi() 仍读一次当兜底（不重填）。
    tracks: [], playlists: [], favs: [], queue: [], current: '', mode: 'order', ncmCookie: '', ncmApi: '', invites: [], withCid: '',
    settings: { reqProb: 5, cooldownMin: 12, taReserveProb: 6, taNextProb: 15, taRandProb: 10, taModeProb: 5, taFavProb: 20, taPauseEn: true, taChatNote: true }
  },
  playerBy: {},   // 只存被单独调过的那一位：PL_PERMS 那几格＋他那一本「TA 的收藏」favs（同 #066 播放器收藏、#074 印象簿那一族）
};
// 出厂预置字卡一律带 preset 标记：字卡库那一面只显示你自己新建的组，预置组收进「功能 → 系统预设字卡」独立页。
// 引擎取卡仍按 name+category 找这些组（见 db.js ensureData 给老存档补标记）
defaults.groups.forEach(g => { g.preset = true; });

// 把一批字卡组按内置名单认回预置身份（就地打标）。三处调用：db.ensureData 每次加载、cards.js 两条导入路径
// （存档里这些组常常没带 preset：该标记晚于这些数据存在，且 mochi 导出格式根本没这个字段）。
// 只按 name+category 精确认会漏掉一整批历史档——它们的 category 缺失或用过的分类名已被废弃，
// 被 db 的分类清洗钉成「主字卡」后就永远对不上内置清单，于是系统文案漏进字卡库。
// 故名字能唯一命中内置组时也认回，并把分类改回内置那档（引擎本来就按名字取卡，同名视为同一组）。
function markPresetGroups(groups) {
  if (!Array.isArray(groups)) return groups;
  const byKey = new Set(), byName = new Map();
  (defaults.groups || []).forEach(dg => {
    if (!dg || !dg.preset) return;
    const name = dg.name || '', cat = dg.category || '主字卡';
    byKey.add(name + '|' + cat);
    byName.set(name, byName.has(name) ? null : cat);   // 内置里重名的组不猜分类，只认精确键
  });
  groups.forEach(g => {
    if (!g || g.preset) return;
    const name = g.name || '', cat = g.category || '主字卡';
    if (byKey.has(name + '|' + cat)) { g.preset = true; return; }
    const only = byName.get(name);
    if (only && only !== cat) { g.category = only; g.preset = true; }
  });
  return groups;
}

// 共用的 SVG→PNG 导出（单封信长图、心愿长图）：svgText 完整 <svg>，按 scale 放大栅格化后下载
function svgToPngDownload(svgText, name, scale) {
  const s = scale || 2;
  const img = new Image();
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
  img.onload = () => {
    const cv = document.createElement('canvas');
    cv.width = (img.width || 480) * s;
    cv.height = (img.height || 640) * s;
    const ctx = cv.getContext('2d');
    ctx.scale(s, s);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = name;
    a.click();
  };
  img.onerror = () => { try { showToast('导出失败，试试换个浏览器'); } catch (e) {} };
  img.src = url;
}

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function time() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function firstChar(s) {
  return (s || '小').trim().charAt(0) || '小';
}

const PERSON_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';

// 无头像时的占位：**底盘 5% 墨（引 --well）＋人形矢量图取 --muted 次级墨**（色与形状定档在 2026-10-13
// 第六轮，用户「设计和图上一样的人的矢量图啊，只是换颜色，现在的太白」——第五轮纯白人形在白盘上
// 只剩落影一线＝隐形；底盘浅底 2026-10-14 第七轮按用户在预览页里点定的「甲 · 5% 墨」加回，
// 数值与理由写在 css/theme.css 那一条上＝本处只管挂类名，不写第二份色）。
// 同日曾试过「墨字首字」档，用户贴图纠正＝要的就是这枚人形，整族撤回；
// 色走令牌而非写死：深浅档（body[data-ap-depth]）与暖色档下自动跟同一族墨色。
function avatarHTML(src) {
  return src
    ? `<img src="${escapeHTML(src)}" alt="头像">`
    : `<span class="initial initial-person">${PERSON_ICON}</span>`;
}

// 群没有「一张脸」——画一位 TA 的占位人形会被读成「这个群是某个人」（用户 2026-10-07 定档：成员头像拼成 2×2）。
// 取名单前四位按顺序拼，不随机：每次渲染换人＝同一个群在屏上变脸。
// 群自己传过头像（设置页点那一格传的就是群这份）优先用传的。
function groupAvatarHTML(c) {
  if (c && c.avatar) return `<img src="${escapeHTML(c.avatar)}" alt="头像">`;
  const cells = ((c && c.members) || []).slice(0, 4).map(n => {
    const m = (data.contacts || []).find(x => x.kind !== 'group' && x.name === n);
    return `<span class="gava-cell">${m && m.avatar ? `<img src="${escapeHTML(m.avatar)}" alt="">` : avatarHTML('')}</span>`;
  });
  if (!cells.length) return avatarHTML('');
  return `<span class="group-ava g${cells.length}">${cells.join('')}</span>`;
}
// 任何「一个联系人（可能是群）」的头像都走这里，不留第二份判断。
// 单聊那一支必须走 chatAvatarOf（＝聊天内那份覆盖，没设过才回落基础资料）：首页会话行、信箱册名、
// 字卡适应度、印象簿从 2026-10-10 起全按这把尺子取（BUGS #246），这里若还读 c.avatar，
// 同一个人在绑定名单里就是另一张脸（字卡库绑定弹层当时漏扫，BUGS #259）。
// 群那一支仍走 groupAvatarHTML：它内部按成员名回查、与首页会话行的群头像同一份实现。
function contactAvatarHTML(c) {
  return (c && c.kind === 'group') ? groupAvatarHTML(c) : avatarHTML(chatAvatarOf(c));
}

function escapeHTML(v) {
  return String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ===== 序数记号（站名 2026-10-12 起叫「言字卡」；Ordinal＝序数，是旧名留在屏上唯一的化身；一处定义，谁要挂谁调它）=====
// 只准挂在**独立成块的数字**后面，或**本来就是拉丁字形的那行小字**上。
// （#240 曾加过第二处宿主＝明信片那一行的 `ORDINAL POST · Nth`，它随「在路上／明信片」2026-10-12 一起退役，
//  所以现在只剩一处宿主；将来要再添，仍须是拉丁那一行。）
// 中文句子与倒计时一律不挂：「相伴第 214th 天」读不通，
// 「还有 12 天」那枚是倒计时不是序数、挂上去就是一句假话（宿主判据见 anniversary.js 那两处∶
// 信箱信纸日期栏那行「第 N 封」也刻意不挂＝中文里就写中文，见 mailbox.js 的 _letterRailFill）。
// 元素用 <sup> 不用 <span>：宿主自己的元素选择器会改造它 —— css/stats.css:9 那条
// `.stats-tile span{display:block}` 实测把挂进统计格的 span 变成独立一行、格子凭空高 6.6px。
const ORD_SUFFIX = ['th', 'st', 'nd', 'rd'];
function ordSuffix(n) {
  const v = Math.abs(Math.trunc(Number(n) || 0)) % 100;
  return ORD_SUFFIX[(v - 20) % 10] || ORD_SUFFIX[v] || ORD_SUFFIX[0];
}
function ordSup(n) {
  const x = Math.trunc(Number(n));
  // 脏读数不挂记号、原样交回：宁可屏上是一个裸的 NaN，也不做出「NaNth」这种假序数
  if (!Number.isFinite(Number(n)) || x < 0) return String(n);
  return x + '<sup class="ord-sup">' + ordSuffix(x) + '</sup>';
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;

// 直通闸（2026-10-14 BUGS #427 色差族）：canvas 重编码会丢掉原图的 ICC 色彩配置 ——
// iPhone 拍的 Display P3 广色域照片尤其明显，**重编码后入库即褪色**，存的那一版自己就是淡的
// （与显示层那层滤镜是两回事：滤镜摘了它还在，反过来也一样，两条各修各的）。
// 所以「已经在预算内」的图一律**原样直通**，一个像素都不重画：
//   体积是硬闸：dataURL 长度 ≈ 原始字节 × 1.37，1.5MB ≈ 原图 1.1MB；
//   尺寸只作软闸：maxEdge 的 1.5 倍内都放行 —— 为一两百像素的边去毁掉一份色彩配置不值。
// 这是**色准优先于存储**的取舍（用户定档）：收小＝色差复发、放大＝存档变胖；
// 两处一起收，只动一处＝直通形同虚设（体积闸收了而尺寸闸卡死＝大图照样被重画）。
const PASS_MAX_DATAURL = 1.5 * 1024 * 1024;
const PASS_EDGE_MUL = 1.5;

// 是否支持 WebP 编码（一次探测，缓存结果）。不支持则退回 JPEG。
let _webpOK = null;
function webpSupported() {
  if (_webpOK !== null) return _webpOK;
  try { _webpOK = document.createElement('canvas').toDataURL('image/webp').indexOf('image/webp') === 5; } catch { _webpOK = false; }
  return _webpOK;
}

// 把一张 dataURL 图片压缩/缩小后重新编码为 base64。
// 编码优先级：WebP（省 60-80%）> JPEG > PNG（含透明时保留 PNG，避免透明区域变黑）。
function compressImageDataURL(dataURL, maxEdge = 1024, quality = 0.82) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      const edge = Math.max(w, h);
      // 落在直通闸内＝原样返回：零重编码＝ICC 色彩配置完整保留，广色域照片不褪色（BUGS #427）
      if (edge <= maxEdge * PASS_EDGE_MUL && dataURL.length <= PASS_MAX_DATAURL) { resolve(dataURL); return; }
      const scale = Math.min(1, maxEdge / edge);
      const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext('2d');
      // 真要缩就缩好：默认那档降采样把 4000px 直接并成 800px 会啃掉细节与高频色彩，
      // 高画质档是退而求其次的那一档（能直通的已经在上面直通了，走到这里的都是大图）
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, cw, ch);
      const hasAlpha = /^data:image\/png/i.test(dataURL);   // PNG 含透明通道风险，保留 PNG
      let out;
      try {
        if (!hasAlpha && webpSupported()) out = canvas.toDataURL('image/webp', quality);
        if (!out) out = hasAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality);
      } catch { out = dataURL; }
      resolve(out.length < dataURL.length ? out : dataURL);   // 压缩后反而更大则保留原图
    };
    img.onerror = () => resolve(dataURL);
    img.src = dataURL;
  });
}

function fileData(file, maxEdge = 1024, quality = 0.82) {
  return new Promise(resolve => {
    if (file.size > MAX_FILE_SIZE) { showToast('图片过大，请选择 5MB 以内的文件'); resolve(null); return; }
    // 大图读取＋压缩要几百毫秒到一两秒，期间界面没有任何动静＝用户报的「点了没反应／上传卡住」那一族。
    // 本函数是全站图片上传的唯一取数口，先顶一条「处理中」；成功由各调用点自己的界面变化或 toast 说，
    // 失败由下面两处 toast 接。小图不提示，免得每张都闪一下。
    if (file.size > 400 * 1024) showToast('正在读取图片…');
    const isGif = (file.type || '') === 'image/gif';
    const r = new FileReader();
    r.onload = () => {
      if (isGif) { resolve(r.result); return; }   // GIF 动图原样保留，canvas 压缩会丢帧变静图
      // 选进来的不一定解得开（文件框能切「所有文件」，或扩展名骗人）：旧写法把读出的字节原样交上去，
      // 各调用点照样存进档，屏上什么都不显示也一声不吭＝用户报的「上传失败无提示」。在全站这唯一一个
      // 取数口先解一次，解不开就顶一条 toast 并回 null（各调用点都按「拿不到图就撤」处理）。
      const probe = new Image();
      probe.onload = () => resolve(compressImageDataURL(r.result, maxEdge, quality));
      probe.onerror = () => { showToast('这个文件打不开，换一张图片试试'); resolve(null); };
      probe.src = r.result;
    };
    r.onerror = () => { showToast('图片读取失败'); resolve(null); };
    r.readAsDataURL(file);
  });
}

function streamToBlob(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const reader = stream.getReader();
    // 预读那一发的 {done,value} 必须由 loop 自己收下：扔掉＝每个流的第一块（64KB）凭空消失
    function loop({ done, value }) {
      if (done) { resolve(new Blob(chunks)); return; }
      chunks.push(value);
      reader.read().then(loop).catch(reject);
    }
    reader.read().then(loop).catch(reject);
  });
}

function download(obj, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// 二进制导出（音频／zip 这类不是 JSON 的件）。回收晚一点＝几百 KB 的音频正在落盘，
// 按 JSON 那档 1 秒回收有过被系统判成「下载中断」的先例
function downloadBlob(bytes, name, mime) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime || 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
// 本机小记录（面板高矮∶各页 tab 停靠∶筛选落在谁身上这类不进备份的键）写入的唯一出口。
// iOS 无痕模式与存储配额满时 setItem 是**直接抛异常**而不是返回 false，而全站 JS 拼成一块
// 内联 script——一处抛＝那一行后面的模块全不执行（#021·#111 那一族），故必须就地吞掉。
// 吞掉的后果只是「这一格下次进来回到默认」，主数据不在这里（走 IndexedDB 与 db.js 的 lsSet）。
function lsWrite(key, val) {
  try { localStorage.setItem(key, val); return true; } catch (e) { return false; }
}

// ===== 跨tab调度锁：多开时只让一个标签页跑主动发送/写信调度器 =====
const TAB_LOCK_KEY = 'ordinal-tab-lock';
const TAB_ID = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const _SCHED_GRACE_MS = 3 * 60 * 1000; // 定时错过超过该宽限期视为「离开期间过期」：不补发，重新排期
function _readTabLock() { try { return JSON.parse(localStorage.getItem(TAB_LOCK_KEY) || 'null'); } catch { return null; } }
let _tabBeatTimer = null;
function _startTabBeat() {
  if (_tabBeatTimer) return;
  _tabBeatTimer = setInterval(() => {
    try {
      const c = _readTabLock();
      if (!c || c.id === TAB_ID) localStorage.setItem(TAB_LOCK_KEY, JSON.stringify({ id: TAB_ID, t: Date.now() }));
    } catch {}
  }, 3000);
}
// 锁 8 秒不续约视为失效；后台标签页心跳被浏览器节流后自然让位给前台标签页
// FIX 2026-09-03 #040 localStorage 写-读回存在窄竞态（双 tab 可同 tick 双 leader 重复投递）：
// 支持 Web Locks 的环境用 ifAvailable 抢「领导权」锁（浏览器保证原子互斥），持有至页面关闭；
// localStorage 锁保留作不支持环境的后备与双保险。未抢到时每 10s 重试（原持有者关闭后接管）
let _webLockLeader = false;
if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
  const _tryLeaderLock = () => {
    navigator.locks.request('ordinal-leader', { ifAvailable: true }, () => {
      _webLockLeader = true;
      try { localStorage.setItem(TAB_LOCK_KEY, JSON.stringify({ id: TAB_ID, t: Date.now() })); } catch {}
      return new Promise(resolve => {
        const _beat = setInterval(() => { try { localStorage.setItem(TAB_LOCK_KEY, JSON.stringify({ id: TAB_ID, t: Date.now() })); } catch {} }, 3000);
        const _stop = () => { clearInterval(_beat); _webLockLeader = false; resolve(); };
        window.addEventListener('pagehide', _stop, { once: true });
      });
    }).catch(() => {});
  };
  _tryLeaderLock();
  setInterval(_tryLeaderLock, 10 * 1000);
}
function isSchedulerLeader() {
  if (_webLockLeader) return true;
  const now = Date.now();
  const cur = _readTabLock();
  if (cur && cur.id !== TAB_ID && now - (Number(cur.t) || 0) < 8000) return false;
  try {
    localStorage.setItem(TAB_LOCK_KEY, JSON.stringify({ id: TAB_ID, t: now }));
    const back = _readTabLock();
    if (back && back.id !== TAB_ID) return false;
  } catch { return true; } // localStorage 不可用时退化为各tab独立调度
  _startTabBeat();
  return true;
}

// ===== 进度弹窗 =====
let _pgEl = null, _pgFill = null, _pgSub = null;
function _ensureProgress() {
  if (_pgEl) return;
  _pgEl = document.createElement('div');
  _pgEl.className = 'progress-mask';
  _pgEl.innerHTML = '<div class="progress-card"><div class="progress-title"></div>' +
    '<div class="progress-track"><div class="progress-fill"></div></div>' +
    '<div class="progress-sub"></div></div>';
  document.body.appendChild(_pgEl);
  _pgFill = _pgEl.querySelector('.progress-fill');
  _pgSub = _pgEl.querySelector('.progress-sub');
}
function showProgress(title) {
  _ensureProgress();
  _pgEl.classList.add('show');
  _pgEl.querySelector('.progress-title').textContent = title || '处理中…';
  _pgFill.style.width = '0%';
  _pgSub.textContent = '0%';
  return updateProgress;
}
function updateProgress(pct, text) {
  if (!_pgEl) return;
  pct = Math.max(0, Math.min(100, pct));
  _pgFill.style.width = pct + '%';
  if (text !== undefined) _pgSub.textContent = text;
}
function hideProgress() {
  if (_pgEl) _pgEl.classList.remove('show');
}

// 让进度层真正上屏一帧再开干。整树 JSON.parse／序列化都是主线程长任务：不让这一手，
// 屏上就钉在上一格的数字不动＝用户眼里的「卡住了」（#428 那批在字卡库导入里先用过同一手法，
// 这里收进 utils 一份，不留两处各写一遍嵌套 rAF）。
// 带一道收手：页面在后台时 rAF 压根不跑（手机挑完文件回来的那一瞬还可能没完全回前台），
// 不能把整条导入锁死在这一步。
function progressYield() {
  return new Promise(res => {
    let done = false;
    const fin = () => { if (done) return; done = true; res(); };
    try { requestAnimationFrame(() => requestAnimationFrame(fin)); } catch (e) { fin(); }
    setTimeout(fin, 800);
  });
}

// ===== 「这句说谁」：长按消息掷一枚指向签 =====
// 三档纯随机、不解析句子：TA 本就是随机状态机，按字面推「这句说的是谁」等于替它编一句它没说的话（世界感知那几条线同一口径）。
const REFER_KEYS = ['ta', 'me', 'us'];
const REFER_LABEL = { ta: '说TA', me: '说我', us: '说我们' };
function rollRefer() { return REFER_KEYS[Math.floor(Math.random() * REFER_KEYS.length)]; }
// 外来备份里的怪键当没标，不在屏上画一枚空签
function referLabelOf(k) { return REFER_LABEL[k] || ''; }

// ===== 「这句本意」：同一条气泡上再问一次——「这一句是不是 TA 自己想发给你的」 =====
// 世界观（2026-10-08 用户定稿）：TA 只能用库里已有的字卡说话，有时控得住卡、有时是系统随机跳出来的，所以「不是百分之百精准」。
// 照「这句说谁」同一口径＝纯随机掷档、不解析句子：回复引擎本就是随机抽卡，库里没有「这一句 TA 控住了没」这个事实，
// 量不出的东西不编（derived 那条老规矩，也与 #114「不从通信现算、不从别的档位推」同口径）。
// 档名与面板上「接住」那五档（一说就懂／都听见了／猜了一半／词没对上／想再说一遍）**两两不重合**：
// 「接住」说的是「这一会儿」，这一枚说的是「这一句」，同一个词挂在两处会被读成同一个数说了两遍。
// 权重 76% 落在安稳的三档，最重那档「卡自己跳的」也不指责任何一方——按世界观它本来就是系统的随机。
// 第五档「不好意思认」（2026-10-12 用户指出四档意思不全）＝真意确实有，可 TA 不好意思认，于是这一句往回收。
// 它与「不止这句」不是一件事：那一档是本意比字面多、照样认；这一档是本意被嘴上缩回去——缺了它，四档只覆盖了
// 「字面即真意／字面说少了／字面说重了／压根不是它要说的」，读屏时抽到这一档会显得 TA 在否认，而那正是它最不像否认的时候。
// 权重与「卡自己跳的」同档（都是偶发的一下），谁也不比谁更常；档名五字以内＝不撑宽那颗签（F 组量最长那一组合）。
const MEANT_KEYS = ['own', 'fuller', 'softer', 'shy', 'auto'];
const MEANT_LABEL = { own: '就是这句', fuller: '不止这句', softer: '比字面软', shy: '不好意思认', auto: '卡自己跳的' };
const MEANT_W = { own: 32, fuller: 24, softer: 20, shy: 12, auto: 12 };   // 合计 100
function rollMeant() {
  let r = Math.floor(Math.random() * 100);
  for (const k of MEANT_KEYS) { const w = MEANT_W[k] || 0; if (r < w) return k; r -= w; }
  return MEANT_KEYS[0];
}
function meantLabelOf(k) { return MEANT_LABEL[k] || ''; }

// ===== 信件唯一 id =====
// 来信要能被聊天里那一行指针认出来（`m.letter` 存的就是它），所以身份不能靠数组下标：
// 读信页能删信（#112），删一封后面每一封的下标都往前挪一位，按下标定位＝点甲的信拆开了乙（#037 心愿同一课）
function mbLetterId() { return 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ===== 长按消息「复制」：哪一句算这条消息的正文 ＋ 怎么真写进剪贴板 =====
// 判据只有一处，渲染侧与点击侧同引它：渲染侧拿它决定「这枚钮画不画」，点击侧拿它决定「复制什么」。
// 不画点了没反应的钮（本仓反复打回的那一族）＝没正文的三条都不给：撤回过的（屏上只剩占位小字，
// 复制一串看不见的字是假话）／纯表情包与纯图片（text 是 '[表情包]' 占位符或空串，#199 同一口径）。
// 带配文的表情包照旧给——那句配文本来就显示在气泡里（render.js 的 .sticker-text）。
function msgCopyText(m) {
  if (!m || m.recalled) return '';
  const t = String(m.text || '').trim();
  return t && t !== '[表情包]' ? t : '';
}
// 两条路都要验结果，不许「假成功」：旧写法不读 execCommand 的返回值就报已复制，实际失败时粘出来是空的
//（js/diagnostic.js 那段 #191 记过；此处收成唯一实现，诊断页那一发也改引它）。
// 先走 navigator.clipboard（安全上下文＋ transient activation，点击链路里有），失败或不可用再退 textarea。
async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch (e) { /* 权限／非安全上下文／焦点丢失都退到下面那条 */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    // #418：这枚 textarea 是程序性临时件（document.execCommand('copy') 的载体），
    // 不是给用户打字的——打上豁免标，别让 js/input-ce.js 把它换成 contenteditable
    // （换了之后 select() 选的是 ce-box，execCommand 的复制语义就不是原来那条了）
    ta.setAttribute('data-ce-off', '1');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return !!ok;
  } catch (e) { return false; }
}

// ===== 通用输入弹窗与文件选择器（全站只有这一份；#288 起兼全站确认框＝confirm/alert 的站内收口）=====
// 原住 js/music.js 的 IIFE 里，播放器下线后搬进本模块＝消费方（js/stickers.js 的「链接导入表情包∶新建∶改名∶删除」
// 共六处）不用另找第三份弹层。弹层壳的 markup 在 html/sheet.html，样式在 css/base.css「通用输入弹窗」那一节。
window.openModal = function (t, v, fn, opts) {
  opts = opts || {};
  const mask = document.getElementById('appModal');
  const titleEl = document.getElementById('appModalTitle');
  const staticEl = document.getElementById('appModalStatic');
  const input = document.getElementById('appModalInput');
  const okBtn = document.getElementById('appModalOk');
  const cancelBtn = document.getElementById('appModalCancel');
  const midBtn = document.getElementById('appModalMid');
  if (!mask || !input || !okBtn || !cancelBtn) return;
  if (titleEl) titleEl.textContent = t;
  if (staticEl) { staticEl.hidden = !opts.staticText; staticEl.textContent = opts.staticText || ''; }
  input.hidden = !!opts.noInput;
  input.value = v || '';
  // #288：确认框档位——okText 改确认键文案·danger 染红·midBtn 第三键（两个肯定义并排，如 mochi 导入二选一）·onCancel 给取消也一条回路
  okBtn.textContent = opts.okText || '确定';
  okBtn.classList.toggle('danger', !!opts.danger);
  if (midBtn) {
    midBtn.hidden = !opts.midBtn;
    if (opts.midBtn) midBtn.textContent = opts.midBtn.label || '';
    midBtn.onclick = function () {
      mask.hidden = true;
      try { if (opts.midBtn && typeof opts.midBtn.onPick === 'function') opts.midBtn.onPick(); } catch (e) {}
    };
  }
  mask.hidden = false;
  okBtn.onclick = function () {
    mask.hidden = true;
    const val = opts.noInput ? undefined : input.value;
    try { if (typeof fn === 'function') fn(val); } catch (e) {}
  };
  cancelBtn.onclick = function () {
    mask.hidden = true;
    try { if (typeof opts.onCancel === 'function') opts.onCancel(); } catch (e) {}
  };
};
// 隐藏的文件选择器：按 id 复用同一枚 input（每枚只挂一次 onchange，不留多份监听）
window.mochiFilePick = function (opts) {
  opts = opts || {};
  const fid = 'pick-' + (opts.id || 'def');
  let input = document.getElementById(fid);
  if (!input) { input = document.createElement('input'); input.type = 'file'; input.id = fid; input.style.display = 'none'; document.body.appendChild(input); }
  input.accept = opts.accept || '';
  input.multiple = !!opts.multiple;
  input.onchange = function () {
    const files = Array.from(input.files || []);
    input.value = '';
    if (typeof opts.onFiles === 'function') opts.onFiles(files);
  };
  if (!opts.noClick) { try { input.click(); } catch (e) {} }
};