// ===== 存储（设置 → 数据 → 存储）=====
// 本站存储占用的唯一宿主。原有两处体积读数（诊断页那六档、数据卡那句
// 「数据体积约」）都改成引这里的同一把尺子，不留第二份实现。
// 口径：逐项按序列化字节自算；总占用引 navigator.storage.estimate()——浏览器还计了缓存与文件系统
// 开销，必然大于逐项之和，差额如实写在屏上而不是假装两边相等。

const ST_LS_OWN_PREFIX = ['ordinal-', 'ordinal:', 'collect-msgs'];
const ST_LS_OWN_EXACT = ['lastBackupAt', '__diag_test__'];
const ST_LEGACY_PREFIX = 'xy-home-v2:';
const ST_BIG_IMG = 512 * 1024;
const ST_MIN_IMG = 1024;
const ST_TOP = 10;
const ST_IDB_KEY_CAP = 4000;
// 顶层键 → 屏上功能名。聊天消息不在这里：它住在 chats（messages 是它的别名），由 stSectionName 单独认。
const ST_SECTIONS = [
  ['groups', '字卡库'], ['stickerGroups', '表情分组'], ['stickers', '表情池（旧扁平）'],
  ['sentLetters', '寄出的信'], ['receivedLetters', '收到的信'],
  ['avlib', '头像昵称库'], ['chatAppearance', '会话外观'], ['appearance', '外观'],
  ['contacts', '联系人'], ['profile', 'TA 资料'], ['me', '我的资料'], ['wishlist', '心愿'],
  ['games', '游戏皮肤'], ['cjian', '世界感知'], ['chatSounds', '提示音'], ['mailboxSettings', '信箱设置']
];

let _stBusy = false;
let _stCompressing = false;
let _stLast = null;
// 上一次动作的结果那一行。扫完会整块重画，结果若不存着就被自己抹掉（用户点了「清理」却一句反馈都没有）
let _stMsg = '';

function stFmt(n) {
  if (typeof n !== 'number' || !isFinite(n) || n < 0) return '—';
  if (n >= 1048576) return (n / 1048576).toFixed(2) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
  return Math.round(n) + ' B';
}
function stJsonBytes(val) {
  try { return new Blob([JSON.stringify(val)]).size; } catch { return 0; }
}
// dataURL 全是 ASCII 字符，字符串长度就是字节数，不必再建 Blob 逐张算
function stIsImageSlot(s) {
  return typeof s === 'string' && s.length > ST_MIN_IMG && s.indexOf('data:image/') === 0;
}
function stOurKey(k) {
  const s = String(k || '');
  if (ST_LS_OWN_EXACT.indexOf(s) >= 0) return true;
  for (let i = 0; i < ST_LS_OWN_PREFIX.length; i++) { if (s.indexOf(ST_LS_OWN_PREFIX[i]) === 0) return true; }
  return false;
}

