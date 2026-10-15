// ===== 字卡分组管理 =====

// 搜索防抖（BUG #048）：字卡上千张后每敲一个字符都要重扫全库拼 HTML（实测 5000 张时单次 470ms，
// 边打边卡成幻灯片）。改成停手 220ms 才真渲染，输入框本身照常即时回显。
let _groupSearchTimer = null;
$('#cardsSearchRow').addEventListener('input', e => {
  if (e.target.id !== 'groupSearchInput') return;
  const v = e.target.value;
  if (_groupSearchTimer) clearTimeout(_groupSearchTimer);
  _groupSearchTimer = setTimeout(() => { _groupSearchTimer = null; groupSearch = v; renderGroups(); }, 220);
});
$('#cardsSearchToggle').onclick = () => {
  const inp = $('#groupSearchInput');
  if (!inp) return;
  try { inp.scrollIntoView({ block: 'center' }); } catch {}
  inp.focus();
};

// ⋯ 更多操作弹层
$('#cardsMoreBtn').onclick = () => { $('#cardsMoreMask').hidden = false; };
$('#cardsMoreClose').onclick = () => { $('#cardsMoreMask').hidden = true; };
$('#cardsMoreMask').addEventListener('click', e => { if (e.target === $('#cardsMoreMask')) $('#cardsMoreMask').hidden = true; });
$('#cardsMoreMask').addEventListener('click', e => { if (e.target.closest('.cards-menu-item')) $('#cardsMoreMask').hidden = true; });

// 绑定联系人弹层：整组字卡绑给某个会话联系人（g.contactId）
// 2026-10-13 #346 起这一面改读 **fixedNameOf**（固定昵称）：字卡库是「聊天以外」的功能，用户定档
// 「头像昵称里换的那个可能换得太勤，其他功能的牌子不跟着翻」——所以这里与首页会话行**故意不同名**
// （那一行走 chatNameOf）。读 c.name 会显示成「基础资料那份」，固定昵称没单独设过时也正是回落它。
let _bindGi = -1;
function _newGroup(name, category) {
  return { name, category, scope: currentCardsScope, cards: [] };
}
// 专属档正看着哪位就建在谁名下（「切换联系人」那一行的配套，2026-10-11）：不落主人＝建完进
// 「没绑给谁」当场从屏上消失（#051 停用态）。公用档与「全部」那格不替用户挑主人
function _newGroupOwnerOf() {
  if (currentCardsScope !== 'own') return '';
  if (!currentCardsWho || currentCardsWho === 'all' || currentCardsWho === '_none') return '';
  return (data.contacts || []).some(c => c.id === currentCardsWho) ? currentCardsWho : '';
}
function openCardsBindSheet(gi) {
  const g = data.groups[gi];
  if (!g || g.system) return;
  _bindGi = gi;
  const cur = g.contactId || '';
  const row = (id, av, label) => `<button class="bind-row" data-bind-id="${escapeHTML(id)}"><span class="bind-av${id ? '' : ' free'}">${av}</span>${escapeHTML(label)}${cur === id ? '<span class="bind-check">✓</span>' : ''}</button>`;
  const rest = (data.groups || []).filter(x => x && !x.preset && !x.system && cardScope(x) === 'own' && !x.contactId && x !== g);
  // #412 批量绑定：导入一整本专属卡后不想一组组点——选人的同时可勾「其余未绑定的组一起给他」。
  // 只数**专属且未绑定**的组（公用本来就人人可用，没有「绑」可言；预置组另有专有分类管着）
  const alsoHtml = rest.length
    ? `<label class="bind-all"><input type="checkbox" id="cardsBindAlso"><span>同时把其余 ${rest.length} 个未绑定分组也绑给 TA</span></label>`
    : '';
  const emptyHtml = (data.contacts || []).length
    ? ''
    : '<div class="bind-empty">还没有联系人：先到聊天页右上加一位，再来把字卡绑给 TA。</div>';
  $('#cardsBindList').innerHTML =
    (cur ? '' : '<div class="bind-note">这组卡现在是「未绑定」＝哪位 TA 都取不到；点下面一位，这组就归 TA 用。</div>') +
    row('', '∅', '未绑定（TA 用不到这组字卡）') +
    (data.contacts || []).map(c => row(c.id, contactAvatarHTML(c), (fixedNameOf(c) || '未命名') + (c.kind === 'group' ? ' · 群' : ''))).join('') +
    emptyHtml + alsoHtml;
  $('#cardsBindMask').hidden = false;
}
// 绑定层只管「这组专属卡归谁」：挑人→落 contactId→重画（2026-10-11 纠偏：公用就是公用，
// 不能绑定为专属——#259 那条「翻去专属」的路已收档，公用组不进这层）。
function _closeCardsBind() {
  $('#cardsBindMask').hidden = true;
}
$('#cardsBindClose').onclick = _closeCardsBind;
$('#cardsBindMask').addEventListener('click', e => {
  if (e.target === $('#cardsBindMask')) { _closeCardsBind(); return; }
  const r = e.target.closest('[data-bind-id]');
  if (!r || _bindGi < 0 || !data.groups[_bindGi]) return;
  const id = r.dataset.bindId;
  const also = !!(document.getElementById('cardsBindAlso') && document.getElementById('cardsBindAlso').checked);
  _closeCardsBind();
  data.groups[_bindGi].contactId = id;
  // #412 批量绑定：勾上就把全库其余「专属且未绑定」的组一并落到这位名下（解「导入一整本还要一组组点」）
  let extra = 0;
  if (id && also) {
    (data.groups || []).forEach(x => {
      if (x && !x.preset && !x.system && x !== data.groups[_bindGi] && cardScope(x) === 'own' && !x.contactId) { x.contactId = id; extra++; }
    });
  }
  save();
  renderGroups();
  const nm = (data.contacts || []).find(c => c.id === id);
  showToast(!id ? '已解绑 · TA 用不到这组字卡'
    : '已绑定：' + (fixedNameOf(nm) || '未命名') + (extra ? `（连同另外 ${extra} 组一起给了 TA）` : ''));
});

// ===== 分组命名 / 选组两块站内面板：替掉浏览器自带的 prompt（#246·#275 同族病在字卡库剩余四处的收口，BUGS #286）=====
// 旧写法点「新建分组」弹的是系统白框＝浏览器自带弹层，没有本仓的贴底面板壳。面板只管「那串字从哪儿拿」，
// 拿回来之后各调用点自己走原链（push → save → 重画），与 #275 同一条口径。
let _nameOk = null;
function _askGroupName(o) {
  _nameOk = typeof o.onOk === 'function' ? o.onOk : null;
  $('#cardsNameTitle').textContent = o.title || '新建分组';
  $('#cardsNameHint').textContent = o.hint || '名字会显示在分组列表里';
  $('#cardsNameInput').value = o.value || '';
  $('#cardsNameMask').hidden = false;
  $('#cardsNameInput').focus();
  $('#cardsNameInput').select();
}
function _closeNamePanel() { $('#cardsNameMask').hidden = true; _nameOk = null; }
$('#cardsNameClose').onclick = _closeNamePanel;
$('#cardsNameCancel').onclick = _closeNamePanel;
$('#cardsNameMask').addEventListener('click', e => { if (e.target === $('#cardsNameMask')) _closeNamePanel(); });
$('#cardsNameOk').onclick = () => {
  const name = $('#cardsNameInput').value.trim();
  if (!name) { showToast('先起个分组名'); return; }
  const ok = _nameOk; _closeNamePanel();
  if (ok) ok(name);
};
$('#cardsNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#cardsNameOk').click(); } });

$('#newCardGroup').onclick = () => _askGroupName({
  value: '新字卡组',
  onOk: async name => {
    const ng = _newGroup(name, currentCardsTab); ng.contactId = _newGroupOwnerOf();
    data.groups.push(ng);
    selectedGroupName = name;
    groupSearch = '';
    await save();
    renderGroups();
  }
});

