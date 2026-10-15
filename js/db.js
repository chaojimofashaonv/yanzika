// ===== IndexedDB 数据库操作 =====
// 本机小件与播放器遗留命名空间（原 ordinal-music-* 那一片 LS 与那个音频库）：清空时一并抹掉，防止残留孤儿数据
try { if (window.localFilesWipe) window.localFilesWipe(); } catch (e) {}

// 存储命名空间 ordinal-db/ordinal-data 专属本项目（与其它项目隔离，防 file:// 同源互读串档）
const DB_NAME = 'ordinal-db', STORE = 'data';
const LS_KEY = 'ordinal-data';
const G2048_VALS = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];

let _db = null;
let _useLS = false;

// 节流：save 去抖 1200ms 合并写盘（2026-10-07 耗电优化：put 是整棵 data 树结构化克隆，连发消息时
// 逐条立即全库重写＝发热尖峰；攒 1.2s 一次把克隆次数压到最低。切后台/离开由 flushSave 立即冲刷兜底）
const SAVE_DEBOUNCE_MS = 1200;
let _saveTimer = null;
let _savePending = false;

// 降级模式（localStorage）节流：全量 JSON.stringify 大对象会阻塞主线程（数据含 base64 大图时可达数百毫秒），
// 收集 300ms 内多次 save，放到空闲期（requestIdleCallback，兜底定时器）执行，避免阻塞点击/输入等交互
let _lsTimer = null;
let _lsPending = false;
function _scheduleLsSave() {
  // FIX 2026-09-03 #025 首次调度漏置 _lsPending=true，300ms 后定时器醒来发现 pending 为 false 直接 return——
  // 间隔大于 300ms 的零散操作（寄信/改开关）在 LS 降级模式下静默丢存，只能靠 pagehide 兜底
  if (_lsTimer) { _lsPending = true; return; }
  _lsPending = true;
  _lsTimer = setTimeout(() => {
    _lsTimer = null;
    _lsPending = false;
    const doIt = () => _lsMirror();
    if (typeof requestIdleCallback === 'function') requestIdleCallback(doIt, { timeout: 1500 });
    else setTimeout(doIt, 100);
  }, 300);
}

async function getDB() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 2);
    r.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    r.onsuccess = () => { _db = r.result; resolve(r.result); };
    r.onerror = () => reject(r.error);
  });
}

function lsGet() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ===== localStorage 那一份整包副本的体积闸（2026-10-15 BUGS #434，手机端「导入／保存时卡住然后闪退」那一批的一档）=====
// LS 里这一枚 `ordinal-data` 是「iOS 被系统冻结／关页赶在异步事务前」的保险，同一棵树的整包副本。
// 存档一大（字卡∶聊天里的 base64 图）这一发三件事同时坏：
//   ① 整树 JSON.stringify 是主线程长任务（实测 183M 字符那一份桌面要 0.4s，手机按 3~5 倍算）；
//   ② 移动端 localStorage 配额约 5MB，超了一律 QuotaExceededError——必然写不进去；
//   ③ 旧写法 `catch {}` 把失败吞干净＝用户以为「下一次 load 能从 LS 兜回来」，其实那份备份压根没写成。
// 现在先按节点估一把，估不过就不写镜像：load 按 _savedAt 取较新通道（#024），镜像没动→IDB 那一份照常赢，
// 既不丢数据也不写假话，而且不再为「一个装不下的东西」花那一整轮 stringify。
// ⚠ 唯一不能跳的是降级模式（_useLS＝IndexedDB 用不了，LS 就是主库）：那时照写，写不下就在屏上说一句。
const LS_MIRROR_MAX = 3 * 1024 * 1024;
let _lsMirrorQuiet = 0;
function _lsSay(msg) {
  // 一次会话只说一次：这是每次保存都会走的路径，toast 连发＝刷屏
  if (_lsMirrorQuiet) return;
  _lsMirrorQuiet = 1;
  try { if (typeof showToast === 'function') showToast(msg); } catch (e) {}
}
// 估算＝字符串长度 ＋ 每格一点结构开销；一超预算立刻收手返回 -1（不为「量一个装不下的东西」跑完整棵树）
function _roughJsonBytes(node, budget) {
  let total = 0;
  const stack = [[node, 0]];
  while (stack.length) {
    const cur = stack.pop();
    const v = cur[0], d = cur[1];
    if (v === null || v === undefined) continue;
    const t = typeof v;
    if (t === 'string') { total += v.length; if (total > budget) return -1; continue; }
    if (t !== 'object') { total += 8; continue; }
    total += 16;
    if (d > 8) continue;   // 与本站那些「最深六七层」的形状对齐∶再深的不量了，宁少估不多估（少估＝多写一次镜像，不写坏数据）
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) stack.push([v[i], d + 1]); continue; }
    for (const k in v) { total += k.length; if (total > budget) return -1; stack.push([v[k], d + 1]); }
  }
  return total;
}

function lsSet(obj) {
  if (!_useLS && _roughJsonBytes(obj, LS_MIRROR_MAX) < 0) {
    _lsSay('这份存档比本机的存储镜像大得多，镜像就没写了（数据存在主库里，不会丢）');
    return false;
  }
  try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); return true; }
  catch (e) {
    _lsSay('本机存储装不下这一份，没兜住这一发镜像备份；建议先在 设置→数据→存储 里清掉大图再重新导出');
    return false;
  }
}

// 递归合并旧数据到默认结构上（缺字段则补默认值）
function _mergeDefaults(obj, def) {
  for (const key of Object.keys(def)) {
    const dv = def[key];
    if (!(key in obj)) { obj[key] = JSON.parse(JSON.stringify(dv)); continue; }
    if (dv != null && typeof dv === 'object' && !Array.isArray(dv)) {
      if (Array.isArray(obj[key]) && Array.isArray(dv)) {
        // 数组项为对象时递归合并
        if (dv.length > 0 && typeof dv[0] === 'object' && obj[key].length > 0 && typeof obj[key][0] === 'object') {
          for (const item of obj[key]) {
            if (item && typeof item === 'object') _mergeDefaults(item, dv[0]);
          }
        }
        // 其他数组保持原样
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        _mergeDefaults(obj[key], dv);
      }
    }
  }
  return obj;
}

// 一次性迁移：把历史通话相关的系统消息折算成 data.calls 通话记录（旧版未单独存通话数据）
// 第二轮（_callsCidMigrated）改扫**所有会话**的流并给每条记 cid：旧那轮只扫过当时开着的那一条流，
// 别的会话里存了多年的通话小字从来没被折算进来（BUGS.md #156）。
// 认账两条：①带 srcMsgId 的＝上一轮已折算过，跳过；②第一轮那批没有 srcMsgId，按「同日·同时·同结果·同时长」
// 一对一消耗着配，配上就顺手把 cid 补回它真正所在的那一本（配不上＝重复来电，另记一条新账）。
// 带 m.call 的新消息跳过——它们落地那一刻就已经记账了，再折算一遍＝一件事两处计数。
function migrateCallsFromMessages(raw) {
  const calls = raw.calls = raw.calls || [];
  const done = new Set();
  for (const c of calls) if (c && c.srcMsgId != null) done.add(String(c.srcMsgId));
  // 第一轮折算的记录（无 srcMsgId）：键 → 还欠着的条数
  const owed = new Map();
  for (const c of calls) {
    if (!c || c.srcMsgId != null) continue;
    const k = [c.date, c.time, c.outcome, c.durationMs].join('|');
    owed.set(k, (owed.get(k) || 0) + 1);
  }
  const streams = [];
  if (raw.chats && typeof raw.chats === 'object') {
    for (const cid of Object.keys(raw.chats)) {
      const ch = raw.chats[cid];
      if (ch && Array.isArray(ch.msgs)) streams.push({ cid, msgs: ch.msgs });
    }
  }
  if (!streams.length && Array.isArray(raw.messages)) streams.push({ cid: '', msgs: raw.messages });
  for (const s of streams) {
    for (const m of s.msgs) {
      if (!m || m.from !== 'system' || typeof m.text !== 'string') continue;
      if (m.call) continue;
      const t = m.text;
      if (t === '对方已接听') continue; // 接通提示由随后的「通话结束」统一记一条
      let outcome, durMs = 0;
      const ended = t.match(/^通话结束 · 时长 (\d+):(\d+)$/);
      if (ended) {
        outcome = 'answer';
        durMs = (Number(ended[1]) * 60 + Number(ended[2])) * 1000;
      } else if (t === '已取消通话') outcome = 'cancel';
      else if (t === '对方拒绝了你的通话') outcome = 'reject';
      else if (t === '对方未接听，请稍后再试') outcome = 'miss';
      else if (t === '对方忙线中，请稍后再试') outcome = 'busy';
      else continue;
      if (done.has(String(m.id))) continue;
      const key = [m.date, m.time, outcome, durMs].join('|');
      const left = owed.get(key) || 0;
      if (left > 0) {
        owed.set(key, left - 1);
        // 配上了：这条账就是它，把归属补回它真在的那一本（旧值空串＝此前没人知道是谁的）
        const rec = calls.find(c => c && c.srcMsgId == null && [c.date, c.time, c.outcome, c.durationMs].join('|') === key && !c.cid);
        if (rec && s.cid) rec.cid = s.cid;
        continue;
      }
      calls.push({
        id: calls.length + 1, // 独立自增，避免与消息 id 强绑定
        cid: s.cid || '',
        outcome,
        durationMs: durMs,
        duration: _fmtMigration(durMs),
        time: m.time || '',
        date: m.date || '',
        srcMsgId: m.id
      });
    }
  }
}

