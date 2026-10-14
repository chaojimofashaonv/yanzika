// ===== MiniMax 语音（文字→mp3）：接口绑定联系人 =====
// 参考 nova/js/voice.js 的直连实现：新版开放平台 api.minimaxi.com / api.minimax.io 只要 API Key；
// 老控制台 api.minimax.chat / api.minimaxi.chat 还要 GroupId，新旧 Key 互不通用，地址+模型轮着试试通记住。
// 注意：MiniMax 出错时 HTTP 仍是 200，只能认 base_resp.status_code。
// 音色解析（一人一号，不串也不兜底）：这条消息是谁说的就只认谁绑的音色——群消息按 m.sender 名字找同名
// 联系人，找不到同名成员（单聊／群里无名）才落到本路会话自己；那位没绑定＝这条消息没有声音，小喇叭不画。

const _MM_HOSTS = [
  { host: 'https://api.minimaxi.com', legacy: false },
  { host: 'https://api.minimax.chat', legacy: true },
  { host: 'https://api.minimaxi.chat', legacy: true },
  { host: 'https://api.minimax.io', legacy: false },
];
const _MM_MODELS = ['speech-02-turbo', 'speech-2.8-turbo'];

const _MM_TEXTS = {
  off: 'MiniMax 语音还没开启，在设置「提醒 → MiniMax 语音」里打开。',
  noKey: '还没填 MiniMax 的 API Key，在设置「提醒 → MiniMax 语音」里填好再试。',
  noTimbre: '这位还没绑定音色，在「TA 的设置 → TA 的声音」里填一个 voice_id（没绑的 TA 不会显示播放按钮，也不会借用别人的声音）。',
  noWords: '这条消息里只有表情，没有可念的文字。',
  noNet: '连不上 MiniMax 的接口：要么这台设备没网，要么浏览器把跨域请求拦了。',
  noAudio: '接口通了，但回来的内容里没有音频。',
  allMiss: '几个 MiniMax 地址都没试通。',
};

function mmSettings() {
  // init 异步加载数据前 data 尚未赋值（let data 声明在 data.js）：顶层 rAF 回显会先到，此期间只读临时默认值不落盘
  if (typeof data === 'undefined' || !data) return { on: false, key: '', group: '', host: '', model: '', speed: 1 };
  if (!data.minimax || typeof data.minimax !== 'object') data.minimax = { on: false, key: '', group: '', host: '', model: '', speed: 1 };
  const v = data.minimax;
  v.key = typeof v.key === 'string' ? v.key : '';
  v.group = typeof v.group === 'string' ? v.group : '';
  v.host = typeof v.host === 'string' ? v.host : '';
  v.model = typeof v.model === 'string' ? v.model : '';
  const sp = Number(v.speed); v.speed = isFinite(sp) ? Math.min(2, Math.max(0.5, sp)) : 1;
  return v;
}

function mmUsable() {
  const v = mmSettings();
  return !!(v.on && v.key.trim());
}

/* 只念文字：emoji 和颜文字都不是话，念出来是「横杠 波浪 括号」（BUGS #125）。
   **三轮才对，前两轮各栽一处，都记在这里**：
   ①第一版只剥 emoji 与【括号内整段】颜文字 → 漏**括号外面的残肢**：「(╯°□°)╯」括号段剥掉了，
     可末尾那个 ╯ 留在句尾照样被念出来；「＼(^o^)／」两个全角斜杠（U+FF3C/FF0F，不在框线区）同理。
   ②第二版补上「整段纯符号则整段丢」，残留是补住了，**却把正常标点吃掉、静默改掉语义**：
     「3-0」→「30」（比分念成三十！）、「10/5」→「105」、「《围城》」书名号消失。**这类错比漏更严重。**
   ③现版两步：先按**码位区间**剥颜文字构件（框线 U+2500–257F／几何 U+25A0–25FF／假名 U+3040–30FF／
     泰文 U+0E00–0E7F／数学 U+2200–22FF／全角符号 U+FF01–FF60／CJK 符号 U+3005–3006），
     再按**白名单**保留「汉字/字母/数字/常用标点」，其余不念。
   ⚠ 白名单里的 `-` **必须转义**（写 `\\-`）：`.` `%` `-` 连着会被当成区间 `.-/`，
     `new RegExp` 直接抛 "Range out of order in character class"（第三轮真炸过，别删这个反斜杠）。
   ⚠ 白名单里**要有空格**，否则「2026 年」变成「2026年」，多字被并成一个词。
   ⚠ 数字之间的 - / . % ℃ ° 要留（比分 3-0、日期 10/5、温度 25℃、版本 v1.2 念错就变了意义），
     故它们在白名单里，且用 lookaround 只保「左右都是数字」的那种。
   ⚠ 数字连写那条**捕获组必须写成 `(2|3|…)` 而不是 `(?:2|3|…)`**：非捕获组里 `\1` 无组可回指，
     整条正则静默失效（`555` 剥不掉），且不报任何错。
   ⚠ 拉丁颜文字（QAQ/TAT/orz/x_x）仍会念 —— 那是**词**不是符号，删必然误伤真实缩写与人名
     （DEBUG、TAT 品牌、orz 域名），故只对「同数字连写」这一种无歧义形态下手。 */
