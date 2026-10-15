// ===== 会话聊天记录：单独导出这一本 ＋ 往这一本追加（自动去重） =====
// 入口只有一处：聊天页右上角 →「关于某个 TA 的一切」里那张 data-fold="chatio" 卡（沿用 js/mate.js 的折叠卡机制）。
// 作用域恒＝data.activeChat 那一本（单聊与群聊各算一本），不跟随 mate 页顶部那排成员 chip——那排 chip
// 切的是「改哪一个人的参数」（_mateTarget），而这里动的是整本会话的记录，两件事。
// 为什么不在 设置→数据 再放一份：那一格管的是整棵 data（导出全部／导入全部／清空），而一件事只在一处
//（#095 顶栏那枚大字、#137 页脚那句进度都是这么撤掉第二处的）。零 data 字段，不碰 defaults／ensureData。

const CHAT_IO_APP = 'ordinal-chat';
const CHAT_IO_NL = String.fromCharCode(10);      // TXT 的行尾
const CHAT_IO_RS = String.fromCharCode(30);      // 内容键的分隔符：正文里不会出现，免得拼键撞车

// 这一本的数组本体。刻意不读 data.messages——那是「活跃会话」的别名（js/db.js:275 那条绑定），
// 在延迟回调里读它会串到别人那本（#051 字卡·#091 信箱·#156 通话·#165 来信·#192 我这侧 那一族）。
function _chatIoMsgs(cid) {
  const ch = (data.chats && data.chats[cid]) || null;
  return ch && Array.isArray(ch.msgs) ? ch.msgs : null;
}

function _chatIoContact(cid) {
  return (data.contacts || []).find(x => x && x.id === cid) || null;
}

// 这一本叫什么：会话上的覆盖名优先，回落联系人本名；群聊用群名
function _chatIoName(cid) {
  const c = _chatIoContact(cid);
  return c ? String(c.chatName || c.name || '').trim() : '';
}

// 「谁说的」：我方＝我，系统小字不给主语，群聊按那条自己带的 sender
function _chatIoTalker(m, name) {
  if (m.from === 'me') return '我';
  if (m.from === 'system') return '';
  return String(m.sender || name || 'TA');
}

// 时间戳：date 是 toLocaleDateString('zh-CN')＝2026/10/9，time 是 js/utils.js 的 HH:MM:SS。
// 外来的 2026-10-09 也认——先把 - 换成 /：不带时区的串按 UTC 解会把同一句话错开到前一天。
// 读不懂回 NaN，由判同那道闸挡在门外：不是宽容，是缺日期的记录会被日分隔条画成「NaN月NaN日」。
function _chatIoStamp(m) {
  const d = String((m && m.date) || '').trim().replace(/-/g, '/');
  if (!d) return NaN;
  const t = String((m && m.time) || '').trim();
  return Date.parse(d + (t ? ' ' + t : ''));
}

// 图的指纹＝长度＋首尾各几枚字符，不把整串 base64 拼进判重集合（几百张图会让这一步吃掉几百 MB 字符串）。
// 「同一会话·同一秒·同一人·两张图的首尾 40 字与长度还全等」这种碰撞实际不存在。
function _chatIoPicKey(s) {
  const v = String(s || '');
  if (!v) return '';
  return v.length + ':' + v.slice(0, 24) + ':' + v.slice(-16);
}

// 内容键＝是谁·哪天·几点·说了什么·带没带哪张图。带说话人与时刻，是为了不合并「同一句『嗯』他说过
// 八次」（那八次是真发生过八条）；带图指纹，是 #194 那一刀在收藏那面红过的同一个坑——纯图那条 text
// 是空串、表情包那条 text 恒是「[表情包]」占位符，只看文字会把两张不同的图判成同一条。
// 键里那一天先归一：2026-10-2 ∶ 2026/10/2 ∶ 2026-10-02 是同一天（外来记录与手改的档常见这三种写法，
// 不归一就会把同一条判成两条堆进会话）。归一走 _chatIoStamp 解出来的本地日历日，解不动才退回原字面量；
// 时刻刻意不放宽——同一秒与隔三十秒是两条真发生过的消息。
function _chatIoDayKey(m) {
  const st = _chatIoStamp(m);
  if (isNaN(st)) return String((m && m.date) || '');
  const d = new Date(st);
  return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
}
function _chatIoKey(m) {
  return [String(m.from || '') + '|' + String(m.sender || ''), _chatIoDayKey(m),
    String(m.time || ''), String(m.text || ''), _chatIoPicKey(m.sticker)].join(CHAT_IO_RS);
}

// 撞号或没带号时另发一枚。nextId() 在 js/chat.js:12（Date.now() 派生、逐次递增），拿来比自造安全
function _chatIoFreshId(used) {
  let id = 0;
  do { id = nextId(); } while (used.has(String(id)));
  return id;
}