function stWalkImages(node, trail, depth, out, skip) {
  if (!node || depth > 7) return;
  const t = typeof node;
  if (t === 'string') {
    if (stIsImageSlot(node)) out.push({ trail: trail, bytes: node.length, anim: /^data:image\/gif/i.test(node), raw: node });
    return;
  }
  if (t !== 'object') return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) stWalkImages(node[i], trail.concat(i), depth + 1, out);
    return;
  }
  const keys = Object.keys(node);
  for (let i = 0; i < keys.length; i++) {
    // data.messages 是 data.chats[activeChat].msgs 的同一份引用（js/db.js:272 那条绑定）——
    // 两处都走会把每一条消息里的图数两遍，「重复内联」那个数就此虚高。只走 chats，顶层别名跳过。
    if (depth === 0 && skip && skip[keys[i]]) continue;
    stWalkImages(node[keys[i]], trail.concat(keys[i]), depth + 1, out, null);
  }
}
// 顶层键的别名判据：chats 在且非空才跳 messages（万一读到只有一半形状的档，宁可数也不漏）
function stAliasSkip(d) {
  try { return (d.chats && typeof d.chats === 'object' && Object.keys(d.chats).length) ? { messages: 1 } : null; } catch (e) { return null; }
}
// 序列化体积同样要摘掉别名键：JSON 不保留共享引用，一条消息会被算两遍（几 MB 的量级），
// 摘掉这份浅拷贝上的键不动数组本身。behavior 与 chatSettings 也是别名，但那是一千字节级，不为此加第二条特例。
function stMainBytes(d) {
  try {
    const c = Object.assign({}, d);
    const sk = stAliasSkip(d);
    if (sk) delete c.messages;
    return stJsonBytes(c);
  } catch (e) { return 0; }
}
function stContactName(cid) {
  try {
    const c = (data.contacts || []).find(x => x && x.id === cid);
    return c ? c.name : String(cid);
  } catch (e) { return String(cid); }
}
function stPathText(trail) {
  // 消息的路径读起来要说人话：chats.c1.msgs[3].sticker → 「乙的消息[3].sticker」
  let t = trail;
  let head = '';
  if (t[0] === 'chats' && t[2] === 'msgs') { head = stContactName(t[1]) + '的消息'; t = t.slice(3); }
  let s = head;
  for (let i = 0; i < t.length; i++) {
    const seg = t[i];
    if (typeof seg === 'number') s += '[' + seg + ']';
    else s += (s ? '.' + seg : String(seg));
  }
  return s;
}
function stSectionName(trail) {
  const first = typeof trail[0] === 'string' ? trail[0] : '';
  if (first === 'chats' || first === 'messages') return '聊天消息';
  for (let i = 0; i < ST_SECTIONS.length; i++) { if (ST_SECTIONS[i][0] === first) return ST_SECTIONS[i][1]; }
  return first || '其他';
}
// 大图那一栏的去处只认得出顶层功能面；认不出就不给按钮（不留一枚点了没反应的钮）
function stJumpOf(trail) {
  const first = typeof trail[0] === 'string' ? trail[0] : '';
  if (first === 'chats') return 'chat:' + String(trail[1] || '');
  if (first === 'messages') return 'chat';
  if (first === 'groups' || first === 'stickerGroups' || first === 'stickers') return 'cards';
  if (first === 'sentLetters' || first === 'receivedLetters') return 'mailbox';
  if (first === 'avlib') return 'avatarlib';
  if (first === 'games') return 'games';
  return null;
}


function stLsReport() {
  const rows = [];
  let otherBytes = 0, otherN = 0, err = '';
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const b = (k.length + (localStorage.getItem(k) || '').length) * 2;
      if (k === LS_KEY) { rows.push({ k: k, bytes: b, tag: '整包副本' }); continue; }
      if (k.indexOf(ST_LEGACY_PREFIX) === 0) { rows.push({ k: k, bytes: b, tag: '旧前缀' }); continue; }
      if (k.indexOf('collect-msgs') === 0) { rows.push({ k: k, bytes: b, tag: '收藏' }); continue; }
      if (k === DIAG_ERRS_KEY) { rows.push({ k: k, bytes: b, tag: '诊断记录' }); continue; }
      if (stOurKey(k)) { rows.push({ k: k, bytes: b, tag: '本机小件' }); continue; }
      otherBytes += b; otherN++;
    }
  } catch (e) { err = String((e && e.message) || e); }
  rows.sort((a, b) => b.bytes - a.bytes);
  // err 必须一路带到屏上：静默吞掉的话「没有可清理的」就成了假话（读不到 ≠ 干净）
  return { rows: rows, other: { bytes: otherBytes, n: otherN }, err: err };
}