function _fmtMigration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function ensureData(raw) {
  const def = JSON.parse(JSON.stringify(defaults));
  if (!raw) {
    // FIX 2026-10-03 #047 全新安装走这里提前返回，会跳过下方「messages 恒绑活跃会话流」的收尾绑定；
    // defaults 里 messages 与 chats.c0.msgs 本是两个独立空数组，不绑定的后果=首会话我方消息与对方回复各进一个数组互不可见、刷新后我方首条消息丢失
    // 2026-10-13 出厂不预置联系人后 defaults.chats 是空对象：活跃会话落到空串（不再兜 'c0'——
    // 兜一个不存在的 c0 ＝ data.activeChat 指着空气，下面 339 行那类按活跃会话取档的读侧全得伺候它）
    if (!def.activeChat || !def.chats[def.activeChat]) def.activeChat = Object.keys(def.chats || {})[0] || '';
    if (def.chats[def.activeChat]) def.messages = def.chats[def.activeChat].msgs;
    // FIX 2026-10-03 #049 全新安装提前返回缺三件，否则下次带档加载必出事：
    // ① _chatsMigrated 未置位 → 多联系人迁移每次启动重放 raw.contacts=[c0]，用户新增联系人连同聊天记录被整体抹掉
    // ② chatSettings 未播种绑定 → data.behavior 是独立副本，切到别的联系人再回来，c0 会被那份副本污染（回复设置串档）
    def._chatsMigrated = true;
    def._bhPerContact = true;
    // 每日上限那次「旧出厂值 3 → 1」的一次性迁移在全新安装上没东西可迁，但标记必须一并落下：
    // 不落的话，用户在第一次开机就把那格改成 3，下次带档加载会被那条质检修成 1＝改用户的有意选择
    def._mbDailyToOne = true;
    // 「自己玩」公共账那次归并同理（BUGS #302）：全新安装没东西可归并，但标记不落的话，用户第一次开机就玩一局
    // 比分对战（那笔会记在对方名下），下次带档加载会把那局白归进公共账一次＝屏上凭空多出的数字没人记得它从哪来
    def._soloScoresMerged = true;
    // 通话折算两轮同理「没东西可迁但标记要落下」：不落的话第二次带档加载会白扫一遍全部会话的流
    def._callsMigrated = true;
    def._callsCidMigrated = true;
    // 下线类一次性清扫标记在全新安装上没东西可扫，但标记必须一并落下：不落的话用户日后
    // 自己新建同名组（「早安」／「晚安」／「朋友圈理由」）会在下次带档加载被这些块误删（#047·#049·#136 同一课）
    def._greetRitualRemoved = true;
    def._momentsReasonRemoved = true;
    def._stampGroupsRemoved = true;
    // 字体收成全局一份那次同理（#047·#049·#136 同一课）：全新安装没东西可搬，但标记必须落下——
    // 不落的话这段扫描每次带档加载都重放一遍，而它那条「全局那份空着才搬」的口子就一直在：
    // 用户把全局那框清空过（＝他主动不要那段 CSS），下次导入一份带旧值的备份又会把它搬回屏上＝凭空长出东西
    def._apFontToGlobal = true;
    // 出厂种子联系人一次性清退（2026-10-13 用户「删掉」）：全新安装没有东西可清，标记必须一并落下——
    // 不落的话这次改版前装过的机子，下次带档加载会把这批判断重放一遍（幂等，但白扫）
    def._noFactoryContact = true;
    // 固定昵称补种（#346）同理：全新安装零联系人，没有东西可补，标记一并落下
    def._fixedNameSeeded = true;
    if (!def.chatSettings || typeof def.chatSettings !== 'object') def.chatSettings = {};
    // 空册时没有活跃会话可绑：behavior 保持 defaults 那一份独立副本（app.js 启动读它兜底），
    // 不往 chatSettings[''] 里种一份没人读的账（ensureData 332 行那片清理本来也会删掉它）
    if (def.activeChat) {
      def.chatSettings[def.activeChat] = JSON.parse(JSON.stringify(def.behavior));
      def.behavior = def.chatSettings[def.activeChat];
    }
    return def;
  }
  // 顶层字段用递归合并补齐
  _mergeDefaults(raw, def);
  // 我的表情包分组化迁移（一次性）：旧扁平 stickers → stickerGroups 首组（用户已分组过则跳过）
  if (!raw._stickerGroupsMigrated) {
    raw._stickerGroupsMigrated = true;
    if (Array.isArray(raw.stickers) && raw.stickers.length && (!Array.isArray(raw.stickerGroups) || !raw.stickerGroups.length)) {
      raw.stickerGroups = [{ name: '我的表情', imgs: raw.stickers.filter(x => typeof x === 'string' && x).slice() }];
    }
  }
  // 表情包/拍一拍面板新字段类型兜底（合并只补缺失不纠型）
  if (!Array.isArray(raw.stickerGroups)) raw.stickerGroups = [];
  else raw.stickerGroups = raw.stickerGroups.filter(g => g && typeof g === 'object' && typeof g.name === 'string' && Array.isArray(g.imgs)).map(g => ({ name: g.name, imgs: g.imgs.filter(x => typeof x === 'string' && x) }));
  if (!raw.myText || typeof raw.myText !== 'object') raw.myText = { kaomoji: [], emoji: [] };
  ['kaomoji', 'emoji'].forEach(k => {
    if (!Array.isArray(raw.myText[k])) raw.myText[k] = [];
    else raw.myText[k] = raw.myText[k].filter(g => g && typeof g === 'object' && typeof g.name === 'string' && Array.isArray(g.items)).map(g => ({ name: g.name, items: g.items.filter(x => typeof x === 'string' && x) }));
  });
  if (!Array.isArray(raw.stickerRecent)) raw.stickerRecent = [];
  else raw.stickerRecent = raw.stickerRecent.filter(x => typeof x === 'string' && x).slice(0, 12);
  if (!Array.isArray(raw.pokeMine)) raw.pokeMine = [];
  else raw.pokeMine = raw.pokeMine.filter(g => g && typeof g === 'object' && typeof g.name === 'string' && Array.isArray(g.cards)).map(g => ({ name: g.name, cards: g.cards.filter(x => typeof x === 'string' && x) }));
  // 信箱旧默认迁移（一次性）：主动写信概率 30%→60%、最长间隔 480→60 分钟。
  // FIX 2026-09-03 #023 原先每次加载都重放：用户刻意设回 30/480 会被无声改回 60/60，加 _migratedMailbox 标记只跑一次
  if (!raw._migratedMailbox) {
    raw._migratedMailbox = true;
    if (Number(raw.mailbox && raw.mailbox.writeProbability) === 30) raw.mailbox.writeProbability = 60;
    if (Number(raw.mailbox && raw.mailbox.maxWriteMinutes) === 480) raw.mailbox.maxWriteMinutes = 60;
  }
  // TA的邀请（旧独立功能）自 2026-10-10 起并入心愿（BUGS #270）：这一格不再是「一串等着抽的字符串」，
  // 邀请＝心愿条目上的一枚 req。旧档那几条由下面 wishlist 那一段**一次性迁进册子并当场 delete**
  // （那里才有归位好的 contacts 与 wishlist 可挂；在这一行就删会把可迁的东西先抹掉）
  // 2026-10-04 功能移除（涂鸦/骰子）历史消息一次性归一：涂鸦→表情包图（保留可见），骰子→[骰子] 文本
  if (!raw._mediaMigrated) {
    raw._mediaMigrated = true;
    const _convMedia = (msgs) => (msgs || []).forEach(m => {
      if (!m || typeof m !== 'object') return;
      if (m.doodle) { m.sticker = m.doodle; delete m.doodle; }
      if (m.text === '[涂鸦]') delete m.text;
      if (m.dice !== undefined && m.dice !== null) m.text = '[骰子]';
      delete m.dice;
    });
    if (Array.isArray(raw.messages)) _convMedia(raw.messages);
    if (raw.chats && typeof raw.chats === 'object') Object.keys(raw.chats).forEach(k => { const c = raw.chats[k]; if (c && Array.isArray(c.msgs)) _convMedia(c.msgs); });
  }
  // 多联系人/群聊迁移（一次性）：旧单聊 messages → chats.c0.msgs，profile → 联系人 c0。
  // FIX 2026-10-03 #049 迁移不可对多联系人的存档重放：contacts 已有多个联系人=早已迁移过，此时
  // 再执行 raw.contacts=[c0] 会把新增联系人全部抹掉（后续 chats 清理连聊天记录一起删）。
  // 标记位由下方各路径保证落盘，这里再加结构兜底：只有单联系人（或缺失）时才整体替换
  if (!raw._chatsMigrated) {
    raw._chatsMigrated = true;
    const _multi = Array.isArray(raw.contacts) && raw.contacts.length > 1;
    const c0 = (raw.contacts && raw.contacts[0]) || { id: 'c0', name: TA_FALLBACK_NAME, avatar: '', kind: 'single', members: [] };
    c0.id = 'c0';
    if (raw.profile) {
      if (raw.profile.name) c0.name = raw.profile.name;
      if (raw.profile.avatar) c0.avatar = raw.profile.avatar;
    }
    if (!_multi) raw.contacts = [c0];
    const _oldMsgs = Array.isArray(raw.messages) ? raw.messages : [];
    if (!raw.chats || typeof raw.chats !== 'object') raw.chats = {};
    if (!raw.chats.c0 || typeof raw.chats.c0 !== 'object') raw.chats.c0 = { msgs: _oldMsgs, unread: 0, draft: '' };
    else if (!Array.isArray(raw.chats.c0.msgs) || !raw.chats.c0.msgs.length) raw.chats.c0.msgs = _oldMsgs;
    if (!_multi) raw.activeChat = 'c0';
  }
  // 2026-10-13 出厂不预置联系人：def.contacts 现在是空册，这条「缺省补 defaults」的旧写法
  // （!length 也补）会把空册补成空——行为没变，但读着像在补东西。改成只纠型：
  // 不是数组＝坏档，纠成空册；是数组（哪怕空）＝用户就是这个状态，不动。
  if (!Array.isArray(raw.contacts)) raw.contacts = [];
  raw.contacts = raw.contacts.filter(c => c && typeof c === 'object').map(c => ({
    id: String(c.id || ('c' + Date.now().toString(36))), name: String(c.name || '未命名'),
    // 固定昵称（#346）：聊天以外的功能读它。空串＝没单独设过，取的时候回落 name（见 utils.fixedNameOf）
    fixedName: typeof c.fixedName === 'string' ? c.fixedName : '',
    avatar: typeof c.avatar === 'string' ? c.avatar : '',
    chatName: typeof c.chatName === 'string' ? c.chatName : '',
    chatAvatar: typeof c.chatAvatar === 'string' ? c.chatAvatar : '',
    // 我这侧的会话专属覆盖（2026-10-08 按会话分开）：空串＝跟随全局 data.me
    myChatName: typeof c.myChatName === 'string' ? c.myChatName : '',
    myChatAvatar: typeof c.myChatAvatar === 'string' ? c.myChatAvatar : '',
    kind: c.kind === 'group' ? 'group' : 'single',
    pin: !!c.pin, archived: !!c.archived,
    mmTimbre: typeof c.mmTimbre === 'string' ? c.mmTimbre : '',
    members: Array.isArray(c.members) ? c.members.filter(m => typeof m === 'string' && m.trim()).map(s => s.trim()).slice(0, 30) : []
  }));
  // 2026-10-05 TA 占位名 Ordinal → 梦角1（BUGS #055）：出厂默认名是项目/品牌名，当人名用时
  // 读着像个系统名，且信箱署名、气泡顶栏会直接把它印出来。
  // 只认**恰好等于**旧默认名的这一档：用户自己起过别的名字（含「Ordinal2」这类）一律不动。
  // c.name 与 c.chatName（聊天专属昵称，avatarlib 头像昵称互动写入）是两处独立存储位。
  // chatName 迁完直接清空而非改名：它语义是「用户另设的专属昵称」，与 name 相等即冗余，
  // 留着会让 chatPartnerName() 优先读一个跟 name 一样的值（行为等价，但多一处会漂移的存储位）。
  for (const c of raw.contacts) {
    if (c.name === 'Ordinal') c.name = TA_FALLBACK_NAME;
    if (c.chatName === 'Ordinal') c.chatName = '';
  }
  // ===== 出厂种子联系人一次性清退（2026-10-13 用户「首次进入网站默认有联系人【梦角1】，删掉」）=====
  // 只清「从来没人碰过」的那一条，三条判据同时满足才删（与 #047·#049·#136 同一手法：一次性迁移要能
  // 区分「出厂残留」与「用户数据」，判据钉死，别用 startsWith／ includes 之类会扫到用户自己建的那条）：
  //   ① 整册只剩这一位；② id 还是出厂 c0、名字还是出厂占位名（梦角1／Ordinal 两代都认）；
  //   ③ 它身上一处都没被改过（头像／两个聊天覆盖位／我的覆盖位／群成员全空）且它的聊天记录一条都没有。
  // 聊过的＝真数据，一条不动——用户自行长按删除（chats.js 的动作单早就在）。
  // 标记全新安装那一份在 ensureData 提前返回那条路上一并落下（def._noFactoryContact），
  // 老档第一次带档加载走这里。位置刻意放在 Ordinal→梦角1 改名之后：两条判据都吃改名后的值。
  if (!raw._noFactoryContact) {
    raw._noFactoryContact = true;
    const _only = raw.contacts.length === 1 ? raw.contacts[0] : null;
    const _isFactory = !!_only && _only.id === 'c0' && (_only.name === TA_FALLBACK_NAME || _only.name === 'Ordinal');
    const _untouched = !!_only && !_only.avatar && !_only.chatName && !_only.chatAvatar && !_only.myChatName && !_only.myChatAvatar && !(_only.members || []).length;
    const _c0chat = raw.chats && raw.chats.c0;
    if (_isFactory && _untouched && _c0chat && !(_c0chat.msgs || []).length) {
      raw.contacts = [];
      delete raw.chats.c0;
      if (raw.chatSettings) delete raw.chatSettings.c0;
      raw.activeChat = '';
    }
  }
  // ===== 固定昵称一次性补种（2026-10-13 BUGS #346）=====
  // 用户要把「头像昵称库里换的聊天昵称」与「其他功能里的昵称」分开：新增 fixedName 这一格。
  // 老档补种口径＝**按当时的聊天显示名**（chatName || name）落一份：升级这一刻屏上任何名字都不变
  // （不补种的话其他功能会当场从「小满」跳回「梦角1」＝用户莫名其妙自己误会），补种之后那口池子
  // 再换就只动聊天那一格。用户在「TA 的设置」里改这一格即覆盖补种值；清空＝回到跟随 name。
  // 判据只认「缺这一格／不是字符串」——用户显式设过空串（＝要求跟随 name）的下次加载会被这句再补上，
  // 但那与「没设过」在数据上不可区分，且补上的值就是当时的显示名，观感一致，可接受。
  if (!raw._fixedNameSeeded) {
    raw._fixedNameSeeded = true;
    for (const c of raw.contacts) {
      if (typeof c.fixedName !== 'string' || !c.fixedName) c.fixedName = String(c.chatName || c.name || '');
    }
  }
  if (!raw.chats || typeof raw.chats !== 'object') raw.chats = {};
  for (const c of raw.contacts) {
    const ch = (raw.chats[c.id] && typeof raw.chats[c.id] === 'object') ? raw.chats[c.id] : {};
    if (!Array.isArray(ch.msgs)) ch.msgs = [];
    if (typeof ch.unread !== 'number' || !isFinite(ch.unread)) ch.unread = 0;
    if (typeof ch.draft !== 'string') ch.draft = '';
    raw.chats[c.id] = ch;
  }
  for (const k of Object.keys(raw.chats)) if (!raw.contacts.some(c => c.id === k)) delete raw.chats[k];
  // 空册（出厂不预置联系人／用户删完了最后一位）＝没有活跃会话：旧写法 raw.contacts[0].id 会当场
  // TypeError 把整块 ensureData 掀掉（#021 那一族：顶层一抛＝data 加载失败＝白屏），且下面绑定 messages 那一行跟着崩
  if (!raw.activeChat || !raw.chats[raw.activeChat]) raw.activeChat = raw.contacts.length ? raw.contacts[0].id : '';
  // 活跃会话流绑定：data.messages 恒为 activeChat 的同一数组引用（空册＝空数组，不是 undefined）
  raw.messages = (raw.activeChat && raw.chats[raw.activeChat]) ? raw.chats[raw.activeChat].msgs : [];
  // 安全字段
  const p = raw.profile || {};
  if (!p.name) p.name = def.profile.name;
  // 同上：profile.name 是 c0 的第二个名字位（mate.saveMateProfile 对 c0 写这里），一并迁
  if (p.name === 'Ordinal') p.name = TA_FALLBACK_NAME;
  // 性别设置已删（无 UI 入口）：清掉旧档残留，称呼统一用中性的「TA」
  delete p.gender;
  raw.profile = p;
  const me = raw.me || {};
  if (!me.name) me.name = def.me.name;
  raw.me = me;
  const b = raw.behavior || {};
  const db = def.behavior;
  // 输入栏那枚「继续说」按钮已撤（唯一入口＝点顶部昵称），老档里存的 csTriggerBar 是个没人读的孤儿键，
  // 跟上面 delete p.gender 同理：清掉，别让它在存档里一直躺着像个还能用的开关
  delete b.csTriggerBar;
  // 旧字段迁移：minDelay/maxDelay → rsMin/rsMax；单值 replyCount → replyMin/replyMax
  if (('minDelay' in b) && !('rsMin' in b)) { if (b.minDelay !== undefined) b.rsMin = b.minDelay; if (b.maxDelay !== undefined) b.rsMax = b.maxDelay; }
  if (('replyCount' in b) && !('replyMin' in b)) { const _rc = [1, 2, 3].includes(Number(b.replyCount)) ? Number(b.replyCount) : 1; b.replyMin = _rc; b.replyMax = _rc; }
  for (const k of Object.keys(db)) {
    const dv = db[k];
    if (typeof dv === 'boolean') { if (b[k] === undefined || b[k] === null || b[k] === '') b[k] = dv; else b[k] = !!b[k]; }
    else if (typeof b[k] !== 'number' || !isFinite(b[k])) b[k] = dv;
  }
  raw.behavior = b;
  // 回复设置按联系人隔离：chatSettings[id] = 该联系人的 behavior；data.behavior 恒为活跃联系人的同一引用。
  // 一次性迁移：给存量联系人都播种一份当前全局设置（起点一致，之后各改各的互不影响）
  const _normBh = (bb) => {
    for (const k of Object.keys(db)) {
      const dv = db[k];
      if (typeof dv === 'boolean') { if (typeof bb[k] !== 'boolean') bb[k] = dv; }
      else if (typeof bb[k] !== 'number' || !isFinite(bb[k])) bb[k] = dv;
    }
    return bb;
  };
  if (!raw._bhPerContact) {
    raw._bhPerContact = true;
    if (!raw.chatSettings || typeof raw.chatSettings !== 'object') raw.chatSettings = {};
    const _bhSeed = JSON.parse(JSON.stringify(b));
    for (const c of raw.contacts) if (!raw.chatSettings[c.id]) raw.chatSettings[c.id] = JSON.parse(JSON.stringify(_bhSeed));
  }
  if (!raw.chatSettings || typeof raw.chatSettings !== 'object') raw.chatSettings = {};
  for (const k of Object.keys(raw.chatSettings)) {
    if (!raw.contacts.some(c => c.id === k)) { delete raw.chatSettings[k]; continue; }
    if (!raw.chatSettings[k] || typeof raw.chatSettings[k] !== 'object') raw.chatSettings[k] = JSON.parse(JSON.stringify(def.behavior));
    else _normBh(raw.chatSettings[k]);
    // 同上：每位联系人那份里的 csTriggerBar 也清掉（seeds 是从旧 b 拷来的，会带着那个孤儿键）
    delete raw.chatSettings[k].csTriggerBar;
  }
  // 两处出厂默认值改口的**一次性**归位（2026-10-14 用户定档：主动发送间隔出厂 1~5 分钟 ∶ 聊天情绪出厂走「混合」）：
  // 只换「恰好还停在旧出厂值」的那几格，用户真调过的数一个字不动（与 #136 那把尺同理）；
  // 不带标记就会在用户下次把间隔改回 10 之后、再带档加载又被悄悄收回＝拿后台改用户的有意选择（#211 那一课的反面）。
  if (!raw._asDefaultToFive) {
    raw._asDefaultToFive = true;
    if (Number(b.asMax) === 10) b.asMax = 5;
    for (const k of Object.keys(raw.chatSettings)) if (Number(raw.chatSettings[k].asMax) === 10) raw.chatSettings[k].asMax = 5;
  }
  // 空册时不往 chatSettings[''] 种账：behavior 保持上面归一好的那一份（b），
  // 按活跃会话取档的读侧（chat.js _asBhOf ∶ mate.js ∶ …）缺档时本来就会兜 defaults，不留一个键为空的死人账
  if (raw.activeChat && !raw.chatSettings[raw.activeChat]) raw.chatSettings[raw.activeChat] = JSON.parse(JSON.stringify(b));
  raw.behavior = (raw.activeChat && raw.chatSettings[raw.activeChat]) || b;
  // 2026-10-08 那次「回复条数两格固定为出厂 1~2」的一次性归位迁移已整块撤掉（BUGS #211＝用户点名把
  // 那两格装回来）。留着它就会在用户第一次把条数改成 5 之后、下次带档加载又悄悄收回 1~2＝改用户的
  // 有意选择（本仓「不可调整却看着能调」那一族的反面：可调整却被后台改值）。这里只清那个没人读的记录键。
  delete raw._replyCountFixed;
  // ===== 聊天情绪标签（BUGS #309）=====
  // 全局默认那份：四格概率表驱动补齐（照上面 behavior 那一段同一手法＝以后加一格自动补，不必再写迁移），
  // mode 只认四档枚举、脏值一律回落出厂那一档。0 是合法值，不许被「|| 默认」顶掉。
  // 出厂档 2026-10-14 由 off 改成 mixed（用户「聊天情绪需要默认开启混合」）：一次性把**还停在旧出厂值 off**
  // 的全局那一份归到 mixed——off 从来就是这一族上线时的默认，不是他挑过的；某一位自己那本里显式存着 off 的
  // 不动（emotionBy 只存被改过的格＝那一条是有意关掉的人）。标记落库＝只跑一次，之后他自己关就不再翻回来。
  const de = def.emotion, eb = (raw.emotion && typeof raw.emotion === 'object') ? raw.emotion : {};
  if (EMOTION_MODES.indexOf(eb.mode) < 0) eb.mode = de.mode;
  if (!raw._emoMixedDefault) { raw._emoMixedDefault = true; if (eb.mode === 'off') eb.mode = de.mode; }
  for (const k of Object.keys(de)) {
    if (k === 'mode') continue;
    const n = Number(eb[k]);
    eb[k] = (isFinite(n) && eb[k] !== '' && eb[k] !== null && eb[k] !== undefined) ? Math.max(0, Math.min(100, Math.round(n))) : de[k];
  }
  raw.emotion = eb;
  // 每位自己那一份：只存被改过的格（跟随默认时整本不建），人已不在册就整本剪掉
  if (!raw.emotionBy || typeof raw.emotionBy !== 'object') raw.emotionBy = {};
  for (const k of Object.keys(raw.emotionBy)) {
    if (!raw.contacts.some(c => c.id === k) || !raw.emotionBy[k] || typeof raw.emotionBy[k] !== 'object') { delete raw.emotionBy[k]; continue; }
    const one = raw.emotionBy[k];
    if (one.mode !== undefined && EMOTION_MODES.indexOf(one.mode) < 0) delete one.mode;
    for (const kk of Object.keys(one)) {
      if (kk === 'mode') continue;
      const n = Number(one[kk]);
      if (!isFinite(n) || one[kk] === '' || one[kk] === null) delete one[kk];
      else one[kk] = Math.max(0, Math.min(100, Math.round(n)));
    }
    if (!Object.keys(one).length) delete raw.emotionBy[k];
  }
  // 词表副本：null/形状不对就整本回落出厂表（不逐条兜底＝「少于 N 项就补」等于用户删不掉任何东西，#204 同一条）
  const lib = raw.emotionLib;
  if (!lib || typeof lib !== 'object' || !Array.isArray(lib.mood) || !Array.isArray(lib.heart) ||
      !Array.isArray(lib.intent) || !lib.connect || typeof lib.connect !== 'object' || !lib.map) raw.emotionLib = null;
  // 停用表：只留 {kind:{组名:[字符串…]}} 这一种形状，空串与脏项丢掉、空组与空类连带清掉
  const off = raw.emotionOff;
  if (!off || typeof off !== 'object' || Array.isArray(off)) raw.emotionOff = {};
  else for (const kind of Object.keys(off)) {
    const byg = off[kind];
    if (!byg || typeof byg !== 'object' || Array.isArray(byg)) { delete off[kind]; continue; }
    for (const g of Object.keys(byg)) {
      const arr = Array.isArray(byg[g]) ? byg[g].filter(t => typeof t === 'string' && t.trim()) : [];
      if (arr.length) byg[g] = Array.from(new Set(arr)); else delete byg[g];
    }
    if (!Object.keys(byg).length) delete off[kind];
  }
  // 音效按联系人隔离：无配置=跟随全局 data.sounds；孤儿键（联系人已删）清理，键形状归一
  if (!raw.chatSounds || typeof raw.chatSounds !== 'object') raw.chatSounds = {};
  else {
    for (const k of Object.keys(raw.chatSounds)) {
      if (!raw.contacts.some(c => c.id === k)) { delete raw.chatSounds[k]; continue; }
      const st = raw.chatSounds[k];
      if (!st || typeof st !== 'object') { delete raw.chatSounds[k]; continue; }
      for (const sk of ['partnerMsg', 'myMsg', 'incomingCall']) {
        if (!st[sk] || typeof st[sk] !== 'object') { delete st[sk]; continue; }
        if (typeof st[sk].on !== 'boolean') delete st[sk];
        if (typeof st[sk].custom !== 'string') st[sk].custom = '';
        if (typeof st[sk].preset !== 'string') st[sk].preset = 'ding';
      }
      if (!Object.keys(st).length) delete raw.chatSounds[k];
    }
  }
  if (!raw.groups) raw.groups = def.groups;
  // 预置字卡认回（每次加载都认一遍，新版本新增的预置组对老档同样生效）。
  // FIX 2026-10-04 #035 必须跑在下面那圈分类清洗之前：清洗把缺失/废弃的分类名一律改写成「主字卡」，
  // 改写之后再按 name+category 比对就永远对不上内置清单，这组系统文案就此漏进「字卡库」
  markPresetGroups(raw.groups);
  // 旧档无 scope 字段：一次性归入专属字卡（own），public 只认显式值，保证公用/专属两作用域恒可用；
  // contactId=联系人专属分组（MiniMax 语音按联系人落库用，''=通用）；联系人已删除的孤儿组回退通用，避免永远不可见
  raw.groups.forEach(g => {
    if (!CARD_CATEGORIES.includes(g.category)) g.category = '主字卡';
    // 2026-10-04 用户直派「字卡库和系统预设字卡完全分开」：自建组若挂在预置专有分类（TA心里话）下，
    // 字卡库那一面已硬排除该分类的 tab（render.js renderGroups），这组就会两页都看不到＝真孤儿。
    // 一次性归位到「主字卡」：内容一条不丢、立刻回到字卡库可见，而预置组走另一页不受影响
    // （引擎取预置卡按 name+category，两边本就分开记账）。
    if (!g.preset && PRESET_ONLY_CATEGORIES.includes(g.category)) g.category = '主字卡';
    if (g.scope !== 'public') g.scope = 'own';
    if (typeof g.contactId !== 'string') g.contactId = '';
    if (g.contactId && !(raw.contacts || []).some(c => c && c.id === g.contactId)) g.contactId = '';
    // 2026-10-05 字卡硬隔离（专属未绑定＝停用）之后必须给出厂预置组一条归位：预置组本就不给绑定徽标
    // （render.js _bindBadgeHTML 只在自建那一面出），一律视为公用；老档里若存成 own 且无绑定，
    // 不改成公用的话这批话术会被判死，TA 在该功能上直接没话可说
    if (g.preset && !g.contactId) g.scope = 'public';
  });
  // 2026-10-05 用户直派「聊天默认兜底那两组删掉」：defaults 已摘 日常回应／温柔片段，老档必须一次性删净——
  // markPresetGroups 不再按名认回这两个组，留着它们下次加载就以「自建组」身份漏进字卡库（BUGS #035 同族）。
  // 只跑一次（带标记）：日后用户自己新建同名组不该被反复删掉
  if (!raw._chatFallbackRemoved) {
    raw._chatFallbackRemoved = true;
    raw.groups = raw.groups.filter(g => !(((g.name || '') === '日常回应' || (g.name || '') === '温柔片段') && (g.category || '主字卡') === '主字卡'));
  }
  // 2026-10-07 用户直派「联系人跟我早安和晚安的功能删掉」：defaults 已摘 早安／晚安 两组，老档必须一次性删净——
  // markPresetGroups 不再按名认回它们，留着就是「没有任何读方的预置话术」还挂在系统预设字卡那一面。
  // 判定只看组名（这两个名字曾是预置组专有），且靠一次性标记保护：日后用户自己新建同名组不该被反复删掉。
  if (!raw._greetRitualRemoved) {
    raw._greetRitualRemoved = true;
    raw.groups = raw.groups.filter(g => !((g.name || '') === '早安' || (g.name || '') === '晚安'));
  }
  // 2026-10-10 朋友圈整族下线（BUGS #268）：defaults 已摘「朋友圈理由」那组（唯一读方是 TA 发动态后的自评），
  // 老档必须一次性删净——markPresetGroups 不再按名认回它，留着就是「没有任何读方的预置话术」还挂在系统预设字卡那一面。
  // 判定只看组名，且靠一次性标记保护：日后用户自己新建同名组不该被反复删掉。
  if (!raw._momentsReasonRemoved) {
    raw._momentsReasonRemoved = true;
    raw.groups = raw.groups.filter(g => (g.name || '') !== '朋友圈理由');
  }
  // 系统内置字卡组补齐（仅当用户本地缺失时补回，不覆盖用户内容）
  // FIX 2026-09-03 #036 原读全局 data.groups——load() 流程中此时 data 尚未赋值（init 里 data=await load()），
  // 本地有存档时二次加载必崩（ensureData 抛 TypeError → load 拒绝 → data 永远 undefined → 启动卡死），改读 raw.groups
  for (const dg of def.groups) {
    if (!dg || !dg.system) continue;
    if (!raw.groups.some(g => (g.name || '') === dg.name && (g.category || '主字卡') === dg.category)) {
      raw.groups.push(JSON.parse(JSON.stringify(dg)));
    }
  }
  // TA心里话字卡组（收藏/写信理由 + 印象）一次性播种：用户可改可删，删了不复活（区别于 system 组的缺失即补）
  if (!raw._reasonSeeded) {
    raw._reasonSeeded = true;
    for (const dg of def.groups) {
      if (!dg || dg.category !== 'TA心里话') continue;
      if (!raw.groups.some(g => (g.name || '') === dg.name && (g.category || '主字卡') === 'TA心里话')) raw.groups.push(JSON.parse(JSON.stringify(dg)));
    }
  }
  // 二批 TA心里话组补种（状态签名，配世界感知）：同口径一次性补种，删了不复活
  // 这一批原本还带 早安／晚安 两组，随「早安晚安仪式」整族下线一起摘除（见上面 _greetRitualRemoved）
  if (!raw._reasonSeeded2) {
    raw._reasonSeeded2 = true;
    const _cjNames = ['状态签名'];
    for (const dg of def.groups) {
      if (!dg || dg.category !== 'TA心里话' || !_cjNames.includes(dg.name)) continue;
      if (!raw.groups.some(g => (g.name || '') === dg.name && (g.category || '主字卡') === 'TA心里话')) raw.groups.push(JSON.parse(JSON.stringify(dg)));
    }
  }
  // 三批 TA心里话组（月与天气的话，配世界感知「夜里／雨雪风」那两句呢喃）：同口径一次性补种，删了不复活
  if (!raw._reasonSeeded3) {
    raw._reasonSeeded3 = true;
    for (const dg of def.groups) {
      if (!dg || dg.category !== 'TA心里话' || dg.name !== '月与天气的话') continue;
      if (!raw.groups.some(g => (g.name || '') === dg.name && (g.category || '主字卡') === 'TA心里话')) raw.groups.push(JSON.parse(JSON.stringify(dg)));
    }
  }
  // 四批 TA心里话组（回忆引子/心愿，配回忆闪回与心愿）：同口径一次性补种，删了不复活
  if (!raw._reasonSeeded4) {
    raw._reasonSeeded4 = true;
    const _names = ['回忆引子', '心愿'];
    for (const dg of def.groups) {
      if (!dg || dg.category !== 'TA心里话' || !_names.includes(dg.name)) continue;
      if (!raw.groups.some(g => (g.name || '') === dg.name && (g.category || '主字卡') === 'TA心里话')) raw.groups.push(JSON.parse(JSON.stringify(dg)));
    }
  }
  // 五批 TA心里话组（梦境/心愿回响，配 TA 的梦与心愿闭环）：同口径一次性补种，删了不复活
  if (!raw._reasonSeeded5) {
    raw._reasonSeeded5 = true;
    const _names5 = ['梦境', '心愿回响'];
    for (const dg of def.groups) {
      if (!dg || dg.category !== 'TA心里话' || !_names5.includes(dg.name)) continue;
      if (!raw.groups.some(g => (g.name || '') === dg.name && (g.category || '主字卡') === 'TA心里话')) raw.groups.push(JSON.parse(JSON.stringify(dg)));
    }
  }
  // 六批 TA心里话组（TA的问题/回答/里程碑，配反向提问与里程碑）：同口径一次性补种，删了不复活。
  // 「戳评」这一档 2026-10-13 随邮戳册下线摘出名单——defaults 里已没有这组，留在名单里也种不出东西，
  // 但名单与注释一起改才不说假话（同 #120 早安晚安那次把两组从 _reasonSeeded2 收成只剩「状态签名」）
  if (!raw._reasonSeeded6) {
    raw._reasonSeeded6 = true;
    const _names6 = ['TA的问题', 'TA的回答', '里程碑'];
    for (const dg of def.groups) {
      if (!dg || dg.category !== 'TA心里话' || !_names6.includes(dg.name)) continue;
      if (!raw.groups.some(g => (g.name || '') === dg.name && (g.category || '主字卡') === 'TA心里话')) raw.groups.push(JSON.parse(JSON.stringify(dg)));
    }
  }
  // 七批 TA心里话组（体感，配靠近事件）：同口径一次性补种，删了不复活
  if (!raw._reasonSeeded7) {
    raw._reasonSeeded7 = true;
    for (const dg of def.groups) {
      if (!dg || dg.category !== 'TA心里话' || dg.name !== '体感') continue;
      if (!raw.groups.some(g => (g.name || '') === dg.name && (g.category || '主字卡') === 'TA心里话')) raw.groups.push(JSON.parse(JSON.stringify(dg)));
    }
  }
  // 八批 TA心里话组（心愿回应/心愿促成，配 TA 看见你记的心愿与主动促成）：同口径一次性补种，删了不复活；
  // 另把心愿/心愿回响的扩句并进已有组（只追加缺句，整组删掉的不复活）
  if (!raw._reasonSeeded8) {
    raw._reasonSeeded8 = true;
    const _names8 = ['心愿回应', '心愿促成'];
    for (const dg of def.groups) {
      if (!dg || dg.category !== 'TA心里话' || !_names8.includes(dg.name)) continue;
      if (!raw.groups.some(g => (g.name || '') === dg.name && (g.category || '主字卡') === 'TA心里话')) raw.groups.push(JSON.parse(JSON.stringify(dg)));
    }
    for (const _n8 of ['心愿', '心愿回响']) {
      const _g8 = raw.groups.find(g => (g.name || '') === _n8 && (g.category || '主字卡') === 'TA心里话');
      const _d8 = def.groups.find(g => (g.name || '') === _n8 && (g.category || '主字卡') === 'TA心里话');
      if (_g8 && _d8 && Array.isArray(_g8.cards)) for (const c of (_d8.cards || [])) if (!_g8.cards.includes(c)) _g8.cards.push(c);
    }
  }
  // 2026-10-13 邮戳册整族下线（含信上的戳本身，用户定档「连信上的邮戳一起删」「旧信上的戳全清」）：
  // defaults 已摘「戳评」「集邮的话」两组，老档必须一次性删净——markPresetGroups 不再按名认回它们，
  // 留着就是「没有任何读方的预置话术」还挂在系统预设字卡那一面（与 #120 早安晚安·#268 朋友圈理由同一课）。
  // 判定只看组名，且靠一次性标记保护：日后用户自己新建同名组不该被反复删掉。
  // 同批把这三段自己的迁移标记一并清掉＝它们已没有任何读方，留着是「没人读的键」。
  if (!raw._stampGroupsRemoved) {
    raw._stampGroupsRemoved = true;
    raw.groups = (raw.groups || []).filter(g => !((g.name || '') === '戳评' || (g.name || '') === '集邮的话'));
  }
  delete raw._reasonSeeded9; delete raw._stampLinesFix; delete raw._moonLinesGone;
  // 十批 TA心里话组（信的回应，配 TA 回信先回应你的信）：同口径一次性补种，删了不复活（删组=回信退回纯字卡正文）
  if (!raw._reasonSeeded10) {
    raw._reasonSeeded10 = true;
    for (const dg of def.groups) {
      if (!dg || dg.category !== 'TA心里话' || dg.name !== '信的回应') continue;
      if (!raw.groups.some(g => (g.name || '') === dg.name && (g.category || '主字卡') === 'TA心里话')) raw.groups.push(JSON.parse(JSON.stringify(dg)));
    }
  }
  // 十一批 TA心里话组（情绪的话，配情绪感知卡的自述）：同口径一次性补种，删了不复活（删组＝只剩档名）。
  // 这一批是补漏：情绪的话随情绪感知卡一起加进 defaults，却漏了补种块，而上面那次「全部 TA心里话」播种
  // 认的是 _reasonSeeded 一次性标记（老档早就 true 了）＝老存档永远拿不到这个池，屏上只有档名没有自述。
  // 顺带把 2026-10-05 调软的八句按「整句精确等于旧句」就地换掉——用户改过的句子不匹配旧串，一个字都不动。
  if (!raw._reasonSeeded11) {
    raw._reasonSeeded11 = true;
    for (const dg of def.groups) {
      if (!dg || dg.category !== 'TA心里话' || dg.name !== '情绪的话') continue;
      if (!raw.groups.some(g => (g.name || '') === dg.name && (g.category || '主字卡') === 'TA心里话')) raw.groups.push(JSON.parse(JSON.stringify(dg)));
    }
    const _SOFT11 = {
      '低落：有点提不起劲，不是因为你': '低落：有点提不起劲，缓一缓就回来',
      '低落：话到嘴边又咽回去了': '低落：今天话少一点，不是出了什么事',
      '低落：情绪低了一点，让我缓一会儿': '低落：想靠着你发一会儿呆',
      '烦躁：有点坐不住，别往心里去': '烦躁：有点坐不住，像心里过了一阵风',
      '烦躁：脑子里嗡嗡的，想安静一会儿': '烦躁：语气要是急了点，你等我缓口气',
      '烦躁：语气要是冲了，那不是对你': '烦躁：想安静一会儿，等下回来找你',
      '淡淡的：像隔了层雾，什么都没发生': '淡淡的：像隔了层薄雾，还看得见你在',
      '淡淡的：有点空，不太想说话': '淡淡的：有点空空的，待着就好'
    };
    const _g11 = raw.groups.find(g => (g.name || '') === '情绪的话' && (g.category || '主字卡') === 'TA心里话');
    if (_g11 && Array.isArray(_g11.cards)) _g11.cards = _g11.cards.map(c => (Object.prototype.hasOwnProperty.call(_SOFT11, c) ? _SOFT11[c] : c));
  }
  // 十二批 TA心里话组（读到的你，配「TA 读你」卡的台词）：同口径一次性补种，删了不复活（删组=只剩档名）
  if (!raw._reasonSeeded12) {
    raw._reasonSeeded12 = true;
    for (const dg of def.groups) {
      if (!dg || dg.category !== 'TA心里话' || dg.name !== '读到的你') continue;
      if (!raw.groups.some(g => (g.name || '') === dg.name && (g.category || '主字卡') === 'TA心里话')) raw.groups.push(JSON.parse(JSON.stringify(dg)));
    }
  }
  // 「读到的你」那句带攻击性的话术（2026-10-08 用户判「这不合适」）：老档就地换一次，只按整句精确等于旧句换，
  // 用户自己改过的句子不匹配旧串、一个字不动。刻意不并进上面那个 _reasonSeeded12 块——那个标记老档早就 true 了，
  // 换句要跑在已存在的档案上，必须自己带一枚一次性标记。
  if (!raw._readSayFix) {
    raw._readSayFix = true;
    const _SOFT12 = { '有点烦：谁惹你了，我去骂他': '有点烦：我帮不上什么，就陪着你' };
    const _g12 = raw.groups.find(g => (g.name || '') === '读到的你' && (g.category || '主字卡') === 'TA心里话');
    if (_g12 && Array.isArray(_g12.cards)) _g12.cards = _g12.cards.map(c => (Object.prototype.hasOwnProperty.call(_SOFT12, c) ? _SOFT12[c] : c));
  }
  // 十三批 TA心里话组（世界感知那一页其余五条读数线的台词池）：同口径一次性补种，删了不复活
  // （删组＝那条线不再有词可说，屏上照旧亮档名、只是不开口）。补的是同一个漏：新池随 defaults 加进去、
  // 老档却没有任何路径补得进去（上面那次「全部 TA心里话」播种认的是 _reasonSeeded 一次性标记，老档早就 true 了），
  // #057 为「情绪的话」踩过一次，这次一次补六组
  if (!raw._reasonSeeded13) {
    raw._reasonSeeded13 = true;
    const _REASON13 = ['示软的话', '心动的话', '说明白的话', '干扰的话', '距离的话', '此刻在做的话'];
    for (const dg of def.groups) {
      if (!dg || dg.category !== 'TA心里话' || !_REASON13.includes(dg.name)) continue;
      if (!raw.groups.some(g => (g.name || '') === dg.name && (g.category || '主字卡') === 'TA心里话')) raw.groups.push(JSON.parse(JSON.stringify(dg)));
    }
  }
  // 十四批 TA心里话组（邀请答复，BUGS #270）：同口径一次性补种，删了不复活。
  // 这条规矩本仓为「情绪的话」踩过一次（#057）：只进 defaults 不进补种＝老档永远没有这个词池，
  // 症状是「我邀请 TA，TA 一声不吭就把状态改了」——看着像坏了，其实是池子在那台机器上从来不存在
  if (!raw._reasonSeeded14) {
    raw._reasonSeeded14 = true;
    for (const dg of def.groups) {
      if (!dg || dg.category !== 'TA心里话' || dg.name !== '邀请答复') continue;
      if (!raw.groups.some(g => (g.name || '') === dg.name && (g.category || '主字卡') === 'TA心里话')) raw.groups.push(JSON.parse(JSON.stringify(dg)));
    }
  }
  // 十五批 TA心里话组（形象自评，BUGS #401）：TA 对自己新形象的看法，与「印象」（TA 看我的形象）分成两池。
  // 与 #057「情绪的话」同一课：只进 defaults 不进补种＝老档永远只有档名没有台词，
  // 症状是「TA 换头像后什么看法都不留」——看着像坏了，其实是池子在那台机器上从来不存在
  if (!raw._reasonSeeded15) {
    raw._reasonSeeded15 = true;
    for (const dg of def.groups) {
      if (!dg || dg.category !== 'TA心里话' || dg.name !== '形象自评') continue;
      if (!raw.groups.some(g => (g.name || '') === '形象自评' && (g.category || '主字卡') === 'TA心里话')) raw.groups.push(JSON.parse(JSON.stringify(dg)));
    }
  }
  // 统一投递钟上线（BUGS #189）：闪回／梦／TA 想问你那三条线各自的「当日一次＋小时冷却」硬额度串就此作废，
  // 开口节奏只由 cjian.js 里 en.sayNext 那一条随机钟管；旧档那几个键清掉，不留没人读的惰性值
  delete raw._flashDate; delete raw._flashLast;
  delete raw._dreamDate; delete raw._dreamLast;
  delete raw._taqDate; delete raw._taqLast;
  // 世界感知（cjian.js 调度消费）
  if (!raw.cjian || typeof raw.cjian !== 'object') raw.cjian = JSON.parse(JSON.stringify(def.cjian));
  else {
    if (typeof raw.cjian.enabled !== 'boolean') raw.cjian.enabled = true;
    if (typeof raw.cjian.moodOn !== 'boolean') raw.cjian.moodOn = true;
    if (typeof raw.cjian.sgOn !== 'boolean') raw.cjian.sgOn = true;
    if (typeof raw.cjian.readOn !== 'boolean') raw.cjian.readOn = true;
    // 心动／干扰／接住三族 2026-10-08 才补上 defaults，旧档里这三个键从来不存在——读侧一律写 `!== false`，
    // 缺键＝开，所以不补也不会坏；补齐只为「开关的键在 defaults／ensureData／屏上入口三处同源」，不留第二份判据
    if (typeof raw.cjian.btOn !== 'boolean') raw.cjian.btOn = true;
    if (typeof raw.cjian.ngOn !== 'boolean') raw.cjian.ngOn = true;
    if (typeof raw.cjian.undOn !== 'boolean') raw.cjian.undOn = true;
    // 「这功能发的话挂不挂小签」自此没有开关（面板里那格勾选框整族下线，BUGS #190）：
    // 旧档设过 false 的那格清掉——cjian.js 里那个读它的函数已删，留着就是个没人读的键
    delete raw.cjian.srcBadge;
    if (!raw.cjian.by || typeof raw.cjian.by !== 'object') raw.cjian.by = {};
    const _P = ['near', 'nearby', 'far', 'unfelt', 'gone'], _A = ['free', 'busy', 'rushed', 'rest', 'sleep', 'unknown'];
    const _MO = ['joy', 'soft', 'calm', 'low', 'irritable', 'miss', 'blank'];   // 情绪七档，与 cjian.js 的 CJ_MOODS 同名单
    const _RD = ['bright', 'steady', 'tired', 'raw', 'needy', 'quiet', 'unk'];   // TA 读你七档，与 cjian.js 的 CJ_READ 同名单
    const _num = v => (typeof v === 'number' && isFinite(v)) ? v : 0;
    for (const k of Object.keys(raw.cjian.by)) {
      const en = raw.cjian.by[k];
      if (!en || typeof en !== 'object') { delete raw.cjian.by[k]; continue; }
      // 时间流偏移 2026-10-09 按用户更正恢复（#190 那句「删掉」指的是设置那一格，不是「每位各一条时间流」这件事）；
      // 0＝还没抽过，交给 _cjEntry 建档时补一次并落盘。slots／busySlots 两族仍不设＝它们只有那排 chips 一个写手，
      // 入口没了还留着字段，才是 #159 那一族「哪儿也改不动却仍在生效」
      en.offsetMin = Math.max(-1440, Math.min(1440, _num(en.offsetMin)));
      delete en.slots; delete en.busySlots;
      if (!en.world || typeof en.world !== 'object') en.world = { hh: 0, mm: 0, last: 0, next: 0 };
      en.world.hh = Math.floor(_num(en.world.hh)) % 24; en.world.mm = Math.floor(_num(en.world.mm)) % 60;
      en.world.last = _num(en.world.last); en.world.next = _num(en.world.next);
      if (!_P.includes(en.p)) en.p = 'nearby';
      if (!_A.includes(en.a)) en.a = 'free';
      en.sinceP = _num(en.sinceP); en.cdP = _num(en.cdP);
      en.sinceA = _num(en.sinceA); en.cdA = _num(en.cdA);
      if (typeof en.status !== 'string') en.status = '';
      en.sinceS = _num(en.sinceS); en.cdS = _num(en.cdS);
      // 情绪感知（档＋自述各存一份，按联系人隔离）：档不在枚举内就归中性档，自述只认字符串
      if (!_MO.includes(en.mo)) en.mo = 'calm';
      en.sinceMo = _num(en.sinceMo) || Date.now(); en.cdMo = _num(en.cdMo) || 1500000;
      if (typeof en.moSay !== 'string') en.moSay = '';
      en.moSayTs = _num(en.moSayTs) || en.sinceMo;
      if (['on', 'some', 'flat', 'none'].indexOf(en.sg) < 0) en.sg = 'flat';
      en.sinceSg = _num(en.sinceSg) || Date.now(); en.cdSg = _num(en.cdSg) || 900000;
      // TA 读你（档＋台词各存一份，按联系人隔离）：与情绪同族的一条随机线，不从消息派生
      if (!_RD.includes(en.rd)) en.rd = 'steady';
      en.sinceRd = _num(en.sinceRd) || Date.now(); en.cdRd = _num(en.cdRd) || 1500000;
      if (typeof en.rdSay !== 'string') en.rdSay = '';
      en.rdSayTs = _num(en.rdSayTs) || en.sinceRd;
      // 「当日只一条」这类硬额度串 2026-10-08 随统一投递钟一起退役（BUGS #189）：开口节奏自此只由
      // en.sayNext 那一条随机钟管，不留第二处封顶；旧档那三个日期串就地清掉
      delete en.rdSentDay; delete en.lastMoonDay; delete en.lastWxDay;
      // 说过的句子（同一条钟不再把同一句说第二遍）：只认字符串数组，脏值整本重开＝空着，不拿脏值凑数
      if (!Array.isArray(en.spoken)) en.spoken = [];
      else en.spoken = en.spoken.filter(s => typeof s === 'string' && s).slice(-10);
      // 情绪卡「你」那一行＝TA 读到的你的心情：另一条独立随机钟（45-110 分钟重读一次，读别人比读自己慢）。
      // 档不在枚举内归中性档；冷却兜底取这条线自己区间的下端（与 mo/cdMo、sg/cdSg 同一口径）
      if (!_MO.includes(en.moRead)) en.moRead = 'calm';
      // 间隔夹回这条线自己的区间：负数与 0 会让「now-since >= cd」恒真＝每个 tick 重掷一次（#072 踩过）
      en.sinceMoRead = _num(en.sinceMoRead) > 0 ? en.sinceMoRead : Date.now();
      en.cdMoRead = Math.min(110, Math.max(45, Math.round(_num(en.cdMoRead) / 60000))) * 60000;
      // 次档（2026-10-07 用户判「怎么可能只触发一个情绪」）：只认名单内、不得与主档同名、**主档是平静时必为空**
      // （定档「抽到平静就只亮它一枚」＝平静×雀跃 是打嘴不是复杂）。旧档没有这两个键＝次档空着，
      // 屏上仍是单独一枚——不替用户回忆「当时大概还有别的情绪」
      const _m2 = (p, s) => (p !== 'calm' && _MO.includes(s) && s !== p) ? s : '';
      en.mo2 = _m2(en.mo, en.mo2);
      en.moRead2 = _m2(en.moRead, en.moRead2);
      // 三个旧键都没有读方了，旧档残留一并清掉（不留没人读的键）：
      // moodMine＝「我」那一格曾经由你手工点（现在改由上面那条钟供值）；sinceMine/cdMine＝更早那条「TA 帮你重标」的钟；
      // rdMe＝「你读 TA」借过「TA 读你」那张表的词——两套词表没有一一对应（「想静静」≠「淡淡的」），
      // 硬映射等于替你回忆当时点的是什么，不如清掉
      delete en.moodMine; delete en.sinceMine; delete en.cdMine; delete en.rdMe;
      // 白名单里的 k 是这一时间线会出现的全部种类（b=里程碑此前漏登记，刷新后那条「碑」就从历史里消失了；
      // i=旧「我」那一格的账（手工与重标两条写手都已撤，这一族不再有新条目），但那是用户已经看过的旧账，
      // 留在时间线里不删——漏登记就是一次刷新即消失（b 那个老坑）
      en.hist = Array.isArray(en.hist) ? en.hist.filter(e => e && typeof e.t === 'string' && e.t.trim() && typeof e.ts === 'number' && isFinite(e.ts) && ['s', 'n', 'p', 'r', 'w', 'd', 'f', 'b', 'm', 'u', 'i'].includes(e.k)).slice(-80) : [];
      if (en.lastApproach) en.lastApproach = _num(en.lastApproach);
    }
    for (const k of Object.keys(raw.cjian.by)) if (!raw.contacts.some(c => c.id === k)) delete raw.cjian.by[k];
  }
  // 早安晚安仪式整族下线（2026-10-07）：defaults 已摘 ritual、读方 mailbox.js 的 maybeRitual 已删，
  // 旧档那四个字段就地清掉，不留没人读的键（同 deskBgBlur／底色档那几族的口径）
  delete raw.ritual;
  // 群「偶尔自己聊天」整族退役（2026-10-09 BUGS #216）：那条按群的钟与它的参数一起撤——
  // 全局那枚种子 groupAmbient 与每群那本里的 amb 段（清洗在 chats.js 的 _gbhSanitize），
  // 群里自此只有【某位开口时落到群】这一个来路。defaults 已没有 groupAmbient 这个键，
  // 旧档那一副面孔就地清掉，留着是一句哪儿也改不动却还躺在备份里的死账
  // （同 deskBgBlur／底色档那几族的口径）。旧账里「TA 在群里自言自语」那些消息是用户真看过的，不回收。
  delete raw.groupAmbient;
  // 群内档位（每位成员在本群里覆盖的那几格）：清洗规则单一来源在 chats.js
  raw.groupBh = _gbhSanitize(raw.groupBh, raw.contacts);
  // 心愿（独立功能 js/wish.js）：每条带唯一 wid（列表操作按 id 定位，不再按下标——
  // 旧版按下标，超限裁剪等列表变动会让正开着的页面点错条目）；旧档补 wid/c0/'ta'；
  // 不设上限：全部历史都保留（心愿页自带月份分组与已实现归档，长列表可导出长图）
  if (!Array.isArray(raw.wishlist)) raw.wishlist = [];
  const _invHarvest = [];
  raw.wishlist = raw.wishlist.filter(e => e && typeof e.t === 'string' && e.t.trim() && typeof e.ts === 'number' && isFinite(e.ts)).map(e => {
    if (typeof e.wid !== 'string' || !e.wid) e.wid = 'w' + Math.floor(e.ts).toString(36) + Math.random().toString(36).slice(2, 6);
    if (typeof e.cid !== 'string' || !e.cid) e.cid = 'c0';
    if (e.by !== 'me' && e.by !== 'ta') e.by = 'ta';
    if (e.pin) e.pin = true; else delete e.pin;
    if (e.doneBy !== 'ta') delete e.doneBy;
    if (e.reacted) e.reacted = true; else delete e.reacted;
    // 融合期间挂在这一条心愿上的那枚 req（BUGS #270）→ 搬回邀请那一册，条目上的 req 自此不再有宿主。
    // 状态名单问 utils 那一枚 INVITE_STATUS（与 js/invite.js 的 _invOf 同一份）＝两处各写一份必漏一档
    const _rq = e.req && typeof e.req === 'object' ? e.req : null;
    if (_rq) {
      if ((_rq.dir === 'ta' || _rq.dir === 'me') && INVITE_STATUS.indexOf(_rq.status) >= 0
        && typeof _rq.at === 'number' && isFinite(_rq.at)) {
        const _rec = { iid: 'i' + e.wid, t: String(e.t).trim(), dir: _rq.dir, cid: e.cid, status: _rq.status, at: _rq.at, from: e.wid };
        if (typeof _rq.replyAt === 'number' && isFinite(_rq.replyAt)) _rec.replyAt = _rq.replyAt;
        if (typeof _rq.reply === 'string' && _rq.reply.trim()) _rec.reply = _rq.reply;
        _invHarvest.push(_rec);
      }
      // 不合形状的那份脏数据直接丢掉（画出来是一枚点不动的签），但条目上的这一格一律删：
      // **心愿条目本身留着不删**——那句话当初确实是一条心愿（TA 许的或你记的），撤一层功能不回收用户看过的东西
      delete e.req;
    }
    return e;
  });
  // 邀请（独立一册 js/invite.js；2026-10-11 撤销 #270 那次「并入心愿」）。三种来路一次认全：
  //   ① 上面从心愿条目上搬下来的那批（from＝当年的 wid＝聊天里那张卡还认得回来）
  //   ② 独立页最早那格字符串数组（#270 之前的备份／合并导入带回来的）→ 每句一行草稿，一句不丢
  //   ③ 本册自己的记录 → 逐字段清洗（脏形状整行丢，不拿脏数据凑一枚屏上点不动的签）
  // 刻意**不加一次性标记**：①的输入是 e.req 而它在同一次加载里就被删掉，第二次跑时那条心愿本就没有 req；
  // ②的输入是「这个元素是字符串」这一条事实，升级过一回就不再是字符串——两处天然幂等。
  // 与「旧出厂值 → 新出厂值」那种值修正不同（那种必须钉标记，否则会把用户后来改的数顶回去，#136 踩过）
  const _iv = [];
  const _ivSeenText = [];
  const _ivNow = Date.now();
  _invHarvest.forEach(rec => { rec.ts = rec.at; _iv.push(rec); _ivSeenText.push(rec.t); });
  const _ivFirst = (raw.contacts || [])[0];
  const _ivCid = (_ivFirst && _ivFirst.id) || (typeof raw.activeChat === 'string' && raw.activeChat) || 'c0';
  if (Array.isArray(raw.invites)) raw.invites.forEach((s, i) => {
    if (typeof s === 'string') {           // ②：只认字符串（非字符串强转成 '5' 灌进册子＝造一句假句子）
      const t = s.trim();
      if (!t || _ivSeenText.includes(t)) return;
      _ivSeenText.push(t);
      // 不替它编「你什么时候写下的」：草稿行没有时刻就是没有，屏上那一行跟着不画日期
      _iv.push({ iid: 'i' + _ivNow.toString(36) + '_' + i.toString(36), t: t });
      return;
    }
    if (!s || typeof s !== 'object') return;
    const t = typeof s.t === 'string' ? s.t.trim() : '';
    if (!t || _ivSeenText.includes(t)) return;
    const sent = (s.dir === 'ta' || s.dir === 'me') && INVITE_STATUS.indexOf(s.status) >= 0
      && typeof s.at === 'number' && isFinite(s.at);
    const rec = { iid: (typeof s.iid === 'string' && s.iid) ? s.iid : ('i' + _ivNow.toString(36) + '_' + i.toString(36)), t: t };
    // 这一行引用心愿册里的哪一条（草稿也可能带）——这张表是按固定字段清单**重建**每一条的，
    // 新字段不在这里登记一次＝当场存得住、下次打开被剪干净（#263 那条承重墙同一个坑）
    if (typeof s.wid === 'string' && s.wid) rec.wid = s.wid;
    if (typeof s.ts === 'number' && isFinite(s.ts)) rec.ts = s.ts;
    _ivSeenText.push(t);
    if (sent) {
      rec.dir = s.dir; rec.status = s.status; rec.at = s.at;
      rec.cid = (typeof s.cid === 'string' && s.cid) ? s.cid : _ivCid;
      // 「当前这一轮是哪张聊天卡」（#291 再请一次之后，上一轮那张卡靠它对不上号、老实改口）
      if (s.mid !== undefined && s.mid !== null && String(s.mid) !== '') rec.mid = s.mid;
      if (typeof s.replyAt === 'number' && isFinite(s.replyAt)) rec.replyAt = s.replyAt;
      if (typeof s.reply === 'string' && s.reply.trim()) rec.reply = s.reply;
      if (typeof s.from === 'string' && s.from) rec.from = s.from;
    }
    _iv.push(rec);
  });
  raw.invites = _iv;
  // 邮戳册整族下线（2026-10-13）：评语簿/「新」标簿/里程碑簿三本一起清——
  // 写手与读方都随册子没了，留着等于攒一笔永远没人读的旧账（同 delete raw.ritual 那一族）。
  delete raw.stampNotes; delete raw.stampSeen; delete raw.stampMilestones;
  // TA 想问你 / 回忆闪回 / 心愿 三个总开关（心愿从 flashOn 拆出来，老档缺字段就沿用它当时的档位）
  if (typeof raw.taAskOn !== 'boolean') raw.taAskOn = true;
  if (typeof raw.flashOn !== 'boolean') raw.flashOn = true;
  if (typeof raw.wishOn !== 'boolean') raw.wishOn = raw.flashOn;
  // 「这句说谁」的签开关：只在渲染侧读，已落库的 m.refer 不回改（翻回开关旧消息跟着长出签）
  if (typeof raw.referOn !== 'boolean') raw.referOn = true;
  // 「这句本意」的签开关同口径（那枚是同一颗签的第二段）
  if (typeof raw.meantOn !== 'boolean') raw.meantOn = true;
  // 「删除消息」总闸：出厂＝关。这一条与上面几枚默认相反，所以老档缺字段必须落 false 而不是「补 true」——
  // 写成 true 等于给每位老用户一上来就开删除，而用户定档是「默认关掉、要在设置里开」。
  if (typeof raw.delMsgOn !== 'boolean') raw.delMsgOn = false;
  // 「话没挤过来」那枚布尔闸整族退役（2026-10-10 换向）：它现在是回复节奏里的一个概率格（behavior.strayProb），
  // 填 0 就是从不——留着这枚没人读的键等于假装那个开关还在
  delete raw.strayOn;
  // 夜间免打扰（js/night.js，BUGS #306）：mode 只认那三档（脏值回落出厂 'ask'＝每晚问一次，不替他选「不用了」
  // 也不替他选「自动开」）；on/by 是布尔与字符串，askedDay 只当「问过了哪天」的串读。
  // 旧档缺这一整块时不补 on=true——出厂承诺是「没问过就什么都还没发生」
  if (!raw.night || typeof raw.night !== 'object' || Array.isArray(raw.night)) raw.night = JSON.parse(JSON.stringify(def.night));
  if (NIGHT_MODES.indexOf(raw.night.mode) < 0) raw.night.mode = 'ask';
  if (typeof raw.night.on !== 'boolean') raw.night.on = false;
  if (raw.night.by !== 'auto' && raw.night.by !== 'manual') raw.night.by = raw.night.on ? 'auto' : '';
  if (typeof raw.night.askedDay !== 'string') raw.night.askedDay = '';
  if (raw.night.mode === 'off' && raw.night.on) raw.night.on = false;   // 不用了＝不拦（否则屏上写着不用了、消息照样被拦）
  // 主动消息管理（js/silent.js）：ids＝被关掉主动消息的联系人与群 id 名单。整块缺失补出厂空名单
  // （老档缺这一块＝谁都还没被关＝补空名单即可，不替他默认关掉谁）；逐条只认非空串并去重，
  // 上限 SILENT_MAX_IDS。脏形状丢掉而不是让整块报废——这份名单是用户一项一项点的，容错宁丢不值错存。
  // 与 night 一样零迁移标记；指向已删对象的死格不在这里删（这一趟只管形状，不管名单与 contacts 对不对得上），
  // 由 js/silent.js 的 silentPrune 在删人那一刻与进那一页时各收一次
  if (!raw.silent || typeof raw.silent !== 'object' || Array.isArray(raw.silent)) raw.silent = JSON.parse(JSON.stringify(def.silent));
  if (!Array.isArray(raw.silent.ids)) raw.silent.ids = [];
  raw.silent.ids = raw.silent.ids.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim());
  raw.silent.ids = [...new Set(raw.silent.ids)].slice(0, SILENT_MAX_IDS);
  // 字卡适应度检查页那张表（js/cardfit.js）：_mergeDefaults 只在整字段缺失时补整表，所以「用户删到一项不剩」
  // 不会被这条改回十二项；非数组才用出厂。逐条清洗＝脏形状一律丢掉而不是拿空表冒充「查过了」
  if (!Array.isArray(raw.cardFit?.slots)) raw.cardFit = { slots: JSON.parse(JSON.stringify(def.cardFit.slots)) };
  else {
    const out = [], seenK = new Set();
    raw.cardFit.slots.forEach(sl => {
      if (!sl || typeof sl !== 'object' || typeof sl.k !== 'string' || !sl.k.trim() || seenK.has(sl.k)) return;
      const w = (Array.isArray(sl.w) ? sl.w : []).filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()).slice(0, 12);
      if (!w.length) return;
      seenK.add(sl.k);
      out.push({ k: sl.k.trim().slice(0, 12), w });
    });
    raw.cardFit.slots = out.slice(0, 40);
  }
  // 播放器（BUGS #284）：整格缺失才补出厂；各格的区间与默认全引 js/player.js 的 PL_PERMS（不在这里重抄一遍名单），
  // 数组类字段逐条剪掉脏形状；playerBy 只认「在册单聊 → 一个对象」，人没了那一本就一起走（同删联系人清印象簿那一族）
  if (!raw.player || typeof raw.player !== 'object' || Array.isArray(raw.player)) raw.player = JSON.parse(JSON.stringify(def.player));
  const _plr = raw.player;
  ['tracks', 'playlists', 'favs', 'queue', 'invites'].forEach(k => { if (!Array.isArray(_plr[k])) _plr[k] = []; });
  _plr.tracks = _plr.tracks.filter(t => t && typeof t === 'object' && typeof t.id === 'string' && t.id)
    .map(t => ({ id: t.id, name: typeof t.name === 'string' ? t.name : '未命名', artist: typeof t.artist === 'string' ? t.artist : '',
      src: typeof t.src === 'string' ? t.src : '', fid: typeof t.fid === 'string' ? t.fid : '', mid: typeof t.mid === 'string' ? t.mid : '',
      nid: typeof t.nid === 'string' ? t.nid : '',
      dur: Number.isFinite(Number(t.dur)) && Number(t.dur) > 0 ? Math.round(Number(t.dur)) : 0, added: Number(t.added) || 0 }));
  const _tk = new Set(_plr.tracks.map(t => t.id));
  _plr.favs = _plr.favs.filter(id => _tk.has(id));
  _plr.queue = _plr.queue.filter(id => _tk.has(id));
  _plr.playlists = _plr.playlists.filter(l => l && typeof l === 'object' && typeof l.id === 'string')
    .map(l => ({ id: l.id, name: typeof l.name === 'string' && l.name ? l.name : '未命名', trackIds: (Array.isArray(l.trackIds) ? l.trackIds : []).filter(id => _tk.has(id)), created: Number(l.created) || 0 }));
  if (!PL_PERMS || !PL_MODES.includes(_plr.mode)) _plr.mode = def.player.mode;
  // relay／ncmRelay 两格已随「中转」整条下线（2026-10-14）：不再补种，老档里残留的同名值留着不动也不读。
  if (typeof _plr.ncmCookie !== 'string') _plr.ncmCookie = '';   // 网易云登录＝MUSIC_U Cookie（2026-10-13，love-boat 同款做法）
  // 网易云接口地址（#422 二批：昵称∶日推∶我的歌单∶会员歌完整版都要一台答话的接口，这一格让用户填自己那台）
  if (typeof _plr.ncmApi !== 'string') _plr.ncmApi = '';
  if (!['string', 'number'].includes(typeof _plr.current) || !_tk.has(_plr.current)) _plr.current = '';
  if (_plr.withCid && !((raw.contacts || []).some(c => c && c.id === _plr.withCid && c.kind !== 'group'))) _plr.withCid = '';
  _plr.invites = _plr.invites.filter(v => v && typeof v.id === 'string' && typeof v.cid === 'string' && typeof v.trackId === 'string')
    .map(v => ({ id: v.id, cid: v.cid, trackId: v.trackId, at: Number(v.at) || 0, manual: !!v.manual,
      status: ['waiting', 'yes', 'switch', 'later'].includes(v.status) ? v.status : 'waiting' }))
    .filter((v, i, arr) => arr.findIndex(x => x.id === v.id) === i).slice(-60);
  // 全局那份与每一位自己那本都过同一把夹子（PL_PERMS 是名单唯一来源，新增一格自动跟，不在这里再列一遍）
  _plr.settings = _plClampPerms(Object.assign({}, def.player.settings, _plr.settings && typeof _plr.settings === 'object' && !Array.isArray(_plr.settings) ? _plr.settings : {}));
  if (!raw.playerBy || typeof raw.playerBy !== 'object' || Array.isArray(raw.playerBy)) raw.playerBy = {};
  const _pbIds = new Set((raw.contacts || []).filter(c => c && c.kind !== 'group').map(c => c.id));
  Object.keys(raw.playerBy).forEach(id => {
    const o = raw.playerBy[id];
    if (!_pbIds.has(id) || !o || typeof o !== 'object' || Array.isArray(o)) { delete raw.playerBy[id]; return; }
    if (Array.isArray(o.favs)) o.favs = o.favs.filter(x => _tk.has(x));
    else delete o.favs;
    const pick = {}; PL_PERMS.forEach(p => { if (o[p.k] !== undefined) pick[p.k] = o[p.k]; });
    if (!Object.keys(pick).length) { if (!o.favs || !o.favs.length) delete raw.playerBy[id]; return; }
    _plClampPerms(pick);
    PL_PERMS.forEach(p => { o[p.k] = pick[p.k]; });
  });
  if (!raw.mailbox) raw.mailbox = def.mailbox;
  else {
    const m = raw.mailbox, dm = def.mailbox;
    if (typeof m.minCardCount !== 'number') m.minCardCount = dm.minCardCount;
    if (typeof m.maxCardCount !== 'number') m.maxCardCount = dm.maxCardCount;
    if (typeof m.dailyMaxLetters !== 'number') m.dailyMaxLetters = dm.dailyMaxLetters;
    if (typeof m.writeProbability !== 'number') m.writeProbability = dm.writeProbability;
    if (typeof m.minWriteMinutes !== 'number') m.minWriteMinutes = dm.minWriteMinutes;
    if (typeof m.maxWriteMinutes !== 'number') m.maxWriteMinutes = dm.maxWriteMinutes;
    if (typeof m.replyProbability !== 'number') m.replyProbability = dm.replyProbability;
    if (typeof m.minReplyMinutes !== 'number') m.minReplyMinutes = dm.minReplyMinutes;
    if (typeof m.maxReplyMinutes !== 'number') m.maxReplyMinutes = dm.maxReplyMinutes;
    if (typeof m.useKaomoji !== 'boolean') m.useKaomoji = dm.useKaomoji;
    if (typeof m.useEmoji !== 'boolean') m.useEmoji = dm.useEmoji;
    if (typeof m.useSticker !== 'boolean') m.useSticker = dm.useSticker;
    if (typeof m.punctEnabled !== 'boolean') m.punctEnabled = dm.punctEnabled;
    if (typeof m.writeEnabled !== 'boolean') m.writeEnabled = dm.writeEnabled;
  }
  // 信箱设置按联系人各一份（与 chatSettings／印象簿 #074 同族）。这一本只存**被单独改过**的那位，
  // 没改过的不落键＝读侧回落到上面那份全局值，旧存档升级后行为一字不变。键表按 defaults.mailbox 的**值类型**现推，
  // 新增字段自动跟、不再抄一份清单；缺的那一格补当前那份全局值（不是 defaults 的出厂值——用户改过全局就得跟着）
  if (!raw.mailboxSettings || typeof raw.mailboxSettings !== 'object' || Array.isArray(raw.mailboxSettings)) raw.mailboxSettings = {};
  {
    // 群聊不写信（与 mailbox.js 的 _mbSingles 同口径），人不在册＝键留着也没人读：两种一律剪掉，不留一套死账
    // dm 必须在这里自己取：上面那份声明在 else 块的作用域里，跨块引用＝ReferenceError（内联脚本一处抛错截断其后全部模块）
    const dm = def.mailbox;
    const _mbIds = raw.contacts.filter(c => c.kind !== 'group').map(c => c.id);
    for (const cid of Object.keys(raw.mailboxSettings)) {
      const bm = raw.mailboxSettings[cid];
      if (!_mbIds.includes(cid) || !bm || typeof bm !== 'object' || Array.isArray(bm)) { delete raw.mailboxSettings[cid]; continue; }
      for (const k of Object.keys(dm)) if (typeof bm[k] !== typeof dm[k]) bm[k] = raw.mailbox[k];
    }
  }
  // 每日上限的出厂值由 3 封收成 1 封（用户定档「每个联系人默认每天只能主动给我写一封信」）。一次性把**还停在旧出厂值 3**
  // 的那一格改成 1：全局那份与每一位自己那本都算——3 这个数在旧档里只可能来自出厂（面板那格是从默认值整本拷来的）。
  // 如实的代价：当年真自己填过 3 的用户会被一并改成 1，信箱设置里改回去即可；填过 0／1／5 这些别的数的一格都不动。
  // 标记落库＝只跑一次，用户日后主动设 3 不会被悄悄改掉。
  if (!raw._mbDailyToOne) {
    const _mbOldDaily = v => (v === 3 ? 1 : v);
    if (raw.mailbox) raw.mailbox.dailyMaxLetters = _mbOldDaily(raw.mailbox.dailyMaxLetters);
    for (const cid of Object.keys(raw.mailboxSettings)) {
      const bm = raw.mailboxSettings[cid];
      if (bm) bm.dailyMaxLetters = _mbOldDaily(bm.dailyMaxLetters);
    }
    raw._mbDailyToOne = true;
  }
  // 邮戳前缀设置已删（全仓无消费方）：清掉旧档残留
  delete raw.postmarkPrefix;
  if (!['circle', 'rounded', 'square'].includes(raw.avatarShape)) raw.avatarShape = def.avatarShape;
  if (!raw.appearance) raw.appearance = def.appearance;
  else {
    const a = raw.appearance, da = def.appearance;
    if (!['round', 'square', 'sharp', 'tail'].includes(a.bubbleShape)) a.bubbleShape = da.bubbleShape;
    if (!['sakura', 'peach', 'ink', 'gray', 'wine', 'plum', 'forest', 'coffee', 'white'].includes(a.mineColor)) a.mineColor = da.mineColor;
    if (a.mineColor === 'sakura' || a.mineColor === 'peach') a.mineColor = 'ink';
    // 旧「毛玻璃顶栏默认开」那行一次性迁移（if (a.glass === false) a.glass = true）已摘：
    // 通透从 2026-10-06 起是**全局可关**字段，留着它用户永远关不掉（补齐由下面 typeof 那条负责）
    // 「透明与光影」三滑块已删（观感定稿在 theme.css 令牌里），旧档残留字段一并清掉
    delete a.glassBlur; delete a.glassAlpha; delete a.shadowK;
    // 底色只留「素雪」一档（值烧在 css/theme.css 基础令牌里）：两代档位开关（布尔 snow 与字符串 tier）均已撤除，
    // 旧档残留字段一并清掉，留着也不再有任何读取方（BUGS #036）
    delete a.snow; delete a.tier;
    if (!['auto', 'white', 'black', 'gold'].includes(a.mineText)) a.mineText = da.mineText;
    // 全站字号（设置-外观「字号」）：2026-10-15 由「标准/大」两档改成 80~140 的连续数字（放大百分比）。
    // 不进 chatAppearanceDefault，故不受按会话迁移的删除循环波及。旧档那两枚字符串先折成数字（large→112、
    // medium→100），再把剩下的脏值/越界一律夹回 80~140（回落默认 100）。
    if (a.uiFontScale === 'large') a.uiFontScale = 112;
    else if (a.uiFontScale === 'medium') a.uiFontScale = 100;
    if (!(typeof a.uiFontScale === 'number' && isFinite(a.uiFontScale))) a.uiFontScale = da.uiFontScale;
    a.uiFontScale = Math.min(140, Math.max(80, Math.round(a.uiFontScale)));
    // 卡片毛玻璃开关（appearance.frost）：布尔，脏值回落默认（四落点之②）
    if (typeof a.frost !== 'boolean') a.frost = da.frost;
    // 毛玻璃强度（frostBlur 0~24px）与「气泡也吃」（frostBubble）：与 frost 同族，脏值/越界夹回默认
    if (!(typeof a.frostBlur === 'number' && isFinite(a.frostBlur))) a.frostBlur = da.frostBlur;
    a.frostBlur = Math.min(24, Math.max(0, Math.round(a.frostBlur)));
    if (typeof a.frostBubble !== 'boolean') a.frostBubble = da.frostBubble;
    // 气泡磨砂强度（frostBubbleBlur 0~24px）：与 frostBubble 同族，脏值/越界夹回默认
    if (!(typeof a.frostBubbleBlur === 'number' && isFinite(a.frostBubbleBlur))) a.frostBubbleBlur = da.frostBubbleBlur;
    a.frostBubbleBlur = Math.min(24, Math.max(0, Math.round(a.frostBubbleBlur)));
    if (!['cozy', 'compact'].includes(a.density)) a.density = da.density;
    // 三组排版新档（2026-10-15）脏值回落：枚举与 utils defaults 对齐
    if (!['bottom', 'top'].includes(a.alignMode)) a.alignMode = da.alignMode;
    if (typeof a.avatarShow !== 'boolean') a.avatarShow = da.avatarShow;
    if (!['flow', 'head'].includes(a.dayPos)) a.dayPos = da.dayPos;
    if (typeof a.showTime !== 'boolean') a.showTime = da.showTime;
    if (typeof a.sendBtn !== 'boolean') a.sendBtn = da.sendBtn;
    if (typeof a.chatBg !== 'string') a.chatBg = da.chatBg;
    // 桌面美化台（设置-外观「桌面美化」）：壁纸 dataURL 与四根杆
    if (typeof a.deskBg !== 'string') a.deskBg = da.deskBg;
    // 桌面美化台三根杆：越界与脏值一律回落默认（面板侧 desk.js 同口径再夹一次）
    // 背景模糊（2026-10-15 重新启用：卡片毛玻璃给了它宿主）：越界与脏值夹回 0~40（默认 0）
    if (!(typeof a.deskBgBlur === 'number' && isFinite(a.deskBgBlur))) a.deskBgBlur = da.deskBgBlur;
    a.deskBgBlur = Math.min(40, Math.max(0, Math.round(a.deskBgBlur)));
    if (!(typeof a.deskBgVeil === 'number' && a.deskBgVeil >= 0 && a.deskBgVeil <= 90)) a.deskBgVeil = da.deskBgVeil;
    if (!(typeof a.deskBgZoom === 'number' && a.deskBgZoom >= 100 && a.deskBgZoom <= 200)) a.deskBgZoom = da.deskBgZoom;
    if (!(typeof a.deskTabVeil === 'number' && a.deskTabVeil >= 0 && a.deskTabVeil <= 100)) a.deskTabVeil = da.deskTabVeil;
    if (!['cover', 'contain'].includes(a.deskBgSize)) a.deskBgSize = da.deskBgSize;
    delete a.deskBgChat;   // 更早遗留的死字段（「聊天页跟随桌面背景」开关），不再有任何读取方
    if (typeof a.deskPopup !== 'boolean') a.deskPopup = da.deskPopup;
    if (a.deskPopRows !== 1 && a.deskPopRows !== 2) a.deskPopRows = da.deskPopRows;
    if (typeof a.deskPopCloseBtn !== 'boolean') a.deskPopCloseBtn = da.deskPopCloseBtn;   // 出厂关（补 false 不是补 true：老档缺键跟着用户定档走，不给全体老用户凭空长出一枚 ×）
    delete a.tileIcons;   // 「功能图标」自定义整族已删（首页磁贴墙没了＝13 枚图标无处可换），清掉旧档残留
    delete a.homePages;   // 「功能放第二页」整族 2026-10-09 删净（首页只有一屏纵向流＋底部导航常驻），旧档残留清掉＝不留没人读的键
    if (typeof a.deskBgAll !== 'boolean') a.deskBgAll = da.deskBgAll;   // 壁纸铺到全站那一枚开关（默认关＝行为与旧档一致）
    // 底色与层次档，脏值一律回落默认。四档：soft 暖光玻璃（默认）／frost 霜白／warm 暖米／flat 纯白（关玻璃的退路）。
    // ⚠ 加档必须四落点一起落：这里／utils defaults／settings 写 body[data-ap-depth]／view-settings.html 那行 chips。
    // 底色档只剩**一档**（2026-10-06 定档「我只要之前说的冷雾」；2026-10-08 抬彩度改名「雾蓝」）。
    // ⚠ 删档不等于删字段：depth 仍是全局可调的**外观字段**（旧档里存着 frost/warm/flat 的值），
    //   这里负责把那些脏值**回落到这一档**，而不是让它们留在界面上 —— 与 light 档那行同一个口径。
    //   若哪天要恢复多档，改这一行 + settings 的 AP_SETS/_apDepth + view-settings 那行 chips + theme.css 末尾的覆盖块，四处一起。
    if (a.depth !== 'soft') a.depth = da.depth;
    // 光影档三档（与 depth 正交）。⚠ 加档必须四落点一起落：这里／utils defaults／settings 写 body 属性／外观格 chips
    if (!['airy', 'balanced', 'deep'].includes(a.light)) a.light = da.light;
    // 卡片圆角档（三枚，与 light 正交）。⚠ 加档四处一起落：这里／utils defaults／settings 的 AP_SETS＋_apCorner／
    //   view-settings.html 那行 chips／theme.css 末尾的覆盖块。老档没这个键→落默认 medium（＝不写覆盖块）
    if (!['small', 'medium', 'large'].includes(a.corner)) a.corner = da.corner;
    // 主题色族与「跟着壁纸走」2026-10-10 整族下线（用户定档「只留雾蓝」：只剩一档时那排 chips 永远选中、
    //   点了直接早退＝BUGS #147 摘 depth chips 判过的同一族病）。两个键自此没有任何读方，
    //   旧档残留就地清掉、不留没人读的键（同 delete raw.ritual 那一族）。要恢复多族须连同入口与 CSS 覆盖一起落。
    delete a.tone; delete a.toneFollow;
    if (!['system', 'serif', 'round'].includes(a.fontFamily)) a.fontFamily = da.fontFamily;
    // 全站字体四格（2026-10-12 从按会话收成全局一份）：只认字符串，脏形状回落空串＝没设。
    // 不校验内容也不解析那条 @font-face∶读不出来的字体浏览器自己会退回下一档字族，屏上不会出现空白。
    if (typeof a.customFontName !== 'string') a.customFontName = da.customFontName;
    if (typeof a.customFontCss !== 'string') a.customFontCss = da.customFontCss;
    if (typeof a.customGlobalFontName !== 'string') a.customGlobalFontName = da.customGlobalFontName;
    if (typeof a.customGlobalFontCss !== 'string') a.customGlobalFontCss = da.customGlobalFontCss;
    if (typeof a.glass !== 'boolean') a.glass = da.glass;
    if (typeof a.glassLite !== 'boolean') a.glassLite = da.glassLite;   // 省电磨砂（缺字段按默认补＝关）
    if (!['auto', 'ink', 'gray', 'wine', 'plum', 'forest', 'coffee', 'white'].includes(a.partnerColor)) a.partnerColor = da.partnerColor;
    if (!['auto', 'white', 'black', 'gold'].includes(a.partnerText)) a.partnerText = da.partnerText;
    if (typeof a.bgKeepAlive !== 'boolean') a.bgKeepAlive = da.bgKeepAlive;
    if (typeof a.bgNotify !== 'boolean') a.bgNotify = da.bgNotify;
    if (typeof a.bgNotifyNoDedup !== 'boolean') a.bgNotifyNoDedup = da.bgNotifyNoDedup;
    if (typeof a.plNoDuck !== 'boolean') a.plNoDuck = da.plNoDuck;   // 2026-10-15 #457 播放器不抢声道开关（缺字段按默认补＝开）
    // 顶部栏入口显隐开关已删（首页入口固定显示）：清掉旧档残留字段
    delete a.topbar;
  }
  // 皮肤选择已删（固定奶油白）：主题一次性归 white
  raw.theme = 'white';
  // MiniMax「全局默认音色」一档已删（BUGS #070）：音色只认联系人自己的绑定，清掉旧档残留字段
  if (raw.minimax && typeof raw.minimax === 'object') delete raw.minimax.timbre;
  // 会话外观按联系人隔离：旧全局外观一次性播种到全部已有会话，之后 appearance 只存全局字段
  const cad = def.chatAppearanceDefault;
  if (!raw.chatAppearance || typeof raw.chatAppearance !== 'object') raw.chatAppearance = {};
  if (!raw._chatApMigrated) {
    const ga = raw.appearance || {};
    const seed = {};
    for (const k of Object.keys(cad)) if (ga[k] !== undefined) seed[k] = ga[k];
    const ids = new Set([raw.activeChat || '']);
    (raw.contacts || []).forEach(c => { if (c && c.id) ids.add(c.id); });
    ids.delete('');
    ids.forEach(id => { if (!raw.chatAppearance[id]) raw.chatAppearance[id] = Object.assign({}, cad, seed); });
    for (const k of Object.keys(cad)) delete ga[k];
    raw._chatApMigrated = true;
  }
  // 六项排版类外观（气泡形状/密度/显示时间/发送钮/字体族/通透）2026-10-06 由「按会话」提到「全局」。
  // 旧档里它们被 _chatApMigrated 那次播种进每一会话，留着就会永远压住新加的全局档（点了没反应）；
  // 而这一族上线以来**没有任何界面可改**＝那些值不可能是用户选的，整族删掉不丢任何人的自定义。
  if (!raw._chatApSixToGlobal) {
    const SIX = ['bubbleShape', 'density', 'showTime', 'sendBtn', 'fontFamily', 'glass'];
    for (const id of Object.keys(raw.chatAppearance || {})) {
      const o = raw.chatAppearance[id];
      if (o && typeof o === 'object') SIX.forEach(k => delete o[k]);
    }
    raw._chatApSixToGlobal = true;
  }
  // 字体两样（上传的字体文件 ∶ 手打的字体 CSS）2026-10-12 收成**全站一份**（用户定档「字体只留全局一份」，
  // 入口就此只在 设置 → 外观 →「全站字体」）。旧档里那一份按会话存着的值分两类处理，两类理由各一句：
  // ① customGlobalFontCss 是用户自己打进去的一段样式＝真内容 → 全局那份还空着时**整串搬上去**，不丢；
  //    全局已有值就不动（那是他在新位置填的，拿旧档里某一本去覆盖它＝改用户的有意选择）。多位各填过只搬第一条非空，
  //    其余就地删净——收成一份本来就是「只能留一条」，留哪条都得有依据，按会话键的在册顺序取第一条＝可复现。
  // ② customFontCss 里存的是「src 指向一∶blob 临时地址」那种 @font-face：blob 地址只在写下它的那一份文档里有效，
  //    重启后必取不到＝搬进全局只会做出一条永不生效的字体规则，因此**不搬、就地清**（写入侧这次一起换成字体本体
  //    的 dataURL，见 js/settings.js，所以以后落进来的值是真的能跨重启用的）。
  if (!raw._apFontToGlobal) {
    const ga = raw.appearance || (raw.appearance = {});
    const FOUR = ['customFontName', 'customFontCss', 'customGlobalFontName', 'customGlobalFontCss'];
    let hoistCss = '', hoistName = '';
    for (const id of Object.keys(raw.chatAppearance || {})) {
      const o = raw.chatAppearance[id];
      if (!o || typeof o !== 'object') continue;
      if (!hoistCss && typeof o.customGlobalFontCss === 'string' && o.customGlobalFontCss) {
        hoistCss = o.customGlobalFontCss;
        hoistName = typeof o.customGlobalFontName === 'string' ? o.customGlobalFontName : '';
      }
      FOUR.forEach(k => delete o[k]);
    }
    // 「全局那份还空着」问的是**值空不空**，不是键在不在：上面那段校验已经把缺字段补成空串了，
    // 拿 typeof 判＝永远判成「已有值」＝这条搬运动作根本不跑（本仓记过的「typeof 放得过空值」同一族）
    if (hoistCss && !ga.customGlobalFontCss) {
      ga.customGlobalFontCss = hoistCss; ga.customGlobalFontName = hoistName;
    }
    raw._apFontToGlobal = true;
  }
  // 辅助文字三项（时间轴 dayStyle／消息时间 metaColor／系统消息 sysStyle）枚举校验：
  // _caFill 只按 typeof 补类型，认不出「同类型脏值」，这里逐会话把非法档位拉回出厂值（BUGS #196）
  // 聊天气泡字体/字号（2026-10-15）也在这里夹：_caFill 只按 typeof 补类型，认不出同类型脏值
  const _caEnums = { dayStyle: ['auto', 'white', 'ink', 'none'], metaColor: ['auto', 'black', 'white', 'gold'], sysStyle: ['auto', 'white', 'ink', 'none'], chatFont: ['inherit', 'system', 'serif', 'round'], chatFontSize: ['small', 'medium', 'large'] };
  // 两栏透明度（headVeil／compVeil）自此是 0~100 的数字，不再是三档（BUGS #314 二批）。旧档那三个字符串
  // 按各档**当时的实际 alpha** 折成数字（实＝纱 .94→0∶柔＝.8376→16∶透＝.7247→28，见 css/chat.css 那段注释）
  // ——改的是字段类型，旧值不搬家＝用户选过的档被这圈 typeof 直接顶成 0（本仓「填 0 真落 0」那一族的反面）。
  // ⚠ 这一句必须排在下面那圈 typeof **之前**：fill 只认类型，先跑就把 'soft' 当类型不符清成 0，映射根本轮不到。
  const _caVeil = v => {
    if (typeof v === 'string') return v === 'soft' ? 16 : v === 'clear' ? 28 : 0;
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
  };
  const _caFill = id => {
    if (!id) return;
    if (!raw.chatAppearance[id] || typeof raw.chatAppearance[id] !== 'object') raw.chatAppearance[id] = {};
    const o = raw.chatAppearance[id];
    o.headVeil = _caVeil(o.headVeil); o.compVeil = _caVeil(o.compVeil); o.bgVeil = _caVeil(o.bgVeil);
    for (const k of Object.keys(cad)) if (typeof o[k] !== typeof cad[k]) o[k] = cad[k];
    for (const k of Object.keys(_caEnums)) if (_caEnums[k].indexOf(o[k]) < 0) o[k] = cad[k];
  };
  // 通透白岛改版一次性迁移：旧默认墨黑气泡→白色浮岛（外观弹层仍可选墨黑，之后不再动）
  if (!raw._islandMigrated) {
    if (raw.appearance && raw.appearance.mineColor === 'ink') raw.appearance.mineColor = 'blue';
    for (const id of Object.keys(raw.chatAppearance || {})) {
      const o = raw.chatAppearance[id];
      if (o && typeof o === 'object' && o.mineColor === 'ink') o.mineColor = 'blue';
    }
    raw._islandMigrated = true;
  }
  _caFill(raw.activeChat);
  (raw.contacts || []).forEach(c => { if (c && c.id) _caFill(c.id); });
  if (!raw.stickers) raw.stickers = def.stickers;
  // 朋友圈（2026-10-12 按用户要求重做回来，ins 风单列流）：动态与提醒都是用户看过的内容，
  // 逐条按**固定字段清单重建**——新字段不在这里登记一次＝当场存得住、下次打开被剪干净（#263 那条承重墙）。
  // 旧形状那三格各有归宿：image/sticker 合成 imgs[]（屏上不再画第二种「图」的容器），
  // author:'partner' 归到主会话那一位（#156 那一族：读此刻的东西落档前要先把人认全）。
  if (!Array.isArray(raw.moments)) raw.moments = [];
  const _mmMain = (typeof raw.activeChat === 'string' && raw.activeChat)
    || ((raw.contacts || [])[0] && (raw.contacts || [])[0].id) || 'c0';
  raw.moments = raw.moments.filter(m => m && typeof m === 'object').map(m => {
    const imgs = Array.isArray(m.imgs) ? m.imgs.filter(v => typeof v === 'string' && v).slice(0, 9) : [];
    if (typeof m.image === 'string' && m.image && imgs.indexOf(m.image) < 0) imgs.push(m.image);
    if (typeof m.sticker === 'string' && m.sticker && imgs.indexOf(m.sticker) < 0) imgs.push(m.sticker);
    // 配图上贴的贴纸（mochi 朋友圈那一族，2026-10-13 按用户要求接进来）：一格一张贴纸，
    // 位置是**配图区自己的百分比**（不是像素）＝卡片宽度随屏变，像素坐标换屏必错位。
    // src 与 emoji 两态各表一种贴纸（图／字），两样都没有的那张画不出来＝丢进黑洞，整条丢。
    const stickers = [];
    (Array.isArray(m.stickers) ? m.stickers : []).forEach(s => {
      if (!s || typeof s !== 'object') return;
      const src = typeof s.src === 'string' ? s.src : '';
      const emoji = typeof s.emoji === 'string' ? s.emoji : '';
      if (!src && !emoji) return;
      // 只有「真是一个有限数」才算有坐标：Number(null) === 0 会让一格缺位的贴纸被贴到最上沿（夹回 6），
      // 那不是回落、是替它猜了一个位置——缺给就不看它写没写，一律给中点
      const x = typeof s.x === 'number' && isFinite(s.x) ? Math.min(96, Math.max(4, s.x)) : 50;
      const y = typeof s.y === 'number' && isFinite(s.y) ? Math.min(94, Math.max(6, s.y)) : 50;
      stickers.push({
        src, emoji,
        x, y,
        by: s.by === 'me' || (raw.contacts || []).some(c => c && c.id === s.by) ? s.by : 'me'
      });
    });
    const out = {
      id: m.id,
      author: m.author === 'partner' || typeof m.author !== 'string' ? _mmMain : m.author,
      text: typeof m.text === 'string' ? m.text : '',
      imgs,
      stickers,
      time: typeof m.time === 'string' ? m.time : '',
      date: typeof m.date === 'string' ? m.date : '',
      likes: Array.isArray(m.likes) ? m.likes.filter(a => a === 'me' || a === _mmMain || (raw.contacts || []).some(c => c && c.id === a)) : [],
      comments: []
    };
    if (typeof m.ts === 'number' && isFinite(m.ts)) out.ts = m.ts;
    // 旧记录没有 ts：time() 会回 '2026/10/5 9:12' 这种个位小时，字符串比大小给出的是另一个答案（#244 那一课），
    // 所以按解析出的时刻折算成数存下来；解析不出就不写这格，读侧回落到日期串。
    if (out.ts === undefined && out.date) {
      const t = new Date(out.date + ' ' + (out.time || '12:00')).getTime();
      if (isFinite(t)) out.ts = t;
    }
    (Array.isArray(m.comments) ? m.comments : []).forEach(c => {
      if (!c || typeof c !== 'object') return;
      const cc = {
        id: c.id,
        author: c.author === 'partner' || typeof c.author !== 'string' ? _mmMain : c.author,
        text: typeof c.text === 'string' ? c.text : '',
        sticker: typeof c.sticker === 'string' ? c.sticker : '',
        time: typeof c.time === 'string' ? c.time : '',
        replyTo: c.replyTo === undefined ? null : c.replyTo
      };
      if (typeof c.ts === 'number' && isFinite(c.ts)) cc.ts = c.ts;
      if (cc.id === undefined || cc.id === null) cc.id = 'c' + String(out.id) + '_' + out.comments.length;
      out.comments.push(cc);
    });
    return out;
  }).filter(m => m.id !== undefined && m.id !== null && (m.text || m.imgs.length || m.comments.length || m.stickers.length));
  if (typeof raw.momentsCover !== 'string') raw.momentsCover = '';
  if (typeof raw.momentsAvatar !== 'string') raw.momentsAvatar = '';
  if (!raw.momentsSettings || typeof raw.momentsSettings !== 'object') raw.momentsSettings = JSON.parse(JSON.stringify(def.momentsSettings));
  else {
    const ms = raw.momentsSettings, dm = def.momentsSettings;
    // 布尔与数字分开问（#022 那一课：typeof boolean 混进数字循环会把「关」顶回「开」；
    // 而 0 是合法档位——dailyMaxMoments:0＝不再自己发，Number(x)||默认 会把 0 偷偷写回出厂值）
    for (const k of Object.keys(dm)) {
      if (typeof dm[k] === 'boolean') { if (typeof ms[k] !== 'boolean') ms[k] = dm[k]; continue; }
      const v = Number(ms[k]);
      ms[k] = (typeof ms[k] === 'number' && isFinite(v)) ? v : dm[k];
    }
  }
  // 按人那一份只存被改过的格：出厂表里没有的键＝没人读的死键，空壳整本删掉（不留「存过但全空」）
  if (!raw.momentsBy || typeof raw.momentsBy !== 'object') raw.momentsBy = {};
  const _mmPeopleIds = {};
  (raw.contacts || []).forEach(c => { if (c && c.id && c.kind !== 'group') _mmPeopleIds[c.id] = 1; });
  for (const cid of Object.keys(raw.momentsBy)) {
    const one = raw.momentsBy[cid];
    if (!one || typeof one !== 'object' || !_mmPeopleIds[cid]) { delete raw.momentsBy[cid]; continue; }
    for (const k of Object.keys(one)) {
      const dv = def.momentsSettings[k];
      if (dv === undefined) { delete one[k]; continue; }
      if (typeof dv === 'boolean') { if (typeof one[k] !== 'boolean') delete one[k]; }
      else if (typeof one[k] !== 'number' || !isFinite(one[k])) delete one[k];
    }
    if (!Object.keys(one).length) delete raw.momentsBy[cid];
  }
  if (!Array.isArray(raw.momentNotices)) raw.momentNotices = [];
  raw.momentNotices = raw.momentNotices.filter(n => n && typeof n === 'object' && typeof n.at === 'number' && isFinite(n.at))
    .slice(-100).map(n => ({
      id: n.id, kind: typeof n.kind === 'string' ? n.kind : 'post',
      by: n.by === 'partner' || typeof n.by !== 'string' ? _mmMain : n.by,
      at: n.at, momentId: n.momentId === undefined ? null : n.momentId, seen: !!n.seen
    }));
  // 旧版那枚「未读条数」计数器下线（未读自 2026-10-12 起只有一个来源＝提醒簿里 seen 为假的那几条，
  // 两处各记一本必有一个是旧的），留着就是键没人读、存储页那一列却多一行
  try { localStorage.removeItem('ordinal-moments-unread'); } catch (e) {}
  if (!raw.collectSettings || typeof raw.collectSettings !== 'object') raw.collectSettings = JSON.parse(JSON.stringify(def.collectSettings));
  else for (const k of Object.keys(def.collectSettings)) { const dv = def.collectSettings[k]; if (typeof raw.collectSettings[k] !== 'number' || !isFinite(raw.collectSettings[k])) raw.collectSettings[k] = dv; }
  delete raw.collectSettings.taFeedProb;   // 「TA 自动收藏朋友圈动态」那一档随宿主一起走，不留没人读的键
  if (!raw.callSettings) raw.callSettings = def.callSettings;
  else {
    const cs = raw.callSettings, dc = def.callSettings;
    // FIX 2026-09-03 #022 布尔字段混进数字校验循环被强制重置：incomingEnable=false 每次加载被改回 true（主动来电关不掉），先跳过布尔键
    for (const k of Object.keys(dc)) {
      if (typeof dc[k] === 'boolean') { if (typeof cs[k] !== 'boolean') cs[k] = dc[k]; }
      else if (typeof cs[k] !== 'number' || !isFinite(cs[k])) cs[k] = dc[k];
    }
  }
  // 头像和昵称互动（avatarlib.js）：TA/我的 头像池+昵称池的结构校验；
  // 头像只留 data:image 字符串，昵称剥不可见字符+去重，调度时间戳必须为有限数
  if (!raw.avlib || typeof raw.avlib !== 'object') raw.avlib = JSON.parse(JSON.stringify(def.avlib));
  else {
    // 2026-10-08 起节奏改成事件驱动（BUGS #179）：旧的 avNext/nickNext「下一次随机等待几小时」整套作废，
    // 换成 avRate/nickRate（1 很少 / 2 偶尔 / 3 常换）+ avHeat/nickHeat（事件攒的热度）+ 当日次数。
    // 旧档的 avNext/nickNext 直接删：留着不删的话，第一次 tick 读到它仍会按老口径判一次到点。
    const _avPool = () => ({ av: [], nicks: [], avEn: true, nickEn: true, avRate: 2, nickRate: 2, avHeat: 0, nickHeat: 0, avWhy: '', nickWhy: '', avWhyAt: 0, nickWhyAt: 0, avDay: '', avDayN: 0, nickDay: '', nickDayN: 0, avLast: 0, nickLast: 0, avLastWho: '', nickLastWho: '', avLastWhy: '', nickLastWhy: '', meAvEn: true, meNickEn: true, meAvHeat: 0, meNickHeat: 0, meAvWhy: '', meNickWhy: '', meAvWhyAt: 0, meNickWhyAt: 0, meAvDay: '', meNickDay: '', meAvDayN: 0, meNickDayN: 0, meAvLastWhy: '', meNickLastWhy: '' });
    const _avClean = (s) => String(s == null ? '' : s).replace(/[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u206A-\u206F\uFEFF\u180E]/g, '').trim().slice(0, 30);
    const _avNum = (v, min) => (typeof v === 'number' && isFinite(v) && v >= (min == null ? 0 : min)) ? v : 0;
    const _avFix = (p) => {
      if (!p || typeof p !== 'object') p = _avPool();
      p.av = Array.isArray(p.av) ? p.av.filter(x => typeof x === 'string' && x.indexOf('data:image') === 0).slice(0, 100) : [];
      p.nicks = Array.isArray(p.nicks) ? [...new Set(p.nicks.map(_avClean).filter(Boolean))].slice(0, 100) : [];
      for (const k of ['avEn', 'nickEn']) if (typeof p[k] !== 'boolean') p[k] = true;
      for (const k of ['avRate', 'nickRate']) { if (p[k] !== 1 && p[k] !== 2 && p[k] !== 3) p[k] = 2; }
      for (const k of ['avHeat', 'nickHeat', 'meAvHeat', 'meNickHeat']) p[k] = Math.min(999, _avNum(p[k], 0));
      for (const k of ['avDayN', 'nickDayN', 'meAvDayN', 'meNickDayN']) p[k] = Math.min(99, _avNum(p[k], 0));
      // Why/LastWhy 是「因为什么换的」那句话短语。老条目没有这一格 → 补空串（屏上不印那一行，
      // 不能给旧档编一个来由）；值不是字符串或太长的一律剪成空串，别让脏值直接印到屏上。
      for (const k of ['avDay', 'nickDay', 'meAvDay', 'meNickDay', 'avLastWho', 'nickLastWho']) if (typeof p[k] !== 'string') p[k] = '';
      for (const k of ['avWhy', 'nickWhy', 'avLastWhy', 'nickLastWhy', 'meAvWhy', 'meNickWhy', 'meAvLastWhy', 'meNickLastWhy']) {
        p[k] = (typeof p[k] === 'string' && p[k].length <= 40) ? p[k] : '';
      }
      // *WhyAt＝那句来由是哪一刻攒下的（2026-10-12，读侧 avatarlib.js 的 _avWhyFresh 靠它判跨天）。
      // 与 avLast/nickLast 同一把尺；脏值归 0＝不知道事发生在哪天，那句就当过期不印（宁可少说一句，不说一句没根据的话）。
      for (const k of ['avWhyAt', 'nickWhyAt', 'meAvWhyAt', 'meNickWhyAt']) p[k] = _avNum(p[k], 0);
      for (const k of ['avLast', 'nickLast']) p[k] = _avNum(p[k], 0);
      // 「TA 主动给我换」那一侧的按人状态（me 那一格；总闸默认跟随 TA 侧那一格）
      for (const k of ['meAvEn', 'meNickEn']) if (typeof p[k] !== 'boolean') p[k] = (k === 'meAvEn') ? p.avEn : p.nickEn;
      delete p.avNext; delete p.nickNext;   // 旧的随机等待时钟，整体退役
      return p;
    };
    raw.avlib.me = _avFix(raw.avlib.me);
    if (!raw.avlib.by || typeof raw.avlib.by !== 'object') raw.avlib.by = {};
    for (const k of Object.keys(raw.avlib.by)) raw.avlib.by[k] = _avFix(raw.avlib.by[k]);
    // 池子只在两件事下清掉：人已删、或**它是群**。群聊整族退出本功能（BUGS #179），
    // 留着群那份＝屏上一堆点不动的死数据（群头像的渲染口径只读 c.avatar，从不读 chatAvatar）。
    for (const k of Object.keys(raw.avlib.by)) {
      const c = raw.contacts.find(x => x.id === k);
      if (!c || c.kind === 'group') delete raw.avlib.by[k];
    }
    // 「我的」专属池（BUGS #407）：meBy[cid]＝只给那一位看的候选本，结构与上面同一把 _avFix 尺；
    // 人已删／是群照 by 那两条一并清——留给不在册的人一本池＝屏上永远点不到的死数据
    if (!raw.avlib.meBy || typeof raw.avlib.meBy !== 'object') raw.avlib.meBy = {};
    for (const k of Object.keys(raw.avlib.meBy)) {
      raw.avlib.meBy[k] = _avFix(raw.avlib.meBy[k]);
      const c = raw.contacts.find(x => x.id === k);
      if (!c || c.kind === 'group') delete raw.avlib.meBy[k];
    }
    // 印象簿（TA心里话-印象）：{ [会话id]: { [key]: [{t,ts}] } }＝每人一本，每键至多 20 条
    // 旧档（2026-10-05 之前）是 { [key]: [{t,ts}] }、没有会话id＝分不清哪位 TA 记的，整本迁进保留键 '*'（avatarlib.js 里单列一节标「那时还没记下是谁」）
    if (!raw.avlib.impr || typeof raw.avlib.impr !== 'object') raw.avlib.impr = {};
    {
      const root = raw.avlib.impr, bare = {};
      for (const k of Object.keys(root)) if (Array.isArray(root[k])) { bare[k] = root[k]; delete root[k]; }
      if (Object.keys(bare).length) {
        if (!root['*'] || typeof root['*'] !== 'object') root['*'] = {};
        for (const k of Object.keys(bare)) root['*'][k] = (Array.isArray(root['*'][k]) ? root['*'][k].concat(bare[k]) : bare[k]);
      }
    }
    // w＝这一条是「换上它那一刻因为什么」记下来的（事件驱动，BUGS #179）。老条目没有这一格 → 补空串，
    // 屏上就不印那一行（不给旧档编来由）；非字符串或超长的当脏值剪成空串，别直接印到屏上。
    const _imprList = (l) => Array.isArray(l)
      ? l.filter(e => e && typeof e.t === 'string' && e.t.trim() && typeof e.ts === 'number' && isFinite(e.ts))
        .sort((a, b) => a.ts - b.ts).slice(-20)
        .map(e => { if (typeof e.w !== 'string' || e.w.length > 40) e.w = ''; return e; })
      : [];
    for (const cid of Object.keys(raw.avlib.impr)) {
      const book = raw.avlib.impr[cid];
      if (!book || typeof book !== 'object') { delete raw.avlib.impr[cid]; continue; }
      for (const k of Object.keys(book)) { const l = _imprList(book[k]); if (l.length) book[k] = l; else delete book[k]; }
      // 簿子空了不留；人已不在、或它是群（群整族退出，BUGS #179）一并清；保留键 '*' 不属于任何联系人，不能被这条剪掉
      const c = cid === '*' ? null : raw.contacts.find(x => x.id === cid);
      if (!Object.keys(book).length || (cid !== '*' && (!c || c.kind === 'group'))) delete raw.avlib.impr[cid];
    }
  }
  // 发圈调度＝每位一条钟（同「主动写信」_nextWriteAtBy 那一族）：没有谁替别人攒账，也没有一条全局钟
  // 只会让第一位发声。只认「在册单聊 → 未来时刻」，过去的时刻剪掉交给 30s 轮询重排
  // ＝导入旧档那一下不补发旧账（与 #026·#041 同口径）。
  if (!raw._nextMomentAtBy || typeof raw._nextMomentAtBy !== 'object') raw._nextMomentAtBy = {};
  const _mmOnBook = {};
  (raw.contacts || []).forEach(c => { if (c && c.id && c.kind !== 'group') _mmOnBook[c.id] = 1; });
  for (const cid of Object.keys(raw._nextMomentAtBy)) {
    const v = raw._nextMomentAtBy[cid];
    if (!_mmOnBook[cid] || typeof v !== 'number' || !isFinite(v) || v <= Date.now()) delete raw._nextMomentAtBy[cid];
  }
  if (raw._nextMomentAt !== undefined) delete raw._nextMomentAt;   // 旧那枚全局钟随「按人一条」换向清掉
  if (!Array.isArray(raw._momentReactions)) raw._momentReactions = [];
  raw._momentReactions = raw._momentReactions.filter(x => x && typeof x.at === 'number' && isFinite(x.at)).slice(-50);
  // FIX 2026-09-03 #026 调度时间戳清洗：导入旧备份/恢复数据时，过期的排期（回信/来电/写信）会在加载后第一次 tick 立即触发
  //（导入后刷新，宽限期守卫算的是「错过后补发」，而导入场景本来就是过去时刻）→ 一律作废，由各调度器自行重排
  const _nowMs = Date.now();
  for (const k of ['_scheduledReplyAt', '_nextIncomingCallAt', '_nextWriteAt']) {
    if (typeof raw[k] === 'number' && raw[k] > 0 && raw[k] <= _nowMs) raw[k] = 0;
  }
  if (!raw.sentLetters) raw.sentLetters = def.sentLetters;
  if (!raw.receivedLetters) raw.receivedLetters = def.receivedLetters;
  // 信箱按联系人分册（2026-10-06 段一）：每封信落一个 cid，读侧按册筛选。
  // 旧档没有归属，一律归到主会话那一位（在册的第一位联系人），不猜、不留第三态。
  // 「在路上」那一族字段（delivered/arriveAt/dest/seed/stampIn/slowHours）2026-10-12 起整族退役，
  // 由下面每次加载的清洗统一 delete——这里不再给旧信补 delivered，补了也没读方。
  if (!raw._mbBooksMigrated) {
    const _mbHome = ((raw.contacts || []).filter(c => c && typeof c.id === 'string')[0] || {}).id || 'c0';
    for (const k of ['receivedLetters', 'sentLetters']) {
      (Array.isArray(raw[k]) ? raw[k] : []).forEach(m => {
        if (!m || typeof m !== 'object') return;
        if (typeof m.cid !== 'string') m.cid = _mbHome;
      });
    }
    // 草稿由全局一份改按册：旧那一份归到主会话名下（写一半的信不该串到别人那本）。
    // 只在「确实还是旧形状（有 text 这一档）」时搬一次，且那一本已有草稿就不覆盖——
    // 无条件重建 drafts 会把已经是按册形态的存档（比如合并导入的另一台机器）整本抹掉。
    // 搬完留下的 text/stamp 两个键不是联系人 id，由下面的按册清洗自动删掉。
    const _oldDraft = raw.drafts && typeof raw.drafts === 'object' && !Array.isArray(raw.drafts) && typeof raw.drafts.text === 'string' && raw.drafts.text ? raw.drafts : null;
    if (_oldDraft && !raw.drafts[_mbHome]) raw.drafts[_mbHome] = { text: _oldDraft.text, stamp: typeof _oldDraft.stamp === 'string' ? _oldDraft.stamp : '' };
    if (!raw.drafts || typeof raw.drafts !== 'object' || Array.isArray(raw.drafts)) raw.drafts = {};
    raw._mbBooksMigrated = true;
  }
  // 一趟多久（slowDays/slowHours）与走过哪一站（dest/seed/stampIn）这一族 2026-10-12 随「在路上」一起退役：
  // 旧的一次性迁移 _mbTripHoursMigrated 与它算出来的那些值都由下面每次加载的清洗 delete 掉，标记键本身也清（不留没人读的键）。
  delete raw._mbTripHoursMigrated;
  // 每次加载的兜底清洗：草稿只认「在册联系人」的那本（人已删＝这封再没有回去的入口，随之剪掉），
  // 信件脏值归位；已删联系人的 cid **不重分配**——那等于把甲的信挂到乙名下（#074 同一族假话），
  // 孤儿册交给读侧标「已不在通讯录」
  const _mbCids = new Set((raw.contacts || []).filter(c => c && typeof c.id === 'string').map(c => c.id));
  if (!raw.drafts || typeof raw.drafts !== 'object' || Array.isArray(raw.drafts)) raw.drafts = {};
  else Object.keys(raw.drafts).forEach(k => {
    const d = raw.drafts[k];
    if (!_mbCids.has(k) || !d || typeof d !== 'object' || typeof d.text !== 'string') delete raw.drafts[k];
    else if (typeof d.stamp !== 'string') d.stamp = '';
  });
  for (const k of ['receivedLetters', 'sentLetters']) {
    (Array.isArray(raw[k]) ? raw[k] : []).forEach(m => {
      if (!m || typeof m !== 'object') return;
      if (typeof m.cid !== 'string') m.cid = '';
      // 运送那一族的字段全部退役（用户 2026-10-12 定档「一并清掉」）：delivered/arriveAt/dest/seed/stampIn
      // 与两代档位天数 slowHours/slowDays，还有比 arriveAt 更早的那代 deliverAt/slowDone。
      // 那一族当年留下的那枚 stamp 也不再留着——见下面那行（2026-10-13 邮戳册整族下线）。
      delete m.delivered; delete m.arriveAt; delete m.deliverAt; delete m.slowDone;
      delete m.dest; delete m.seed; delete m.stampIn; delete m.slowHours; delete m.slowDays;
      // 信上的邮戳整族 2026-10-13 随册子一起下线（用户定档「全清，含旧信上的戳」）：stamp 不是这封信的
      // 记号而是那本册子的进度，册子没了它就是「按人记账、无人来读」。草稿那一格的 stamp 是**日期串**，
      // 不住在信件对象上，由上面的按册清洗管，与这一行无关。
      delete m.stamp;
      // 来信补唯一 id（聊天里那一行指针按它定位）；已有的一字不动，缺才补＝幂等，也不会让旧行的指向漂移
      if (k === 'receivedLetters' && typeof m.lid !== 'string') m.lid = mbLetterId();
    });
  }
  // 主动写信的排期按册各一条时钟（2026-10-06 段二）：只认「在册联系人 → 未来时刻」，脏值与孤儿一并剪
  if (!raw._nextWriteAtBy || typeof raw._nextWriteAtBy !== 'object' || Array.isArray(raw._nextWriteAtBy)) raw._nextWriteAtBy = {};
  else Object.keys(raw._nextWriteAtBy).forEach(k => {
    const t = raw._nextWriteAtBy[k];
    if (!_mbCids.has(k) || typeof t !== 'number' || !isFinite(t)) delete raw._nextWriteAtBy[k];
  });
  // 主动发送的钟按【人】各一格（2026-10-09 BUGS #216 换向，前一版 #135 是「每个会话各一格」）：
  // 只认「在册的【单聊】联系人 → 未来的时刻」。群聊占的那几格就此被剪掉——它们不是脏数据而是【换族】：
  // 一位联系人不再因为你在群里而多出一份钟，群里那句话由他自己那条钟落到群（js/chat.js 的 _asTargetOf）。
  // 过去的那一格同样一律剪掉、由 js/chat.js 的 tick 当场按那位自己的档重排——导入旧备份/收到别人的存档时
  // 屏上不该凭空涌出一串「TA 主动找你说话」（与 #026 #041 那一族同口径）。
  // 本次页面内离开再回来那一路不经这里（走 resumeActiveSend，表里的时刻原样躺着），过期即补掷＝#061 定的行为。
  if (!raw._nextActiveAtBy || typeof raw._nextActiveAtBy !== 'object' || Array.isArray(raw._nextActiveAtBy)) raw._nextActiveAtBy = {};
  else {
    const _asCids = new Set((raw.contacts || []).filter(c => c && c.kind !== 'group').map(c => c.id));
    Object.keys(raw._nextActiveAtBy).forEach(k => {
      const t = raw._nextActiveAtBy[k];
      if (!_asCids.has(k) || typeof t !== 'number' || !isFinite(t) || t <= _nowMs) delete raw._nextActiveAtBy[k];
    });
  }
  // TA 自己想起日子那条钟（2026-10-11 BUGS #271）：同样只认「在册联系人 → 未来时刻」。
  // 缺格＝js/anniversary.js 的 annSelfTick 当场只摊起点、不掷，所以导入别人的旧档那一下不会凭空冒出一条新纪念日。
  if (!raw._nextAnnSelfAtBy || typeof raw._nextAnnSelfAtBy !== 'object' || Array.isArray(raw._nextAnnSelfAtBy)) raw._nextAnnSelfAtBy = {};
  else {
    const _selfCids = new Set((raw.contacts || []).map(c => c.id));   // 上面那族的 _asCids 关在 else 块里，跨不过作用域
    Object.keys(raw._nextAnnSelfAtBy).forEach(k => {
      const t = raw._nextAnnSelfAtBy[k];
      if (!_selfCids.has(k) || typeof t !== 'number' || !isFinite(t) || t <= _nowMs) delete raw._nextAnnSelfAtBy[k];
    });
  }
  if (!raw.messages) raw.messages = def.messages;
  if (!Array.isArray(raw.calls)) raw.calls = [];
  if (!raw._callsMigrated) { raw._callsMigrated = true; migrateCallsFromMessages(raw); }
  // 第二轮折算（BUGS #156）：扫所有会话的流并给每条记 cid；函数自身按 srcMsgId／同日同时同结果
  // 一对一认账，重跑不重复计，也不会把已经归位的那条改回空串。
  if (!raw._callsCidMigrated) { raw._callsCidMigrated = true; migrateCallsFromMessages(raw); }
  // 每条记录必须有 cid 这个键：空串＝「那时还没记下是谁」，统计只在「全部」那一档计入，不冒充任何人名下
  for (const c of raw.calls) if (c && typeof c === 'object' && typeof c.cid !== 'string') c.cid = '';
  // 纪念日：多条 + 归属联系人（contactId ''=通用；main 为该归属的主纪念日，每归属至多一条）。
  // yearly=true 每年重复型（生日等）：date 存 'MM-DD'（容忍 M-D，归一化补零）；普通型 date 存 'YYYY-MM-DD'。
  // wish/wishProb=TA 会不会主动提起这条（旧档补 wish:true/wishProb:100，行为不变）；lastMention=每天至多提起一次。
  // 旧版单主纪念日(anniversary/anniversaryName)一次性迁为通用主纪念日，旧字段清空防复活
  if (!Array.isArray(raw.anniversaries)) raw.anniversaries = [];
  const _annCids = new Set((raw.contacts || []).map(c => c.id));
  const _annDateOk = x => {
    if (x.yearly) {
      const q = x.date.split('-');
      if (q.length !== 2) return false;
      const dt = new Date(2024, +q[0] - 1, +q[1]);   // 闰年样本，2/29 合法
      return +q[0] >= 1 && +q[0] <= 12 && dt.getMonth() === +q[0] - 1 && dt.getDate() === +q[1];
    }
    const p = x.date.split('-');
    if (p.length !== 3) return false;
    const dt = new Date(+p[0], +p[1] - 1, +p[2]);
    return +p[1] >= 1 && +p[1] <= 12 && dt.getFullYear() === +p[0] && dt.getDate() === +p[2];
  };
  raw.anniversaries = raw.anniversaries.filter(x => {
    if (!x || typeof x.name !== 'string' || !x.name.trim() || typeof x.date !== 'string') return false;
    return _annDateOk(x);
  }).map(x => ({
    id: (typeof x.id === 'string' && x.id) ? x.id : 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: x.name.trim(),
    date: x.yearly ? x.date.split('-').map(n => n.length < 2 ? '0' + n : n).join('-') : x.date,
    yearly: !!x.yearly,
    contactId: (typeof x.contactId === 'string' && _annCids.has(x.contactId)) ? x.contactId : '',
    main: !!x.main,
    wish: x.wish !== false,   // 让 TA 主动提起（预告/当天祝福/里程碑前夜），旧档默认开
    wishProb: (typeof x.wishProb === 'number' && x.wishProb >= 0 && x.wishProb <= 100) ? Math.round(x.wishProb) : 100,
    // by:'ta'＝这条是 TA 自己建出来的（2026-10-11 BUGS #271）。这张清单每次加载按固定字段【重建】每条纪念日，
    // 新字段不在这里登记＝当场存得住、下次打开被剪干净（#263 那条承重墙说的就是这一处），别当冗余删掉。
    by: x.by === 'ta' ? 'ta' : '',
    lastWish: (typeof x.lastWish === 'string') ? x.lastWish : '',     // TA 纪念日祝福去重：最近一次祝福的 YYYY-MM-DD
    lastMention: (typeof x.lastMention === 'string') ? x.lastMention : ''   // 每条每天至多提起一次（含掷概率未中的日子）
  }));
  if (raw.anniversary) {
    const _ads = String(raw.anniversary).split('T')[0];
    const _ap = _ads.split('-');
    const _adt = new Date(+_ap[0], +_ap[1] - 1, +_ap[2]);
    if (_ap.length === 3 && +_ap[1] >= 1 && +_ap[1] <= 12 && _adt.getFullYear() === +_ap[0] && _adt.getDate() === +_ap[2]
      && !raw.anniversaries.some(a => a.main && !a.contactId)) {
      raw.anniversaries.unshift({ id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: (typeof raw.anniversaryName === 'string' && raw.anniversaryName.trim()) || '在一起', date: _ads, contactId: '', main: true });
    }
    raw.anniversary = null;
    raw.anniversaryName = '';
  }
  const _annMainSeen = new Set();
  raw.anniversaries.forEach(a => {
    if (a.main) {
      if (_annMainSeen.has(a.contactId)) a.main = false;
      else _annMainSeen.add(a.contactId);
    }
  });
  // chatAnniv（会话单独绑定的「今天」显示哪条纪念日）2026-10-08 整族退役：它与「归属联系人」是两套
  // 并排的绑定，屏上分不清，且投递逻辑压根不读它（annWishTick 只认 contactId）——用户报「纪念日功能莫名其妙」。
  // 分隔条回到「归属主→通用主」单一口径，老档里这个字段一次性删净，不留孤儿。
  delete raw.chatAnniv;
  // 游戏族 2026-10-11 回到主站（BUGS #279）。#269 把这一族移出去那天，那一份成绩·皮肤·自备拼图图还留在同一台机器的
  // localStorage 上：独立页 games.html 自己那份（ordinal-games-data，用户在它上面攒的＝最新）＋ 当时递出的信封
  // （ordinal-games-handoff，信封形状 {games:…} 与独立页读的 hand.games 逐字相同）。这里一次性抄回来，三条口径：
  // ①两个键都不删＝那是独立页的存档、不是我们的临时件（它归它，我们只抄一份）；
  // ②只落一个 raw._gamesRestored 标记，防「每次加载重抄一遍、把这一边新攒的数盖回去」；
  // ③库里已有那一格就不动（只补 undefined 的键）＝旧的一份是补充不是覆盖。
  if (raw._gamesRestored !== true) {
    raw._gamesRestored = true;
    const _gi = _gamesImportFromLS();
    if (_gi) {
      if (!raw.games || typeof raw.games !== 'object' || Array.isArray(raw.games)) raw.games = _gi;
      else Object.keys(_gi).forEach(k => { if (raw.games[k] === undefined) raw.games[k] = _gi[k]; });
    }
  }
  // 游戏中心（js/games.js）：with=一起玩的联系人；scores[cid] 每人一套成绩（六款技巧游戏：best/plays/ta=TA挑战分，coop 另记一笔）；
  if (!raw.games || typeof raw.games !== 'object' || Array.isArray(raw.games)) raw.games = JSON.parse(JSON.stringify(def.games));
  else {
    const _gCids = new Set((raw.contacts || []).filter(c => c && typeof c.id === 'string').map(c => c.id));
    if (typeof raw.games.with !== 'string' || !_gCids.has(raw.games.with)) {
      raw.games.with = ((raw.contacts || [])[0] || {}).id || 'c0';
    }
    if (!raw.games.scores || typeof raw.games.scores !== 'object' || Array.isArray(raw.games.scores)) raw.games.scores = {};
    Object.keys(raw.games.scores).forEach(k => {
      if (!_gCids.has(k)) { delete raw.games.scores[k]; return; }
      const _sc = raw.games.scores[k];
      if (!_sc || typeof _sc !== 'object') { raw.games.scores[k] = {}; return; }
      ['g2048', 'merge', 'pop', 'link', 'puzzle', 'tetris'].forEach(g => {
        if (!_sc[g] || typeof _sc[g] !== 'object') { _sc[g] = { best: 0, plays: 0, ta: 0 }; return; }
        const x = _sc[g];
        if (typeof x.best !== 'number' || !isFinite(x.best) || x.best < 0) x.best = 0;
        if (typeof x.plays !== 'number' || !isFinite(x.plays) || x.plays < 0) x.plays = 0;
        if (typeof x.ta !== 'number' || !isFinite(x.ta) || x.ta < 0) x.ta = 0;
      });
    });
    // 「自己玩」记一本不认人的公共账（BUGS #302）：屏上 solo 档从此没有选人入口，成绩也就不能记在谁名下——
    // 记在谁名下就会随一枚屏上看不见的键变（换联系人后「自己玩最高分」莫名变了＝#051·#066·#074·#091·#128·#156·#165·#192·#197·#246 那一族）。
    if (!raw.games.solo || typeof raw.games.solo !== 'object' || Array.isArray(raw.games.solo)) raw.games.solo = {};
    const _gSoloGames = ['g2048', 'merge', 'pop', 'link', 'puzzle', 'tetris'];
    _gSoloGames.forEach(g => {
      const x = raw.games.solo[g];
      if (!x || typeof x !== 'object') { raw.games.solo[g] = { best: 0, plays: 0 }; return; }
      if (typeof x.best !== 'number' || !isFinite(x.best) || x.best < 0) x.best = 0;
      if (typeof x.plays !== 'number' || !isFinite(x.plays) || x.plays < 0) x.plays = 0;
    });
    // 一次性归并（只跑一次，标记见上面全新安装那条）：公共账立起来之前，solo 与 vs 的局**混着记在同一格** best 上
    // （切不开哪局是自己玩的），故把各人名下的最高分取最大、局数求和并进公共账。
    // 那几格**留着不动**：它们继续服务比分对战（挑战分按人算＝那是真跟人对局的账），清了等于抹掉别人的账。
    if (raw._soloScoresMerged !== true) {
      raw._soloScoresMerged = true;
      _gSoloGames.forEach(g => {
        const to = raw.games.solo[g];
        Object.keys(raw.games.scores).forEach(k => {
          const x = raw.games.scores[k] && raw.games.scores[k][g];
          if (!x || typeof x !== 'object') return;
          if (typeof x.best === 'number' && isFinite(x.best) && x.best > to.best) to.best = Math.round(x.best);
          if (typeof x.plays === 'number' && isFinite(x.plays) && x.plays > 0) to.plays += Math.round(x.plays);
        });
      });
    }
    if (raw.games.tab !== 'merge' && raw.games.tab !== 'g2048' && raw.games.tab !== 'pop' && raw.games.tab !== 'link' && raw.games.tab !== 'puzzle' && raw.games.tab !== 'tetris') raw.games.tab = 'merge';
    // 2026-10-11 积木（stack）与推塔（tower）下线（BUGS #297）：那两款的成绩与模式档没有任何读方了（_gScore 只按在册那六款取），
    // 留着＝存档里两笔谁也不会再看的死人账，故随宿主一起清（与 delete a.tone 那一族同一口径：不留没人读的键）。
    delete raw.games.towerMode;
    Object.keys(raw.games.scores).forEach(k => { if (raw.games.scores[k]) { delete raw.games.scores[k].stack; delete raw.games.scores[k].tower; } });
    // 2048 图片皮肤：只认 2~2048 十一个键、dataURL 字符串，其余丢弃（非法键/超大值不进存档）
    if (!raw.games.g2048Skins || typeof raw.games.g2048Skins !== 'object' || Array.isArray(raw.games.g2048Skins)) raw.games.g2048Skins = {};
    else Object.keys(raw.games.g2048Skins).forEach(k => {
      if (G2048_VALS.indexOf(+k) < 0 || typeof raw.games.g2048Skins[k] !== 'string' || raw.games.g2048Skins[k].length > 400000) delete raw.games.g2048Skins[k];
    });
    // 滑块拼图自己传的图：只认字符串数组、单张 ≤400KB、最多 8 张（8 与 js/games.js 的 PUZZLE_OWN_MAX 同值，两处一起改；
    // games.js 加载晚于本文件，这里只能自带一份数字——与上面那条 G2048_VALS 同一手法）
    if (!Array.isArray(raw.games.puzzleImgs)) raw.games.puzzleImgs = [];
    else raw.games.puzzleImgs = raw.games.puzzleImgs.filter(u => typeof u === 'string' && u && u.length < 400000).slice(0, 8);
  }
  // 明信片册＝data.postcards 与旧架子 data.games.cat.album（2026-10-10 从游戏里搬来那一格）2026-10-12 随
  // 「在路上／站点／邮差」一起退役（BUGS #308）：架子在主站已无任何读方（用户定档「一并清掉」）＝两格删净不留死人账。
  // raw.games 整格留下——游戏族 2026-10-11 回主站（BUGS #279），里面其余那些键仍有读方。
  delete raw.postcards;
  if (raw.games) delete raw.games.cat;
  if (typeof raw.chatDraft !== 'string') raw.chatDraft = '';
  return raw;
}