const _MM_EMOJI = /[\p{Extended_Pictographic}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]+/gu;
const _MM_HAS_WORD = /[A-Za-z0-9\u4e00-\u9fff]/;
/* 颜文字构件（码位实测清单见 BUGS #125 验证栏）：框线 U+2500–257F／几何 U+25A0–25FF／
   假名 U+3041–33FF／泰文 U+0E00–0E7F／数学 U+2200–22FF／全角 U+FF00–FF65 与 U+FFE0–FFE6／
   CJK 符号 U+3005–3006。整段剥。 */
const _MM_KAO_BODY = /[─-╿▀-◿ぁ-㏿฀-๿∀-⋿　-〆＀-･￠-￦]+/g;
/* 括号段判别探针（只判别，不整段剥）：段内含这些构件 → 判为颜文字躯干。
   ⚠ 这里**不能含 ASCII 括号与常用标点**：`(真的假的)` 的括号本身不是颜文字特征，
     把它算进去会把整段正常括号语气都丢掉（第三轮实测：你说(真的假的) 整段消失）。
     只留「真正不会出现在正常括号语气里」的构件：框线/几何/假名/泰文/数学/全角与 ^ * | 这类 */
const _MM_KAO_PROBE = /[─-╿▀-◿ぁ-㏿฀-๿∀-⋿＀-･￠-￦^~|]/;
/* 括号段（圆角/方头/书名号）：段内含颜文字构件 → 整段丢。
   ⚠ **必须排在 KAO_BODY 之前跑**：构件被剥光后 (ノ￣皿￣) 就只剩「一个汉字」，
   再也认不出是颜文字（皿 是汉字，按「无字」判会被当成话留下）。
   ⚠ 反过来只看「无字」也不够：(really?) 这类正常语气会被误伤，故判据是「含构件」 */
const _MM_BRACKET = /[（(《【][^（()《》【】\n]{0,28}[）)》】]/g;
/* 可念白名单：汉字（含扩展 A）、拉丁字母、数字、空格、汉字常用标点、书名号/引号。
   数字之间的分隔符也留着（比分 3-0、日期 10/5、温度 25℃、版本 v1.2 念错就变了意义），
   由后面那条 lookaround 决定去留。
   ⚠ 这里**必须直接写码位字符，不能写 \\uXXXX**：本文件是单引号字符串，`'\\u4e00'` 传给
     RegExp 的是字面「\\u4e00」而不是 U+4E00，被当成「反斜杠 + u4e00」五个字符，
     于是 \u0020（空格）根本不在白名单里 → 「2026 年」变「2026年」、括号被当符号剥掉。
     第三轮为此白跑一轮量具（残留 0 但语义错 10），根因就是这一处转义层数。 */
