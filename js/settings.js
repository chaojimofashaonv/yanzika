// ===== 设置 / 导航 / 数据管理 =====

// 外观设置：全局 appearance + 当前会话 chatAppearance 合成视图 → body[data-ap-*]，样式全在 theme.css
function _apView() {
  const g = Object.assign({}, defaults.appearance, data.appearance || {});
  const ca = (data.chatAppearance || {})[data.activeChat] || {};
  return Object.assign(g, defaults.chatAppearanceDefault, ca);
}
// 当前会话外观存储体（保存目标）
function _caSh() {
  if (!data.chatAppearance) data.chatAppearance = {};
  if (!data.chatAppearance[data.activeChat]) data.chatAppearance[data.activeChat] = Object.assign({}, defaults.chatAppearanceDefault);
  return data.chatAppearance[data.activeChat];
}
// 全局外观存储体（字体两样与上面那排 chips 的写入目标都走这里；别处不直改 data.appearance）
function _apSh() {
  if (!data.appearance) data.appearance = {};
  return data.appearance;
}
// 通透观感（磨砂/透明/光影）不再可调：值固定在 css/theme.css 的 --glass-blur / --glass-a1 / --glass-a2 / --shadow-k
// 自定义气泡 CSS：整段**自动加权**（2026-10-15，用户报「气泡 CSS 完全没效果」的根因）。
// 主题侧我方气泡的底色写在 `.mine .bubble`（0,2,0）、对方配色档在 body 属性选择器上——
// 用户照直觉写 `.bubble{background:...}`（0,1,0）＝我方那半永远打不过，看起来就是「整段没生效」。
// 这里给每条规则的选择器统一加一层 `body[data-ap-bubcss] ` 前缀（＝每条 +1 个类级权重），
// 写错也不会弄坏页面：引号字符串与注释整段原样搬，@media 块整体下钻一层继续加，括号不配对就放弃加权、原文照用。
function _scopeBubbleCss(css) {
  const _sel = s => s.split(',').map(p => {
    const t = p.trim();
    if (!t || /^(html\b|body\b|:root)/i.test(t)) return p.trim();   // html/body/:root 开头的不再包（包了就匹配不到了）
    return 'body[data-ap-bubcss] ' + t;
  }).join(', ');
  const _scan = s => {
    let out = '', i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === '"' || c === "'") {   // 字符串整段搬（转义的闭引号不算）
        const q = c; out += c; i++;
        while (i < s.length) { out += s[i]; const hit = s[i] === q && s[i - 1] !== '\\'; i++; if (hit) break; }
        continue;
      }
      if (c === '/' && s[i + 1] === '*') {   // 注释整段搬
        const e = s.indexOf('*/', i + 2);
        const seg = e < 0 ? s.slice(i) : s.slice(i, e + 2);
        out += seg; i += seg.length; continue;
      }
      if (c === '{') {   // 块：先配对到闭括号，再按「@规则下钻 ∶ 普通规则加前缀」二选一
        let dep = 1, j = i + 1;
        while (j < s.length && dep > 0) {
          if (s[j] === '"' || s[j] === "'") { const q = s[j]; j++; while (j < s.length && !(s[j] === q && s[j - 1] !== '\\')) j++; j++; continue; }
          if (s[j] === '/' && s[j + 1] === '*') { const e = s.indexOf('*/', j + 2); j = e < 0 ? s.length : e + 2; continue; }
          if (s[j] === '{') dep++; else if (s[j] === '}') dep--;
          j++;
        }
        if (dep !== 0) return s;   // 括号不配对＝不折腾，原文照用（老行为）
        const inner = s.slice(i + 1, j - 1);
        if (out.trim().charAt(0) === '@') out += '{' + _scan(inner) + '}';
        else out = _sel(out) + '{' + inner + '}';
        s = s.slice(j); i = 0; continue;
      }
      out += c; i++;
    }
    return out;
  };
  try { return _scan(css); } catch (e) { return css; }
}
function applyAppearance() {
  const a = _apView();
  const b = document.body;
  // 头像形状是顶层数据字段（不属 appearance），CSS 消费 data-avatar-shape；不在这里写＝重启后视觉打回圆形
  b.dataset.avatarShape = data.avatarShape || 'circle';
  b.dataset.apBubble = a.bubbleShape;
  b.dataset.apMine = a.mineColor;
  b.dataset.apMineText = a.mineText;
  // 全站字号（一根 80~140 的连续滑杆）：把百分比折成无单位数字写进 --ui-zoom，theme.css `.app-shell>*{zoom:var(--ui-zoom,1)}` 消费。
  // 夹一次区间在这里兼做——旧档残留的字符串已由 db.js 折成数字，这里只防「没跑过 ensureData 的临时 data」。
  const _uiv = Math.min(140, Math.max(80, Math.round(Number((data.appearance || {}).uiFontScale)) || 100));
  b.style.setProperty('--ui-zoom', (_uiv / 100).toFixed(4));
  b.dataset.apFrost = a.frost ? 'on' : 'off';   // 卡片毛玻璃：观感写在 css/theme.css 的 body[data-ap-frost=on] 段
  // 毛玻璃强度（--frost-blur）与「气泡也吃」（data-ap-frost-bubble）：只在 frost 开时被 theme.css 消费，值一直写不会错
  const _fb = Math.min(24, Math.max(0, Math.round(Number(a.frostBlur)) || 14));
  b.style.setProperty('--frost-blur', _fb + 'px');
  b.dataset.apFrostBubble = a.frostBubble ? 'on' : 'off';
  b.dataset.apDensity = a.density;
  b.dataset.apTime = a.showTime ? 'on' : 'off';
  b.dataset.apSendbtn = a.sendBtn === false ? 'off' : 'on';
  // 三组排版新档（2026-10-15）：头像对齐／小头像显隐／日期签位置，消费方都在 css/theme.css 的 data-ap-align/-avat/-daypos 段
  b.dataset.apAlign = a.alignMode === 'top' ? 'top' : 'bottom';
  b.dataset.apAvat = a.avatarShow === false ? 'off' : 'on';
  b.dataset.apDaypos = a.dayPos === 'head' ? 'head' : 'flow';
  b.dataset.apFontfamily = a.fontFamily;
  if (a.customFontCss) {
    b.dataset.apFontfamily = 'custom';
  }
  // 聊天气泡字体/字号（这一位 TA 各一份，值取自 chatAppearance 合成视图；入口在「TA 的设置 → 美化设置」）：
  // 与上面全局那两样（.app-shell 整站 / zoom 全站）不是一件事——这里只写这一本的聊天消息区。
  // 默认档零输出（同 density 的 cozy）：字体 inherit＝跟随全局「全站字体」、字号 medium＝出厂 →
  // 两条都不写属性＝不留一圈「看着选着、实则与出厂逐字节相同」的覆盖块。
  if (a.chatFont && a.chatFont !== 'inherit') b.dataset.apChatfont = a.chatFont; else delete b.dataset.apChatfont;
  if (a.chatFontSize === 'small' || a.chatFontSize === 'large') b.dataset.apChatfs = a.chatFontSize; else delete b.dataset.apChatfs;
  b.dataset.apGlass = a.glass ? 'on' : 'off';
  b.dataset.apGlasslite = a.glassLite === true ? 'on' : 'off';
  b.dataset.apDepth = _apDepth();
  // 光影档写手：与 depth 正交，两枚各写各的属性（CSS 侧 data-ap-light 的覆盖块也各写一处，互不干扰）
  b.dataset.apLight = _apLight();
  b.dataset.apCorner = _apCorner();
  b.dataset.apDeskall = ((data.appearance || {}).deskBgAll === true) ? 'on' : 'off';
  // 两枚透明度滑杆（美化设置里那一节，BUGS #314 二批）：值写成两枚**无单位数字**给 CSS 去乘，
  // 并在这里就按「这一本传没传背景图」掐一次——没传图时两栏一律完全不透（用户这一轮要的是「只在传图时能调」），
  // 旧档里残留的数值也不会在一面没有图的情况下偷偷留出字来。「有图吗」这件事只在这里判一次，
  // CSS 侧只问 var()（同一件事两处各写一份判据必有一处先漂）。夹区间同理：只有 db._caVeil 一处写手。
  const _vt = a.chatBg ? a.headVeil : 0, _ct = a.chatBg ? a.compVeil : 0;
  // 小数别名（BUGS #433）：没有 color-mix() 的老引擎里 CSS 那侧只能退回 rgba()，而退回的那一档
  // 必须还跟着滑杆走——兜底里写死 α 等于把滑杆冻住（「滑杆必须拖得出来」那条）。
  // 洗白取 (100−档)/100、压暗取 档/100；写法与 js/desk.js 那两枚 --desk-veil-a/--tabbar-veil-a 同源，
  // CSS 那头另给一份缺省值（老引擎没有 color-mix 时也读得到数）。
  const _washA = (t) => ((100 - t) / 100).toFixed(3);
  b.style.setProperty('--head-trans', _vt);
  b.style.setProperty('--head-wash-a', _washA(_vt));
  b.style.setProperty('--comp-trans', _ct);
  b.style.setProperty('--comp-wash-a', _washA(_ct));
  // 输入栏那一层分两笔：外圈带子吃滑杆全行程、装着字的胶囊本体夹在 28（＝旧三档里最透那一档 ≥72% 白，
  // theme.css 那条「输入栏不能透」与门 B10 钉的都是这件事）——滑到 100 也只是让图从带子里透上来，
  // 不让用户把自己正在打的那行字垫到图上。
  const _rowT = Math.min(_ct, 28);
  b.style.setProperty('--comp-row-trans', _rowT);
  b.style.setProperty('--comp-row-wash-a', _washA(_rowT));
  // 背景压暗（bgVeil，0~100）：同一处掐「有没有图」——没图时恒 0，墨纱一层不垫（CSS 那头 var 缺省也是 0）
  // 这枚别名与上面三枚**反向**：洗白算「纱还剩多少白」、压暗算「墨上多少」＝档就是 α 本身。
  const _vT = a.chatBg ? a.bgVeil : 0;
  b.style.setProperty('--chat-veil', _vT);
  b.style.setProperty('--chat-veil-a', (_vT / 100).toFixed(3));
  // 0 档不挂这个属性＝css/chat.css 那条 backdrop-filter 整条不输出：完全不透的一栏糊与不糊同色，
  // 常驻一层磨砂等于白付一趟合成（#071·#096 那条滚动发热）。
  if (_vt > 0) b.dataset.apHeadveil = 'on'; else delete b.dataset.apHeadveil;
  if (a.chatBg) {
    b.dataset.apBg = 'on';
    b.style.setProperty('--chat-bg', `url("${a.chatBg}")`);
  } else {
    b.dataset.apBg = 'off';
    b.style.removeProperty('--chat-bg');
  }
  applyDeskVars();
  if (a.partnerColor && a.partnerColor !== 'auto') b.dataset.apPartner = a.partnerColor; else delete b.dataset.apPartner;
  if (a.partnerText && a.partnerText !== 'auto') b.dataset.apPartnerText = a.partnerText; else delete b.dataset.apPartnerText;
  // 辅助文字三项（时间轴／消息时间／系统消息）：与上方 partner* 同一写法，'auto'＝跟随主题＝不写属性
  if (a.dayStyle && a.dayStyle !== 'auto') b.dataset.apDay = a.dayStyle; else delete b.dataset.apDay;
  if (a.metaColor && a.metaColor !== 'auto') b.dataset.apMeta = a.metaColor; else delete b.dataset.apMeta;
  if (a.sysStyle && a.sysStyle !== 'auto') b.dataset.apSys = a.sysStyle; else delete b.dataset.apSys;
  // 自定义字体 CSS
  if (a.customFontCss) {
    let fontStyle = $('#ordinal-custom-font-style');
    if (!fontStyle) {
      fontStyle = document.createElement('style');
      fontStyle.id = 'ordinal-custom-font-style';
      document.head.appendChild(fontStyle);
    }
    fontStyle.textContent = a.customFontCss;
  } else {
    const fontStyle = $('#ordinal-custom-font-style');
    if (fontStyle) fontStyle.remove();
  }
  // 自定义气泡 CSS（加权版见 _scopeBubbleCss；data-ap-bubcss 是加权选择器的落点，没这一段前缀匹配不到）
  if (a.customBubbleCss) {
    let bubbleStyle = $('#ordinal-custom-bubble-style');
    if (!bubbleStyle) {
      bubbleStyle = document.createElement('style');
      bubbleStyle.id = 'ordinal-custom-bubble-style';
      document.head.appendChild(bubbleStyle);
    }
    bubbleStyle.textContent = _scopeBubbleCss(a.customBubbleCss);
    b.dataset.apBubcss = 'on';
  } else {
    const bubbleStyle = $('#ordinal-custom-bubble-style');
    if (bubbleStyle) bubbleStyle.remove();
    delete b.dataset.apBubcss;
  }
  // 自定义全局字体 CSS
  if (a.customGlobalFontCss) {
    let globalFontStyle = $('#ordinal-custom-global-font-style');
    if (!globalFontStyle) {
      globalFontStyle = document.createElement('style');
      globalFontStyle.id = 'ordinal-custom-global-font-style';
      document.head.appendChild(globalFontStyle);
    }
    globalFontStyle.textContent = a.customGlobalFontCss;
  } else {
    const globalFontStyle = $('#ordinal-custom-global-font-style');
    if (globalFontStyle) globalFontStyle.remove();
  }
  // 两条样式同特异度、靠书写序决胜，而它们各自「有值才建、没值就摘」＝创建序跟着操作顺序漂：
  // 先填 CSS 框再上传字体文件，就会出现「刚传的字体把用户手打那段压掉了」这种与屏上下半相反的读法。
  // 这里把次序钉死＝字体文件在前、手打的字体 CSS 在后（手写一段 CSS 是更显式的覆盖动作）。
  {
    const ff = $('#ordinal-custom-font-style'), gf = $('#ordinal-custom-global-font-style');
    if (ff && gf && (ff.compareDocumentPosition(gf) & Node.DOCUMENT_POSITION_PRECEDING)) document.head.insertBefore(ff, gf);
  }
  // 气泡 CSS 那张表**永远搬到 head 末位**：它是「用户显式改这一位 TA 的气泡」＝同权重里必须最后说才算数
  // （创建序跟着操作顺序漂的那一族，与上面两枚字体表的排序同因）。appendChild 对已挂载节点就是搬家。
  {
    const bb = $('#ordinal-custom-bubble-style');
    if (bb) document.head.appendChild(bb);
  }
}