// 本机小件住在第二个库（ordinal-keep-db，播放器下线后由 js/background.js 自管），与主数据分开计量
function stFileGroups() {
  if (!window.idbGetAllKeys) return Promise.resolve({ legacy: [], rest: [], sizes: {}, err: '这台设备的浏览器读不到本机小件库（IndexedDB 不可用）' });
  return window.idbGetAllKeys().then(keys => {
    const all = (keys || []).map(String);
    const legacy = all.filter(k => k.indexOf(ST_LEGACY_PREFIX) === 0);
    const rest = all.filter(k => legacy.indexOf(k) < 0);
    const want = all.slice(0, ST_IDB_KEY_CAP);
    const sizes = {};
    const BATCH = 20;
    function readBatch(i) {
      if (i >= want.length) return Promise.resolve();
      return window.idbGetMany(want.slice(i, i + BATCH)).then(map => {
        want.slice(i, i + BATCH).forEach(k => {
          const v = map[k];
          let b = 0;
          if (typeof Blob !== 'undefined' && v instanceof Blob) b = v.size;
          else if (typeof v === 'string') b = Math.round(v.length * 0.75);
          else if (v && typeof v.byteLength === 'number') b = v.byteLength;
          sizes[k] = b;
        });
        return readBatch(i + BATCH);
      });
    }
    return readBatch(0).then(() => ({ legacy: legacy, rest: rest, sizes: sizes }));
  }).catch(e => ({ legacy: [], rest: [], sizes: {}, err: String((e && e.message) || e) }));
}
function stEstimate() {
  if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(null);
  return navigator.storage.estimate().then(e => ({ usage: e.usage || 0, quota: e.quota || 0 })).catch(() => null);
}
function stPersisted() {
  if (!navigator.storage || !navigator.storage.persisted) return Promise.resolve(null);
  return navigator.storage.persisted().catch(() => null);
}

function storageScan() {
  if (_stBusy) return Promise.resolve(_stLast);
  _stBusy = true;
  const imgs = [];
  try { if (typeof data !== 'undefined' && data) stWalkImages(data, [], 0, imgs, stAliasSkip(data)); } catch (e) {}
  const mainBytes = (typeof data !== 'undefined' && data) ? stMainBytes(data) : 0;

  const bySection = {};
  imgs.forEach(it => {
    const n = stSectionName(it.trail);
    const s = bySection[n] || { bytes: 0, n: 0 };
    s.bytes += it.bytes; s.n++;
    bySection[n] = s;
  });
  const dup = new Map();
  imgs.forEach(it => {
    const g = dup.get(it.raw) || { bytes: it.bytes, n: 0 };
    g.n++;
    dup.set(it.raw, g);
  });
  let dupKinds = 0, dupWaste = 0;
  dup.forEach(g => { if (g.n > 1) { dupKinds++; dupWaste += (g.n - 1) * g.bytes; } });
  const big = imgs.filter(it => it.bytes >= ST_BIG_IMG).sort((a, b) => b.bytes - a.bytes)
    .map(it => ({ trail: it.trail, bytes: it.bytes, label: stSectionName(it.trail), path: stPathText(it.trail), anim: it.anim }));
  let gifN = 0, gifBytes = 0, imgTotal = 0;
  imgs.forEach(it => { imgTotal += it.bytes; if (it.anim) { gifN++; gifBytes += it.bytes; } });

  return Promise.all([stLsReport(), stFileGroups(), stEstimate(), stPersisted()]).then(res => {
    const ls = res[0], files = res[1], est = res[2], persisted = res[3];
    const filesErr = (files && files.err) || '';
    let lsOwn = 0;
    ls.rows.forEach(r => { lsOwn += r.bytes; });
    const legacyLs = ls.rows.filter(r => r.tag === '旧前缀');
let legacyIdb = 0, keepalive = 0;
if (!filesErr) {
files.legacy.forEach(k => { legacyIdb += (files.sizes[k] || 0); });
files.rest.forEach(k => { keepalive += (files.sizes[k] || 0); });
}
    _stLast = {
      at: Date.now(), mainBytes: mainBytes, est: est, persisted: persisted, ls: ls, lsOwn: lsOwn,
      legacyIdb: legacyIdb, keepalive: keepalive,
      lsErr: ls.err || '', filesErr: filesErr,
      legacyKeys: { ls: legacyLs.map(r => r.k), idb: filesErr ? [] : files.legacy, lsBytes: legacyLs.reduce((a, r) => a + r.bytes, 0) },
      lsCopy: ls.rows.filter(r => r.tag === '整包副本')[0] || null,
      diagErr: ls.rows.filter(r => r.tag === '诊断记录')[0] || null,
      dup: { kinds: dupKinds, waste: dupWaste }, big: big,
      imgN: imgs.length, imgTotal: imgTotal, gifN: gifN, gifBytes: gifBytes,
      bySection: bySection
    };
    _stBusy = false;
    storageRender();
    return _stLast;
  }).catch(e => {
    _stBusy = false;
    // 整栏读不动也要说一句：留着一块空白会被读成「没有东西可清理」
    const b = $('#storageBody');
    if (b) b.innerHTML = '<div class="st-note">' + escapeHTML('这一栏没能读完：' + String((e && e.message) || e)) + '</div>';
    return null;
  });
}

