// ===== 关于某个 TA 的设置（聊天页右上角整页）＋ 设置页折叠卡 =====
// 入口：聊天页 #chatApBtn（原「会话外观」弹层已并入本页）· 设置页顶部「关于某个 TA 的设置」行
// 作用域：单聊＝当前会话联系人；群聊＝顶部那排成员 chip 分段，「本群」那一屏是这一群共用的那份，
//         切到某一位＝整页换成他（形象与声音是他这个人的一份，回复那五格是【他在这个群里】的一份）。
//         本页所有按人的控件读写 _mateTarget()，按会话的控件仍读写 data.activeChat。
// 折叠卡：[data-fold] 每次进页一律折起，展开只活在当前这一屏；标题右侧一行摘要现算现写。
//         旧写法把展开状态记进 localStorage（ordinal:folds），两个面都不对：上次翻开过的卡，下次从聊天右上角
//         点进来「自己就展开」了；而那本账只按卡名存、不分页也不分人——给 A 翻开「回复节奏」会顶到 B 那一本，
//         两页同名的「提示音」（view-mate 与 view-settings 各一枚）也互相开。功能中心那几行直达本就靠当场
//         给类名生效（js/hub.js 的 _hubGoFold），不依赖这本账，撤掉它不影响「点一行直达并展开那张卡」。
// 搜索：已下线，data-keys 检索词一并作废（保留属性无害，无代码读取）

// 这本账已作废：留着会让「设置 → 数据 → 存储」那一列里躺着一枚谁也不读的键
try { localStorage.removeItem('ordinal:folds'); } catch {}
function renderFolds() {
  $$('[data-fold]').forEach(card => card.classList.remove('open'));
}
document.addEventListener('click', e => {
  const hd = e.target.closest('.fold-hd');
  if (!hd) return;
  const card = hd.closest('.fold');
  if (!card) return;
  card.classList.toggle('open');
});

function _num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
function _pct(v) { return _num(v, 0) + '%'; }