// ===== 导出 =====
// 文件名里的会话名要净化：/ \ : * ? " < > | 与控制字符都不能出现（逐个挑掉，不写正则防转义坑）
function _chatIoSafeName(s) {
  const bad = '/\\:*?"<>|';
  const src = String(s || '');
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src.charAt(i);
    if (bad.indexOf(ch) < 0 && ch.charCodeAt(0) > 31) out += ch;
  }
  out = out.trim().slice(0, 20);
  return out || '会话';
}

function _chatIoFileName(cid, ext, seg) {
  const n = new Date();
  const pad = v => (v < 10 ? '0' + v : String(v));
  return '言字卡-聊天-' + _chatIoSafeName(_chatIoName(cid)) + (seg ? '-节选' : '') + '-' + n.getFullYear() + pad(n.getMonth() + 1) + pad(n.getDate()) + '.' + ext;
}

// TXT 里一条一行。撤回的那条只写「撤回了一条消息」不带原文：JSON 那一份才是无损备份（原对象带着
// recalled 标记回灌，画出来仍是撤回态），TXT 是给人读的，把撤回的话原文摊出来违背屏上那套语义
function _chatIoLine(m, name) {
  const t = m.time ? m.time + ' ' : '';
  if (m.recalled) return t + '※ ' + (_chatIoTalker(m, name) || '有人') + ' 撤回了一条消息';
  if (m.from === 'system') return t + '※ ' + String(m.text || '');
  let body = String(m.text || '');
  if (m.sticker) body = (body && body !== '[表情包]') ? '[图片] ' + body : '[图片]';
  if (m.ask || m.taAsk) body = '[问答卡] ' + body;
  if (!body) body = '（空）';
  return t + _chatIoTalker(m, name) + '：' + body + (m.quote ? CHAT_IO_NL + '    ↳ 引用「' + String(m.quote) + '」' : '');
}

function chatIoTxtBody(cid) {
  const arr = _chatIoMsgs(cid) || [];
  const name = _chatIoName(cid) || '这一本';
  const lines = ['言字卡 · 聊天记录 · ' + name,
    '导出 ' + new Date().toLocaleString('zh-CN') + ' · 共 ' + arr.length + ' 条', ''];
  let lastDate = null;
  for (const m of arr) {
    const d = String((m && m.date) || '');
    if (d !== lastDate) { lines.push('—— ' + (d || '未标日期') + ' ——'); lastDate = d; }
    lines.push(_chatIoLine(m || {}, name));
  }
  return lines.join(CHAT_IO_NL);
}

function _chatIoDownload(text, name, mime) {
  _chatIoSaveBlob(new Blob([text], { type: mime }), name);
}

