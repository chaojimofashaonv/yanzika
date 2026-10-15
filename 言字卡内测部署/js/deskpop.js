// ===== 桌面前台弹窗（参考 mochi desk-msg）：前台收到新消息/来信时顶部横幅，最多两行并列 =====
// 不同来源各占一行互不遮挡（新行插最上、第三条挤掉最旧一行）；同一来源（uid 相同）的新消息
// 原地更新所在行不重复占位。每行独立 6 秒自动收起、点击直达、右滑/拖拽关闭。
// 页面在后台不弹（系统通知走 bgNotifyCheck 通道）；全屏弹层在位时让路；用户走进某会话时该会话的横幅立即收起。

// 行数可在设置-提醒切换（appearance.deskPopRows：1=单行后来的顶掉先来的，2=两行并行）；开关默认开
function _deskPopMax() {
  try { return (data.appearance && data.appearance.deskPopRows === 1) ? 1 : 2; } catch (e) { return 2; }
}
let _deskPopItems = [];        // 可见横幅状态：[{ el, uid, action, timer, suppressClick, suppressTimer, drag }]，最新在前
let _deskPopDragging = null;   // 当前拖拽中的横幅（窗口级 touchmove/mousemove 路由用）

function deskPopEnabled() {
  try { return data.appearance.deskPopup !== false; } catch (e) { return true; }
}

// 全屏弹层在位时让路（写信/拍一拍/搜索/添加会话等遮罩打开时横幅会压在弹层上，直接不弹）
function _deskPopLayerBusy() {
  if (['letterModalMask', 'letterViewMask', 'pokeMask', 'searchMask', 'askMask', 'addChatMask', 'chatFormMask', 'apSheetMask', 'cardsAddMask', 'avInviteMask', 'avImprMask'].some(id => {
    const el = document.getElementById(id);
    return el && !el.hidden;
  })) return true;
  const gate = document.getElementById('ageGate');   // 18 岁门用 .on 类显隐（非 hidden 属性）
  return !!(gate && gate.classList.contains('on'));
}