// 折叠卡摘要：全部从当前 data 现算，不写死，避免与控件回显脱节
function renderFoldSummaries() {
  const bh = data.behavior || {};
  const _dotLabel = sel => { const d = $(sel + ' .ap-dot.active'); return d ? (d.title || d.dataset.v) : '跟随主题'; };
  const _set = (sel, txt) => { const el = $(sel); if (el) el.textContent = txt; };
  const ca = (data.chatAppearance || {})[data.activeChat] || {};
  const _apAlt = (ca.dayStyle && ca.dayStyle !== 'auto') || (ca.metaColor && ca.metaColor !== 'auto') || (ca.sysStyle && ca.sysStyle !== 'auto');
  // 两栏的透明度（0~100 一根杆，BUGS #314 二批）只在**真薄了**时才上摘要：0 是默认档、什么都不报；
  // 而且这一件本身只在传过背景图时生效（没图时那两枚滑杆压根不出现），摘要报一个屏上看不见的数＝一句假话，
  // 所以把「有图」也当成这道闸的一部分。群聊那一本没有这些键（_caFill 只补单聊与活跃会话），undefined 折成 0。
  const _veil = v => (ca.chatBg && Number(v) > 0 ? Math.round(Number(v)) + '%' : '');
  const _vh = _veil(ca.headVeil), _vc = _veil(ca.compVeil), _vd = _veil(ca.bgVeil);
  let _veilTxt = (_vh ? '聊天栏' + _vh : '') + (_vh && _vc ? '·' : '') + (_vc ? '输入栏' + _vc : '');
  if (_vd) _veilTxt += (_veilTxt ? '·' : '') + '压暗' + _vd;
  // 聊天气泡字体/字号（2026-10-15）也上摘要：默认档（跟随全局／标准）不报，非默认才说，免得摘要长出一串与出厂相同的字。
  const _fontLbl = { system: '系统', serif: '衬线', round: '圆体' };
  const _fL = (ca.chatFont && ca.chatFont !== 'inherit') ? ('字体' + (_fontLbl[ca.chatFont] || ca.chatFont)) : '';
  const _fS = (ca.chatFontSize === 'small' || ca.chatFontSize === 'large') ? ('字号' + (ca.chatFontSize === 'small' ? '小' : '大')) : '';
  const _txtAdj = [_fL, _fS].filter(Boolean).join('·');
  // 「外观」档拆卡（2026-10-15 #449，用户「美化设置分类太杂太长不好操作」）：旧写法一枚 #mateApSum
  // 串七节的事，折头一行读不下也看不出改的是哪节；现每张卡报自己那一节，默认档不上摘要那条口径照旧。
  // 写手仍只这一处；色点/滑杆/背景/CSS 各写手尾部都调 renderFoldSummaries 当场重算（js/settings.js）。
  _set('#mateApSum', '我方 ' + _dotLabel('#apMineColor') + ' · 对方 ' + _dotLabel('#apPartnerColor') + (((ca.mineText && ca.mineText !== 'auto') || (ca.partnerText && ca.partnerText !== 'auto')) ? ' · 字色已调' : ''));
  _set('#sumApText', _txtAdj || '跟随全局');
  _set('#sumApHint', _apAlt ? '提示已调' : '跟随主题');
  _set('#sumApBg', ca.chatBg ? ('有背景图' + (_veilTxt ? ' · ' + _veilTxt : '')) : '未设置背景图');
  _set('#sumApCss', ca.customBubbleCss ? '已写一段' : '未写');
  const _grp = (typeof _isGroupChat === 'function') && _isGroupChat();
  // TA 自己标那两枚问签的概率（BUGS #350）出厂 0＝什么都不报（同上面那两枚薄纱档那条：默认档不上摘要），
  // 用户开起来之后卡头才说得出这件事——不然「回复节奏」这张卡的摘要会长出一串与他无关的 0%
  const _ask = (Number(bh.referProb) || Number(bh.meantProb)) ? ' · 自己标 说谁' + _pct(bh.referProb) + ' 本意' + _pct(bh.meantProb) : '';
  _set('#mateSpeedSum', (_grp ? '每人 不回 ' : '不回 ') + _pct(bh.rnProb) + ' · ' + _num(bh.rsMin, 1) + '~' + _num(bh.rsMax, 40) + ' 秒 · ' + _num(bh.replyMin, 1) + '~' + _num(bh.replyMax, 2) + ' 条' + _ask);
  _set('#matePySum', bh.pyEnabled ? ('开 · ' + _pct(bh.pyProb) + ' · ' + _num(bh.pyMin, 2) + '~' + _num(bh.pyMax, 5) + ' 张') : '关');
  _set('#mateMixSum', '表情 ' + _pct(bh.stickerProb) + ' · 图 ' + _pct(bh.imageProb) + ' · 语音 ' + _pct(bh.voiceProb) + ' · 撤回' + (bh.recallEnabled ? '开' : '禁'));
  _set('#mateAsSum', bh.asEnabled ? ('开 · ' + _pct(bh.asProb) + ' · ' + _num(bh.asMin, 1) + '~' + _num(bh.asMax, 5) + ' 分钟 · 说给群 ' + _pct(bh.asGroupProb)) : '关');
  _set('#mateAnnSum', bh.annSelfOn === false ? '关' : ('开 · 到点 ' + _pct(bh.annSelfProb) + ' 真建一条'));
  const _c = (typeof currentContact === 'function') ? currentContact() : null;
  // 设置页那行摘要读**固定昵称**（#346：那是其他功能里的那个名字；这行摘要就是给其他页面指的入口）
  _set('#settingsMateName', (_c && fixedNameOf(_c)) ? (fixedNameOf(_c) + ' · 形象 外观 回复 声音') : '形象 外观 回复 声音');
  // 切换 TA 那一行的摘要（2026-10-15 用户「无法切换联系人」）：写明现在编辑的是哪一位，点它开通讯录全名单
  _set('#mateSwitchSum', (_c && chatNameOf(_c)) ? ('现在编辑：' + chatNameOf(_c)) : '还没有联系人');
  // 音色与音效两枚摘要跟着本页的编辑对象走：切到某一位，摘要就该是他的那份
  const _t = _mateTarget() || _c;
  _set('#mateVoiceSum', (_t && _t.mmTimbre) ? ('已绑 ' + _t.mmTimbre) : '未绑定 · 不显示播放键');
  const _solo = _t && data.chatSounds && data.chatSounds[_t.id];
  _set('#mateSfxSum', _solo ? '该 TA 单独设置' : '跟随全局');
  // 「聊天情绪」那枚摘要引的是那一格的同一份读数（_emoCfg 是唯一读侧口径），别在这里再拼一套判档逻辑
  if (typeof _emoMateCid === 'function' && typeof EMOTION_MODE_LABEL === 'object') {
    const ec = _emoCfg(_emoMateCid());
    _set('#mateEmoSum', ec.mode === 'off' ? '关'
      : (EMOTION_MODE_LABEL[ec.mode] || ec.mode) + (_emoProbsShow(ec.mode)
        ? ' · 情绪 ' + _pct(ec.probMood) + ' · 连接词 换 ' + _pct(ec.rcReplaceProb) + ' 加 ' + _pct(ec.rcAppendProb)
        : ' · 原值 70∶40∶40'));
  }

  const g = data.appearance || {};
  _set('#sumBg', '保活 ' + (g.bgKeepAlive ? '开' : '关') + ' · 通知 ' + (g.bgNotify ? '开' : '关') + ' · 横幅 ' + (g.deskPopup === false ? '关' : (data.appearance.deskPopRows === 1 ? '1 行' : '2 行')));
  const s = data.sounds || {};
  _set('#sumSfx', ['partnerMsg', 'myMsg', 'incomingCall'].map(k => ((s[k] || {}).preset) || '—').join(' · '));
  const cs = data.callSettings || {};
  _set('#sumCall', '接通 ' + _pct(cs.answerProb) + ' · 响铃 ' + _num(cs.ringMin, 2) + '~' + _num(cs.ringMax, 5) + ' 秒');
  const mx = (typeof mmSettings === 'function') ? mmSettings() : {};
  _set('#sumMx', mx.on ? ('已开启 · ' + (mx.key ? '已填 Key' : '缺 Key')) : '未开启');
  // 信箱／收藏两处设置都已搬进各自功能页（那张折叠卡与它们在设置页卡头的摘要同批删除），
  // 这里不再摘一份——一份值两处摘要本来也会互相打嘴（BUGS #100·#198）
  _set('#deskEntryState', '背景图 ' + (g.deskBg ? '已放' : '未放') + ' · 压暗 ' + _num(g.deskBgVeil, 60) + '% · 缩放 ' + _num(g.deskBgZoom, 100) + '% · ' + (g.deskBgSize === 'contain' ? '整张' : '铺满'));
  // 「聊天外观」卡头摘要（2026-10-15 随卡自设置页搬来；#449 该卡十一行拆成「聊天排版」∶「时间与磨砂」
  // 两张，摘要跟着分家：形状/行距/对齐/头像/日期签/字体归排版，时间/发送钮/磨砂三枚归磨砂）。
  // 写手只剩这一处；点完档位由 settings.js 委托尾部调 renderFoldSummaries 当场重算。
  const _bs = { round: '圆角', tail: '带尾', square: '方角', sharp: '直角' }[g.bubbleShape] || '圆角';
  // 非默认才多说一句那条口径照旧（三组排版新档与字体档）
  _set('#sumChatAp', '气泡 ' + _bs + ' · 行距 ' + (g.density === 'compact' ? '紧凑' : '舒适')
    + (g.alignMode === 'top' ? ' · 顶对齐' : '')
    + (g.avatarShow === false ? ' · 无头像' : '')
    + (g.dayPos === 'head' ? ' · 日期签钉顶' : '')
    + (g.fontFamily === 'serif' ? ' · 衬线' : g.fontFamily === 'round' ? ' · 圆体' : ''));
  _set('#sumChatFx', '时间 ' + (g.showTime === false ? '隐藏' : '显示')
    + ' · 按钮 ' + (g.sendBtn === false ? '隐藏' : '显示')
    + ' · 磨砂 ' + (g.glass === false ? '关' : '开')
    + (g.glassLite ? ' · 省电' : '')
    + (g.frostBubble ? ' · 气泡磨砂' : ''));
  _set('#sumData', (_num((data.messages || []).length, 0)) + ' 条消息 · ' + (_num((data.groups || []).reduce((a, x) => a + (x.cards || []).length, 0), 0)) + ' 张字卡');
  // 这一本的条数只在 js/chat-io.js 那一处算（chatIoSummary），这里只端过来，不留第二把尺子
  _set('#mateChatIoSum', (typeof chatIoSummary === 'function') ? chatIoSummary() : '');
  _set('#sumDiag', '设备环境与存储');
  // 成员名单与它的摘要同源同点刷新：进本页（renderProfile→此处）与每次即点即存都会走到
  renderMateMembers();
  renderMateScope();
}