function updateDataStats() {
  const el = $('#dataStats'); if (!el) return;
  const msgs = (data.messages || []).length;
  const letters = (data.sentLetters || []).length + (data.receivedLetters || []).length;
  const stickers = (data.stickers || []).length;
  const groups = (data.groups || []).reduce((s, g) => s + (g.cards || []).length, 0);
  // 体积读数已收进下面那张「存储」卡（BUGS #191），这里不再各印一份——两处算同一个数必有一个是旧的
  el.innerHTML = '消息 ' + msgs + ' 条 · 信件 ' + letters + ' 封 · 表情包 ' + stickers + ' 张 · 字卡 ' + groups + ' 张';
  // 「存储」卡跟着这一格走：进数据格与点数据 tab 两条路都从这一个 binding 点过（挂两处必有一个忘改）
  if (typeof storageViewShown === 'function') storageViewShown();
}

// 聊天页的下钻子页：从这些页面回到聊天＝回到刚才读到的位置，不重新定位到底部。
// 名单之外的来源（会话列表 chats、功能中心 hub、通知冷启动直达）都算「打开会话」，一律停在最新。
const CHAT_SUB_VIEWS = ['settings', 'mate', 'mailbox', 'cards', 'anniversary', 'stats', 'letterstats', 'avatarlib', 'collect', 'cjian', 'cardfit', 'player', 'moments'];

// 页名只此一张表：顶栏标题与返回键那句「返回××」共用它，两处各写一份必漂（#215 那批手抄名单的同一课）。
// 动态名（对方昵称）在调用时现算——旧写法每次 updateTopbarTitle 重建整张表，效果相同，搬出来不能顺手做成常量。
function topbarName(name) {
  const names = { collect: '收藏', chat: chatPartnerName(), chats: '聊天', mailbox: '信箱', cards: '字卡库', syscards: '系统预设字卡', settings: '设置', mate: chatPartnerName() + ' 的设置', anniversary: '纪念日', stats: '聊天统计', letterstats: '写信统计', silent: '主动消息', avatarlib: '头像昵称', cjian: '世界感知', wish: '心愿', games: '游戏', invite: '邀请', cardfit: '字卡适应度', player: '播放器', hub: '使用大全', more: '更多', moments: '朋友圈', emotion: '聊天情绪' };
  return names[name] || '';
}

// 顶栏那两枚返回件的目标＝「你从哪来」。来路栈只活在本页寿命（同 _mateMemOpen∶_cfWho∶ordinal-cjian-tab 那一族），
// 不进 data 不进备份：刷新后人已回到冷启动那一页，还记着一路钻进来的栈反而是句假话。
const _navStack = [];
const NAV_MAX = 24;                                                         // 只为不无界长，远够本站最深处
const NAV_ROOT_VIEWS = ['chats', 'chat', 'cards', 'cjian', 'more'];         // 底部导航那四枚＋聊天页：站在根上不叫「钻进来」
function _navLabel(view) { const nm = topbarName(view); return nm ? '返回' + nm : '返回上一页'; }
// 两枚返回件一处口径（左上箭头与可点的居中标题）：只改 data-view 会留下 title/aria 那句旧指向＝看着能点、说法还是假的
function _setBackTarget(name) {
  const to = NAV_ROOT_VIEWS.indexOf(name) >= 0 ? 'chats' : (_navStack.length ? _navStack[_navStack.length - 1] : 'chats');
  const label = _navLabel(to);
  ['#backChatsBtn', '#topbarTitle'].forEach(sel => {
    const el = $(sel);
    if (!el) return;
    el.dataset.view = to;
    el.title = label;
    el.setAttribute('aria-label', label);
  });
}

function showView(name) {
  const map = { chat: 'chatView', chats: 'chatsView', collect: 'collectView', mailbox: 'mailboxView', cards: 'cardsView', syscards: 'sysCardsView', settings: 'settingsView', mate: 'mateView', anniversary: 'anniversaryView', stats: 'statsView', letterstats: 'letterStatsView', silent: 'silentView', avatarlib: 'avatarlibView', cjian: 'cjianView', hub: 'hubView', wish: 'wishView', games: 'gamesView', invite: 'inviteView', cardfit: 'cardFitView', player: 'playerView', moments: 'momentsView', more: 'moreView', emotion: 'emotionView' };
  const actual = map[name];
  if (!actual) return;
  const prevView = document.body.dataset.view || '';   // 记录来路：决定进聊天页时是停在最新还是保留位置
  $$('.view').forEach(v => v.classList.toggle('active', v.id === map[name]));
  // 这两枚排除在高亮之外：css/theme.css 的 `.icon-btn.active` 会把它画成一枚选中的白岛，
  // 而返回件的 data-view 自本批起可以等于「当前这一页」（回来源页），再 toggle 就成了「自己高亮自己」。
  $$('[data-view]').forEach(b => {
    if (b.id === 'backChatsBtn' || b.id === 'topbarTitle') return;
    b.classList.toggle('active', b.dataset.view === name);
  });
  document.body.dataset.view = name;
  // 顶栏那两枚返回件＝回「来源页」：点的就是返回＝弹掉来路（不反向压回刚离开的那页），真的钻进来一页＝压栈
  if (prevView && prevView !== name) {
    if (_navStack[_navStack.length - 1] === name) _navStack.pop();
    else { _navStack.push(prevView); if (_navStack.length > NAV_MAX) _navStack.shift(); }
  }
  _setBackTarget(name);
  if (name === 'cjian' && typeof renderCjianPage === 'function') renderCjianPage();
  if (name === 'hub' && typeof renderHubPage === 'function') renderHubPage();
  updateTopbarTitle(name);
  if (name === 'chat') {
    updateHomeIndex();
    // 进入聊天页即视为已读：清活跃会话未读角标（含桌面列表重复点当前会话行的路径）
    const ch = data.chats && data.chats[data.activeChat];
    if (ch && ch.unread) { ch.unread = 0; save(); }
    if (prevView !== 'chat' && CHAT_SUB_VIEWS.indexOf(prevView) < 0) requestAnimationFrame(enterChatAtLatest);
  }
  if (name === 'chats') requestAnimationFrame(renderChatsList);
  // 收藏页走 openCollectView 而不是裸 renderCollectList：进页要把「TA 的」那位筛选复位到全部，
  // 否则上一趟筛的人会一直留着，收到别人的收藏 toast 点进来只看得到那一位（BUGS #162）。
  if (name === 'collect') requestAnimationFrame(() => { if (typeof openCollectView === 'function') openCollectView(); else renderCollectList(); });
  // 回复设置按联系人隔离：切过联系人再进设置页，必须回显当前联系人的设置（否则旧输入会覆盖新联系人的配置）
  if (name === 'settings') requestAnimationFrame(renderProfile);
  if (name === 'mate') requestAnimationFrame(() => { renderProfile(); if (typeof renderFolds === 'function') renderFolds(); });
  if (name === 'cards') requestAnimationFrame(() => renderGroups());
  if (name === 'syscards') requestAnimationFrame(() => renderSysCards());
  if (name === 'mailbox') requestAnimationFrame(renderMailbox);
  if (name === 'anniversary') requestAnimationFrame(renderAnniversary);
  if (name === 'stats') requestAnimationFrame(renderStats);
  if (name === 'letterstats') requestAnimationFrame(renderLetterStats);
  if (name === 'avatarlib' && typeof renderAvatarlibPage === 'function') requestAnimationFrame(renderAvatarlibPage);
  if (name === 'wish' && typeof renderWishPage === 'function') requestAnimationFrame(renderWishPage);
  if (name === 'games' && typeof renderGames === 'function') requestAnimationFrame(renderGames);
  if (name === 'invite' && typeof renderInvitePage === 'function') requestAnimationFrame(renderInvitePage);
  if (name === 'emotion') renderEmotionPage();
  if (name === 'silent' && typeof renderSilentPage === 'function') requestAnimationFrame(renderSilentPage);
  if (name === 'cardfit' && typeof cfRender === 'function') requestAnimationFrame(cfRender);
  if (name === 'player' && typeof renderPlayerAll === 'function') requestAnimationFrame(renderPlayerAll);
  if (name === 'moments' && typeof renderMoments === 'function') requestAnimationFrame(renderMoments);
}

// 顶栏居中标题：聊天页显示对方名字，其余页显示页名（点击标题区＝回来源页，与左上箭头同一个目标同一句说法）
// 聊天头部昵称只写内层 #chatHeadNameText（整体 textContent 会连点击目标一起抹掉）；
// #typingIndicator 已搬出那一格、自成头部第二行的一枚读数，见 css/chat.css 与 BUGS #158
function updateTopbarTitle(name) {
  const tt = $('#topbarTitleText');
  const cht = $('#chatHeadNameText');
  const finalName = topbarName(name);
  if (tt) tt.textContent = finalName;
  // 头部昵称只认「聊天页」这一份名字：原先把 finalName 无条件写进去，于是翻到字卡库/设置等页时，
  // 聊天头那格会被写成「字卡库」「设置」——虽然那页聊天头不可见，但切回聊天前若某条路径不重写，
  // 昵称就会停在别的页名上。群聊时 chatPartnerName() 返回群名，点群名同样触发一轮。
  if (cht) cht.textContent = (name === 'chat') ? chatPartnerName() : '';
  // 「点昵称让对方继续说」的可用态跟随 csTriggerName：关掉后既不写 title 也撤掉 pointer 光标，
  // 否则昵称看上去可点、按下去没反应（title 只在 renderProfile 里回显，不开设置页就同步不过来）。
  const _hn = $('#chatHeadName');
  if (_hn) {
    const _csOn = !!(data.behavior && data.behavior.csTriggerName);
    _hn.title = _csOn ? '点击让对方继续说' : '';
    _hn.style.cursor = _csOn ? 'pointer' : 'default';
  }
}