// 预览文本清洗：dataURL→占位、语音卡取名、超长截断（mochi 同口径 40 字）
function _deskPopCleanText(t) {
  let s = String(t || '');
  if (/^data:[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+;base64,/i.test(s)) return '[图片]';
  if (/data:[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+;base64,/i.test(s)) s = s.replace(/data:[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, '[附件]');
  if (s.indexOf('|||') >= 0) s = s.split('|||')[0].replace(/\.[^.]+$/, '').trim() || '[语音]';
  if (s.length > 40) s = s.slice(0, 40) + '…';
  return s;
}

function _deskPopRecOf(el) { return _deskPopItems.find(r => r.el === el) || null; }

function _deskPopFill(rec, opts) {
  const text = _deskPopCleanText(opts.text);
  rec.el.querySelector('.desk-pop-name').textContent = opts.name || partnerName();
  rec.el.querySelector('.desk-pop-av').innerHTML = avatarHTML(opts.avatar || '');
  const txt = rec.el.querySelector('.desk-pop-text');
  const im = rec.el.querySelector('.desk-pop-img');
  if (opts.img) {
    im.src = opts.img;
    im.hidden = false;
    if (text) { txt.hidden = false; txt.textContent = text; } else { txt.hidden = true; txt.textContent = ''; }
  } else {
    im.removeAttribute('src');
    im.hidden = true;
    txt.hidden = false;
    txt.textContent = text;
  }
}

function _deskPopDismiss(rec, quick) {
  const i = _deskPopItems.indexOf(rec);
  if (i < 0) return;
  _deskPopItems.splice(i, 1);
  clearTimeout(rec.timer);
  if (rec.suppressTimer) clearTimeout(rec.suppressTimer);
  rec.action = null;
  rec.drag = null;
  if (_deskPopDragging === rec) _deskPopDragging = null;
  const el = rec.el;
  if (quick) { el.remove(); return; }
  el.classList.add('desk-pop-out');
  setTimeout(() => el.remove(), 180);
}

// opts: { uid, name, avatar, text, img, onClick, views }
// uid=来源标识（如 'chat:c0'/'mailbox'）：相同 uid 原地更新所在行；views=数组，当前 body[data-view] 在其中时不弹
function showDeskPopup(opts) {
  opts = opts || {};
  const text = _deskPopCleanText(opts.text);
  if (!text && !opts.img) return;
  if (document.hidden) return;
  if (!deskPopEnabled()) return;
  const v = document.body.dataset.view || '';
  if (opts.views && opts.views.includes(v)) return;
  if (_deskPopLayerBusy()) return;
  const wrap = $('#deskPopWrap');
  if (!wrap) return;
  const uid = opts.uid || '';
  let rec = uid ? _deskPopItems.find(r => r.uid === uid) : null;
  if (rec) {
    _deskPopFill(rec, opts);
  } else {
    if (_deskPopItems.length >= _deskPopMax()) _deskPopDismiss(_deskPopItems[_deskPopItems.length - 1], true);
    rec = { el: document.createElement('div'), uid, action: null, timer: null, suppressClick: false, suppressTimer: null, drag: null };
    rec.el.className = 'desk-pop';
    rec.el.innerHTML = '<div class="desk-pop-av"></div><div class="desk-pop-main"><div class="desk-pop-name"></div><div class="desk-pop-text"></div><img class="desk-pop-img" alt="" hidden></div><button type="button" class="desk-pop-close" aria-label="关闭"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M2.7 2.7l6.6 6.6M9.3 2.7l-6.6 6.6"/></svg></button>';
    _deskPopFill(rec, opts);
    wrap.prepend(rec.el);
    _deskPopItems.unshift(rec);
  }
  rec.action = (typeof opts.onClick === 'function') ? opts.onClick : (() => { if (v !== 'chat') showView('chat'); });
  clearTimeout(rec.timer);
  rec.timer = setTimeout(() => _deskPopDismiss(rec), 6000);
}

function hideDeskPopup() {
  _deskPopItems.slice().forEach(r => _deskPopDismiss(r, true));
}

// 行数设置切到 1 行后立即收缩存量横幅（只留最新一条），不必等 6 秒自动收起
function deskPopEnforceMax() {
  while (_deskPopItems.length > _deskPopMax()) _deskPopDismiss(_deskPopItems[_deskPopItems.length - 1], true);
}
window.deskPopEnforceMax = deskPopEnforceMax;

// 用户走进某个会话＝这个会话的消息已经看得见了，属于它的横幅当场收起（BUGS #028）：
// 否则横幅会压在刚打开的对话上继续挂满 6 秒。只收这一条来源，别的会话/来信横幅不动。
function deskPopDismissChat(chatId) {
  const uid = 'chat:' + chatId;
  _deskPopItems.slice().forEach(r => { if (r.uid === uid) _deskPopDismiss(r, true); });
}
window.deskPopDismissChat = deskPopDismissChat;

// 右滑/拖拽关闭：位移>30px 或速度>0.6px/ms 判关闭，否则弹回（mochi 同款参数）
function _deskPopDragStart(x, y, el) {
  const rec = _deskPopRecOf(el);
  if (!rec) return;
  rec.drag = { x, y, moved: false, speed: 0, lastX: x, lastT: Date.now() };
  rec.el.style.transition = 'none';
  _deskPopDragging = rec;
}
function _deskPopDragMove(x, y) {
  const rec = _deskPopDragging;
  if (!rec) return false;
  const el = rec.el;
  const d = rec.drag;
  if (!el.isConnected || !d) { _deskPopDragging = null; return false; }
  const dx = x - d.x, dy = y - d.y;
  const now = Date.now();
  if (now - d.lastT >= 60) {
    d.speed = (x - d.lastX) / (now - d.lastT);
    d.lastX = x;
    d.lastT = now;
  }
  if (Math.abs(dx) > 4 && Math.abs(dx) > Math.abs(dy) * 1.2) {
    el.style.transform = 'translateX(' + dx + 'px) scale(' + Math.max(0.92, 1 - Math.abs(dx) / 500) + ')';
    el.style.opacity = String(Math.max(0, 1 - Math.abs(dx) / 140));
    d.moved = true;
    return true;
  }
  return false;
}
function _deskPopDragEnd(x) {
  const rec = _deskPopDragging;
  if (!rec) return;
  _deskPopDragging = null;
  const d = rec.drag;
  rec.drag = null;
  if (!d) return;
  const el = rec.el;
  const dx = x - d.x;
  const wasMoved = d.moved;
  const speed = d.speed || 0;
  if (!wasMoved || !el.isConnected) return;
  rec.suppressClick = true;
  clearTimeout(rec.suppressTimer);
  rec.suppressTimer = setTimeout(() => { rec.suppressClick = false; }, 350);
  if (Math.abs(dx) > 30 || Math.abs(speed) > 0.6) {
    rec.suppressClick = false;
    clearTimeout(rec.suppressTimer);
    el.style.transition = 'transform .18s ease, opacity .18s ease';
    el.style.transform = 'translateX(' + (dx >= 0 ? 160 : -160) + 'px)';
    el.style.opacity = '0';
    setTimeout(() => _deskPopDismiss(rec, true), 180);
  } else {
    el.style.transition = 'transform .25s cubic-bezier(.25,.8,.35,1), opacity .25s ease';
    el.style.transform = ''; el.style.opacity = '';
    setTimeout(() => { el.style.transition = ''; }, 260);
  }
}

// 只在手指真按住横幅那一段挂这条监听。常驻的非 passive touchmove 会让 Chrome 把滚动从合成器交回主线程，
// 于是全应用每一跳滑动都得等主线程空下来——开屏读条款时应用正在同一条线程上开机，症状就是「莫名其妙卡一下」。
const _deskPopOnTouchMove = e => {
  if (!_deskPopDragging) return;
  const t = e.touches && e.touches[0];
  if (t && _deskPopDragMove(t.clientX, t.clientY)) { try { e.preventDefault(); } catch (err) {} }
};
const _deskPopBindMove = () => window.addEventListener('touchmove', _deskPopOnTouchMove, { passive: false });
const _deskPopUnbindMove = () => window.removeEventListener('touchmove', _deskPopOnTouchMove);

(function () {
  const wrap = $('#deskPopWrap');
  if (!wrap) return;
  wrap.addEventListener('click', e => {
    const el = e.target.closest('.desk-pop');
    if (!el) return;
    const rec = _deskPopRecOf(el);
    if (!rec) return;
    if (e.target.closest('.desk-pop-close')) { _deskPopDismiss(rec, true); return; }
    if (rec.suppressClick) { rec.suppressClick = false; return; }
    const action = rec.action;
    _deskPopDismiss(rec, true);
    if (action) action();
  });
  wrap.addEventListener('touchstart', e => {
    const t = e.touches && e.touches[0];
    const el = e.target.closest('.desk-pop');
    if (t && el) { _deskPopDragStart(t.clientX, t.clientY, el); if (_deskPopDragging) _deskPopBindMove(); }
  }, { passive: true });
  const endTouch = e => {
    _deskPopUnbindMove();
    const c = e.changedTouches && e.changedTouches[0];
    _deskPopDragEnd(c ? c.clientX : 0);
  };
  window.addEventListener('touchend', endTouch);
  window.addEventListener('touchcancel', endTouch);
  wrap.addEventListener('mousedown', e => {
    const el = e.target.closest('.desk-pop');
    if (el) _deskPopDragStart(e.clientX, e.clientY, el);
  });
  window.addEventListener('mousemove', e => { if (_deskPopDragging) _deskPopDragMove(e.clientX, e.clientY); });
  window.addEventListener('mouseup', e => { if (_deskPopDragging) _deskPopDragEnd(e.clientX); });
})();

window.showDeskPopup = showDeskPopup;
window.hideDeskPopup = hideDeskPopup;