// 落盘：APK 壳里 WebView 没有任何下载处理器，<a download> 点了什么都不发生（2026-10-12 用户报
// 「手机端用不了」的根因）——有原生桥 ordinalSave 就走 MediaStore 写进 下载/言字卡；
// 浏览器/桌面才走 a.download。两路都不通时报实话，不留「点了没反应」。
function _chatIoSaveBlob(blob, name) {
  if (window.ordinalSave && typeof window.ordinalSave.save === 'function') {
    try {
      const r = new FileReader();
      r.onload = () => {
        const s = String(r.result || '');
        const b64 = s.indexOf(',') >= 0 ? s.slice(s.indexOf(',') + 1) : '';
        if (b64) window.ordinalSave.save(name, b64, blob.type || 'application/octet-stream');
        else _chatIoSaveByAnchor(blob, name);
      };
      r.onerror = () => _chatIoSaveByAnchor(blob, name);
      r.readAsDataURL(blob);
      return;
    } catch (e) { /* 落到下面 */ }
  }
  _chatIoSaveByAnchor(blob, name);
}
function _chatIoSaveByAnchor(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function chatIoExport(kind) {
  const cid = data.activeChat;
  const arr = _chatIoMsgs(cid);
  if (!arr || !arr.length) { showToast('这一本还没有记录'); return; }
  if (kind === 'txt') {
    _chatIoDownload(chatIoTxtBody(cid), _chatIoFileName(cid, 'txt'), 'text/plain;charset=utf-8');
    showToast('已导出 TXT · ' + arr.length + ' 条');
    return;
  }
  // JSON：整本序列化会阻塞主线程（图多时几十 MB），先让出一帧再动，与「导出全部数据」同一手法
  const p = showProgress('正在导出这一本');
  p(30, '正在打包 ' + arr.length + ' 条记录…');
  setTimeout(() => {
    let text;
    try {
      const c = _chatIoContact(cid);
      text = JSON.stringify({ app: CHAT_IO_APP, v: 1, cid, name: _chatIoName(cid),
        kind: (c && c.kind) || 'single', exportedAt: Date.now(), count: arr.length, msgs: arr });
    } catch { hideProgress(); showToast('导出失败：这一本里有存不进文件的内容'); return; }
    p(80, '正在准备下载…');
    _chatIoDownload(text, _chatIoFileName(cid, 'json'), 'application/json');
    p(100, '导出完成');
    setTimeout(hideProgress, 600);
  }, 80);
}

function chatIoSummary() {
  const arr = _chatIoMsgs(data.activeChat);
  return arr && arr.length ? arr.length + ' 条 · 只这一本' : '还没有记录';
}
function _chatIoEcho() {
  const el = $('#mateChatIoSum');
  if (el) el.textContent = chatIoSummary();
}

// ===== 追加：认文件 =====
// 吃两种（用户定档）：① 这一本自己导出的 ordinal-chat；②「导出全部数据」那份整包——从里面只取一册。
// 不吃裸数组、不吃 TXT：字段名未知，猜一套映射就是给不存在的格式造第二条实现。
function _chatIoSources(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (parsed.app === CHAT_IO_APP && Array.isArray(parsed.msgs)) {
    // 把文件里那枚 cid 带进候选：同一台设备导出的对得上＝就是这一本，不再走「按名字猜」那条警告
    return [{ cid: String(parsed.cid || ''), msgs: parsed.msgs, name: String(parsed.name || ''), where: '这一本导出的' }];
  }
  const wrap = (parsed.data && parsed.data.chats) ? parsed.data : parsed;
  if (wrap.chats && typeof wrap.chats === 'object' && !Array.isArray(wrap.chats)) {
    const list = Array.isArray(wrap.contacts) ? wrap.contacts : [];
    const out = [];
    for (const cid of Object.keys(wrap.chats)) {
      const ch = wrap.chats[cid];
      if (!ch || !Array.isArray(ch.msgs) || !ch.msgs.length) continue;
      const c = list.find(x => x && x.id === cid);
      out.push({ cid, msgs: ch.msgs, name: c ? String(c.chatName || c.name || '') : '', where: '整包备份里的一册' });
    }
    if (out.length) return out;
  }
  // 旧版整包：那时还没有 chats，顶层 messages 就是当时开着的那一本
  if (Array.isArray(parsed.messages)) {
    return [{ msgs: parsed.messages, name: String((parsed.profile && parsed.profile.name) || ''), where: '旧版整包的那一册' }];
  }
  return null;
}

// 取哪一册：先认 cid（同一台设备导出的整包 cid 一定对得上），再认名字（唯一命中才算，两个「小七」不猜），
// 只有一册时直接用它但标 guess——名字对不上就要在屏上说清楚，不静默把别人的记录并进来。
function _chatIoResolve(cands, cid, curName) {
  const same = cands.filter(x => x.cid && x.cid === cid);
  if (same.length) return { one: same[0] };
  if (curName) {
    const named = cands.filter(x => x.name && x.name === curName);
    if (named.length === 1) return { one: named[0] };
  }
  if (cands.length === 1) return { one: cands[0], guess: true };
  return { ask: true };
}

// ===== 追加：三级判同（只算不动库，弹层上那些数就靠它） =====
// 1 内容键已在 → 跳过（这一条同时兜住「id 也相同」那一种，判据先看内容就够）
// 2 id 已在而内容键不在 → 撞号（nextId 跨设备同毫秒可同值），另发一枚号留下两条，不覆盖本地那一条
// 3 两把尺子都不在 → 新增
// 顺带：没带号的补一枚号；说话人不是 me/partner/system 或日期读不懂的算「读不懂」，不进这一本
function _chatIoPlan(cid, incoming) {
  const arr = _chatIoMsgs(cid);
  if (!arr) return null;
  const ids = new Set(), keys = new Set();
  for (const m of arr) {
    if (!m) continue;
    if (m.id !== undefined && m.id !== null && m.id !== '') ids.add(String(m.id));
    keys.add(_chatIoKey(m));
  }
  const items = [];
  let dup = 0, bad = 0, renamed = 0;
  for (const raw of (Array.isArray(incoming) ? incoming : [])) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { bad++; continue; }
    if (raw.from !== 'me' && raw.from !== 'partner' && raw.from !== 'system') { bad++; continue; }
    const st = _chatIoStamp(raw);
    if (isNaN(st)) { bad++; continue; }
    const key = _chatIoKey(raw);
    if (keys.has(key)) { dup++; continue; }
    const m = Object.assign({}, raw);      // 拷一份，不把 parsed 那棵树上的对象挂进 data
    delete m.unread;                        // 补进来的是历史不是未读；角标那枚数在会话对象上，本函数一字不碰
    const idStr = (m.id === undefined || m.id === null || m.id === '') ? '' : String(m.id);
    if (!idStr) m.id = _chatIoFreshId(ids);
    else if (ids.has(idStr)) { m.id = _chatIoFreshId(ids); renamed++; }
    ids.add(String(m.id)); keys.add(key);
    items.push({ m, st });
  }
  return { items, dup, bad, renamed, local: arr.length };
}