// 设置页搜索已下线（#setSearchInput / #setSearchClear 与 _setSearch 全部移除）

// ===== 群成员／所在群聊（同一张卡随会话类型换标题） =====
// 成员名单落库存的是名字（建群那一步 js/chats.js 里 .map(c => c.name)），这里按名字回查通讯录里的单聊联系人：
// 查不到＝那位已从通讯录删除，群里仍会署这个名字，但不再有「他自己的设置」可改，如实标出来并让他能移出名单。
// 点某一位＝就地展开他那几格（档位按【这位在本群里】算，见 chats.js 的 _gbhMerged），
// 不再 switchChat 换编辑对象——旧写法会把 data.activeChat 真的改到那个人身上，
// 从这页返回聊天就停在别人那儿（FEATURES 旧版如实记过这条代价），本批就此收掉。
// 上限与 js/db.js ensureData 里 members 的 slice(0,30) 同值——超了下次加载会被截掉，所以在屏上就挡住。
const MATE_MEMBER_MAX = 30;

// ===== 本页的编辑对象：群态下可以切到某一位成员 =====
// 刻意不动 data.activeChat——旧写法（点行＝switchChat 换编辑对象）会让「从这页返回聊天」停在别人那儿，
// 用户 2026-10-07 定档改成整页分段后，切换只记在本页寿命内（换会话即作废，不持久、不进备份）。
let _mateScope = '';       // ''＝本群；否则是那位成员的名字
let _mateScopeChat = '';   // 这个选择属于哪个会话：换会话就归零，不带进下一个群
function _mateScopeOn() {
  const c = (typeof currentContact === 'function') ? currentContact() : null;
  return !!(c && c.kind === 'group' && _mateScope && _mateScopeChat === data.activeChat
    && document.body.dataset.view === 'mate' && _mateByName(_mateScope));
}
// 按人读写的那几样（形象／音色）走这里；按会话的那几样（behavior／chatAppearance／chatSounds）仍走 activeChat
function _mateTarget() {
  const c = (typeof currentContact === 'function') ? currentContact() : null;
  return _mateScopeOn() ? _mateByName(_mateScope) : c;
}
function renderMateScope() {
  const bar = $('#mateScope');
  if (!bar) return;
  if (_mateScopeChat !== data.activeChat) { _mateScopeChat = data.activeChat; _mateScope = ''; }
  const c = (typeof currentContact === 'function') ? currentContact() : null;
  const mem = (c && c.kind === 'group') ? (c.members || []) : [];
  // chip 只给「还有一份自己的记录」的那位摆。名单里那位已从通讯录删掉的没有记录可读写：给他一枚 chip，
  // 点下去会高亮却什么都不变（探针 tools/_gcm_orphan_probe.js S1 实测 panelHidden=true·五格不在·
  // 而 #nameInput 回显的其实是【群名】＝切过去之后改那格形象改的是群）＝本仓零容忍的「看着能点实则无反应」那一族。
  // 他的名字照旧如实列在下面那张「群成员」卡里并标「已不在通讯录 · 群里仍会署这名」——读数留在读数那一处。
  const opts = mem.filter(n => _mateByName(n));
  if (!opts.length) { bar.hidden = true; bar.innerHTML = ''; }
  else {
    bar.hidden = false;
    const chip = v => `<button type="button" class="fchip${_mateScope === v ? ' on' : ''}" data-mate-scope="${escapeHTML(v)}">${escapeHTML(v || '本群')}</button>`;
    bar.innerHTML = chip('') + opts.map(chip).join('');
  }
  const view = $('#mateView');
  // 三态而非两态：旧写法把「不是成员段」一律写成 'grp'，于是一句话也管不到真正的群态。
  // 现在 one＝某一位联系人／grp＝这个群本身／mem＝群里的某一位，css/mate.css 按这三态收放（BUGS #216）。
  if (view) view.dataset.mateScope = _mateScopeOn() ? 'mem' : ((c && c.kind === 'group') ? 'grp' : 'one');
  if (view) _mateTabApply();   // 换作用域后 tag 与组的显隐可能要跟着收（成员段收起「形象」「外观」两档，见下面 _mateTabHiddenIn）
  // 删除入口住在这一屏的最底下：按【会话】删（群或这位联系人），不是按成员——所以成员段里收起
  const del = $('#mateDelChat');
  if (del) {
    del.hidden = !c || _mateScopeOn();
    if (c) del.textContent = c.kind === 'group' ? '删除这个群（含聊天记录）' : '删除 TA（含聊天记录）';
  }
  renderMateMemPanel();
}
// 某一位那一屏只放三样：他的形象（页头）· 他在本群那五格 · 他的声音（下面的 voice 卡）。
// 群共用的那些（气泡外观／拼句／夹带／主动找你／会话音效）不进成员段——它们在群里按群走，
// 摆在这里就是「改了但群里没变」；会话音效尤其：js/sound.js 按【消息所属会话】取，群里不按人。
function renderMateMemPanel() {
  const card = $('#mateMemPanel');
  if (!card) return;
  const on = _mateScopeOn();
  card.hidden = !on;
  if (!on) {
    // 切回「本群」时把那一盒整块摘掉，不只是藏起来。留着旧内容＝屏上看不见而 DOM 里还有一组填着他数值
    // 的输入框：卡片靠 hidden 收起，一旦哪天有人按 #mateMemPanelBody 去读输入框（或换个成员进来前先读到你
    // 上一个），读到的是这位的账。盒子的归属写在它自己身上（data-mem-name），收起就该真的没有。
    const off = $('#mateMemPanelBody');
    if (off) off.innerHTML = '';
    return;
  }
  const gid = data.activeChat, name = _mateScope;
  $('#mateMemPanelTi').textContent = name + ' · 在本群';
  $('#mateMemPanelSum').textContent = _mateMemSum(gid, name);
  const body = $('#mateMemPanelBody');
  if (body) body.innerHTML = _mateMemFields(gid, name)
    + '<p class="data-note">这几格只在这个群里生效，没单独设的那格跟随「本群」那一档。上面那格形象与下面「TA 的声音」是他这个人的一份，单聊里也一样。</p>';
}

