/* ===== 播放器（BUGS #284）=====
   三面一壳：曲单页（五格选项＝发现∶曲库∶歌单∶收藏∶记录，#335）＋ 下滑整屏播放页（丙）＋ 贴底面板
   （添加／设置／这一首／待答邀请／网易云账号，五块）。
   #335（用户「播放器完整的ui很丑功能很莫名其妙·登录了网易云并不能像网易云一样正常听歌 搜索 日推 看歌词」）：
     像网易云的那几件事全被埋在弹层深处（搜歌在「添加」面板、日推与我的歌单在「账号」面板里要点两轮按钮）＝
     入口形状不对，不是接口不通（中转那头实测都答得上）。这批把「发现」抬成第一格＝进播放器先看见搜索与日推；
     收藏并「我的」与「TA 的」一本（chips 换看，账仍各是各的）；账号面板只管登录；「权限」钮改名「设置」。
   面板壳复用现成的 .fs-sheet-*（信箱∶朋友圈收藏∶头像昵称同一族），步进钮复用 .stp-min/.stp-max（BUGS #255），
   选项行复用 .stats-tabs/.stats-tab 与 .scope-chip（统计页与聊天统计同一族）＝全站每种件只有一份。

   数据两处：
     data.player          ＝ 曲库∶歌单∶我的收藏∶队列∶正在播∶模式∶网易云票据∶邀请记录∶此刻是谁在陪我听 ＋ settings 那份**全局默认权限**
     data.playerBy[cid]   ＝ **只存被单独改过的那一位**那几格（名单见 PL_PERMS）＋他那一本「TA 的收藏」
   读写一律走 _plCfg(cid)/_plCfgSet(cid,patch)（与信箱 _mbCfg 同一族：别处直接抓 data.player.settings
   会让「给夜航单独调过的冷却」在别人身上也生效＝本仓按人分档那一族，#051·#066·#074·#091·#156·#192·#216）。

   音频字节**不进 data**：base64 进备份＝整棵树被一首歌撑爆，且导出∶导入∶诊断全跟着抖。
   本机文件走 window.idbSet('player-file:'+id)（background.js 那套 ordinal-keep-db 的五个读口），
   data.player.tracks 里只留 {id,name,artist,src,fid,mid,nid,dur,added}（js/db.js 按这份清单重建每一条，
   新加一格必须同时登记那里＝不登记当场存得住、下次打开被剪干净＝#263 那条承重墙）。
   ⚠ 刻意不复用旧库前缀 ordinal-music-*：
   js/background.js 那段 retirePlayerStores() 开机就把它整库删掉（BUGS #266 用户定档「一并抹掉」），
   借那个名字＝用户刚导进来的歌下次开机被自己清掉。

   音源三路＝本机文件∶音频直链∶网易云（2026-10-14 用户定档「把登录 QQ 音乐和中转相关的设置删掉」后收敛到这三路）。
   网易云**匿名**走公开 meting 接口（api.injahow.cn/meting·实测在跑）：放歌走 type=url、贴歌单链接走 type=playlist、
   搜歌走 api.i-meto.com/meting/api 的 type=search（主用那台 injahow 只认 url/playlist/song，对 search 回 unknown type）。
   网易云**账号**那一族（昵称∶日推∶我的歌单∶会员歌完整版）走 NeteaseCloudMusicApi 那一路的四个口
   （/login/status∶/recommend/songs∶/user/playlist∶/song/url/v1），基地址解析只住 _plNcmBase() 一处＝
   先试用户自己填过的那台（data.player.ncmApi，可以是局域网 http 地址），没有再挑列表里第一台答话的公开实例。
   登录是**加成不是闸门**：取不到（接口没答上∶断网∶cookie 过期）一律退回匿名 meting 放免费歌，
   但「没答上」与「cookie 过期」屏上分开说（#422 二批：混成一句「cookie 失效」＝用户照着换票据，白忙一轮）。
   ⚠ 「QQ 那一档∶/cloudsearch∶/playlist/detail∶data.player.relay／ncmRelay」仍是下线状态（用户定档没变）：
   老档里残留的 relay/ncmRelay 值与 src:'qq' 的歌一律不再读（歌留着，标「取不到」）。
   2026-10-15 更正：#422 那一批把**日推与我的歌单也一并删了**，而用户当时选的是「中转＋QQ 下线·网易云登录保留」
   ＝删过头了（他复报「功能不全」，本轮加回来）；这两样要的是**网易云账号**那一族，不是 QQ 也不是那台局域网服务。
   添加这一面是一枚搜索框＋一枚输入框贴链接＋一枚钮，两路从 _plGuess 一处认（一行一条），认不出∶取不到都写在同一栏里＝不悄悄丢。

   触发口径照 mochi（用户明文「需要和 mochi 项目的功能一样」）：TA 回完一批话 2 秒后掷一次，
   命中＝邀你一起听；曲终依次掷 切歌∶随机∶换模式；另有 预订下一首∶帮你收藏∶暂停再恢复。
   ⚠ 这与本仓两条已定档口径相冲（「不要硬额度限次」∶「时长只许在自己区间里现掷」）——
   用户明文选的，故照做，但两处都按他自己的规矩收：冷却窗**每位一条区间现掷**（不钉十分钟死值∶
   也不做「今天已经邀过就不许」那种额度），暂停∶收藏只在**这一首**里掷一发（同一首不重复＝不是额度是「这首歌已经互动过了」这件事本身）。 */

const PL_MODES = ['order', 'loopOne', 'shuffle'];
const PL_MODE_NAME = { order: '顺序', loopOne: '单曲循环', shuffle: '随机' };
const PL_FILE_MAX = 25 * 1024 * 1024;      // 单个音频上限（IDB 里存 dataURL，比原字节大约 4∶3）
const PL_KEEP_INV = 30;                    // 邀请记录屏上只翻最近这些条
const PL_FILE_KEY = 'player-file:';        // IDB 键前缀（不是 ordinal-music-，见文件头那条）
const PL_COOL_MUL = 3;                     // 冷却窗上限＝这一位自己填的那格的 3 倍（区间由它派生，不另钉一个数）
const PL_TA_PAUSE_PCT = 3;                 // 「暂停再恢复」开着时每首的掷面（沿用 mochi 那一格出厂值＝固定概率，不随行为累积）
// 网易云那一路走公开 meting 接口（与 mochi 及本站旧播放器 git 里那份 js/music.js 同一条地址）：
// 所以要联网才取得到清单与声音；接口挂／离线时屏上老实说取不到，不拿假曲名填一个空档。
const PL_NCM_API = 'https://api.injahow.cn/meting/';
// 搜索用的公开 meting 实例（要支持 type=search；本站主用的 injahow 那一台只认 url/playlist/song，
// 对 search 回 unknown type＝实测过。i-meto 这台支持，回包形状与主用那台一致＝同一个解析器就够）。
const PL_NCM_SEARCH_API = 'https://api.i-meto.com/meting/api';
// 网易云「登录」＝MUSIC_U Cookie（2026-10-13，参照 Desktop/love-boat-main 的做法）：meting 是匿名接口，
// 永远只给免费音质；填了 cookie 就改走 NeteaseCloudMusicApi 那一路 /song/url/v1 带 cookie 问＝
// 以你账号的身份取链接，会员歌拿完整版。取不到（接口挂了∶断网∶cookie 过期）一律退回 meting 匿名地址
// ＝登录是加成，不是闸门。API 实例借 love-boat 同一台公开部署；哪天它没了也只影响「完整版」这半边。
const PL_NCM_ACC_API = 'https://netease-cloud-music-api-backup-flame.vercel.app';
// 权限格子的单一表（九格）：面板∶夹取∶默认值∶存档清洗∶按人播种全从它派生，不留第二份名单。
// ⚠ d 这列必须与 js/utils.js 的 defaults.player.settings 逐格相同——两处各写一份必漂，
//   由常驻门 tools/_smoke_player.js 的 A1 钉住（它同时读两边比对，不靠人记）。
const PL_PERMS = [
  { k: 'reqProb', t: '邀你一起听', u: '%', min: 0, max: 100, d: 5, hint: 'TA 回完一批话后掷一次·0＝永不邀' },
  { k: 'cooldownMin', t: '邀请间隔', u: '分钟', min: 1, max: 720, d: 12, hint: '邀过之后至少隔这么久才再邀' },
  { k: 'taReserveProb', t: '预订下一首', u: '%', min: 0, max: 100, d: 6, hint: '把下一首排进队列并说一声' },
  { k: 'taNextProb', t: '曲终切歌', u: '%', min: 0, max: 100, d: 15, hint: '一首放完 TA 替你切下一首' },
  { k: 'taRandProb', t: '曲终随机挑', u: '%', min: 0, max: 100, d: 10, hint: '不照队列·随手挑一首' },
  { k: 'taModeProb', t: '曲终换模式', u: '%', min: 0, max: 100, d: 5, hint: '顺序∶单曲∶随机换一档' },
  { k: 'taFavProb', t: '帮你收藏', u: '%', min: 0, max: 100, d: 20, hint: 'TA 把你正听的收进他那本' },
  { k: 'taPauseEn', t: '暂停再恢复', u: '', min: 0, max: 1, d: 1, bool: true, hint: 'TA 偶尔替你按暂停·过会儿放回去' },
  // 这一格管的不是「TA 做不做」而是「做了要不要吭一声」＝与上面八格不同轴，故面板上单列一节（sec:'chat'）。
  // 出厂开＝沿用上线以来的行为，不静默改掉用户已经习惯的那种呈现。
  { k: 'taChatNote', t: '聊天里说一声', u: '', min: 0, max: 1, d: 1, bool: true, sec: 'chat', hint: '关掉＝TA 动手不再在聊天里留那行小字' },
];
// 机制细节（冷却在「这一格∶它的 3 倍」里现掷等）住在代码与注释里，不上屏＝设置面一行一句读得完；

// 只活在本页寿命的读数（切歌单∶开整屏∶面板筛谁），不进 data、不进备份
// tab 默认「发现」（#335）：像网易云那样——进播放器先看见搜索与日推，曲库退居第二格
const plState = { tab: 'find', favWho: 'mine', list: '', perm: '', full: false, lrc: false };
let plAudio = null, plCur_ = null, plInvite = null, plMenu = null, plBound = false;
let plTaFavTimer = 0, plPauseTimer = 0, plResumeTimer = 0, plPauseDone = '', plPauseOn = false;
let plDelConfirm = 0;   // 「清空曲库」两段式确认的那 2.5 秒