// 插入＝只找位置、不重排本地数组（用户已经看惯了的历史顺序不该被一次导入改掉；本地万一存在
// 非单调的时间，指针只会往前走，最坏是个别新增段落在稍后的位置，一条也不丢）
function _chatIoApply(cid, plan) {
  const arr = _chatIoMsgs(cid);
  if (!arr || !plan || !plan.items.length) return 0;
  const items = plan.items.slice().sort((a, b) => a.st - b.st);
  const st = arr.map(m => { const s = _chatIoStamp(m); return isNaN(s) ? Infinity : s; });
  const at = [];
  let p = 0;
  for (const it of items) { while (p < arr.length && st[p] <= it.st) p++; at.push(p); }
  for (let i = items.length - 1; i >= 0; i--) arr.splice(at[i], 0, items[i].m);   // 从后往前插，前面的下标才不被移动
  return items.length;
}

// ===== 弹层：沿用导入预览那套 .sheet-mask／.imp-row／.sheet-btn，不新造第二层 =====
function _chatIoSheet(title, bodyHtml, acts) {
  return new Promise(resolve => {
    const old = document.getElementById('chatIoMask');
    if (old) old.remove();          // 上一次没走完的那层不叠第二层（叠了会两枚钮各答一次）
    const m = document.createElement('div');
    m.className = 'sheet-mask'; m.id = 'chatIoMask';
    m.innerHTML = '<div class="sheet imp-sheet"><div class="sheet-head">' + escapeHTML(title) + '</div>' +
      bodyHtml + acts.map(a => '<button type="button" class="sheet-btn' + (a.cls ? ' ' + a.cls : '') +
        '" data-act="' + a.act + '">' + escapeHTML(a.label) + '</button>').join('') + '</div>';
    document.body.appendChild(m);
    m.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      m.remove();
      resolve(act);
    });
  });
}

function _chatIoRow(k, v, d, cls) {
  return '<div class="imp-row"><span>' + escapeHTML(k) + '</span><span>' + v + '</span>' +
    '<span class="imp-d' + (cls ? ' ' + cls : '') + '">' + escapeHTML(d) + '</span></div>';
}

function chatIoPick() {
  const input = $('#chatIoFile');
  if (!input) return;
  input.click();
}

async function chatIoOnFile(e) {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';                       // 同一个文件连着选两次也要能触发（值不变就不算 change）
  if (!f) return;
  const big = (f.size || 0) > 2 * 1024 * 1024;
  if (big) showProgress('正在读取文件');
  let parsed = null;
  try { parsed = JSON.parse(await f.text()); }
  catch { if (big) hideProgress(); showToast('文件读不懂：请选 言字卡 导出的 JSON'); return; }
  const cands = _chatIoSources(parsed);
  if (big) hideProgress();
  if (!cands || !cands.length) { showToast('这不是 言字卡 的聊天文件（里面没有消息记录）'); return; }

  const cid = data.activeChat, curName = _chatIoName(cid);
  let src = _chatIoResolve(cands, cid, curName);
  if (src.ask) {
    const acts = cands.map((x, i) => ({ act: 'p' + i, label: (x.name || '未命名') + ' · ' + x.msgs.length + ' 条' }));
    acts.push({ act: 'cancel', label: '取消', cls: 'sheet-cancel' });
    const pick = await _chatIoSheet('这份文件里有好几册，先选哪一册', '', acts);
    if (!pick || pick === 'cancel') return;
    src = { one: cands[Number(pick.slice(1))] };
  }
  const book = src.one;
  if (!book || !Array.isArray(book.msgs) || !book.msgs.length) { showToast('那一册是空的'); return; }

  const plan = _chatIoPlan(cid, book.msgs);
  if (!plan) { showToast('这一本还没建起来，先去和这位说上一句'); return; }
  // 一条都不新增＝当场一句话讲完，不弹一枚「点了什么也不发生」的主钮（本仓反复被打回的「看着能点实则无反应」那一族）
  if (!plan.items.length) {
    showToast('没有新记录（' + plan.dup + ' 条都已在这本里' + (plan.bad ? ' · 另有 ' + plan.bad + ' 条读不懂' : '') + '）');
    return;
  }
  const rows = '<div class="imp-list">'
    + _chatIoRow('这一本', escapeHTML((curName || '未命名') + ' · 现在 ' + plan.local + ' 条'), '读进来')
    + _chatIoRow('文件里', escapeHTML((book.name || '未署名') + ' · ' + book.msgs.length + ' 条'), book.where)
    + _chatIoRow('新增', '<b>' + plan.items.length + '</b> 条', '+' + plan.items.length, 'up')
    + _chatIoRow('重复', plan.dup + ' 条', '跳过', 'down')
    + (plan.bad ? _chatIoRow('读不懂', plan.bad + ' 条', '不进') : '')
    + (plan.renamed ? _chatIoRow('撞号', plan.renamed + ' 条', '另发号') : '')
    + '</div>'
    // 只有「认不出是不是这一本」（cid 与名字都没对上、只能按唯一一册猜）才警告；名字不同多半是改过名，不是串本
    + (src.guess && book.name && curName && book.name !== curName
      ? '<p class="data-note" style="color:var(--danger-ink)">文件写着「' + escapeHTML(book.name) + '」，你现在开的是「'
        + escapeHTML(curName) + '」这一本。确定不是同一本就是取消，别并进去。</p>' : '')
    + '<p class="data-note">重复＝同一秒同一人说的同一句（带图还看是哪张图），自动跳过不堆两份。追加只加不删，本地已有的一条也不会被改掉。</p>';
  const ok = await _chatIoSheet('并进来之前先看一眼', rows,
    [{ act: 'go', label: '并进来 ' + plan.items.length + ' 条' },
      { act: 'cancel', label: '取消', cls: 'sheet-cancel' }]);
  if (ok !== 'go') return;
  if (data.activeChat !== cid) { showToast('中途换了会话，没有并进去'); return; }   // #088 那一族：确认这一下可能隔了很久

  const added = _chatIoApply(cid, plan);
  await save();
  // 走 jumpToLatest() 而不是 resetMessageRender()＋renderMessages()：后者不复位 _msgEnd，
  // 若此前从搜索/收藏点过老消息（定位窗口开着），end 会被夹在旧窗口终点＝新并进来的记录一条都画不出来
  jumpToLatest();
  if (typeof renderChatsList === 'function') renderChatsList();
  _chatIoEcho();
  showToast('已并进来 ' + added + ' 条 · 跳过 ' + plan.dup + ' 条重复');
}