// '#' 那种动作直达（字号·诊断信息·桌面美化·数据备份·搜索聊天记录…）不在 showView 映射里，
// 统一投递给 js/hub.js 的 _hubRoute（唯一路由，2026-10-14 修「更多页那四枚点了没反应」）
$$('[data-view]').forEach(b => {
  b.addEventListener('click', () => {
    const v = b.dataset.view;
    if (v && v.charAt(0) === '#' && typeof _hubRoute === 'function') { _hubRoute(v); return; }
    showView(v);
  });
});

// 信箱 tab（三枚：TA 的来信｜我的写信｜TA 的回信）。2026-10-14 BUGS #402 起按「这封信是谁起的头」分册，
// 旧两枚（收到的信｜寄出的信）按方向分＝回信混在来信里只别一枚徽章（用户报的「分类有缺陷」）
$$('.mailbox-tab').forEach(b => b.onclick = () => {
  $$('.mailbox-tab').forEach(t => t.classList.toggle('active', t === b));
  const tab = b.dataset.tab;
  $('#proactiveList').hidden = tab !== 'proactive';
  $('#replyList').hidden = tab !== 'reply';
  $('#sentList').hidden = tab !== 'sent';
});

// 设置 tab（四格：提醒 / 外观 / 数据 / 关于）。2026-10-13 白天那版「四组平铺·无页签」整版撤销——
// 用户「分类很乱，没有顶部tag可以直接点击切换」：页签回来＋卡按格显隐（css/settings.css 那两组选择器），
// 切格把列表滚回顶（同 ask 面板打开时滚动区归零那条：换了一屏内容却停在旧位置＝读起来像没切）。
// 「关于」格 2026-10-13 晚由数据格末尾独立（许可卡原挂 data-tab="data"）；hub.js 的 #about 直达跟着走那一格。
$$('.settings-tab').forEach(t => t.addEventListener('click', () => {
  document.body.dataset.settingsTab = t.dataset.tab;
  const list = $('#settingsList'); if (list) list.scrollTop = 0;
  if (t.dataset.tab === 'data') { updateDataStats(); renderStats(); }
  if (t.dataset.tab === 'desk') renderApSettings();
  // 「TA 的收藏」那三枚概率原在这里懒绑定（切到 world/notify 格才回显）——2026-10-09 面板搬进收藏页，
  // 读写与绑定一起交回 js/collect.js，不留第二处写手
  renderProfile();
}));

// 头像选择
let avatarPickTarget = 'profile';
$('#partnerAvatarButton').onclick = () => { avatarPickTarget = 'profile'; $('#avatarInput').click(); };
$('#myAvatarButton').onclick = () => { avatarPickTarget = 'me'; $('#avatarInput').click(); };
$('#avatarInput').onchange = async e => {
  if (!e.target.files[0]) return;
  const img = await fileData(e.target.files[0], 256);
  if (!img) return;
  if (avatarPickTarget === 'me') {
    // 我这侧上传＝只改**这一本会话**那一份覆盖；会话对象取不到（存档坏了）才退回全局那份，
    // 不留「按了头像钮、图没进去」那种静默失败
    const _mr = chatMyRowOf(data.activeChat);
    if (_mr) _mr.myChatAvatar = img; else data.me.avatar = img;
  } else {
    // 写入对象＝**本页正在编辑的那位/那群**，不是「此刻开着的会话」：群设置整页顶部那排成员 chip
    // 可以把这一屏换成某一位成员（名字框改的就是他），旧写法在这里取 currentContact()＝那个群本身，
    // 于是「给某一位成员传头像」落成了群头像，回到「本群」那一屏群就顶着一张 TA 的脸（BUGS #197）。
    const c = (typeof _mateTarget === 'function' ? _mateTarget() : currentContact()) || currentContact();
    if (c) { c.avatar = img; c.chatAvatar = ''; }   // 对方头像按联系人各存一份；覆盖基础头像即清除聊天内头像覆盖
    if (!c || c.id === 'c0') data.profile.avatar = img;   // 主联系人镜像全局 profile（信箱与通知图标用）
  }
  renderMessages();
  renderChatsList();
  await flushSave();
  renderProfile();
  showToast('已上传');
};

// 头像形状
$('.avatar-shape-row')?.addEventListener('click', async e => {
  const btn = e.target.closest('.shape-btn');
  if (btn) {
    data.avatarShape = btn.dataset.shape;
    document.body.dataset.avatarShape = data.avatarShape;
    renderShapeButtons();
    renderMessages();
    renderMailbox();
    await flushSave();
  }
});

// 资料与音色绑定：改名字／填音色当场落库（控件在 js/mate.js 的「TA 的设置」页，保存逻辑同在该模块）

// 回复设置：自动保存（修改任一输入即存）+ 保存按钮兜底
async function saveBehaviorNow() {
  const bh = data.behavior || {};
  const num = (id, min, max) => { const v = Number($(id).value); return Math.max(min, Math.min(max, Number.isFinite(v) ? v : min)); };
  // 空框＝「这一格先不当数」（回 null，由调用方决定不动哪一个字段）。只用在这一族两格上：
  // 别的格子沿用「空的也夹到下限」那套旧语义，用户没点名，不顺手改（saveCallNow 里那份同名的
  // num 有同样的毛病，本轮未越界去动，已报）。
  const keep = (id, min, max) => { const raw = String($(id).value || '').trim(); return raw === '' ? null : num(id, min, max); };
  bh.rnProb = num('#rnProb', 0, 100);
  bh.strayProb = num('#strayProb', 0, 100);   // 「话没挤过来」那一枚（BUGS #153 二批）：0＝从不，与 rnProb 同一把尺
  // TA 自己把那两枚问签标上的概率（BUGS #350）：两格各管一枚签、同一份档两处开口路径共用，
  // 出厂 0＝「从不自己标、只能你长按去问」＝与上线前逐字节相同的行为。
  bh.referProb = num('#referProb', 0, 100);
  bh.meantProb = num('#meantProb', 0, 100);
  bh.rsMin = num('#rsMin', 1, 3600);
  bh.rsMax = Math.max(bh.rsMin, num('#rsMax', 1, 3600));
  // 回复条数两格：2026-10-08 曾被摘掉入口（BUGS #159），2026-10-09 用户点名装回（BUGS #211）。
  // max 那枚必须夹在 min 之上——只夹各自区间的话，用户填「最少 5／最多 2」会让 js/app.js 每次
  // 加载都去配平（b.replyMax = Math.max(replyMin, replyMax)），屏上显示与真正生效的数就分家。
  // 空框不当 0 用（keep）：旧写法 Number('')===0 是「有限数」→ 夹到下限 1 → renderProfile 把 1
  // 写回框里，用户接着打的数字就长在它后面变成两位数——正是「我输入数字会强制变成两位数」那条。
  // 删空＝这一格不动，失焦那次 change 再定数（显示也在那一刻才回落到存着的值，见 render.js 的 _setNum）。
  const _rpMin = keep('#replyMin', 1, 10), _rpMax = keep('#replyMax', 1, 10);
  if (_rpMin !== null) bh.replyMin = _rpMin;
  bh.replyMax = Math.max(bh.replyMin, _rpMax === null ? (Number(bh.replyMax) || bh.replyMin) : _rpMax);
  bh.pyEnabled = $('#pyEnabled').checked;
  bh.tsEnabled = $('#tsEnabled').checked;
  bh.enterSend = $('#enterSend').checked;
  bh.batchSend = $('#batchSend').checked;   // 批量发送（FR 2026-10-11，复刻自家 mochi 同名功能）：每联系人独立，默认关
  bh.pyProb = num('#pyProb', 0, 100);
  bh.pyMin = num('#pyMin', 1, 20);
  bh.pyMax = Math.max(bh.pyMin, num('#pyMax', 1, 20));
  bh.pyPunctEnabled = $('#pyPunctEnabled').checked;   // 拼接符号池各枚由 chips 即点即存，不走本函数
  bh.csNormal = $('#csNormal').checked;
  bh.csTriggerName = $('#csTriggerName').checked;
  bh.touchProb = num('#touchProb', 0, 100);
  bh.stickerProb = num('#stickerProb', 0, 100);
  bh.emojiProb = num('#emojiProb', 0, 100);
  bh.kaomojiProb = num('#kaomojiProb', 0, 100);
  bh.imageProb = num('#imageProb', 0, 100);
  bh.voiceProb = num('#voiceProb', 0, 100);
  bh.quoteProb = num('#quoteProb', 0, 100);
  bh.rcProb = num('#rcProb', 0, 100);
  bh.rcRefix = num('#rcRefix', 0, 100);
  // 勾选「禁止联系人撤回消息」= 联系人不会撤回 => recallEnabled=false
  bh.recallEnabled = !$('#recallEnable').checked;
  bh.asEnabled = $('#asEnabled').checked;
  bh.asProb = num('#asProb', 0, 100);
  bh.asMin = num('#asMin', 1, 720);
  bh.asMax = Math.max(bh.asMin, num('#asMax', 1, 720));
  bh.asCountMin = num('#asCountMin', 1, 10);
  bh.asCountMax = Math.max(bh.asCountMin, num('#asCountMax', 1, 10));
  bh.dndEnabled = $('#dndEnabled').checked;
  bh.asByState = $('#asByState').checked;
  bh.rnByState = $('#rnByState').checked;   // 只管「已读不回」那一格的那枚闸（BUGS #290），与上面那枚各管一件事
  bh.asBadge = $('#asBadge').checked;
  bh.asGroupProb = num('#asGroupProb', 0, 100);
  bh.annSelfOn = $('#annSelfOn').checked;
  bh.annSelfProb = num('#annSelfProb', 0, 100);
  data.behavior = bh;
  // iOS 冻结/关页保险：设置这类关键写不等 1200ms 去抖，await flushSave() 真落盘后再返回
  //（flushSave 现返回 Promise：先同步镜像一份 localStorage，再 await IndexedDB 写；#037 那条旧注释已过时）
  await flushSave();
  if (typeof rescheduleActiveSend === 'function') rescheduleActiveSend();
  if (typeof _syncBatchBtn === 'function') _syncBatchBtn();   // 开关一翻，输入栏那枚「批量发送」钮立刻跟上（不用等切会话）
  renderProfile();
  return Promise.resolve('ok');
}

// 通话设置：自动保存 + 保存按钮兜底
async function saveCallNow() {
  const num = (id, min, max) => { const v = Number($(id).value); return Math.max(min, Math.min(max, Number.isFinite(v) ? v : min)); };
  const ringMin = num('#callRingMin', 1, 60);
  const callMin = num('#callMinLen', 1, 60);
  const iRingMin = num('#callIncomingRingMin', 1, 120);
  const iMin = num('#callIncomingMin', 1, 1440);
  data.callSettings = {
    answerProb: num('#callAnswerProb', 0, 100),
    rejectProb: num('#callRejectProb', 0, 100),
    missProb: num('#callMissProb', 0, 100),
    busyProb: num('#callBusyProb', 0, 100),
    ringMin,
    ringMax: Math.max(ringMin, num('#callRingMax', 1, 60)),
    callMinLen: callMin,
    callMaxLen: Math.max(callMin, num('#callMaxLen', 1, 60)),
    incomingEnable: !!$('#callIncomingEnable').checked,
    incomingRingMin: iRingMin,
    incomingRingMax: Math.max(iRingMin, num('#callIncomingRingMax', 1, 120)),
    incomingMin: iMin,
    incomingMax: Math.max(iMin, num('#callIncomingMax', 1, 1440)),
    noAutoHangup: !!$('#callNoAutoHangup').checked,
    voiceGreetEnable: !!$('#callVoiceGreet').checked,
    voiceGreetProb: num('#callVoiceGreetProb', 0, 100)
  };
  // iOS 冻结/关页保险：设置这类关键写不等 1200ms 去抖，await flushSave() 真落盘后再返回
  //（flushSave 现返回 Promise：先同步镜像一份 localStorage，再 await IndexedDB 写；#037 那条旧注释已过时）
  await flushSave();
  renderProfile();
  return Promise.resolve('ok');
}
// 设置卡自动保存（界面状态本身就是反馈，不再弹「保存成功」）
function _autoSaveCard(containerSel, saveFn) {
  const card = $(containerSel);
  if (!card) return;
  let timer;
  const queue = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      await saveFn();
      if (typeof renderFoldSummaries === 'function') renderFoldSummaries();
    }, 400);
  };
  card.addEventListener('input', queue);
  card.addEventListener('change', queue);
}
_autoSaveCard('#behaviorCard', saveBehaviorNow);
// 「主动」组（2026-10-14 #408 分组重做）：「主动找你」与「TA 自己想起日子」两卡随分组搬出了
// #behaviorCard 的子树（html/view-mate.html 的账），自动保存跟着补一行登记——仍是 saveBehaviorNow
// 一条链，不另开第二个写手（那一节分家前的老账：保存路径一条）。
_autoSaveCard('[data-mate-grp="proactive"]', saveBehaviorNow);
_autoSaveCard('#callCard', saveCallNow);