// 字卡库与「系统预设字卡」共用一套列表操作：容器 id 决定这一侧只看自建组还是只看预置组
async function _cardsListClick(e) {
  if (_lpFired) { _lpFired = false; return; }   // 长按刚落进批量管理：抬手漏出来的那发 click 别再当点击算
  const root = e.currentTarget;
  const presetOnly = root.id === 'sysCardList';
  const paint = () => renderGroups('#' + root.id, presetOnly ? '#sysCardsSub' : '#cardsSub', presetOnly);
  const sc = e.target.closest('[data-cards-scope]');
  if (sc) { currentCardsScope = sc.dataset.cardsScope; saveCardsScope(); selectedGroupName = ''; groupSearch = ''; cardsBatchSel.clear(); paint(); updateBatchBar(); return; }
  const tab = e.target.closest('[data-cards-tab]');
  if (tab) { if (presetOnly) currentSysCardsTab = tab.dataset.cardsTab; else currentCardsTab = tab.dataset.cardsTab; selectedGroupName = ''; groupSearch = ''; cardsBatchSel.clear(); paint(); updateBatchBar(); return; }
  const chip = e.target.closest('[data-group-chip]');
  if (chip) { selectedGroupName = chip.dataset.groupChip; paint(); return; }
  // 按人筛（BUGS #265）：点一位＝只看这一位的专属组；分组 chips 行与墙一起跟着收，
  // 选中那组若不属于这一位由 renderGroups 里那句守卫清掉（不留「屏上没这组却还在编辑它」）
  const who = e.target.closest('[data-cards-who]');
  if (who) { saveCardsWho(who.dataset.cardsWho); selectedGroupName = ''; groupSearch = ''; cardsBatchSel.clear(); paint(); updateBatchBar(); return; }
  const gb = e.target.closest('[data-group-bind]');
  if (gb) { openCardsBindSheet(Number(gb.dataset.groupBind)); return; }
  // 专属→公用：这一格只剩这一个方向（2026-10-11 纠偏：公用就是公用，不能绑定为专属，
  // #259 那半条（公用翻成专属）收档；要给谁专属卡就在专属档建组建给谁）。
  const gs = e.target.closest('[data-group-scope]');
  if (gs) {
    const sgi = Number(gs.dataset.groupScope);
    const sg = data.groups[sgi];
    if (!sg || sg.system || sg.preset) return;
    if (cardScope(sg) !== 'own') return;   // 公用组没有这条路（钮也不会长）；委托里再拦一道
    currentCardsScope = 'public';
    saveCardsScope();                     // 跟着这一组走到公用档，别让刚点的那组在屏上凭空消失
    sg.scope = 'public';
    sg.contactId = '';                    // 公用不看绑定，留一格旧 contactId＝没人读的死人账
    await save();
    paint();
    showToast('已改成公用 · 所有会话都用得到');
    return;
  }
  const gai = e.target.closest('[data-group-add-img]');
  if (gai) { _imgTargetGi = Number(gai.dataset.groupAddImg); $('#cardsImgInput').click(); return; }
  // 单独导出这一句的录音：不重画列表、不落库（只是把已有的一段字节交给系统）
  const ve = e.target.closest('[data-card-voice-export]');
  if (ve) {
    const row = _voiceRowAt(ve.dataset.group + ':' + ve.dataset.card);
    if (row) _exportVoiceOne(row); else showToast('这张卡的录音不在库里了');
    return;
  }
  if (cardsBatchMode && !presetOnly) {
    const item = e.target.closest('[data-sel-key]');
    if (item) {
      const k = item.dataset.selKey;
      if (cardsBatchSel.has(k)) { cardsBatchSel.delete(k); item.removeAttribute('data-sel'); }
      else { cardsBatchSel.add(k); item.setAttribute('data-sel', '1'); }
      updateBatchBar();
    }
    return;
  }
  const gd = e.target.closest('[data-group-delete]');
  const cd = e.target.closest('[data-card-delete]');
  const ce = e.target.closest('[data-card-edit]');
  const ga = e.target.closest('[data-group-idx]');
  const ca = e.target.closest('[data-category]');
  // #411 分组使用权开关：字卡库与系统预设字卡两面共用这套列表操作，两边都长这枚钮
  const go = e.target.closest('[data-group-off]');
  if (go) {
    const ogi = Number(go.dataset.groupOff);
    const og = data.groups[ogi];
    if (!og) return;
    og.off = !og.off;
    await save();
    paint();
    showToast(og.off ? `已停用分组「${og.name || '未命名'}」：TA 用不到这组字卡（组内单卡开关原样保留）`
      : `已启用分组「${og.name || '未命名'}」：恢复使用`);
    return;
  }
  // #411 单卡使用权开关：文字/语音按内容记账（g.offCards），图片对象卡内联 c.off
  const co = e.target.closest('[data-card-off]');
  if (co) {
    const cgi = Number(co.dataset.group), cci = Number(co.dataset.card);
    const cg = data.groups[cgi];
    const card = cg && cg.cards ? cg.cards[cci] : null;
    if (card == null) return;
    const nowOff = !cardIsOff(cg, card);
    cardSetOff(cg, card, nowOff);
    await save();
    paint();
    const lab = cardText(card) || (cardImage(card) ? '这张图' : (voiceCardParts(card) || {}).name || '这张卡');
    showToast((nowOff ? '已停用：' : '已恢复：') + (lab.length > 18 ? lab.slice(0, 18) + '…' : lab));
    return;
  }
  if (gd) {
    const dgi = Number(gd.dataset.groupDelete);
    const dname = data.groups[dgi]?.name;
    openModal('删除分组', '', async () => {
      data.groups.splice(dgi, 1);
      if (selectedGroupName && selectedGroupName === dname) selectedGroupName = '';
      await save();
      paint();
    }, { noInput: true, staticText: `删除「${dname || '未命名分组'}」？组里的字卡一起删掉，不可恢复。`, okText: '删除', danger: true });
    return;   // 确认面板自己管落库与重画；取消＝什么都不发生（旧写法 confirm 取消后还会落进后面的分支）
  }
  if (cd) {
    const gi = Number(cd.dataset.group);
    const ci = Number(cd.dataset.card);
    const card = data.groups[gi]?.cards?.[ci];
    if (card == null) return;
    const v = voiceCardParts(card);
    const show = String(v ? v.name : card);
    openModal('删除字卡', '', async () => {
      if (data.groups[gi]?.cards?.[ci] != null) { cardOffPrune(data.groups[gi], card); data.groups[gi].cards.splice(ci, 1); }
      await save();
      paint();
    }, { noInput: true, staticText: `删除「${show.length > 24 ? show.slice(0, 24) + '…' : show}」？删了不可恢复。`, okText: '删除', danger: true });
    return;   // 确认面板自己管落库与重画；取消＝什么都不发生（旧写法一碰就删＝没有确认）
  }
  if (ce) { openCardEdit(Number(ce.dataset.group), Number(ce.dataset.card), paint); return; }
  if (ga) { _clOpen(Number(ga.dataset.groupIdx)); return; }   // 落库与重画交给那块面板；这里 early-return＝不开一层没发生的 save＋全量重画
  if (ca) {
    const cat = ca.dataset.category;
    _askGroupName({
      value: '新字卡组',
      onOk: async name => {
        const ng2 = _newGroup(name, cat); ng2.contactId = _newGroupOwnerOf();
        data.groups.push(ng2);
        await save();
        paint();
      }
    });
    return;   // 命名面板自己管落库与重画；这里不开一层没发生的 save＋全量重画
  }
  await save();
  paint();
}
$('#groupList').addEventListener('click', _cardsListClick);
$('#sysCardList').addEventListener('click', _cardsListClick);

// ===== 「＋ 添加」的批量输入面板（BUGS #275）=====
// 旧写法点它弹的是浏览器自带的 prompt＝手机上那枚系统白框（与「添加昵称」#246 被打回的是同一族病），
// 且一次只能填一句。面板只管「那串字从哪儿拿」：拿回来之后那条链（拆行 → 去首尾空白·丢空行 →
// 与这组已有同文的跳过 → push → save → 重画 → 一句实话）只在这一个函数里，与 #246·#261 同一条口径。
let _clGi = -1, _clDone = null;
function _clGroup(gi) { const g = (data.groups || [])[gi]; return g && !g.system ? g : null; }
function _clOpen(gi, onDone) {
  const g = _clGroup(gi);
  if (!g) return;                        // 系统内置组不可修改＝不开一块填了也存不进去的输入框（屏上本来也不长那枚钮）
  _clGi = gi; _clDone = typeof onDone === 'function' ? onDone : null;
  const ti = $('#cardLinesTi'), inp = $('#cardLinesInput');
  if (ti) ti.textContent = '往「' + g.name + '」加字卡';
  if (inp) inp.value = '';               // 每次开都是新的一批：上一批凡能进的已进组，留着只会被再读一遍
  const mask = $('#cardLinesMask'); if (mask) mask.hidden = false;
  if (inp) setTimeout(() => { try { inp.focus(); } catch (e) {} }, 60);   // 与添加昵称同款：等这一帧排完再要键盘
}
function _clClose() { const m = $('#cardLinesMask'); if (m) m.hidden = true; _clGi = -1; _clDone = null; }
function _clSubmit() {
  const g = _clGroup(_clGi), done = _clDone;
  if (!g) { _clClose(); return; }
  const inp = $('#cardLinesInput');
  const raw = inp ? inp.value : '';
  if (!String(raw).trim()) { showToast('先写一张'); return; }   // 空着点「添加」给一句实话，不是没反应
  const lines = String(raw).split(/\r\n|\r|\n|\u2028|\u2029/).map(s => s.trim()).filter(Boolean);
  let added = 0, dup = 0;
  lines.forEach(s => { if (g.cards.includes(s)) { dup++; return; } g.cards.push(s); added++; });
  save();
  if (g.preset) renderGroups('#sysCardList', '#sysCardsSub', true); else renderGroups();
  showToast(added ? `加了 ${added} 张${dup ? `，${dup} 张这组里已有` : ''}` : '这些这组里已有');
  _clClose();
  if (done) done();
}
// 三处收回：× ∶ 取消 ∶ 点面板外的遮罩空白。点面板里不收＝打字打到一半别把这一发丢掉
const _clYes = $('#cardLinesYes'); if (_clYes) _clYes.onclick = _clSubmit;
const _clNo = $('#cardLinesNo'); if (_clNo) _clNo.onclick = _clClose;
const _clX = $('#cardLinesClose'); if (_clX) _clX.onclick = _clClose;
const _clMask = $('#cardLinesMask');
if (_clMask) _clMask.addEventListener('click', e => { if (e.target === _clMask) _clClose(); });