function _mateByName(name) {
  return (data.contacts || []).find(c => c.kind !== 'group' && c.name === name) || null;
}
function _mateGroupsOf(name) {
  if (!name) return [];
  return (data.contacts || []).filter(c => c.kind === 'group' && (c.members || []).indexOf(name) >= 0);
}
// 某个会话自己的回复节奏（现算自 chatSettings，与上面折叠卡摘要同一把尺子）
function _mateBhSum(cid) {
  const b = (data.chatSettings || {})[cid];
  if (!b) return '还没设置过';
  return '不回 ' + _pct(b.rnProb) + ' · 回复 ' + _num(b.rsMin, 1) + '~' + _num(b.rsMax, 40) + ' 秒';
}
// 某位成员【在这个群里】生效的那一档：单独设过才报她的数，没设过只说跟谁——
// 把数字抄一遍到「跟随」那一行＝一件事两处说，且群档一改这里就滞后
function _mateMemSum(gid, name) {
  if (_gbhPatch(gid, name)) {
    const b = _gbhMerged(gid, name);
    return '不回' + _pct(b.rnProb) + ' · ' + _num(b.rsMin, 1) + '~' + _num(b.rsMax, 40) + ' 秒 · '
      + _num(b.replyMin, 1) + '~' + _num(b.replyMax, 2) + ' 条';
  }
  return '没单独设的跟随「本群」那一档';
}
// 「偶尔自己聊天」那块（旧 _mateAmbHtml）随整族退役（BUGS #216）：群不再有自己的钟，
// 屏上「谁在群里冒话」只剩一个来路＝某位自己的主动发送钟到点、那一发落到了群，
// 比例就在【那位】的「主动找你」卡里调（#asGroupProb）。
// 那一盒五格（含「跟随群里／单独设」两枚）现在只有一个宿主：成员段。归属写在盒自己身上，
// 不再靠「它是某一行的下一个兄弟节点」这种位置约定（换宿主就断）。
function _mateMemFields(gid, name) {
  const b = _gbhMerged(gid, name), solo = !!_gbhPatch(gid, name);
  const one = (lab, key, min, max) => '<label>' + lab + '<input type="text" inputmode="numeric" data-mem-key="' + key
    + '" min="' + min + '" max="' + max + '" value="' + b[key] + '"></label>';
  return '<div class="mate-mem-open" data-mem-gid="' + escapeHTML(gid) + '" data-mem-name="' + escapeHTML(name) + '">'
    + '<div class="mate-mem-seg"><button type="button" class="mate-mem-mode' + (solo ? '' : ' on') + '" data-mem-mode="follow">跟随本群</button>'
    + '<button type="button" class="mate-mem-mode' + (solo ? ' on' : '') + '" data-mem-mode="solo">单独设</button></div>'
    + '<div class="mate-mem-fields">'
    + one('不回概率（%）', 'rnProb', 0, 100) + one('最短回复（秒）', 'rsMin', 1, 3600)
    + one('最长回复（秒）', 'rsMax', 1, 3600) + one('最少条数', 'replyMin', 1, 10)
    + one('最多条数', 'replyMax', 1, 10) + '</div>'
    + '<p class="data-note">这几格只在这个群里生效；没改的那格跟随「本群」那一档。表情／图片／语音那些夹带仍按群里，不逐位设。</p></div>';
}
function renderMateMembers() {
  const card = $('#mateMembersCard');
  if (!card) return;
  const c = (typeof currentContact === 'function') ? currentContact() : null;
  const isGroup = !!(c && c.kind === 'group');
  const mem = isGroup ? (c.members || []) : [];
  const groups = isGroup ? [] : (c ? _mateGroupsOf(c.name) : []);
  if (!c || (!isGroup && !groups.length)) { card.hidden = true; return; }
  card.hidden = false;
  const _set = (sel, txt) => { const el = $(sel); if (el) el.textContent = txt; };
  _set('#mateMembersTi', isGroup ? '群成员' : '所在群聊');
  _set('#mateMembersSum', isGroup ? (mem.length ? mem.length + ' 位' : '还没有成员') : groups.length + ' 个群');
  const _lab = (sel, txt) => { const el = $(sel); if (el && el.firstChild) el.firstChild.nodeValue = txt; };
  _lab('#rnProbLab', isGroup ? '每人不回概率（%）' : '已读不回概率（%）');
  // 群态这三枚改口成「每人」：本页那一档是「本群」的底座，而引擎里每位各掷自己那档的开口概率与
  // 条数（js/chat.js 的 _groupReplyRound／_memberReply），没单独设过的人就跟随这里＝这里说的是每人的默认值
  _lab('#replyMinLab', isGroup ? '每人最少条数' : '最少回复条数');
  _lab('#replyMaxLab', isGroup ? '每人最多条数' : '最多回复条数');
  // 那两枚问签刻意**不跟**上面那四格的「每人」措辞：它们不在 GBH_KEYS 那五格里（成员面板也没有这两格），
  // 群里谁开口都掷本群这个数（js/chat.js 的 _askBadgeSelf 收的虽是合并后的 bh，可那一步合并不动这两键）。
  // 跟着写「每人」＝屏上许诺一枚根本不存在的人级设置（本仓「看着能调实则不管用」那一族），故明说「本群」。
  _lab('#referProbLab', isGroup ? '本群自标「说谁」概率（%）' : '「这句说谁」自己标的概率（%）');
  _lab('#meantProbLab', isGroup ? '本群自标「本意」概率（%）' : '「这句本意」自己标的概率（%）');
  // 成员段那五格走 data-mem-key（按名字各一份，#104 定档），与本页这三枚 id 无关。
  const _row = (av, name, sub, go, extra) => `<div class="member-pick mate-mem-row"${go ? ' data-mem-open="' + escapeHTML(go) + '"' : ' aria-disabled="true"'}><span class="avatar member-pick-avatar">${av}</span><span class="mate-mem-tx"><b>${escapeHTML(name)}</b><small>${escapeHTML(sub)}</small></span>${extra || ''}${go ? '<i class="mate-mem-go" aria-hidden="true">›</i>' : ''}</div>`;
  const html = isGroup
    ? mem.map(n => {
        const solo = !!_gbhPatch(c.id, n), m = _mateByName(n);
        const chip = `<span class="mate-mem-chip${solo ? ' on' : ''}">${solo ? '单独设' : '跟随本群'}</span>`;
        // 走散那位优先说「人已不在通讯录」——这句比他的档位更要紧（不设这一条，设过档的孤儿会被读成正常成员）
        const sub = !m ? '已不在通讯录 · 群里仍会署这名' + (solo ? ' · 已单独设过' : '') : _mateMemSum(c.id, n);
        // 行不给点击：切到某一位只走顶部那排成员 chip（一处入口，行在这里是读数）
        return _row(avatarHTML(m ? m.avatar : ''), n, sub, '', chip);
      }).join('')
    : groups.map(g => _row(groupAvatarHTML(g), g.name, (g.members || []).length + ' 位成员 · ' + _mateBhSum(g.id), g.id)).join('');
  const list = $('#mateMemberList');
  if (list) list.innerHTML = html;
  const empty = $('#mateMemberEmpty');
  if (empty) { empty.textContent = '群里还没有成员，点下面「编辑成员名单」拉人进来'; empty.hidden = !!html || !isGroup; }
  const note = $('#mateMemberNote');
  if (note) {
    note.hidden = !isGroup;
    // 那句「偶尔自己聊天」的说辞随整族退役（BUGS #216）：群里谁冒话只有一位联系人自己的主动发送钟说了算
    // 「按每位自己那一档」这句原本说得过宽＝一句假话：实测只有五格按人（探针 tools/_probe_as_group_chain.js 丙1∶丙2
    // 两向对钉），其余「用什么说话」那几枚概率跟的是【本群那份档】——屏上必须分清，不然是「看着调一个人的、其实改了整群」
    if (isGroup) note.textContent = '群里回话的【不回概率∶回复速度∶一回几条】按每位自己那一档走，没单独设过的跟随本群；其余那些「用什么说话」的概率（拍一拍∶表情包∶图片∶语音∶emoji∶颜文字∶引用∶撤回∶拼句）跟的是【本群那份档】——在群这一屏调它只管群里，不动他单聊那份。至于谁会在群里自己冒一句——那按【每位自己那份】的「主动找你」算（在他单聊设置里那一格「其中说给群的」），这个群不再单独有一条钟。';
  }
  const foot = $('#mateMemFoot');
  if (foot) foot.hidden = !isGroup;
}