const _cioJson = $('#chatIoJson'); if (_cioJson) _cioJson.addEventListener('click', () => chatIoExport('json'));
const _cioTxt = $('#chatIoTxt'); if (_cioTxt) _cioTxt.addEventListener('click', () => chatIoExport('txt'));
const _cioAppend = $('#chatIoAppend'); if (_cioAppend) _cioAppend.addEventListener('click', chatIoPick);
const _cioFile = $('#chatIoFile'); if (_cioFile) _cioFile.addEventListener('change', chatIoOnFile);

// ===== 存成长图：按聊天页的原生 UI 截长图 =====
// 第一版是手拼 SVG「照着聊天的样子画」，被打回：样式不是原生的。这一版改成真·原生：
// ① 屏外建一条与 #chatView 同构的骨架（浅克隆真实祖先链，类名/id/行内样式原样）；
// ② 消息用 render.js 的 _buildMessageHTML/_buildDaySeparator 原生渲染器逐条画（与屏上同一份实现，
//    问答卡/游戏卡/签槽/撤回/引用/群署名/头像全部原生，不另画第二套）；
// ③ 站点全部样式表原文嵌进 SVG（foreignObject），并把 body 的 data-ap-* 属性与其上的主题变量
//    搬到伪 body 上——SVG 里没有 <body>，body[...] 作用域的选择器靠重写出的 .chatshot-body 孪生选择器认领；
// ④ foreignObject 包成 SVG → <img> → canvas 栅格化，长图里的每一条与屏上像素同源，主题改了截图跟着变。
// 画布上限仍在：按量出来的真实高度分张（日分隔处优先断），超 40 张截去更早的并在图头说明。

const CHAT_IO_PNG_BUD = 7600, CHAT_IO_PNG_MAX_PARTS = 40;

// 站点全部生效样式（本仓全是本地样式表，cssRules 可读）：原文嵌入，伪元素/变量/媒体查询都保真
function _chatIoCollectCSS() {
  let out = '';
  for (const sheet of document.styleSheets) {
    try { for (const r of sheet.cssRules) out += r.cssText + '\n'; } catch (e) { /* 跨域样式读不到就跳过 */ }
  }
  // body[data-ap-*] 作用域的选择器在 SVG 里没有 <body> 可认领：给每条配一个 .chatshot-body 孪生
  out = out.replace(/(^|[,\n])\s*body((?:\[[^\]]*\])+)/g, '$1body$2, .chatshot-body$2');
  return out;
}