// 当前可见字卡的 (组:卡) key 列表：选中分组=该组字卡，全部=当前分类所有字卡；搜索时只保留内容命中的字卡
// 批量管理只作用在字卡库那一侧，预置组不参与（它们在独立页浏览，勾选框不渲染）
function visibleCardKeys() {
  const q = groupSearch.trim().toLowerCase();
  const keys = [];
  for (let gi = 0; gi < data.groups.length; gi++) {
    const g = data.groups[gi];
    if (g.preset) continue;
    if (cardScope(g) !== currentCardsScope) continue;
    if ((g.category || '主字卡') !== currentCardsTab) continue;
    if (!cardsBatchMode && selectedGroupName && g.name !== selectedGroupName) continue;
    for (let ci = 0; ci < g.cards.length; ci++) {
      if (q && (typeof g.cards[ci] !== 'string' || !g.cards[ci].toLowerCase().includes(q))) continue;
      keys.push(`${gi}:${ci}`);
    }
  }
  return keys;
}
// 钮上的字要换、钮右侧那句「长按字卡也可」不许跟着没——所以只写那一枚 .menu-label（BUGS #359）。
// 直接 btn.textContent＝连说明一起抹掉（进一次批量管理屏上就少一句只有这里说的话）。
function _batchBtnLabel(btn, text) {
  const lab = btn.querySelector('.menu-label');
  if (lab) lab.textContent = text; else btn.textContent = text;   // 退回旧形状：说明不在了才整块写
}
function updateBatchBar() {
  const el = $('#batchSelCount');
  if (el) el.textContent = `已选 ${cardsBatchSel.size} 项`;
  // 「导出语音」只在语音那一档出现：别的分类里它永远只能弹一句「选中的没有语音卡」＝一枚点不动的钮
  const ex = $('#batchExportVoice');
  if (ex) ex.hidden = currentCardsTab !== '语音';
}
function exitCardsBatch() {
  cardsBatchMode = false;
  cardsBatchSel.clear();
  const bar = $('#cardsBatchBar');
  if (bar) bar.hidden = true;
  const btn = $('#toggleBatchCards');
  if (btn) { _batchBtnLabel(btn, '批量管理'); btn.classList.remove('active'); }
  renderGroups();
}
$('#toggleBatchCards').onclick = () => {
  if (cardsBatchMode) { exitCardsBatch(); return; }
  enterCardsBatch('');   // 菜单那枚＝空手进管理；长按那一发＝带着那张卡当场选中（见下）
};
$('#batchSelectAll').onclick = () => {
  const all = visibleCardKeys();
  if (cardsBatchSel.size === all.length && all.length) cardsBatchSel.clear();
  else { cardsBatchSel.clear(); all.forEach(k => cardsBatchSel.add(k)); }
  renderGroups();
  updateBatchBar();
};
$('#batchMove').onclick = () => {
  // #415 「放入分组无反应」实解之一：没勾卡时这里是静默 return＝点了像没点（本仓零容忍那一族）
  if (!cardsBatchSel.size) { showToast('先勾选要移动的字卡'); return; }
  $('#cardsMoveList').innerHTML = data.groups.map((g, i) => {
    const c = g.contactId ? (data.contacts || []).find(x => x.id === g.contactId) : null;
    return `<button type="button" class="cards-pick-row" data-move-gi="${i}">${escapeHTML(g.name)}<small>（${g.category || '主字卡'}·${cardScope(g) === 'public' ? '公用' : '专属'}${c ? '·@' + escapeHTML(fixedNameOf(c) || '未命名') : ''}）</small></button>`;
  }).join('');
  $('#cardsMoveMask').hidden = false;
};
$('#cardsMoveClose').onclick = () => { $('#cardsMoveMask').hidden = true; };
$('#cardsMoveCancel').onclick = () => { $('#cardsMoveMask').hidden = true; };
$('#cardsMoveMask').addEventListener('click', e => { if (e.target === $('#cardsMoveMask')) $('#cardsMoveMask').hidden = true; });
$('#cardsMoveList').addEventListener('click', async e => {
  const r = e.target.closest('[data-move-gi]');
  if (!r) return;
  const ti = Number(r.dataset.moveGi);
  $('#cardsMoveMask').hidden = true;
  if (!(ti >= 0) || ti >= data.groups.length) return;
  const byGroup = {};
  for (const k of cardsBatchSel) { const p = k.split(':'); const gi = +p[0], ci = +p[1]; byGroup[gi] = byGroup[gi] || []; byGroup[gi].push(ci); }
  const moved = [];
  for (const gi of Object.keys(byGroup).map(Number)) {
    const cis = byGroup[gi].sort((a, b) => b - a);
    for (const ci of cis) { const txt = data.groups[gi].cards.splice(ci, 1)[0]; if (txt != null) moved.push(txt); }
  }
  // #415 「无反应」实解之二：移动成功原先一声不吭——同分类移动在屏上几乎看不出变化＝读成没生效。
  // 一句 toast 把「搬了几张、进了哪组」说破（组里已有的重复卡跳过，账要跟屏上对得上）
  let added = 0;
  for (const t of moved) if (!data.groups[ti].cards.includes(t)) { data.groups[ti].cards.push(t); added++; }
  cardsBatchSel.clear();
  await save();
  renderGroups();
  updateBatchBar();
  showToast(`已把 ${added} 张字卡放进「${data.groups[ti].name || '未命名'}」` + (moved.length !== added ? `（${moved.length - added} 张组里已有，跳过重复）` : ''));
});
$('#batchDelete').onclick = () => {
  if (!cardsBatchSel.size) return;
  openModal('批量删除', '', async () => {
    const byGroup = {};
    for (const k of cardsBatchSel) { const p = k.split(':'); const gi = +p[0], ci = +p[1]; byGroup[gi] = byGroup[gi] || []; byGroup[gi].push(ci); }
    for (const gi of Object.keys(byGroup).map(Number)) {
      const cis = byGroup[gi].sort((a, b) => b - a);
      for (const ci of cis) { const c = data.groups[gi].cards[ci]; if (c != null) cardOffPrune(data.groups[gi], c); data.groups[gi].cards.splice(ci, 1); }
    }
    cardsBatchSel.clear();
    await save();
    renderGroups();
    updateBatchBar();
  }, { noInput: true, staticText: `删除选中的 ${cardsBatchSel.size} 张字卡？删除后不可恢复。`, okText: '删除', danger: true });
};
$('#batchCancel').onclick = exitCardsBatch;