// 「一次回话几条」两格的 −／＋步进钮（BUGS #211 二批，用户点名要能按的钮）。
// 区间只问框自己的 min/max——那两枚值与 js/chat.js 引擎上限同一把尺（BUGS #127 那一刀），
// 这里再写一个数就是第二份实现，下次改上限必有一处忘跟。
// 保存路径也一条：改完值派发一枚 input 冒泡给 _autoSaveCard，不另调一次 saveBehaviorNow。
document.addEventListener('click', e => {
  const b = e.target.closest ? e.target.closest('[data-stp]') : null;
  if (!b) return;
  const el = document.getElementById(b.dataset.stp);
  if (!el || !el.min) return;
  const min = Number(el.min), max = Number(el.max);
  const raw = String(el.value || '').trim();
  const cur = raw === '' ? NaN : Number(raw);
  // 框被删空时从「存着的那个数」起步：从下限起步会把用户刚清掉的那一档凭空吞掉
  const st = Number((data.behavior || {})[el.id]);
  const base = Number.isFinite(cur) ? cur : (Number.isFinite(st) && st > 0 ? st : min);
  el.value = Math.max(min, Math.min(max, base + (Number(b.dataset.d) || 0)));
  el.dispatchEvent(new Event('input', { bubbles: true }));
});

// 多字卡「拼接随机标点」符号池：药丸 chips 即点即存；至少保留一枚（点掉最后一枚的尝试拦下不落盘）。
// 上游双闸（多字卡回复/拼接随机标点任一关）时整组置灰但仍可点，方便提前配好池子（对齐 mochi #956 口径）
const _PY_PUNCT_POOL = ['pyPunctSpace', 'pyPunctDou', 'pyPunctPer', 'pyPunctEx', 'pyPunctQ', 'pyPunctEl', 'pyPunctDash', 'pyPunctNl'];
function renderPyPunctChips() {
  const box = $('#pyPunctChips');
  if (!box) return;
  const bh = data.behavior || {};
  box.classList.toggle('dis', !bh.pyEnabled || !bh.pyPunctEnabled);
  box.querySelectorAll('.punct-chip').forEach(ch => ch.classList.toggle('sel', !!bh[ch.dataset.pk]));
}
(function () {
  const box = $('#pyPunctChips');
  if (!box) return;
  box.addEventListener('click', e => {
    const ch = e.target.closest('.punct-chip');
    if (!ch || !data.behavior) return;
    const k = ch.dataset.pk;
    if (_PY_PUNCT_POOL.indexOf(k) < 0) return;
    if (data.behavior[k]) {
      if (!_PY_PUNCT_POOL.some(x => x !== k && data.behavior[x])) { showToast('至少保留一个拼接符号'); return; }
      data.behavior[k] = false;
    } else {
      data.behavior[k] = true;
    }
    save();
    renderPyPunctChips();
  });
})();

// 信箱设置已整族搬进信箱页（js/mailbox.js 的 openMbSettings / saveMbSettingsNow）：
// 那张 data-fold="mb" 折叠卡、这份 saveMailboxNow 与它的 _autoSaveCard 绑定同批删除，不留第二处入口与第二份实现

// 朋友圈那二十三枚概率不在设置页：入口与面板都在朋友圈页自己那一面（js/moments.js 的 renderMomentsSettings /
// saveMomentsNow，宿主 html/view-moments.html 的 #mmSetSheet）——2026-10-09 按「一处只有一份」搬过去后就没回来过，
// 本文件留着绑定会写出第二份实现

// 纪念日功能已拆分至 js/anniversary.js（独立视图：多条纪念日可归属联系人 + 主纪念日按联系人生效 + 月历选日期）

// 外观设置：色点组即点即存（mineColor/mineText/partnerColor/partnerText + 辅助文字三项 dayStyle/metaColor/sysStyle）
[['#apMineColor', 'mineColor'], ['#apMineText', 'mineText'], ['#apPartnerColor', 'partnerColor'], ['#apPartnerText', 'partnerText'], ['#apDayStyle', 'dayStyle'], ['#apMetaColor', 'metaColor'], ['#apSysStyle', 'sysStyle']].forEach(([sel, key]) => {
  const grid = $(sel);
  if (!grid) return;
  grid.addEventListener('click', async e => {
    const chip = e.target.closest('.ap-dot');
    if (!chip) return;
    _caSh()[key] = chip.dataset.v;
    grid.querySelectorAll('.ap-dot').forEach(c => c.classList.toggle('active', c === chip));
    echoApDotNames();
    applyAppearance();
    await flushSave();
  });
});

// 聊天气泡字体/字号 chips（2026-10-15，居「TA 的设置 → 美化设置」）：与上面那排色点同一个存储体 _caSh()，
// 即【这一位 TA 自己那份】。这两行刻意不带 data-ap-set——那是全局 appearance 的委托入口（settings.js 那条
// document 委托只认 chip.closest('[data-ap-set]') 的容器），不写＝不会被它吃掉，自成这一条写入路径。
[['#apChatFont', 'chatFont'], ['#apChatFontSize', 'chatFontSize']].forEach(([sel, key]) => {
  const row = $(sel);
  if (!row) return;
  row.addEventListener('click', async e => {
    const chip = e.target.closest('.contact-chip');
    if (!chip) return;
    if (_caSh()[key] === chip.dataset.v) return;
    _caSh()[key] = chip.dataset.v;
    row.querySelectorAll('.contact-chip').forEach(c => c.classList.toggle('active', c === chip));
    applyAppearance();
    if (typeof renderFoldSummaries === 'function') renderFoldSummaries();
    await flushSave();
  });
});

// 色点行右端的档名读数（2026-10-14）：八枚圆点一枚模样，选中了哪档靠行尾这行小字说。
// 档名不另存一份——就读选中那枚的 title（墨黑/雾蓝/跟随主题…），两处不同源必有一处先漂。
function echoApDotNames() {
  ['#apMineColor', '#apPartnerColor', '#apMineText', '#apPartnerText', '#apDayStyle', '#apMetaColor', '#apSysStyle'].forEach(sel => {
    const g = $(sel);
    if (!g) return;
    const d = g.querySelector('.ap-dot.active');
    const out = g.parentElement.querySelector('.ap-dotname');
    if (out) out.textContent = d ? (d.title || '') : '';
  });
}

// 三根滑杆（聊天栏/输入栏透明度＋背景压暗，BUGS #314 二批与 2026-10-14 压暗那批）：拖到哪就存到哪，
// 写的是【这一位 TA 自己那份】（_caSh() 与上面那排 chips 同一个存储体，不留第二条写入路径）。
// 不弹 toast——底下那两栏当场跟着变就是反馈。
// 区间只由 db._caVeil 一处夹（这里只挡「读数不是个数」这一种脏值，不重复夹一遍上下限＝两处必有一处先漂）。
[['#apHeadVeil', 'headVeil', '#apHeadVeilOut'], ['#apCompVeil', 'compVeil', '#apCompVeilOut'], ['#apBgVeil', 'bgVeil', '#apBgVeilOut']].forEach(([sel, key, outSel]) => {
  const el = $(sel);
  if (!el) return;
  el.addEventListener('input', () => {
    const v = Number(el.value);
    if (!Number.isFinite(v)) return;
    _caSh()[key] = v;
    const out = $(outSel);
    if (out) out.textContent = v + '%';
    applyAppearance();
  });
  el.addEventListener('change', () => save());
});

// 后台运行功能已拆分至 js/background.js（保活引擎/通知/测试/开关绑定自包含模块）

// 聊天背景图上传/清除
$('#apBgUpload').onclick = () => $('#chatBgInput').click();
$('#chatBgInput').onchange = async e => {
  if (!e.target.files[0]) return;
  const img = await fileData(e.target.files[0], 1440, 0.8);
  if (!img) return;
  _caSh().chatBg = img;
  applyAppearance();
  renderApSettings();
  await flushSave();
  showToast('背景已更新');
  e.target.value = '';
};
$('#apBgClear').onclick = async () => {
  _caSh().chatBg = '';
  applyAppearance();
  renderApSettings();
  await flushSave();
};

// 「恢复本会话默认外观」（2026-10-14）：这一位 TA 的外观档此前没有一键回头路。
// 两段式确认（player.js「再点一次就清」同族，全仓不用原生 confirm）：点一下改口，
// 3 秒不点自动回落。只清 chatAppearance[activeChat] 一本，其他 TA 与全局设置不动；
// _caSh() 下次写入会按 chatAppearanceDefault 重新垫底，db.ensureData 的 _caFill 也认这本缺页。
const AP_RESET_LABEL = '恢复本会话默认外观';
let _apResetArmed = false, _apResetTimer = 0;
// 武装态复位（js/render.js 的 renderProfile 每次进页/换会话都会调）：两段式确认的第一下点过之后
// 切走再回来，态与按钮文案一起回初始——不带进下一本会话（timer 是 3 秒自回落，但文案不跟渲染走，
// 旧写法下「态已被 timer 放掉、按钮还停在『再点一次确认』」这种错位读法留到现在）。
function _apResetDisarm() {
  if (!_apResetArmed) return;
  _apResetArmed = false;
  clearTimeout(_apResetTimer);
  const btn = $('#apResetAll');
  if (btn) btn.textContent = AP_RESET_LABEL;
}
$('#apResetAll').addEventListener('click', async () => {
  const btn = $('#apResetAll');
  if (!_apResetArmed) {
    _apResetArmed = true;
    btn.textContent = '再点一次确认恢复';
    clearTimeout(_apResetTimer);
    _apResetTimer = setTimeout(() => { _apResetArmed = false; btn.textContent = AP_RESET_LABEL; }, 3000);
    return;
  }
  clearTimeout(_apResetTimer);
  _apResetArmed = false;
  btn.textContent = AP_RESET_LABEL;
  // 空会话不删不报：activeChat 为空时没有「这一本」可清，直接退出（防止对 chatAppearance[''] 误删）
  if (!data.activeChat) return;
  const _had = !!(data.chatAppearance && data.chatAppearance[data.activeChat]);
  if (_had) delete data.chatAppearance[data.activeChat];
  applyAppearance();
  renderApSettings();
  await flushSave();
  if (typeof renderFoldSummaries === 'function') renderFoldSummaries();
  // 提示如实：本就没有覆盖档时不说「已恢复」（本仓不留「点了、报了、实际什么都没发生」那一族）
  showToast(_had ? '已恢复默认外观' : '本就已是默认外观');
});