// 成员名单弹层：一行一位，点一下当场进／出名单并落库（不设「完成」二次确认）；
// 通讯录里的人 ＋ 名单上已存却不在通讯录的名字都列出来，否则那位孤儿永远移不掉
function _mateOpenMemberEditor() {
  const c = (typeof currentContact === 'function') ? currentContact() : null;
  if (!c || c.kind !== 'group') return;
  const prev = document.getElementById('mateMemPickMask');
  if (prev) prev.remove();
  const inList = new Set(c.members || []);
  const orphans = (c.members || []).filter(n => n && !_mateByName(n));
  const entries = (data.contacts || []).filter(x => x.kind !== 'group')
    .map(x => ({ name: x.name, avatar: x.avatar, gone: false }))
    .concat(orphans.map(n => ({ name: n, avatar: '', gone: true })));
  const mask = document.createElement('div');
  mask.className = 'sheet-mask';
  mask.id = 'mateMemPickMask';
  mask.innerHTML = `<div class="sheet"><div class="sheet-head">${escapeHTML(c.name)} · 勾选在群里的 TA</div>`
    + `<div class="member-pick-list">${entries.length ? entries.map((e, i) => `<div class="member-pick${inList.has(e.name) ? ' on' : ''}" data-mem-toggle="${i}"><span class="avatar member-pick-avatar">${avatarHTML(e.avatar)}</span><span class="member-pick-name">${escapeHTML(e.name)}${e.gone ? '<small class="mate-pick-gone">已不在通讯录</small>' : ''}</span><span class="member-pick-check" aria-hidden="true"></span></div>`).join('') : ''}</div>`
    + `<p class="member-pick-empty" id="matePickHint"${entries.length ? ' hidden' : ''}>${entries.length ? '' : '通讯录里还没有联系人，先「添加联系人」'}</p>`
    + `<button type="button" class="sheet-btn" data-mem-close>关闭</button></div>`;
  document.body.appendChild(mask);
  const hint = $('#matePickHint');
  mask.addEventListener('click', ev => {
    if (ev.target === mask || ev.target.closest('[data-mem-close]')) { mask.remove(); return; }
    const row = ev.target.closest('[data-mem-toggle]');
    if (!row) return;
    const e = entries[Number(row.dataset.memToggle)];
    if (!e) return;
    const cur = (c.members || []).slice();
    const had = cur.indexOf(e.name) >= 0;
    if (had) c.members = cur.filter(n => n !== e.name);
    else {
      if (cur.length >= MATE_MEMBER_MAX) { if (hint) { hint.hidden = false; hint.textContent = '最多 ' + MATE_MEMBER_MAX + ' 位，先取消几位'; } return; }
      c.members = cur.concat([e.name]);
    }
    row.classList.toggle('on', !had);
    if (hint && !hint.hidden) hint.hidden = true;   // 收掉「最多 30 位」那行提示
    save();
    renderMateMembers();
  });
}