function stRow(o) {
  const pct = (o.total > 0 && o.bytes > 0) ? Math.min(100, Math.round(o.bytes / o.total * 100)) : 0;
  return '<div class="st-row"><span class="st-row-n">' + escapeHTML(o.name)
    + (o.sub ? '<em>' + escapeHTML(o.sub) + '</em>' : '') + '</span>'
    + '<span class="st-row-b">' + escapeHTML(o.text != null ? o.text : stFmt(o.bytes)) + '</span></div>'
    + (o.bar === false ? '' : '<div class="st-bar"><i style="width:' + pct + '%"></i></div>');
}
function stActRow(o) {
  return '<div class="st-row st-act-row"><span class="st-row-n">' + escapeHTML(o.name)
    + (o.sub ? '<em>' + escapeHTML(o.sub) + '</em>' : '') + '</span>'
    + '<span class="st-row-b">' + escapeHTML(o.text != null ? o.text : stFmt(o.bytes)) + '</span>'
    + (o.act ? '<button type="button" class="st-act" data-st-act="' + o.act + '"'
      + (o.jump ? ' data-st-jump="' + escapeHTML(o.jump) + '"' : '') + '>' + escapeHTML(o.label || '清理') + '</button>' : '')
    + '</div>';
}
function stNote(txt, small) {
  return '<div class="st-note' + (small ? ' small' : '') + '">' + escapeHTML(txt) + '</div>';
}