// 桌面前台弹窗开关：即点即存（js/deskpop.js deskPopEnabled 读取）
$('#deskPopupToggle').addEventListener('change', async e => {
  data.appearance.deskPopup = e.target.checked;
  await flushSave();
  showToast(e.target.checked ? '已开启桌面前台弹窗' : '已关闭桌面前台弹窗');
});
// 弹窗行数 chips（1 行 / 2 行并行）：即点即存（js/deskpop.js _deskPopMax 读取）
const _deskPopRowsRow = $('#deskPopRowsRow');
if (_deskPopRowsRow) _deskPopRowsRow.addEventListener('click', async e => {
  const chip = e.target.closest('.contact-chip');
  if (!chip) return;
  const rows = Number(chip.dataset.rows) === 1 ? 1 : 2;
  if (data.appearance.deskPopRows === rows) return;
  data.appearance.deskPopRows = rows;
  await flushSave();
  _echoDeskPopRows();
  if (rows === 1 && typeof deskPopEnforceMax === 'function') deskPopEnforceMax();   // 已挂两行时立即收缩为一行
  showToast(rows === 1 ? '已设为 1 行弹窗' : '已设为 2 行并行弹窗');
});
function _echoDeskPopRows() {
  const row = $('#deskPopRowsRow');
  if (!row) return;
  const rows = data.appearance.deskPopRows === 1 ? '1' : '2';
  row.querySelectorAll('.contact-chip').forEach(ch => ch.classList.toggle('active', ch.dataset.rows === rows));
}
// 夜间免打扰三档 chips（每晚问我／到点自动开／不用了）：即点即存，读写与生效都在 js/night.js（BUGS #306）。
// 只有 setNightMode 一个写手——「不用了」连同 on 一起清，那一条判据不在这里再写一遍（两处写必漂）
const _nightModeRow = $('#nightModeRow');
if (_nightModeRow) _nightModeRow.addEventListener('click', async e => {
  const chip = e.target.closest('.contact-chip');
  if (!chip) return;
  const mode = NIGHT_MODES.indexOf(chip.dataset.v) >= 0 ? chip.dataset.v : 'ask';
  if (((data.night || {}).mode) === mode) return;
  if (!setNightMode(mode)) return;
  await flushSave();
  renderNightSettings();
  if (typeof showToast === 'function') showToast(mode === 'off' ? '已关掉：不拦也不再问' : (mode === 'auto' ? '到点自动开启，不再问你' : '每晚问一次'));
});
function renderNightSettings() {
  const row = $('#nightModeRow'), mode = ((data.night || {}).mode) || 'ask';
  if (row) row.querySelectorAll('.contact-chip').forEach(ch => ch.classList.toggle('active', ch.dataset.v === mode));
  const txt = nightStatusText();
  const st = $('#nightState');
  if (st) st.textContent = '现在：' + txt;
  const sum = $('#sumNight');
  if (sum) sum.textContent = txt;   // 卡头摘要与页内那一行同一个来源，不留两份各写一遍
}
// ===== 游戏音效：开关与音量 =====
// 状态存 localStorage（键 ordinal-game-sfx），刻意不进 data 也不进备份：音量是这台设备上的手感，
// 跟着备份跑到别人手机里会突然出声。读取、生效与出声都在 js/sound.js，这里只管写入与回显。
function renderGameSfx() {
  const c = gameSfxCfg();
  const on = $('#gameSfxOn'), vol = $('#gameSfxVol'), sum = $('#sumGameSfx');
  if (on) on.checked = c.on;
  if (vol) vol.value = c.vol;
  if (sum) sum.textContent = c.on ? ('开 · 音量 ' + c.vol + '%') : '关';
}
const _gsOn = $('#gameSfxOn');
if (_gsOn) _gsOn.addEventListener('change', e => { setGameSfx({ on: e.target.checked }); renderGameSfx(); });
const _gsVol = $('#gameSfxVol');
if (_gsVol) _gsVol.addEventListener('input', e => { setGameSfx({ vol: +e.target.value }); renderGameSfx(); });
const _gsTest = $('#gameSfxTest');
if (_gsTest) _gsTest.addEventListener('click', () => { gameSfxAudition(); renderGameSfx(); });   // 关着时按它＝想听，sound.js 会把开关开回来，这里跟着回显
// 全站字号滑杆（80~140%）：拖到哪就当场生效（applyAppearance 把数字折成 --ui-zoom 写在 body 上＝整站实时缩放），
// 不弹 toast——底下整屏字当场跟着变就是实时预览；只在松手（change）时落盘一次，不边拖边写库。
const _uiFontRange = $('#uiFontScaleRange');
if (_uiFontRange) {
  _uiFontRange.addEventListener('input', () => {
    const v = Math.min(140, Math.max(80, Math.round(Number(_uiFontRange.value)) || 100));
    data.appearance = data.appearance || {};
    data.appearance.uiFontScale = v;
    applyAppearance();
    _echoUiFontScale();
  });
  _uiFontRange.addEventListener('change', () => save());
}
function _echoUiFontScale() {
  const rng = $('#uiFontScaleRange');
  const v = Math.min(140, Math.max(80, Math.round(Number((data.appearance || {}).uiFontScale)) || 100));
  if (rng) rng.value = v;
  const out = $('#uiFontScaleOut');
  if (out) out.textContent = v + '%';
  const sum = $('#sumUiFontScale');
  if (sum) sum.textContent = v === 100 ? '标准' : (v + '%');
}
// 毛玻璃强度滑杆（0~24px）：与字号滑杆同口径——拖到哪当场生效（applyAppearance 写 --frost-blur），
// 不弹 toast；只在 frost 开那一节里才画（关上时整节收起，不留一根拖了不生效的死杆）。松手 change 落盘一次。
const _frostRange = $('#frostBlurRange');
if (_frostRange) {
  _frostRange.addEventListener('input', () => {
    const v = Math.min(24, Math.max(0, Math.round(Number(_frostRange.value)) || 14));
    data.appearance = data.appearance || {};
    data.appearance.frostBlur = v;
    applyAppearance();
    renderFrost();
  });
  _frostRange.addEventListener('change', () => save());
}
// frost 那一行的回显：开关开时亮出「强度＋气泡」那一节并回填滑杆，关时收起。
// 由 echoApSets（任何档位 chip 点完都会走）与进页时的 renderApSettings 共用一个入口，不留第二处写手。
function renderFrost() {
  const on = !!((data.appearance || {}).frost);
  const opts = $('#frostOpts');
  if (opts) opts.hidden = !on;
  if (!on) return;
  const v = Math.min(24, Math.max(0, Math.round(Number((data.appearance || {}).frostBlur)) || 14));
  const rng = $('#frostBlurRange');
  if (rng) rng.value = v;
  const out = $('#frostBlurOut');
  if (out) out.textContent = v + 'px';
}
// 外观档位 chips 的白名单——与 js/db.js 的 ensureData 必须同口径，两处不一致就会出现
// 「点了屏上不动、刷新又回落」那种两头都对不上的状态。
// ⚠ 新增一个档位（比如给「卡片通透」再加一档、或新开一行 chips）要四处同步，少一处＝屏上四种死法之一：
//   ① html 里那行 chips（容器 data-ap-set="<键>"，每枚 chip data-v="<值>"；行摘要 data-sum 按需挂）
//   ② 这里 AP_SETS 的白名单（缺了＝点 chip 静默无效，委托在 allow.indexOf 处 return）
//   ③ js/utils.js 的 defaults.appearance 默认值（缺了＝老档读 undefined；布尔键还影响 on/off 换算）
//   ④ css/theme.css 的覆盖块（body[data-ap-xxx=值]；缺了＝存了生效不了，刷新即打回）
// 另：db.js ensureData 的脏值回落要与 ③ 同改；卡头摘要若要报这一档，写手在 mate.js renderFoldSummaries。
const AP_SETS = {
  light: ['airy', 'balanced', 'deep'],
  // 卡片毛玻璃（2026-10-15 重做「卡片通透」那一行）：布尔，chips on/off；defaults.appearance.frost 是 boolean，
  // 委托与 echoApSets 会按「typeof boolean → on/off」自动换算，无需 _apXxx() 现算。
  frost: ['on', 'off'],
  frostBubble: ['on', 'off'],   // 聊天气泡也吃毛玻璃（与 frost 同族，只在 frost 开时可见）
  // 卡片圆角（2026-10-08 补）：small 利落 ∕ medium 标准（默认）∕ large 柔和。
  // ⚠ depth 不在这张表里了——底色只剩一档（现名「雾蓝」）后，界面上那枚永远选中的 chips 就是「看着能点实则无反应」
  //   那一族，已摘（字段与 db 的脏值回落照旧留着，它们管的是旧档，不是屏上控件）。
  // ⚠ tone／toneFollow 2026-10-10 同一判据一起摘（BUGS #245：用户定档「主题颜色只留雾蓝」＝只剩一族，
  //   七枚 chips 里永远只有一枚选中、点其余六枚的宿主已随 css/tone.css 删净；「跟着壁纸走」也再没有可认的第二族）。
  //   两个键连同 defaults 一起删、db 就地清旧档——不留没人读的键（与 depth 那次不同：depth 的 body 属性还有 CSS 读）。
  corner: ['small', 'medium', 'large'],
  bubbleShape: ['round', 'tail', 'square', 'sharp'],
  density: ['cozy', 'compact'],
  fontFamily: ['system', 'serif', 'round'],
  showTime: ['on', 'off'],
  sendBtn: ['on', 'off'],
  glass: ['on', 'off'],
  glassLite: ['on', 'off'],   // 省电磨砂：常驻三栏去实时 blur（耗电优化，默认关）
  alignMode: ['bottom', 'top'],   // 头像与气泡对齐：bottom 底部对齐（默认）/ top 顶部对齐
  avatarShow: ['on', 'off'],      // 聊天里的小头像：on 显示（默认）/ off 隐藏＝气泡通栏
  dayPos: ['flow', 'head'],       // 日期签位置：flow 消息流里（默认）/ head 钉在顶栏下方（sticky 随滚动换签）
  deskBgAll: ['on', 'off'],
};
// 底色档只认这四个值，脏值一律回落 soft（soft 没有覆盖块——css/theme.css 的基础令牌本身就是它）
// 四档：soft 暖光玻璃（默认）／frost 霜白／warm 暖米／flat 纯白（＝关掉玻璃的退路，留着做反向对照）
// 底色档：只认 soft（屏上叫「雾蓝」）。旧档里可能存着 frost/warm/flat（那三档 2026-10-06 已删），一律回落 soft。
// ⚠ 这里刻意写成**无条件返回 'soft'** 而不是一个查表函数：只剩一档时，查表就是「三支都返回同一值」的假抽象。
//   db.js 的 ensureData 已把脏值就地改成 soft，所以这函数连 data 都不用读 —— 将来加档时再改回查表。
function _apDepth() { return 'soft'; }
// 光影档：airy 通透／balanced 均衡（默认）／deep 厚重。与底色档 depth **正交** —— depth 换底色、light 换光影。
function _apLight() {
  const v = (data.appearance || {}).light;
  return v === 'airy' || v === 'deep' ? v : 'balanced';
}
// 卡片圆角档：只认三枚，脏值回落 medium（＝不写覆盖块，就是 theme.css 的基础令牌）。
// 与 light 正交——那一档改面的透与影，这一档改面的弧度，各写各的 body 属性。
function _apCorner() {
  const v = (data.appearance || {}).corner;
  return v === 'small' || v === 'large' ? v : 'medium';
}
// 外观格与桌面美化台里的档位 chips 共用一个委托入口：容器带 data-ap-set="<字段名>"，每枚 chip 带 data-v。
// 写的全是全局 data.appearance——按会话的那一份覆盖仍只在「TA 的设置」整页里改（js/mate.js）。
document.addEventListener('click', async e => {
  const chip = e.target.closest('.contact-chip');
  if (!chip) return;
  const row = chip.closest('[data-ap-set]');
  if (!row) return;
  const key = row.dataset.apSet;
  const allow = AP_SETS[key];
  if (!allow || allow.indexOf(chip.dataset.v) < 0) return;
  data.appearance = data.appearance || {};
  const v = typeof defaults.appearance[key] === 'boolean' ? chip.dataset.v === 'on' : chip.dataset.v;
  if (data.appearance[key] === v) return;
  data.appearance[key] = v;
  await flushSave();
  applyAppearance();
  echoApSets();
  // 卡头摘要（如「聊天外观」的 #sumChatAp）按档现拼在 renderFoldSummaries 一处：点完档位当场重算，
  // 不然折起卡读到的是上一次的摘要。settings 页那两枚行级摘要（sumLight/sumCorner）仍归 echoApSets，互不相干。
  if (typeof renderFoldSummaries === 'function') renderFoldSummaries();
});
function echoApSets() {
  const a = data.appearance || {};
  $$('[data-ap-set]').forEach(row => {
    const key = row.dataset.apSet;
    if (!AP_SETS[key]) return;
    let cur = a[key];
    if (typeof defaults.appearance[key] === 'boolean') cur = cur ? 'on' : 'off';
    if (key === 'depth') cur = _apDepth();
    if (key === 'light') cur = _apLight();
    if (key === 'corner') cur = _apCorner();
    let hit = null;
    row.querySelectorAll('.contact-chip').forEach(ch => {
      const on = ch.dataset.v === cur;
      ch.classList.toggle('active', on);
      if (on) hit = ch;
    });
    const sum = row.dataset.sum ? $('#' + row.dataset.sum) : null;
    if (sum) sum.textContent = hit ? hit.textContent : '';
  });
  renderFrost();   // frost 开了才亮「强度＋气泡」那一节；搭这一趟便车，不在每处 chip 处理器里各写一遍
}
// 底色档：soft 暖光玻璃（默认）∕ frost 霜白 ∕ flat 纯白 ∕ warm 暖米。旧的「雪原高差／素白／冷白」与
// 「素白／冷白」两批档位实现（body[data-ap-tier]／[data-ap-snow]）已整族撤除；现在这一族只有
// appearance.depth 一个字段、一个写手（上面的委托处理器）与 css/theme.css 末尾三份覆盖块。
// 「朋友圈动态提醒」那枚开关随朋友圈整族下线一起删净（2026-10-10，BUGS #268）：宿主控件已不在屏上。

