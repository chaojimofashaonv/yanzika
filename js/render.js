// ===== 渲染函数 =====

let _lastMsgCount = 0;
// 「下次要整列表重建」是独立意图，与「已经画到第几条」分两个变量存：
// 旧写法把 _lastMsgCount===0 同时当这两个意思用（切会话/撤回/删除都靠裸写这一行去触发重建），
// 于是判据只能再加半句猜测，而那半句猜错了（BUGS #232）。
let _msgRebuild = true;
let _animateNextRender = false;   // 业务侧(发消息/收投递)置 true：下次渲染完成后给最新气泡加入场动画(空会话首条等重建路径也要播)
let _searchQuery = '';
function resetMessageRender() { _msgRebuild = true; _lastMsgCount = 0; _msgStart = 0; }
let _cachedMiniImg = '';
let _cachedMiniPartner = '';
let _cachedMiniMine = '';
let _cachedAvatarVersion = '';
// 对方气泡旁的小头像：只认**当前这位联系人**的（聊天内覆盖 chatAvatar → 基础头像 avatar）。
// 原来这里还兜了一层 data.profile.avatar（全局 profile），那是「主联系人 c0 的镜像」——多联系人下
// 谁没传头像就会顶着 c0 那张脸出现（用户报：给 A 传了头像，C 主动发消息却显示成 A 的）。
// profile.avatar 只留给「不面向具体联系人」的旧消费方（通知图标），聊天这一侧一律不认。
function getMiniAvatarHTML() {
  const contact = (typeof currentContact === 'function' && currentContact()) || null;
  const pName = (contact && contact.chatName) || (contact && contact.name) || data.profile.name;
  const pAvatar = (contact && contact.chatAvatar) || (contact && contact.avatar) || '';
  // 我方那一枚走 chatMyName/chatMyAvatar：这一本会话里我可能顶着与别人那儿不同的脸（按会话分开）
  const mName = chatMyName(), mAvatar = chatMyAvatar();
  const version = (data.activeChat || '') + '|' + pAvatar + pName + '|' + mAvatar + mName;
  if (version !== _cachedAvatarVersion) {
    _cachedAvatarVersion = version;
    _cachedMiniImg = avatarHTML(pAvatar, firstChar(pName));
    _cachedMiniPartner = `<div class="mini-avatar">${_cachedMiniImg}</div>`;
    _cachedMiniMine = `<div class="mini-avatar mine">${avatarHTML(mAvatar, firstChar(mName))}</div>`;
    resetMessageRender();
  }
  return [_cachedMiniImg, _cachedMiniPartner, _cachedMiniMine];
}

let _lazyObserver = null;
function _makeLazyObserver() {
  return new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const img = entry.target;
        if (img.dataset.src) img.src = img.dataset.src;
        _lazyObserver.unobserve(img);
      }
    }
  }, { rootMargin: '200px' });
}
// root 省略 = 全量重扫（换页/整块重渲染时用，会先断开旧观察器）；
// 传入容器 = 只给这批新节点挂观察（分片追加时用，不打断已在场的图片）
function initLazyImages(root) {
  if (!root) {
    if (_lazyObserver) _lazyObserver.disconnect();
    _lazyObserver = _makeLazyObserver();
    document.querySelectorAll('img[data-lazy-img="true"]').forEach(img => {
      img.dataset.lzObs = '1';
      _lazyObserver.observe(img);
    });
    return;
  }
  if (!_lazyObserver) _lazyObserver = _makeLazyObserver();
  root.querySelectorAll('img[data-lazy-img="true"]').forEach(img => {
    if (img.dataset.lzObs) return;
    img.dataset.lzObs = '1';
    _lazyObserver.observe(img);
  });
}

// 「这句本意」那一枚只对「有 TA 抽出来的话」的那一发成立：我方随手打的字没有「挑卡」这回事，
// 系统小字与功能生成的那条（src:'cjian' 挂「世界感知」、src:'wish' 挂「心愿」、src:'invite' 挂「邀请」，
// 签槽上已经说清它是功能发的）再叠一枚本意签＝两句互相打嘴。动作单里那枚钮走同一个判据：按钮出现了
// 却掷不出一枚能画的签，是本仓反复被打回的「看着能点实则无反应」。判据按「有没有 src」现算而不是
// 枚举几个值：以后别家加来源自动跟。
// 问问TA 那张卡是一个例外（BUGS #213）：发卡时整条记在我方名下（js/ask.js 的 from:'me'），可 TA 的答复
// 是抽字卡抽出来塞进同一张卡里的（m.ask.parts／pick／picks）＝正是这一族要说的那件事。只给已回答的那一发：
// 等待态里还没有答案，掷一档＝签指着一件没发生过的事。
function _meantEligible(m) {
  if (!m || m.recalled || m.src) return false;
  if (m.ask) return m.ask.status === 'answered';
  return m.from === 'partner';
}

// 签槽只能挂在 .bubble 上：游戏卡 .gcard 带 overflow:hidden 且不是定位上下文，硬塞进去被裁平。
// 判据按「渲染出来的 body 里到底有没有这个锚点」现算，不按字段枚举——以后新增卡型自动跟，
// 否则又会长成「按钮在、点了没反应」那一族（BUGS #138 二批：游戏战绩卡落库了却画不出签）。
function _badgeAnchorOK(body) { return /<div class="bubble[\s">]/.test(body); }

// 聊天情绪标签那一行（BUGS #309；#400 重设计为「词本位」）：TA 这一句上挂到的 1~3 枚（情绪∶心意∶意图），画在气泡**下方**一行。
// 刻意不进 .msg-badges 那个签槽——槽里最多两枚（来源/主动签 ＋ 「这句说谁·这句本意」那一枚），
// 而且槽是骑在气泡上沿、出墨空间只有 11px（#022），三枚标签塞进去必削掉上半截；前作两代也都是放气泡下方一行。
// 词是随机抽出来的、也可能是用户自己填的，一律过 escapeHTML。
// #400（用户复报「还是很丑」）：#349 那版把标签名做成一枚灰底小标再配一道分界虚线＝屏上一行「键：值」
// **表单字段**——聊天里出现一个「设置行」形状的东西，读起来是系统数据不是人的心情，三枚同现更直接读成一张表。
// 现改**词本位**：只印词、包中文角引号「」。①「」是中文里「这是一个词」的原生记法，一个符号顶掉
// 键名小块＋分界虚线两个元素；②三级链顺序固定（emotion.js mood→heart→intent 定序入队）＝顺序即语义，不再印键名。
function _emoLineHTML(m) {
  const tags = Array.isArray(m.emo) ? m.emo.filter(x => x && EMOTION_TAG_LABEL[x.k] && typeof x.t === 'string' && x.t.trim()) : [];
  if (!tags.length) return '';
  return `<div class="emo-line">${tags.map(x => `<span class="emo-tag">「${escapeHTML(x.t.trim())}」</span>`).join('')}</div>`;
}

// 这条气泡角上的签（「主动」或「世界感知」来源 ＋ 「这句的签」那枚），一处算好两处用：
// 整条重画时拼进 body，就地换签时只换它——不留第二份实现，否则两条路径会各画各的。
function _msgBadgesHTML(m) {
  let asBadge = '';
  // 主动发送标记＝白浮岛文字小签「主动」（原为 11px 粉色字符 ♥，见 chat.css 与 BUGS #019）
  if (m.asBadge && m.from !== 'me') asBadge = '<span class="as-badge">主动</span>';
  // 世界感知投递的消息（cjian.js 统一投递钟经 _cjDeliver 打 src:'cjian'）挂来源小签。
  // 答的是「这条是功能生成的，不是 TA 回我」——聊天流里两种来源长得一样才是真问题。
  // 2026-10-08 二批（BUGS #189）：签上不再笼统写「世界感知」，改按 m.cjLine 写它自己那一行功能的名字
  // （状态签名／情绪感知／示软／心动／说明白／干扰／靠近感知／此刻／天气／体感／梦／回忆闪回／TA 想问你／里程碑）。
  // 用户原话是「需要显示那个功能的 tag」——一页十几个功能共用一枚同名签，看完这条仍然不知道该点哪一行，
  // 而「细档不进聊天」那条旧定档随之作废（点签仍跳世界感知页，出口没变，只是签自己说清了是哪一行）。
  // 文案只存线键、渲染时现取（CJ_LINE_LABEL 在 js/utils.js）：改一次措辞不打断旧消息，同 #156 的 m.call。
  // 旧消息没有 cjLine＝回落「世界感知」，绝不替它猜是哪条线（猜错＝把一句话挂到别人名下，#051 那一族）
  if (m.src === 'cjian' && m.from !== 'me') {
    asBadge = `<button type="button" class="as-badge as-badge-src" data-src-badge="cjian">${escapeHTML(cjLineLabel(m.cjLine))}</button>`;
  }
  // 心愿投递的消息（wish.js wishTick 四处投递打 src:'wish'）挂「心愿」小签，同一枚可点范式，
  // 点签跳心愿页（chat.js 的 .as-badge-src 分支）。与世界感知分开一档：这条的来龙去脉
  // （谁说的/实现没有/有没有凭证）只在心愿页说得清。旧消息没有 src＝不出签，不回改。
  if (m.src === 'wish' && m.from !== 'me') {
    asBadge = '<button type="button" class="as-badge as-badge-src" data-src-badge="wish">心愿</button>';
  }
  // 邀请那一册投出去的那句挂「邀请」签（2026-10-11 撤销 #270 融合：它不再算心愿投的句，src 也跟着分家）。
  // 一档一枚签各认自己的 src 值、谁也不借谁的闸——合并成一枚＝「关了心愿的签、邀请的签还在」那种错位（AGENTS §6）。
  if (m.src === 'invite' && m.from !== 'me') {
    asBadge = '<button type="button" class="as-badge as-badge-src" data-src-badge="invite">邀请</button>';
  }
  // 「印象」＝头像昵称库替 TA 记下的那句看法（js/avatarlib.js 的 _avSayFor 打 src:'impress'）。
  // 2026-10-12 之前这一句完全不带身份：它投进聊天里与 TA 回你的话长得一模一样，用户读不出这是
  // 「它对着形象簿说的一句」还是「它在跟你说话」（AGENTS §6 那条「功能生成的句一律打 src」漏了这一族）。
  // 出口＝点头像昵称页那本账（chat.js 的 .as-badge-src 分支）。
  if (m.src === 'impress' && m.from !== 'me') {
    asBadge = '<button type="button" class="as-badge as-badge-src" data-src-badge="impress">印象</button>';
  }
  // 「这句说谁」＋「这句本意」＝同一枚签的两段（长按动作单里各一枚钮，各写各的字段，缺一段就不画那个点）。
  // 刻意不做两行：量过单枚小签 18.5px 高、底边落在气泡上沿下 9.2px，两行要 31.7px——
  // 往下排会盖进气泡首行 12.4px（气泡上内距只有 10px），往上排需要 22.5px 空间而 .message 的出墨内距是 11px（#022 留的那层），
  // 超出即被 content-visibility 的 paint containment 削掉上半截。一行两段是这条垂直节奏下唯一不占高度的排法。
  // 开关只在渲染侧读：关掉不画，已落库的值不回改，翻回来旧消息跟着长回来。
  const referTxt = data.referOn !== false ? referLabelOf(m.refer) : '';
  const meantTxt = data.meantOn !== false && _meantEligible(m) ? meantLabelOf(m.meant) : '';
  const segs = [referTxt, meantTxt].filter(Boolean);
  const referBadge = segs.length ? `<span class="as-badge as-badge-refer">${segs.join('<i class="rb-sep">·</i>')}</span>` : '';
  // 骑角收成一条「签槽」：最多并排两枚＝「主动」或「世界感知」那一枚（两枚互斥仍是旧口径）＋ 这句的签那一枚。
  // 绝对定位与探出气泡上沿 10px 从 .as-badge 搬到槽上，出墨空间仍由 .message 的 padding-top 让（BUGS #022）。
  const badgeList = [asBadge, referBadge].filter(Boolean);
  return badgeList.length ? `<span class="msg-badges">${badgeList.join('')}</span>` : '';
}

// 就地换那一条气泡角上的签——**不重画整个列表**：全量重画会走贴底那一套（renderMessages 里的
// _stickLoop/_stickSnap），把正在往上翻旧消息的人一把甩到最底部（用户报「点这个功能消息还跳转」，BUGS #138 二批）。
// 那条在分页窗口外没渲染时什么都不做：值已经落库，下次重画自然长出来，不拿「跳到底」换一个当场可见。
function patchMessageBadges(m) {
  const list = $('#messageList');
  if (!list || !m) return;
  const el = [...list.querySelectorAll('.message')].find(x => String(x.dataset.id) === String(m.id));
  if (!el) return;
  const old = el.querySelector('.msg-badges');
  if (old) old.remove();
  const html = _msgBadgesHTML(m);
  if (!html) return;
  const anchor = el.querySelector('.bubble');
  if (anchor) anchor.insertAdjacentHTML('afterbegin', html);
}