// ===== 编辑单张字卡（2026-10-11 用户直派：单独「复制」整族退役，BUGS #289）=====
// 复制只把一句文本丢进剪贴板、屏上连一句回音都没有；编辑才是这一格缺的动作。壳直接用全站唯一那枚
// openModal（#288 起兼输入与确认两档）＝不为单行改字再养一块面板。文字卡改整句（同组已有同文拦下）；
// 语音卡只改第一段名字（「名称|||…」拆段回拼，tts 记号与录音字节原样带回）；图片卡没有文字＝
// render 那头本来就不长这枚钮。落库与重画交给调用点递进来的 paint（字卡库与系统预设字卡两面各回各的面）。
function openCardEdit(gi, ci, paint) {
  const g = data.groups[gi];
  const card = g && g.cards ? g.cards[ci] : null;
  if (card == null) return;
  if (typeof card !== 'string') { showToast('图片字卡没有文字可改'); return; }
  const v = voiceCardParts(card);
  // 拦下（同文）时把面板原样再开一次＝改到一半的字不丢；一个字没变＝不开一层没发生的 save
  const ask = cur => openModal('编辑字卡', cur, async val => {
    const t = String(val || '').trim();
    if (!t) { showToast('先写点什么'); ask(''); return; }
    let next = t;
    if (v) { const segs = card.split('|||'); segs[0] = t; next = segs.join('|||'); }   // 只换名字那一段
    if (next === card) return;
    if (!v && g.cards.includes(next)) { showToast('这组里已有这句'); ask(t); return; }
    cardOffPrune(g, card);   // 旧内容已不在：它的停用记账跟着摘掉（改完默认恢复可用）
    g.cards[ci] = next;
    await save();
    if (typeof paint === 'function') paint(); else renderGroups();
    showToast('已保存');
  }, v ? { staticText: '这是语音卡：改的是显示的名字，录音不动。' } : undefined);
  ask(v ? v.name : card);
}

// ===== 长按字卡进批量管理（2026-10-11 用户直派，BUGS #289）=====
// 按住 500ms 落进批量模式并当场选中这一张；随后那发 click 由 _lpFired 拦下（重画之后落点上换成了
// 新元素，不能让旧手势把它误勾掉）。只挂 #groupList＝字卡库这一面（批量管理本来不作用在预置页）；
// 按到钮上不触发（编辑/删除各有各的事）、挪动超 8px 当滚动收手；contextmenu 拦掉＝安卓长按不弹系统菜单。
let _lpTimer = null, _lpFired = false, _lpX = 0, _lpY = 0;
function _lpCancel() { if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; } }
function enterCardsBatch(firstKey) {
  cardsBatchMode = true;
  cardsBatchSel.clear();
  if (firstKey) cardsBatchSel.add(firstKey);
  $('#cardsBatchBar').hidden = false;
  const btn = $('#toggleBatchCards');
  if (btn) { _batchBtnLabel(btn, '退出管理'); btn.classList.add('active'); }
  renderGroups();
  updateBatchBar();
  showToast('已进入批量管理 · 点字卡勾选');
}
const _gl = $('#groupList');
_gl.addEventListener('pointerdown', e => {
  if (cardsBatchMode || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const item = e.target.closest('.card-item');
  if (!item || !item.dataset.selKey || e.target.closest('button')) return;
  _lpCancel();
  _lpX = e.clientX; _lpY = e.clientY;
  _lpTimer = setTimeout(() => { _lpTimer = null; _lpFired = true; enterCardsBatch(item.dataset.selKey); }, 500);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(t => _gl.addEventListener(t, _lpCancel));
_gl.addEventListener('pointermove', e => { if (_lpTimer && (Math.abs(e.clientX - _lpX) > 8 || Math.abs(e.clientY - _lpY) > 8)) _lpCancel(); });
_gl.addEventListener('contextmenu', e => { if (e.target.closest('.card-item')) e.preventDefault(); });

// ===== 导入字卡：自动识别三种格式 =====
// ① 言字卡 导出（数组或 {groups:[{name,category,scope,cards}]}）
// ② mochi 全量导出（{app:'mochi-ccfull', data:{ccPub,ccOwn,ccPubFun,ccOwnFun}}，每库为 {分类键:[[组名,[卡...]],...]}）
// ③ mochi 单库导出（{text:[...],kaomoji:[...],...}，无法从文件区分公用/专属，弹确认选择作用域）
const _MOCHI_CAT = { text: '主字卡', kaomoji: '颜文字', emoji: 'emoji', sticker: '表情包', image: '图片', poke: '拍一拍', voice: '语音' };
function _mochiCatOf(t) { return _MOCHI_CAT[t] || null; }
function _mergeMochiLibs(a, b) {
  const out = {};
  Object.keys(a || {}).forEach(k => { out[k] = Array.isArray(a[k]) ? a[k].slice() : []; });
  Object.keys(b || {}).forEach(k => { out[k] = (out[k] || []).concat(Array.isArray(b[k]) ? b[k] : []); });
  return out;
}
// 识别 mochi 字卡对象，返回 { public: lib|null, own: lib|null }；不是 mochi 格式返回 null
function _parseMochiCards(parsed, fname) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (parsed.app === 'mochi-ccfull' && parsed.data && typeof parsed.data === 'object') {
    const d = parsed.data;
    const pick = (main, fun) => !main && !fun ? null : (main && fun ? _mergeMochiLibs(main, fun) : (main || fun));
    return { public: pick(d.ccPub, d.ccPubFun), own: pick(d.ccOwn, d.ccOwnFun) };
  }
  const keys = Object.keys(parsed);
  const isRawLib = keys.length > 0 && keys.every(k => parsed[k] == null || Array.isArray(parsed[k])) &&
    keys.some(k => Array.isArray(parsed[k]) && parsed[k].length && Array.isArray(parsed[k][0]) && typeof parsed[k][0][0] === 'string');
  if (!isRawLib) return null;
  return { raw: parsed };   // 裸 mochi 库：归公用还是专属由调用方弹三键面板问（#288 收掉 confirm 二选一）
}
// mochi 裸库问方向：公用/专属/取消三键，两个肯定义各占一枚（旧写法借 confirm 的「取消」表达「专属」）
function _askMochiScope(fname) {
  return new Promise(resolve => {
    openModal('mochi 字卡导入', '', () => resolve('public'), {
      noInput: true,
      staticText: '检测到 mochi 字卡库数据（' + (fname || '未命名文件') + '）。导入到哪一边？',
      okText: '导入到公用',
      midBtn: { label: '导入到专属', onPick: () => resolve('own') },
      onCancel: () => resolve(null)
    });
  });
}
// 把一个 mochi 库（{分类键:[[组名,[卡...]],...]}）写入当前字卡库；媒体卡（dataURL）进 jobs 稍后统一压缩去重
// created（可选数组）：把**这一趟新建的组**原样报告给调用方——导入完要按它问一次「这批卡给谁」（#428）：
// 既不扫全库（会把用户此前就存在的未绑定组一起问了），也不按名字去重（新旧同名组该分别处理）
async function _importMochiLib(lib, scope, stat, jobs, created) {
  Object.keys(lib || {}).forEach(t => {
    const cat = _mochiCatOf(t);
    const pairs = lib[t];
    if (!cat || !Array.isArray(pairs)) return;
    pairs.forEach(pair => {
      if (!Array.isArray(pair) || typeof pair[0] !== 'string' || !Array.isArray(pair[1])) return;
      let target = data.groups.find(x => !x.system && cardScope(x) === scope && (x.category || '主字卡') === cat && x.name === pair[0]);
      if (!target) { target = { name: pair[0], category: cat, scope, cards: [] }; data.groups.push(target); if (created) created.push(target); }
      pair[1].forEach(c => {
        if (typeof c !== 'string' || !c) return;
        if (voiceCardParts(c)) { if (!target.cards.includes(c)) { target.cards.push(c); stat[scope]++; } return; }
        const bar = c.indexOf('|||');
        const media = bar > 0 ? c.slice(bar + 3) : c;
        if ((cat === '表情包' || cat === '图片') && media.indexOf('data:image/') === 0) { jobs.push({ target, src: media }); return; }
        if (!target.cards.includes(c)) { target.cards.push(c); stat[scope]++; }
      });
    });
  });
  markPresetGroups(data.groups);   // 包里若带着内置同名组，当场就按预置认，不留「刷新前算自建」的空窗（BUGS #035）
  await new Promise(r => setTimeout(r, 0));
}
// 媒体卡统一处理：超过 384KB 的大图压到 512 边（mochi 库常含几十 MB 贴图），分批让出主线程并推进度
async function _importFlushMedia(jobs, prog, stat) {
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    let img = j.src;
    if (img.length > 384 * 1024) {
      try { const c2 = await compressImageDataURL(img, 512); if (c2 && c2.length && c2.length < img.length) img = c2; } catch {}
    }
    if (!j.target.cards.some(x => cardImage(x) === img)) { j.target.cards.push({ img }); if (stat) stat[cardScope(j.target)]++; }
    if ((i % 10 === 9 || i === jobs.length - 1)) {
      if (prog) prog(Math.round(((i + 1) / jobs.length) * 100), '图片 ' + (i + 1) + '/' + jobs.length);
      await new Promise(r => setTimeout(r, 0));
    }
  }
}
async function _importOrdinalGroups(groups, created) {
  groups.forEach(g => {
    if (!g || typeof g.name !== 'string' || !Array.isArray(g.cards)) return;
    if (g.system) return; // 跳过系统内置组，避免绕过"不可修改"
    // 预置专有分类（TA心里话）不经用户侧导入：它只属「系统预设字卡」页，落到字卡库这一面就是错位。
    // 2026-10-04 用户直派两个页面完全分开——带这个分类的组在导入时一律归位到主字卡。
    const cat = (CARD_CATEGORIES.includes(g.category) && !PRESET_ONLY_CATEGORIES.includes(g.category)) ? g.category : '主字卡';
    const scope = (g.scope === 'public' || g.scope === 'own') ? g.scope : currentCardsScope;
    let target = data.groups.find(x => !x.system && x.name === g.name && (x.category || '主字卡') === cat && cardScope(x) === scope);
    if (!target) { target = { name: g.name, category: cat, scope, cards: [] }; data.groups.push(target); if (created) created.push(target); }
    g.cards.forEach(c => {
      const img = cardImage(c);
      if (img) { if (!target.cards.some(x => cardImage(x) === img)) target.cards.push({ img }); }
      else if (typeof c === 'string' && !target.cards.includes(c)) target.cards.push(c);
    });
  });
  markPresetGroups(data.groups);   // 同 _importMochiLib：言字卡 格式的字卡包里也带着内置组，当场认回（BUGS #035）
  await save();
  renderGroups();
}
// ===== 起文件选择器的两条通道（BUGS #428）=====
// 用户现场（小米14 默认浏览器 · 添加到桌面）：点「导入字卡（JSON）」有时**选择器压根不出来**，
// 有时**挑完文件屏上什么都没有**。前者的机因不在本站：那类「添加到桌面」的壳容器没有实现文件选择器，
// hidden input.click() 发出去石沉大海（Chrome 桌面／安卓 WebView 都复现不了，不是这条调用写错了）；
// 后者是本站自己的账——旧实现只在文件 >2MB 时才上进度层，小文件（以及大多数 check）全程零反馈，
// 而言字卡那一路格式导完甚至一声 toast 都没有，几十秒的沉默在用户眼里就是「没反应」。三件一起治：
//   ① 起选择器时挂一块表：既没落 change、页面也没被选择器顶到后台（blur／visibilitychange），
//      判定这台机器起不来选择器 → 当面给第二条路（②）；
//   ② 第二条路＝粘贴整份 JSON（html/view-cards.html 的 #cardsPasteMask），不经过文件选择器；
//   ③ 挑到文件后**不等大小判定**立刻上进度层＋逐段推进度，成了 yay至少有话说。
function _readTextFile(f) {
  if (typeof f.text === 'function') {
    return Promise.resolve(f.text()).catch(() => null);   // 个别内核会同步抛，落本题中继续走 FileReader
  }
  return null;
}
async function _fileToText(f) {
  const direct = await _readTextFile(f);
  if (typeof direct === 'string') return direct;
  return await new Promise((res, rej) => {                 // 退化通道：File.prototype.text 缺失的内核（老 WebView）
    const r = new FileReader();
    r.onload = () => res(String(r.result || ''));
    r.onerror = () => rej(r.error || new Error('文件读取失败'));
    r.readAsText(f);
  });
}
function _closeCardsPaste() { $('#cardsPasteMask').hidden = true; }
function _openCardsPaste(why) {
  const hint = $('#cardsPasteHint');
  if (hint && why) hint.textContent = why + '这一条不用文件选择器：先把整份 JSON 复制下来，贴进上面的框里再点导入。';
  const box = $('#cardsPasteInput');
  if (box) { box.value = ''; }
  $('#cardsPasteMask').hidden = false;
}
$('#cardsPasteClose').onclick = _closeCardsPaste;
$('#cardsPasteCancel').onclick = _closeCardsPaste;
$('#cardsPasteMask').addEventListener('click', e => { if (e.target === $('#cardsPasteMask')) _closeCardsPaste(); });
$('#cardsPasteOk').onclick = async () => {
  const text = ($('#cardsPasteInput').value || '').trim();
  if (!text) { showToast('先把 JSON 内容贴进上面的框里'); return; }
  _closeCardsPaste();
  await _runCardsImport(() => Promise.resolve(text), '粘贴的 JSON', text.length);
};
let _cdPickWatch = null;
function _pickCardsFile() {
  const inp = $('#cardsInput');
  if (!inp) return;
  _clearPickWatch();
  let picked = false, left = false;
  const stop = () => { picked = true; _clearPickWatch(); };
  const away = () => { left = true; };
  const onHidden = () => { if (document.hidden) left = true; };
  inp.addEventListener('change', stop, { once: true });
  window.addEventListener('blur', away);
  document.addEventListener('visibilitychange', onHidden);
  _cdPickWatch = { inp, stop, away, onHidden };
  // 1400ms：够慢机器把选择器弹出来，也不至于让用户干等以为是又卡住了。
  // 判据取「既没挑到文件、页面也没离开过前台」——离开过前台＝选择器其实起来了，在小米那台机器上的实测
  // 正是「从始至终什么都没发生」，所以这一条判得准；万一误判（选择器开在后面），这层弹在上面也一眼能看懂并取消。
  _cdPickWatch.timer = setTimeout(() => {
    _clearPickWatch();
    if (picked || left) return;
    _openCardsPaste('这边的文件选择器没能弹出来。');
  }, 1400);
  try { inp.click(); } catch (e) { _clearPickWatch(); _openCardsPaste('文件选择器起不来。'); }
}
function _clearPickWatch() {
  const w = _cdPickWatch;
  if (!w) return;
  _cdPickWatch = null;
  clearTimeout(w.timer);
  if (w.inp) w.inp.removeEventListener('change', w.stop);
  window.removeEventListener('blur', w.away);
  document.removeEventListener('visibilitychange', w.onHidden);
}
$('#importCards').onclick = _pickCardsFile;
$('#cardsInput').onchange = async e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  // 选择器其实起来了、只是起得比 1.4s 慢（慢机器上挑文件挑很久）：那一层退路已经弹在屏上，
  // 这时候真挑到文件＝走了「挑文件」这条路，退路必须让位，不然两条路叠在一起谁也不知道在等谁。
  if (f && $('#cardsPasteMask') && !$('#cardsPasteMask').hidden) _closeCardsPaste();
  if (!f) return;
  await _runCardsImport(() => _fileToText(f), f.name, f.size || 0);
};