async function load() {
  // FIX 2026-09-03 #024 降级判定只看「IndexedDB 是否可用」：原先 get('all') 结果为空（新装/清库）也置 _useLS=true，
  // 整个会话只写 localStorage，下个会话把 LS 快照回写 IDB 后再下个会话只认 IDB 旧快照 → 中间会话数据静默丢失。
  // 两个 store 都存 _savedAt 时间戳，双通道时取较新的一方，避免瞬时失败造成的单向覆盖。
  const _stamp = (o) => (o && typeof o._savedAt === 'number') ? o._savedAt : 0;
  // 设置小快照兜底：若它比所选 base 更新（上次异步全量写没赶上、但同步设置快照落了），在 ensureData 归一之前
  // 把设置并回 raw——深并只覆盖快照里存在的叶子，主库的大资产（背景图／字体／头像）原样保留。
  const _snap = lsSettingsGet();
  const _applySnap = (raw) => { if (raw && _snap && _snap.s && _stamp(_snap) > _stamp(raw)) _mergeSettingsInto(raw, _snap.s); return raw; };
  try {
    const db = await getDB();
    let result = null;
    try {
      result = await new Promise((resolve, reject) => {
        const r = db.transaction(STORE).objectStore(STORE).get('all');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    } catch { result = null; }
    if (result) {
      const ls = lsGet();
      if (ls && _stamp(ls) > _stamp(result)) {
        // localStorage 里有更新的数据（上次会话曾降级写入）：以较新方为准回填 IDB
        const merged = ensureData(_applySnap(ls));
        try { db.transaction(STORE, 'readwrite').objectStore(STORE).put(merged, 'all'); } catch {}
        return merged;
      }
      const merged = ensureData(_applySnap(result));
      // 同时写回 IndexedDB 修复结构
      try { db.transaction(STORE, 'readwrite').objectStore(STORE).put(merged, 'all'); } catch {}
      return merged;
    }
    // IDB 可用但库为空（新装/清库）：用 LS 数据（若有）做种子回填，此后正常走 IDB，不降级
    const merged = ensureData(_applySnap(lsGet()));
    try { db.transaction(STORE, 'readwrite').objectStore(STORE).put(merged, 'all'); } catch {}
    return merged;
  } catch { /* IndexedDB 真不可用才降级 localStorage */ }
  _useLS = true;
  const merged2 = ensureData(_applySnap(lsGet()));
  return merged2;
}

function save() {
  if (_useLS) { _scheduleLsSave(); return; }
  // 镜像不再每发同步写（2026-10-15 收口）。那一发是当天为「iOS 赶在异步事务 oncomplete 之前被冻结」加的
  // 保险，方向对，但挂在 save() 上＝**每一次** save 都同步把整棵树 stringify 一遍：连发消息时十几发
  // 全砸在主线程上（与 BUGS #434 查到的「手机端导入卡住／闪退」同一笔账）。现在与 IndexedDB 走同一枚去抖，
  // 而真正需要立即兑齐的三个路口——切后台（visibilitychange∶本文件末尾）、离开（pagehide∶js/app.js）、
  // 关键写（导入／设置那几处 await 的 flushSave）——照旧同步落镜像。
  // 代价只有一种：改动后 1.2s 内进程被硬杀、且那一发异步 IDB 写没赶上——那 1.2s 里的改动由下一次 load
  // 按 _savedAt 取较新通道回填兜住（#024 双通道），不丢整本。
  _savePending = true;
  if (_saveTimer) return;
  // 设置小快照每次都同步落一份（剔大资产、恒几 KB）：兜住「大存档过不了全量镜像那枚 3MB 体积闸 ∶ iOS 关页赶在异步事务前」那一族丢设置
  saveSettingsSnap();
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    if (!_savePending) return;
    _savePending = false;
    _lsMirror();
    _doSave();
  }, SAVE_DEBOUNCE_MS);
}