// 屏外骨架：沿 #messageList 向上浅克隆祖先链（到 body 为止），类名/id/属性原样。
// 量高与栅格化共用这一份壳；display/flexDirection/position 取真实元素的计算值（SVG 里
// body[data-view=chat] 那条显示规则没人认领，必须行内补），滚动壳改高AUTO，env() 归零保证量高与栅格一致。
function _chatIoCloneShell(list) {
  const ancestors = [];
  for (let el = list.parentElement; el && el !== document.body; el = el.parentElement) ancestors.unshift(el);
  let root = null, parent = null, view = null;
  for (const node of ancestors) {
    const c = node.cloneNode(false);
    if (parent) parent.appendChild(c); else root = c;
    parent = c; view = c;
  }
  const area = list.cloneNode(false);
  const cs = getComputedStyle(list), vcs = view ? getComputedStyle(view) : null;
  area.style.cssText += ';flex:none;height:auto;max-height:none;overflow:visible;content-visibility:visible;'
    + 'padding-top:calc(var(--topbar-h,56px) + 6px);background-image:' + cs.backgroundImage + ';'
    + 'background-size:' + cs.backgroundSize + ';background-position:' + cs.backgroundPosition + ';';
  if (view) {
    view.style.cssText += ';display:' + vcs.display + ';flex-direction:' + vcs.flexDirection + ';position:relative;'
      + 'height:auto;max-height:none;overflow:visible;content-visibility:visible;contain-intrinsic-size:none;width:100%;';
  }
  if (parent) parent.appendChild(area); else return { root: area, view: null, area };
  // 页头也用原生的：真实 .chat-head 浅克隆（absolute 定位骑在壳顶，与屏上同构）
  const headSrc = list.parentElement.querySelector('.chat-head');
  let head = null;
  if (headSrc) {
    head = headSrc.cloneNode(true);
    head.style.cssText += ';height:var(--topbar-h,56px);top:0;';
  }
  return { root, view, area, head };
}

function _chatIoOuterH(el) {
  const cs = getComputedStyle(el);
  return el.getBoundingClientRect().height + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
}