// 「删除消息」总闸：即点即存（默认关，用户定档）。切它要顺手重画消息列表——
// 那排长按动作条是**留在 DOM 里**的一行节点（只切 hidden），不重画的话已经画出来的那几枚
// 「删除」钮会留在屏上（点了被 chat.js 的守卫弹回并提示），看着像开关没生效。
const _delMsgEl = $('#delMsgOn');
if (_delMsgEl) _delMsgEl.addEventListener('change', async e => {
    data.delMsgOn = e.target.checked === true;
    await flushSave();
    if (typeof resetMessageRender === 'function') resetMessageRender();
    if (typeof renderMessages === 'function') renderMessages();
    if (typeof renderFoldSummaries === 'function') renderFoldSummaries();
    showToast(data.delMsgOn ? '已开启：长按消息可以删除' : '已关闭：消息不能删了');
  });

// 会话外观弹层已并入「TA 的设置」整页（html/view-mate.html + js/mate.js，入口仍是聊天页 #chatApBtn）


// ===== 全站字体（BUGS #310 定档：字体只留全局一份，入口在 设置 → 外观 →「全站字体」）=====
// 字体文件读成 dataURL 连同 @font-face 一起存进 data.appearance.customFontCss＝跟着备份走、重启仍在。
// ⚠ 旧写法存的是 URL.createObjectURL 那串 blob: 地址——blob 只在造出它的那一份文档里有效，
//   刷新一次就永久取不到，屏上那行「已加载」变成一条永不生效的 @font-face（本仓「看着能用实则失效」那一族）。
const _FONT_FMT = { woff2: 'woff2', woff: 'woff', otf: 'opentype', ttf: 'truetype' };
$('#customFontUpload').onclick = () => $('#customFontInput').click();
$('#customFontInput').onchange = async e => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > MAX_FILE_SIZE) { showToast('字体文件超过 5MB，装不进存档，换一个小的'); return; }
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const fmt = _FONT_FMT[ext] || 'truetype';
  const dataUrl = await new Promise(resolve => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : null);
    r.onerror = () => resolve(null);
    r.readAsDataURL(file);
  });
  if (!dataUrl) { showToast('这个文件读不出来，换一枚再试'); return; }
  const s = _apSh();
  s.customFontCss = `@font-face { font-family: 'ordinal-custom'; src: url('${dataUrl}') format('${fmt}'); font-display: swap; }`;
  s.customFontName = file.name;
  applyAppearance();
  renderApSettings();
  await flushSave();
};
$('#customFontRemove').onclick = async () => {
  const s = _apSh();
  s.customFontCss = '';
  s.customFontName = '';
  applyAppearance();
  renderApSettings();
  await flushSave();
};

// 自定义气泡CSS：移除
$('#customBubbleCssRemove').onclick = async () => {
  _caSh().customBubbleCss = '';
  applyAppearance();
  renderApSettings();
  await flushSave();
  showToast('已移除自定义气泡样式');
};
// 自定义气泡CSS：输入框应用/清空
$('#customBubbleCssApply').onclick = async () => {
  const v = $('#customBubbleCssText').value.trim();
  _caSh().customBubbleCss = v;
  applyAppearance();
  renderApSettings();
  await flushSave();
  showToast(v ? '气泡样式已更新' : '已移除自定义气泡样式');
};
$('#customBubbleCssClear').onclick = () => { $('#customBubbleCssText').value = ''; };

// 手打的字体 CSS：应用／清空／移除（清空那枚只抹输入框，不落库——按「应用」才写，与气泡 CSS 那一族同一条口径）
$('#customGlobalFontCssApply').onclick = async () => {
  const v = $('#customGlobalFontCssText').value.trim();
  const s = _apSh();
  s.customGlobalFontCss = v;
  s.customGlobalFontName = '';
  applyAppearance();
  renderApSettings();
  await flushSave();
};
$('#customGlobalFontCssClear').onclick = () => { $('#customGlobalFontCssText').value = ''; };
$('#customGlobalFontCssRemove').onclick = async () => {
  const s = _apSh();
  s.customGlobalFontCss = '';
  s.customGlobalFontName = '';
  applyAppearance();
  renderApSettings();
  await flushSave();
};

// 旧色值（blue/sakura/peach）渲染同为墨黑，等价到新色板的 ink 点，避免老用户打开弹层无高亮
const _AP_ALIAS = { blue: 'ink', sakura: 'ink', peach: 'ink' };

// 外观设置控件回显（init、打开会话外观弹层与导入数据后调用）
function renderApSettings() {
  const a = _apView();
  const _mark = (sel, v) => { const g = $(sel); if (g) g.querySelectorAll('.ap-dot').forEach(c => c.classList.toggle('active', c.dataset.v === v)); };
  _mark('#apMineColor', _AP_ALIAS[a.mineColor] || a.mineColor);
  _mark('#apMineText', a.mineText);
  _mark('#apPartnerColor', a.partnerColor);
  _mark('#apPartnerText', a.partnerText);
  _mark('#apDayStyle', a.dayStyle);
  _mark('#apMetaColor', a.metaColor);
  _mark('#apSysStyle', a.sysStyle);
  // 聊天气泡字体/字号两行是 .contact-chip（不是色点那排 .ap-dot），另开一枚回显
  const _markChip = (sel, v) => { const g = $(sel); if (g) g.querySelectorAll('.contact-chip').forEach(c => c.classList.toggle('active', c.dataset.v === v)); };
  _markChip('#apChatFont', a.chatFont || 'inherit');
  _markChip('#apChatFontSize', a.chatFontSize || 'medium');
  // 两枚透明度滑杆：这一本没传背景图时那一节整块收着（屏上不留一枚拖了不生效的杆，同「输入栏那根杆是死的」
  // 那批的口径），传了就把存的值同时填进杆与它自己那枚读数——两处不一起写＝屏上念的数与底下的观感不一致。
  const _veilSec = $('#apVeilSec');
  if (_veilSec) _veilSec.hidden = !a.chatBg;
  const _rng = (sel, outSel, v) => { const e = $(sel); if (e) e.value = v; const o = $(outSel); if (o) o.textContent = v + '%'; };
  _rng('#apHeadVeil', '#apHeadVeilOut', a.headVeil);
  _rng('#apCompVeil', '#apCompVeilOut', a.compVeil);
  // 「压暗」杆：同一口径——没图时整块收着（含那行说明小字），有图才把存的值填回杆与读数
  _rng('#apBgVeil', '#apBgVeilOut', a.bgVeil);
  const _dim = $('#apDimWrap');
  if (_dim) _dim.hidden = !a.chatBg;
  echoApDotNames();
  const _chk = (id, v) => { const e = $(id); if (e) e.checked = !!v; };
  _chk('#bgKeepAlive', a.bgKeepAlive);
  _chk('#bgNotify', a.bgNotify);
  const pv = $('#apBgPreview');
  if (pv) {
    pv.style.backgroundImage = a.chatBg ? `url("${a.chatBg}")` : '';
    pv.textContent = a.chatBg ? '' : '未设置背景图';
  }
  _chk('#deskPopupToggle', a.deskPopup !== false);
  _echoDeskPopRows();
  renderNightSettings();
  if (typeof renderSilentEntry === 'function') renderSilentEntry();   // 主动消息入口行那句小字（读数在 js/silent.js 一处）
  if (typeof renderDeskStation === 'function') renderDeskStation();     // 桌面背景已内联进这一页：预设缩略/三杆读数随本 tab 回显
  _echoUiFontScale();
  echoApSets();
  // 字体状态
  const fs = $('#customFontStatus');
  if (fs) fs.textContent = a.customFontName || '未加载';
  // 卡头摘要：这一格有两个写手（上传的字体文件 ∶ 手打的字体 CSS），只报其中一条＝屏上看着「没设置」
  // 而另一半其实一直在生效。两样各说一句，都没设才写「未设置」。
  const fsum = $('#sumFont');
  if (fsum) {
    const bits = [];
    if (a.customFontName) bits.push(a.customFontName);
    else if (a.customFontCss) bits.push('自定义字体');
    if (a.customGlobalFontCss) bits.push('另有字体 CSS');
    fsum.textContent = bits.length ? bits.join(' · ') : '未设置';
  }
  // 气泡CSS状态
  const bs = $('#customBubbleCssStatus');
  if (bs) bs.textContent = a.customBubbleCss ? '已加载' : '未加载';
  // 气泡CSS输入框回显
  const bt = $('#customBubbleCssText');
  if (bt) bt.value = a.customBubbleCss || '';
  // 全局字体CSS状态与输入框回显
  const gs = $('#customGlobalFontCssStatus');
  if (gs) gs.textContent = a.customGlobalFontName || (a.customGlobalFontCss ? '已加载' : '未加载');
  const gt = $('#customGlobalFontCssText');
  if (gt) gt.value = a.customGlobalFontCss || '';
}