// 同步镜像一份到 localStorage（闸在 lsSet 里：装不下就跳、并在屏上说一句）
function _lsMirror() { _stampNow(); lsSet(data); }

// ===== 设置小快照（2026-10-15 拆分）=====
// 全量 LS 镜像有 3MB 体积闸（见上 lsSet/_roughJsonBytes）：大存档（字卡∶聊天里的 base64 图）压根进不了 LS，
// 于是那批用户的「设置」只剩 IndexedDB 一条命——iOS 赶在异步事务 oncomplete 之前被冻结那一发时，
// 回复节奏∶信箱∶朋友圈那些概率与数字就跟着重置。这一枚把「设置类小对象」单独**同步**写一份（剔掉一切
// 大资产，恒几 KB，永远过得了配额）：save() 每次都落它，load() 里若它比主库新就把设置并回去。
// 深并只覆盖快照里存在的叶子，缺的键（大资产）＝保留主库那一份，不会误清用户背景图／字体／头像。
const LS_SETTINGS_KEY = 'ordinal-settings';
const SNAP_ASSET_MAX = 4096;   // 超此长的字符串＝dataURL 大资产，不进小快照
const SETTINGS_SNAP_KEYS = [
  'behavior', 'chatSettings', 'groupBh', 'callSettings',
  'mailbox', 'mailboxSettings', 'momentsSettings', 'momentsBy',
  'emotion', 'emotionBy', 'emotionOff', 'collectSettings',
  'sounds', 'chatSounds', 'minimax', 'theme', 'avatarShape',
  'appearance', 'chatAppearance', 'chatAppearanceDefault',
  'night', 'silent', 'cjian', 'cardFit',
  'taAskOn', 'flashOn', 'wishOn', 'referOn', 'meantOn', 'delMsgOn'
];
function _snapVal(v) {
  if (v === null || v === undefined) return v;
  const t = typeof v;
  if (t === 'string') return v.length > SNAP_ASSET_MAX ? undefined : v;
  if (t !== 'object') return v;                              // number/boolean
  if (Array.isArray(v)) { const a = []; for (const x of v) { const s = _snapVal(x); if (s !== undefined) a.push(s); } return a; }
  const o = {}; for (const k in v) { const s = _snapVal(v[k]); if (s !== undefined) o[k] = s; } return o;
}
function _snapSettings() {
  const s = {};
  for (const k of SETTINGS_SNAP_KEYS) { if (!(k in data)) continue; const v = _snapVal(data[k]); if (v !== undefined) s[k] = v; }
  return { _savedAt: Date.now(), s };
}
function saveSettingsSnap() {
  try { localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(_snapSettings())); }
  // 写失败不静默（诊断 2026-10-15 加固 #4）：快照存不进＝这台机配额满了/禁了 localStorage，
  // 那这一发「关太快也不丢」的保险就没了——只能说一句让用户赶紧导出，不能假装存住了（_lsSay 一次会话只说一次）
  catch (e) { _lsSay('设置快照没能存进本机存储：刚改的东西只存在主库里，若改完立刻关掉页面可能会丢，建议尽快在 设置→数据 导出一次备份'); }
}
function lsSettingsGet() { try { const raw = localStorage.getItem(LS_SETTINGS_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } }
// 深并：只把 src 里存在的叶子写进 target（数组∶基本值整体赋值；对象递归）——大资产不在快照里＝不动 target
function _mergeSettingsInto(target, src) {
  if (!src || typeof src !== 'object') return;
  for (const k of Object.keys(src)) {
    const sv = src[k];
    if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
      if (!target[k] || typeof target[k] !== 'object' || Array.isArray(target[k])) target[k] = {};
      _mergeSettingsInto(target[k], sv);
    } else if (sv !== undefined) {
      target[k] = sv;
    }
  }
}