function _buildMessageHTML(m, miniImg, miniMine, miniPartner) {
  if (m.from === 'system') {
    const el = document.createElement('div');
    el.className = 'sys-msg';
    // 一行指针的四种：信（#165）／播放器的待答卡（#284）／那本印象账（#303）／TA 发的那条动态（#347）。
    // 可点的盒子收成文字那一小块（套一层 span），不套的话通栏空白处也能拆信。
    // avImpr 的值就是账本的键（'a:哈希' / 'n:昵称'）——键自带类型，不必再多存一格「这是哪族」。
    if (m.letter || m.player || m.avImpr || m.moment) {
      const sp = document.createElement('span');
      sp.className = m.letter ? 'sys-msg-letter' : m.player ? 'sys-msg-player' : m.moment ? 'sys-msg-moment' : 'sys-msg-av';
      if (m.letter) sp.dataset.letter = String(m.letter);
      else if (m.player) sp.dataset.player = String(m.player);
      else if (m.moment) sp.dataset.moment = String(m.moment);
      else sp.dataset.avImpr = String(m.avImpr);
      sp.textContent = m.text;
      el.textContent = '';
      el.appendChild(sp);
    } else {
      // 群成员发的拍一拍是**系统提示**（from='system'，居中小字那一族），但它带着 sender＝谁拍的（BUGS #185）。
      // 原先这里只印 m.text，于是那一行既没有昵称也没有人称＝用户报的「群聊里联系人发送拍一拍，
      // 也没有昵称没有人称显示」。昵称与头像并排印在文字**之前**（与 .message-meta 那族同一种读法），
      // 单聊那条不带 sender（TA 没有可署的名，就是我和你两个人），故这层只在 sender 真在位时出现。
      if (m.sender) {
        // _memberAvatarHTML 产的是 **HTML 字符串**（不是节点），别 appendChild 它——那会抛
        // "parameter 1 is not of type 'Node'" 并让整条 renderMessages 崩掉（量具当场抓到）。
        // 故这一整枚署名走 innerHTML 一次拼出来，再把文字节点单独 append（文字里可能有 <>& 等，须走 textContent）。
        const who = document.createElement('span');
        who.className = 'sys-msg-who';
        who.innerHTML = _memberAvatarHTML(m.sender, 'sys-msg-who-avatar', true)
          + '<span class="sys-msg-who-name">' + escapeHTML(m.sender) + '</span>';
        el.appendChild(who);
      }
      el.appendChild(document.createTextNode(m.text));
    }
    // 头像和昵称互动：换头像的系统消息附带新头像图（avatarlib.js 写入 sysImg）
    if (m.sysImg) {
      const av = document.createElement('img');
      av.className = 'sys-msg-img';
      av.src = m.sysImg;
      av.alt = '头像';
      el.appendChild(av);
    }
    return el;
  }

  let body;
  if (m.recalled || m.sentAgain) {
    // FIX 2026-09-01 #002 撤回/补发重发消息可查看：原文保留在数据里；点气泡上的「查看/收起」在消息下方内联展开原文（不弹独立窗口），可重复开合
    const who = m.from === 'me' ? '你' : '对方';
    const verb = m.sentAgain ? '重新发送了一条消息' : '撤回了一条消息';
    const glimpse = (!m.sentAgain && m.peek) ? `<span class="recall-glimpse">（瞥到了几个字：${m.peekEnd ? '……' + escapeHTML(m.peek) : escapeHTML(m.peek) + '……'}）</span>` : '';
    const corner = (!m.sentAgain && m.sticker && m.peekSticker) ? `<img class="recall-sticker-corner" src="${escapeHTML(m.sticker)}" alt="表情包的一角">` : '';
    const canPeek = (m.text && m.text !== '[表情包]') || m.sticker;
    if (canPeek) {
      const peekBody = m.sticker
        ? `<img class="recall-peek-img" alt="${escapeHTML(m.sentAgain ? '重新发送的表情包' : '撤回的表情包')}" data-src="${escapeHTML(m.sticker)}" data-lazy-img="true">`
        : `<span class="recall-peek-text">${escapeHTML(m.text)}</span>`;
      body = `<div class="bubble recalled" data-recalled="1">${who}${verb}${glimpse}${corner}<button type="button" class="recall-peek-toggle" aria-expanded="false" aria-label="查看被撤回的内容">查看</button></div><div class="recall-peek-inline" data-peek-body hidden>${peekBody}</div>`;
    } else {
      body = `<div class="bubble recalled">${who}${verb}${glimpse}${corner}</div>`;
    }
  } else if (m.taAsk) {
    // ⑦ TA 想问你：TA 反向的单选卡（问题/选项由 cjian.js 调度生成，选项点击在 cjian.js 委托）
    body = _taAskCardHTML(m);
  } else if (m.invite) {
    // TA的邀请：三枚按钮（同意／拒绝／稍后），点击委托在 invite.js，状态写回 m.invite.status
    body = _inviteCardHTML(m);
  } else if (m.ask) {
    // 问问TA 互动卡片消息（题目/选项由 ask.js 生成，此处只渲染）
    body = _askCardHTML(m);
  } else if (m.game) {
    // 游戏中心触点：战绩卡/挑战分卡/信送到那一张（卡片本体由 games.js _gameCardHTML 渲染，按钮点击在 games.js 委托）
    const txt = m.text ? `<div class="bubble">${escapeHTML(m.text)}</div>` : '';
    body = txt + (typeof _gameCardHTML === 'function' ? _gameCardHTML(m) : '');  } else if (m.voice) {
    // 语音消息（BUGS #209 二批）：一条自绘的波形条＋一枚播放钮，点一下放库里那段录音（mmPlayLocal）。
    // ⚠ 不写时长——渲染这一刻读不到那段音频的 duration（要等元数据加载完），印一个数就是编一个数；
    // 字幕只端那张语音卡自带的完整文字（m.text），卡上没有就整行不画。
    body = `<div class="bubble voice-message"><button type="button" class="voice-play" data-voice-play="${escapeHTML(String(m.id))}" aria-label="播放这条语音"><svg class="vp-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.8v12.4L18.6 12z"/></svg><svg class="vp-stop" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.4 6.4h2.6v11.2H8.4zM13 6.4h2.6v11.2H13z"/></svg></button><span class="voice-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span></div>`
      + (m.text ? `<div class="voice-cap">${escapeHTML(m.text)}</div>` : '');
  } else if (m.sticker) {
    // tsEnabled：表情包可附带文字同气泡显示；纯图片（text 为空或占位符）保持无边框样式
    // sticker-photo＝字卡库「图片」分类／相册上传那一档＝220 见方等大框（表情包那档仍 110×110，BUGS #157·#195）
    const hasText = m.text && m.text !== '[表情包]';
    const photo = m.imgKind === 'image';
    body = `<div class="bubble sticker-message${hasText ? ' has-text' : ''}${photo ? ' sticker-photo' : ''}">${hasText ? `<div class="sticker-text">${escapeHTML(m.text)}</div>` : ''}<img data-src="${escapeHTML(m.sticker)}" alt="表情包" data-lazy-img="true"></div>`;
  } else {
    // 多字卡回复（字卡问答等）：cardParts 每张字卡一个 chip，多个字卡之间用单个空格分隔
    const parts = m.cardParts;
    if (Array.isArray(parts) && parts.length) {
      body = `<div class="bubble ask-parts">${parts.map(p => `<span class="ask-part">${escapeHTML(p)}</span>`).join(' ')}</div>`;
    } else {
      body = `<div class="bubble">${escapeHTML(m.text)}</div>`;
    }
  }

  let quote = '';
  // 引用图片：新数据存原消息 id(quoteImgId)引用，旧数据直接存图(quoteImg)；原图被删则降级为文字引用
  let quoteImgSrc = m.quoteImg || '';
  if (!quoteImgSrc && m.quoteImgId && Array.isArray(data.messages)) {
    const src = data.messages.find(x => String(x.id) === String(m.quoteImgId));
    if (src && src.sticker) quoteImgSrc = src.sticker;
  }
  if (quoteImgSrc) quote = `<div class="reply-quote quote-img">引用：<img class="quote-thumb" src="${escapeHTML(quoteImgSrc)}" alt="引用的图片" data-lazy-img="true"></div>`;
  else if (m.quote) quote = `<div class="reply-quote">引用：${escapeHTML(m.quote)}</div>`;

  const badges = _msgBadgesHTML(m);
  const bodyInner = badges ? body.replace(/<div class="bubble[^>]*>/, (s) => s + badges) : body;

  const senderLabel = m.from !== 'me' && typeof _isGroupChat === 'function' && _isGroupChat() && m.sender ? `<div class="msg-sender">${escapeHTML(m.sender)}</div>` : '';
  // MiniMax 语音：气泡内右下角的播放键（未开启/这位没绑音色时不渲染，见 minimax.js）
  const mmSpeak = (typeof mmVoiceBtnHTML === 'function') ? mmVoiceBtnHTML(m) : '';
  const emoLine = _emoLineHTML(m);
  const wrap = `<div class="bubble-wrap${m.ask ? ' ask-wrap' : ''}">${senderLabel}${quote}${bodyInner}${emoLine}<div class="message-meta"><span>${escapeHTML(m.time)}</span></div></div>`;

  // 长按操作工具条：悬浮在气泡上方（替代原底部弹窗），撤回仅我方消息显示
  const recallBtn = m.from === 'me' ? '<button type="button" data-act="recall">撤回</button>' : '';
  // 「复制」排在这条消息所有钮的最前（长按要做的第一件事就是把那句话取走），只在这条真有正文可给时画：
  // 判据是 utils.js 的 msgCopyText，与点击侧同一把尺（BUGS #202）
  const copyBtn = msgCopyText(m) ? '<button type="button" data-act="copy">复制</button>' : '';
  // 两枚问签的钮只对「挂得出的那条气泡」给：游戏卡那类没有 .bubble 宿主（.gcard 还带 overflow:hidden），
  // 给了钮也掷不出一枚看得见的签＝「看着能点实则无反应」那一族（BUGS #138 二批，用户报「有的消息点击后无反应」）
  const askBadge = _badgeAnchorOK(body);
  const referBtn = (data.referOn !== false && askBadge) ? '<button type="button" data-act="refer">这句说谁</button>' : '';
  const meantBtn = (data.meantOn !== false && askBadge && _meantEligible(m)) ? '<button type="button" data-act="meant">这句本意</button>' : '';
  // 「删除消息」总闸（delMsgOn，出厂关）：关着时这一行**不画**那枚钮，不是画了再藏——
  // 藏起来的钮仍能被长按命中、也会在无障碍树里留一个假入口，等于「关了还能删」。
  // 撤回（recall）不受它管：撤回是「说错了」，删除是「不想留」，两件事分开。
  const delBtn = data.delMsgOn ? '<button type="button" data-act="delete">删除</button>' : '';
  const actions = `<div class="msg-actions" hidden>${copyBtn}${recallBtn}<button type="button" data-act="quote">引用</button><button type="button" data-act="collect">收藏</button><button type="button" data-act="wish">心愿</button>${referBtn}${meantBtn}${delBtn}</div>`;

  const el = document.createElement('article');
  el.className = 'message ' + (m.from === 'me' ? 'mine' : '');
  el.dataset.id = m.id;
  const miniP = m.from !== 'me' && m.sender && typeof _isGroupChat === 'function' && _isGroupChat() && typeof _memberAvatarHTML === 'function' ? _memberAvatarHTML(m.sender, 'mini-avatar', true) : miniPartner;
  el.innerHTML = m.from === 'me' ? actions + wrap + miniMine : miniP + actions + wrap;
  // 群聊里点谁的头像就拍谁（BUGS #184）：把发言人也挂到那枚头像上，点开拍面板时由 openPokePanel(who) 锁定她。
  // 挂在 .message 这一层而不是头像内节点上——_memberAvatarHTML 产的是 <div>/<span>，塞属性容易与那一族的
  // click 委托（.message:not(.mine) .mini-avatar）错位；挂在气泡容器上由同一条委托读 dataset 即可。
  if (m.from !== 'me' && m.sender && typeof _isGroupChat === 'function' && _isGroupChat()) el.dataset.pokeWho = m.sender;
  // 播放键进气泡内（挂末个直接子 .bubble 的尾随＝键绝对定位骑右下角，guard 在行内替它留位）
  if (mmSpeak) {
    const bbl = el.querySelector('.bubble-wrap > .bubble');
    if (bbl) bbl.insertAdjacentHTML('beforeend', mmSpeak);
  }
  return el;
}

// 卡片上每个答案前面那枚 A/B/C：与面板里「一行一个答案」的顺序一一对应（面板不再画字母，
// 卡片上仍要，否则 TA 勾了「B」你在屏上找不着是哪个）。超过 26 个答案时回落到数字，不留空位。
function _askOptLetter(i) { return i < 26 ? String.fromCharCode(65 + i) : String(i + 1); }

// 问问TA 互动卡片渲染：ask = { kind:'choice'|'multi'|'text', opts:[]|null, status:'waiting'|'answered',
//   pick:''|null（单选那一枚）, picks:[]|null（多选那几枚）, cardCount:0|null, parts:[]|null（文字题的字卡） }
function _askCardHTML(m) {
  const a = m.ask || {};
  const answered = a.status === 'answered';
  const isMulti = a.kind === 'multi';
  const picks = isMulti && Array.isArray(a.picks) ? a.picks : [];
  const name = escapeHTML(chatPartnerName());
  const state = answered ? '已回答' : `等待 ${name} 回答…`;
  let optsHtml = '', note = '';
  if (a.kind === 'choice' || isMulti) {
    optsHtml = Array.isArray(a.opts) && a.opts.length
      ? `<div class="ask-opts">${a.opts.map((o, i) => {
          const picked = answered && (isMulti ? picks.includes(o) : o === a.pick);
          return `<div class="ask-opt${picked ? ' picked' : ''}"><span class="ask-opt-letter" aria-hidden="true">${_askOptLetter(i)}</span><span class="ask-radio" aria-hidden="true"></span><span class="ask-opt-text">${escapeHTML(o)}</span>${picked ? '<span class="ask-opt-check" aria-hidden="true">✓</span>' : ''}</div>`;
        }).join('')}</div>`
      : '';
    if (answered) {
      // 多选只列勾了哪几枚，不再补一句「共 N 个」＝高亮的选项自己会数，两遍是重复读数
      note = isMulti
        ? `<div class="ask-note">${name} 勾了${picks.length ? picks.map(o => `「${escapeHTML(o)}」`).join('') : '几个'}</div>`
        : `<div class="ask-note">${name} 选了「${escapeHTML(a.pick || '')}」</div>`;
    }
  } else if (answered) {
    const parts = Array.isArray(a.parts) ? a.parts : [];
    if (parts.length) {
      // 文字题：把 TA 抽的字卡作为 chip 直接显示在卡片内
      note = `<div class="ask-note">${name} 用 ${parts.length} 张字卡回复了你</div><div class="ask-parts">${parts.map(p => `<span class="ask-part">${escapeHTML(p)}</span>`).join(' ')}</div>`;
    } else {
      note = `<div class="ask-note">${name} 用 ${Number(a.cardCount) || 0} 张字卡回复了你</div>`;
    }
  }
  return `<div class="bubble ask-card${answered ? ' answered' : ''}${isMulti ? ' is-multi' : ''}"><div class="ask-head"><span class="ask-badge">问问TA</span><span class="ask-state">${state}</span></div><p class="ask-q">${escapeHTML(m.text || '')}</p>${optsHtml}${note}</div>`;
}

// ⑦ TA 想问你：TA 反向单选卡渲染（waiting 待你选 / answered 已选）
function _taAskCardHTML(m) {
  const a = m.taAsk || {};
  const answered = a.status === 'answered';
  const opts = Array.isArray(a.opts) && a.opts.length
    ? `<div class="taask-opts">${a.opts.map(o => {
        const picked = answered && o === a.pick;
        return `<button type="button" class="taask-opt${picked ? ' picked' : ''}" data-taq-opt="${escapeHTML(o)}" data-taq-id="${m.id}"${answered ? ' disabled' : ''}><span class="taask-radio" aria-hidden="true"></span><span class="taask-opt-text">${escapeHTML(o)}</span>${picked ? '<span class="taask-check">✓</span>' : ''}</button>`;
      }).join('')}</div>`
    : '';
  const note = answered ? `<div class="taask-note">你选了「${escapeHTML(a.pick || '')}」</div>` : '';
  return `<div class="bubble taask-card${answered ? ' answered' : ''}"><div class="taask-head"><span class="taask-badge">${escapeHTML(chatPartnerName())}想问你</span>${answered ? '' : '<span class="taask-state">选一个吧</span>'}</div><p class="taask-q">${escapeHTML(m.text || '')}</p>${opts}${note}</div>`;
}

// 聊天里那张邀请卡（双向）。册子＝data.invites（js/invite.js），2026-10-11 撤销 #270 那次「并入心愿」后
// 它不再借心愿条目当宿主。**状态只从那一册读**（卡片自己不存状态＝两处各记一遍必有一份对不上，#270 那一课仍在）；
// 认回来三条路（新 iid ∶融合期间的 wid∶最早那批记在消息身上）全走 invite.js 的 _invRecOfMsg 一处，
// 渲染与委托共用，不在这里再判一次。册子里查不到（被删了）时老实说一句并收掉三枚按钮——
// 点了必找不到条目的钮就是本仓反复被打回的「看着能点实则无反应」
function _inviteCardHTML(m) {
  const v = m.invite || {};
  const mine = v.dir === 'me';          // 我方发出的那一张（主语反过来，不画按钮）
  const hit = typeof _invRecOfMsg === 'function' ? _invRecOfMsg(v, m.id) : null;
  const stale = !!(hit && hit.stale);   // 这句后来又申请过一次：这张是上一轮的，不再可答（三枚钮都画给当前那张）
  const gone = !hit && !!(v.iid || v.wid);
  const st = hit ? hit.rec.status : (v.iid || v.wid ? null : (v.status || 'waiting'));
  const pending = !gone && !stale && (st === 'waiting' || st === 'later');
  const acts = (pending && !mine && st === 'waiting') ? '<div class="inv-acts">' +
    '<button type="button" class="inv-act ok" data-inv-act="accept" data-inv-id="' + m.id + '">同意</button>' +
    '<button type="button" class="inv-act no" data-inv-act="decline" data-inv-id="' + m.id + '">拒绝</button>' +
    '<button type="button" class="inv-act" data-inv-act="later" data-inv-id="' + m.id + '">稍后</button>' +
    '</div>' : '';
  // 「先放一放」不算答过，但它自己得在屏上留个说法，否则点完那枚钮看着像没反应
  const result = gone ? '<div class="inv-result">这条邀请已经被删掉了</div>'
    : stale ? '<div class="inv-result">这一句后来又申请过一次 · 看后面那张</div>'
    : st === 'later' ? '<div class="inv-result">先放一放</div>'
    : st === 'accepted' ? '<div class="inv-result">' + (mine ? 'TA 答应了' : '你答应了') + '</div>'
    : st === 'declined' ? '<div class="inv-result">' + (mine ? 'TA 这次不去' : '你拒绝了') + '</div>' : '';
  return '<div class="bubble inv-card' + (mine ? ' mine-side' : '') + (pending ? '' : ' answered') + '" data-inv-id="' + m.id + '">' +
    '<div class="inv-head-row"><span class="inv-badge">' + escapeHTML(mine ? '你的邀请' : chatPartnerName() + '的邀请') + '</span>' +
    (st === 'waiting' && !gone && !stale ? '<span class="inv-state">' + escapeHTML(mine ? '等 TA 回' : '要不要去') + '</span>' : '') + '</div>' +
    '<p class="inv-text">' + escapeHTML(m.text || '') + '</p>' + acts + result + '</div>';
}

function _buildDaySeparator(dateStr) {
  const div = document.createElement('div');
  div.className = 'day-label';
  const today = new Date().toLocaleDateString('zh-CN');
  if (dateStr === today) {
    // 显示口径只有一条：归属主纪念日 → 通用主纪念日（见 anniversary.js annMainFor）
    const _cid = (typeof currentContact === 'function') ? ((currentContact() || {}).id || '') : '';
    const main = (typeof annMainFor === 'function') ? annMainFor(_cid) : null;
    if (main) {
      const label = (main.name || '').trim() || '相遇';
      let annDay = false;
      if (main.yearly) {
        // 每年重复型没有年份可数天数：只在天数当天点亮「今天 · 名称」
        const n = new Date();
        const tmd = (n.getMonth() < 9 ? '0' : '') + (n.getMonth() + 1) + '-' + (n.getDate() < 10 ? '0' : '') + n.getDate();
        if (tmd === main.date) { div.textContent = `今天 · ${label}`; annDay = true; }
        else div.textContent = '今天';
      } else {
        const start = new Date(main.date + 'T00:00:00');
        const end = new Date();
        end.setHours(0, 0, 0, 0);
        const days = Math.max(1, Math.floor((end - start) / 864e5));
        div.textContent = `今天 · ${label}第 ${days} 天`;
        annDay = true;
      }
      if (annDay) {
        div.classList.add('has-ann');
        div.title = '点按查看纪念日';
        div.addEventListener('click', () => { if (typeof showView === 'function') showView('anniversary'); });
      }
    } else {
      div.textContent = '今天';
    }
  } else {
    div.textContent = formatDateLabel(dateStr);
  }
  return div;
}

let _msgChunkToken = 0;
let _msgStart = 0;           // 当前 DOM 中最早一条消息在 data.messages 的下标
let _msgLoadingMore = false; // 加载更早历史时防重入
let _msgEnd = 0;             // 历史定位窗口的渲染终点(不含)：>0 表示窗口未到最新(聊天停留在历史段)，0 = 常规渲染到最新
function inLocateMode() { return _msgEnd > 0; }

// 系统通知的写手已搬到唯一投递口 js/chat.js 的 _deliverToChat（BUGS #164）。
// 这里原本有一份「扫 data.messages 尾部」的观察者，两处都是错的：①它恒读 data.messages＝当前开着的那一本，
// 别的会话在后台来消息一声不响；②`_notifiedUpTo` 是下标，而切会话时 data.messages 会重绑成另一本数组，
// 下标跨会话错位（#088·#128 那一族「延迟回调/缓存读此刻」的又一处）。投递即通知，不需要第二个入口。

// 应用内消息浮窗 showMsgPop/hideMsgPop 已由桌面前台弹窗（js/deskpop.js 的 showDeskPopup）取代：
// 原实现全仓没有任何 .msg-pop 样式，弹出的是无样式裸 div（BUGS.md #039），本次整体移除
// FIX 2026-09-02 #015 顶栏切换/回聊天卡顿：切回聊天要对全部消息 DOM 重布局，500 条在低端机每次 300ms+
// （CDP 6x CPU 节流实测 500 条≈83-113ms、200 条≈51-75ms）；降到 200，更早历史仍由滚到顶的 loadEarlierMessages 分页加载
const MSG_PAGE_SIZE = 200;   // 历史分页每页条数：启动只渲染最近一页，向上滑到顶再加载更早

// ===== 贴底（跟到最新一条）=====
// 「停在最底部」不能靠 append 后钉一次 scrollTop 就完事：钉下去的那一刻列表的真实高度
// 还没稳定，之后还会继续长，于是视口被顶到离底几十上百 px 处（用户报「发送后/对方回复后
// 没滚到最底下，总有偏差」）。四条独立来源同时在长：
//   ① .message 带 content-visibility:auto + contain-intrinsic-size:auto 68px（chat.css，为性能）。
//      视口外的消息按 68px 估算参与布局，贴底后临近视口的才换成真实高度 → scrollHeight 变大。
//   ② 表情包/引用图走 IntersectionObserver 懒加载：表情包那档现在有占位尺寸（css/chat.css 的
//      .sticker-message img 恒 110×110），图片大档与引用缩略仍没占位，贴底时高 0、img load 完突然撑高，
//      那一帧没有任何补偿。
//   ③ 固定帧数不够：低端机上第 3~4 帧才落定。
//   ④ 发送后 input.focus() 保留键盘，visualViewport 压缩容器高度（app.js 的 _vvFix）。
// 因此改成三层：贴底意图锁（用户主动上翻时不抢视口）+ 高度稳定循环（连续 3 帧不变才收工）
// + 末条元素 ResizeObserver（图片撑高这类异步高度变化随时补钉）。

const STICK_NEAR_BOTTOM = 400;   // 距底 ≤400px 视为「想跟到底」，新消息自动贴底并亮起回底按钮的边界
let _stickBottom = true;         // 贴底意图：true=跟到最新，false=用户在上翻阅读，不抢视口

function isChatAtBottom(threshold) {
  const list = $('#messageList'); if (!list) return true;
  const t = (threshold === undefined ? STICK_NEAR_BOTTOM : threshold);
  return list.scrollHeight - list.scrollTop - list.clientHeight <= t;
}

// 用户滚动时刷新贴底意图：明确上翻（超过阈值）解除锁定，明确回到底部重新锁定，中间地带保持原状，
// 避免发送瞬间的惯性滚动把意图误判成「用户想读历史」。
function syncStickIntent() {
  const list = $('#messageList'); if (!list) return;
  const dist = list.scrollHeight - list.scrollTop - list.clientHeight;
  if (dist > STICK_NEAR_BOTTOM) _stickBottom = false;
  else if (dist <= 40) _stickBottom = true;
}

function _stickSnap() {
  const list = $('#messageList'); if (!list) return;
  list.scrollTop = list.scrollHeight;
}

// 稳定循环：每帧贴一次底，直到 scrollHeight 连续 3 帧不再变化（或超过时限）才收手。
// 对应 ①③：content-visibility 的真实高度在第 2~3 帧才落定。
let _stickRaf = 0;
function _stickLoop() {
  const list = $('#messageList'); if (!list) return;
  cancelAnimationFrame(_stickRaf);
  const endAt = Date.now() + 1500;
  let lastH = -1, stable = 0;
  const tick = () => {
    if (!_stickBottom) return;
    _stickSnap();
    const h = list.scrollHeight;
    if (h === lastH) { if (++stable >= 3) return; }   // 高度稳定 → 收工
    else { stable = 0; lastH = h; }
    if (Date.now() > endAt) return;
    _stickRaf = requestAnimationFrame(tick);
  };
  _stickRaf = requestAnimationFrame(tick);
}

// 末条消息的尺寸观察：图片懒加载撑高、入场动画引起的高度变化都会触发回调，立刻补钉一次。
// 只观察最后一个子元素（不是全部 200 条），成本恒定。
let _stickRO = null, _stickROTarget = null;
function _stickWatch() {
  const list = $('#messageList'); if (!list) return;
  if (typeof ResizeObserver !== 'function') return;
  const last = list.lastElementChild;
  if (!last || last === _stickROTarget) return;
  if (!_stickRO) {
    _stickRO = new ResizeObserver(() => { if (_stickBottom) _stickSnap(); });
  }
  try { _stickRO.disconnect(); } catch {}
  _stickRO.observe(last);
  _stickROTarget = last;
}

// 滚动聊天到底部。调用即视为「用户想看最新」，强制打开贴底锁并跑完整个稳定过程。
function scrollChatToBottom() {
  const list = $('#messageList'); if (!list) return;
  _stickBottom = true;
  _stickSnap();
  if (typeof requestAnimationFrame !== 'function') return;
  _stickLoop();
  requestAnimationFrame(_stickWatch);   // 末条建好后再挂观察
}

// 懒加载图片在贴底之后才 load 完、撑高消息盒（表情包档已有 110×110 占位，图片大档与引用缩略仍没有），
// 那一刻稳定循环可能已经收工。捕获阶段挂一个 load 监听做最后一道兜底：只要用户还处于贴底意图，
// 图片一解码完就把视口重新按到底 —— 否则一条表情包消息会差出整张图的高度（BUGS #013 引入懒加载的副作用）。
if (typeof document !== 'undefined') {
  document.addEventListener('load', e => {
    const t = e.target;
    if (!t || t.tagName !== 'IMG' || !_stickBottom) return;
    const list = $('#messageList');
    if (list && list.contains(t)) _stickSnap();
  }, true);
}

// 「打开会话」时把消息列表定位到最新。必须由导航显式补这一下，两处滚底都指望不上：
// ① 启动首屏那次渲染发生在 display:none 的容器里（app.js 先 showView('chats')），scrollHeight=0，滚底是空操作，
//    列表带着 scrollTop=0 被显示出来，就是最旧的那批消息；
// ② 没有新消息时 renderMessages 的 pending=0 分支走不到任何滚底代码，再调一次也没用。
// 只在打开会话时调用：从信箱/设置等子页返回要保留用户正在读的位置，由调用方判定。
function enterChatAtLatest() {
  // 还停在搜索定位的历史窗口时，「打开会话」＝ 回到最新对话：窗口里只有一段老历史，滚到窗口底也不是最新
  if (inLocateMode()) { jumpToLatest(); return; }
  scrollChatToBottom();
}

// 给最新气泡加入场动画：newCount(增量路径本次新增条数)>0 恒播；否则仅当业务侧置了 _animateNextRender（空会话首条等重建路径）。
// 一次渲染新增多条时从旧到新依次错峰 80ms 入场（连发不齐刷刷同帧弹出）；单次最多 5 条，搜索过滤中不播
function _consumeMsgAnim(list, newCount) {
  if (_searchQuery) { _animateNextRender = false; return; }
  const n = Math.min((newCount || 0) + (_animateNextRender ? 1 : 0), 5);
  _animateNextRender = false;
  if (!n) return;
  const targets = [];
  for (let i = list.children.length - 1; i >= 0 && targets.length < n; i--) {
    const el = list.children[i];
    if (el.classList.contains('message') && !el.classList.contains('animate')) targets.push(el);
  }
  targets.reverse().forEach((el, i) => {
    const delay = i * 80;
    if (delay) el.style.animationDelay = delay + 'ms';
    el.classList.add('animate');
    const dropAnim = () => { el.classList.remove('animate'); el.style.animationDelay = ''; };
    el.addEventListener('animationend', dropAnim, { once: true });
    setTimeout(dropAnim, 800 + delay);   // 后台标签页 animationend 可能不触发，定时兜底
  });
}

// 空窗骨架条的**唯一**写手（BUGS #348）。别在 switchChat／enterChatAtLatest／jumpToLatest 里再摸一次
// 那枚 hidden：两处写手必漂，会出现「真内容已经画出来、骨架还亮着」或反过来（本仓「一处只有一个写手」那一族）。
// 点亮与熄灭都发生在 renderMessages 这一次调用里，且点亮排在 list.innerHTML='' 之后同一发 JS 任务内
// ＝浏览器不会先 paint 一帧空白再补骨架（那样用户看到的还是空窗，只是晚一帧）。
function _setMsgSkel(on) {
  const s = $('#msgSkel');
  if (s) s.hidden = !on;
  // 亮骨架的同时把列表清空＝这一处是「空窗该长什么样」的唯一写手。
  // 为什么在这里清屏而不是让调用方各自清：切会话时屏上还挂着上一位的整屏消息（renderMessages 被推到下一帧），
  // 用户读成「点开甲却看着像乙」；不清屏的话骨架画在那堆旧气泡底下，等于没盖住。
  // 只在「要亮」时清，且调用方必须先把计数归零（resetMessageRender），否则下一次 renderMessages 会走增量分支画不回来。
  if (on) { const l = $('#messageList'); if (l) l.innerHTML = ''; }
}

function renderMessages() {
  const list = $('#messageList');
  const total = data.messages.length;
  const end = _msgEnd > 0 ? Math.min(_msgEnd, total) : total;   // 定位窗口只渲染到窗口终点，更晚的消息暂留数据
  const [miniImg, miniPartner, miniMine] = getMiniAvatarHTML();

  // 只有两种情况才清空重建：①业务侧显式要求（切会话/撤回/删除/开关翻转，都走 resetMessageRender）
  // ②DOM 被外力清空而仍有消息要画。
  // 旧写法在这里还问了一句「屏上有没有 .day-label」，那是个错误的代理判据：窗口里全是同一天的消息时
  // 本来就不会长出日期分隔条，于是每发一条消息都被判成「要重建」→ list.innerHTML='' 那一瞬视口回到窗口
  // 顶部，分片重建期间用户先看见一批旧消息再被拉回最新（用户报「发消息后回闪一下显示之前的消息」；
  // 实测 300 条同一天的夹具＝整列表被清空 1 次、scrollTop 由 17805 掉到 16898＝往上跳 907px）。
  const needRebuild = _msgRebuild || (total > 0 && list.children.length === 0);
  if (needRebuild) {
    _msgRebuild = false;
    _msgStart = Math.max(0, end - MSG_PAGE_SIZE);   // 只从窗口起点附近开始渲染，历史再大也不全量构建
    list.innerHTML = '';
    _lastMsgCount = _msgStart;
  } else {
    if (_msgStart > end) _msgStart = Math.max(0, end - MSG_PAGE_SIZE);
    if (_lastMsgCount > end) _lastMsgCount = end;
  }
  const pending = end - _lastMsgCount;
  // 只有「清空重建且确实有东西要画」这一种情形亮骨架：增量路径（屏上已有内容、只补几条）不亮＝闪一下更糟；
  // 空会话也不亮（pending=0）＝不给一屏假忙。搜索筛不到任何一条时由下面「画出一行才收」那条兜住。
  _setMsgSkel(needRebuild && pending > 0);

  // 搜索过滤
  const searchIdxs = _searchQuery ? [] : null;
  if (searchIdxs === null) {
    // 无搜索：直接渲染
  } else {
    for (let i = _lastMsgCount; i < end; i++) {
      if ((data.messages[i].text || '').toLowerCase().includes(_searchQuery)) {
        searchIdxs.push(i);
      }
    }
  }

  // 增量新增（新消息很少）：一次性同步构建，保证发送/回复后立即看到气泡
  if (!needRebuild && pending > 0 && pending < 400) {
    const frag = document.createDocumentFragment();
    let lastDate = _lastMsgCount > 0 ? (data.messages[_lastMsgCount - 1].date || '') : '';
    for (let i = _lastMsgCount; i < end; i++) {
      if (searchIdxs !== null && !searchIdxs.includes(i)) continue;
      const m = data.messages[i];
      const md = m.date || '';
      if (md !== lastDate) { frag.appendChild(_buildDaySeparator(md)); lastDate = md; }
      frag.appendChild(_buildMessageHTML(m, miniImg, miniMine, miniPartner));
    }
    list.appendChild(frag);
    _lastMsgCount = end;
    if (end >= total) {   // 常规(窗口已到最新)才滚底收按钮；定位历史段停在原地不打扰
      // FIX 2026-09-03 用户上翻阅读历史时（视口远离底部）新消息不再强制拽回底部，改为亮回底按钮。
      // 判定改走贴底意图锁：上翻后 _stickBottom=false，即使这一刻高度差 <400px 也不抢视口。
      if (isChatAtBottom()) {
        _stickBottom = true;
        scrollChatToBottom();
        const _sb1 = $('#scrollBottomBtn'); if (_sb1) _sb1.hidden = true;
      } else {
        const _sb1 = $('#scrollBottomBtn'); if (_sb1) _sb1.hidden = false;
      }
      initLazyImages();   // FIX 2026-09-02 #013 增量路径漏加载懒图片：新气泡的 img[data-src] 无观察者，图片/表情发送后不显示
    }
    if (pending > 0) _consumeMsgAnim(list, pending);
    return;
  }

  // 首次/重建/大批量：分片异步构建，每批限制执行时间(≤12ms)+数量上限后 setTimeout(0) 让出主线程，
  // 保证每段任务都远低于浏览器 50ms 长任务阈值 → 彻底不再出现"页面无响应/灰屏"
  if (pending > 0) {
    _msgChunkToken++;
    const token = _msgChunkToken;
    const BUDGET = 12;   // 每片毫秒预算
    const STEP = 200;    // 每片最大条数
    // FIX 2026-10-14 #405 重建路径的接缝日期不许从窗外播种：_lastMsgCount 刚被重建分支改写成窗口起点，
    // messages[_lastMsgCount-1] 根本不在 DOM 里，拿它当接缝会把窗口首组的日期标签吞掉
    // （首屏页 [300,500) 的首组标签就是这样消失的），进而把 loadEarlierMessages 的插入锚
    //（全列表第一个标签）挤离列表顶＝历史页插进中段、锚定补偿算 0、scrollTop 停 0 不再触发分页。
    // 只有增量大批量（!needRebuild，接缝那条真在 DOM 尾上）才播种窗外那条。
    let _lastDate = needRebuild ? '' : (_lastMsgCount > 0 ? (data.messages[_lastMsgCount - 1].date || '') : '');
    const next = () => {
      if (token !== _msgChunkToken) return;   // 期间又触发了新渲染，放弃过时任务
      const remaining = end - _lastMsgCount;
      if (remaining <= 0) { _setMsgSkel(false); initLazyImages(); return; }
      const t0 = Date.now();
      const frag = document.createDocumentFragment();
      let i = _lastMsgCount;
      while (i < end && (i - _lastMsgCount) < STEP && (Date.now() - t0) < BUDGET) {
        if (searchIdxs !== null && !searchIdxs.includes(i)) { i++; continue; }
        const m = data.messages[i];
        const md = m.date || '';
        if (md !== _lastDate) { frag.appendChild(_buildDaySeparator(md)); _lastDate = md; }
        frag.appendChild(_buildMessageHTML(m, miniImg, miniMine, miniPartner));
        i++;
      }
      const made = frag.childElementCount;   // 必须在 append 之前数：appendChild 之后 fragment 自己就空了
      list.appendChild(frag);
      _lastMsgCount = i;
      if (made) _setMsgSkel(false);   // 首片真画出东西才收骨架（一片里一条都没有＝被搜索筛掉，收了就是空白屏）
      // 分片途中每一片都要钉一次底：260 条的会话在 6x 节流下要跑十几片，只等建完那一刻钉＝用户看着列表
      // 从窗口最旧那一段一路长出来、最后一步跳到底（量具 tools/_smoke_group_open_scroll 的 A1/D1 逐帧量到的
      // 就是这一段，gap 在半路偏到 1.5 万 px）。与 BUGS #232 那一发同一族但治的不是同一件事：
      // 那一发管「清空信号被误判所以回闪」，这一分管「分片途中没人跟底」。
      // 只在贴底意图开着且窗口已到最新时钉——定位历史段（end < total）必须停在原地，别抢用户的视口。
      // 这一钉只覆盖片末那一帧；片内那些帧靠下面 `_stickLoop()` 挂上的高度稳定循环跟（两条各管一段，缺一条 A1 就红）。
      if (_stickBottom && end >= total) _stickSnap();
      if (_lastMsgCount < end) {
        setTimeout(next, 0);
      } else {
        _setMsgSkel(false);   // 末片一条都没画出来（全被搜索筛掉）时走这一支收骨架，不留一块假忙
        if (end >= total) {   // 定位历史段渲染完成不滚底，由 jumpToMessage 负责定位到目标
          scrollChatToBottom();
          const _sb2 = $('#scrollBottomBtn'); if (_sb2) _sb2.hidden = true;
          _consumeMsgAnim(list, 0);   // 空会话首条等重建路径：业务侧标记了才播
        }
        initLazyImages();
      }
    };
    // 片与片之间那些帧也要跟：把「高度稳定循环」在分片开始前挂上（它每帧钉一次底，直到连续 3 帧高度不变才收手）。
    // 只有片末那一钉挡不住片内的帧——`.message` 带 content-visibility:auto，条目被推进视口才把
    // `contain-intrinsic-size` 的估算值换成真实高度，scrollHeight 在两帧之间还会再涨一截
    // （实测：只留片末那一钉时 A1 仍会在第 10~15 帧偏 4847px；两条一起留才全程 gap ≤ 4）。
    // 这条循环本身带两道收手（高度稳定 3 帧／1500ms）且开头就问 `_stickBottom`，不会跟用户的上翻抢视口。
    if (_stickBottom && end >= total) _stickLoop();
    next();
  }
}

// FIX 2026-10-12 #316 手机端上翻聊天「飞出屏幕」：补位改锚点元素法。
// 旧写法按 scrollHeight 差值补偿（list.scrollTop += scrollHeight - prevH），差值本身是错的：
// 插入的这 200 条在视口上方、高度按 content-visibility 的 contain-intrinsic-size 估算
// （消息盒已随 #316 退出 content-visibility，但懒加载图进视口后仍会二次撑高），
// 用户继续上翻进这段历史时每条换真实高度 ⇒ scrollHeight 二次膨胀、补偿被冲破＝视口飞走。
// 锚点元素法：插入前后量同一个元素（当前视口顶端那条消息）的 offsetTop，补的正好是真实插入高；
// 再挂一帧 rAF 补异步撑高的残余量（同一时刻只允许一个待补，两次插入之间不串）。
let _pinRaf = 0, _pinEl = null, _pinTop = 0;
function _pinAfterInsert(anchorEl) {
  const list = $('#messageList');
  if (!list || !anchorEl) return;
  _pinEl = anchorEl; _pinTop = anchorEl.offsetTop;
  if (_pinRaf) return;
  _pinRaf = requestAnimationFrame(() => {
    _pinRaf = 0;
    if (_pinEl && _pinEl.isConnected) {
      const d = _pinEl.offsetTop - _pinTop;
      if (d) list.scrollTop += d;
    }
    _pinEl = null;
  });
}

// 向上滚动到顶部时，加载更早的一页历史（补插日期分隔+保持当前视口位置）
function loadEarlierMessages() {
  const list = $('#messageList');
  if (_msgLoadingMore || _msgStart <= 0) return;
  const total = data.messages.length;
  const newStart = Math.max(0, _msgStart - MSG_PAGE_SIZE);
  const count = _msgStart - newStart;
  if (count <= 0) return;
  _msgLoadingMore = true;
  const [miniImg, miniPartner, miniMine] = getMiniAvatarHTML();
  const frag = document.createDocumentFragment();
  // FIX 2026-10-14 #405 接缝口径改成「跟当前 DOM 顶条比」：补插页的第一条若与 DOM 第一条(messages[_msgStart])
  // 同日期＝同组不补头标签；不同日期＝补头标签并让旧顶标签下移归位。旧口径跟 messages[newStart-1] 比——
  // 那条不在 DOM 里，标签归属与插入位置都会错（跨日期边界时历史页被插进列表中间，探针 F3 实测）。
  let lastDate = (data.messages[_msgStart] || {}).date || '';
  for (let i = newStart; i < _msgStart; i++) {
    const m = data.messages[i];
    const md = m.date || '';
    if (md !== lastDate) { frag.appendChild(_buildDaySeparator(md)); lastDate = md; }
    frag.appendChild(_buildMessageHTML(m, miniImg, miniMine, miniPartner));
  }
  // FIX 2026-10-12 #316 锚点元素法补位（替代 scrollHeight 差值补偿）：插入前记下当前视口顶端
  // 那条消息的 offsetTop，插入后按同一个元素补真实插入高；rAF 里再补一次异步残余（_pinAfterInsert）
  const anchorEl = list.querySelector('.message');
  const anchorTop = anchorEl ? anchorEl.offsetTop : 0;
  // FIX 2026-10-14 #405 插入点二分：frag 自带头标签（跨日期边界）＝插到最顶、顶标签让位下移；
  // 同组续插＝插到顶标签之后。旧写法恒插到「全列表第一个标签」之后，而那个标签不保证在列表顶
  //（首组标签被吞时它悬在列表中段）＝历史页插进中段：锚点在插入点上方、offsetTop 不变、
  // 补偿成 0、scrollTop 停在 0，之后再滚顶连 scroll 事件都不来＝分页假死（用户报「没有做分页加载」）。
  const startsWithLabel = !!(frag.firstChild && frag.firstChild.classList && frag.firstChild.classList.contains('day-label'));
  const day = list.querySelector('.day-label');
  const oldTopMsgDate = (data.messages[_msgStart] || {}).date || '';
  list.insertBefore(frag, (startsWithLabel ? day : (day ? day.nextSibling : null)) || list.firstChild);
  // 跨日期补插且新页尾组与旧顶组同日期＝同一组跨接缝延续：旧顶标签成了组内重复，摘掉。
  //（同组续插不用摘——顶标签本来就留在最顶，正好罩住合并后的整组。）
  if (startsWithLabel && day && ((data.messages[_msgStart - 1] || {}).date || '') === oldTopMsgDate) day.remove();
  if (anchorEl) list.scrollTop += (anchorEl.offsetTop - anchorTop);
  _msgStart = newStart;
  initLazyImages(list);   // FIX 2026-09-03 #030 补插历史页的 img[data-src] 无观察者则图片空白（#013 同源残留，此路径漏调）——局部模式只挂这批新节点，不全量重扫（#048：全量会 disconnect 掉在场图片的观察器）
  _msgLoadingMore = false;
  _pinAfterInsert(anchorEl);
}

// ===== 搜索跳转定位（历史窗口） =====
// 聊天记录可能远超一页：跳转老消息时开一个以目标为中心的窗口 [idx-60, idx-60+200)，
// 顶部继续走 loadEarlierMessages 往前翻，底部由 loadLaterMessages 往后翻，直到追平最新即恢复常规模式。

// 滚动到目标消息并短暂高亮（气泡外圈闪烁，样式在 search.css）
function scrollToMsg(el) {
  if (!el) return;
  const list = $('#messageList');
  try {
    el.scrollIntoView({ block: 'center' });
  } catch {
    if (list) {
      const r = el.getBoundingClientRect(), lr = list.getBoundingClientRect();
      list.scrollTop += r.top - lr.top - lr.height / 2;
    }
  }
  el.classList.remove('locate-flash');
  void el.offsetWidth;                 // 重启动画
  el.classList.add('locate-flash');
  setTimeout(() => el.classList.remove('locate-flash'), 2800);
}

// 由搜索结果跳转到指定消息：id 已在 DOM 直接滚动；老历史则重建定位窗口
function jumpToMessage(id) {
  const list = $('#messageList');
  const msgs = data.messages || [];
  const total = msgs.length;
  const target = String(id);
  const findEl = () => list.querySelector('.message[data-id="' + target + '"]');
  const existed = findEl();
  if (existed) { scrollToMsg(existed); return; }
  let idx = -1;
  for (let i = 0; i < total; i++) if (String(msgs[i].id) === target) { idx = i; break; }
  if (idx < 0) { if (typeof showToast === 'function') showToast('这条消息已不存在'); return; }
  // 目标在最近一页内但暂未渲染（异步分片进行中）：常规重建后轮询定位
  if (idx >= total - MSG_PAGE_SIZE) {
    _msgEnd = 0;
    resetMessageRender();
    renderMessages();
    let tries = 0;
    const tick = () => {
      const el = findEl();
      if (el) scrollToMsg(el);
      else if (++tries < 80) setTimeout(tick, 50);
    };
    setTimeout(tick, 80);
    return;
  }
  // 老历史：开定位窗口，目标位于窗口第 ctx 条附近（上方留上下文，下方可继续翻）
  const ctx = 60;
  const start = Math.max(0, idx - ctx);
  const cap = start + MSG_PAGE_SIZE;
  _msgEnd = cap < total ? cap : 0;   // 起点到最新不足一页时直接常规渲染（_msgEnd=0）
  _msgChunkToken++;                  // 作废可能进行中的旧分片
  _msgStart = start;
  list.innerHTML = '';
  const [miniImg, miniPartner, miniMine] = getMiniAvatarHTML();
  const end = _msgEnd || total;
  const frag = document.createDocumentFragment();
  let lastDate = '';   // FIX 2026-10-14 #405 窗口顶恒有标签：接缝上方那条(msgs[start-1])不在 DOM 里，播种它会吞掉首组标签
  for (let i = start; i < end; i++) {
    const m = msgs[i];
    const md = m.date || '';
    if (md !== lastDate) { frag.appendChild(_buildDaySeparator(md)); lastDate = md; }
    frag.appendChild(_buildMessageHTML(m, miniImg, miniMine, miniPartner));
  }
  list.appendChild(frag);
  _lastMsgCount = end;
  initLazyImages();
  const el = findEl();
  if (el) scrollToMsg(el);
}

// 定位窗口向下翻页：滚到接近列表底部时调用，把窗口终点向后推一页（追加在底部，视口无需补偿）
function loadLaterMessages() {
  if (_msgEnd <= 0) return;
  const list = $('#messageList');
  const msgs = data.messages || [];
  const total = msgs.length;
  const from = Math.min(_msgEnd, total);
  if (from >= total) { _msgEnd = 0; return; }
  const to = Math.min(total, from + MSG_PAGE_SIZE);
  const [miniImg, miniPartner, miniMine] = getMiniAvatarHTML();
  const frag = document.createDocumentFragment();
  let lastDate = from > 0 ? (msgs[from - 1].date || '') : '';
  for (let i = from; i < to; i++) {
    const m = msgs[i];
    const md = m.date || '';
    if (md !== lastDate) { frag.appendChild(_buildDaySeparator(md)); lastDate = md; }
    frag.appendChild(_buildMessageHTML(m, miniImg, miniMine, miniPartner));
  }
  list.appendChild(frag);
  _lastMsgCount = to;
  if (to >= total) {
    // FIX #019 追平最新：窗口期间逐页追加导致全量历史常驻 DOM（违背 MSG_PAGE_SIZE=200 的性能设计），
    // 重建为常规最近一页并滚底（用户本就在底部，视口连续不跳）；_msgEnd=0 恢复常规，再点老消息重新开窗
    _msgEnd = 0;
    resetMessageRender();
    renderMessages();
    return;
  }
  _msgEnd = to;   // 窗口终点推进到 to，防止反复追加同一段 [from,to)
  initLazyImages();
}

// 定位窗口 → 回到最新（重建最近一页并滚到底）
function jumpToLatest() {
  _msgEnd = 0;
  resetMessageRender();
  renderMessages();
}

function renderProfile() {
  // 「恢复本会话默认外观」的武装态（两段式确认的第一下）不跨渲染残留：进本页/换会话即复位，
  // 复位函数与状态同住 js/settings.js 一处（_apResetDisarm），这里只调不碰账
  if (typeof _apResetDisarm === 'function') _apResetDisarm();
  // 资料卡按联系人编辑：回显本页正在编辑的那位（群态切到某一位＝那一位；无联系人兜底全局 profile）
  const _cp = _mateTarget() || data.profile;
  $('#partnerAvatarButton').innerHTML = contactAvatarHTML(_cp);
  // 标题跟着这一屏的对象走：停在「本群」那一档时画的是群（成员拼格），屏上却写「TA 的形象」＝
  // 一件名叫群、另一名叫某个人的矛盾读数（BUGS #197 的一半）；切到某一位仍是他本人的那份形象。
  const _cpGroup = !!(_cp && _cp.kind === 'group');
  const _taCap = $('#mateTaCap');
  if (_taCap) _taCap.textContent = _cpGroup ? '群的形象' : 'TA 的形象';
  // 铅笔钮的 aria-label 跟着这一屏的对象走：群态改的是群名，别对一位成员念「修改昵称」
  const _mne = $('#mateNameEdit');
  if (_mne) _mne.setAttribute('aria-label', _cpGroup ? '修改群名' : '修改昵称');
  $('#partnerAvatarButton').setAttribute('aria-label', _cpGroup ? '更换群头像' : '更换对方头像');
  // 「我的形象」这一行管的是**这一本会话**那一份覆盖（2026-10-08 按会话分开）：屏上显示的是现在这位
  // 面前我实际顶着的名字/头像（没单独设过＝全局那份），改动只落在这一本会话；跟随钮只在真存了覆盖时才出现。
  const _mRow = chatMyRowOf(data.activeChat);
  const _mOver = !!(_mRow && ((_mRow.myChatName || '') !== '' || (_mRow.myChatAvatar || '') !== ''));
  $('#myAvatarButton').innerHTML = avatarHTML(chatMyAvatar(), firstChar(chatMyName()));
  // 2026-10-14 #364：回显走**聊天里**那一枚（chatNameOf＝覆盖位优先、其次基名），与聊天页头部／
  // 首页会话行同一把尺。旧写法填基名＝屏上显什么就存什么、读写两头都钉在基名上，于是「上面名字」
  // 一改全网可见（用户报「上面名字能修改全部地方的名字」）。群态 chatName 恒空＝回落群名，读数不变。
  $('#nameInput').value = chatNameOf(_cp) || '';
  // 固定昵称（#346）：聊天以外的功能读这一格。显式值回显（空＝跟随名字，占位符那句话就是解释）
  const _fx = $('#fixedNameInput'); if (_fx) _fx.value = (typeof _cp.fixedName === 'string') ? _cp.fixedName : '';
  $('#myNameInput').value = chatMyName();
  const _mFollow = $('#myFollowGlobal'); if (_mFollow) _mFollow.hidden = !_mOver;
  const _mCap = $('#mateMineCap');
  if (_mCap) _mCap.textContent = (_mRow && _mRow.kind === 'group') ? '我的形象 · 只在本群生效' : '我的形象 · 只在这一位这里生效';
  const _mxt = $('#mxContactTimbre'); if (_mxt) _mxt.value = (typeof _cp.mmTimbre === 'string') ? _cp.mmTimbre : '';
  const _mxn = $('#mateVoiceTestNote'); if (_mxn) _mxn.textContent = '';   // 换一位 TA，上一位的试听结果不许留着
  renderShapeButtons();
  renderApSettings();
  // 「聊天情绪」那一格（按人一份）与形象∶音色同一时机回显：换一位／切「本群」都要跟着重算
  if (typeof renderEmoMateCard === 'function') renderEmoMateCard();
  if (typeof mmBindEcho === 'function') mmBindEcho();   // MiniMax 全局卡回显（设置页每次显示都会走到这里）
  const bh = data.behavior || {};
  // 脏值（字符串/undefined/null）一律回落 defaults 同一键的数字，而不是把输入框写成空字符串：
  // 这一格是「主动找你」最短间隔的唯一显示，写空＝用户看到空格且无从判断是没设还是没存；
  // 顺带让 #asMin 这类被旧档存成 "5" 的字段回到可用状态（BUGS：主动发送最短间隔显示为空）。
  const _setNum = (id, v) => {
    const e = $(id); if (!e) return;
    // 正被编辑的那一枚不回写：保存链是 400ms 防抖（_autoSaveCard），用户刚打了一半、这一发就把
    // 夹好的数盖回框里——旧写法下「清空→写回 1→接着打的数字长在它后面」＝「输入数字强制变两位数」
    // 的第二条腿（BUGS #211 二批）。定数改在失焦那一刻：blur 触发 change → 再走一次本函数。
    // ⚠ 判据走 inputFocused（js/input-ce.js）：Android 上文本框是 ce-box，焦点不在原 input 上（#418）
    if (window.inputFocused(e)) return;
    const k = id.replace(/^#/, '');
    const dv = (defaults.behavior && typeof defaults.behavior[k] === 'number') ? defaults.behavior[k] : '';
    e.value = (typeof v === 'number' && isFinite(v)) ? v : dv;
  };
  const _setChk = (id, v) => { const e = $(id); if (e) e.checked = !!v; };
  _setNum('#rnProb', bh.rnProb); _setNum('#strayProb', bh.strayProb); _setNum('#rsMin', bh.rsMin); _setNum('#rsMax', bh.rsMax);
  _setNum('#referProb', bh.referProb); _setNum('#meantProb', bh.meantProb);   // TA 自己标那两枚问签的概率（BUGS #350）
  _setNum('#replyMin', bh.replyMin); _setNum('#replyMax', bh.replyMax);
  _setNum('#pyProb', bh.pyProb); _setNum('#pyMin', bh.pyMin); _setNum('#pyMax', bh.pyMax);
  _setChk('#pyPunctEnabled', bh.pyPunctEnabled);
  _setChk('#csNormal', bh.csNormal); _setChk('#csTriggerName', bh.csTriggerName);
  _setNum('#touchProb', bh.touchProb); _setNum('#stickerProb', bh.stickerProb);
  _setNum('#emojiProb', bh.emojiProb); _setNum('#kaomojiProb', bh.kaomojiProb);
  _setNum('#imageProb', bh.imageProb); _setNum('#voiceProb', bh.voiceProb);
  _setNum('#quoteProb', bh.quoteProb); _setNum('#rcProb', bh.rcProb); _setNum('#rcRefix', bh.rcRefix);
  _setNum('#asProb', bh.asProb); _setNum('#asMin', bh.asMin); _setNum('#asMax', bh.asMax);
  _setNum('#asCountMin', bh.asCountMin); _setNum('#asCountMax', bh.asCountMax);
  _setNum('#asGroupProb', bh.asGroupProb);
  _setChk('#pyEnabled', bh.pyEnabled); _setChk('#asEnabled', bh.asEnabled);
  _setChk('#tsEnabled', bh.tsEnabled); _setChk('#enterSend', bh.enterSend); _setChk('#batchSend', bh.batchSend);
  _setChk('#dndEnabled', bh.dndEnabled); _setChk('#asBadge', bh.asBadge);
  _setChk('#asByState', bh.asByState);
  _setChk('#rnByState', bh.rnByState);
  _setChk('#annSelfOn', bh.annSelfOn); _setNum('#annSelfProb', bh.annSelfProb);
  // 「禁止联系人撤回消息」复选框 = 未启用撤回（recallEnabled=false）
  _setChk('#recallEnable', !bh.recallEnabled);
  // 「允许删除消息」总闸：只有显式 true 才算开（出厂与老档缺字段都落在关那一侧）
  _setChk('#delMsgOn', data.delMsgOn === true);
  // 回复设置按联系人隔离：符号池 chips 与「点昵称触发继续说」的标题跟随当前设置
  renderPyPunctChips();
  const _tt2 = $('#chatHeadName'); if (_tt2) _tt2.title = bh.csTriggerName ? '点击让对方继续说' : '';
  // 信箱设置已整族搬进信箱页（js/mailbox.js 的 renderMbSettings），这里不再回显——
  // 原先这 13 行直取 $('#mbMinCardCount').value 且无空守卫，控件一删就会截断整块内联脚本（BUGS #021 那一族）
  const cs = data.callSettings || defaults.callSettings;
  _setNum('#callAnswerProb', cs.answerProb); _setNum('#callRejectProb', cs.rejectProb);
  _setNum('#callMissProb', cs.missProb); _setNum('#callBusyProb', cs.busyProb);
  _setNum('#callRingMin', cs.ringMin); _setNum('#callRingMax', cs.ringMax);
  _setNum('#callMinLen', cs.callMinLen); _setNum('#callMaxLen', cs.callMaxLen);
  $('#callIncomingEnable').checked = !!cs.incomingEnable;
  $('#callNoAutoHangup').checked = !!cs.noAutoHangup;
  _setNum('#callIncomingRingMin', cs.incomingRingMin); _setNum('#callIncomingRingMax', cs.incomingRingMax);
  _setNum('#callIncomingMin', cs.incomingMin); _setNum('#callIncomingMax', cs.incomingMax);
  const _cvg = $('#callVoiceGreet'); if (_cvg) _cvg.checked = cs.voiceGreetEnable !== false;
  _setNum('#callVoiceGreetProb', cs.voiceGreetProb != null ? cs.voiceGreetProb : 60);
  renderSoundSettings();
  renderGameSfx();
  if (typeof renderFoldSummaries === 'function') renderFoldSummaries();   // 折叠卡摘要与控件同源，回显后一并刷新
}

function renderShapeButtons() {
  const cur = data.avatarShape || 'circle';
  $$('.shape-btn').forEach(b => b.classList.toggle('active', b.dataset.shape === cur));
  const sum = $('#sumAvShape');
  if (sum) sum.textContent = { circle: '圆形', rounded: '圆角', square: '方形' }[cur] || '';
}

function formatDateLabel(dateStr) {
  const today = new Date().toLocaleDateString('zh-CN');
  const yesterday = new Date(Date.now() - 864e5).toLocaleDateString('zh-CN');
  if (dateStr === today) return '今天';
  if (dateStr === yesterday) return '昨天';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

let _groupsKey = '';
let currentCardsTab = '主字卡';       // 字卡库那一面的分类档
let currentSysCardsTab = '';         // 「系统预设字卡」那一面另记一笔（共用一枚会把用户的阅读位置带跑）；首档由 presetFeatureTabs 现派生，不写死
// 字卡作用域：'public'=公用字卡 | 'own'=专属字卡（对齐 mochi）
// 记住上次停在哪一枚（用户「每次打开都显示在【专属字卡】那格」）：作用域是纯内存变量时刷新即回 'own'，
// 而公用/专属两面内容往往差着量级，回错那面＝看着像「我明明有字卡」。只认显式两值，脏值回落 'own'。
// 只在这一枚上写记忆：程序化改作用域的两处（stickers 的「去字卡库绑定」按约定落专属、mochi 导入按有无公用组自选）
// 都是一次性的意图，不该把用户的阅读位置一起带走。
const CARDS_SCOPE_KEY = 'ordinal-cards-scope';
let currentCardsScope = 'own';
try { const _sv = localStorage.getItem(CARDS_SCOPE_KEY); if (_sv === 'public' || _sv === 'own') currentCardsScope = _sv; } catch (e) {}
function saveCardsScope() { try { localStorage.setItem(CARDS_SCOPE_KEY, currentCardsScope); } catch (e) {} }
// 「按谁筛」那一行的筛选态（用户 2026-10-10 点名「加回按联系人筛选那一行」，BUGS #265）：
// 与信箱分册那一族同一写法——只存本机不进备份（筛选态是阅读位置，不是数据），'all' 直接删键，
// 人删掉／组全解绑之后停在个不存在的主人上＝一屏空白看着像字卡丢了，读侧当场回落「全部」不留第三种屏
const CARDS_WHO_KEY = 'ordinal-cards-who';
let currentCardsWho = (() => { try { return localStorage.getItem(CARDS_WHO_KEY) || 'all'; } catch (e) { return 'all'; } })();
function saveCardsWho(w) {
  currentCardsWho = w || 'all';
  try {
    if (currentCardsWho === 'all') localStorage.removeItem(CARDS_WHO_KEY);
    else localStorage.setItem(CARDS_WHO_KEY, currentCardsWho);
  } catch (e) {}
}
// 桶＝「这一档这一类里，每组专属卡挂在谁名下」，只从已经过作用域与分类筛的那批组现算——
// 芯片上写的张数必须等于点进去列得出的张数（#079 那一刀：一行写的数与落点看到的数不一致就是假话）
function _cardsWhoBuckets(groups) {
  const by = new Map(), out = [];
  for (const x of groups) {
    const id = x.g.contactId || '_none';
    if (!by.has(id)) { const b = { id, n: 0, cards: 0 }; by.set(id, b); out.push(b); }
    const b = by.get(id);
    b.n++; b.cards += (x.g.cards || []).length;
  }
  // 名单＝聊天里已有的联系人全体（2026-10-11 纠偏）：不是「已经绑了组的那些人」——没绑过组的 TA
  // 也要能切过去看（切过去屏上说清 TA 名下还没有），有组没组都能切＝这一行才是「切换联系人」
  for (const c of (data.contacts || [])) {
    if (!by.has(c.id)) { const b2 = { id: c.id, n: 0, cards: 0 }; by.set(c.id, b2); out.push(b2); }
  }
  // 顺序跟联系人名单（#066 那条：随组顺序漂＝同一位在屏上来回跳位），没绑给谁那一格永远排最后
  const order = (data.contacts || []).map(c => c.id);
  out.sort((a, b) => (a.id === '_none' ? 9e9 : order.indexOf(a.id)) - (b.id === '_none' ? 9e9 : order.indexOf(b.id)));
  return out;
}
function _cardsWhoLabel(b) {
  if (b.id === '_none') return '没绑给谁';
  const c = (data.contacts || []).find(x => x.id === b.id);
  if (!c) return '已不在通讯录';
  return (fixedNameOf(c) || '未命名') + (c.kind === 'group' ? ' · 群' : '');
}
let selectedGroupName = '';
let groupSearch = '';
let cardsBatchMode = false;
let cardsBatchSel = new Set();

const _ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 19.5h4L19 9a2.12 2.12 0 0 0-3-3L5.5 16.5z"/><path d="M13.5 7.5l3 3"/></svg>';
const _ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 6.5h17"/><path d="M8.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 5v1.5"/><path d="M18.5 6.5l-.85 12.35a2 2 0 0 1-2 1.65H8.35a2 2 0 0 1-2-1.65L5.5 6.5"/><path d="M10 10.5v6.5M14 10.5v6.5"/></svg>';
const _ICON_VOICE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3.5 10.5v3M7.5 7.5v9M12 4.5v15M16.5 7.5v9M20.5 10.5v3"/></svg>';
const _ICON_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5v10"/><path d="M7.5 9.5l4.5 4.5 4.5-4.5"/><path d="M4.5 17.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-1.5"/></svg>';
// #411 使用权开关的两枚眼睛（停用＝闭眼）：mochi 同款形制，开／停共用一个位
const _ICON_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const _ICON_EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>';
function _cardItemHTML(gi, ci, entry, selKey, batch, badge) {
  const img = cardImage(entry);
  const voice = img ? null : voiceCardParts(entry);
  const body = img
    ? `<span class="card-img"><img data-src="${escapeHTML(img)}" alt="表情包" data-lazy-img="true"></span>`
    : voice
      ? `<span class="card-text card-voice">${_ICON_VOICE}<span class="voice-name">${escapeHTML(voice.name)}</span></span>`
      : `<span class="card-text">${escapeHTML(entry)}</span>`;
  const badgeHtml = badge ? `<span class="card-badge">${escapeHTML(badge)}</span>` : '';
  const actions = img
    ? `<div class="card-actions"><button class="card-delete" data-card-delete data-group="${gi}" data-card="${ci}" title="删除">${_ICON_TRASH}</button></div>`
    : `<div class="card-actions"><button class="card-edit" data-card-edit data-group="${gi}" data-card="${ci}" title="编辑">${_ICON_EDIT}</button><button class="card-delete" data-card-delete data-group="${gi}" data-card="${ci}" title="删除">${_ICON_TRASH}</button></div>`;
  const selAttr = batch && cardsBatchSel.has(selKey) ? ' data-sel="1"' : '';
  const itemCls = img ? 'card-item card-img-item' : 'card-item';
  if (batch) {
    const check = '<span class="card-check"></span>';
    return badge
      ? `<div class="${itemCls}" data-sel-key="${selKey}"${selAttr}>${check}<div class="card-main">${body}${badgeHtml}</div></div>`
      : `<div class="${itemCls}" data-sel-key="${selKey}"${selAttr}>${check}${body}</div>`;
  }
  return badge
    ? `<div class="${itemCls}" data-sel-key="${selKey}"><div class="card-main">${body}${badgeHtml}</div>${actions}</div>`
    : `<div class="${itemCls}" data-sel-key="${selKey}">${body}${actions}</div>`;
}
// 分组绑定徽标：own 作用域显示（@名字 / 未绑定·TA用不到），点击弹绑定层改整组归属
// 名字走 chatNameOf（与首页会话行同一把尺，BUGS #246）：读 c.name 会让绑定名单里的人
// 与你在聊天列表里看到的人对不上号，看着像「名单里没有我在聊的那位」（BUGS #259）
function _bindBadgeHTML(gi, g) {
  if (currentCardsScope !== 'own') return '';
  const contact = g.contactId ? (data.contacts || []).find(c => c.id === g.contactId) : null;
  return `<button class="gbind${contact ? '' : ' free'}" data-group-bind="${gi}">${contact ? '@' + escapeHTML(fixedNameOf(contact) || '未命名') : '未绑定 · 点这里绑给谁'}</button>`;
}
// 作用域切换：一组卡建在公用还是专属，过去只由「新建那会儿你在哪一档」钉死一次，之后屏上
// 专属那组可「改成公用」；公用不再有「改成专属」（2026-10-11 纠偏：公用就是公用，不能绑定为专属）
function _scopeSwitchHTML(gi, g) {
  if (g.preset) return '';
  return cardScope(g) === 'own'
    ? `<button class="gbind free gscope" data-group-scope="${gi}">改成公用</button>`
    : '';
}
function _cardItemHTML(gi, ci, entry, selKey, batch, badge, grp, bind) {
  const img = cardImage(entry);
  const voice = img ? null : voiceCardParts(entry);
  // #411 单卡使用权：停用的卡照常上墙（看得见才想得起恢复），只给 lighter 墨色＋「已停用」小签＋闭眼钮
  const gObj = data.groups[gi] || null;
  const coff = cardIsOff(gObj, entry);
  const body = img
    ? `<span class="card-img"><img data-src="${escapeHTML(img)}" alt="表情包" data-lazy-img="true"></span>`
    : voice
      ? `<span class="card-text card-voice">${_ICON_VOICE}<span class="voice-name">${escapeHTML(voice.name)}</span></span>`
      : `<span class="card-text">${escapeHTML(entry)}</span>`;
  const badgeHtml = (badge ? `<span class="card-badge">${escapeHTML(badge)}</span>` : '') + (coff ? '<em class="card-off-tag">已停用</em>' : '');
  const bindHtml = !batch && bind ? `<button class="card-bind${bind.name ? '' : ' free'}" data-group-bind="${gi}" title="${bind.name ? '已绑定：' + escapeHTML(bind.name) : '未绑定联系人 · 这组字卡任何会话都用不到，点这里绑定'}">${bind.name ? '@' + escapeHTML(bind.name) : 'TA用不到'}</button>` : '';
  // 语音卡多一枚「导出这句音频」：这一族的内容是一段录音，改名与删除都代替不了把它取出去
  const voiceOut = voice ? `<button class="card-voice-out" data-card-voice-export data-group="${gi}" data-card="${ci}" title="导出这句音频">${_ICON_DOWN}</button>` : '';
  const offBtn = `<button class="card-off" data-card-off data-group="${gi}" data-card="${ci}" title="${coff ? '恢复使用' : '停用这张'}">${coff ? _ICON_EYE_OFF : _ICON_EYE}</button>`;
  const actions = img
    ? `<div class="card-actions">${offBtn}<button class="card-delete" data-card-delete data-group="${gi}" data-card="${ci}" title="删除">${_ICON_TRASH}</button></div>`
    : `<div class="card-actions">${voiceOut}${offBtn}<button class="card-edit" data-card-edit data-group="${gi}" data-card="${ci}" title="编辑">${_ICON_EDIT}</button><button class="card-delete" data-card-delete data-group="${gi}" data-card="${ci}" title="删除">${_ICON_TRASH}</button></div>`;
  const selAttr = batch && cardsBatchSel.has(selKey) ? ' data-sel="1"' : '';
  const itemCls = (img ? 'card-item card-img-item' : 'card-item') + (coff ? ' off' : '');
  const foot = grp ? `<div class="card-foot"><span class="card-grp">${escapeHTML(grp)}</span>${batch ? '' : actions}</div>` : (batch ? '' : actions);
  if (batch) {
    const check = '<span class="card-check"></span>';
    return `<div class="${itemCls}" data-sel-key="${selKey}"${selAttr}>${check}<div class="card-main">${body}${badgeHtml}</div></div>`;
  }
  return `<div class="${itemCls}" data-sel-key="${selKey}">${bindHtml}<div class="card-main">${body}${badgeHtml}</div>${foot}</div>`;
}
// 一套字卡列表 UI 两处复用：字卡库只显示你自己新建的组，出厂预置组（preset）在「系统预设字卡」独立页（renderSysCards）
// 字卡墙分片渲染（BUG #048）：几千张字卡时一次性 root.innerHTML 会造出 8.5 万个 DOM 节点，
// 实测 renderGroups 278ms + 强制布局 70ms（手机再乘 3~5 倍），开页直接卡住。
// 改成：只拼字符串不插 DOM，首屏只落 _CARDS_PAGE 张，滚到哨兵再追加下一批，
// 已插入部分的懒加载观察器不重建（见 initLazyImages(root) 的局部模式）。
const _CARDS_PAGE = 200;
let _cardsPagerObserver = null;
function _cardsPagerDisconnect() {
  if (_cardsPagerObserver) { _cardsPagerObserver.disconnect(); _cardsPagerObserver = null; }
}
// 把 items（HTML 片段数组）分批塞进 grid；哨兵滚进视口就追加下一批
function _cardsFillGrid(grid, sentinel, items, batch) {
  let i = 0;
  const append = () => {
    if (i >= items.length) { if (sentinel) sentinel.remove(); return false; }
    const end = Math.min(i + _CARDS_PAGE, items.length);
    const box = document.createElement('div');
    box.innerHTML = items.slice(i, end).join('');
    while (box.firstChild) grid.appendChild(box.firstChild);
    i = end;
    initLazyImages(grid);
    return i < items.length;
  };
  if (!append()) { _cardsPagerDisconnect(); return; }
  if (!sentinel) return;
  const syncTip = () => { sentinel.textContent = `已显示 ${i} / ${items.length} 张 · 继续滚动加载`; };
  syncTip();
  _cardsPagerDisconnect();
  _cardsPagerObserver = new IntersectionObserver(es => {
    for (const e of es) {
      if (!e.isIntersecting) continue;
      _cardsPagerObserver.unobserve(e.target);
      if (append()) { syncTip(); _cardsPagerObserver.observe(e.target); }   // 追加后哨兵被推远，必须重挂才会再触发下一批
      else { _cardsPagerDisconnect(); sentinel.remove(); }
    }
  }, { rootMargin: '400px 0px' });
  _cardsPagerObserver.observe(sentinel);
}
function renderGroups(rootSel, subSel, presetOnly) {
  const root = $(rootSel || '#groupList');
  if (!root) return;
  _cardsPagerDisconnect();
  const sub = $(subSel || '#cardsSub');
  const q = presetOnly ? '' : groupSearch.trim().toLowerCase();
  // 字卡库那一面：分类行硬排除 PRESET_ONLY_CATEGORIES（TA心里话 只属「系统预设字卡」页，
  // 2026-10-04 用户直派两个页面完全分开）。不再看存档里有没有自建的同分类组——那条「让 tab 回来
  // 不留孤儿」的旧口径已作废，残留自建组由 db.ensureData 归位到主字卡，不靠 tab 兜底。
  // 预置页这一面的分类＝「哪个功能在用这批话术」（utils.PRESET_FEATURES），不再是字卡物理类型：
  // 25 组出厂话术在 CARD_CATEGORIES 里只落 主字卡／TA心里话 两档，屏上就只剩两枚 tab，
  // 信箱与心愿的句子挤在同一格里。功能身份本就在组名上，这里把它升上来当分类。
  const cats = presetOnly ? presetFeatureTabs(data.groups)
    : CARD_CATEGORIES.filter(c => !PRESET_ONLY_CATEGORIES.includes(c));
  let tab = presetOnly ? currentSysCardsTab : currentCardsTab;
  if (cats.indexOf(tab) < 0) { tab = cats[0] || (presetOnly ? '' : '主字卡'); if (presetOnly) currentSysCardsTab = tab; else currentCardsTab = tab; }
  const catGroups = [];
  for (let gi = 0; gi < data.groups.length; gi++) {
    const g = data.groups[gi];
    // 2026-10-05 用户直派「系统预设字卡里为什么也显示公用字卡和专属字卡，删掉」：
    // 预置组一律公用（db.ensureData 把 preset 且无 contactId 的强制成 public），作用域切换条在这页
    // 恒等于「公用=N / 专属=0」，点过去一片空白，纯噪音。故预置页不按作用域过滤，列出全部预置组。
    if (!presetOnly && cardScope(g) !== currentCardsScope) continue;
    if (!!g.preset !== !!presetOnly) continue;
    if (presetOnly ? presetFeatureOf(g) === tab : (g.category || '主字卡') === tab) catGroups.push({ gi, g });
  }
  // 按人筛那一行只在「专属」这一档有意义（公用＝所有人共用，给公用的卡再分主人是假话），
  // 预置页更不长（那页按功能分类，不按人）。整行恒出在专属档（2026-10-11 纠偏：切联系人就是主入口，名单＝通讯录全体，一位也照出）。
  // 2026-10-11 二次纠偏（BUGS #298，用户点名「每个分类里都有切换非常麻烦，直接放最顶」）：
  // 行提到公用/专属切换条正下方、分类 tab 之上；名单与张数按整本专属库现算（不再按当前分类）
  // ——切一次全库生效，换分类 tab 不用再切人；芯片上的数也改成「TA 名下整本专属库共 N 张」。
  const ownAll = (!presetOnly && currentCardsScope === 'own') ? data.groups.filter(g => !g.preset && cardScope(g) === 'own').map(g => ({ g })) : [];
  const whoBuckets = (!presetOnly && currentCardsScope === 'own') ? _cardsWhoBuckets(ownAll) : [];   // 零专属组时也回通讯录全体＝整行仍在（#295「一位也照出」的口径）
  const whoShow = whoBuckets.length > 0;
  let who = 'all';
  if (whoShow) who = whoBuckets.some(b => b.id === currentCardsWho) ? currentCardsWho : 'all';
  const viewGroups = who === 'all' ? catGroups : catGroups.filter(x => (x.g.contactId || '_none') === who);
  if (selectedGroupName && !viewGroups.some(x => x.g.name === selectedGroupName)) selectedGroupName = '';
  const sel = selectedGroupName ? viewGroups.find(x => x.g.name === selectedGroupName) : null;
  const batch = presetOnly ? false : cardsBatchMode;
  const scopeN = { public: 0, own: 0 };
  data.groups.forEach(g => { if (!!g.preset === !!presetOnly) scopeN[cardScope(g)] += (g.cards || []).length; });
  if (sub) {
    if (presetOnly) {
      const presetAll = data.groups.filter(g => g.preset).reduce((s, g) => s + (g.cards || []).length, 0);
      const presetGrpN = data.groups.filter(g => g.preset).length;
      sub.textContent = `${presetGrpN} 组 · 共 ${presetAll} 张`;
    } else {
      sub.textContent = `公用 ${scopeN.public} 张 · 专属 ${scopeN.own} 张`;
    }
  }
  const scopesHtml = presetOnly ? '' : `<div class="cards-scopes"><button class="cards-scope" data-cards-scope="public"${currentCardsScope === 'public' ? ' data-active="true"' : ''}>公用字卡<span class="scope-count">${scopeN.public}</span></button><button class="cards-scope" data-cards-scope="own"${currentCardsScope === 'own' ? ' data-active="true"' : ''}>专属字卡<span class="scope-count">${scopeN.own}</span></button></div>`;
  const tabsHtml = cats.map(c => `<button class="cards-tab" data-cards-tab="${escapeHTML(c)}"${c === tab ? ' data-active="true"' : ''}>${escapeHTML(c)}</button>`).join('');
  const catTotal = viewGroups.reduce((s, x) => s + x.g.cards.length, 0);
  // 「按谁」那一行：类名复用收藏页/信箱那族 .fchips/.fchip（零新组件、全站只有一种筛选 chips）。
  // #298 起它是**整页顶上的联系人切换条**（在分类 tab 之上），张数＝那位名下整本专属库合计（不再随分类 tab 变）；
  // 「全部」那枚＝专属库合计，点某人后下面列表只列当前分类里 TA 的组（分类维度仍由 tab 管，两层各管各的）
  const whoHtml = !whoShow ? '' : `<div class="fchips cards-who" id="cardsWho">${[{ id: 'all', cards: ownAll.reduce((s, x) => s + (x.g.cards || []).length, 0), label: '全部' }].concat(whoBuckets).map(b => `<button type="button" class="fchip${who === b.id ? ' on' : ''}" data-cards-who="${escapeHTML(b.id)}">${escapeHTML(b.label || _cardsWhoLabel(b))}<span class="n">${b.cards}</span></button>`).join('')}</div>`;
  const chipsHtml = `<div class="cards-group-tabs"><button class="cards-group-tab" data-group-chip=""${sel ? '' : ' data-active="true"'}>全部<span class="n">${catTotal}</span></button>${viewGroups.map(x => `<button class="cards-group-tab${x.g.off ? ' g-off' : ''}" data-group-chip="${escapeHTML(x.g.name)}"${sel && sel.gi === x.gi ? ' data-active="true"' : ''}>${escapeHTML(x.g.name)}${x.g.off ? '<i class="toff">停用</i>' : ''}<span class="n">${x.g.cards.length}</span></button>`).join('')}</div>`;
  const isImgCat = tab === '表情包' || tab === '图片';
  const gridCls = `cards${isImgCat ? ' category-grid' : ''}`;
  let listHtml = '', pending = null;
  if (sel) {
    const items = [];
    for (let ci = 0; ci < sel.g.cards.length; ci++) {
      if (q && (typeof sel.g.cards[ci] !== 'string' || !sel.g.cards[ci].toLowerCase().includes(q))) continue;
      items.push(_cardItemHTML(sel.gi, ci, sel.g.cards[ci], `${sel.gi}:${ci}`, batch, '', ''));
    }
    const addBtn = isImgCat
      ? `<button class="group-bar-add" data-group-add-img="${sel.gi}">＋ 添加${tab === '图片' ? '图片' : '表情包'}</button>`
      : `<button class="group-bar-add" data-group-idx="${sel.gi}">＋ 添加</button>`;
    const delBtn = `<button class="group-bar-del" data-group-delete="${sel.gi}" title="删除分组">${_ICON_TRASH}</button>`;
    // #411 分组使用权开关：整组停用＝TA 各自动池都取不到这组（组内单卡开关原样保留，恢复即回原状）。
    // 预置页同样长这枚钮——「系统预设字卡的某个分组关停用」正是这一批的需求之一
    const goff = !!sel.g.off;
    const offBtn = `<button class="group-bar-off${goff ? ' off' : ''}" data-group-off="${sel.gi}" title="${goff ? '启用该分组' : '停用该分组'}">${goff ? _ICON_EYE_OFF : _ICON_EYE}</button>`;
    const goffTag = goff ? '<em class="g-off-tag">已停用</em>' : '';
    const bindBtn = presetOnly ? '' : _bindBadgeHTML(sel.gi, sel.g);
    const scopeBtn = presetOnly ? '' : _scopeSwitchHTML(sel.gi, sel.g);
    // 预置页这一面「能加能删」是用户自己定档保留的，所以这里不写「不可修改」那句（写了就是假话），
    // 出厂身份改挂统一搜索那一枚小签（search.js）——两样混排的地方只有那一面。
    listHtml = `<div class="group-bar"><div class="group-bar-info"><span class="group-bar-name">${escapeHTML(sel.g.name)}</span>${goffTag}${bindBtn}${scopeBtn}<span class="group-bar-count">${sel.g.cards.length} 张</span></div>${addBtn}${offBtn}${delBtn}</div>`
      + (items.length ? `<div class="${gridCls}"></div><div class="cards-pager"></div>` : `<div class="empty-cards">${q ? '没有匹配的字卡' : '暂无字卡，点右上「＋ 添加」'}</div>`);
    if (items.length) pending = { items };
  } else {
    const items = [];
    for (const { gi, g } of viewGroups) {
      const bind = currentCardsScope === 'own' && !presetOnly
        ? { name: fixedNameOf((data.contacts || []).find(c => c.id === g.contactId) || {}) }
        : null;
      for (let ci = 0; ci < g.cards.length; ci++) {
        if (q && (typeof g.cards[ci] !== 'string' || !g.cards[ci].toLowerCase().includes(q))) continue;
        items.push(_cardItemHTML(gi, ci, g.cards[ci], `${gi}:${ci}`, batch, '', g.name, bind));
      }
    }
    if (items.length) {
      const bindTip = currentCardsScope === 'own' && !presetOnly ? ' · 点卡角徽标可换绑给谁' : '';
      // 筛在人身上时那句「共 N 张」得说清是这一位的 N 张，否则读起来像整个库只有这么多
      const whoTip = who === 'all' ? '' : `只看 ${escapeHTML(_cardsWhoLabel(whoBuckets.find(b => b.id === who) || { id: who }))} · `;
      listHtml = `<div class="all-cards"><div class="all-cards-tip">${whoTip}${q ? `匹配 ${items.length} 张字卡` : `共 ${catTotal} 张字卡`}${bindTip}</div><div class="${gridCls}"></div><div class="cards-pager"></div></div>`;
      pending = { items };
    } else {
      listHtml = '<div class="empty-cards" style="margin:18px 0 4px">' + (q ? '没有匹配的字卡' : (who !== 'all' && who !== '_none' ? 'TA 名下这一类还没有专属卡，点右下 ＋ 新建会建在 TA 名下' : (catGroups.length ? '当前分类暂无字卡' : (presetOnly ? '这一类没有预置字卡' : `该${currentCardsScope === 'public' ? '公用' : '专属'}分类暂无分组，点右下 ＋ 新建`)))) + '</div>';
    }
  }
  root.innerHTML = `${scopesHtml}${whoHtml}<div class="cards-tabs">${tabsHtml}</div>${chipsHtml}${listHtml}`;   // #298：按人那行在分类 tab 之上（切联系人是整页顶上的主入口，不随分类走）
  initLazyImages();
  if (pending) {
    const grid = root.querySelector('.' + gridCls.split(' ').join('.'));
    if (grid) _cardsFillGrid(grid, root.querySelector('.cards-pager'), pending.items, batch);
  }
}
function renderSysCards() { renderGroups('#sysCardList', '#sysCardsSub', true); }

// 表情包面板已迁至 js/stickers.js（三 tab + 分类 + 分组 + 批量管理，移植自家 mochi）

const IMG_TAG = '<span class="mb-img-tag"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.4"/><path d="M21 15.5 16 10.5l-9 8.5"/></svg></span>';
let _proactiveKey = '', _replyKey = '', _sentKey = '';
const _MB_MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
function _mbParsePostmark(pm) {
  const x = (pm || '').match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
  return x ? { y: +x[1], m: +x[2], d: +x[3] } : null;
}
function _mbWeekday(p) {
  if (!p) return '';
  return '周' + '日一二三四五六'[new Date(p.y, p.m - 1, p.d).getDay()];
}
/* 一条时刻读数 → 可比的分钟数；邮戳拆不出年月日（旧档「9/28」这种没年份的）回 null＝落「早期」那一组。
   刻意不拿 `postmark + ' ' + time` 当字符串比：`time()` 走 toLocaleTimeString，历史存档里既有 '09:12' 也有 '9:12'，
   字符串比较会把「9:12」判成比「10:04」晚＝又一次代理判据。 */
function _mbSortKey(m, p) {
  if (!p) return null;
  const t = /(\d{1,2}):(\d{2})/.exec(m.time || '');
  return ((p.y * 10000 + p.m * 100 + p.d) * 1440) + (t ? (+t[1]) * 60 + (+t[2]) : 0);
}
/* 一条「收纳顺序」的唯一算法：新在前（同刻按存进册子的先后，新的在前），邮戳拆不出年月日的整段落最后、
   组内保持原顺序（它没有可比的时间，硬排等于替它猜）。列表分组与「第 N 封」那枚序数共用这一份——
   两处各排一次必然打架（本仓「一件事只在一处」那条口径）。不做两份比较器。 */
function _mbOrdered(rows) {
  const dated = [], early = [];
  for (const r of rows || []) {
    if (!r || !r.m) continue;
    const p = _mbParsePostmark(r.m.postmark);
    const k = _mbSortKey(r.m, p);
    (k === null ? early : dated).push({ m: r.m, idx: r.idx, p, k });
  }
  dated.sort((a, b) => b.k - a.k || b.idx - a.idx);
  return dated.concat(early);
}
/* 按邮戳月份分组。rows 为 [{m, idx}]，idx 恒是**原数组下标**（按册筛过也不能错位）。
   ⚠ 分组之前必须先按时间排（BUGS #244）：旧写法只把数组「倒过来扫」，注释写着「倒序＝新月份在前、组内新信在前」——
   这句只在数组恰好等于时间顺序时成立。导入旧档∶合并备份∶会话追加都是往数组尾部 append **旧时间**的记录，
   于是屏上出现「10/01 排在 10/10 前面」与「早期」夹在中间（8 封的夹具实测 8 处逆序）。 */
function _mbGroups(rows) {
  const groups = [];
  const at = new Map();
  for (const it of _mbOrdered(rows)) {
    const key = it.p ? it.p.y + '-' + it.p.m : 'early';
    if (!at.has(key)) { at.set(key, groups.length); groups.push({ key, p: it.p, rows: [] }); }
    groups[at.get(key)].rows.push(it);
  }
  // 跨年会撞出两枚同名的「10 月」（分组键含年份、屏上的名字不含），且它们中间还隔着别组＝读起来像坏了。
  // 只在真撞名时才补年份——日常只有当年几封信时，「2026 年」是噪音。
  const cnt = new Map();
  for (const g of groups) if (g.p) cnt.set(g.p.m, (cnt.get(g.p.m) || 0) + 1);
  for (const g of groups) g.dupYear = !!(g.p && cnt.get(g.p.m) > 1);
  return groups;
}
// 「全部」这一档且这一屏跨了两位以上才在 meta 里印谁——筛中单人时每行都重复同一个名字＝纯噪音（与「一件事只在一处」同口径）
function _mbWhoPrefix(m, show) { return show ? escapeHTML(_mbOwnerName(m.cid || '')) + ' · ' : ''; }
// 分组头 2026-10-05 减法（BUGS #064）：原先一屏 3 个 40px 组头，每个都「中文月 + 全大写英文月缩写 + 数量小计 + 未拆小计」，
// 四段信息挤在一行还要占 40px，压得信件只剩半屏。压成一行细字，去掉英文（LETTERS 那套英文字装饰全站只此一处，
// 反而成了唯一的不一致），小计并进同一行。
function _mbGroupHead(g, extra) {
  const name = !g.p ? '早期' : (g.dupYear ? g.p.y + ' 年 ' + g.p.m + ' 月' : g.p.m + ' 月');
  return `<div class="mb-mg"><b>${name}</b><span class="rule"></span><span>${g.rows.length} 封${extra || ''}</span></div>`;
}
// 日期栏：能拆成年月日的走衬线大日号；拆不出的（旧格式邮戳 9/28 这种没年份的）**退回印原始邮戳文本**。
// 2026-10-05 减法把邮戳从 meta 里去掉了（BUGS #064：左侧日期栏已有日期，两处重复），于是这类旧信
// 若还印「--」，它的日期就在整个页面上都不见了——减法不能顺手把唯一一份信息也减掉。
// 日期收成行内一小段文本（甲案：不再占一整列）。拆不出年月日的旧格式（9/28 没年份）退回印原始邮戳文本，
// 不能像旧版那样留一个「--」——减法不能顺手把唯一一份日期信息也减掉。
function _mbPmHTML(m, p) {
  if (!p) return '<b class="mb-pm-raw">' + escapeHTML(m.postmark || '') + '</b>';
  return '<b>' + p.m + '/' + String(p.d).padStart(2, '0') + '</b>' + (p.y ? '<i>周' + '日一二三四五六'[new Date(p.y, p.m - 1, p.d).getDay()] + '</i>' : '');
}
/* 两面（收到的信｜寄出的信）共用这一份行骨架（甲案 2026-10-07）：
   旧写法一行有六层——日期列／纸片卡框／卡内信纸横线／正文／meta 行／右上角邮戳贴纸，
   且同一件事说两三遍（左列日期与 meta 的日期、每行重复一句「封着·到站才拆得开」）。
   现在只剩两层：正文（人名以浅色领起）＋一行元信息；未读靠左 2px 墨条与加重，不靠整块形状。 */
function _mbRow(o) {
  const bits = [o.stat].filter(x => x && String(x).trim());
  return '<div class="mailbox-row mb-row' + (o.cls ? ' ' + o.cls : '') + (o.unread ? ' un' : '') + '" ' + o.attrs + '>'
    + '<div class="mb-pm">' + (o.pm || '') + '</div><div class="mb-body">'
    + '<p class="mb-text">' + (o.badge || '') + (o.img || '') + (o.who ? '<em>' + o.who + '</em>' : '') + escapeHTML(o.text) + '</p>'
    + '<div class="mb-meta"><span>' + (o.unread ? '<i class="mb-dot"></i>' : '') + bits.join(' · ') + '</span></div>'
    + '</div></div>';
}
function _mbStat(line, total) {
  const el = $('#mbStat');
  if (el) el.innerHTML = `共 ${total} 封 · <b>${line}</b>`;
}
// 页头统计跟随当前 tab：渲染与 tab 切换都会调用（三枚各说自己的那一册：两册来信问未拆、寄出那册问已寄出）
function _mbStatRefresh() {
  const active = document.querySelector('.mailbox-tab.active');
  const tab = active ? active.dataset.tab : 'proactive';
  if (tab === 'sent') {
    const items = _mbLetters('sent').map(r => r.m);
    _mbStat(items.length ? '已寄出' : '还没寄出', items.length);
  } else {
    const items = _mbLetters(tab === 'reply' ? 'reply' : 'proactive').map(r => r.m);
    const u = items.filter(m => !m.read).length;
    _mbStat(u > 0 ? u + ' 封未拆' : '无未拆', items.length);
  }
}
(function _mbStatBind() {
  const tabs = document.querySelector('.mailbox-tabs');
  if (tabs) tabs.addEventListener('click', e => { if (e.target.closest('.mailbox-tab')) _mbStatRefresh(); });
})();

/* 三册信箱（2026-10-14 BUGS #402）：「TA 的来信」＝TA 主动写来的（kind≠'reply'，旧档没有 kind 的一律算这册——
   与写信统计页「TA 主动写的」、信箱设置「每天最多 N 封」同一把尺，三处不许各写一种算法）；
   「TA 的回信」＝kind==='reply' 那一册。行骨架·分组·排序·memo 键三册一式两份，
   差别只有三处：进哪封信、页签计数写谁、meta 行带不带「回你 X.XX」。 */
function renderProactiveList() {
  const list = $('#proactiveList');
  const rows = _mbLetters('proactive');
  const items = rows.map(r => r.m);
  const scope = _mbScopeNow();
  const showWho = scope === 'all' && new Set(items.map(m => m.cid || '')).size > 1;
  const tabPr = $('#mbTabPr'); if (tabPr) tabPr.textContent = items.length || '';
  _mbStatRefresh();
  const key = scope + '|' + items.length + '|' + items.map(m => (m.read?1:0) + ':' + (m.charCount||0) + ':' + (m.postmark||'') + ':' + (m.img?1:0) + ':' + (m.kind||'') + ':' + (m.cid||'')).join(',') + '|' + data.profile.name;
  if (key === _proactiveKey) return;
  _proactiveKey = key;
  if (!items.length) {
    list.innerHTML = `<div class="mailbox-empty"><div class="mailbox-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg></div><p class="mailbox-empty-title">还没有收到信</p><p class="mailbox-empty-hint">TA会时不时给你写信<br>先去聊聊天，等TA的来信吧</p></div>`;
    return;
  }
  list.innerHTML = _mbGroups(rows).map(g => {
    const un = g.rows.filter(r => !r.m.read).length;
    return _mbGroupHead(g, un ? ' · ' + un + ' 未拆' : '') + '<div class="mb-group">' + g.rows.map(r => {
    const m = r.m;
    return _mbRow({
      attrs: `data-type="received" data-idx="${r.idx}" ${m.read ? 'data-read="1"' : 'data-unread="1"'} data-animated="false"`,
      unread: !m.read,
      img: m.img ? IMG_TAG : '',
      who: showWho ? escapeHTML(_mbOwnerName(m.cid || '')) : '',
      text: m.text,
      pm: _mbPmHTML(m, r.p),
      // 未读不写「未拆封」三个字——左缘那根墨条与加重已经在说同一件事；已读才标，因为那是一封信的终态
      stat: (m.charCount ? m.charCount + ' 字' : '') + (m.read ? ' · 已读' : '')
    });
  }).join('') + '</div>';
  }).join('');
}

// 「TA 的回信」那一册。与主动信那册的两处差别＝①「回信」徽章摘掉（整册都是回信，徽章在这册里是噪音；
// 徽章随 .mb-badge 规则一起删净，不留没有宿主的死规则）②meta 行带出「回你 X.XX 的那封」——
// 那正是这封信存在的缘由，也是它与主动信唯一要区分的事
function renderReplyList() {
  const list = $('#replyList');
  const rows = _mbLetters('reply');
  const items = rows.map(r => r.m);
  const scope = _mbScopeNow();
  const showWho = scope === 'all' && new Set(items.map(m => m.cid || '')).size > 1;
  const tabRp = $('#mbTabRp'); if (tabRp) tabRp.textContent = items.length || '';
  _mbStatRefresh();
  const key = scope + '|' + items.length + '|' + items.map(m => (m.read?1:0) + ':' + (m.charCount||0) + ':' + (m.postmark||'') + ':' + (m.replyTo||'') + ':' + (m.img?1:0) + ':' + (m.cid||'')).join(',') + '|' + data.profile.name;
  if (key === _replyKey) return;
  _replyKey = key;
  if (!items.length) {
    list.innerHTML = `<div class="mailbox-empty"><div class="mailbox-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l9 6 9-6"/><path d="M21 7l-9 6"/></svg></div><p class="mailbox-empty-title">还没有收到回信</p><p class="mailbox-empty-hint">你寄出的信，TA 读到了会回你<br>去「我的写信」看看寄出去的信吧</p></div>`;
    return;
  }
  list.innerHTML = _mbGroups(rows).map(g => {
    const un = g.rows.filter(r => !r.m.read).length;
    return _mbGroupHead(g, un ? ' · ' + un + ' 未拆' : '') + '<div class="mb-group">' + g.rows.map(r => {
    const m = r.m;
    return _mbRow({
      attrs: `data-type="received" data-idx="${r.idx}" ${m.read ? 'data-read="1"' : 'data-unread="1"'} data-animated="false"`,
      unread: !m.read,
      img: m.img ? IMG_TAG : '',
      who: showWho ? escapeHTML(_mbOwnerName(m.cid || '')) : '',
      text: m.text,
      pm: _mbPmHTML(m, r.p),
      stat: (m.charCount ? m.charCount + ' 字' : '') + (m.replyTo ? ' · 回你 ' + m.replyTo : '') + (m.read ? ' · 已读' : '')
    });
  }).join('') + '</div>';
  }).join('');
}

function renderSentList() {
  const list = $('#sentList');
  const rows = _mbLetters('sent');
  const items = rows.map(r => r.m);
  const scope = _mbScopeNow();
  const showWho = scope === 'all' && new Set(items.map(m => m.cid || '')).size > 1;
  const drafts = _mbDrafts();
  const draftRows = drafts.length ? drafts.map(d => {
    const x = /^(20\d{2})\.([0-9]{1,2})\.([0-9]{1,2})$/.exec(d.stamp || '');
    return _mbRow({
      cls: 'mb-draft',
      attrs: `data-draft-cid="${escapeHTML(d.cid)}"`,
      who: scope === 'all' ? escapeHTML(_mbOwnerName(d.cid)) : '',
      text: d.text,
      pm: x ? '<b>' + (+x[2]) + '/' + String(+x[3]).padStart(2, '0') + '</b>' : '',
      stat: '没寄出 · 点开继续写'
    });
  }).join('') : '';
  const tabSt = $('#mbTabSt'); if (tabSt) tabSt.textContent = items.length || '';
  _mbStatRefresh();
  const key = scope + '|' + items.length + '|' + drafts.length + '|' + drafts.map(d => d.cid + ':' + (d.stamp || '') + ':' + d.text.length).join(',') + '|' + items.map(m => (m.postmark||'') + ':' + (m.charCount||0) + ':' + (m.img?1:0) + ':' + (m.cid||'')).join(',') + '|' + (data.me && data.me.name || '我') + '|' + (data.profile && data.profile.name || '');
  if (key === _sentKey) return;
  _sentKey = key;
  if (!items.length) {
    list.innerHTML = draftRows || `<div class="mailbox-empty"><div class="mailbox-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg></div><p class="mailbox-empty-title">还没有寄出的信</p></div>`;
    return;
  }
  list.innerHTML = draftRows + _mbGroups(rows).map(g => {
    return _mbGroupHead(g) + '<div class="mb-group">' + g.rows.map(r => {
    const m = r.m;
    return _mbRow({
      attrs: `data-type="sent" data-idx="${r.idx}"`,
      img: m.img ? IMG_TAG : '',
      who: showWho ? '寄给 ' + escapeHTML(_mbOwnerName(m.cid || '')) : '',
      text: m.text,
      pm: _mbPmHTML(m, r.p),
      stat: m.charCount ? m.charCount + ' 字' : ''
    });
  }).join('') + '</div>';
  }).join('');
}

// 分册 chips：只列真有信的那几位（顺序跟联系人名单）＋「全部」。只有一位时整行不出现——
// 「全部」加一枚人名只是在重复同一个人，占一行零信息量
function renderMbOwners() {
  const box = $('#mbOwners');
  if (!box) return;
  const has = new Set();
  (data.receivedLetters || []).forEach(m => { if (m && m.cid) has.add(m.cid); });
  (data.sentLetters || []).forEach(m => { if (m && m.cid) has.add(m.cid); });
  const people = _mbSingles().filter(c => has.has(c.id));
  if (people.length < 2) { box.hidden = true; box.innerHTML = ''; return; }
  const scope = _mbScopeNow();
  box.hidden = false;
  box.innerHTML = [['all', '全部']].concat(people.map(c => [c.id, c.name || 'TA'])).map(x =>
    `<button type="button" class="fchip${scope === x[0] ? ' on' : ''}" data-mbcid="${x[0]}">${escapeHTML(x[1])}</button>`).join('');
}
function renderMailbox() {
  renderMbOwners();
  renderProactiveList();
  renderReplyList();
  renderSentList();
}

// 信箱未拆画它自己那枚角标，落在「更多」那一页的行角上（2026-10-07 首页那条合计入口行按用户判定删掉；朋友圈那枚随整族下线删净）
// 写手统一是 js/hub.js 的 updateHomeIndex()，两处不许各写一份算式
function updateUnread() {
  updateHomeIndex();
}

// 顶栏「更多」按钮的汇总小圆点：信箱有未读即点亮