function storageRender() {
  const body = $('#storageBody');
  if (!body || !_stLast) return;
  const r = _stLast;
  const known = r.mainBytes + r.lsOwn + r.keepalive;
  const p = [];

  p.push('<div class="st-hero"><b>' + (r.est ? stFmt(r.est.usage) : '读不到') + '</b>'
    + '<span>' + escapeHTML(r.est ? ('设备剩余可用 ' + stFmt(r.est.quota)) : '这台设备的浏览器没把本站占用报给我们（非安全上下文或被禁用）') + '</span></div>');

  const readErr = [r.lsErr && ('localStorage 读不动：' + r.lsErr), r.filesErr].filter(Boolean).join(' ∶ ');
  p.push('<div class="st-sec-t">各处占了多少</div>');
  p.push(stRow({ name: '主数据', sub: '聊天·字卡·信·圈·头像', bytes: r.mainBytes, total: known }));
  p.push(stRow({ name: '本机小键', sub: '收藏册·设置·降级副本', bytes: r.lsOwn, total: known }));
  p.push(stRow({ name: '保活与通知小件', sub: '静音音频·心跳·回执', bytes: r.keepalive, total: known }));
  if (readErr) p.push(stNote('有一处没读到，所以下面那些「没有」都只是「没看着」：' + readErr, true));
  if (r.est) {
    const diff = r.est.usage - known;
    p.push(stNote(diff >= 0
      ? '浏览器报的总数比逐项之和多 ' + stFmt(diff) + '：那是缓存与文件系统开销，浏览器不逐项报给我们，拆不开。'
      : '逐项之和比浏览器报的总数多 ' + stFmt(-diff) + '：浏览器的估计值刷新有延迟，以逐项为准。', true));
  }

  p.push('<div class="st-sec-t">主数据里的图片住在哪</div>');
  if (!r.imgN) p.push(stNote('库里没有内联图片。', true));
  Object.keys(r.bySection).sort((a, b) => r.bySection[b].bytes - r.bySection[a].bytes).forEach(k => {
    p.push(stRow({ name: k, sub: r.bySection[k].n + ' 张', bytes: r.bySection[k].bytes, bar: false }));
  });
  p.push(stNote('上面按「贴在哪」分：同一张图挂在几处就算几处，所以每一行既有张数也有字节数。', true));

  const acts = [];
  const legacyN = r.legacyKeys.ls.length + r.legacyKeys.idb.length;
  if (legacyN) acts.push({ name: '旧命名空间残键', sub: legacyN + ' 个 · 本站早已不写这一族', bytes: r.legacyIdb + r.legacyKeys.lsBytes, act: 'legacy' });
  // 降级副本那一栏要先问得出「现在是不是降级模式」才递刀：不知道状态就给一枚删除钮，可能删掉用户唯一那一份
  if (typeof isLSMode === 'function' && r.lsCopy && r.lsCopy.bytes > 0 && !isLSMode()) acts.push({ name: '存储降级副本', sub: '主库读写正常，这份是第二拷贝', bytes: r.lsCopy.bytes, act: 'copy' });
  if (r.diagErr && r.diagErr.bytes > 0) acts.push({ name: '诊断错误记录', sub: '排障用的最近若干条', bytes: r.diagErr.bytes, act: 'diag' });
  if (r.ls.other.n) acts.push({ name: '同域其他站点', sub: r.ls.other.n + ' 个键 · 不是本站的数据', bytes: r.ls.other.bytes, act: 'other' });

  p.push('<div class="st-sec-t">能腾出来的</div>');
  if (!acts.length) p.push(stNote(readErr ? '没看着的东西不算干净——上面写着哪一处没读到。' : '没有可腾的东西——失效数据是干净的。', true));
  acts.forEach(a => { p.push(stActRow(a)); });

  p.push('<div class="st-sec-t">图片这一层</div>');
  p.push(stActRow({ name: '存量图片压缩', sub: r.imgN + ' 张 · 共 ' + stFmt(r.imgTotal) + ' · 压小后就地替换', bytes: r.imgTotal, act: r.imgN ? 'compress' : '', label: '压缩' }));
  if (r.gifN) p.push(stNote('其中动图 ' + r.gifN + ' 张共 ' + stFmt(r.gifBytes) + '：压一张就只剩第一帧，所以压缩会跳过它们。', true));
  p.push(stActRow({ name: '同一张图存了多份', sub: r.dup.kinds ? r.dup.kinds + ' 张图被重复存' : '没有重复的图', bytes: r.dup.waste, text: r.dup.kinds ? '最多可省 ' + stFmt(r.dup.waste) + ' · 只报数' : '—' }));
  if (r.dup.kinds) p.push(stNote('这一份只能看着：要合成一份就得把整套存储改成「引用＋图库」，会打断导出与导入的互通，不是这一页能顺手做的事。', true));
  if (r.big.length) {
    p.push('<div class="st-sec-t">最大的几张（单张 ≥ ' + stFmt(ST_BIG_IMG) + '）</div>');
    r.big.slice(0, ST_TOP).forEach(b => {
      p.push(stActRow({ name: b.label, sub: b.path + (b.anim ? ' · 动图' : ''), bytes: b.bytes, act: stJumpOf(b.trail) ? 'jump' : '', jump: stJumpOf(b.trail) || '', label: '去看' }));
    });
  }

  p.push('<div class="st-sec-t">持久存储</div>');
  if (r.persisted === null) p.push(stNote('这台设备的浏览器没有这个接口。', true));
  else p.push(stActRow({ name: r.persisted ? '已获得' : '未获得', sub: r.persisted ? '空间紧张时浏览器不会自动清掉本站数据' : '空间紧张时浏览器可能自己清掉本站数据', bytes: 0, text: '', act: r.persisted ? '' : 'persist', label: '申请' }));

  p.push('<div class="st-foot"><button type="button" class="soft-btn" data-st-act="rescan">刷新读数</button>'
    + '<p class="data-note">' + escapeHTML('这里的清理删掉就回不来，动手前先去「数据管理」导出一次备份。') + '</p>'
    + '<p class="data-note" id="stProgress"></p></div>');

  body.innerHTML = p.join('');
  const pr = $('#stProgress');
  if (pr) pr.textContent = _stMsg;
  const sum = $('#sumStorage');
  if (sum) sum.textContent = acts.length ? (acts.length + ' 项可腾') : '已扫描 · 无可腾';
}