// 落盘时间戳：load 时比较 IDB 与 LS 两个通道谁更新（#024 双通道防单向覆盖）
function _stampNow() { try { data._savedAt = Date.now(); } catch {} }

// 用户要求（2026-09-04）：保留全部聊天历史，不自动截断。
// BUGS.md #043 曾恢复过旧版的「2000 条截断」，按用户决定回退——渲染层本就分页（MSG_PAGE_SIZE=200），
// 历史增长不影响浏览；数据体积靠 设置→数据 的导出备份与备份提醒兜底。

async function _doSave() {
  _stampNow();
  try {
    const db = await getDB();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(data, 'all');
    await new Promise(resolve => {
      tx.oncomplete = resolve;
      tx.onerror = () => { console.error('保存失败:', tx.error); _lsSay('保存到本机主库失败：请检查本机的存储空间，并尽快在 设置→数据 导出一次备份'); resolve(); };
      tx.onabort = () => { console.error('保存被中断:', tx.error); _lsSay('保存到本机主库时被中断：数据可能没存住，请检查存储空间并尽快导出备份'); resolve(); };
    });
  } catch (err) {
    console.error('保存失败:', err);
    _lsSay('保存到本机主库失败：请检查本机的存储空间，并尽快在 设置→数据 导出一次备份');
  }
}