// ===== 导入后一次定主人（BUGS #429）=====
// mochi 的字卡库没有「归属哪位联系人」这一层，整本导进专属＝冒出几十上百个未绑定的组；
// 事后只有两条旧路：一组组点开绑（几十组就是几十发），或勾 #414 那枚「其余未绑定分组也绑给 TA」——
// 那枚勾进行调查的是**全库**未绑定的组，一次就把整本（含用户此前那些）卷给同一位＝用户报的
// 「所有的专属图片都跑到一个联系人那里去」。刚导完这一刻最清楚这批是给谁的：当场问一次，
// 只动这一趟新建的组（created 由两条写入路径报告进来），不碰用户此前那些，也不用那枚全库勾选。
let _ownBatch = null, _ownWait = null;
function _closeCardsOwn() {
  $('#cardsOwnMask').hidden = true;
  _ownBatch = null;
  const r = _ownWait; _ownWait = null;
  if (r) r(null);
}
// 返回值：'skip'（这一趟没有可问的新组）∶ { name, groups, cards }（name 空串＝选了「暂不绑定」）∶
// noContact（通讯录还空着，问了也没人可选）。
// ⚠ 故意**不在这里弹 toast**：这一层跑在导入链的中途，它先弹的那句会立刻被收尾那句整条盖掉
// （收尾句要说的是「导了多少」，两句撞在一起＝用户只看见数字、看不见这批给了谁），
// 故统一由收尾那句把「导了多少 ＋ 给了谁」一次说全（见 _ownTail）。
function _askImportOwner(created) {
  const list = (created || []).filter(g => g && !g.preset && !g.system && cardScope(g) === 'own' && !g.contactId);
  if (!list.length) return Promise.resolve('skip');
  const contacts = (data.contacts || []);
  if (!contacts.length) return Promise.resolve({ name: '', groups: list.length, cards: list.reduce((s, g) => s + (g.cards || []).length, 0), noContact: true });
  const groupsN = list.length, cardsN = list.reduce((s, g) => s + (g.cards || []).length, 0);
  const hint = $('#cardsOwnHint');
  if (hint) hint.textContent = `这次进来 ${groupsN} 组 · ${cardsN} 张专属字卡：点一位就整批挂到 TA 名下。想分开给不同人按人各导一次（每次导完挑一位）。`;
  const row = (id, av, label) => `<button class="bind-row" data-own-id="${escapeHTML(id)}"><span class="bind-av${id ? '' : ' free'}">${av}</span>${escapeHTML(label)}</button>`;
  $('#cardsOwnList').innerHTML = '<button class="bind-row" data-own-id=""><span class="bind-av free">∅</span>暂不绑定（以后在卡面「未绑定」那里给）</button>' +
    contacts.map(c => row(c.id, contactAvatarHTML(c), (fixedNameOf(c) || '未命名') + (c.kind === 'group' ? ' · 群' : ''))).join('');
  _ownBatch = list;
  $('#cardsOwnMask').hidden = false;
  return new Promise(resolve => { _ownWait = resolve; });
}
$('#cardsOwnClose').onclick = () => _closeCardsOwn();
// 「给了谁」那一截尾巴：收尾那句 toast 把它拼在「导了多少」后面＝一次说完，不挤掉任何一段
function _ownTail(res) {
  if (!res || res === 'skip') return '';
  if (res.noContact) return ' · 这批专属字卡还没主人：先到聊天页右上加一位 TA';
  return res.name ? ` · 全给 ${res.name}（${res.groups} 组 · ${res.cards} 张）` : ' · 还没绑给谁，卡面「未绑定」随时能改';
}
$('#cardsOwnMask').addEventListener('click', e => {
  if (e.target === $('#cardsOwnMask')) { _closeCardsOwn(); return; }
  const r = e.target.closest('[data-own-id]');
  if (!r || !_ownBatch || !_ownWait) return;
  const id = r.dataset.ownId;
  const list = _ownBatch, done = _ownWait;
  _ownBatch = null; _ownWait = null;
  $('#cardsOwnMask').hidden = true;
  list.forEach(g => { g.contactId = id; });
  const nm = (data.contacts || []).find(c => c.id === id);
  saveCardsWho(id || '_none');       // 按人筛跟到这一位＝导完立刻看得见这一批落在谁名下
  save();
  renderGroups();
  done({
    name: id ? (fixedNameOf(nm) || '未命名') : '',
    groups: list.length,
    cards: list.reduce((s, g) => s + (g.cards || []).length, 0)
  });
});