async function chatIoPngExport(arr, seg) {
  const cid = data.activeChat;
  arr = (Array.isArray(arr) && arr.length) ? arr : _chatIoMsgs(cid);
  if (!arr || !arr.length) { showToast('这一本还没有记录'); return; }
  const list = $('#messageList');
  if (!list || typeof _buildMessageHTML !== 'function' || typeof _buildDaySeparator !== 'function' || typeof getMiniAvatarHTML !== 'function') {
    showToast('截图组件没就绪，回到聊天页再点一次'); return;
  }
  const p = showProgress('正在生成长图');
  let host = null;
  try {
    // 屏宽：开着聊天页用真实量得的宽；从别的页（mate 卡）进来聊天页是 display:none，用视口宽兜底
    const W = (list.clientWidth > 0 ? list.clientWidth : Math.min(document.documentElement.clientWidth || 390, 520)) || 390;
    const shell = _chatIoCloneShell(list);
    host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-99999px;top:0;width:' + W + 'px;pointer-events:none;';
    host.appendChild(shell.root);
    document.body.appendChild(host);
    // 1 原生渲染器逐条重画（快照 arr，中途切会话不影响这一本）
    const [miniImg, miniPartner, miniMine] = getMiniAvatarHTML();
    const kids = [];
    let lastDate = '';
    for (let i = 0; i < arr.length; i++) {
      const m = arr[i] || {};
      const d = String(m.date || '');
      if (d !== lastDate) { const sep = _buildDaySeparator(d); shell.area.appendChild(sep); kids.push(sep); lastDate = d; }
      const el = _buildMessageHTML(m, miniImg, miniMine, miniPartner);
      shell.area.appendChild(el); kids.push(el);
      if (i % 300 === 299) { p(Math.round(8 + 40 * i / arr.length), '正在按原生样式重画 ' + (i + 1) + '/' + arr.length + ' 条…'); await new Promise(r => setTimeout(r, 0)); }
    }
    // 懒图片在屏外没有观察者看顾，直接喂 src；等加载完再量高
    shell.area.querySelectorAll('img[data-src]').forEach(img => { img.src = img.dataset.src; });
    p(52, '正在等图片就位…');
    await Promise.all([...shell.area.querySelectorAll('img')].map(img =>
      (img.complete && img.naturalWidth > 0) ? null : new Promise(res => { img.onload = res; img.onerror = res; })));
    await new Promise(r => setTimeout(r, 60));
    // 2 量真实外高＋分张：预算内尽量在 day-label 处断，劈不开再在消息中间断。
    //    单张高度按本机画布上限收紧（探到 8192 的机器按 8192/2 裁）——倍率还能开到 2，
    //    不会把一张超尺寸的空白图发去下载。
    p(58, '正在分张…');
    const maxH = await _chatIoProbeMaxH(W);
    const bud = Math.max(1200, Math.min(CHAT_IO_PNG_BUD, Math.floor(maxH / 2)));
    const parts = []; let cur = { items: [], h: 0 };
    for (const el of kids) {
      const eh = _chatIoOuterH(el);
      if (cur.items.length && ((el.classList && el.classList.contains('day-label') && cur.h > bud * .55) || cur.h + eh > bud)) { parts.push(cur); cur = { items: [], h: 0 }; }
      cur.items.push(el); cur.h += eh;
    }
    if (cur.items.length) parts.push(cur);
    let cut = false;
    if (parts.length > CHAT_IO_PNG_MAX_PARTS) { parts.splice(0, parts.length - CHAT_IO_PNG_MAX_PARTS); cut = true; }   // 截头留尾：最近的最要紧
    const n = parts.length;
    // 3 逐张：foreignObject 包 SVG（站点样式原文嵌入＋伪 body 认领主题）→ 栅格化 → 下载
    const appCSS = _chatIoCollectCSS();
    const bodyCS = getComputedStyle(document.body), htmlCS = getComputedStyle(document.documentElement);
    const now = new Date();
    const padv = v => (v < 10 ? '0' + v : String(v));
    const when = (now.getMonth() + 1) + '/' + now.getDate() + ' ' + padv(now.getHours()) + ':' + padv(now.getMinutes());
    const base = _chatIoFileName(cid, 'png', seg).slice(0, -4);   // 去掉 .png，多张时补 -k
    for (let k = 0; k < n; k++) {
      p(60 + Math.round(35 * k / n), '正在栅格化第 ' + (k + 1) + '/' + n + ' 张…');
      host.innerHTML = '';
      const viewP = shell.view ? shell.view.cloneNode(false) : document.createElement('div');
      const areaP = shell.area.cloneNode(false);
      if (!shell.head) viewP.style.cssText += ';padding-top:6px;';
      for (const el of parts[k].items) areaP.appendChild(el);   // 节点搬进这一张
      if (n > 1 || cut) {
        const meta = document.createElement('div');
        meta.className = 'day-label';
        meta.textContent = (cut && k === 0 ? '记录太长，更早的没有截进来 · ' : '') + (n > 1 ? '第 ' + (k + 1) + '/' + n + ' 张 · ' : '') + '截取 ' + when;
        areaP.insertBefore(meta, areaP.firstChild);
      }
      if (shell.head) viewP.appendChild(shell.head.cloneNode(true));
      viewP.appendChild(areaP);
      // 伪 body：SVG 里没有 <body>，把 body 的 data-* 属性、主题变量、字体颜色全搬到它身上
      const wrap = document.createElement('div');
      wrap.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
      wrap.className = 'chatshot-body';
      for (const at of document.body.attributes) if (at.name.indexOf('data-') === 0) wrap.setAttribute(at.name, at.value);
      for (const cs of [htmlCS, bodyCS]) {
        for (let i = 0; i < cs.length; i++) {
          const pr = cs[i];
          if (pr.charCodeAt(0) === 45 && pr.charCodeAt(1) === 45) wrap.style.setProperty(pr, cs.getPropertyValue(pr));
        }
      }
      wrap.style.width = W + 'px';
      wrap.style.fontFamily = bodyCS.fontFamily; wrap.style.fontSize = bodyCS.fontSize;
      wrap.style.lineHeight = bodyCS.lineHeight; wrap.style.color = bodyCS.color;
      wrap.style.background = bodyCS.backgroundColor;
      const st = document.createElement('style');
      st.textContent = appCSS
        + '/* 截图覆盖：入场动画不播、按需渲染全量画（否则屏外内容被 content-visibility 折成占位框） */'
        + '*{animation:none !important;transition:none !important}'
        + '.chat-area .message,.chat-area .day-label{content-visibility:visible !important;contain-intrinsic-size:none !important}';
      wrap.appendChild(st);
      wrap.appendChild(viewP);
      host.appendChild(wrap);
      const H = Math.ceil(wrap.getBoundingClientRect().height);
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('width', W); svg.setAttribute('height', H);
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      const fo = document.createElementNS(NS, 'foreignObject');
      fo.setAttribute('x', '0'); fo.setAttribute('y', '0'); fo.setAttribute('width', W); fo.setAttribute('height', H);
      fo.appendChild(wrap);
      svg.appendChild(fo);
      const scale = Math.max(0.3, Math.min(2, maxH / H, Math.sqrt(16e6 / (W * H))));
      const blob = await _chatIoPngBlob(new XMLSerializer().serializeToString(svg), scale);
      _chatIoSaveBlob(blob, base + (n > 1 ? '-' + (k + 1) : '') + '.png');
      await new Promise(r => setTimeout(r, 450));   // 连续下载之间留口，浏览器不吞第二张
    }
    p(100, '完成');
    setTimeout(hideProgress, 500);
    showToast((cut ? '太长了，存了最近 ' + n + ' 张（更早的没进来）' : (n > 1 ? '已生成 ' + n + ' 张长图' : '长图已保存')) + (seg ? ' · ' + arr.length + ' 条' : ''));
  } catch (e) {
    hideProgress();
    try { showToast('生成失败：' + (e && e.message ? e.message : '试试换个浏览器')); } catch (e2) {}
  } finally {
    if (host && host.parentElement) host.remove();   // 屏外壳（含重复 id）用完即撤，不留第二份 #messageList
  }
}