// 存储页要分清「主库读写正常」与「已降级到 localStorage」：降级时 localStorage 那一份是唯一数据，
// 不能当冗余列出来给人删（BUGS #191）
function isLSMode() { return _useLS === true; }

// FIX 2026-09-01 #006 页面卸载兜底保存：app.js 的 pagehide 一直调用 flushSave 但本文件从未定义，
// 导致卸载时抛 ReferenceError，其后的 lsSet(data) 兜底备份不执行
function flushSave() {
  saveSettingsSnap();   // 设置小快照：立即兑一份，与全量镜像同一时刻（闸在 lsSet 里）
  // 返回 Promise：调用方（设置页）可 await 到 IndexedDB 事务真正完成，不再靠去抖能否赶在冻结前跑完
  if (_useLS) { _lsMirror(); return Promise.resolve(); }
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; _savePending = false; }
  // 立即兑一份同步镜像兜 iOS 冻结，再 await 异步 IndexedDB 写（与 save() 同一把尺，闸在 lsSet 里）
  _lsMirror();
  return _doSave();
}

// 切后台立即冲刷：去抖窗内的改动不能等 pagehide（移动端切走后 pagehide 可能永远不来）
try { document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushSave(); }); } catch (e) {}

// 清空全部数据：内存态重置为默认 + 删 IndexedDB 库 + 删 localStorage 快照，之后由调用方 reload 重新初始化
async function resetAllData() {
const fresh = JSON.parse(JSON.stringify(defaults));
for (const k of Object.keys(data)) if (!(k in fresh)) delete data[k];
Object.assign(data, fresh);
try { localStorage.removeItem(LS_KEY); } catch {}
try { localStorage.removeItem(LS_SETTINGS_KEY); } catch {}
try { localStorage.removeItem('lastBackupAt'); } catch {}
if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; _savePending = false; }
if (_lsTimer) { clearTimeout(_lsTimer); _lsTimer = null; _lsPending = false; }
if (_useLS) return;
try {
if (_db) { _db.close(); _db = null; }
await new Promise(res => {
let done = false;
const fin = () => { if (!done) { done = true; res(); } };
const r = indexedDB.deleteDatabase(DB_NAME);
r.onsuccess = r.onerror = r.onblocked = fin;
setTimeout(fin, 2000);
});
} catch {}
}