/* ===== 一、按人的权限（读写各一处） ===== */
function _plRoot() {
  if (!data.player || typeof data.player !== 'object' || Array.isArray(data.player)) {
    data.player = JSON.parse(JSON.stringify(defaults.player));
  }
  const p = data.player;
  if (!p.settings || typeof p.settings !== 'object' || Array.isArray(p.settings)) p.settings = {};
  return p;
}
// 读：没单独改过的人共用那份默认；改过的人并上他自己那一份（新增字段自动跟，同 _mbCfg）
function _plCfg(cid) {
  const base = Object.assign({}, _plRoot().settings);
  _plClampPerms(base);
  const own = (data.playerBy || {})[cid || ''];
  if (!own || typeof own !== 'object' || Array.isArray(own)) return base;
  const merged = Object.assign(base, own);
  _plClampPerms(merged);
  return merged;
}
// 写：第一次动某一位＝先把「此刻生效的那一份」整本拷成他的副本再改。
// 只写变化的那一格＝其余字段会跟着全局那份的新值漂走（用户改完他的冷却却发现他的概率也变了）
function _plCfgSet(cid, patch) {
  if (!data.playerBy || typeof data.playerBy !== 'object' || Array.isArray(data.playerBy)) data.playerBy = {};
  const id = cid || '';
  if (!data.playerBy[id] || typeof data.playerBy[id] !== 'object') {
    const c = _plCfg(id);
    data.playerBy[id] = {};
    PL_PERMS.forEach(p => { data.playerBy[id][p.k] = c[p.k]; });
  }
  const cur = data.playerBy[id];
  Object.keys(patch).forEach(k => { cur[k] = patch[k]; });
  const chk = {}; PL_PERMS.forEach(p => { chk[p.k] = cur[p.k]; });
  _plClampPerms(chk);
  Object.keys(chk).forEach(k => { cur[k] = chk[k]; });
  save();
  return cur;
}
// 夹取与默认只有一处：面板∶存档清洗∶读侧都引它（三处各写一份必漂）
function _plClampPerms(o) {
  PL_PERMS.forEach(p => {
    const v = o[p.k];
    if (p.bool) { o[p.k] = !(v === 0 || v === false || v === '0' || v === 'false'); return; }
    let n = Number(v);
    if (!Number.isFinite(n)) n = p.d;
    o[p.k] = Math.max(p.min, Math.min(p.max, Math.round(n)));
  });
  return o;
}
// 这一位的邀请冷却窗尾（每位各一条，互不牵动）；0＝没邀过。调度读数，不进 defaults
function _plCoolEnd(cid) {
  const map = _plRoot().coolEndBy || {};
  const n = Number(map[cid || '']);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function _plCoolSet(cid) {
  const cfg = _plCfg(cid);
  const lo = Math.max(1, cfg.cooldownMin | 0), hi = lo * PL_COOL_MUL;
  const mins = lo + Math.floor(Math.random() * (hi - lo + 1));
  const p = _plRoot();
  if (!p.coolEndBy || typeof p.coolEndBy !== 'object' || Array.isArray(p.coolEndBy)) p.coolEndBy = {};
  p.coolEndBy[cid || ''] = Date.now() + mins * 60000;
  save();
  return mins;
}
// 这一位那一本「TA 的收藏」（同 #066：按人分池，别人那一本不许混进来）
function _plTaFav(cid) {
  const o = (data.playerBy || {})[cid || ''];
  return o && Array.isArray(o.favs) ? o.favs.filter(x => typeof x === 'string') : [];
}
function plTaFav(cid, trackId) {
  if (!cid || !trackId) return false;
  const list = _plTaFav(cid).slice();
  if (list.indexOf(trackId) >= 0) return false;
  list.unshift(trackId);
  if (!data.playerBy || typeof data.playerBy !== 'object' || Array.isArray(data.playerBy)) data.playerBy = {};
  if (!data.playerBy[cid] || typeof data.playerBy[cid] !== 'object') _plCfgSet(cid, {});
  data.playerBy[cid].favs = list.slice(0, 200);
  save();
  return true;
}
function _plTaOwners() {
  const by = data.playerBy || {};
  return ((data.contacts || []).filter(c => c && c.kind !== 'group').map(c => c.id))
    .filter(id => Array.isArray(by[id] && by[id].favs) && by[id].favs.length);
}

/* ===== 二、曲目与音源 ===== */
function plTracks() { const t = _plRoot().tracks; return Array.isArray(t) ? t : []; }
function plById(id) { return plTracks().find(t => t.id === id) || null; }
function plCur() { return plById(_plRoot().current); }
// MUSIC_U 的值读侧也剥一次前缀（用户常把「MUSIC_U=xxx」整行抄进来＝多一层宽容，不另立一条格式规矩）
function _plNcmCookie() { return String(_plRoot().ncmCookie || '').trim().replace(/^MUSIC_U=/i, ''); }
// 网易云**账号**那一族的基地址只在这一处解析：自己填过的那台优先，没填才落回公开那台实例。
// ⚠ 公开实例是别人共享的部署、且 `*.vercel.app` 在部分网络被 DNS 劫持（2026-10-15 本机实测：三条账号口
//   全部 12 秒超时、同网络的 meting 两台各自 0.3∶1.8 秒返回 200）＝它随时可能答不上。答不上时
//   _plNcmRealUrl 回空、播放退回匿名 meting（登录是加成不是闸门），但屏上必须说清是「接口没答上」还是
//   「cookie 过期」＝两句话两件事，混成一句会让人白换票据（#422 二批用户复报的那一条）。
function _plNcmApi() {
  const p = _plRoot();
  // ncmApi＝现名；老档里残留的 ncmRelay 值照收一次（那是他 2026-10-13 亲手填过的那台，别让他重填一遍）
  return String(p.ncmApi || p.ncmRelay || '').trim().replace(/\/+$/, '');
}
function _plNcmBase() { return _plNcmApi() || PL_NCM_ACC_API; }
// 网易云那一路：只存那位歌单/单曲的号，声音地址每次现算（接口换域名或换了线路时不必回头改库里几百条）
function _plNcmUrl(nid) { return PL_NCM_API + '?server=netease&type=url&id=' + encodeURIComponent(String(nid)); }
// 问网易云接口一句话：cookie 与 timestamp 只在这一处拼（不留第二份口径）。失败∶超时∶非 2xx 一律回空串，
// 由调用方那句「没取到」去说后果。path 带前导 /。
function _plNcmAsk(path, ms) {
  const base = _plNcmBase(); if (!base) return Promise.resolve('');
  const sep = path.indexOf('?') >= 0 ? '&' : '?';
  const ck = _plNcmCookie();
  return _plFetchText(base + path + sep + 'timestamp=' + Date.now() + (ck ? '&cookie=' + encodeURIComponent('MUSIC_U=' + ck) : ''), ms || 12000);
}
function _plNcmJSON(txt) { try { return JSON.parse(String(txt || '')); } catch (e) { return null; } }
// 账号那一路取歌单/单曲的清单（比 meting 多两样：带时长、登录后私密歌单也取得到）。取不到回空数组
async function _plNcmList(g) {
  if (!g) return [];
  if (g.as === 'list') {
    const j = _plNcmJSON(await _plNcmAsk('/playlist/detail?id=' + encodeURIComponent(String(g.id)), 14000));
    const pl = j && j.playlist ? j.playlist : null;
    if (!pl || !Array.isArray(pl.tracks)) return [];
    return pl.tracks.map(x => _plNcmRow(x)).filter(Boolean);
  }
  const j = _plNcmJSON(await _plNcmAsk('/song/detail?ids=' + encodeURIComponent(String(g.id)), 12000));
  const arr = j && Array.isArray(j.songs) ? j.songs : [];
  return arr.map(x => _plNcmRow(x)).filter(Boolean);
}
// 账号那一路的歌的形状（日推∶歌单∶单曲三种回包同一形状：id/name/ar[]/dt 毫秒）
function _plNcmRow(s) {
  if (!s || !s.id) return null;
  const ar = Array.isArray(s.ar) ? s.ar : (Array.isArray(s.artists) ? s.artists : []);
  return { nid: String(s.id), name: String(s.name || '').trim(), artist: ar.map(x => x && x.name).filter(Boolean).join(' / '),
    dur: Math.round(Number(s.dt || s.duration || 0) / 1000) || 0 };
}
// 带 cookie 问真实播放地址（/song/url/v1 回 JSON，跟 meting 的「直接给声音」不一样，要先拆一层）：
// 只有取到了才用；没取到回空串，调用方退回 meting。
async function _plNcmRealUrl(nid) {
  if (!nid || !_plNcmBase()) return '';
  const j = _plNcmJSON(await _plNcmAsk('/song/url/v1?id=' + encodeURIComponent(String(nid)) + '&level=standard', 9000));
  const u = j && j.data && j.data[0] && j.data[0].url ? String(j.data[0].url) : '';
  return u ? _plNcmFixUrl(u) : '';
}
// http→https：本站是 https 页，http 的 src 会被浏览器当混合内容整条拦掉，而网易云那批音频域名的 https 都是开着的。
// ⚠ 但**用户自己填那台给出的地址不能动**：那多半是局域网的裸 http（192.168.x.x:8711），
//   一律升 https 等于把能放的那首改成放不出（2026-10-13 桩服务实测踩到）。按主机名判，不按整条串判。
function _plNcmFixUrl(u) {
  const s = String(u || ''); if (!s) return '';
  const api = _plNcmApi().toLowerCase();
  if (api && s.toLowerCase().indexOf(api) === 0) return s;
  return s.replace(/^http:\/\//i, 'https://');
}


/* ===== 二·五、网易云账号（2026-10-13 二批；2026-10-14 摘掉 QQ 那一档；2026-10-15 二批把日推与我的歌单加回来）=====
   两条登录路写进同一格 data.player.ncmCookie —— ①扫码（/login/qr key→create→check）②手填 MUSIC_U（love-boat 同款）。
   读侧只有 _plNcmCookie 一处＝两条路不是两套状态。三样账号读数（昵称∶日推∶我的歌单）都问 _plNcmAsk 一句话，
   基地址解析只住 _plNcmBase() 一处。
   ⚠ 那条「必须先填中转地址才给点」的旧闸门随中转下线一起拆了：现在每枚键都点得动，取不到就当场说取不到
   （#327 那句「点了没反应」的教训：宁可点了之后说实话，也不做一枚按下去没动静的键）。
   ⚠ 日推（/recommend/songs）与我的歌单（/user/playlist）2026-10-14 被 #422 那一批当成「中转那一族」连带删了，
   而用户当时选的是「中转＋QQ 下线·网易云登录保留」＝删过头（他复报「功能不全」，本轮按他的定档加回来）：
   这两样要的是**网易云账号**，与 QQ 与那台局域网服务无关，只是它们都得有一台答话的接口——故这一族补一格
   「网易云接口地址」（data.player.ncmApi），不填走公开实例、答不上就在屏上写清楚是哪一种失败。
   票据与昵称都只存在这台设备上（ncmCookie 进 data＝跟着那份备份走，别处不发）。 */
let plQrKey = '', plQrTimer = 0, plQrSay = '', plQrImg = '', plNcmProfile = null, plNcmSyncAt = 0,
  plFindKw = '', plFindSay = '', plFindRows = null, plFindBad = false,
  plNcmDaily = [], plNcmDailySay = '', plNcmDailySeq = 0,
  plNcmLists = [], plNcmListsSay = '', plNcmListsSeq = 0, plNcmSayWhy = '';
function _plNcmLogged() { return !!_plNcmCookie(); }
// 换号∶退出∶换接口＝那两把清单与昵称都作废（不清＝屏上还挂着上一个号推荐过的歌）
function _plNcmResetMine() { plNcmProfile = null; plNcmSyncAt = 0; plNcmSayWhy = ''; plNcmDaily = []; plNcmDailySay = ''; plNcmLists = []; plNcmListsSay = ''; }
function _plNcmName() { return (plNcmProfile && String(plNcmProfile.nickname || '')) || ''; }
function _plNcmStopQr() { if (plQrTimer) { clearTimeout(plQrTimer); plQrTimer = 0; } }
function _plCookieIn(s) { const m = String(s || '').match(/MUSIC_U=([^;]+)/); return m ? m[1] : ''; }
// 问一次登录态拿昵称/头像；失败不编名字（屏上就写「已登录」），一分钟内不重复问。
// 两种失败分开记在 plNcmSayWhy（#422 二批用户复报「一直显示 cookie 失效」的根＝旧版把「接口压根没答上」
// 与「答了但里面没有 profile」混成一句话，让人照着换票据——换票救治不了连不上的接口）。
function _plNcmSyncProfile(force) {
  if (!_plNcmLogged()) { plNcmProfile = null; return Promise.resolve(null); }
  if (!force && plNcmProfile && Date.now() - plNcmSyncAt < 60000) return Promise.resolve(plNcmProfile);
  return _plNcmAsk('/login/status', 8000).then(txt => {
    const j = _plNcmJSON(txt);
    const p = (j && j.data && j.data.profile) || (j && j.profile) || null;
    // uid 一起留着（#330：「我的歌单」要拿它问 /user/playlist；profile 不落库＝每次进面板现问现用）
    if (p) { plNcmProfile = { uid: String(p.userId || ''), nickname: String(p.nickname || ''), avatar: String(p.avatarUrl || '') }; plNcmSyncAt = Date.now(); plNcmSayWhy = ''; }
    // 空串＝那一台压根没答（连不上∶超时∶非 2xx）；答了但里面没 profile＝票据取不到人（过期/填错）
    else plNcmSayWhy = txt ? 'cookie' : 'down';
    return plNcmProfile;
  }).catch(() => { plNcmSayWhy = plNcmSayWhy || 'down'; return plNcmProfile; });
}
function plNcmQrStart() {
  _plNcmStopQr();
  plQrImg = ''; plQrSay = '正在取二维码…'; renderPlayerNcm();
  _plNcmAsk('/login/qr/key', 9000).then(txt => {
    const j = _plNcmJSON(txt);
    const key = (j && j.data && j.data.unikey) ? String(j.data.unikey) : '';
    if (!key) { plQrSay = '没取到二维码·接口没答上（过一会儿再试，或改用手填 MUSIC_U）'; renderPlayerNcm(); return; }
    plQrKey = key;
    return _plNcmAsk('/login/qr/create?key=' + encodeURIComponent(key) + '&qrimg=true', 12000).then(t2 => {
      const j2 = _plNcmJSON(t2);
      const img = (j2 && j2.data && j2.data.qrimg) ? String(j2.data.qrimg) : '';
      if (!img) { plQrSay = '拿到了钥匙，但二维码图没取到·再点一次'; renderPlayerNcm(); return; }
      plQrImg = img; plQrSay = '用网易云 App 扫一下'; renderPlayerNcm();
      plQrPoll(0);
    });
  }).catch(() => { plQrSay = '连不上接口（过一会儿再试）'; renderPlayerNcm(); });
}
function plQrPoll(n) {
  if (!plQrKey) return;
  _plNcmAsk('/login/qr/check?key=' + encodeURIComponent(plQrKey) + '&noCookie=true', 9000).then(txt => {
    const j = _plNcmJSON(txt);
    const code = j && Number(j.code);
    if (code === 800) { plQrImg = ''; plQrSay = '二维码过期了·再点一次登录'; renderPlayerNcm(); return; }
    if (code === 802) { plQrSay = '扫到了·在手机上点一下确认'; renderPlayerNcm(); }
    if (code === 803) {
      const ck = _plCookieIn(j && j.cookie);
      if (!ck) { plQrImg = ''; plQrSay = '手机上确认了，但没拿到票据·再点一次'; renderPlayerNcm(); return; }
      _plRoot().ncmCookie = ck; save();
      plQrImg = ''; plQrSay = '登录成功'; plNcmSayWhy = ''; _plNcmResetMine();
      // 提示等问完登录态再念：带昵称的那句才是「登录成功」（#330：只念「已登录」＝用户不知道登的是谁）
      _plNcmSyncProfile(true).then(() => { renderPlayerNcm(); renderPlayerSettings(); renderPlayerAll(); showToast('网易云登录成功' + (_plNcmName() ? ' · ' + _plNcmName() : '')); });
      return;
    }
    if (n > 72) { plQrImg = ''; plQrSay = '等太久了·再点一次登录'; renderPlayerNcm(); return; }
    plQrTimer = setTimeout(() => plQrPoll(n + 1), 2500);
  }).catch(() => { plQrTimer = setTimeout(() => plQrPoll(n + 1), 3000); });
}
function plNcmLogout() {
  _plNcmStopQr();
  plQrKey = ''; plQrImg = ''; plQrSay = ''; _plNcmResetMine();
  _plRoot().ncmCookie = ''; save();
  renderPlayerNcm(); renderPlayerSettings(); renderPlayerAll();
  showToast('已退出网易云；免费歌照旧能放');
}
function openPlayerNcm() { _plNcmSyncProfile(false).then(() => { if (plState.ncm) renderPlayerNcm(); }); if (!plQrKey) plQrSay = ''; plState.ncm = 1; renderPlayerNcm(); _plMask('plNcmMask', true); }
function closePlayerNcm() { _plNcmStopQr(); plState.ncm = 0; _plMask('plNcmMask', false); }
function renderPlayerNcm() {
  const box = document.getElementById('plNcmBody'); if (!box) return;
  const logged = _plNcmLogged(), nm = _plNcmName();
  // 状态行两态都出（#327：旧版 plQrSay 只在「已填中转」分支里画＝没中转时点「二维码登录」
  // 写了「要先填地址」却永远画不出来＝用户报的「点了没反应」）
  const st = plQrImg
    ? '<div class="pl-qr"><img src="' + plQrImg + '" alt="网易云登录二维码"></div><div class="pl-qr-st">' + escapeHTML(plQrSay) + '</div>'
    : (plQrSay ? '<div class="pl-qr-st">' + escapeHTML(plQrSay) + '</div>' : '');
  // #335：这一面只管「登不登」。搜歌在「发现」那一面随时能用（免登录）。
  // 2026-10-14：日推与我的歌单随中转下线一并去掉（它们只有中转走得到），这一面只剩两条登录路。
  box.innerHTML =
    '<div class="pl-set-lab">网易云账号<span>' + (logged ? '已登录' : '未登录') + '</span></div>' +
    (logged
      ? '<div class="pl-song">' + (plNcmProfile && plNcmProfile.avatar
        ? '<img class="pl-qava" src="' + escapeHTML(plNcmProfile.avatar) + '" alt="">' : _plNoteSvg()) +
        '<span class="pl-tx"><span class="pl-nm">' + escapeHTML(nm || '网易云账号') + '</span>' +
        '<span class="pl-ar">会员歌取完整版 · 票据只在这台设备上</span></span></div>'
      : '<div class="pl-note">不登录照旧放免费歌。手填 MUSIC_U 不用装任何东西；二维码登录要用网易云 App 扫一下。</div>') +
    st +
    '<div class="pl-set-row" data-pl-act="ncmapi"><span class="pl-tx"><b>网易云接口地址</b><small>' +
    escapeHTML(_plNcmApi() || '没填·走公开那台实例（别人共享的机器，常不答；要日推∶歌单∶会员歌就填你自己那台）') +
    '</small></span><span class="pl-chev">改</span></div>' +
    (logged && plNcmSayWhy ? '<div class="pl-qr-st">' +
      escapeHTML(plNcmSayWhy === 'down' ? '那台接口没答上＝昵称与日推都取不到（不是 cookie 失效，先改地址或过一会儿再试）'
        : '接口答了，但取不到账号信息＝cookie 多半过期了，重新复制一份 MUSIC_U') + '</div>' : '') +
    '<div class="pl-acts">' +
    (logged
      ? '<button type="button" class="pl-btn" data-pl-act="ncmqr">换个号登</button><button type="button" class="pl-btn" data-pl-act="ncmout">退出登录</button>'
      : '<button type="button" class="pl-btn pri" data-pl-act="ncmcookie">手填 MUSIC_U</button>' +
        '<button type="button" class="pl-btn" data-pl-act="ncmqr">二维码登录</button>') +
    '</div>' +
    '<div class="pl-note">搜歌不用登录：播放器第一格「发现」随时能搜（走公开接口）。登录与那两把清单（每日推荐∶我的歌单）用的是上面那一台接口。</div>';
}
// 「接口地址」那一行：填与清空都当场问一次登录态（只存不问＝屏上永远「已登录」却不知道登的是谁，#330 那一课）
function plNcmApiSet() {
  window.openModal('网易云接口地址', _plNcmApi(), v => {
    const s = String(v || '').trim().replace(/\/+$/, '');
    if (s && !/^https?:\/\/\S+$/i.test(s)) { showToast('填一整条地址，如 http://192.168.1.5:8711 或 https://某台.vercel.app'); return; }
    _plRoot().ncmApi = s; save();
    plNcmProfile = null; plNcmSayWhy = ''; plNcmSyncAt = 0;
    plNcmDaily = []; plNcmDailySay = ''; plNcmLists = []; plNcmListsSay = '';
    renderPlayerNcm(); renderPlayerSettings();
    if (!s) { renderPlayerAll(); showToast('清空了＝走公开那台实例'); return; }
    // 换一台接口＝账号那三样全部重来，所以当场问一次：成功带昵称，失败说清是哪一种失败
    _plNcmSyncProfile(true).then(pf => {
      renderPlayerNcm(); renderPlayerAll();
      showToast(pf && pf.nickname ? '接口已接上 · ' + pf.nickname : '地址存了·这台暂时没答上（它还在跑吗？手机与它同一网络吗？）');
    });
  }, { staticText: '留空＝用公开那台实例。要「每日推荐∶我的歌单∶会员歌完整版」就得有一台答话的接口——自己那台最稳：在同一网络里跑一台 NeteaseCloudMusicApi（例：http://192.168.1.5:8711），把它的地址填这里。本站不代存你的票据，也不把它发给第三台机器。' });
}
// ===== 发现那一面（#335）：搜索搬出弹层进播放器第一格；#422 二批把日推与我的歌单加回这一面 =====
//   旧家＝搜索住在「添加」贴底面板（要三层深才点得到）。这一面＝一只搜索框＋结果栏＋账号那两把清单＋最近收的歌。
//   ⚠ 左右内距由外层 .pl-find 一处给（站内 .pl-body 自己不垫边距，行件各有各的内距口径）——
//     这一面里的件（set-lab/search/res/add-log）本来都是「贴左贴右」的画法，少了那一层就是
//     「字画到屏幕外面去」（用户 2026-10-14 报的「字都飞出手机屏幕了」）。
function _plFindResHTML() {
  const res = plFindSay
    ? '<div class="pl-add-log"><div' + (plFindBad ? ' class="bad"' : '') + '>' + escapeHTML(plFindSay) + '</div></div>'
    : (Array.isArray(plFindRows) ? plFindRows.map(r =>
      '<button type="button" class="pl-res" data-pl-act="ncmplay" data-nid="' + escapeHTML(r.nid) + '" data-nm="' + escapeHTML(r.name) +
      '" data-ar="' + escapeHTML(r.artist) + '" data-du="' + (r.dur || 0) + '">' +
      '<span class="pl-tx"><b>' + escapeHTML(r.name || ('网易云 ' + r.nid)) + '</b><small>' + escapeHTML(r.artist || '未知歌手') +
      (r.dur ? ' · ' + _plDur(r.dur) : '') + '</small></span><span class="pl-chev">播</span></button>').join('') : '');
  return '<div id="plSearchRes">' + res + '</div>';
}
function renderPlayerFind() {
  const body = document.getElementById('plBody'); if (!body) return;
  const logged = _plNcmLogged();
  // 重画不丢打到一半的字（每次先接住再重建）
  const kwEl = document.getElementById('plSearchKw');
  if (kwEl && kwEl.value) plFindKw = kwEl.value;
  // 2026-10-14 重排：整面套一层 .pl-find 拿左右内距（原先这一面直接挂在 .pl-body 上＝内容贴边被裁）。
  // 下半屏那块「曲库里最近收的」不是新功能：默认落在这一格的人，开机就能看见自己的歌并直接点播。
  const latest = plTracks().slice().reverse().slice(0, 5);
  body.innerHTML = '<div class="pl-find">' +
    '<div class="pl-set-lab">搜一首<span>公开接口 · 不用登录</span></div>' +
    '<div class="pl-search"><input type="text" class="pl-in pl-search-in" id="plSearchKw" placeholder="歌名或歌手" autocomplete="off" spellcheck="false" value="' + escapeHTML(plFindKw) + '"><button type="button" class="pl-btn" data-pl-act="ncmsearch">搜索</button></div>' +
    _plFindResHTML() +
    (plFindSay ? '' : '<div class="pl-note">点一行＝收进曲库并开始播放；要整本歌单请走「添加」里贴链接那一条。</div>') +
    '<div class="pl-set-row" data-pl-act="ncm"><span class="pl-tx"><b>网易云账号</b><small>' +
    (logged ? '已登录' + (_plNcmName() ? ' · ' + escapeHTML(_plNcmName()) : '') + '·会员歌取完整版（点开可退出）'
      : '未登录·免费歌照旧能放（点开可登录）') +
    '</small></span><span class="pl-chev">' + (logged ? '›' : '登录') + '</span></div>' +
    (logged ? _plNcmMineHTML() : '') +
    (latest.length ? '<div class="pl-set-lab">曲库里最近收的<span>点一行就播</span></div>' + latest.map(t => _plRowHTML(t, 0)).join('') : '') +
    '</div>';
  // 登录了才取这两把清单；取过∶正在取（say 有字）∶取着（rows 非空而 say 空＝已到手）都不重发，
  // 只有「一行没有也没说过」＝没发起过，才发第一趟。重画这一面（切 tab∶收歌）不该每次刷新一趟网络。
  if (logged) {
    if (!plNcmDaily.length && !plNcmDailySay) plNcmDailyLoad();
    if (!plNcmLists.length && !plNcmListsSay) plNcmListsLoad();
  }
}
// 账号那两把清单的 HTML（日推∶我的歌单）——「正在取…」∶一句实话∶行，三种都住同一格里。
// 取不到时那行小字后面永远跟着两枚去处（重新取∶改接口地址），不留一句只能看着的抱怨（提醒要可执行）。
function _plNcmMineHTML() {
  const api = _plNcmApi();
  const row = (s, say, kind) =>
    '<div class="pl-set-lab">' + s + '<span>' + escapeHTML(api ? '走你填的那台接口' : '走公开接口·可能不答') +
    '<button type="button" class="pl-link" data-pl-act="ncm' + kind + 'refresh">重新取</button>' +
    '<button type="button" class="pl-link" data-pl-act="ncmapi">接口地址</button></span></div>' +
    (say ? '<div class="pl-qr-st">' + escapeHTML(say) + '</div>' : '');
  const daily = row('每日推荐', plNcmDailySay, 'daily') +
    plNcmDaily.map(r =>
      '<button type="button" class="pl-res" data-pl-act="ncmplay" data-nid="' + escapeHTML(r.nid) + '" data-nm="' + escapeHTML(r.name) +
      '" data-ar="' + escapeHTML(r.artist) + '" data-du="' + (r.dur || 0) + '">' +
      '<span class="pl-tx"><b>' + escapeHTML(r.name) + '</b><small>' + escapeHTML(r.artist || '未知歌手') +
      (r.dur ? ' · ' + _plDur(r.dur) : '') + '</small></span><span class="pl-chev">播</span></button>').join('');
  const lists = row('我的歌单', plNcmListsSay, 'lists') +
    plNcmLists.map(r =>
      '<button type="button" class="pl-res" data-pl-act="ncmimport" data-pid="' + escapeHTML(r.id) + '" data-pnm="' + escapeHTML(r.name) + '">' +
      '<span class="pl-tx"><b>' + escapeHTML(r.name) + '</b><small>' + r.count + ' 首</small></span><span class="pl-chev">收</span></button>').join('');
  return daily + lists;
}
// 日推∶我的歌单各走一句话（口径同 _plNcmSyncProfile：seq 只防「慢回包盖掉新一次」＝点两下不会出一份混着的账）
function plNcmDailyLoad() {
  const seq = ++plNcmDailySeq;
  plNcmDaily = []; plNcmDailySay = '正在取每日推荐…'; renderPlayerFind();
  _plNcmAsk('/recommend/songs', 14000).then(txt => {
    if (seq !== plNcmDailySeq) return;
    const j = _plNcmJSON(txt);
    const arr = (j && j.data && Array.isArray(j.data.dailySongs)) ? j.data.dailySongs : [];
    plNcmDaily = arr.slice(0, 30).map(x => _plNcmRow(x)).filter(Boolean);
    plNcmDailySay = plNcmDaily.length ? '' : _plNcmWhyNoAnswer(txt);
    renderPlayerFind();
  }).catch(() => { if (seq !== plNcmDailySeq) return; plNcmDailySay = '这一趟没走通（过一会儿再重新取）'; renderPlayerFind(); });
}
function plNcmListsLoad() {
  const seq = ++plNcmListsSeq;
  plNcmLists = []; plNcmListsSay = '正在取你的歌单…'; renderPlayerFind();
  const go = uid => {
    _plNcmAsk('/user/playlist?uid=' + encodeURIComponent(uid) + '&limit=30&offset=0', 14000).then(txt => {
      if (seq !== plNcmListsSeq) return;
      const j = _plNcmJSON(txt);
      const arr = (j && Array.isArray(j.playlist)) ? j.playlist : ((j && j.data && Array.isArray(j.data.playlist)) ? j.data.playlist : []);
      plNcmLists = arr.filter(x => x && x.id).map(x => ({ id: String(x.id), name: String(x.name || '歌单'), count: Number(x.trackCount) || 0 }));
      plNcmListsSay = plNcmLists.length ? '' : _plNcmWhyNoAnswer(txt);
      renderPlayerFind();
    }).catch(() => { if (seq !== plNcmListsSeq) return; plNcmListsSay = '这一趟没走通（过一会儿再重新取）'; renderPlayerFind(); });
  };
  const uid = plNcmProfile && plNcmProfile.uid;
  if (uid) { go(uid); return; }
  _plNcmSyncProfile(true).then(pf => {
    if (seq !== plNcmListsSeq) return;
    if (pf && pf.uid) go(pf.uid);
    // 「答不上」那句话按有没有填地址说（填了还劝人「填你自己那台」＝一句对不上现状的话），
    // 只有答了但里面没账号信息才是票据的事
    else { plNcmListsSay = plNcmSayWhy === 'cookie' ? '票据取不到账号信息（cookie 过期了·重填一次 MUSIC_U）'
      : plNcmSayWhy === 'down' ? _plNcmWhyNoAnswer('') : ''; renderPlayerFind(); }
  });
}
// 一句「为什么没取到」：接口压根没答 ≠ 答了但这一趟没东西（后者往往是私密歌单＝不怪接口）
function _plNcmWhyNoAnswer(txt) {
  if (!txt) return _plNcmApi() ? '那台接口没答上（它还在跑吗？手机与它在同一个网络吗？）'
    : '公开那台接口没答上（它常常抽风·过一会儿再重新取，或填你自己那台）';
  return '没取到东西（这一趟要登录网易云才有·私密歌单也一样）';
}
// 整本歌单收进曲库：填了自己那台走账号口（私密歌单也取得到），没走通再退公开 meting 那一趟
async function plNcmImport(pid, nm) {
  nm = String(nm || '歌单');
  plNcmListsSay = '《' + nm + '》正在取清单…'; renderPlayerFind();
  let songs = [];
  if (_plNcmApi()) songs = await _plNcmList({ as: 'list', id: pid });
  if (!songs.length) songs = _plMetingList(await _plFetchText(PL_NCM_API + '?server=netease&type=playlist&id=' + encodeURIComponent(String(pid)), 14000));
  songs = songs.filter(s => s && s.nid);
  if (!songs.length) { plNcmListsSay = '《' + nm + '》没取到清单（要联网；私密歌单要填你自己那台接口）'; renderPlayerFind(); return; }
  let got = 0;
  songs.forEach(s => {
    const id = 'ncm' + s.nid;
    if (plById(id)) return;
    got++;
    _plPushTrack({ id, nid: s.nid, name: s.name || ('网易云 ' + s.nid), artist: s.artist, src: 'ncm', dur: Number(s.dur) || 0, added: Date.now() });
  });
  plNcmListsSay = '《' + nm + '》收了 ' + got + ' 首' + (got < songs.length ? '·其余 ' + (songs.length - got) + ' 首已经在库里' : '');
  renderPlayerAll();
  showToast(got ? '收了 ' + got + ' 首进曲库' : '这一单的歌都在曲库里了');
}
// 搜索一路（2026-10-14 中转下线后只剩这一路）：公开 meting 实例的 type=search（免登录、只有免费音质）。
//   结果存进 plFindRows/plFindSay＝重画不丢（页面上的结果不再像面板里那样只活到下一次重画）。
//   ⚠ 公开实例是别人的机器，会抽风：取不到就当场说「过一会儿再试」，不静默。
async function plNcmSearch(kw) {
  const q = String(kw || '').trim();
  if (!q) { plFindRows = null; plFindSay = '先打两个字（歌名或歌手）'; plFindBad = true; renderPlayerFind(); return; }
  plFindRows = null; plFindSay = '正在搜「' + q + '」…'; plFindBad = false;
  renderPlayerFind();
  const rows = _plMetingList(await _plFetchText(PL_NCM_SEARCH_API + '?server=netease&type=search&id=' + encodeURIComponent(q), 14000))
    .map(r => ({ nid: String(r.nid), name: String(r.name || ''), artist: String(r.artist || ''), dur: Number(r.dur) || 0 }));
  if (!rows.length) {
    plFindRows = null; plFindBad = true;
    plFindSay = '没搜到（公开接口有时抽风，过一会儿再试）';
  } else { plFindRows = rows; plFindSay = ''; plFindBad = false; }
  renderPlayerFind();
}
// 「放得出」这件事不靠猜：本机文件要在 IDB 里真有条、直链要像个地址、
// 网易云要有那个号（声音地址每次现算，取不取得到要联网才知道，这里只判「形状对不对、能不能试」）
function plPlayable(t) {
  if (!t) return false;
  if (t.src === 'file') return !!t.fid;
  // 'qq' 这一档 2026-10-14 随中转整条下线：老档里留下的那些歌形状不对＝自然落到下面那行正则判 false（取不到声音，照实说）
  if (t.src === 'ncm') return !!t.nid;
  return /^https?:\/\//i.test(String(t.src || ''));
}
function plSrcOf(t) {
  if (!t) return '';
  if (t.src === 'ncm') return t.nid ? _plNcmUrl(t.nid) : '';
  return /^https?:\/\//i.test(String(t.src || '')) ? t.src : '';
}
function _plDur(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return '';
  const m = Math.floor(n / 60), s = Math.floor(n % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}
// 时长只有两个来源：文件元数据量出来的、或导入时抄来的；量不到就留空（量不到的数不编，同 #209 那条语音条不写时长）
function _plDurText(t) { return t && t.dur ? _plDur(t.dur) : ''; }
function _plName(cid) {
  const c = (data.contacts || []).find(x => x && x.id === cid);
  return fixedNameOf(c) || '那位';
}
function _plSingles() { return (data.contacts || []).filter(c => c && c.kind !== 'group'); }
// 新歌一律插到队尾（新的在前由列表自己倒序显示），并当场把 IDB 里那份字节写进去
function _plPushTrack(o) {
  const p = _plRoot();
  if (!Array.isArray(p.tracks)) p.tracks = [];
  p.tracks.push(o);
  save();
  return o;
}
function plRemoveTrack(id) {
  const p = _plRoot();
  p.tracks = plTracks().filter(t => t.id !== id);
  if (Array.isArray(p.favs)) p.favs = p.favs.filter(x => x !== id);
  if (Array.isArray(p.queue)) p.queue = p.queue.filter(x => x !== id);
  (Array.isArray(p.playlists) ? p.playlists : []).forEach(l => { if (Array.isArray(l.trackIds)) l.trackIds = l.trackIds.filter(x => x !== id); });
  const t = plById(id);
  if (p.current === id) { p.current = ''; _plStopAudio(); }
  if (t && t.src === 'file' && t.fid && window.idbDelete) window.idbDelete(PL_FILE_KEY + t.fid).catch(() => {});
  save();
  renderPlayerAll();
}

/* ===== 三、播放（一个 Audio，全站只有这一枚） ===== */
function _plAudio() {
  if (plAudio) return plAudio;
  try { plAudio = new Audio(); } catch (e) { return null; }
  plAudio.preload = 'metadata';
  plAudio.addEventListener('timeupdate', _plPaint);
  plAudio.addEventListener('loadedmetadata', () => {
    const t = plCur();
    // 元数据量到的时长写回这一首（只有量到才写＝不写 0）：下次不必等解码就有读数
    if (t && !t.dur && Number.isFinite(plAudio.duration) && plAudio.duration > 0) {
      t.dur = Math.round(plAudio.duration); save();
    }
    _plPaint();
  });
  plAudio.addEventListener('ended', plOnEnded);
  plAudio.addEventListener('play', () => { _plClearTaTimers(); plPauseOn = false; _plScheduleTa(plCur()); _plPaint(); });
  plAudio.addEventListener('pause', () => { if (!plPauseOn) _plClearTaTimers(); _plPaint(); });
  plAudio.addEventListener('error', () => { _plPaint(); });
  return plAudio;
}
function _plStopAudio() {
  _plClearTaTimers();
  if (plAudio) { try { plAudio.pause(); plAudio.removeAttribute('src'); plAudio.load(); } catch (e) {} }
  _plPaint();
}
// 装载：本机文件要先把 IDB 里那段字节捞出来（捞不到就如实说一句，不放一枚点着没声音的键）
function plLoad(t) {
  if (!t) return false;
  const a = _plAudio(); if (!a) { showToast('这台设备放不了音频'); return false; }
  if (!plPlayable(t)) {
    showToast(t.src === 'file' ? '这首的本机字节已经不在了（换过设备或清过存储）'
      : t.src === 'qq' ? '这首是 QQ 音源收的，QQ 那一档已经下线了＝取不到声音'
      : t.src === 'ncm' ? '这一首没记下网易云的歌曲号，取不到声音' : '这一首没有可播的地址');
    return false;
  }
  if (t.src === 'file') {
    if (!window.idbGet) { showToast('这台设备读不到本机存储'); return false; }
    plCur_ = t;
    window.idbGet(PL_FILE_KEY + t.fid).then(v => {
      if (plCur_ !== t) return;
      if (!v) { showToast('这首的音频字节已经不在了'); return; }
      try { a.src = v; } catch (e) { return; }
      plStart(t);
    }).catch(() => { if (plCur_ === t) showToast('读这首的时候出错了'); });
    return true;
  }
  if (t.src === 'ncm' && _plNcmCookie()) {
    // 登录档：先问完整版地址，问不到（接口挂了∶cookie 过期）退回 meting 匿名那条＝登录是加成不是闸门
    plCur_ = t;
    _plNcmRealUrl(t.nid).then(u => {
      if (plCur_ !== t) return;
      try { a.src = u || plSrcOf(t); } catch (e) { return; }
      plStart(t);
    });
    return true;
  }
  try { a.src = plSrcOf(t); } catch (e) { return false; }
  plStart(t);
  return true;
}
function plPlayId(id) { const t = plById(id); if (t) plLoad(t); }
function plStart(t) {
  const p = _plRoot(), a = _plAudio();
  p.current = t.id; save();
  if (a && a.play) { const r = a.play(); if (r && r.catch) r.catch(() => {}); }
  renderPlayerAll();
  return true;
}
function plToggle() {
  const t = plCur(), a = _plAudio();
  if (!t) { plOpenFull(true); return; }          // 没在播＝整屏那一面本来就是「挑一首」的入口，不留一枚点着没反应的键
  if (!a) return;
  if (a.paused) {
    if (!a.src && !plLoad(t)) return;
    const r = a.play(); if (r && r.catch) r.catch(() => showToast('这一首放不出来（链接可能过期了）'));
  } else a.pause();
  _plPaint();
}
function plPauseByTa() {
  const a = plAudio; if (!a || a.paused) return false;
  plPauseOn = true;
  try { a.pause(); } catch (e) {}
  return true;
}
function plResumeByTa() {
  const a = plAudio; plPauseOn = false;
  if (!a || !a.paused || document.hidden) return;
  const r = a.play(); if (r && r.catch) r.catch(() => {});
}
function _plFromQueue() {
  const p = _plRoot();
  if (!Array.isArray(p.queue) || !p.queue.length) return false;
  let id = '', guard = 0;
  while (p.queue.length && guard++ < 50) {
    id = p.queue.shift();
    const t = plById(id);
    if (t && plPlayable(t)) { save(); plLoad(t); return true; }
  }
  save();
  return false;
}
function plNext(byTa) {
  if (!byTa && _plFromQueue()) return;
  const p = _plRoot(), list = plTracks().filter(plPlayable);
  if (!list.length) return;
  if (p.mode === 'loopOne' && !byTa) { const c = plCur(); if (c) { const a = _plAudio(); if (a) { try { a.currentTime = 0; } catch (e) {} plStart(c); } return; } }
  if (p.mode === 'shuffle') { plLoad(list[Math.floor(Math.random() * list.length)]); return; }
  const i = list.findIndex(t => t.id === p.current);
  plLoad(list[(i + 1) % list.length]);
}
function plPrev() {
  const list = plTracks().filter(plPlayable); if (!list.length) return;
  const i = list.findIndex(t => t.id === _plRoot().current);
  plLoad(list[(i - 1 + list.length) % list.length]);
}
function plCycleMode() {
  const p = _plRoot(); const i = PL_MODES.indexOf(p.mode);
  p.mode = PL_MODES[(i + 1) % PL_MODES.length] || 'order'; save();
  _plPaint();
}
function plSeekRatio(r) {
  const a = _plAudio(); if (!a) return;
  const d = Number.isFinite(a.duration) ? a.duration : 0;
  if (!d) return;
  try { a.currentTime = Math.max(0, Math.min(d - 0.2, d * r)); } catch (e) {}
  _plPaint();
}
function plOnEnded() {
  if (_plFromQueue()) return;
  if (plTaAutoAction()) return;
  plNext(false);
}

/* ===== 四、屏上渲染 ===== */
function renderPlayerAll() {
  renderPlayerPage();
  renderPlayerFull();
}
function _plTabsHTML() {
  const p = _plRoot();
  const n = id => {
    if (id === 'lib') return plTracks().length;
    if (id === 'list') return (Array.isArray(p.playlists) ? p.playlists : []).length;
    return (Array.isArray(p.invites) ? p.invites : []).length;
  };
  // 「发现」不带计数（它是一张门面，数字没有读法）；收藏那一格并了「我的」与「TA 的」两本（#335）
  return [['find', '发现', ''], ['lib', '曲库', n('lib')], ['list', '歌单', n('list')],
    ['fav', '收藏', (Array.isArray(p.favs) ? p.favs : []).filter(plById).length + _plTaAll().length], ['rec', '记录', n('rec')]]
    .map(x => '<button type="button" class="stats-tab' + (plState.tab === x[0] ? ' active' : '') + '" data-pl-tab="' + x[0] + '">' +
      x[1] + (x[2] !== '' ? '<i>' + x[2] + '</i>' : '') + '</button>').join('');
}
function _plTaAll() {
  const out = [];
  _plTaOwners().forEach(cid => _plTaFav(cid).forEach(id => { const t = plById(id); if (t) out.push(Object.assign({}, t, { _cid: cid })); }));
  return out;
}
function _plRowHTML(t, i, o) {
  o = o || {};
  const cur = _plRoot().current === t.id;
  // 副标按「有什么说什么」拼（2026-10-14）：作者为空时不再先吐一个孤零零的「·」（曲库第一行原样是「· 本机」）
  const bits = [];
  if (t.artist) bits.push(escapeHTML(t.artist));
  if (o.cid) bits.push(escapeHTML(_plName(o.cid)));
  const tag = t.src === 'file' ? '本机' : t.src === 'qq' ? 'QQ（已下线）' : t.src === 'ncm' ? '网易云' : '';
  if (tag) bits.push(tag);
  return '<div class="pl-row' + (cur ? ' now' : '') + '" data-pl-id="' + escapeHTML(t.id) + '">' +
    '<span class="pl-du">' + (_plDurText(t) || '—') + '</span>' +
    '<span class="pl-tx">' +
    '<span class="pl-nm' + (cur ? ' now' : '') + '">' + escapeHTML(t.name) + '</span>' +
    '<span class="pl-ar">' + bits.join(' · ') + '</span></span>' +
    '<button type="button" class="pl-more" data-pl-menu="' + escapeHTML(t.id) + '" aria-label="这一首还能做什么">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="5" cy="12" r=".6"></circle><circle cx="12" cy="12" r=".6"></circle><circle cx="19" cy="12" r=".6"></circle></svg></button>' +
    '</div>';
}
function _plSecHTML(ti, sub, n) {
  return '<div class="pl-sec"><span class="pl-sec-t">' + escapeHTML(ti) + '</span>' +
    (sub ? '<span class="pl-sec-s">' + escapeHTML(sub) + '</span>' : '') +
    (n ? '<span class="pl-sec-n">' + n + ' 首</span>' : '') + '</div>';
}
function _plEmptyHTML(ti, btn) {
  return '<div class="pl-empty"><span>' + escapeHTML(ti) + '</span>' +
    (btn ? '<button type="button" class="pl-link" ' + btn.attr + '>' + escapeHTML(btn.t) + '</button>' : '') + '</div>';
}
function renderPlNow() {
  const el = document.getElementById('plNow'); if (!el) return;
  const t = plCur();
  el.hidden = false;                       // 卡常驻（用户定档「没有选择音乐，默认就有这个卡片」），空态自说身份
  if (!t) {
    const lib = plTracks().filter(plPlayable).length;
    el.innerHTML = '<div class="pl-now-card is-idle" data-pl-now="1">' +
      '<div class="pl-now-top"><div class="pl-now-av" aria-hidden="true"><span class="pl-now-eq"><i></i><i></i><i></i><i></i><i></i><i></i></span></div>' +
      '<div class="pl-now-tx"><b>还没有选歌</b><small>' + escapeHTML(lib ? lib + ' 首在库 · 从下面挑一首' : '曲库还是空的 · 点右上「添加」收几首进来') + '</small></div>' +
      '<span class="pl-now-tag">待播放</span></div>' +
      '<div class="pl-now-acts"><button type="button" class="pl-ico" disabled aria-label="上一首"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18.5 5.5v13L9 12zM6 5v14"></path></svg></button><button type="button" class="pl-ico pl-now-play" id="plNowIdlePlay" aria-label="开始播放"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4.6 19.5 12 7 19.4z"></path></svg></button><button type="button" class="pl-ico" disabled aria-label="下一首"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 5.5v13L15 12zM18 5v14"></path></svg></button></div>' +
      '<div class="pl-now-prog"><i id="plNowFill"></i></div></div>';
    return;
  }
  const playing = !!(plAudio && !plAudio.paused && !plAudio.ended);
  // 小字带上「谁在陪你听」（#335：悬浮条删了，这个读数不能只住在整屏页里＝关着整屏就没人说这件事）
  const withWho = _plRoot().withCid ? ' · ' + escapeHTML(_plName(_plRoot().withCid)) + ' 在陪你听' : '';
  el.innerHTML = '<div class="pl-now-card" data-pl-now="1">' +
    '<div class="pl-now-top"><div class="pl-now-av" aria-hidden="true"><span class="pl-now-eq"><i></i><i></i><i></i><i></i><i></i><i></i></span></div>' +
    '<div class="pl-now-tx"><b>' + escapeHTML(t.name) + '</b><small>' + escapeHTML(_plSrcLabel(t)) + ' · <span id="plNowCur">0:00</span>' +
    (t.dur ? ' / <span id="plNowLeft">' + _plDur(t.dur) + '</span>' : '') + withWho + '</small></div>' +
    '<span class="pl-now-tag" id="plNowTag">' + (playing ? '播放中' : '已暂停') + '</span></div>' +
    '<div class="pl-now-acts"><button type="button" class="pl-ico" id="plNowPrev" aria-label="上一首"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18.5 5.5v13L9 12zM6 5v14"></path></svg></button><button type="button" class="pl-ico pl-now-play" id="plNowPlay" data-on="0" aria-label="播放或暂停"><svg class="i-play" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4.6 19.5 12 7 19.4z"></path></svg><svg class="i-pause" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 5v14M15 5v14"></path></svg></button><button type="button" class="pl-ico" id="plNowNext" aria-label="下一首"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 5.5v13L15 12zM18 5v14"></path></svg></button></div>' +
    '<div class="pl-now-prog"><i id="plNowFill"></i></div></div>';
}
function renderPlayerPage() {
  const body = document.getElementById('plBody'), tabs = document.getElementById('plTabs');
  if (!body) return;
  const p = _plRoot();
  const sub = document.getElementById('plSub');
  if (sub) {
    const n = plTracks().length, can = plTracks().filter(plPlayable).length, who = p.withCid;
    sub.textContent = n ? (n + ' 首' + (can === n ? '' : ' · ' + can + ' 首能放') + (who ? ' · ' + _plName(who) + ' 在陪你听' : ''))
      : '还没有曲子 · 点右上「添加」';
  }
  if (tabs) tabs.innerHTML = _plTabsHTML(); renderPlNow();
  const tab = plState.tab;
  if (tab === 'find') { renderPlayerFind(); return; }
  if (tab === 'lib') {
    const rows = plTracks().slice().reverse();
    body.innerHTML = (rows.length ? _plSecHTML('曲库', '按添加先后倒过来', rows.length) + rows.map((t, i) => _plRowHTML(t, i)).join('')
      : _plEmptyHTML('曲库还是空的·添几首进来 TA 才有得邀你', { attr: 'data-pl-add="1"', t: '添加歌曲' }));
    return;
  }
  if (tab === 'fav') {
    // 我的与 TA 的并成一面（#335：腾出「发现」那一格；两本仍各是各的账＝chips 只是换看）
    const owners = _plTaOwners();
    if (plState.favWho !== 'mine' && owners.indexOf(plState.favWho) < 0) plState.favWho = 'mine';
    const chips = owners.length ? '<div class="pl-chips">' + [['mine', '我的']].concat(owners.map(id => [id, _plName(id)]))
      .map(x => '<button type="button" class="scope-chip' + (plState.favWho === x[0] ? ' on' : '') + '" data-pl-favwho="' + escapeHTML(x[0]) + '">' + escapeHTML(x[1]) + '</button>').join('') + '</div>' : '';
    if (plState.favWho === 'mine') {
      const rows = (Array.isArray(p.favs) ? p.favs : []).map(plById).filter(Boolean);
      body.innerHTML = chips + (rows.length ? _plSecHTML('我的收藏', '', rows.length) + rows.map((t, i) => _plRowHTML(t, i)).join('')
        : _plEmptyHTML(owners.length ? '「我的」这本还空着·在某一行上点 ⋯ 就能收' : '还没有收藏过一首·在某一行上点 ⋯ 就能收'));
      return;
    }
    const rows = _plTaFav(plState.favWho).map(id => { const t = plById(id); return t ? Object.assign({}, t, { _cid: plState.favWho }) : null; }).filter(Boolean);
    body.innerHTML = chips + (rows.length ? _plSecHTML(_plName(plState.favWho) + ' 收的那本', '', rows.length) +
      rows.map((t, i) => _plRowHTML(t, i, { cid: t._cid })).join('') : _plEmptyHTML('这一本里还没有曲子'));
    return;
  }
  if (tab === 'list') {
    const lists = Array.isArray(p.playlists) ? p.playlists : [];
    if (!lists.length) { body.innerHTML = _plEmptyHTML('还没有歌单', { attr: 'data-pl-newlist="1"', t: '新建歌单' }); return; }
    if (!plState.list || !lists.some(l => l.id === plState.list)) plState.list = lists[0].id;
    const l = lists.find(x => x.id === plState.list);
    const ids = Array.isArray(l.trackIds) ? l.trackIds : [];
    const rows = ids.map(plById).filter(Boolean);
    body.innerHTML = '<div class="pl-chips">' + lists.map(x => '<button type="button" class="scope-chip' + (x.id === l.id ? ' on' : '') +
      '" data-pl-list="' + escapeHTML(x.id) + '">' + escapeHTML(x.name) + '</button>').join('') + '</div>' +
      _plSecHTML(l.name, '', rows.length) +
      (rows.length ? rows.map((t, i) => _plRowHTML(t, i)).join('') : _plEmptyHTML('这一本还空着·在某一首上点 ⋯ 就能收进来'));
    return;
  }
  body.innerHTML = _plRecHTML();
}
function _plRecHTML() {
  const inv = (Array.isArray(_plRoot().invites) ? _plRoot().invites : []).slice(-PL_KEEP_INV).slice().reverse();
  if (!inv.length) return _plEmptyHTML('还没有 TA 邀你听过歌');
  return _plSecHTML('TA 邀你听过', '最近 ' + inv.length + ' 条') + inv.map(v => {
    const t = plById(v.trackId);
    const st = { waiting: '等你回话', yes: '一起听了', switch: '切过去听了', later: '先放一放' }[v.status] || '—';
    return '<div class="pl-rec' + (v.status === 'waiting' ? ' wait' : '') + '" data-pl-inv="' + escapeHTML(v.id) + '">' +
      '<span class="pl-who">' + escapeHTML(_plName(v.cid)) + '</span>' +
      '<span class="pl-nm">' + escapeHTML(t ? t.name : '这首已经不在了') + '</span>' +
      '<span class="pl-stt">' + st + '</span><span class="pl-when">' + _plWhen(v.at) + '</span></div>';
  }).join('');
}
function _plWhen(ts) {
  const n = Number(ts); if (!Number.isFinite(n) || !n) return '';
  const d = new Date(n);
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
}
function renderPlayerFull() {
  const v = document.getElementById('playerFull'); if (!v) return;
  v.hidden = !plState.full;
  if (!plState.full) return;
  const t = plCur(), p = _plRoot();
  const nm = document.getElementById('plfName'), ar = document.getElementById('plfArtist');
  if (nm) nm.textContent = t ? t.name : '还没挑一首';
  if (ar) ar.textContent = t ? ((t.artist ? t.artist + ' · ' : '') + _plSrcLabel(t) + (t.dur ? ' · ' + _plDur(t.dur) : '')) : '在下面挑一首，或点「添加」';
  const md = document.getElementById('plfMode'); if (md) md.textContent = PL_MODE_NAME[p.mode] || '顺序';
  const fq = document.getElementById('plfFav');
  if (fq) fq.dataset.on = (t && Array.isArray(p.favs) && p.favs.indexOf(t.id) >= 0) ? '1' : '0';
  const qn = document.getElementById('plfQueue');
  if (qn) { const n = (Array.isArray(p.queue) ? p.queue : []).length; qn.textContent = n ? '队列 ' + n : '队列空'; qn.hidden = !n; }
  const who = document.getElementById('plfWith');
  if (who) { const w = p.withCid; who.textContent = w ? _plName(w) + ' 正在陪你听' : '还没有人在陪你听·等 TA 邀你'; }
  // 歌词开关（#330）：开着＝封面换下、歌词上；开着且是网易云的歌就当场补取
  const cover = document.querySelector('#playerFull .pl-cover');
  const lrcBox = document.getElementById('plfLrc'), lrcBtn = document.getElementById('plfLrcBtn');
  if (lrcBtn) lrcBtn.dataset.on = plState.lrc ? '1' : '0';
  if (cover) cover.hidden = !!plState.lrc;
  if (lrcBox) lrcBox.hidden = !plState.lrc;
  if (plState.lrc) plLrcEnsure();
  _plPaint();
}
// 音源三路（本机∶直链∶网易云）——每一路都要在屏上说自己是谁，否则「放不出」时不知道该去修哪一路。
// 'qq' 是老档里留下的（QQ 那一档 2026-10-14 下线）：屏上照实标「已下线」，不假装它还能放。
function _plSrcLabel(t) {
  return t.src === 'file' ? '本机文件' : t.src === 'qq' ? 'QQ 音乐（已下线）' : t.src === 'ncm' ? '网易云' : '直链';
}
// 每一次进度刷新只走这一处（卡与整屏两副读数共用＝不留第二份）
function _plPaint() {
  const a = plAudio, t = plCur();
  const cur = a && Number.isFinite(a.currentTime) ? a.currentTime : 0;
  const dur = (a && Number.isFinite(a.duration) && a.duration > 0) ? a.duration : (t && t.dur ? t.dur : 0);
  const pct = dur ? Math.max(0, Math.min(100, cur / dur * 100)) : 0;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('plTimeFull', _plDur(cur) || '0:00');
  set('plNowCur', _plDur(cur) || '0:00');
  set('plLeft', dur ? '-' + _plDur(Math.max(0, dur - cur)) : '');
  set('plNowLeft', dur ? _plDur(dur) : '');   // 卡上右侧给总时长（照 ui1 那张卡 1:24 / 3:58 的读法；负剩余留给整屏那面）
  ['plFillFull', 'plNowFill'].forEach(id => { const el = document.getElementById(id); if (el) el.style.width = pct + '%'; });
  ['plKnobFull'].forEach(id => { const el = document.getElementById(id); if (el) el.style.left = pct + '%'; });
  const playing = !!(a && !a.paused && !a.ended);
  ['plPlayFull', 'plNowPlay'].forEach(id => { const el = document.getElementById(id); if (el) el.dataset.on = playing ? '1' : '0'; });
  const tg = document.getElementById('plNowTag'); if (tg) { tg.textContent = playing ? '播放中' : '已暂停'; tg.classList.toggle('on', playing); }
  _plLrcFollow();
}

/* ===== 四·五、歌词（#330）：只有网易云那一路有歌词可取（公开 meting 的 type=lrc，见 plLrcEnsure）。
   整屏播放页标题栏「歌词」一枚开关：开着＝封面换成可滚的歌词，点一句跳到那句；
   高亮跟 timeupdate 走（_plPaint 末尾那一发），换行才动屏＝不是每次 tick 都滚。 ===== */
let plLrcKey = '', plLrcLines = null, plLrcSay = '', plLrcIdx = -1;
function _plLrcParse(txt) {
  const out = [];
  String(txt || '').split(/\r?\n/).forEach(line => {
    const stamps = line.match(/\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/g);
    if (!stamps) return;
    const body = line.replace(/\[[^\]]*\]/g, '').trim();
    stamps.forEach(m => {
      const q = m.match(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/);
      if (!q) return;
      const t = Number(q[1]) * 60 + Number(q[2]) + (q[3] ? Number((q[3] + '00').slice(0, 3)) / 1000 : 0);
      out.push({ t, txt: body });
    });
  });
  out.sort((a, b) => a.t - b.t);
  return out;
}
// 取过就不重复问（含「这一首没歌词」的空结果＝也记成取过）；换歌（key 变）才再问。
// 歌词是公开数据、不需要身份（#332 二批）：走公开 meting 实例的 type=lrc（实测回裸 LRC 文本、带 CORS；
// 官方 /lyric 没 CORS＝浏览器直连发不出去）。2026-10-14 中转下线后，原先那条「有中转就走 /lyric」的分支一并去掉。
function plLrcEnsure() {
  const t = plCur();
  const key = t && t.src === 'ncm' ? String(t.nid || '') : '';
  if (key === plLrcKey && plLrcLines) return;
  if (!key) { plLrcKey = ''; plLrcLines = []; plLrcSay = t ? '只有网易云的歌有歌词可取' : ''; plLrcIdx = -1; _plLrcPaint(); return; }
  plLrcKey = key; plLrcLines = null; plLrcSay = '正在取歌词…'; plLrcIdx = -1; _plLrcPaint();
  const done = raw => {
    if (plLrcKey !== key) return;
    plLrcLines = _plLrcParse(raw);
    plLrcSay = plLrcLines.length ? '' : '没取到歌词（可能是纯音乐·或接口那会儿抽风）';
    _plLrcPaint();
  };
  _plFetchText(PL_NCM_API + '?server=netease&type=lrc&id=' + encodeURIComponent(key), 12000).then(done);
}
function _plLrcPaint() {
  const box = document.getElementById('plfLrc'); if (!box) return;
  box.innerHTML = (plLrcSay ? '<div class="pl-lrc-say">' + escapeHTML(plLrcSay) + '</div>' : '') +
    (plLrcLines || []).map(l => '<div class="pl-lrc-line" data-lrc-t="' + l.t + '">' + (l.txt ? escapeHTML(l.txt) : '&nbsp;') + '</div>').join('');
  box.scrollTop = 0; plLrcIdx = -1;
}
function _plLrcFollow() {
  if (!plState.lrc || !Array.isArray(plLrcLines) || !plLrcLines.length) return;
  const box = document.getElementById('plfLrc'); if (!box || box.hidden) return;
  const cur = plAudio && Number.isFinite(plAudio.currentTime) ? plAudio.currentTime : 0;
  let i = -1;
  for (let k = 0; k < plLrcLines.length; k++) { if (plLrcLines[k].t <= cur + 0.25) i = k; else break; }
  if (i === plLrcIdx) return;
  plLrcIdx = i;
  const els = box.querySelectorAll('.pl-lrc-line');
  els.forEach((el, k) => el.classList.toggle('on', k === i));
  const el = els[i];
  if (el) box.scrollTop = el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2;
}

/* ===== 五、TA 那六件事（每位自己一套权限） ===== */
// 谁在陪我听：接受邀请那一刻定死，之后曲终那几掷都算在他名下（换人＝重新邀＝重新认一档权限）
function _plWith() { return _plRoot().withCid || ''; }
// TA 动完播放器要不要在聊天里留一行小字——八处播报**只问这一处**（BUGS #340）。
// 八处各写一个 if 必漂（漏一处＝关了还在发；只漏一处＝有的发有的不发，比全发更难查）。
// 关掉后邀请不会丢：它本来就另有一处出口——播放器「发现」那一页「TA 邀你听过」那条列表（等你回话那枚），
// 聊天里那行只是**从聊天进来的那一条路**，路断了门还在。
function _plChatNote(cid, msg) {
  if (!_plCfg(cid).taChatNote) return;
  _deliverToChat(msg, cid);
}
function _plClearTaTimers() {
  if (plTaFavTimer) { clearTimeout(plTaFavTimer); plTaFavTimer = 0; }
  if (plPauseTimer) { clearTimeout(plPauseTimer); plPauseTimer = 0; }
  if (plResumeTimer) { clearTimeout(plResumeTimer); plResumeTimer = 0; }
  plPauseOn = false;
}
// 一首开始播之后排下的两件事：帮你收藏（10~25 秒后掷）、暂停再恢复（同一区间掷，命中就按下去再放开）
function _plScheduleTa(t) {
  if (!t) return;
  const cid = _plWith(); if (!cid) return;               // 没人在听＝TA 替我伸手是凭空，什么都不排
  const cfg = _plCfg(cid), id = t.id;
  if (cfg.taFavProb > 0 && _plTaFav(cid).indexOf(id) < 0) {
    plTaFavTimer = setTimeout(() => {
      plTaFavTimer = 0;
      const a = plAudio;
      if (!a || a.paused || _plRoot().current !== id) return;
      if (Math.random() * 100 >= cfg.taFavProb) return;
      if (plTaFav(cid, id)) {
        _plChatNote(cid, { id: nextId(), from: 'system', text: _plName(cid) + ' 把你正在听的《' + t.name + '》收进了他那本' });
        renderPlayerAll();
      }
    }, 10000 + Math.floor(Math.random() * 15000));
  }
  if (cfg.taPauseEn && plPauseDone !== id) {
    plPauseTimer = setTimeout(() => {
      plPauseTimer = 0;
      if (document.hidden || _plRoot().current !== id) return;
      if (Math.random() * 100 >= PL_TA_PAUSE_PCT) return;
      if (!plPauseByTa()) return;
      plPauseDone = id;
      const a = plAudio; if (a) { try { a.currentTime = Math.max(0, (Number.isFinite(a.currentTime) ? a.currentTime : 0) - 0.05); } catch (e) {} }
      _plChatNote(cid, { id: nextId(), from: 'system', text: _plName(cid) + ' 按了一下暂停' });
      plResumeTimer = setTimeout(() => {
        plResumeTimer = 0;
        if (_plRoot().current !== id) { plPauseOn = false; return; }
        plResumeByTa();
        _plChatNote(cid, { id: nextId(), from: 'system', text: _plName(cid) + ' 又帮你按了播放' });
      }, 3000 + Math.floor(Math.random() * 5000));
    }, 10000 + Math.floor(Math.random() * 15000));
  }
}
// TA 回完一批话 2 秒后这一发（js/chat.js 那一头调）：先掷邀你一起听，没命中再掷预订下一首
function plMaybeRequest(cid) {
  try {
    if (document.hidden) return;
    const c = (data.contacts || []).find(x => x && x.id === cid);
    if (!c || c.kind === 'group') return;                 // 群聊那一轮没有「谁在邀」这个主语（每人各一档，#216），整条链当不存在
    const cfg = _plCfg(cid);
    const list = plTracks().filter(plPlayable);
    if (!cfg.reqProb || !list.length) return;             // 填 0＝这位永不邀；没有放得出的歌就不邀（邀了是一张兑不了的卡）
    const cooling = Date.now() < _plCoolEnd(cid);
    if (!cooling) {
      if (Math.random() * 100 >= cfg.reqProb) return;     // 没命中也不去掷预订：这一次调用只办一件事
      const pick = list[Math.floor(Math.random() * list.length)];
      _plCoolSet(cid);
      plSendInvite(cid, pick.id);
      return;                                             // 邀你已经占掉这一轮（mochi 同一条 return）
    }
    // 在冷却窗里＝这一次不可能再邀，改掷「预订下一首」（也只在真在放歌时才排，凭空排一首是假动作）
    if (!cfg.taReserveProb || !plCur() || !plById(_plRoot().current)) return;
    if (Math.random() * 100 >= cfg.taReserveProb) return;
    const cand = list.filter(x => x.id !== _plRoot().current && (_plRoot().queue || []).indexOf(x.id) < 0);
    if (!cand.length) return;
    const t = cand[Math.floor(Math.random() * cand.length)];
    _plCoolSet(cid);
    _plReserve(cid, t);
  } catch (e) {}
}
function plSendInvite(cid, trackId, manual) {
  const p = _plRoot(), t = plById(trackId);
  if (!t) return false;
  const inv = { id: 'iv' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
    cid, trackId, at: Date.now(), status: 'waiting', manual: !!manual };
  p.invites = (Array.isArray(p.invites) ? p.invites : []).concat([inv]).slice(-PL_KEEP_INV * 2);
  save();
  _plChatNote(cid, { id: nextId(), from: 'system', text: _plName(cid) + ' 想和你一起听《' + t.name + '》· 点开', player: inv.id });
  renderPlayerAll();
  return true;
}
function _plReserve(cid, t) {
  const p = _plRoot();
  p.queue = (Array.isArray(p.queue) ? p.queue : []).concat([t.id]);
  save();
  _plChatNote(cid, { id: nextId(), from: 'system', text: _plName(cid) + ' 预订了下一首：《' + t.name + '》' });
  renderPlayerAll();
}
// 曲终那三掷＝**一发** r 按区间分派（mochi 同一算法）：三格之和就是「TA 会在曲终动手」的总概率，
// 拆成三次独立掷会把总概率偷偷乘起来（15/10/5 三格各自掷＝真加起来是 27.5%＝比屏上写的多）
function plTaAutoAction() {
  const cid = _plWith(); if (!cid) return false;
  const cfg = _plCfg(cid), list = plTracks().filter(plPlayable);
  if (list.length < 2) return false;
  const cur = _plRoot().current;
  const pNext = cfg.taNextProb, pRand = cfg.taRandProb, pMode = cfg.taModeProb;
  const r = Math.random() * 100;
  if (r < pNext) {
    const others = list.filter(x => x.id !== cur);
    const t = others[Math.floor(Math.random() * others.length)]; if (!t) return false;
    _plChatNote(cid, { id: nextId(), from: 'system', text: _plName(cid) + ' 切到了《' + t.name + '》' });
    plLoad(t); return true;
  }
  if (r < pNext + pRand) {
    const t = list[Math.floor(Math.random() * list.length)]; if (!t) return false;
    _plChatNote(cid, { id: nextId(), from: 'system', text: _plName(cid) + ' 随机挑了《' + t.name + '》' });
    plLoad(t); return true;
  }
  if (r < pNext + pRand + pMode) {
    plCycleMode();
    _plChatNote(cid, { id: nextId(), from: 'system', text: _plName(cid) + ' 把播放换成了' + (PL_MODE_NAME[_plRoot().mode] || '顺序') });
    return true;
  }
  return false;
}
function plInviteOf(id) { return (_plRoot().invites || []).find(v => v.id === id) || null; }

/* ===== 六、四面贴底面板 ===== */
function _plMask(id, on) {
  ['plAskMask', 'plAddMask', 'plSetMask', 'plMenuMask'].forEach(m => { const el = document.getElementById(m); if (el && m !== id) el.hidden = true; });
  const el = document.getElementById(id); if (el) el.hidden = !on;
}
function openPlayerInvite(id) {
  const v = plInviteOf(id);
  if (!v) { showToast('这条邀请已经不在了'); return; }
  plInvite = v.id;
  _plInvitePanel(v);
  _plMask('plAskMask', true);
}
function closePlayerInvite() { plInvite = null; _plMask('plAskMask', false); }
function _plInvitePanel(v) {
  const box = document.getElementById('plAskBody'); if (!box) return;
  const t = plById(v.trackId), cur = plCur();
  const who = _plName(v.cid);
  if (v.status !== 'waiting') {
    box.innerHTML = '<div class="pl-ask-hd"><span>' + ({ yes: '你在和 TA 一起听', switch: '你切过去听了', later: '先放一放' }[v.status] || '这一条已经答过了') + '</span><i>Answered</i></div>' +
      '<div class="pl-song">' + _plNoteSvg() + '<span class="pl-tx"><span class="pl-nm">' + escapeHTML(t ? t.name : '这首已经不在了') + '</span>' +
      '<span class="pl-ar">' + escapeHTML(who) + ' 那天起的头 · ' + _plWhen(v.at) + '</span></span></div>' +
      '<div class="pl-note">答过一次就定了，这一条不再改。</div>';
    return;
  }
  const noSong = t ? '' : ' disabled';
  box.innerHTML = '<div class="pl-ask-hd"><span>想和你一起听</span><i>Player invite</i></div>' +
    '<div class="pl-song">' + _plNoteSvg() + '<span class="pl-tx"><span class="pl-nm">' + escapeHTML(t ? t.name : '这首已经不在了') + '</span>' +
    '<span class="pl-ar">' + escapeHTML(t ? ((t.artist ? t.artist + ' · ' : '') + (t.dur ? _plDur(t.dur) : '')) : '') + '</span>' +
    '<span class="pl-ar">' + escapeHTML(who) + (cur && t && cur.id !== t.id ? ' · 你正在播另一首' : cur && t && cur.id === t.id ? ' · 正在播这一首' : '') + '</span></span></div>' +
    '<div class="pl-acts"><button type="button" class="pl-btn pri" data-pl-ask="yes"' + noSong + '>一起听</button>' +
    '<button type="button" class="pl-btn" data-pl-ask="switch"' + noSong + '>切过去</button>' +
    '<button type="button" class="pl-btn" data-pl-ask="later">先放一放</button></div>' +
    '<div class="pl-note">「一起听」＝这一首起，曲终那几掷都算在 ' + escapeHTML(who) + ' 名下；「先放一放」不算拒绝也不放歌。这一条记进「记录」。</div>';
}
function _plNoteSvg() {
  return '<span class="pl-cv"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg></span>';
}
function plAnswerInvite(kind) {
  const v = plInvite && plInviteOf(plInvite);
  if (!v || v.status !== 'waiting') return;
  const t = plById(v.trackId);
  // 两枚按钮各做一件事，不许长得像而干得一样：
  //   一起听＝不打断你正在播的那首，把 TA 这首排进队列（没在播时才当场放）
  //   切过去＝立刻播 TA 这一首（全站只有一枚 Audio，切走原来的＝不会出现两层声音叠着放）
  if ((kind === 'yes' || kind === 'switch') && t) {
    _plRoot().withCid = v.cid;
    if (kind === 'switch' || !_plRoot().current) plLoad(t);
    else plQueueNext(v.trackId);
  }
  v.status = kind;
  save();
  closePlayerInvite();
  renderPlayerAll();
}
function openPlayerAdd() {
  const box = document.getElementById('plAddBody');
  if (box) box.innerHTML =
    '<div class="pl-set-row" data-pl-act="gosearch"><span class="pl-tx"><b>搜一首加进来</b><small>在第一格「发现」那一面·点这里过去</small></span><span class="pl-chev">›</span></div>' +
    '<div class="pl-set-lab">贴一条链接<span>网易云歌单或单曲 ∶ 音频直链</span></div>' +
    '<textarea class="pl-in" id="plPaste" rows="3" spellcheck="false" placeholder="一行一条，可以一次贴好几条"></textarea>' +
    '<div class="pl-acts"><button type="button" class="pl-btn pri" data-pl-act="paste">识别并添加</button></div>' +
    '<div class="pl-set-row" data-pl-act="file"><span class="pl-tx"><b>从这台设备选音频文件</b><small>字节存在本机·不进备份；一次可多选</small></span><span class="pl-chev">›</span></div>' +
    '<div class="pl-add-log" id="plAddLog"></div>' +
    '<div class="pl-note">认得出∶收进来∶取不到，每一行都写在下面这一栏里——不悄悄丢掉任何一条。</div>';
  _plMask('plAddMask', true);
}
function closePlayerAdd() { _plMask('plAddMask', false); }
/* 认链接：四路里除「本机文件」外都从这一处判（判完只回一个形状，取不取得到归上层的读数说）。
   短链接刻意不做：网易云那种要先跟着跳一次才拿到号码，得借第三方代理站，挂了会伪装成「这一单没有歌」＝一句假话，
   所以认出来就照实说，让用户去浏览器里打开后复制地址栏那条完整链接。 */
function _plGuess(line) {
  const s = String(line || '').trim();
  if (!s) return null;
  if (/163cn\.tv/i.test(s)) return { kind: 'no', why: '这是网易云的短链接·要再跳一次才拿得到号码，请打开它之后把地址栏那条完整链接贴进来' };
  if (/163\.com|netease/i.test(s) || /^\d{5,13}$/.test(s)) {
    const m = s.match(/playlist[\/?#&!=]*(?:id=)?(\d{4,})/i) || s.match(/[?&]id=(\d{4,})/) || s.match(/\/(?:song|poollist)\/(\d{4,})/i);
    const id = m ? m[1] : (/^\d{5,13}$/.test(s) ? s : '');
    if (!id) return { kind: 'no', why: '网易云链接里没找到号码（歌单或单曲的完整地址都行）' };
    return { kind: 'ncm', id, as: /playlist/i.test(s) ? 'list' : 'song' };
  }
  // QQ 链接单独拦一句（2026-10-14）：那一档随中转下线，不拦就会被下面那行当「音频直链」收进来＝收一首永远放不出的歌
  if (/y\.qq\.com|qqmusic/i.test(s)) {
    return { kind: 'no', why: 'QQ 音乐这一档已经下线了（中转地址那一格删掉了）·请换网易云链接或音频直链' };
  }
  return /^https?:\/\//i.test(s) ? { kind: 'url', id: s } : { kind: 'no', why: '认不出这一行（网易云歌单∶单曲∶音频直链，一行一条）' };
}
function _plHash(s) {
  let h = 0; const x = String(s);
  for (let i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
// 取文本只有一条路：超时∶HTTP 非 2xx∶抛错全回空串，由调用方那句「没取到清单」去说后果（不留三种失败形状）
function _plFetchText(url, ms) {
  return new Promise(resolve => {
    let done = false;
    const fin = () => { if (!done) { done = true; clearTimeout(timer); resolve(''); } };
    let controller = null; try { controller = new AbortController(); } catch (e) {}
    const timer = setTimeout(() => { try { controller && controller.abort(); } catch (e) {} fin(); }, ms || 14000);
    fetch(url, controller ? { signal: controller.signal } : undefined)
      .then(r => (r && r.ok) ? r.text() : '')
      .then(t => { if (!done) { done = true; clearTimeout(timer); resolve(typeof t === 'string' ? t : ''); } })
      .catch(fin);
  });
}
// meting 的歌单与单曲两种回包是同一个形状（一个数组∶每一项带 name/artist 和一个含 id 的声音地址）
function _plMetingList(txt) {
  let j = null; try { j = JSON.parse(String(txt || '')); } catch (e) { return []; }
  if (!Array.isArray(j)) return [];
  return j.map(t => {
    if (!t || typeof t !== 'object') return null;
    const m = String(t.url || '').match(/[?&]id=(\d{4,})/);
    const nid = m ? m[1] : String(t.id || '');
    if (!/^\d+$/.test(nid)) return null;
    return { nid, name: String(t.name || t.title || '').trim(), artist: String(t.artist || t.author || '').trim() };
  }).filter(Boolean);
}
async function plAddPaste(text) {
  const log = document.getElementById('plAddLog');
  const btn = document.querySelector('#plAddMask [data-pl-act="paste"]');
  const lines = String(text || '').split(/\r?\n/).map(s => String(s).trim()).filter(Boolean);
  const row = msg => { if (!log) return null; const d = document.createElement('div'); d.textContent = msg; log.appendChild(d); return d; };
  const say = (d, msg, bad) => { if (!d) return; d.textContent = msg; if (bad) d.className = 'bad'; };
  if (!lines.length) { row('先贴一条链接，再按「识别并添加」'); return; }
  if (btn) { btn.disabled = true; btn.textContent = '正在取…'; }
  let added = 0;
  for (let i = 0; i < lines.length; i++) {
    const g = _plGuess(lines[i]);
    const d = row(g && g.kind === 'ncm' ? (g.as === 'list' ? '网易云歌单 ' : '网易云单曲 ') + g.id + ' · 正在取清单' : '在看这一行…');
    if (!g || g.kind === 'no') { say(d, g && g.why ? g.why : '认不出这一行', true); continue; }
    if (g.kind === 'ncm') {
      // 两路：填了自己那台接口＝先问账号那一路（带时长、私密歌单也取得到），取不到或没填再退公开 meting。
      // 两条都要联网；meting 那台 injahow 只认 url/playlist/song（同一形状，一个解析器就够）。
      let songs = _plNcmApi() ? await _plNcmList(g) : [];
      if (!songs.length) {
        const url = PL_NCM_API + '?server=netease&type=' + (g.as === 'list' ? 'playlist' : 'song') + '&id=' + encodeURIComponent(g.id);
        songs = _plMetingList(await _plFetchText(url, 14000));
      }
      let got = 0, dup = 0;
      songs.forEach(s => {
        const id = 'ncm' + s.nid;
        if (plById(id)) { dup++; return; }
        got++; added++;
        _plPushTrack({ id, nid: s.nid, name: s.name || ('网易云 ' + s.nid), artist: s.artist, src: 'ncm', dur: Number(s.dur) || 0, added: Date.now() });
      });
      // 三种读法分开说：收了几个∶一个也不许多（都在这本里＝不是失败）∶压根没取到清单（这一路要联网）
      say(d, got ? '收了 ' + got + ' 首' + (dup ? '·' + dup + ' 首已经有了' : '')
        : songs.length ? '这一单里的歌都在这本里了'
        : '没取到清单（这一路要联网，或那一单是私有的）', !got && !songs.length);
      continue;
    }
    const lid = 'lk' + _plHash(g.id);
    if (plById(lid)) { say(d, '这条直链已经在了'); continue; }
    _plPushTrack({ id: lid, name: decodeURIComponent((g.id.split('/').pop() || '未命名').split('?')[0]).slice(0, 60) || '未命名',
      artist: '', src: g.id, dur: 0, added: Date.now() });
    added++; say(d, '收了（直链）');
  }
  if (btn) { btn.disabled = false; btn.textContent = '识别并添加'; }
  renderPlayerAll();
}
// 权限面板：顶部选人（含「默认」那一档），下面全走 PL_PERMS，并按那格身上的 sec 分成两节
// （没 sec＝TA 的主动行为；sec:'chat'＝聊天里说一声）＝一张表两个组，不另写第二个行渲染器；
// 每格一次只管一位（不静默写别人）
function openPlayerSettings(cid) {
  if (cid) plState.perm = cid;
  if (!plState.perm) plState.perm = '__base';
  renderPlayerSettings();
  _plNcmSyncProfile(false).then(() => renderPlayerSettings());
  _plMask('plSetMask', true);
}
function closePlayerSettings() { _plMask('plSetMask', false); }
function renderPlayerSettings() {
  const box = document.getElementById('plSetBody'); if (!box) return;
  const who = plState.perm || '__base';
  const chips = [['__base', '默认']].concat(_plSingles().map(c => [c.id, fixedNameOf(c) || c.name || c.id]))
    .map(x => '<button type="button" class="scope-chip' + (who === x[0] ? ' on' : '') + '" data-pl-permwho="' + escapeHTML(x[0]) + '">' + escapeHTML(x[1]) + '</button>').join('');
  const cfg = who === '__base' ? _plClampPerms(Object.assign({}, _plRoot().settings)) : _plCfg(who);
  const own = who !== '__base' && !!((data.playerBy || {})[who]);
  box.innerHTML =
    '<div class="pl-set-lab">TA 的主动行为<span>' + (who === '__base' ? '按人各存·没调过的人用「默认」' : '正在改「' + fixedNameOf((data.contacts || []).find(c => c && c.id === who)) + '」自己那套') + '</span></div>' +
    '<div class="pl-chips">' + chips + '</div>' +
    PL_PERMS.filter(p => !p.sec).map(p => _plPermRow(p, cfg[p.k], own)).join('') +
    '<div class="pl-set-lab">聊天里说一声<span>这一格管的是「吭不吭声」，不是「做不做」</span></div>' +
    PL_PERMS.filter(p => p.sec === 'chat').map(p => _plPermRow(p, cfg[p.k], own)).join('') +
    // 2026-10-14：原先这一组叫「音源」、下面挂着网易云账号／网易云中转地址／QQ 音乐中转地址／QQ 音乐账号四行。
    // 用户「把登录 QQ 音乐和中转相关的设置删掉」＝那三行整行下线，只剩「网易云账号」一行。
  //   #440 二批补回一格「网易云接口地址」（那是昵称∶日推∶我的歌单唯一的出口，与 QQ∶那台局域网服务无关）＝这一组两行。
    '<div class="pl-set-lab">账号<span>全局一份·与按人无关</span></div>' +
    '<div class="pl-set-row" data-pl-act="ncm"><span class="pl-tx"><b>网易云账号</b><small>' +
    (_plNcmLogged() ? '已登录' + (_plNcmName() ? ' · ' + escapeHTML(_plNcmName()) : '') + '（点开可退出）' : '未登录·只放免费音质（点开可登录）') +
    '</small></span><span class="pl-chev">' + (_plNcmLogged() ? '›' : '登录') + '</span></div>' +
    // #440：接口地址这一格也在这组露一面（它原先只住在账号面板与「发现」那一节的行里＝找它要点两层）
    '<div class="pl-set-row" data-pl-act="ncmapi"><span class="pl-tx"><b>网易云接口地址</b><small>' +
    escapeHTML(_plNcmApi() || '没填·走公开那台实例（要日推与自己的歌单就得有一台答话的接口）') +
    '</small></span><span class="pl-chev">填</span></div>' +
    '<div class="pl-set-lab">危险区<span>清了找不回</span></div>' +
    '<div class="pl-set-row danger" data-pl-act="wipe"><span class="pl-tx"><b>清空曲库</b><small>歌单与收藏一起清·正在播的会停下' +
    (plDelConfirm ? ' —— 再点一次就清' : '') + '</small></span><span class="pl-chev">' + (plDelConfirm ? '确认' : '›') + '</span></div>';
}
function _plPermRow(p, v, own) {
  const val = p.bool ? (v ? 1 : 0) : Number(v);
  const tag = p.bool ? 'label' : 'div';
  return '<' + tag + ' class="pl-perm' + (p.bool ? ' pl-perm-sw' : '') + '" data-pl-perm="' + p.k + '">' +
    '<span class="pl-perm-t"><b>' + escapeHTML(p.t) + '</b>' + (own ? '<em>已单独设过</em>' : '') + '<small>' + escapeHTML(p.hint) + '</small></span>' +
    (p.bool
      ? '<input type="checkbox" class="pl-perm-in" data-pl-perm-in="' + p.k + '"' + (val ? ' checked' : '') + '>'
      : '<span class="pl-num"><button type="button" class="stp-min" data-pl-step="-1" aria-label="调小">−</button>' +
        '<input type="text" inputmode="numeric" class="pl-num-in" data-pl-perm-in="' + p.k + '" value="' + val + '" min="' + p.min + '" max="' + p.max + '" step="1">' +
        '<button type="button" class="stp-max" data-pl-step="1" aria-label="调大">＋</button>' +
        (p.u ? '<em>' + escapeHTML(p.u) + '</em>' : '') + '</span>') + '</' + tag + '>';
}
function _plPermWrite(k, v) {
  const who = plState.perm || '__base';
  const patch = {}; patch[k] = v;
  if (who === '__base') { Object.assign(_plRoot().settings, patch); _plClampPerms(_plRoot().settings); save(); }
  else _plCfgSet(who, patch);
  renderPlayerSettings();
  renderPlayerAll();
}
function openPlayerMenu(id) {
  const t = plById(id); if (!t) return;
  const p = _plRoot();
  const faved = Array.isArray(p.favs) && p.favs.indexOf(id) >= 0;
  const lists = Array.isArray(p.playlists) ? p.playlists : [];
  const box = document.getElementById('plMenuBody'); if (!box) return;
  plMenu = id;
  box.innerHTML = '<div class="pl-song">' + _plNoteSvg() + '<span class="pl-tx"><span class="pl-nm">' + escapeHTML(t.name) + '</span>' +
    '<span class="pl-ar">' + escapeHTML((t.artist ? t.artist + ' · ' : '') + _plSrcLabel(t) + (t.dur ? ' · ' + _plDur(t.dur) : '')) + '</span></span></div>' +
    '<div class="pl-set-row" data-pl-act="queue"><span class="pl-tx"><b>下一首播</b><small>排进队列·' + ((p.queue || []).length ? '现在 ' + (p.queue || []).length + ' 首待发' : '队列现在是空的') + '</small></span><span class="pl-chev">›</span></div>' +
    '<div class="pl-set-row" data-pl-act="fav"><span class="pl-tx"><b>' + (faved ? '取消收藏' : '收藏这一首') + '</b><small>' + (faved ? '从「收藏」那一面拿掉' : '进我自己的那一本') + '</small></span><span class="pl-chev">›</span></div>' +
    '<div class="pl-set-row" data-pl-act="invite"><span class="pl-tx"><b>邀 TA 一起听</b><small>' + (_plSingles().length ? '点开挑一位·把这一首送到他那一本会话里' : '还没有可邀的人') + '</small></span><span class="pl-chev">›</span></div>' +
    (lists.length ? '<div class="pl-set-lab">收进哪一本</div>' + lists.map(l => '<div class="pl-set-row' +
      (Array.isArray(l.trackIds) && l.trackIds.indexOf(id) >= 0 ? ' on' : '') + '" data-pl-act="tolist" data-pl-to="' + escapeHTML(l.id) + '"><span class="pl-tx"><b>' +
      escapeHTML(l.name) + '</b><small>' + (Array.isArray(l.trackIds) && l.trackIds.indexOf(id) >= 0 ? '已经在这本里' : '这本里有 ' + (Array.isArray(l.trackIds) ? l.trackIds.length : 0) + ' 首') + '</small></span><span class="pl-chev">›</span></div>').join('') : '') +
    '<div class="pl-set-row danger" data-pl-act="del"><span class="pl-tx"><b>从曲库删掉</b><small>' + (t.src === 'file' ? '本机字节一起删' : '只删这一条记录') + '</small></span><span class="pl-chev">›</span></div>';
  _plMask('plMenuMask', true);
}
// 「邀谁」＝就地换成一排人名 chips（一次点一下达），不另开第二层弹层＝一件小事不给两副壳
function plInvitePick() {
  const box = document.getElementById('plMenuBody'), id = plMenu, t = plById(id);
  const cs = _plSingles();
  if (!box || !t || !cs.length) return;
  box.innerHTML = '<div class="pl-set-lab">邀谁一起听这一首</div>' +
    '<div class="pl-song">' + _plNoteSvg() + '<span class="pl-tx"><span class="pl-nm">' + escapeHTML(t.name) + '</span></span></div>' +
    '<div class="pl-chips">' + cs.map(c => '<button type="button" class="scope-chip" data-pl-invto="' + escapeHTML(c.id) + '">' +
      escapeHTML(fixedNameOf(c) || c.name || c.id) + '</button>').join('') + '</div>' +
    '<div class="pl-note">送出去＝他那一本会话里多一行小字，他答不答都在他手上。</div>' +
    '<button type="button" class="pl-link" data-pl-act="back">回去</button>';
}
function closePlayerMenu() { plMenu = null; _plMask('plMenuMask', false); }

/* ===== 七、添加与整理 ===== */
function plAddFiles(files) {
  const list = (files || []).slice(0, 20);
  if (!list.length) return;
  let done = 0, added = 0;
  const over = (files || []).length - list.length;
  const one = f => {
    const name = String(f.name || '未命名');
    if (f.size > PL_FILE_MAX) { done++; if (done === list.length) _plAddEnd(added, over); return; }
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = String(r.result || '');
      const id = 'tr' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
      const fid = 'f' + id;
      const put = window.idbSet ? window.idbSet(PL_FILE_KEY + fid, dataUrl) : Promise.reject(new Error('no idb'));
      Promise.resolve(put).then(() => {
        added++;
        _plPushTrack({ id, name: name.replace(/\.[a-z0-9]{2,5}$/i, ''), artist: '', src: 'file', fid, dur: 0, added: Date.now() });
        if (done++ >= list.length - 1) { _plAddEnd(added, over); renderPlayerAll(); }
      }).catch(() => { if (done++ >= list.length - 1) _plAddEnd(added, over); });
    };
    r.onerror = () => { if (done++ >= list.length - 1) _plAddEnd(added, over); };
    r.readAsDataURL(f);
  };
  list.forEach(one);
}
function _plAddEnd(n, over) {
  renderPlayerAll();
  const msg = n ? '本机文件收了 ' + n + ' 首' + (over ? '·多出的 ' + over + ' 个没收（一次最多 20 个）' : '') : '这些都没能收进来（太大或读不出来）';
  // 面板开着就写进同一栏（与贴链接那一路同一个读数口径），已经关了才只剩 toast 这一条路
  const mask = document.getElementById('plAddMask'), log = document.getElementById('plAddLog');
  if (mask && log && !mask.hidden) { const d = document.createElement('div'); d.textContent = msg; log.appendChild(d); }
  else showToast(msg);
}
function plNewList() {
  window.openModal('新歌单叫什么', '', v => {
    const name = String(v || '').trim();
    if (!name) return;
    const p = _plRoot();
    if (!Array.isArray(p.playlists)) p.playlists = [];
    const l = { id: 'pl' + Date.now().toString(36), name, trackIds: [], created: Date.now() };
    p.playlists.push(l); plState.list = l.id; save();
    renderPlayerAll();
  });
}
function plToggleFav(id) {
  const p = _plRoot();
  if (!Array.isArray(p.favs)) p.favs = [];
  const i = p.favs.indexOf(id);
  if (i >= 0) p.favs.splice(i, 1); else p.favs.unshift(id);
  save();
  renderPlayerAll();
  return i < 0;
}
function plAddToList(listId, trackId) {
  const p = _plRoot();
  const l = (Array.isArray(p.playlists) ? p.playlists : []).find(x => x.id === listId);
  if (!l) return;
  if (!Array.isArray(l.trackIds)) l.trackIds = [];
  if (l.trackIds.indexOf(trackId) >= 0) l.trackIds = l.trackIds.filter(x => x !== trackId);
  else l.trackIds.push(trackId);
  save();
  renderPlayerAll();
}
function plQueueNext(id) {
  const p = _plRoot();
  if (!Array.isArray(p.queue)) p.queue = [];
  if (p.queue.indexOf(id) < 0) p.queue.push(id);
  save();
  renderPlayerAll();
}
function plWipeLibrary() {
  const p = _plRoot();
  const ids = new Set(plTracks().map(t => t.fid).filter(Boolean));
  p.tracks = []; p.playlists = []; p.favs = []; p.queue = []; p.current = '';
  _plStopAudio();
  if (window.idbDelete) ids.forEach(fid => window.idbDelete(PL_FILE_KEY + fid).catch(() => {}));
  save();
  renderPlayerAll();
  renderPlayerSettings();
}

/* ===== 八、入口与委托（一处绑，全站一份） ===== */
function bindPlayerOnce() {
  if (plBound) return;
  plBound = true;
  document.addEventListener('click', e => {
    const hit = sel => e.target.closest ? e.target.closest(sel) : null;
    const tab = hit('[data-pl-tab]');
    if (tab) { plState.tab = tab.dataset.plTab; renderPlayerPage(); return; }
    const tawho = hit('[data-pl-favwho]');
    if (tawho) { plState.favWho = tawho.dataset.plFavwho; renderPlayerPage(); return; }
    const lst = hit('[data-pl-list]');
    if (lst) { plState.list = lst.dataset.plList; renderPlayerPage(); return; }
    const who = hit('[data-pl-permwho]');
    if (who) { plState.perm = who.dataset.plPermwho; renderPlayerSettings(); return; }
    const menu = hit('[data-pl-menu]');
    if (menu) { e.stopPropagation(); openPlayerMenu(menu.dataset.plMenu); return; }
    const ask = hit('[data-pl-ask]');
    if (ask && !ask.disabled) { plAnswerInvite(ask.dataset.plAsk); return; }
    const invto = hit('[data-pl-invto]');
    if (invto) { if (plMenu && plSendInvite(invto.dataset.plInvto, plMenu, true)) closePlayerMenu(); return; }
    const act = hit('[data-pl-act]');
    if (act) { _plAct(act.dataset.plAct, act); return; }
    const perm = hit('[data-pl-perm-in]');
    if (perm) return;                                   // 数字框与开关自己管 change
    const step = hit('[data-pl-step]');
    if (step) {
      const row = step.closest('.pl-perm'); const inp = row && row.querySelector('[data-pl-perm-in]');
      if (row && inp) { const k = inp.dataset.plPermIn; const cell = PL_PERMS.find(x => x.k === k);
        if (cell) { const n = Math.max(cell.min, Math.min(cell.max, (Number(inp.value) || cell.d) + (Number(step.dataset.plStep) || 0)));
          inp.value = n; _plPermWrite(k, n); } }
      return;
    }
    // 整屏那三枚键与播放条那枚键都要排在「整条可点」之前判：它们是 dock/full 的后代，
    // 先问祖先＝点播放变成展开整屏（本仓「一枚记号两个意思」那一族）
    const idlePlay = hit('#plNowIdlePlay');   // 空态卡那枚键：有可播的＝照模式掷一首开播（顺序模式即曲库第一首），曲库空＝开添加面板
    if (idlePlay) { if (plTracks().some(plPlayable)) plNext(false); else openPlayerAdd(); return; }
    if (hit('#plPlay') || hit('#plPlayFull') || hit('#plNowPlay')) { plToggle(); return; }
    if (hit('#plNextBtn') || hit('#plNowNext')) { plNext(false); return; }
    if (hit('#plPrevBtn') || hit('#plNowPrev')) { plPrev(); return; }
    if (hit('[data-pl-now]')) { plOpenFull(true); return; }
    if (hit('#plFullClose') || hit('#plfBack')) { plOpenFull(false); return; }
    if (hit('#plfMode')) { plCycleMode(); renderPlayerFull(); return; }
    if (hit('#plfLrcBtn')) { plState.lrc = !plState.lrc; renderPlayerFull(); return; }
    // 歌词那句：点一行跳到那一句（seek 走现成的那枚 Audio，不另起第二份播放逻辑）
    const lrcl = hit('[data-lrc-t]');
    if (lrcl) { const a = plAudio, tt = Number(lrcl.dataset.lrcT); if (a && Number.isFinite(tt)) { try { a.currentTime = tt; } catch (e2) {} } return; }
    if (hit('#plfFav')) { const c = plCur(); if (c) plToggleFav(c.id); renderPlayerFull(); return; }
    if (hit('#plPermBtn')) { openPlayerSettings(); return; }
    if (hit('#plAddBtn') || hit('[data-pl-add]')) { openPlayerAdd(); return; }
    if (hit('#plNcmClose')) { closePlayerNcm(); plDelConfirm = 0; return; }
    if (hit('#plSetClose') || hit('#plAddClose') || hit('#plAskClose') || hit('#plMenuClose')) { _plMask('', false); plDelConfirm = 0; return; }
    const inv = hit('[data-pl-inv]');
    if (inv) { openPlayerInvite(inv.dataset.plInv); return; }
    const row = hit('.pl-row');
    if (row && row.dataset.plId) { plPlayId(row.dataset.plId); renderPlayerFull(); return; }
    if (e.target.classList && e.target.classList.contains('fs-sheet-mask')) { _plMask('', false); plDelConfirm = 0; }
  }, true);
  document.addEventListener('change', e => {
    const inp = e.target.closest ? e.target.closest('[data-pl-perm-in]') : null;
    if (!inp) return;
    const k = inp.dataset.plPermIn, cell = PL_PERMS.find(x => x.k === k); if (!cell) return;
    _plPermWrite(k, cell.bool ? (inp.checked ? 1 : 0) : inp.value);
  });
  // 搜歌那枚输入框：回车＝按「搜索」（面板里就一枚键，多一步点它没必要）
  document.addEventListener('keydown', e => {
    if (!e.target || e.target.id !== 'plSearchKw') return;
    if (e.key !== 'Enter') return;
    e.preventDefault();
    Promise.resolve(plNcmSearch(e.target.value)).catch(() => {});
  });
}
function _plAct(kind, el) {
  const p = _plRoot();
  if (kind === 'file') {
    window.mochiFilePick({ id: 'player', accept: 'audio/*', multiple: true, onFiles: fs => plAddFiles(fs) });
    return;
  }
  if (kind === 'paste') {
    const el = document.getElementById('plPaste');
    Promise.resolve(plAddPaste(el ? el.value : '')).catch(() => {});   // 面板开着时它自己把每一行的结果写进那一栏
    return;
  }
  if (kind === 'newlist') { plNewList(); return; }
  // 「中转地址」（relay／ncmrelay）与「QQ 音乐账号」（qqlogin）三个分支 2026-10-14 整条删掉：
  // 那三行设置连同它们的弹层一起下线（用户定档），不留一枚没有宿主的派发口。
  if (kind === 'ncm') { openPlayerNcm(); return; }
  if (kind === 'ncmapi') { plNcmApiSet(); return; }
  if (kind === 'ncmdailyrefresh') { plNcmDailyLoad(); return; }
  if (kind === 'ncmlistsrefresh') { plNcmListsLoad(); return; }
  if (kind === 'ncmqr') { plNcmQrStart(); return; }
  if (kind === 'ncmout') { plNcmLogout(); return; }
  if (kind === 'gosearch') {
    closePlayerAdd(); plState.tab = 'find'; renderPlayerPage();
    setTimeout(() => { const i = document.getElementById('plSearchKw'); if (i) i.focus(); }, 80);
    return;
  }
  if (kind === 'ncmplay') {
    // 日推那一行：不在库就顺手收进曲库，然后立刻放这一首（播着听才是日推的用法）
    const nid = String(el.dataset.nid || '');
    if (!nid) return;
    const id = 'ncm' + nid;
    if (!plById(id)) _plPushTrack({ id, nid, name: String(el.dataset.nm || '').trim() || ('网易云 ' + nid),
      artist: String(el.dataset.ar || '').trim(), src: 'ncm', dur: Number(el.dataset.du) || 0, added: Date.now() });
    plPlayId(id);
    renderPlayerAll();
    return;
  }
  if (kind === 'ncmimport') {
    Promise.resolve(plNcmImport(String(el.dataset.pid || ''), String(el.dataset.pnm || ''))).catch(() => {});
    return;
  }
  if (kind === 'ncmsearch') {
    const kw = document.getElementById('plSearchKw');
    Promise.resolve(plNcmSearch(kw ? kw.value : '')).catch(() => {});
    return;
  }
  if (kind === 'ncmcookie') {
    window.openModal('网易云 Cookie（MUSIC_U 的值）', _plNcmCookie(), v => {
      const s = String(v || '').trim().replace(/^MUSIC_U=/i, '');
      if (s && !/^[A-Za-z0-9%._-]+$/.test(s)) { showToast('只贴 MUSIC_U 那一串值本身，别把整段 Cookie 一起贴进来'); return; }
      p.ncmCookie = s; save(); renderPlayerSettings(); renderPlayerAll();
      if (plState.ncm) renderPlayerNcm();
      // #330：手填这条路存完票据必须当场问一次登录态——成功带昵称念出来，失败也说实话（cookie 过期？接口没答上？），
      // 不许像旧版那样只存不问＝面板永远「已登录」却不知道登的是谁。
      if (!s) { _plNcmResetMine(); showToast('清空了＝已退出网易云'); return; }
      _plNcmResetMine();
      _plNcmSyncProfile(true).then(pf => {
        renderPlayerNcm(); renderPlayerSettings(); renderPlayerAll();
        showToast(pf && pf.nickname ? '网易云登录成功 · ' + pf.nickname
          : plNcmSayWhy === 'down' ? '票据存了·但那台接口没答上（不是 cookie 失效；点「网易云接口地址」换一台或过一会儿再试）'
            : '票据存了·接口答了但取不到账号信息＝cookie 过期了，重新复制一份 MUSIC_U');
      });
    }, { staticText: '拿法：电脑浏览器登录 music.163.com → F12（右键·检查）→ 应用 / Application → Cookies → music.163.com → 复制 MUSIC_U 那一行的值。只填值本身；填了会员歌放完整版，不填也能放免费歌；想退出登录就把这里清空按确定。' });
    return;
  }
  if (kind === 'wipe') {
    if (!plDelConfirm) { plDelConfirm = Date.now(); renderPlayerSettings(); setTimeout(() => { if (plDelConfirm && Date.now() - plDelConfirm > 2400) { plDelConfirm = 0; renderPlayerSettings(); } }, 2500); return; }
    plDelConfirm = 0; plWipeLibrary(); return;
  }
  if (kind === 'queue' && plMenu) { plQueueNext(plMenu); closePlayerMenu(); return; }
  if (kind === 'fav' && plMenu) { plToggleFav(plMenu); closePlayerMenu(); return; }
  if (kind === 'del' && plMenu) { const id = plMenu; closePlayerMenu(); plRemoveTrack(id); return; }
  if (kind === 'tolist' && plMenu && el.dataset.plTo) { plAddToList(el.dataset.plTo, plMenu); closePlayerMenu(); return; }
  if (kind === 'back') { if (plMenu) openPlayerMenu(plMenu); return; }
  if (kind === 'invite' && plMenu) {
    if (!_plSingles().length) { showToast('还没有可邀的人'); return; }
    plInvitePick();
    return;
  }
}
function plOpenFull(on) {
  plState.full = !!on;
  renderPlayerFull();
}
// 首页/别的面不常驻：只在播放器页与整屏那面处理进度拖动
function plBindSeek(id, trackEl) {
  const el = document.getElementById(id); if (!el || el.dataset.plBound) return;
  el.dataset.plBound = '1';
  const ratio = ev => {
    const r = (trackEl || el).getBoundingClientRect();
    if (!r.width) return 0;
    const x = (ev.touches && ev.touches[0] ? ev.touches[0].clientX : ev.clientX) - r.left;
    return Math.max(0, Math.min(1, x / r.width));
  };
  el.addEventListener('pointerdown', ev => { el.setPointerCapture && el.setPointerCapture(ev.pointerId); plSeekRatio(ratio(ev)); });
  el.addEventListener('pointermove', ev => { if (ev.buttons) plSeekRatio(ratio(ev)); });
}

/* 一处绑、一次绑（与 js/cardfit.js 同一写法：document 一直在，脚本按 assemble 顺序在 body 末尾求值）。
   这里**不**调 renderPlayerAll()：那一发要读 data，而 data 是 app.js 里 await load() 之后才有的，
   在求值那一刻渲染＝读到空对象再把整页刷空（本仓「启动竞态」那一族）。进页时由 settings.js 的 showView 钩子画。 */
bindPlayerOnce();
plBindSeek('plProgFull');