const _mateMemEdit = $('#mateMemEdit');
if (_mateMemEdit) _mateMemEdit.addEventListener('click', _mateOpenMemberEditor);
// 「群成员」那张卡里现在只剩一件事：单聊态点某一行＝去那个群（回得来的路）
const _mateMemList = $('#mateMemberList');
if (_mateMemList) _mateMemList.addEventListener('click', e => {
  const row = e.target.closest('[data-mem-open]');
  if (!row) return;
  const gid = row.dataset.memOpen;                 // 这一支只在单聊态出现：值就是群 id，点它＝去那个群（回得来的路）
  if (gid === data.activeChat) return;
  if (typeof switchChat === 'function') switchChat(gid, true);
  showView('mate');
});
// 成员段那一盒五格：归属写在盒子自己身上，不靠兄弟节点位置
const _mateMemPanelBody = $('#mateMemPanelBody');
if (_mateMemPanelBody) _mateMemPanelBody.addEventListener('click', e => {
  const mode = e.target.closest('[data-mem-mode]');
  if (mode) _mateMemSetMode(mode);
});
if (_mateMemPanelBody) _mateMemPanelBody.addEventListener('change', e => {
  const inp = e.target.closest('input[data-mem-key]');
  if (!inp) return;
  const box = inp.closest('.mate-mem-open');
  if (!box || !box.dataset.memName) return;
  _gbhSet(box.dataset.memGid, box.dataset.memName, inp.dataset.memKey, inp.value);
  save();
  renderMateMembers();
  renderMateMemPanel();
});
function _mateMemSetMode(btn) {
  const box = btn.closest('.mate-mem-open');
  if (!box || !box.dataset.memName) return;
  const gid = box.dataset.memGid, name = box.dataset.memName;
  if (btn.dataset.memMode === 'follow') _gbhFollow(gid, name);
  else {
    const b = _gbhGroup(gid);
    for (const k of GBH_KEYS) _gbhSet(gid, name, k, b[k]);
  }
  save();
  renderMateMembers();
  renderMateMemPanel();
}

// 顶部那排成员 chip＝整页分段：切谁，这一屏的按人控件就读写谁（不动 data.activeChat，返回聊天仍停在群里）
const _mateScopeBar = $('#mateScope');
if (_mateScopeBar) _mateScopeBar.addEventListener('click', e => {
  const b = e.target.closest('[data-mate-scope]');
  if (!b) return;
  _mateScope = b.dataset.mateScope;
  _mateScopeChat = data.activeChat;
  if (typeof renderProfile === 'function') renderProfile();   // 一次把按人与按会话的控件全回显到位
  renderFolds();
});
// 删除这一会话：呼出首页长按那同一张动作单
const _mateDelChat = $('#mateDelChat');
if (_mateDelChat) _mateDelChat.addEventListener('click', () => { if (typeof _askDeleteChat === 'function') _askDeleteChat(data.activeChat); });
// 给 TA 手动记个日子：跳到纪念日页并带着这位进来预绑定（openAnnEditor(null, cid)）
const _mateAnnAdd = $('#mateAnnAdd');
if (_mateAnnAdd) _mateAnnAdd.addEventListener('click', () => {
  const c = (typeof currentContact === 'function' && currentContact()) || null;
  const cid = (c && c.id) || '';
  if (typeof showView === 'function') showView('anniversary');
  if (typeof openAnnEditor === 'function') openAnnEditor(null, cid);
});

// 进入「TA 的设置」：回显当前联系人的全套控件
function openMatePage() {
  showView('mate');
  requestAnimationFrame(() => { if (typeof renderProfile === 'function') renderProfile(); renderFolds(); });
}
$('#chatApBtn').addEventListener('click', openMatePage);
const _mateJump = $('#settingsMateBtn');
if (_mateJump) _mateJump.addEventListener('click', openMatePage);
const _mateAvlib = $('#mateAvlibBtn');
if (_mateAvlib) _mateAvlib.addEventListener('click', () => { if (typeof openAvatarLib === 'function') openAvatarLib(); });
// 「去聊天」＝页头那枚胶囊（ui1 sc-mate 页头）：回聊天停在刚才的位置（mate 在 CHAT_SUB_VIEWS 名单里＝不重新定位到底部）
const _mateGoChat = $('#mateGoChat');
if (_mateGoChat) _mateGoChat.addEventListener('click', () => showView('chat'));