// 清空本站全部数据：在 resetAllData 之上，把本站写进这台设备的每一处都抹掉。
// 主数据（库＋降级副本）之外，还有各页「只活在本机」的小键——开屏免问 ordinal-age-test-skip、
// 小测通过 ordinal-quiz-ok、游戏音量 ordinal-game-sfx、各页上次停靠的 tab、诊断记录……这些
// resetAllData 一个都不碰，于是「清空全部数据」之后开屏照旧不问、小测照旧已过（用户 2026-10-13
// 报「缺少清空本站全部数据的功能」说的正是这件事）。
// 判据只有一条：stOurKey() 认得出的（前缀 ordinal-／ordinal:／collect-msgs ＋ lastBackupAt／__diag_test__）
// 再加旧前缀 xy-home-v2:——storage.js 那一把尺子，不留第二份口径；同域别的站点的键一个不碰。
// 之后由调用方 reload 重新初始化（db.js 加载时那一版 localFilesWipe 也会再跑一遍＝双保险）。
async function resetAllSite() {
try {
const drop = [];
for (let i = 0; i < localStorage.length; i++) {
const k = localStorage.key(i);
if (!k) continue;
const mine = (typeof stOurKey === 'function') ? stOurKey(k) : (k.indexOf('ordinal-') === 0 || k.indexOf('ordinal:') === 0 || k.indexOf('collect-msgs') === 0);
if (mine || k.indexOf('xy-home-v2:') === 0) drop.push(k);
}
drop.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
} catch (e) {}
await resetAllData();
try { if (window.localFilesWipe) window.localFilesWipe(); } catch (e) {}
}

// 从本机 localStorage 抄一份游戏档回来：先读独立页自己那份（它在用户手里更新过），再读移出那天递出的信封。
// 两份都读不到／解不开＝返回 null 且不抛（隐私模式下 localStorage 直接抛＝没得接，不等于档坏了，更不许把这次加载打断）。
function _gamesImportFromLS() {
  const keys = ['ordinal-games-data', 'ordinal-games-handoff'];
  for (const k of keys) {
    try {
      const s = localStorage.getItem(k);
      if (!s) continue;
      const box = JSON.parse(s);
      const g = box && box.games;
      if (g && typeof g === 'object' && !Array.isArray(g)) return g;
    } catch (e) { /* 这一把不通就试下一把 */ }
  }
  return null;
}