// 整条解析链：挑到文件的那一处与粘贴的那一处共用这一份（BUGS #428，两条入口的行为必须一字不差）
async function _runCardsImport(readText, label, size) {
  // 体积先说出来：字卡 JSON 里塞满 base64 图/语音时，读全文＋整树 parse 都是主线程长任务（BUGS #458＝#434 二批）
  showProgress('正在读取字卡…' + (size >= IMP_WARN ? '·' + _impSizeText(size) + ' 比较大，导的过程别切走' : ''));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));   // 让进度层先真正上屏再开干
  try {
    // 到 150MB 当面问一句要不要试（复用 js/settings.js 那把体积闸，不再开第二份口径）；选「算了」＝这一趟不导
    if (size > IMP_HARD) {
      if (!(await _impGoAhead(size))) return;
      showProgress('正在读取字卡…');   // _impGoAhead 收掉了进度层，放行后重新摆上
    }
    let text;
    try {
      text = await readText();
    } catch (err) {
      hideProgress();
      showToast('读不到这个文件的内容：' + ((err && err.message) || '请在手机自带的「文件管理」里挑，别从预览界面分享进来'));
      return;
    }
    // 解析前让两帧：整树 JSON.parse 是长任务，不让＝屏上钉在「正在读取」不动＝用户眼里的卡住（#428 同族，口径收进 utils 的 progressYield）
    updateProgress(12, '正在解析…');
    await progressYield();
    let parsed;
    try {
      parsed = JSON.parse(text || '');
    } catch (err) {
      hideProgress();
      showToast('这不是一份 JSON 字卡文件：' + ((err && err.message) || '内容解析失败'));
      return;
    }
    updateProgress(20, '已读完 · 正在辨认格式…');
    const created = [];
    if (Array.isArray(parsed) || Array.isArray(parsed && parsed.groups)) {
      await _importOrdinalGroups(Array.isArray(parsed) ? parsed : parsed.groups, created);
      _applyOrdContacts(parsed && parsed.ordContacts);
      updateProgress(70, '正在落库…');
      await flushSave();   // 导入是关键写：真等落盘再说「已导入」（save() 不返 Promise，await 它是空等＝BUGS #458）
      hideProgress();
      const own1 = await _askImportOwner(created);
      selectedGroupName = ''; _groupsKey = '';
      renderGroups();
      showToast(`已导入字卡（${label || '文件'}）· 新建 ${created.length} 组` + _ownTail(own1));
      return;
    }
    const pm = _parseMochiCards(parsed, label);
    if (!pm) { hideProgress(); showToast('字卡文件格式不正确，请选择 言字卡 或 mochi 导出的 JSON 文件'); return; }
    let mochi = pm;
    if (pm.raw) {
      hideProgress();   // 进度层 z 9999 盖过弹层＝先收起再问（旧 native confirm 永远在顶所以没这问题）
      const scope = await _askMochiScope(label);
      if (!scope) return;        // 取消＝这一趟不导了
      mochi = { public: null, own: null };
      mochi[scope] = pm.raw;
      showProgress('正在导入字卡…');
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    const stat = { public: 0, own: 0 }, jobs = [];
    for (const scope of ['public', 'own']) {
      if (mochi[scope]) await _importMochiLib(mochi[scope], scope, stat, jobs, created);
    }
    await _importFlushMedia(jobs, (p, t) => updateProgress(20 + Math.round(p * 0.7), t), stat);
    _applyOrdContacts(parsed && parsed.ordContacts);
    updateProgress(94, '正在落库…');
    await flushSave();   // 同上：关键写走 flushSave 真落盘（BUGS #458）
    hideProgress();
    const own = await _askImportOwner(created);
    if (stat.public || stat.own) {
      // 只导入进单个作用域时自动切过去，让用户立刻看到导入结果
      if (stat.public && !stat.own) currentCardsScope = 'public';
      else if (!stat.public && stat.own) currentCardsScope = 'own';
      selectedGroupName = '';
      _groupsKey = '';
      await flushSave();   // 主人定完是关键写：真落盘（BUGS #458）
      renderGroups();
      showToast(`已导入 mochi 字卡：公用 ${stat.public} 张 · 专属 ${stat.own} 张` + _ownTail(own));
    } else {
      showToast('没有导入新字卡（可能全部重复）');
    }
  } catch (err) {
    hideProgress();
    showToast('导入失败：' + ((err && err.message) || '文件读取异常'));
  }
}

// 导入 TXT 字卡
$('#importTxtCards').onclick = () => $('#txtCardsInput').click();
$('#txtCardsInput').onchange = async e => {
  if (!e.target.files[0]) return;
  try {
    const text = await e.target.files[0].text();
    const groups = {};
    let currentGroup = '未分组';
    text.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (/【.+】/.test(trimmed)) { currentGroup = trimmed.replace(/【/, '').replace(/】/, ''); groups[currentGroup] = []; }
      else {
        if (!groups[currentGroup]) groups[currentGroup] = [];
        if (!groups[currentGroup].includes(trimmed)) groups[currentGroup].push(trimmed);
      }
    });
    // 追加到现有分组，不清空
    for (const [name, cards] of Object.entries(groups)) {
      if (!cards.length) continue;
      let target = data.groups.find(x => x.name === name && cardScope(x) === currentCardsScope);
      if (!target) { target = _newGroup(name, '主字卡'); data.groups.push(target); }
      for (const c of cards) {
        if (!target.cards.includes(c)) target.cards.push(c);
      }
    }
    await save();
    renderGroups();
    showToast(`已导入 ${Object.keys(groups).length} 个分组`);
  } catch { showToast('TXT 文件格式不正确'); }
  e.target.value = '';
};