// ===== 音效设置 =====
const SOUND_KEYS = [
  { key: 'partnerMsg',   title: '联系人发送消息音效', sub: '对方发来新消息时播放' },
  { key: 'myMsg',        title: '我发送消息音效',     sub: '我发出消息时播放' },
  { key: 'incomingCall', title: '联系人通话来电音效', sub: '电话接通前循环振铃' }
];
const SOUND_PRESETS = { ding: '清脆叮', pop: '轻快敲', note: '柔和音', ring: '电话铃' };
// 音效按联系人区分：chip 切换编辑对象（全局默认 / 各联系人），本地选择不动活跃会话。
// 联系人「单独设置音效」开启时以全局当前值播种 data.chatSounds[id]（之后互不影响），关闭即删除回退跟随全局
let _soundScope = '';   // ''=全局默认，否则联系人 id
function _soundDefaultsFor(key) {
  return { on: true, preset: key === 'incomingCall' ? 'ring' : (key === 'myMsg' ? 'note' : 'ding'), custom: '' };
}
function _globalSoundAt(key) {
  if (!data.sounds) data.sounds = { partnerMsg: {}, myMsg: {}, incomingCall: {} };
  if (!data.sounds[key]) data.sounds[key] = {};
  const s = data.sounds[key];
  if (typeof s.on !== 'boolean') s.on = true;
  if (!SOUND_PRESETS[s.preset]) s.preset = _soundDefaultsFor(key).preset;
  if (typeof s.custom !== 'string') s.custom = '';
  return s;
}
function _chatSoundSt(id, create) {
  if (!data.chatSounds || typeof data.chatSounds !== 'object') data.chatSounds = {};
  if (create && !data.chatSounds[id]) {
    data.chatSounds[id] = {};
    SOUND_KEYS.forEach(({ key }) => { data.chatSounds[id][key] = JSON.parse(JSON.stringify(_globalSoundAt(key))); });   // 以全局当前值播种
  }
  return data.chatSounds[id] || null;
}
function _soundAt(key) {
  if (!_soundScope) return _globalSoundAt(key);
  const st = _chatSoundSt(_soundScope, true);
  const s = st[key] || (st[key] = JSON.parse(JSON.stringify(_globalSoundAt(key))));
  if (typeof s.on !== 'boolean') s.on = true;
  if (!SOUND_PRESETS[s.preset]) s.preset = _soundDefaultsFor(key).preset;
  if (typeof s.custom !== 'string') s.custom = '';
  return s;
}
// 音效控件按作用域出片段：scope=''=全局默认，否则某位联系人的 id
// 两处渲染：桌面设置「提示音」=全局默认；聊天页「TA 的设置 → 会话音效」=当前联系人（带「单独设置」开关）
function _soundHTML(scope) {
  _soundScope = scope;   // 片段内 _soundAt(key) 按这个作用域取值
  const following = !!scope && !_chatSoundSt(scope, false);   // 联系人未单独设置=跟随全局：下方回显全局值并禁用
  const indRow = scope ? `
      <div class="ap-row sound-row" style="margin-top:2px"><span>单独设置音效<span style="display:block;font-size:11px;color:var(--muted)">开启后这位 TA 的三项音效独立保存（以全局当前值为起点），关闭即恢复跟随全局</span></span><input type="checkbox" class="sound-ind" ${following ? '' : 'checked'} style="width:18px;height:18px;flex:none;margin:0;accent-color:var(--ink)"></div>` : '';
  const sections = SOUND_KEYS.map(({ key, title, sub }) => {
    const s = following ? _globalSoundAt(key) : _soundAt(key);
    const dis = following ? ' disabled' : '';
    const presetOpts = Object.keys(SOUND_PRESETS).map(p =>
      `<option value="${p}" ${s.preset === p ? 'selected' : ''}>${SOUND_PRESETS[p]}</option>`).join('');
    return `
      <div class="setting-title" style="margin:16px 0 10px"><span class="setting-icon">♪</span><div><strong>${title}</strong><small>${sub}</small></div></div>
      <div class="ap-row sound-row"><span>启用音效</span><input type="checkbox" class="sound-on" data-key="${key}"${dis} ${s.on ? 'checked' : ''} style="width:18px;height:18px;flex:none;margin:0;accent-color:var(--ink)"></div>
      <div class="ap-row sound-row"><span>音效类型<span style="display:block;font-size:11px;color:var(--muted)">上传自定义音频后优先播放</span></span><select class="sound-preset" data-key="${key}"${dis} style="flex:0 0 92px;margin:0">${presetOpts}</select><button class="soft-btn sound-upload" data-key="${key}"${dis} style="flex:none;width:auto;padding:5px 10px">选择音频</button></div>
      <div class="ap-row sound-row" style="padding-bottom:14px;border-bottom:1px solid var(--eer)"><span>已加载<span style="display:block;font-size:11px;color:var(--muted)" class="sound-status" data-key="${key}">${s.custom ? '自定义音频' : '内置提示音'}</span></span><button class="soft-btn sound-test" data-key="${key}" style="flex:none;width:auto;padding:5px 10px">试听</button><button class="soft-btn sound-clear" data-key="${key}"${dis} style="flex:none;width:auto;padding:5px 10px">清除</button></div>`;
  }).join('');
  return indRow + sections;
}
function renderSoundSettings() {
  if (_soundScope && !(data.contacts || []).some(c => c.id === _soundScope)) _soundScope = '';   // 编辑对象被删后回退全局
  const mate = $('#soundCard');
  if (mate) mate.innerHTML = data.activeChat ? _soundHTML(data.activeChat) : '<p class="data-note">先在会话列表里选一位 TA。</p>';
  const glob = $('#soundGlobalCard');
  if (glob) glob.innerHTML = _soundHTML('');
}
let _sfPendingKey = '';
(function initSoundSettings() {
  const hosts = [$('#soundCard'), $('#soundGlobalCard')].filter(Boolean);
  if (!hosts.length) return;
  const fInput = document.createElement('input');
  fInput.type = 'file';
  fInput.accept = 'audio/*,.mp3,.wav,.ogg,.m4a';
  fInput.style.display = 'none';
  document.body.appendChild(fInput);
  let _sfScope = '';   // 点「选择音频」时所在的作用域（文件读完已是另一个事件，不能依赖 _soundScope 残值）
  const scopeOf = t => (t && t.closest('#soundGlobalCard') ? '' : (data.activeChat || ''));   // 全局卡=全局作用域，其余（TA 的设置页）=当前联系人
  fInput.addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!_sfPendingKey || !f) return;
    if (f.size > 1024 * 1024) { showToast('音频过大，请选择 1MB 以内的文件'); return; }
    const dataURL = await new Promise(res => {
      const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res('');
      r.readAsDataURL(f);
    });
    if (!dataURL || dataURL.indexOf('data:') !== 0) { showToast('音频读取失败'); return; }
    _soundScope = _sfScope;
    _soundAt(_sfPendingKey).custom = dataURL;
    await save(); renderSoundSettings();
    showToast('已设置自定义音效');
  });
  hosts.forEach(card => {
    card.addEventListener('change', async e => {
      _soundScope = scopeOf(e.target);
      if (e.target.classList.contains('sound-ind')) {
        // 联系人单独设置开关：开=播种独立配置；关=删除回退跟随全局
        if (!_soundScope) { e.target.checked = false; return; }
        if (e.target.checked) _chatSoundSt(_soundScope, true);
        else { _chatSoundSt(_soundScope, false); delete data.chatSounds[_soundScope]; }
        await save(); renderSoundSettings();
      } else if (e.target.classList.contains('sound-on')) {
        _soundAt(e.target.dataset.key).on = e.target.checked;
        await flushSave();
      } else if (e.target.classList.contains('sound-preset')) {
        _soundAt(e.target.dataset.key).preset = e.target.value;
        await save(); renderSoundSettings();
      }
      if (typeof renderFoldSummaries === 'function') renderFoldSummaries();
    });
    card.addEventListener('click', e => {
      _soundScope = scopeOf(e.target);
      const btn = e.target.closest('.sound-upload, .sound-test, .sound-clear');
      if (!btn || btn.disabled) return;
      const key = btn.dataset.key;
      if (btn.classList.contains('sound-upload')) {
        _sfPendingKey = key;
        _sfScope = _soundScope;
        fInput.click();
      } else if (btn.classList.contains('sound-test')) {
        playSound(key, _soundScope || null);   // 试听当前编辑对象实际生效的音效（全局作用域传 null 强制全局）
      } else if (btn.classList.contains('sound-clear')) {
        _soundAt(key).custom = '';
        save(); renderSoundSettings();
        showToast('已移除自定义音效');
      }
    });
  });
})();

// 数据导入导出
let _deferredInstall = null;
// 导出摘别名（BUGS #434）：`data.messages` 与 `data.chats[活跃会话].msgs` 是同一个引用（js/db.js 那条
// 「活跃会话流绑定」），而 JSON 不保留共享引用＝活跃会话那一本在备份里被原样写了两遍
// （实测 183M 字符 vs 摘掉后 138M＝白胖 25%，而手机正是拿这整根字符串去 parse 的）。
// 判据按「是不是同一个对象」比，不按内容猜：老档里 chats 为空、messages 才是正主时照写不误。
// 读侧不受影响：导入那一路 ensureData 会按 activeChat 把 messages 重新绑回同一份引用（同一条绑定）。
function _exportPayloadShape(d) {
  try {
    const c = Object.assign({}, d);
    const act = d && d.activeChat;
    if (act && d.chats && d.chats[act] && d.chats[act].msgs === d.messages) delete c.messages;
    return c;
  } catch (e) { return d; }
}
$('#exportAll').onclick = () => {
  const p = showProgress('正在导出数据');
  p(5, '正在整理数据…');
  // 先让出主线程绘制进度弹窗，再执行阻塞的序列化与下载
  setTimeout(() => {
    let json;
    try {
      json = JSON.stringify(_exportPayloadShape(data));
    }
    catch { hideProgress(); showToast('数据导出失败'); return; }
    p(75, '已生成 ' + _impSizeText(json.length) + ' · 正在准备下载…');
    const blob = new Blob([json], { type: 'application/json' });
    json = null;   // 字节交给 Blob 了就松手：这一根字符串是整棵树里最大的一块
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '言字卡-全部数据.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    p(100, '导出完成');
    setTimeout(hideProgress, 600);
    try { localStorage.setItem('lastBackupAt', String(Date.now())); } catch {}
  }, 80);
};
$('#importAll').onclick = () => $('#dataInput').click();
$('#clearAllData').onclick = () => {
  openModal('清空全部数据', '', () => {
    openModal('最后确认', '', async () => {
      const p = showProgress('正在清空数据');
      p(30, '正在删除本地存储…');
      await resetAllData();
      p(100, '已清空，正在重启…');
      setTimeout(() => location.reload(), 500);
    }, { noInput: true, staticText: '再次确认：真的要清空全部数据吗？此操作不可撤销。', okText: '仍要清空', danger: true });
  }, { noInput: true, staticText: '将删除全部聊天记录、信件、字卡、表情包与设置，恢复到初始状态，且无法恢复。\n建议先「导出全部数据」备份。', okText: '继续', danger: true });
};
// 清空本站全部数据（2026-10-13 晚新增）：与上面那枚的差＝连「只活在本机的小记忆」一起抹
// （开屏免问、小测通过标记、游戏音量、各页上次停靠的 tab……判据与落点见 js/db.js 的 resetAllSite）。
// 同样两段式确认＋进度＋重启，口径与 clearAllData 一模一样，只是文案说清抹的范围。
$('#clearSiteAll').onclick = () => {
  openModal('清空本站全部数据', '', () => {
    openModal('最后确认', '', async () => {
      const p = showProgress('正在清空数据');
      p(30, '正在删除本地存储…');
      await resetAllSite();
      p(100, '已清空，正在重启…');
      setTimeout(() => location.reload(), 500);
    }, { noInput: true, staticText: '再次确认：真的要清空本站全部数据吗？连开屏免问、小测通过标记、游戏音量这些只存在这台设备上的记忆也会一起删掉，此操作不可撤销。', okText: '仍要清空', danger: true });
  }, { noInput: true, staticText: '将删除本站保存在这台设备上的全部数据：聊天记录、信件、字卡、表情包、设置，以及只存在本机的小记忆（开屏免问、小测通过、游戏音量、各页上次停靠的位置）。删完像第一次安装一样，各项确认与使用习惯都要重来，且无法恢复。\n建议先「导出全部数据」备份。', okText: '继续', danger: true });
};
$('#installAppBtn').onclick = async () => {
  if (!_deferredInstall) return;
  _deferredInstall.prompt();
  try { await _deferredInstall.userChoice; } catch {}
  _deferredInstall = null;
  $('#installAppBtn').hidden = true;
};
// ===== 把一份备份读成 JSON 文本 =====
// 两条通道都只负责「拿到那根字符串」，解析交回 onchange 一处＝解完能立刻把字符串松手，
// 不让「整根全文 ＋ 整棵新树」同时压在内存上（BUGS #434 的一半账）。
function importCompressed(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (!window.DecompressionStream) { reject(new Error('这台设备的浏览器不会解压 .gz 备份，请选普通的 .json 备份文件')); return; }
      const blob = new Blob([reader.result]);
      try {
        const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
        streamToBlob(stream).then(b => b.text()).then(resolve).catch(reject);
      } catch (e) { reject(e); }
    };
    reader.onerror = () => reject(reader.error || new Error('读不到这个文件的内容'));
    reader.readAsArrayBuffer(file);
  });
}
// 老内核没有 File.prototype.text()（#428 记过一次：直接 await f.text() 静默坠进 catch，
// 只剩一句「导入失败」），退化通道＝FileReader.readAsText
function importPlain(file) {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error || new Error('文件读取失败'));
    r.readAsText(file);
  });
}
function importText(file) {
  return file.name.endsWith('.gz') ? importCompressed(file) : importPlain(file);
}