// SVG → PNG Blob（不走 utils.svgToPngDownload：那边是 dataURL 直下＋无 promise，分张下载要用 Blob ＋可等待）
function _chatIoPngBlob(svg, scale) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
        const cx = cv.getContext('2d');
        cx.scale(scale, scale); cx.drawImage(img, 0, 0);
        cv.toBlob(b => b ? resolve(b) : reject(new Error('encode')), 'image/png');
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error('svg-render'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

// 画布最大高度探测：安卓 GPU 纹理上限常见 8192（桌面才 16384）——超了不抛错，只会印出一张空白图
// （用户 2026-10-12 报「手机端用不了」的第二因）。用一枚自造红像素二分试出真上限：试画后读回角上
// 像素，红＝真画进去了，黑/透明＝超限静默失败。探一次缓存。
let _chatIoCanvasMaxH = 0;
function _chatIoProbeMaxH(W) {
  if (_chatIoCanvasMaxH) return Promise.resolve(_chatIoCanvasMaxH);
  return new Promise(res => {
    const mk = document.createElement('canvas');
    mk.width = mk.height = 1;
    mk.getContext('2d').fillRect(0, 0, 1, 1);   // 默认填充即黑；换成红看得更准
    const mx = mk.getContext('2d');
    mx.fillStyle = '#ff0000'; mx.fillRect(0, 0, 1, 1);
    const im = new Image();
    im.onload = () => {
      const okH = h => {
        try {
          const cv = document.createElement('canvas');
          cv.width = W; cv.height = h;
          const c2 = cv.getContext('2d');
          c2.drawImage(im, 0, 0, W, h);
          const d = c2.getImageData(W - 1, h - 1, 1, 1).data;
          return d[0] > 200 && d[1] < 100;   // 角像素还是红的＝这张尺寸真画进去了
        } catch (e) { return false; }
      };
      let lo = 1024, hi = 16384, best = 0;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (okH(mid)) { best = mid; lo = mid + 1; } else hi = mid - 1; }
      res(best || 4096);
    };
    im.onerror = () => res(4096);   // 连 1×1 都画不动：保守值，宁窄勿空白
    im.src = mk.toDataURL('image/png');
  }).then(v => { _chatIoCanvasMaxH = v; return v; });
}

const _cioPng = $('#chatIoPng'); if (_cioPng) _cioPng.addEventListener('click', chatIoPngExport);

// ===== 长按选段截图：长按一条设起点，再长按另一条出图 =====
// 入口在聊天页长按动作单（js/chat.js openMsgActions 弹出那一刻动态注入这枚钮——设没设起点、
// 设在哪条上，渲染期不知道，只有弹出这一刻知道）。状态只存内存：选段是一次性手势，
// 不入 data（零字段口径），切会话/重进后自然失效，出图或取消即清。
let _chatIoShotFromId = null;   // 只存内存：选段是一次性手势，不入库（零 data 字段口径）

function _chatIoShotBtnFor(m) {
  if (!m || m.from === 'system') return null;
  if (_chatIoShotFromId === null) return { act: 'chatshot', label: '长图起点' };
  if (String(m.id) === String(_chatIoShotFromId)) return { act: 'chatshot', label: '取消起点' };
  return { act: 'chatshot', label: '截到这里' };
}

function _chatIoShotMark(el) {
  if (el) el.classList.add('chatshot-from');
}
function _chatIoShotUnmark() {
  document.querySelectorAll('.message.chatshot-from').forEach(el => el.classList.remove('chatshot-from'));
}

function _chatIoShotTap(m, el) {
  if (!m || m.from === 'system') return;
  if (_chatIoShotFromId === null) {
    _chatIoShotFromId = m.id;
    _chatIoShotUnmark(); _chatIoShotMark(el);
    showToast('已设为起点 · 长按要结束的那一条');
    return;
  }
  if (String(m.id) === String(_chatIoShotFromId)) {
    _chatIoShotFromId = null;
    _chatIoShotUnmark();
    showToast('已取消截图起点');
    return;
  }
  // 终点：按 id 回数据里找两条的下标（DOM 只画了分页窗口，数据才是完整的），小的当起点
  const from = data.messages.findIndex(x => String(x.id) === String(_chatIoShotFromId));
  const to = data.messages.findIndex(x => String(x.id) === String(m.id));
  _chatIoShotFromId = null; _chatIoShotUnmark();   // 先清：中途失败也别让旧起点挂着
  if (from < 0 || to < 0) { showToast('起点那条不在这一本里了，重新长按选一次'); return; }
  const lo = Math.min(from, to), hi = Math.max(from, to);
  chatIoPngExport(data.messages.slice(lo, hi + 1), true);
}