// ===== 导出字卡：mochi 通用格式（app=mochi-ccfull 全量导出）=====
// mochi「自定义字卡·全量导入」可直接识别（追加合并/整包替换均可），言字卡 自身导入亦兼容（往返无损）
const _ORD_TO_MOCHI = { '主字卡': 'text', '颜文字': 'kaomoji', 'emoji': 'emoji', '表情包': 'sticker', '图片': 'image', '拍一拍': 'poke', '语音': 'voice' };
function _buildScopeLib(scope) {
  const lib = { text: [], kaomoji: [], emoji: [], sticker: [], image: [], poke: [], voice: [] };
  data.groups.forEach(g => {
    if (cardScope(g) !== scope) return;
    const t = _ORD_TO_MOCHI[g.category || '主字卡'];
    if (!t) return;
    const cards = [];
    (g.cards || []).forEach(c => {
      const img = cardImage(c);
      if (img) cards.push(img);
      else if (typeof c === 'string' && c) cards.push(c);
    });
    lib[t].push([g.name, cards]);
  });
  return lib;
}
function _buildMochiExport() {
  const out = { app: 'mochi-ccfull', v: 1, scope: 'all', time: Date.now(), data: { ccPub: _buildScopeLib('public'), ccOwn: _buildScopeLib('own') } };
  // Ordinal 扩展：专属分组→联系人绑定（mochi 会忽略未知字段，不影响其导入）
  const contacts = {};
  data.groups.forEach(g => { if (!g.system && cardScope(g) === 'own' && g.contactId) contacts[g.name + '\u0001' + (g.category || '主字卡')] = g.contactId; });
  if (Object.keys(contacts).length) out.ordContacts = contacts;
  return out;
}
// 导入侧：把导出文件携带的绑定关系套回同名同分类的专属分组（联系人已删除的跳过）
function _applyOrdContacts(map) {
  if (!map || typeof map !== 'object') return;
  const ids = new Set((data.contacts || []).map(c => c.id));
  data.groups.forEach(g => {
    if (g.system || cardScope(g) !== 'own' || g.contactId) return;
    const id = map[g.name + '\u0001' + (g.category || '主字卡')];
    if (id && ids.has(id)) g.contactId = id;
  });
}
$('#exportCards').onclick = () => download(_buildMochiExport(), '言字卡-字卡.json');

// ===== 导出字卡 TXT：与 JSON 导出分开的一条路（2026-10-13）=====
// 只收文字四类（主字卡/颜文字/emoji/拍一拍），【分组名】一行 + 一行一张卡，与「导入 TXT」同一套格式。
// 作用域跟当前页：TXT 里没有作用域信息，看的是公用就只导公用（导入侧也是落进当前作用域，两边对得上）。
// 图片/语音卡进不了纯文本，跳过并在 toast 里报数，不静默丢。
const _TXT_EXP_CATS = ['主字卡', '颜文字', 'emoji', '拍一拍'];
function _txtExpCount(cat) {
  let gn = 0, cn = 0;
  data.groups.forEach(g => {
    if (cardScope(g) !== currentCardsScope || (g.category || '主字卡') !== cat) return;
    const n = (g.cards || []).filter(c => !cardImage(c) && cardText(c)).length;
    if (n) { gn++; cn += n; }
  });
  return { gn, cn };
}
function _closeCardsTxt() { $('#cardsTxtMask').hidden = true; }
$('#exportTxtCards').onclick = () => {
  const scopeLabel = currentCardsScope === 'public' ? '公用' : '专属';
  $('#cardsTxtHint').textContent = '勾选要导出的分类 · 只导当前' + scopeLabel + '字卡，【】里是分组名，一行一张';
  $('#cardsTxtCats').innerHTML = _TXT_EXP_CATS.map(cat => {
    const c = _txtExpCount(cat);
    return `<label class="txt-cat-row"><input type="checkbox" data-txt-cat="${escapeHTML(cat)}" checked><span>${escapeHTML(cat)}</span><small>${c.gn ? c.gn + ' 组 · ' + c.cn + ' 张' : '暂无'}</small></label>`;
  }).join('');
  $('#cardsTxtMask').hidden = false;
};
$('#cardsTxtClose').onclick = _closeCardsTxt;
$('#cardsTxtCancel').onclick = _closeCardsTxt;
$('#cardsTxtMask').addEventListener('click', e => { if (e.target === $('#cardsTxtMask')) _closeCardsTxt(); });
$('#cardsTxtOk').onclick = () => {
  const picked = Array.from(document.querySelectorAll('#cardsTxtCats input[data-txt-cat]:checked')).map(i => i.dataset.txtCat);
  if (!picked.length) { showToast('先勾选至少一个分类'); return; }
  const lines = [];
  let groupsN = 0, cardsN = 0, skipped = 0;
  _TXT_EXP_CATS.forEach(cat => {
    if (!picked.includes(cat)) return;
    data.groups.forEach(g => {
      if (cardScope(g) !== currentCardsScope || (g.category || '主字卡') !== cat) return;
      const cards = [];
      (g.cards || []).forEach(c => {
        if (cardImage(c)) { skipped++; return; }
        const t = cardText(c);
        if (!t) { skipped++; return; }
        cards.push(t);
      });
      if (!cards.length) return;
      lines.push('【' + g.name + '】');
      cards.forEach(c => { lines.push(c); cardsN++; });
      groupsN++;
    });
  });
  if (!groupsN) { showToast('选中的分类里没有可导出的字卡'); return; }
  _closeCardsTxt();
  const scopeLabel = currentCardsScope === 'public' ? '公用' : '专属';
  downloadBlob(lines.join('\n'), '言字卡-字卡-TXT-' + scopeLabel + '.txt', 'text/plain;charset=utf-8');
  showToast('已导出 ' + groupsN + ' 个分组 · ' + cardsN + ' 张字卡（' + scopeLabel + '）' + (skipped ? '，另有 ' + skipped + ' 张图片卡进不了 TXT' : ''));
};