// 体积闸（BUGS #434）：这条链上「整根全文＋整棵新树」都是主线程长任务，而手机一个标签页的内存
// 有上限——本机实测（同一串调用拿 Node 复现）：45MB 那一份过得去，95MB 那一份在 512MB 预算下
// 死在解析后的那一步（V8 直接报 heap out of memory），185MB 那一份连 1GB 预算都拦不住。
// 门槛按这个量级摆：到 40MB 先在屏上写明体积并提醒别切走，到 150MB 当面问一句还要不要试。
const IMP_WARN = 40 * 1048576;
const IMP_HARD = 150 * 1048576;
function _impSizeText(n) {
  if (!(n > 0)) return '0 B';
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
  if (n >= 1024) return Math.round(n / 1024) + ' KB';
  return Math.round(n) + ' B';
}
// 本站自己那句错：到手上直接念给用户，不再套一层「文件格式不正确」
function _impErr(msg) { const e = new Error(msg); e.__said = 1; return e; }
function _impGoAhead(bytes) {
  return new Promise(resolve => {
    const modal = document.getElementById('appModal');
    if (!modal) { resolve(true); return; }   // 没那层壳＝拦不住，照旧往下走（不留一条永远不应答的路）
    let done = false;
    const fin = v => { if (done) return; done = true; resolve(v); };
    hideProgress();   // 进度层 z 9999 盖过弹层＝先收起再问（与 js/cards.js #428 同一手法）
    window.openModal('这份备份很大', '', () => fin(true), {
      noInput: true, danger: true, okText: '仍要试试',
      onCancel: () => fin(false),
      staticText: '这一份约 ' + _impSizeText(bytes) + '。手机浏览器一个标签页的内存有限，这个量级在解析那一步容易把页面撑崩（闪退）。\n\n想稳一点：先在 设置→数据→存储 里清掉用不上的大图与字卡，重新导一份小的再来。\n\n「仍要试试」＝直接导；「算了」＝这一趟不导。'
    });
  });
}

$('#dataInput').onchange = async e => {
  const input = e.target;
  const file = input.files && input.files[0];
  if (!file) return;
  const p = showProgress('正在导入数据');
  let incoming = null, payload = null;
  try {
    // 立刻把体积说出来：旧写法 5% 那一帧压根上不了屏（下面每一步之间都要让两帧，理由见 js/utils.js 的 progressYield）
    p(2, '这一份 ' + _impSizeText(file.size) + (file.size >= IMP_WARN ? '·比较大，导的过程别切走' : ''));
    await progressYield();
    if (file.size > IMP_HARD && !(await _impGoAhead(file.size))) { hideProgress(); input.value = ''; return; }
    p(8, '正在读取文件…');
    let text = await importText(file);
    p(34, '正在解析…');
    await progressYield();
    try { incoming = JSON.parse(text); }
    finally { text = null; }   // 那根全文交完活就松手：下面要摆一整棵新树，两份同时在＝峰值翻倍
    p(52, '正在校验数据…');
    if (!incoming || typeof incoming !== 'object') throw _impErr('这份备份解不开东西，不像是一份 言字卡 导出的 JSON');
    // 兼容两种导出格式：{ profile... }（旧）/ { data: {...}, music: {...} }（播放器还在时导出的形状）；那份 music 如今直接忽略＝旧备份照样能导
    payload = (!incoming.profile && incoming.data && incoming.data.profile) ? incoming.data : incoming;
    incoming = null;   // 外层那份引用卸掉：只留 payload 一个名字拿着这棵树
    // 消息这一格认两个户：新版备份不再带 messages 别名（_exportPayloadShape 摘掉了），住 chats 里；
    // 只认 messages 会把新备份误判成「格式不对」（_importStats 本来就是两边都看）
    const hasFlow = Array.isArray(payload.messages) || (payload.chats && typeof payload.chats === 'object' && !Array.isArray(payload.chats));
    if (!payload.profile || !payload.behavior || !hasFlow || !Array.isArray(payload.groups) || !Array.isArray(payload.stickers) || !Array.isArray(payload.sentLetters) || !Array.isArray(payload.receivedLetters))
      throw _impErr('这份备份缺了必需的东西（消息／字卡／表情包／信件），看着不像 言字卡 导出的文件');
    // 防误覆盖：先把这份备份与当前数据的差异摆出来，再由用户选「合并」/「覆盖」/「取消」
    p(60, '正在对比当前数据…');
    await progressYield();
    const mode = await _importPreview(payload);
    if (mode === 'cancel') { hideProgress(); payload = null; input.value = ''; return; }
    p(76, mode === 'merge' ? '正在合并（保留两边）…' : '正在应用备份…');
    await progressYield();
    data = mode === 'merge' ? _mergeImportData(payload) : ensureData(payload);
    payload = null;   // 备份那一棵树已经交给 data，本函数这一份引用不该再押着
    p(88, '正在保存…');
    await progressYield();
    await flushSave();
    p(100, '导入成功，即将刷新');
    setTimeout(() => location.reload(), 500);
  } catch (err) {
    hideProgress();
    showToast((err && err.__said) ? err.message : '导入失败：' + String((err && (err.message || err)) || '文件读不出内容'));
  }
  input.value = '';
};

// ===== 导入差异预览：当前 vs 备份（消息/信/字卡/联系人），三选一 合并/覆盖/取消 =====
function _importStats(d) {
  const msgs = (d && d.chats && typeof d.chats === 'object')
    ? Object.values(d.chats).reduce((n, c) => n + ((c && Array.isArray(c.msgs)) ? c.msgs.length : 0), 0)
    : ((d && Array.isArray(d.messages)) ? d.messages.length : 0);
  const letters = ((d && Array.isArray(d.receivedLetters)) ? d.receivedLetters.length : 0) + ((d && Array.isArray(d.sentLetters)) ? d.sentLetters.length : 0);
  const cards = (d && Array.isArray(d.groups)) ? d.groups.reduce((n, g) => n + ((g && Array.isArray(g.cards)) ? g.cards.length : 0), 0) : 0;
  const contacts = (d && Array.isArray(d.contacts)) ? d.contacts.length : ((d && d.contacts) ? 1 : 0);
  return { msgs, letters, cards, contacts };
}
function _importPreview(payload) {
  return new Promise(resolve => {
    const cur = _importStats(data), inc = _importStats(payload);
    const rows = [
      ['聊天消息', cur.msgs, inc.msgs],
      ['信件', cur.letters, inc.letters],
      ['字卡', cur.cards, inc.cards],
      ['联系人', cur.contacts, inc.contacts]
    ].map(([k, a, b]) => {
      const d = b - a;
      const tag = d > 0 ? '+' + d : (d < 0 ? d : '持平');
      return `<div class="imp-row"><span>${k}</span><span>${a} → <b>${b}</b></span><span class="imp-d${d > 0 ? ' up' : d < 0 ? ' down' : ''}">${tag}</span></div>`;
    }).join('');
    const m = document.createElement('div');
    m.className = 'sheet-mask';
    m.id = 'importPreviewMask';
    m.innerHTML = `<div class="sheet imp-sheet">
      <div class="sheet-head">这份备份会带来什么</div>
      <div class="imp-list">${rows}</div>
      <p class="imp-note">覆盖＝用备份替换现在的一切（含设置）；合并＝聊天/信/字卡两边都保留，设置沿用当前。</p>
      <button type="button" class="sheet-btn" data-act="merge">合并导入（保留两边）</button>
      <button type="button" class="sheet-btn sheet-danger" data-act="over">覆盖导入（用备份替换）</button>
      <button type="button" class="sheet-btn sheet-cancel" data-act="cancel">取消</button>
    </div>`;
    document.body.appendChild(m);
    // 进度层是全屏 fixed・z-index 9999 的遮罩，而 .sheet-mask 只有 z 8：不先收起这一层，下面三枚钮
    // 就压在遮罩底下——屏上停在「正在对比当前数据…」且点什么都没反应＝用户报的「导入卡住」最常见那一发
    // （js/cards.js #428 撞过同一处：收起来问，答完再挂回去）
    hideProgress();
    m.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      m.remove();
      showProgress('正在导入数据');   // 后面的百分比要有地方说话（调用方紧接着就 p(76, …)）
      resolve(act === 'over' ? 'over' : (act === 'merge' ? 'merge' : 'cancel'));
    });
  });
}
// 合并导入：以备份为基底，把当前数据的内容并进来（按 id / 内容去重；设置沿用当前）
// ⚠ 这里不许再长出「整树 parse(stringify()) 深克隆」（BUGS #434）：旧写法第一行就把整棵备份复制两遍
// （一根全文字符串＋一棵新树），本机实测单这一发 ＋644 MB 堆＝手机上那一发闪退。
// 基底 ensureData(payload) 返回的就是 payload 自己（就地清洗），而 payload 是从文件刚解出来的、
// 没有别处引用它＝可以直接在上面并。从「当前数据」过来的条目只**共享引用**（那些 base64 字符串不可变，
// 共享一份不复制字节），旧那一棵树在调用方 `data = …` 之后整体作废，共享串不到谁的账上。
// 只有「还会被改的那一层」才拷：cards 数组∶会话档∶那一位的 behavior——不拷就会出现「改 A 名下
// 那一组，B 名下同一组跟着变」∶旧写法拿深克隆顺手兜住了这一条，现在按层写明白。
function _mergeImportData(payload) {
  const base = ensureData(payload);
  const cur = data;
  // 消息：按 id 并入各会话
  for (const cid of Object.keys(cur.chats || {})) {
    const curMs = (cur.chats[cid].msgs || []).slice();
    const target = base.chats[cid] || (base.chats[cid] = { msgs: [], unread: 0, draft: cur.chats[cid].draft || '' });
    const ids = new Set(target.msgs.map(m => String(m.id)));
    for (const m of curMs) if (!ids.has(String(m.id))) { target.msgs.push(m); ids.add(String(m.id)); }
  }
  // 信件：按 文本+邮戳+时间 去重
  const letterKey = m => [m.text || '', m.postmark || '', m.time || '', m.charCount || 0].join('|');
  for (const k of ['receivedLetters', 'sentLetters']) {
    const have = new Set((base[k] || []).map(letterKey));
    for (const m of (cur[k] || [])) if (!have.has(letterKey(m))) { base[k].push(m); have.add(letterKey(m)); }
  }
  // 字卡组：同名同类合并卡片
  for (const g of (cur.groups || [])) {
    const t = base.groups.find(x => (x.name || '') === (g.name || '') && (x.category || '主字卡') === (g.category || '主字卡'));
    if (!t) { base.groups.push(Object.assign({}, g, { cards: (g.cards || []).slice() })); continue; }
    const have = new Set((t.cards || []).filter(c => typeof c === 'string').map(c => c));
    for (const c of (g.cards || [])) {
      const key = typeof c === 'string' ? c : (c && c.img);
      if (key && !have.has(key)) { t.cards.push(c); have.add(key); }
    }
  }
  // 联系人：补齐备份里缺的（设置沿用当前）。人那一格浅拷即可∶头像那种大字符串共享一份∶
  // 但 members 得拷——那是「还会被改」的数组，共享＝两位名下同一个群改一边动两边
  const cIds = new Set((base.contacts || []).map(c => c.id));
  for (const c of (cur.contacts || [])) {
    if (cIds.has(c.id)) continue;
    base.contacts.push(Object.assign({}, c, Array.isArray(c.members) ? { members: c.members.slice() } : null));
    base.chats[c.id] = { msgs: ((cur.chats[c.id] && cur.chats[c.id].msgs) || []).slice(), unread: 0, draft: '' };
    base.chatSettings[c.id] = JSON.parse(JSON.stringify(cur.chatSettings[c.id] || cur.behavior));
  }
  base.activeChat = base.chats[cur.activeChat] ? cur.activeChat : (base.contacts[0] && base.contacts[0].id) || 'c0';
  return ensureData(base);
}