// ===== 切换 TA（2026-10-15 用户「设置里【关于某个 TA 的设置】无法切换联系人」）=====
// 旧写法：进入本页编辑对象恒＝当前会话那一位，#mateScope 那排 chips 只在群态出成员，单聊态没有任何
// 「换一位 TA」入口——想改另一位只能退回首页点别的会话再进来。这枚钮补一个整页可见的入口：点它开一个
// 通往通讯录全名单的底部面板，选中＝switchChat(id, true) 就地换编辑对象（与下面「所在群聊」那几行既有
// 走法同一口径，不跳转、不动草稿与未读），并把群态残留的成员分段 _mateScope 归零（换会话不带旧选择）。
// 面板运行时现搭（同 _mateOpenMemberEditor），行样式复用 .member-pick 一族＝零新 CSS、零静态 HTML。
function openMateSwitch() {
  const prev = document.getElementById('mateSwitchMask');
  if (prev) prev.remove();
  const cur = data.activeChat;
  // 只列「有自己那一本会话」的联系人：switchChat 进门就查 data.chats[id]，没档位的列出来点了没反应＝本仓零容忍那一族
  const list = (data.contacts || []).filter(c => c && data.chats && data.chats[c.id]);
  const mask = document.createElement('div');
  mask.className = 'sheet-mask';
  mask.id = 'mateSwitchMask';
  mask.innerHTML = `<div class="sheet"><div class="sheet-head">切换要设置的 TA</div>`
    + `<div class="member-pick-list">${list.length ? list.map(c => `<div class="member-pick${c.id === cur ? ' on' : ''}" data-mate-go="${escapeHTML(c.id)}"><span class="avatar member-pick-avatar">${contactAvatarHTML(c)}</span><span class="member-pick-name">${escapeHTML(chatNameOf(c))}</span><span class="member-pick-check" aria-hidden="true"></span></div>`).join('') : ''}</div>`
    + `<p class="member-pick-empty"${list.length ? ' hidden' : ''}>${list.length ? '' : '通讯录里还没有联系人'}</p>`
    + `<button type="button" class="sheet-btn" data-mate-switch-close>关闭</button></div>`;
  document.body.appendChild(mask);
  mask.addEventListener('click', ev => {
    if (ev.target === mask || ev.target.closest('[data-mate-switch-close]')) { mask.remove(); return; }
    const row = ev.target.closest('[data-mate-go]');
    if (!row) return;
    const id = row.dataset.mateGo;
    mask.remove();
    if (!id || id === cur) return;
    _mateScope = ''; _mateScopeChat = '';   // 换会话＝不带上一位的成员分段选择（renderMateScope 会按新会话归位）
    if (typeof switchChat === 'function') switchChat(id, true);
    showView('mate');
  });
}
const _mateSwitchBtn = $('#mateSwitchBtn');
if (_mateSwitchBtn) _mateSwitchBtn.addEventListener('click', openMateSwitch);