// ===== 语音字卡导出：单独＝一枚音频；选中／全部＝一个 zip（zip 里每句一个能直接听的音频文件）=====
// 为什么手搓 ZIP 而不引库：本站禁任何 npm 包与构建工具（AGENTS §8）。「全部导出」要一次给出几十上百个
// 音频，逐个下载在安卓 Chrome 上会弹「允许该站点下载多个文件」并刷屏，给一个件才是出路。
// 只实现 store（不压缩）：MP3 再 deflate 一次几乎没有收益，还多养一份压缩实现面。
const _VOICE_EXT = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/aac': 'm4a', 'audio/x-m4a': 'm4a' };
function _voiceMimeOf(url) {
  const m = /^data:([^;,]+)/.exec(String(url));
  return ((m && m[1]) || '').toLowerCase() || 'audio/mpeg';
}
function _voiceExtOf(url) { return _VOICE_EXT[_voiceMimeOf(url)] || 'mp3'; }
// 末段真是 dataURL 才是一段取得出字节的录音；空串或坏 base64 一律回 null（宁可少给一句，不给一个 0 字节的哑文件）
function _dataUrlBytes(url) {
  const s = String(url || '');
  if (s.slice(0, 5) !== 'data:') return null;
  const i = s.indexOf(',');
  if (i < 0) return null;
  let bin;
  try { bin = atob(s.slice(i + 1)); } catch (e) { return null; }
  if (!bin.length) return null;
  const out = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) out[k] = bin.charCodeAt(k);
  return out;
}
const _VOICE_BAD_CH = new RegExp('[' + String.fromCharCode(92) + '/:*?"<>|' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + ']', 'g');
// 卡名是一句人话，落成文件名要过一遍系统不许的字符（Windows 与安卓都禁那一组）
function _voiceFileName(name, fallback) {
  const clean = String(name || '').replace(_VOICE_BAD_CH, ' ').replace(/\s+/g, ' ').trim();
  return (clean || fallback || '语音').slice(0, 60);
}
function _voiceRowAt(key) {
  const p = String(key).split(':');
  const g = data.groups[+p[0]];
  const v = g ? voiceCardParts(g.cards && g.cards[+p[1]]) : null;
  return (v && v.data) ? { group: g.name || '语音', v } : null;
}
// 「全部」＝字卡库这一面的全部语音卡（预置组不参与，与 visibleCardKeys 同一口径；公用与专属都算）
function _allVoiceKeys() {
  const keys = [];
  (data.groups || []).forEach((g, gi) => {
    if (g.preset) return;
    (g.cards || []).forEach((c, ci) => { if (voiceCardParts(c)) keys.push(gi + ':' + ci); });
  });
  return keys;
}
const _ZIP_CRC_T = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();
function _crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = _ZIP_CRC_T[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function _dosStamp(d) {
  const y = Math.max(1980, d.getFullYear());
  return [((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF,
    (((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF];
}
// 最小可用的 store 型 ZIP：本地文件头＋中央目录＋EOCD。名称那两位必须给 UTF-8 标志（0x0800），
// 否则中文卡名被按 CP437 解成乱码——文件名是这一族唯一被用户直接读到的东西
function _zipStore(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  files.forEach(f => {
    const nb = enc.encode(f.name);
    const crc = _crc32(f.bytes);
    const size = f.bytes.length;
    const lh = new Uint8Array(30 + nb.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, f.time | 0, true);
    lv.setUint16(12, f.date | 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nb.length, true);
    lh.set(nb, 30);
    parts.push(lh, f.bytes);
    const ch = new Uint8Array(46 + nb.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, f.time | 0, true);
    cv.setUint16(14, f.date | 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nb.length, true);
    cv.setUint32(42, offset, true);
    ch.set(nb, 46);
    central.push(ch);
    offset += lh.length + size;
  });
  const cdSize = central.reduce((n, b) => n + b.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let pos = 0;
  parts.concat(central).concat([end]).forEach(b => { out.set(b, pos); pos += b.length; });
  return out;
}
// 一包里不许两张同名的卡互相顶掉（同一句合成两次会撞名，不同组的同名卡也会撞）：撞了就加（2）（3）
function _zipPath(row, used) {
  const folder = _voiceFileName(row.group, '语音');
  const base = _voiceFileName(row.v.name || row.v.text, '语音');
  const ext = _voiceExtOf(row.v.data);
  let path = folder + '/' + base + '.' + ext;
  if (used[path]) { used[path] += 1; path = folder + '/' + base + '（' + used[path] + '）.' + ext; } else used[path] = 1;
  return path;
}
async function _exportVoiceZip(rows, zipName, note) {
  const many = rows.length > 24;
  const tick = many ? showProgress('正在打包语音') : null;
  const used = {};
  const files = [];
  let broken = 0;
  for (let i = 0; i < rows.length; i++) {
    const bytes = _dataUrlBytes(rows[i].v.data);
    if (bytes) files.push({ name: _zipPath(rows[i], used), bytes });
    else broken++;
    if (tick && i % 24 === 0) {
      tick(Math.round(i / rows.length * 90), '已读 ' + (i + 1) + ' / ' + rows.length);
      await new Promise(r => setTimeout(r, 0));   // 让进度条画得出来：整段同步循环＝屏上什么都不动
    }
  }
  if (!files.length) {
    if (tick) hideProgress();
    showToast('这些语音卡的录音都不在库里了，导不出音频');
    return;
  }
  const st = _dosStamp(new Date());
  files.forEach(f => { f.time = st[0]; f.date = st[1]; });
  let out;
  try { out = _zipStore(files); } catch (e) {
    if (tick) hideProgress();
    showToast('打包失败：' + ((e && e.message) || e));
    return;
  }
  if (tick) { tick(100, files.length + ' 句'); setTimeout(hideProgress, 400); }
  downloadBlob(out, zipName, 'application/zip');
  showToast('已导出 ' + files.length + ' 句' + (broken ? '，另有 ' + broken + ' 句的录音取不出来' : '') + (note || '') + ' · ' + zipName);
}
function _exportVoiceOne(row) {
  const bytes = _dataUrlBytes(row.v.data);
  if (!bytes) { showToast('这张卡的录音是空的，导不出音频'); return; }
  downloadBlob(bytes, _voiceFileName(row.v.name || row.v.text, '语音') + '.' + _voiceExtOf(row.v.data), _voiceMimeOf(row.v.data));
  showToast('已导出这句音频');
}
$('#exportVoiceAll').onclick = () => {
  const rows = _allVoiceKeys().map(_voiceRowAt).filter(Boolean);
  if (!rows.length) { showToast('字卡库里还没有语音卡'); return; }
  _exportVoiceZip(rows, '言字卡-语音.zip');
};
$('#batchExportVoice').onclick = () => {
  const picked = Array.from(cardsBatchSel);
  const rows = picked.map(_voiceRowAt).filter(Boolean);
  if (!rows.length) { showToast('选中的 ' + picked.length + ' 张里没有语音卡'); return; }
  const rest = picked.length - rows.length;
  _exportVoiceZip(rows, '言字卡-语音-选中.zip', rest ? '（选中的另外 ' + rest + ' 张不是语音卡）' : '');
};

// 清空全部字卡（自建分组整组删除，双重确认防误触）：只动字卡库这一侧的自建组；
// 预置组在「系统预设字卡」独立页、系统内置组缺失即补种，都不经这里管
$('#clearAllCards').onclick = async () => {
  const mine = data.groups.filter(g => !g.preset && !g.system);
  const total = mine.reduce((n, g) => n + (g.cards?.length || 0), 0);
  if (!mine.length) { showToast('字卡库已经是空的'); return; }
  openModal('清空全部字卡', '', () => {
    openModal('最后确认', '', async () => {
      data.groups = data.groups.filter(g => g.preset || g.system);
      cardsBatchSel.clear();
      selectedGroupName = '';
      await save();
      renderGroups();
      showToast(total ? `已删除 ${mine.length} 个分组、${total} 张字卡` : `已删除 ${mine.length} 个空分组`);
    }, { noInput: true, staticText: '此操作不可恢复，建议先「导出字卡」备份。仍要继续？', okText: '仍要清空', danger: true });
  }, { noInput: true, staticText: total ? `将删除全部 ${mine.length} 个分组、共 ${total} 张字卡（分组一并删掉）。` : `将删除全部 ${mine.length} 个空分组。`, okText: '下一步', danger: true });
};

// 批量添加：一行一张字卡，【分组名】切换目标分组，与导入 TXT 同格式
$('#addCardsBatch').onclick = () => { $('#cardsAddInput').value = ''; $('#cardsAddMask').hidden = false; $('#cardsAddInput').focus(); };
$('#cardsAddClose').onclick = () => { $('#cardsAddMask').hidden = true; };
$('#cardsAddCancel').onclick = () => { $('#cardsAddMask').hidden = true; };
$('#cardsAddMask').addEventListener('click', e => { if (e.target === $('#cardsAddMask')) $('#cardsAddMask').hidden = true; });
$('#cardsAddSubmit').onclick = async () => {
  const groups = {};
  let currentGroup = '未分组';
  $('#cardsAddInput').value.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (/【.+】/.test(trimmed)) { currentGroup = trimmed.replace(/【/, '').replace(/】/, ''); groups[currentGroup] = []; }
    else {
      if (!groups[currentGroup]) groups[currentGroup] = [];
      if (!groups[currentGroup].includes(trimmed)) groups[currentGroup].push(trimmed);
    }
  });
  $('#cardsAddMask').hidden = true;
  let added = 0, createdGroups = 0;
  for (const [name, cards] of Object.entries(groups)) {
    if (!cards.length) continue;
    let target = data.groups.find(x => x.name === name && cardScope(x) === currentCardsScope);
    if (!target) { target = _newGroup(name, currentCardsTab); data.groups.push(target); createdGroups++; selectedGroupName = name; }
    for (const c of cards) { if (!target.cards.includes(c)) { target.cards.push(c); added++; } }
  }
  if (added || createdGroups) {
    if (createdGroups) groupSearch = '';
    await save();
    renderGroups();
    showToast(`已添加 ${added} 张字卡${createdGroups ? `，新建 ${createdGroups} 个分组` : ''}`);
  }
};

// 表情包/图片分类：图片字卡上传（分组名即 tag，聊天抽屉联系人包按此分组展示）
let _imgTargetGi = -1;
$('#addCardImages').onclick = () => {
  const cat = currentCardsTab === '图片' ? '图片' : '表情包';
  let gi = data.groups.findIndex(g => g.name === selectedGroupName && (g.category || '主字卡') === cat && cardScope(g) === currentCardsScope);
  if (gi < 0) gi = data.groups.findIndex(g => (g.category || '主字卡') === cat && cardScope(g) === currentCardsScope);
  if (gi < 0) {
    _askGroupName({
      title: cat === '图片' ? '新图片分组' : '新表情包分组',
      value: cat === '图片' ? '新图片组' : '新表情组',
      onOk: name => {
        const ng2 = _newGroup(name, cat); ng2.contactId = _newGroupOwnerOf();
        data.groups.push(ng2);
        selectedGroupName = name;
        _imgTargetGi = data.groups.length - 1;
        $('#cardsImgInput').click();
      }
    });
    return;   // 命名面板确认后才开文件选择；取消＝什么都不发生
  }
  _imgTargetGi = gi;
  $('#cardsImgInput').click();
};
$('#cardsImgInput').onchange = async e => {
  const files = [...e.target.files];
  e.target.value = '';
  const g = _imgTargetGi >= 0 ? data.groups[_imgTargetGi] : null;
  if (!g || !files.length) return;
  let added = 0;
  for (const f of files) {
    const src = await fileData(f, 512);
    if (!src) continue;
    if (!g.cards.some(c => cardImage(c) === src)) { g.cards.push({ img: src }); added++; }
  }
  if (added) {
    selectedGroupName = g.name;
    await save();
    renderGroups();
    showToast(`已添加 ${added} 张${g.category === '图片' ? '图片' : '表情包'}`);
  } else showToast('没有新图片（已去重或读取失败）');
};