// 结果那一行既写屏上也存着：重画之后还得把它放回去
function stSay(txt) {
  _stMsg = txt || '';
  const el = $('#stProgress');
  if (el) el.textContent = _stMsg;
}

// 两段式确认：首点只把按钮变成「确认」，2.5 秒内再点同一枚才真动（本站删数据一律不弹浏览器 confirm）
// 只有一条入口＝下面那个 document 委托，不再给按钮另挂监听——另挂的话第二次点击会「既跑活又被重新武装」，
// 第三下再把同一件删除跑一遍（本仓口径：一枚钮不许有两条触发路径）
function stArm(btn, run) {
  if (btn.dataset.stArmed === '1') {
    clearTimeout(Number(btn.dataset.stArmTimer));
    delete btn.dataset.stArmed; delete btn.dataset.stArmTimer;
    btn.classList.remove('armed');
    btn.textContent = btn.dataset.stOld || btn.textContent;
    delete btn.dataset.stOld;
    btn.disabled = true;
    Promise.resolve().then(run).catch(e => {
      showToast('没做成：' + ((e && e.message) || e));
    }).finally(() => {
      if (!btn.isConnected) return;
      btn.disabled = false;
    });
    return;
  }
  const old = btn.textContent;
  btn.dataset.stOld = old;
  btn.dataset.stArmed = '1';
  btn.textContent = '确认';
  btn.classList.add('armed');
  btn.dataset.stArmTimer = String(setTimeout(() => {
    delete btn.dataset.stArmed; delete btn.dataset.stArmTimer; delete btn.dataset.stOld;
    btn.classList.remove('armed');
    if (btn.isConnected) btn.textContent = old;
  }, 2500));
}

function storageAct(act, btn) {
  const r = _stLast;
  if (act === 'rescan') { _stMsg = ''; storageScan(); return; }
  if (act === 'jump') {
    // 「去看」跳的是那一格真住着的页面；消息那一族还要先换到人——跳错会话比不跳更糟（用户会以为图不见了）
    const j = btn.dataset.stJump || '';
    if (j.indexOf('chat:') === 0) { const cid = j.slice(5); if (cid && typeof switchChat === 'function') switchChat(cid); else showView('chat'); return; }
    if (j) showView(j);
    return;
  }
  if (!r) return;
  if (act === 'legacy') {
    const n = r.legacyKeys.ls.length + r.legacyKeys.idb.length;
    stArm(btn, () => {
      r.legacyKeys.ls.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
      return Promise.all(r.legacyKeys.idb.map(k => window.idbDelete(k)))
        .then(() => { showToast('已清掉 ' + n + ' 个旧命名空间残键'); return storageScan(); });
    });
    return;
  }
  if (act === 'copy') {
    stArm(btn, () => { try { localStorage.removeItem(LS_KEY); } catch (e) {} showToast('已删降级副本'); return storageScan(); });
    return;
  }
  if (act === 'diag') {
    stArm(btn, () => { try { localStorage.removeItem(DIAG_ERRS_KEY); } catch (e) {} showToast('已清空诊断记录'); return storageScan(); });
    return;
  }
  if (act === 'other') {
    stArm(btn, () => {
      const drop = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && !stOurKey(k) && k.indexOf(ST_LEGACY_PREFIX) !== 0) drop.push(k);
        }
      } catch (e) {}
      drop.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
      showToast('已删 ' + drop.length + ' 个非本站键');
      return storageScan();
    });
    return;
  }
  if (act === 'persist') {
    if (!navigator.storage || !navigator.storage.persist) { showToast('这台设备没有这个接口'); return; }
    navigator.storage.persist().then(ok => {
      showToast(ok ? '已获得持久存储' : '浏览器没给：多用一段时间再试');
      return storageScan();
    }).catch(() => showToast('申请失败'));
    return;
  }
  if (act === 'compress') storageCompress(btn);
}

