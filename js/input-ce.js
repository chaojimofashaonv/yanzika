// ===== 输入框 contenteditable 化（Android）· BUGS #418 =====
// 病灶：Chrome 手机版一聚焦原生 <input type=text>／<textarea>，键盘上方就挂出「🔑💳📍」那条
// 自动填充附件条。本站 #412 去 <form> 只治了「文档里存在 <form>」那一支（那条是文档级探测），
// 本条是第二支、也是用户反复报的那一支：**聚焦原生文本域本身**就弹，autocomplete=off、
// readonly、关掉浏览器设置都拦不住。参考实现对岸 mochi（src/js/mobile-adapt.js 的 ceConvert
// ＋三层防线），那边真机验过：只有把「显示与输入」整个交给 contenteditable 才彻底不弹。
//
// 本站口径（与 mochi 的每一处差异都写死在这儿，别照着 mochi 全量搬）：
//  ① 只在 **Android** 上启用（mochi 是「非 iOS 全量」）。桌面没有那条条，就不动它——
//     原生 input 的 :placeholder-shown、原生光标 API、原生撤销全留在桌面；
//     iOS 同样不转（mochi 定档：contenteditable 在 iOS Safari 上聚焦不弹键盘、
//     :empty::before 占位异常、还会抢原生输入），iPhone 保留原生输入框。
//  ② 只转**文本类**：input（无 type／text／search）与 textarea。
//     ⚠ number（本站 80 枚概率格）不转：转了丢原生数字键盘与上下限，且自动填充条不为数字域弹出；
//     ⚠ password（#quizGatePw 内测密码）不转：转成明文显示器不偿失；
//     ⚠ checkbox／range／file／date 一族本来就不该转（那份名单见 CE_SKIP_TYPES）。
//  ③ 原 input 退场为「幽灵锚点」（.ce-ghost：1px、不可点、Tab 跳过），显示与输入由紧跟其前的
//     .ce-box 接管；value／placeholder／focus／blur／光标（selectionStart 一族）／事件
//     （input·change·keydown·keyup·click·composition）全由代理打通 ⇒ 业务代码零改动。
//     ⚠ 唯一需要业务侧配合的是「焦点判据」：转换后 activeElement 是 ce-box 而不是原 input，
//       document.activeElement === 某输入框 的写法全部改用 inputFocused（见本文件末尾）。
//  ④ 调试开关：URL 带 ?ceon=1 时桌面也启用——量具 tools/_smoke_input_ce.js 靠它在桌面跑真链路，
//     也让「桌面想看效果」有个口子。真机不受影响（Android 本来就走）。
//
// 四层防线（时序设计照搬 mochi，缺一层就有窗口期——用户报的「还是有」正是窗口期的形状）：
//   ① 加载时全量扫一遍（DOM 已在＝脚本在 body 末尾）；
//   ② MutationObserver 只扫「本批新增节点」的子树（全量重扫在大 DOM 上是实测卡顿源）；
//   ③ focus 原型层拦截：任何代码路径（弹窗打开即 focus、动态插入后立刻 select）都先同步转换、
//      再聚焦 ce-box ⇒ 原生 input 从头到尾没持过焦，Chrome 看不到「聚焦的表单字段」；
//   ④ focusin 捕获阶段兜底：label 点击这类「内核自己发起的聚焦」绕过 .focus()，
//      这里把焦点当场移交给 ce-box（已转换的一并移交，别让它停在幽灵上）。
(function () {
  'use strict';

  // 焦点判据：转换后焦点在 ce-box 上，activeElement === 原 input 恒 false。
  // 无条件定义（桌面/iOS 上 __ceBox 永不存在，退化成原来的 === 判定，零行为差异）。
  window.inputFocused = function (el) {
    return !!el && (document.activeElement === el || (el.__ceBox && el.__ceBox === document.activeElement));
  };
  window.ceBoxOf = function (el) { return (el && el.__ceBox) || null; };

  var CE_FORCE = /[?&]ceon=1(&|$)/.test(location.search);
  var _ua = navigator.userAgent || '';
  var _isIOS = /iP(hone|ad|od)/.test(_ua) || (/Macintosh/.test(_ua) && (navigator.maxTouchPoints || 0) > 1);
  if (_isIOS) return;
  if (!/Android/i.test(_ua) && !CE_FORCE) return;

  // 屏上与量具可读的开关位；body 上挂 ce-on 供 CSS 分档（见 css/input-ce.css）
  window.__ceOn = true;
  try { document.documentElement.classList.add('ce-on'); document.body.classList.add('ce-on'); } catch (e) {}

  var CE_SEL = 'input:not([type]), input[type="text"], input[type="search"], textarea';
  var CE_SKIP_TYPES = ['checkbox', 'radio', 'range', 'file', 'color', 'hidden', 'button', 'submit', 'reset',
    'date', 'time', 'datetime-local', 'month', 'week', 'number', 'password', 'email', 'tel', 'url'];

  function _ceSkip(inp) {
    if (!inp || inp.nodeType !== 1) return true;
    if (inp.tagName !== 'INPUT' && inp.tagName !== 'TEXTAREA') return true;
    if (inp.__ceBox || inp.dataset.ceDone) return true;
    if (inp.readOnly || inp.disabled) return true;
    if (inp.hasAttribute('data-ce-off')) return true;      // 程序性临时输入框（剪贴板助手等）明确豁免
    if (CE_SKIP_TYPES.indexOf((inp.getAttribute('type') || 'text').toLowerCase()) >= 0) return true;
    return false;
  }

  // 多行取值：按 DOM 结构还原换行（contenteditable 里按 Enter 落的是字面 \n 或块级 <div>；
  // 部分国产内核的 innerText 会丢文本节点里的 \n ⇒ 两个都算、取换行更多的那个）
  function ceMultiText(box) {
    var out = '';
    var endNl = function () { return out.slice(-1) === '\n'; };
    (function walk(node) {
      for (var i = 0; i < node.childNodes.length; i++) {
        var n = node.childNodes[i];
        if (n.nodeType === 3) { out += n.nodeValue || ''; continue; }
        if (n.nodeType !== 1) continue;
        var tag = n.tagName;
        if (tag === 'BR') { out += '\n'; continue; }
        var block = tag === 'DIV' || tag === 'P' || tag === 'LI' || tag === 'PRE' || tag === 'BLOCKQUOTE';
        if (block) {
          if (out && !endNl()) out += '\n';
          walk(n);
          if (out && !endNl()) out += '\n';
        } else walk(n);
      }
    })(box);
    return out;
  }

  // 光标：把「输入框里的文本偏移」翻译成 DOM Range（chat.js 的 @点名 靠它把名字插回原处）
  function _ceOffset(box) {
    var total = (box.textContent || '').length;
    var sel = window.getSelection && window.getSelection();
    if (!sel || !sel.rangeCount) return total;
    var r = sel.getRangeAt(0);
    if (!box.contains(r.startContainer) && r.startContainer !== box) return total;
    try {
      var pre = r.cloneRange();
      pre.selectNodeContents(box);
      pre.setEnd(r.startContainer, r.startOffset);
      return pre.toString().length;
    } catch (e) { return total; }
  }
  // 文本偏移 → DOM 位置（文本节点 + 节点内偏移）
  function _ceLoc(box, pos) {
    var left = Math.max(0, pos | 0), found = null;
    (function walk(n) {
      for (var i = 0; i < n.childNodes.length; i++) {
        var c = n.childNodes[i];
        if (c.nodeType === 3) {
          var len = (c.nodeValue || '').length;
          if (left <= len) { found = { node: c, off: left }; return true; }
          left -= len;
        } else if (c.nodeType === 1) { if (walk(c)) return true; }
      }
      return false;
    })(box);
    return found || { node: box, off: box.childNodes.length };
  }
  function _cePlaceCaret(box, pos) {
    var p = _ceLoc(box, pos);
    try {
      var r = document.createRange();
      r.setStart(p.node, p.off); r.collapse(true);
      var s = window.getSelection();
      s.removeAllRanges(); s.addRange(r);
      box.focus();
    } catch (e) {}
  }
  function _ceSetRange(box, a, b) {
    var p = _ceLoc(box, a), q = _ceLoc(box, Math.max(a, b));
    try {
      var r = document.createRange();
      r.setStart(p.node, p.off); r.setEnd(q.node, q.off);
      var s = window.getSelection();
      s.removeAllRanges(); s.addRange(r);
      box.focus();
    } catch (e) {}
  }
  function _ceSelectAll(box) {
    try {
      var r = document.createRange();
      r.selectNodeContents(box);
      var s = window.getSelection();
      s.removeAllRanges(); s.addRange(r);
    } catch (e) {}
  }

  // 空／非空标记：**类挂两处**——原 input 上那份给 `:has(#messageInput.ce-empty)` 用
  // （composer 的发送键淡档），ce-box 上那份给 `::before` 占位符用（div 没有 ::placeholder）。
  // ⚠ 判据是 textContent 而不是 :empty：contenteditable 删干净后常留一枚 <br> 垫底，:empty 会当场失效。
  function _ceSyncEmpty(inp, box) {
    var empty = !(box.textContent || '').length;
    try { inp.classList.toggle('ce-empty', empty); box.classList.toggle('ce-empty', empty); } catch (e) {}
  }

  function ceConvert(inp) {
    if (_ceSkip(inp)) return;
    var isMulti = inp.tagName === 'TEXTAREA';
    // 原生值必须在装 value 代理之前抓（装了之后再读 .value 读到的就是新 box 的文本＝恒空）
    var preVal = inp.getAttribute('value');
    if (preVal === null && inp.value !== undefined) preVal = inp.value;
    inp.dataset.ceDone = '1';
    var origClass = inp.className || '';
    inp.classList.add('ce-ghost');
    inp.setAttribute('aria-hidden', 'true');
    inp.tabIndex = -1;                       // 幽灵不进 Tab 序（键盘/无障碍都走 ce-box）
    var box = document.createElement('div');
    box.className = 'ce-box ' + origClass + (isMulti ? ' ce-multi' : ' ce-one');
    box.setAttribute('contenteditable', 'true');
    box.setAttribute('spellcheck', 'false');
    box.dataset.for = inp.id || '';
    var inpMode = inp.getAttribute('inputmode');
    if (inpMode) box.setAttribute('inputmode', inpMode);
    var ech = inp.getAttribute('enterkeyhint');
    if (ech) box.setAttribute('enterkeyhint', ech);       // 聊天页那枚「发送」回车键
    var ph = inp.getAttribute('placeholder') || '';
    if (ph) box.setAttribute('data-ph', ph);
    box.style.display = 'block';
    box.style.boxSizing = 'border-box';
    if (!isMulti) box.style.minHeight = '24px';
    // 复制原 inline style（元素选择器上的 margin 之类转换后会丢；box 已自管的三件跳过）
    if (inp.getAttribute('style')) {
      var skip = ['display', 'min-height', 'box-sizing'];
      try {
        var st = inp.style;
        for (var si = 0; si < st.length; si++) {
          var pn = st[si];
          if (skip.indexOf(pn) >= 0) continue;
          var pv = st.getPropertyValue(pn);
          if (pv) box.style.setProperty(pn, pv);
        }
      } catch (e) {}
    }
    // 原输入框被业务按需隐藏（openModal 的 noInput 档就是这样）→ box 必须跟着隐藏，
    // 否则屏上多出一个空框。
    // ⚠ 两条路都要：① 属性观察器管 setAttribute('hidden')；② hidden 属性访问器管 `inp.hidden = true`
    //   ——访问器那一支是**同步**的，弹窗那种「设完 hidden 立刻显示遮罩」的时序里差一帧就会
    //   闪出一个空输入框（观察器是微任务，赶不上）。
    function syncCeHidden() { box.style.display = inp.hidden ? 'none' : 'block'; }
    try { new MutationObserver(syncCeHidden).observe(inp, { attributes: true, attributeFilter: ['hidden'] }); } catch (e) {}
    try {
      var hidDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hidden');
      if (hidDesc && hidDesc.get && hidDesc.set) {
        Object.defineProperty(inp, 'hidden', {
          get: function () { return hidDesc.get.call(inp); },
          set: function (v) { hidDesc.set.call(inp, v); syncCeHidden(); },
          configurable: true
        });
      }
    } catch (e) {}
    // maxlength：contenteditable 不原生生效，手动按码点截断（UTF-16 slice 会切开 emoji 代理对）
    function clamp() {
      var maxLen = parseInt(inp.getAttribute('maxlength'), 10) || 0;
      if (maxLen <= 0) return;
      var t = box.textContent || '';
      if (t.length <= maxLen) return;
      box.textContent = Array.from(t).slice(0, maxLen).join('');
      var r = document.createRange();
      r.selectNodeContents(box); r.collapse(false);
      var s = window.getSelection();
      s.removeAllRanges(); s.addRange(r);
    }
    box.addEventListener('input', clamp);
    box.addEventListener('compositionend', clamp);
    // 单行：Enter 不落换行（与原 input 一致）；群聊 @点名／回车发送都靠转发出去的 keydown
    if (!isMulti) box.addEventListener('keydown', function (e) { if (e.key === 'Enter') e.preventDefault(); });
    inp.__ceBox = box;
    box.__ceInp = inp;
    try { inp.parentNode.insertBefore(box, inp); } catch (e) {}
    // ===== 兼容代理：原代码怎么写，它还怎么读 =====
    Object.defineProperty(inp, 'value', {
      get: function () {
        if (isMulti) {
          try {
            var itTxt = box.innerText || '';
            var walkTxt = ceMultiText(box);
            var itN = (itTxt.match(/\n/g) || []).length;
            var wkN = (walkTxt.match(/\n/g) || []).length;
            return wkN > itN ? walkTxt : (itTxt || walkTxt || box.textContent || '');
          } catch (e) {}
        }
        return box.textContent || '';
      },
      set: function (v) { box.textContent = (v == null ? '' : String(v)); _ceSyncEmpty(inp, box); },
      configurable: true
    });
    Object.defineProperty(inp, 'placeholder', {
      get: function () { return box.getAttribute('data-ph') || ''; },
      set: function (v) { if (v) box.setAttribute('data-ph', v); else box.removeAttribute('data-ph'); },
      configurable: true
    });
    // 历史代码大量按 class 取输入框；转换后首个命中可能是继承同名类的 ce-box（div 没有 value）
    // ⇒ 给 box 也挂一份双向转发，旧写法零改动
    try {
      Object.defineProperty(box, 'value', {
        get: function () { return inp.value; },
        set: function (v) { inp.value = v; },
        configurable: true
      });
    } catch (e) {}
    // 光标三件（chat.js 的 @点名插字、cards/mate/invite/wish 的「打开即全选」）
    try {
      Object.defineProperty(inp, 'selectionStart', {
        get: function () { return _ceOffset(box); },
        set: function (v) { _cePlaceCaret(box, +v || 0); }, configurable: true
      });
      Object.defineProperty(inp, 'selectionEnd', {
        get: function () { return _ceOffset(box); },
        set: function (v) { _cePlaceCaret(box, +v || 0); }, configurable: true
      });
    } catch (e) {}
    inp.setSelectionRange = function (a, b) {
      if (a === undefined) return;
      if (b === undefined || b === a) _cePlaceCaret(box, a);
      else _ceSetRange(box, a, b);
    };
    inp.select = function () { _ceSelectAll(box); };
    // 聚焦：任何代码路径调 .focus() 都落在 ce-box 上（原 input 一次都没持过焦）
    inp.focus = function () { try { box.focus({ preventScroll: true }); } catch (e) { try { box.focus(); } catch (e2) {} } };
    inp.blur = function () { try { box.blur(); } catch (e) {} };
    // 事件转发（keydown 要带 key/keyCode/isComposing：回车发送与输入法选字都读它）
    // _ceChangeFired：这一轮聚焦里内核有没有自己派过 change——见下方失焦补派那一支。
    // ⚠ 实测（本仓量具 tools/_smoke_input_ce.js D4）：Chrome 对 contenteditable **会**在失焦时
    //   派一次 change，而某些内核（mochi 真机实录的小米/OPPO 一族）不派。两头发=业务收两次
    //   （设置页那些「change 就落库」的会存两遍），所以补派必须问一句「派过没」，永不重发。
    var _ceChangeFired = false;
    ['input', 'change', 'keydown', 'keyup', 'click', 'compositionstart', 'compositionend'].forEach(function (ev) {
      box.addEventListener(ev, function (e) {
        if (ev === 'change') _ceChangeFired = true;
        var clone = new Event(ev, { bubbles: true, cancelable: true });
        if (e.data !== undefined) clone.data = e.data;
        if (ev === 'keydown' || ev === 'keyup') {
          clone.key = e.key; clone.keyCode = e.keyCode; clone.isComposing = e.isComposing;
        }
        if (ev === 'input' && e.inputType !== undefined) clone.inputType = e.inputType;
        try { inp.dispatchEvent(clone); } catch (err) {}
      });
    });
    // 空／非空标记（CSS 侧：composer 的发送键淡档原来靠 :placeholder-shown，
    // 转换后原生 value 恒空＝那条恒真，见 css/input-ce.css 的同名镜像）
    box.addEventListener('input', function () { _ceSyncEmpty(inp, box); });
    // contenteditable 在部分内核上不自发 change（原生 input 会）——失焦时内容变过就补派一次，
    // 语义与原生一致；否则「改了但没存，退出即回默认」（设置页那一票全靠 change 落库）。
    // ⚠ 补派走 setTimeout(0) 且先问 _ceChangeFired：内核自己派过就不补（两发＝存两遍）。
    //    延迟到下一个宏任务跑，两种派发顺序（先 change 后 blur / 先 blur 后 change）都能被标记到。
    var changeVal = null;
    box.addEventListener('focus', function () { changeVal = box.textContent || ''; _ceChangeFired = false; });
    box.addEventListener('blur', function () {
      try {
        if (changeVal !== null && (box.textContent || '') !== changeVal) {
          changeVal = null;
          setTimeout(function () {
            var fired = _ceChangeFired;
            _ceChangeFired = false;
            if (fired) return;
            try { box.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
          }, 0);
          _ceSyncEmpty(inp, box);
          return;
        }
      } catch (e) {}
      changeVal = null;
      _ceChangeFired = false;
      _ceSyncEmpty(inp, box);
    });
    box.addEventListener('focus', function () { try { inp.dispatchEvent(new Event('focus', { bubbles: true })); } catch (e) {} });
    box.addEventListener('blur', function () { try { inp.dispatchEvent(new Event('blur', { bubbles: true })); } catch (e) {} });
    if (preVal) box.textContent = preVal;
    syncCeHidden();
    _ceSyncEmpty(inp, box);
  }

  function ceScan(root) {
    if (!root || root.nodeType !== 1) return;
    try {
      if (root.matches && root.matches(CE_SEL)) ceConvert(root);
      if (!root.querySelectorAll) return;
      var list = root.querySelectorAll(CE_SEL);
      for (var i = 0; i < list.length; i++) ceConvert(list[i]);
    } catch (e) {}
  }

  // ① 加载全量（脚本在 body 末尾 ⇒ DOM 已就绪）
  try {
    var all = document.querySelectorAll(CE_SEL);
    for (var i0 = 0; i0 < all.length; i0++) ceConvert(all[i0]);
  } catch (e) {}

  // ② 动态新增（只扫本批子树）
  try {
    new MutationObserver(function (muts) {
      for (var mi = 0; mi < muts.length; mi++) {
        var added = muts[mi].addedNodes;
        for (var ai = 0; ai < added.length; ai++) {
          var n = added[ai];
          if (n && n.nodeType === 1) ceScan(n);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  } catch (e) {}

  // ③ focus 原型层拦截：未转换的文本域被 focus() 时先同步转换再聚焦 ce-box
  var _origInpFocus = HTMLInputElement.prototype.focus;
  HTMLInputElement.prototype.focus = function () {
    if (this.__ceBox) { try { this.__ceBox.focus(); } catch (e) {} return; }
    if (!_ceSkip(this)) {
      ceConvert(this);
      if (this.__ceBox) { try { this.__ceBox.focus(); } catch (e) {} return; }
    }
    return _origInpFocus.apply(this, arguments);
  };
  var _origTaFocus = HTMLTextAreaElement.prototype.focus;
  HTMLTextAreaElement.prototype.focus = function () {
    if (this.__ceBox) { try { this.__ceBox.focus(); } catch (e) {} return; }
    if (!_ceSkip(this)) {
      ceConvert(this);
      if (this.__ceBox) { try { this.__ceBox.focus(); } catch (e) {} return; }
    }
    return _origTaFocus.apply(this, arguments);
  };

  // ④ focusin 捕获兜底：内核自己发起的聚焦（label 点击、表单定向）绕过 .focus()，
  //    这里当场把焦点移交给 ce-box——原 input 随即失焦，Chrome 收回那条条。
  document.addEventListener('focusin', function (e) {
    var t = e.target;
    if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
    if (t.__ceBox) { try { t.__ceBox.focus(); } catch (err) {} return; }
    if (_ceSkip(t)) return;
    ceConvert(t);
    if (t.__ceBox) { try { t.__ceBox.focus(); } catch (err) {} }
  }, true);
})();