// 形象即点即存：改名字当场落库（原「保存资料／保存我的资料」两枚按钮已删）
function saveMateProfile() {
  const el = $('#nameInput');
  if (!el) return Promise.resolve();
  const name = el.value.trim() || TA_FALLBACK_NAME;
  const c = _mateTarget();          // 群态切到某一位时＝改那位本人，不是改这个群
  // 改没改名按屏上那个名字判（chatName||name＝聊天里显示的那个），不按 c.name——用户看到的「现在的昵称」
  // 可能是覆盖位那份，按 c.name 比会漏报「改了但没反馈」
  const _oldName = c ? (c.chatName || c.name) : (data.profile && data.profile.name) || '';
  // 固定昵称（#346）：与聊天昵称分开的那一格，同一张表单里存
  const _fxEl = $('#fixedNameInput');
  const _oldFixed = c ? (typeof c.fixedName === 'string' ? c.fixedName : '') : '';
  const _fx = _fxEl ? _fxEl.value.trim() : _oldFixed;
  if (c) {
    // 2026-10-14 #364：上面「名字」是**聊天里**那一枚＝与「头像昵称」库同一格 chatName，只写它、
    // 不碰基名 c.name。基名是 fixedNameOf 的回落位，动它＝字卡库/信箱/世界感知那票「聊天以外」的
    // 牌子跟着翻——那就是用户报的「上面名字能修改全部地方的名字，莫名其妙的」（页头那句分工
    // 说明成了假话）。群名是群的身份（群没有聊天昵称那一族），仍写 c.name。
    // 留空＝取消覆盖、回基名（页头那句「留空＝跟随名字」）。
    if (c.kind === 'group') c.name = name;
    else c.chatName = el.value.trim();
    c.fixedName = _fx;
  }
  if (!c || c.id === 'c0') data.profile.name = name;
  const t = $('#mxContactTimbre');
  if (c && t) c.mmTimbre = t.value.trim();
  save();
  // 音色刚改完，小喇叭的显隐要立刻跟上：增量渲染不重建已有气泡，先复位计数再全量画一次
  if (typeof resetMessageRender === 'function') resetMessageRender();
  if (typeof renderMessages === 'function') renderMessages();
  if (typeof renderChatsList === 'function') renderChatsList();
  if (typeof updateTopbarTitle === 'function') updateTopbarTitle(document.body.dataset.view || 'chats');
  // 名字真变了给一句反馈：旧写法静默落库，用户改完不知道存没存（#339 那一族「看不出生效」）。
  // 比的是**屏上那个名字**（群＝群名；单聊＝chatName 回落基名），不是输入框原文——清空框回基名时
  // 屏上没变就不该弹「已保存」（#364：假反馈与没反馈同一族，两头都要收）
  const _newName = c ? (c.kind === 'group' ? c.name : (c.chatName || c.name)) : name;
  if (_newName !== _oldName) showToast('昵称已保存');
  else if (_fx !== _oldFixed) showToast('固定昵称已保存');
  renderFoldSummaries();
  return Promise.resolve();
}
// 「我的形象」那一行改的是**这一本会话**那一份覆盖（2026-10-08 按会话分开）：
// 清空名字＝取消覆盖、回到全局那一份（不是把自己叫成「我」），头像那一半由「恢复跟随全局」那枚钮收。
function saveMateMe() {
  const el = $('#myNameInput');
  if (!el) return Promise.resolve();
  const r = chatMyRowOf(data.activeChat);
  if (r) r.myChatName = el.value.trim();
  else if (data.me) data.me.name = el.value.trim() || '我';
  save();
  if (typeof renderMessages === 'function') renderMessages();
  renderProfile();
  return Promise.resolve();
}
// 收掉这一本会话的两样覆盖（名字与头像一起回全局）——只有真存着覆盖时这枚钮才在屏上（见 renderProfile）
function resetMateMe() {
  const r = chatMyRowOf(data.activeChat);
  if (!r) return;
  r.myChatName = ''; r.myChatAvatar = '';
  save();
  if (typeof renderMessages === 'function') renderMessages();
  renderProfile();
}
['#nameInput', '#fixedNameInput', '#mxContactTimbre'].forEach(sel => {
  const el = $(sel);
  if (el) el.addEventListener('change', saveMateProfile);
});
// 2026-10-13 用户「打开聊天设置 无法直接点击更换联系人现在的昵称」：那枚名字输入框透明底粗体、
// 「名字」标签又是 font-size:0 藏着的，看着像一行标题——发现不了就等于不能改。铅笔钮只做一件事：
// 把焦点送进输入框并全选（一处实现，不另开编辑面板；保存链仍是上面的 change→saveMateProfile）。
const _mateNameEdit = $('#mateNameEdit');
if (_mateNameEdit) _mateNameEdit.addEventListener('click', () => {
  const el = $('#nameInput');
  if (!el) return;
  el.focus();
  if (typeof el.select === 'function') el.select();
});
const _myNameEl = $('#myNameInput');
if (_myNameEl) _myNameEl.addEventListener('change', saveMateMe);
const _myFollowEl = $('#myFollowGlobal');
if (_myFollowEl) _myFollowEl.addEventListener('click', resetMateMe);

// ===== 顶部分组 tag（2026-10-14 BUGS #408）=====
// 一排六档＝形象∶回话∶主动∶外观∶声音∶记录，一屏只画一档（html/view-mate.html 的 #mateTags）。
// 起因＝用户「【美化设置】在回话方式的分类里，实在是非常莫名其妙」——分组只管把卡摆对归属，
// 各卡的读写与保存链一字未动（behavior 的自动保存仍走 settings.js 那条 _autoSaveCard，本文件不加第二份）。
// 形制沿「更多」页那排组 tag：布局在 css/mate.css，面与选中态由 css/mono.css ③ 全站名单供。
// 停留哪一档记本机 ordinal-mate-tab：同 ordinal-stats-tab／ordinal-more-tab 那一族——阅读档位
// 不进 data、不进备份；脏值与没存过都回落「形象」＝不做空白档。
const MATE_TABS = ['profile', 'reply', 'proactive', 'look', 'sound', 'log'];
const MATE_TAB_KEY = 'ordinal-mate-tab';
let _mateTab = 'profile';
// 成员段里「形象」「外观」两组整组是按会话/本群那份走的东西（fold 的 hiding 同一判断，css/mate.css
// 那段账）＝tag 与组一起收；正停在收起的档上就当场改停「回话」（回话组在成员段至少亮着情绪卡，#309 按人一份）
function _mateTabHiddenIn(t) {
  const view = $('#mateView');
  return !!(view && view.dataset.mateScope === 'mem' && (t === 'profile' || t === 'look'));
}
function _mateTabApply() {
  if (_mateTabHiddenIn(_mateTab)) _mateTab = 'reply';
  $$('#mateTags .mate-tag').forEach(b => {
    const t = b.dataset.matetab;
    b.hidden = _mateTabHiddenIn(t);
    b.classList.toggle('on', t === _mateTab);
  });
  $$('#mateView .mate-grp').forEach(g => { g.hidden = g.dataset.mateGrp !== _mateTab; });
}
function _mateTabSet(t) {
  if (MATE_TABS.indexOf(t) < 0 || t === _mateTab) return;
  _mateTab = t;
  try { localStorage.setItem(MATE_TAB_KEY, t); } catch {}
  _mateTabApply();
  const body = document.querySelector('.mate-body');
  if (body) body.scrollTop = 0;   // 切组回顶（同设置页切格把列表滚回顶那条）
}
const _mateTagRow = $('#mateTags');
if (_mateTagRow) _mateTagRow.addEventListener('click', e => {
  const b = e.target.closest('[data-matetab]');
  if (b) _mateTabSet(b.dataset.matetab);
});
// 初次装载：读上次停的档（脏值与没存过都回落 profile）并把组显隐归位——
// 静态 HTML 写死 profile 可见只是无 JS 的兜底，这里再按账核一遍
(function () {
  let v = '';
  try { v = localStorage.getItem(MATE_TAB_KEY) || ''; } catch {}
  if (MATE_TABS.indexOf(v) >= 0) _mateTab = v;
  _mateTabApply();
})();