const _MM_KEEP = 'A-Za-z0-9一-鿿㐀-䶿' + ' ' + '，。！？、；：…—·《》「」『』（）()./%℃°-';
function _mmDropWordless(run) {
  return _MM_HAS_WORD.test(run) ? run : '';
}
function mmSpeakable(text) {
  return String(text || '')
    /* keycap 必须**先于** emoji 剥：U+20E3 也在 emoji 类里，先剥会剩个裸数字（「1️⃣」→「1」） */
    .replace(/([#*0-9])\u{FE0F}?\u{20E3}/gu, '')
    .replace(_MM_EMOJI, '')
    /* 同数字连写的数字颜文字：2＋3ⁿ（233/2333/233333）与 5-9 连写（555/666）。
       捕获组必须用 (2|3|…) 而非 (?:2|3|…) —— 非捕获组里 \1 无组可回指，整条正则静默失效。
       「2026」「1111」「1000」「12345」都不中，年份与编号不受影响 */
    .replace(/(?<![0-9])(2|3|4|5|6|7|8|9)(?:\1{2,}|(?:3){2,})(?![0-9])/g, '')
    /* 【单字】＝表情框，不是话：「【囧】」「【泪】」这类只框一个字，几乎都是颜文字；
       而【重点】【注意看】是正常强调用法。只对**恰好一个汉字**的鱼尾括号段下手，
       圆角/方头括号一概不碰（(真的) 是真话，见上面 _MM_BRACKET 那条） */
    .replace(/【([^【】\n]{1})】/g, (seg, inner) => (_MM_HAS_WORD.test(inner) ? '' : seg))
    .replace(_MM_BRACKET, seg => (_MM_KAO_PROBE.test(seg) ? '' : seg))
    .replace(_MM_KAO_BODY, '')
    /* 符号残留交给下面那道白名单即可 —— 白名单外的字符（含框线/几何/假名/泰文/星号/
       颜文字残肢 ╯ ＼ ノ 与 ASCII 标点）一律不念，末尾那道「无字行整行丢」再把
       只剩符号的行（如 ^^ / -_- / :） 整行去掉。**不再单独跑「纯符号段」那一步**：
       它的字符类涵盖 ASCII 标点 inevitably 会吃掉 ( ) 【】《》 这些白名单里本该保留的字符
       （实测「你说(真的假的)」的括号就是这样没的），而它能做的事白名单已经做完了。 */
    .replace(new RegExp('[^' + _MM_KEEP + ']', 'g'), '')
    /* 数字分隔符只保「紧跟在数字后」的那种：3-0 / 10/5 / 25℃ / 50% / v1.2 都成立，
       句尾的 - / . 与「% 独立出现」去掉 */
    .replace(/[.\-/％%°℃]/g, (m, i, str) => (/[0-9]/.test(str[i - 1] || '') ? m : ''))
    .split('\n')
    .map(l => l.trim())
    .filter(l => _MM_HAS_WORD.test(l))
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* 这一次通的是哪套地址＋模型：记在内存里，同一次打开不用从头再试 */
let _mmRoute = null;

function _mmCandidates(v, group) {
  const hosts = _MM_HOSTS.filter(h => !h.legacy || group);
  if (v.host && !hosts.some(h => h.host === v.host)) hosts.unshift({ host: v.host, legacy: /minimax(i)?\.chat/i.test(v.host) });
  const rank = h => (v.host && h.host === v.host ? 0 : _mmRoute && h.host === _mmRoute.host ? 1 : 2);
  const ordered = [...hosts].sort((a, b) => rank(a) - rank(b));
  const models = v.model ? [v.model, ..._MM_MODELS.filter(m => m !== v.model)]
    : _mmRoute ? [_mmRoute.model, ..._MM_MODELS.filter(m => m !== _mmRoute.model)] : _MM_MODELS;
  const out = [];
  for (const h of ordered) for (const m of models) out.push({ host: h.host, legacy: h.legacy, model: m });
  return out;
}

function _mmWhy(e) {
  const msg = String((e && e.message) || e || '');
  if (e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(msg)) return _MM_TEXTS.noNet;
  const low = msg.toLowerCase();
  if (/token not match group|group\s*id/i.test(low)) return msg + '（Key 和 GroupId 不在同一个账户组下：老控制台 Key 去 api.minimax.chat「账户管理→基本信息」核对 GroupId；新版开放平台的 Key 请留空 GroupId）';
  if (e && e.auth) return msg + '（Key 失效或填错；旧控制台的 Key 用不到新平台上，反之也一样）';
  if (/insufficient|balance|quota|limit/i.test(low)) return msg + '（账户额度不够或被限流了，去 MiniMax 控制台看一眼余额）';
  if (/_sensitive|sensitive|risk/i.test(low)) return msg + '（这句话被接口的内容风控拦下了，换一句试试）';
  return msg || '未知错误';
}

async function _mmRequest(cand, v, group, text, timbre) {
  const q = cand.legacy && group ? '?GroupId=' + encodeURIComponent(group) : '';
  const res = await fetch(cand.host + '/v1/t2a_v2' + q, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + v.key.trim() },
    body: JSON.stringify({
      model: cand.model,
      text,
      stream: false,
      voice_setting: { voice_id: timbre, speed: v.speed, vol: 1, pitch: 0 },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
    }),
  });
  const resData = await res.json().catch(() => null);
  if (!resData) {
    const err = new Error('HTTP ' + res.status + '：回来的不是 JSON');
    err.auth = res.status === 401 || res.status === 403;
    throw err;
  }
  const st = resData.base_resp;
  if (st && st.status_code !== 0) {
    const err = new Error(st.status_msg || ('错误码 ' + st.status_code));
    err.auth = /auth|token|key|permission|un-author/i.test(String(st.status_msg || ''));
    throw err;
  }
  const hex = resData.data && resData.data.audio;
  if (!hex) { const err = new Error(_MM_TEXTS.noAudio); err.noRetry = true; throw err; }
  return hex;
}

function _mmHexToDataUrl(hex) {
  const clean = String(hex).replace(/[^0-9a-fA-F]/g, '');
  const bytes = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return 'data:audio/mpeg;base64,' + btoa(bin);
}

/* 同一句话＋同一个音色＋同一个语速只请求一次：会话内缓存，切聊天/重渲染不重复花钱 */
const _mmCache = new Map();
function _mmStamp(words, timbre) {
  const v = mmSettings();
  const src = words.slice(0, 500) + '\n' + timbre + '\n' + v.speed;
  let h = 5381;
  for (let i = 0; i < src.length; i++) h = ((h << 5) + h + src.charCodeAt(i)) | 0;
  return 't' + (h >>> 0).toString(36);
}

/* 合成一句：给回 mp3 dataURL；会话内已合成过直接回缓存 */
async function mmSynth(words, timbre) {
  const v = mmSettings();
  if (!v.on) throw new Error(_MM_TEXTS.off);
  if (!v.key.trim()) throw new Error(_MM_TEXTS.noKey);
  if (!timbre) throw new Error(_MM_TEXTS.noTimbre);
  const stamp = _mmStamp(words, timbre);
  if (_mmCache.has(stamp)) return _mmCache.get(stamp);
  const group = v.group.trim();
  const list = _mmCandidates(v, group);
  if (!list.length) throw new Error('这个接口要 GroupId，在设置里补上，或改用新版开放平台的 Key');
  let lastErr = null;
  for (const cand of list) {
    try {
      const url = _mmHexToDataUrl(await _mmRequest(cand, v, group, words, timbre));
      _mmRoute = cand;
      _mmCache.set(stamp, url);
      return url;
    } catch (e) {
      if (e && e.noRetry) throw e;
      lastErr = e;
    }
  }
  throw new Error(lastErr ? _mmWhy(lastErr) : _MM_TEXTS.allMiss);
}

/* 音色解析（一人一号，BUGS #070）：只认这条消息归属者自己绑定的音色——归属由 mmVoiceOwner 判定（群消息按署名找同名
   联系人，其余为本路会话自己）。那位没绑定就返回空串：不回退全局、也不借用别人的音色。 */
function mmResolveTimbre(msg) {
  const owner = mmVoiceOwner(msg);
  return (owner && owner.mmTimbre) ? String(owner.mmTimbre).trim() : '';
}

/* 语音卡归属联系人：群消息按署名找同名联系人（不看是否绑定音色，声音是谁的卡就归谁）；
   找不到该成员或单聊 → 消息所属联系人（群聊即群本身） */
function mmVoiceOwner(msg) {
  const sender = msg && msg.from !== 'me' ? String(msg.sender || '').trim() : '';
  if (sender) {
    const c = (data.contacts || []).find(x => x.kind !== 'group' && x.name === sender);
    if (c) return c;
  }
  return (typeof currentContact === 'function' && currentContact()) || null;
}

/* 该联系人专属的「语音」分组：没有则自动建一个（「XX的语音」，专属作用域 + contactId 隔离，
   字卡库只在切到该联系人的会话时显示这个分组） */
function _mmVoiceGroup(owner) {
  const cid = owner ? owner.id : '';
  let g = (data.groups || []).find(x => (x.category || '主字卡') === '语音' && cardScope(x) !== 'public' && (x.contactId || '') === cid);
  if (!g) {
    g = { name: ((owner && owner.name) || 'TA') + '的语音', category: '语音', scope: 'own', contactId: cid, cards: [] };
    data.groups.push(g);
  }
  return g;
}

/* 合成结果自动落库（对齐 nova sayToCard）：同句+同音色+同语速的字卡已在库里就不再请求接口 */
function mmLibraryLookup(words, timbre, ownerId) {
  const stamp = _mmStamp(words, timbre);
  for (const g of (data.groups || [])) {
    if ((g.category || '主字卡') !== '语音' || cardScope(g) === 'public') continue;
    if ((g.contactId || '') !== (ownerId || '')) continue;
    for (const c of (g.cards || [])) {
      const v = voiceCardParts(c);
      if (v && v.tts === stamp && v.data) return v.data;
    }
  }
  return null;
}

function mmSaveToLibrary(words, timbre, url, owner) {
  try {
    const stamp = _mmStamp(words, timbre);
    const g = _mmVoiceGroup(owner);
    if ((g.cards || []).some(c => { const v = voiceCardParts(c); return v && v.tts === stamp; })) return;
    const name = words.slice(0, 14).replace(/\|+/g, ' ').trim() || '语音';
    g.cards.push(name + '|||' + stamp + '|||' + words.replace(/\|+/g, ' ') + '|||' + url);   // 四段式：末段前附完整文字（通话字幕用）
    save();
  } catch (e) {}
}

/* 丢弃某句的存档（会话缓存 + 该联系人语音库里的那一枚）＝「这条念得不对，重念一次」的底座。
   没有它的话，一旦某个音色把某句念错，那条存档会**永久**命中：点多少次都是同一段错音频，
   改语速才会换 stamp（_mmStamp 把 speed 算进去了），用户自己找不到出路（BUGS #125）。
   返回是否真的删掉了东西（没有存档时返回 false，调用方据此提示「本来就是现读的」）。 */
function mmForgetSynthesis(words, timbre, ownerId) {
  const stamp = _mmStamp(words, timbre);
  let hit = _mmCache.delete(stamp);
  for (const g of (data.groups || [])) {
    if ((g.category || '主字卡') !== '语音' || cardScope(g) === 'public') continue;
    if ((g.contactId || '') !== (ownerId || '')) continue;
    const keep = [];
    for (const c of (g.cards || [])) {
      const v = voiceCardParts(c);
      if (v && v.tts === stamp) { hit = true; continue; }   // 丢这一枚，其余原样
      keep.push(c);
    }
    g.cards = keep;
  }
  try { save(); } catch (e) {}
  return hit;
}

/* 气泡上的小喇叭：点一下合成并播放（已合成直接播缓存），再点一下停。
   force=true 时**跳过库与缓存重新合成** —— 「这条念得不对，重念一遍」的入口（BUGS #125）。
   为什么要这个：存档一旦生成就长期命中，念错了点多少次都是同一段音频；没有重念路径，
   用户唯一能自救的操作是去设置改语速（_mmStamp 把 speed 算进 key，改了才换一份），太隐蔽。 */
let _mmPlayer = null;
let _mmPlayingBtn = null;
function mmStop() {
  if (_mmPlayer) { _mmPlayer.pause(); _mmPlayer = null; }
  if (_mmPlayingBtn) {
    _mmPlayingBtn.classList.remove('playing');
    // 语音条那枚键的图标由 CSS 在两枚 svg 之间切（它没有「合成」这回事），不能被喇叭图标盖掉
    if (!_mmPlayingBtn.classList.contains('voice-play')) _mmPlayingBtn.innerHTML = _MM_ICON;
    _mmPlayingBtn = null;
  }
}

/* 播一条【库里现成录音】的语音消息（m.voice＝那张语音卡的 dataURL）。
   与上面的合成播放共用同一个 _mmPlayer 单例＝放语音时喇叭停、点喇叭时语音停，屏上永不同时出两个声音；
   不碰 mmUsable／mmResolveTimbre——这段声音是卡自带的，不需要 Key、不出网、也不该被「这位没绑音色」挡掉。 */
function mmPlayLocal(btn, msgId) {
  if (btn.classList.contains('playing')) { mmStop(); return; }
  const msg = (Array.isArray(data.messages) ? data.messages : []).find(m => String(m.id) === String(msgId));
  if (!msg || !msg.voice) { showToast('这条语音的录音不在了'); return; }
  mmStop();
  _mmPlayer = new Audio(msg.voice);
  _mmPlayingBtn = btn;
  btn.classList.add('playing');
  _mmPlayer.onended = mmStop;
  _mmPlayer.onerror = () => { mmStop(); showToast('这段录音放不出来'); };
  _mmPlayer.play().catch(() => { mmStop(); showToast('浏览器不让自动播，再点一次试试'); });
}

async function mmTogglePlay(btn, msgId, force) {
  if (!force && btn.classList.contains('playing')) { mmStop(); return; }
  if (!mmUsable()) { showToast(mmSettings().on ? _MM_TEXTS.noKey : _MM_TEXTS.off); return; }
  const msg = (Array.isArray(data.messages) ? data.messages : []).find(m => String(m.id) === String(msgId));
  const words = mmSpeakable(msg && msg.text);
  if (!words) { showToast(_MM_TEXTS.noWords); return; }
  const timbre = mmResolveTimbre(msg);
  if (!timbre) { showToast(_MM_TEXTS.noTimbre); return; }
  mmStop();
  btn.classList.add('busy');
  try {
    // 取声顺序：会话缓存 → 该联系人专属字卡库（同句同音色不重花钱）→ 请求 MiniMax
    const owner = mmVoiceOwner(msg);
    let cached = null;
    if (force) {
      // 重念：先把这一句的旧存档（会话缓存 + 库）清掉，否则 mmSynth 会立刻命中它、重念等于没重念
      mmForgetSynthesis(words, timbre, owner ? owner.id : '');
    } else {
      cached = mmLibraryLookup(words, timbre, owner ? owner.id : '');
    }
    const url = cached || await mmSynth(words, timbre);
    if (cached) _mmCache.set(_mmStamp(words, timbre), cached);
    else mmSaveToLibrary(words, timbre, url, owner);
    mmStop();
    _mmPlayer = new Audio(url);
    _mmPlayingBtn = btn;
    btn.classList.add('playing');
    btn.innerHTML = _MM_ICON_STOP;
    _mmPlayer.onended = mmStop;
    _mmPlayer.onerror = mmStop;
    _mmPlayer.play().catch(() => { mmStop(); showToast('浏览器不让自动播，再点一次试试'); });
  } catch (e) {
    showToast(String((e && e.message) || '这句没能念出来'));
  } finally {
    btn.classList.remove('busy');
  }
}

/* 播放键图形：**纯三角，无外圈**（用户 2026-10-07 明确「不要外面的圆圈，只要播放的矢量图」）。
   历经三代：①circle r9 + stroke-width 2 描边环套三角 → 24 视框缩到 15px 时描边实渲仅 1.25px 发丝线，
   抗锯齿后发灰发虚、内三角只剩 3.6×4.1px；②整枚实心盘挖空三角 → 不虚了，但用户不要那圈盘。
   ③纯三角。**光学居中是关键**：右指三角的视觉重心落在竖边那条（几何中心偏右约 2/3 处），
   按几何居中画会显得整体偏左，须整体右移约 1 视框单位并把底边略降 0.4 补偿（BUGS #125）。
   playing 态换 _MM_ICON_STOP（双竖条＝可停），别再拿播放三角脉冲冒充「正在播」。*/
const _MM_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.4 6.7v10.6L17.4 12.5z"/></svg>';
const _MM_ICON_STOP = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.5 6.7h2.1v10.6H9.5zM13.4 6.7h2.1v10.6h-2.1z"/></svg>';

/* 接通来电时按概率随机播一条该联系人专属字卡里的语音（call.js _enterConnected 调用；设置-通话可关）。
   取卡范围：这一路会话认得出的专属分组（群聊＝成员各自的专属组，见 utils.js chatCardOwners）里的语音字卡；
   公用组不参与（那是所有人的语音，不是这位 TA 的）；未绑定的专属组硬隔离下任何会话都用不到，故也不再兜底 */
function mmCallGreet(cid) {
  try {
    const cs = data.callSettings || {};
    if (cs.voiceGreetEnable === false) return;
    const prob = Number(cs.voiceGreetProb);
    if (!(prob > 0) || Math.random() * 100 >= prob) return;
    // 通话是延迟 600ms 才播的（call.js _enterConnected），那一刻用户可能已切走会话：
    // cid 由通话自己带进来，不读 currentContact()（读了会给 A 那通电话念出 B 的声音）
    const cur = (cid ? (data.contacts || []).find(x => x.id === cid) : null)
      || (typeof currentContact === 'function' && currentContact()) || null;
    if (!cur) return;
    const pool = [];
    const collect = g => (g.cards || []).forEach(c => { if (cardIsOff(g, c)) return; const v = voiceCardParts(c); if (v && v.data) pool.push({ data: v.data, text: v.text || v.name || '' }); });
    (data.groups || []).forEach(g => {
      if (cardScope(g) === 'public' || !groupUsableFor(g, cur.id)) return;
      collect(g);
    });
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const clearSub = () => { if (typeof _callGreetText === 'function') { try { _callGreetText(''); } catch (e) {} } };
    mmStop();
    _mmPlayer = new Audio(pick.data);
    _mmPlayingBtn = null;
    _mmPlayer.onended = () => { mmStop(); clearSub(); };
    _mmPlayer.onerror = _mmPlayer.onended;
    // 通话页字幕：播放即显示这句语音的文字（call.js _callGreetText 双窗体同步）
    if (typeof _callGreetText === 'function') { try { _callGreetText(pick.text); } catch (e) {} }
    _mmPlayer.play().catch(clearSub);
  } catch (e) {}
}
/* render.js 用：气泡内右下角的播放键（撤回/表情包／两族问答卡／拼句卡／语音条／涂鸦不出；这位没绑音色也不出）。
   问答卡两族都要挡＝正向「问问TA」早在清单里，反向「TA 想问你」是 2026-10-10 补上的那一支（BUGS #239）：
   只挡一支＝屏上两张贴着一模一样卡片的界面，一张有喇叭一张没有；而那张卡本来就是「点着答」的互动件，不是拿来听的一句话。
   反向这一支刻意排在清单**最末**（挨着 `) return`）＝哨兵需要一枚全仓唯一的锚：清单整行含竖线，而 FIX-REGRESSION.md
   的解析器按竖线切列（#226 记过同一课），只能取一个子串当锚；实测光秃秃的字段名在 js/render.js 早就存在、
   产物里本来就在，那种锚删掉本批这一项照样报「在位」＝一片假绿。挪到末尾之后「这一支紧跟 return」这半句在全仓唯一，
   哨兵才真咬得住（⚠ 这句刻意不原样写出那枚锚串——写了本文件就出现两次，唯一性当场作废，2026-10-10 自测 A3b 就是这么红的）。
   语音消息也不出（m.voice）——那条气泡自己就带一枚播放键，放的是库里那段录音；
   同一枚「点一下听 TA 说什么」在两处各画一个记号，正是本仓反复被打回的「一件事两处出现」。
   尾随那枚 guard 是行内零高度占位，替键在末行留出宽度，文字排到那儿就换行＝永不与文字相碰；
   ⚠ 它只对「正文就是一行文字」的那种气泡成立——卡片型气泡里选项／题面各是块级子元素，guard 会自己占满一行
   （实测卡高 +20px），这也是卡片不该挂这枚键的第二条理由。 */
function mmVoiceBtnHTML(m) {
  if (!mmUsable()) return '';
  if (!m || m.from === 'me' || m.recalled || m.ask || m.sticker || m.voice || m.cardParts || m.taAsk) return '';
  if (!mmSpeakable(m.text)) return '';
  if (!mmResolveTimbre(m)) return '';
  return `<button type="button" class="voice-speak" data-speak="${escapeHTML(String(m.id))}" aria-label="播放这条消息" title="点一下听 · 长按重新合成">${_MM_ICON}</button><span class="voice-speak-guard" aria-hidden="true"></span>`;
}

/* ===== 设置卡片绑定（全局账户）＋ TA 的设置页试听 ===== */
/* 全局卡回显：renderProfile（设置页每次显示）会调；避免只挂 tab 点击时机导致其它入口进来不回显 */
function mmBindEcho() {
  if (typeof data === 'undefined' || !data) return;
  const v = mmSettings();
  const on = $('#mxOn'); if (on) on.checked = !!v.on;
  const key = $('#mxKey'); if (key) key.value = v.key;
  const group = $('#mxGroup'); if (group) group.value = v.group;
  const host = $('#mxHost'); if (host) host.value = v.host;
  const model = $('#mxModel'); if (model) model.value = v.model;
  const speed = $('#mxSpeed'); if (speed) speed.value = v.speed;
}
(function _mmBindSettings() {
  const ids = ['#mxOn', '#mxKey', '#mxGroup', '#mxHost', '#mxModel', '#mxSpeed'];
  const pull = () => {
    if (typeof data === 'undefined' || !data) return;
    const v = mmSettings();
    const on = $('#mxOn'); if (on) v.on = on.checked;
    const key = $('#mxKey'); if (key) v.key = key.value;
    const group = $('#mxGroup'); if (group) v.group = group.value;
    const host = $('#mxHost'); if (host) v.host = host.value.trim();
    const model = $('#mxModel'); if (model) v.model = model.value.trim();
    const speed = $('#mxSpeed'); if (speed) { const n = Number(speed.value); v.speed = isFinite(n) && n > 0 ? Math.min(2, Math.max(0.5, n)) : 1; }
    save();
    // 开关/Key 变化后小喇叭显隐刷新：增量渲染不重建已有气泡，显式要求重建一次
    if (typeof renderMessages === 'function') { try { resetMessageRender(); } catch (e) {} renderMessages(); }
  };
  if (typeof document === 'undefined') return;
  document.addEventListener('change', e => {
    if (e.target && ids.includes('#' + e.target.id)) pull();
  });
  const test = $('#mateVoiceTest');
  if (test) test.addEventListener('click', async () => {
    const note = $('#mateVoiceTestNote');
    const say = t => { if (note) note.textContent = t; };
    pull();
    const v = mmSettings();
    const c = (typeof currentContact === 'function' && currentContact()) || null;
    const timbre = (c && c.mmTimbre) ? String(c.mmTimbre).trim() : '';
    if (!v.key.trim()) { say(_MM_TEXTS.noKey); return; }
    if (!timbre) { say(_MM_TEXTS.noTimbre); return; }
    say('正在请求 MiniMax…');
    try {
      const url = await mmSynth('你好，这是音色试听。', timbre);
      mmStop();
      _mmPlayer = new Audio(url);
      _mmPlayer.onended = mmStop;
      _mmPlayer.onerror = mmStop;
      _mmPlayer.play().catch(() => { mmStop(); showToast('浏览器不让自动播，合成已成功'); });
      say('试听已生成并播放，音色 ID：' + timbre);
    } catch (e) {
      say(String((e && e.message) || '试听失败'));
    }
  });
  // 设置页打开时回显（与 renderProfile 的时机对齐，直接挂在 showView 的调用链里更省事：监听 settings tab 点击）
  document.addEventListener('click', e => {
    const t = e.target && e.target.closest && e.target.closest('.settings-tab');
    if (t) requestAnimationFrame(mmBindEcho);
  });
  requestAnimationFrame(mmBindEcho);
})();

/* 聊天消息点小喇叭（事件委托，与长按工具条同一容器）。
   **长按 0.5 秒＝丢掉这句存档重念**（念错了、这个音色念得怪时的自救出口，BUGS #125）。
   长按阈值 500ms、短按照旧播放；长按成立时给一枚 `resynth` 标记，让随后的 click
   知道自己只是长按的尾巴、别再当成短按播一次（否则会「重念完又立刻播一遍」）。 */
let _mmHoldTimer = null;
let _mmHoldFired = false;
function _mmClearHold() {
  if (_mmHoldTimer) { clearTimeout(_mmHoldTimer); _mmHoldTimer = null; }
}
document.addEventListener('pointerdown', e => {
  const btn = e.target && e.target.closest && e.target.closest('[data-speak]');
  if (!btn) return;
  _mmHoldFired = false;
  _mmClearHold();
  _mmHoldTimer = setTimeout(() => {
    _mmHoldTimer = null;
    _mmHoldFired = true;
    btn.classList.add('resynth');
    mmTogglePlay(btn, btn.dataset.speak, true);
  }, 500);
}, true);
['pointerup', 'pointercancel', 'pointerleave', 'scroll'].forEach(ev =>
  document.addEventListener(ev, e => {
    if (!_mmHoldTimer && !_mmHoldFired) return;
    _mmClearHold();
    document.querySelectorAll('.voice-speak.resynth').forEach(b => b.classList.remove('resynth'));
  }, true)
);

document.addEventListener('click', e => {
  // 语音条那枚键：与喇叭键共用这一处委托（一处入口两种来源，不留第二个监听器）
  const vb = e.target && e.target.closest && e.target.closest('[data-voice-play]');
  if (vb) { e.preventDefault(); mmPlayLocal(vb, vb.dataset.voicePlay); return; }
  const btn = e.target && e.target.closest && e.target.closest('[data-speak]');
  if (!btn) return;
  e.preventDefault();
  if (_mmHoldFired) { _mmHoldFired = false; return; }   // 长按的尾巴，已重念过，别再播
  mmTogglePlay(btn, btn.dataset.speak);
});