function storageCompress(btn) {
  if (_stCompressing) { showToast('正在压缩中…'); return; }
  const imgs = [];
  try { if (data) stWalkImages(data, [], 0, imgs, stAliasSkip(data)); } catch (e) {}
  const still = imgs.filter(it => !it.anim);
  if (!still.length) { showToast('没有可压的静态图（只剩动图，压了会丢帧）'); return; }
  const uniq = new Map();
  still.forEach(it => { if (!uniq.has(it.raw)) uniq.set(it.raw, it.bytes); });
  stArm(btn, () => {
    _stCompressing = true;
    const list = Array.from(uniq.keys());
    let done = 0, saved = 0, dropped = 0;
    const out = new Map();
    const tick = () => stSay('压缩中 ' + done + '/' + list.length + ' · 已省 ' + stFmt(saved));
    tick();
    return list.reduce((p, raw) => p.then(() => compressImageDataURL(raw, 1024, 0.82).then(res => {
      if (res !== raw) { out.set(raw, res); saved += (raw.length - res.length); }
      done++; tick();
      if (done % 12 === 0) return new Promise(r => setTimeout(r, 0));
    })), Promise.resolve()).then(() => {
      if (!out.size) { stSay('没有能再压小的图'); showToast('这些图已经压到最小了'); return storageScan(); }
      still.forEach(it => {
        const rep = out.get(it.raw);
        if (!rep) return;
        if (stSetAt(it.trail, rep)) dropped++;
      });
      flushSave();
      stSay('压缩完成：' + list.length + ' 张唯一图，就地替换 ' + dropped + ' 处，省出 ' + stFmt(saved));
      showToast(dropped + ' 处已压小，省 ' + stFmt(saved));
      return storageScan();
    }).finally(() => { _stCompressing = false; });
  });
}


// 按走图时记下的路径把压小后的那张写回原处。路径是逐段索引，写回前逐段验存在＝树形被并行改动过也不误写。
function stSetAt(trail, value) {
  if (!data || !trail || !trail.length) return false;
  let node = data;
  for (let i = 0; i < trail.length - 1; i++) {
    if (!node || typeof node !== 'object') return false;
    node = node[trail[i]];
  }
  if (!node || typeof node !== 'object') return false;
  const last = trail[trail.length - 1];
  if (!(last in node)) return false;
  node[last] = value;
  return true;
}

// 进设置那一面时：卡片本来展开着就扫，收起着只留一句「展开后扫」——扫一次要把整棵 data 序列化一遍，
// 不该为了一行摘要每次进设置页都付这一发（#030 那批全站字号也踩过同一条「每次进页都全量重算」）
function storageViewShown() {
  // 「这张卡此刻开没开」现读 DOM——折叠状态不再有第二本账（BUGS #228），拿账判就会读到一个没人写的旧值
  const card = document.querySelector('.setting-card[data-fold="storage"]');
  if (card && card.classList.contains('open')) { storageScan(); return; }
  if (_stLast) { storageRender(); return; }
  const sum = $('#sumStorage');
  if (sum) sum.textContent = '展开后扫描';
}

document.addEventListener('click', e => {
  const btn = e.target.closest ? e.target.closest('[data-st-act]') : null;
  if (!btn) return;
  storageAct(btn.dataset.stAct, btn);
});
// 折叠卡的展开由 mate.js 那条 document 委托负责（它先注册），这条在其后跑，读到的已是展开后的状态
document.addEventListener('click', e => {
  const hd = e.target.closest ? e.target.closest('.fold-hd') : null;
  if (!hd) return;
  const card = hd.closest('.fold');
  if (!card || card.dataset.fold !== 'storage') return;
  if (card.classList.contains('open')) { storageScan(); }
});
