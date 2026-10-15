// ===== 打电话模拟（小窗显示，接通/拒绝/未接/忙线） =====
// 每一通电话都有身份：_call.cid 在「发起/来电」那一刻定死，之后所有落库与屏上姓名只读它。
// 为什么必须记：data.messages 是 data.chats[activeChat].msgs 的活引用（chats.js 切会话当场重绑），
// 而通话的结算全在延迟回调里（主叫结果 2~5 秒、拒绝/未接/忙线再 +1.5 秒、来电振铃 8~15 秒、
// 「通话结束」＝你什么时候挂就什么时候写），小窗又浮在所有会话之上可以随便切页——
// 不记 cid 就会把 A 那通电话的话写进 B 的窗口（BUGS.md #156）。
let _call = null; // { cid, state:'calling'|'connected'|'ending'|'ring-inc', incoming, t0, timer, tick }
let _lastDragMoved = false;
// 小框长按挂断（那一枚上不挂图标）：按住 520ms 后松手即挂断，中途移开/提前松手＝取消
let _holdTimer = null, _holdX = 0, _holdY = 0, _holdFired = false;
function _holdStart(e) {
  if (!_call || e.target.closest('button')) return;
  _holdX = e.clientX; _holdY = e.clientY; _holdFired = false;
  const w = $('#callWindow'); if (w) w.classList.add('pressing');
  clearTimeout(_holdTimer);
  _holdTimer = setTimeout(() => { _holdTimer = null; _holdFired = true; _holdEnd(); endCall('user'); }, 520);
}
function _holdMove(e) {
  if (!_holdTimer) return;
  if (Math.abs(e.clientX - _holdX) > 8 || Math.abs(e.clientY - _holdY) > 8) _holdEnd();
}
function _holdEnd() {
  clearTimeout(_holdTimer); _holdTimer = null;
  const w = $('#callWindow'); if (w) w.classList.remove('pressing');
}

function _callFmt(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

// 按 settings 概率取通话结果（和为 0 时回退默认 60/15/15/10）
function _pickCallOutcome() {
  const cs = data.callSettings || defaults.callSettings;
  const w = [
    ['answer', Number(cs.answerProb) || 0],
    ['reject', Number(cs.rejectProb) || 0],
    ['miss', Number(cs.missProb) || 0],
    ['busy', Number(cs.busyProb) || 0]
  ];
  let sum = w.reduce((s, x) => s + x[1], 0);
  if (sum <= 0) { w[0][1] = 60; w[1][1] = 15; w[2][1] = 15; w[3][1] = 10; sum = 100; }
  let r = Math.random() * sum;
  for (const [n, p] of w) { r -= p; if (r < 0) return n; }
  return 'answer';
}

// 这一通的属主（cid 在发起/来电那一刻写死，之后只读它，不再问屏幕开着哪个会话）
function _callCid() { return (_call && _call.cid) || data.activeChat || ''; }
function _callOwner() { return (data.contacts || []).find(x => x.id === _callCid()) || null; }
// 屏上主语取「这一本」的名字：不是全局 profile（那是主联系人的镜像，#128 查过），
// 也不是此刻会话（切页就变）。人已不在通讯录时落回中性「TA」，不冒充此刻那位。
function _callName() { const c = _callOwner(); return (c && (c.chatName || c.name)) || 'TA'; }
function _callAvatarSrc() { const c = _callOwner(); return (c && (c.chatAvatar || c.avatar)) || ''; }

// 结算/状态那条系统小字：落进「这一通所属的那本会话」，不是当前开着的会话（BUGS.md #156）。
// call 字段＝这一条对应的通话结果 { outcome, durationMs }——文案与账解耦，改词不再打断历史折算。
function _callMsg(text, call) {
  const msg = { id: nextId(), from: 'system', text };
  if (call) msg.call = call;
  _deliverToChat(msg, _callCid());
}

// 接通语音字幕：播放专属语音时在小窗/全屏两个窗体同步显示这句语音的文字，传空串隐藏（minimax.js mmCallGreet 调用）
function _callGreetText(text) {
  const t = String(text || '');
  // 小框与全屏两处字幕都要拿到正文（曾经只写全屏那个，小窗容器空着却仍占位＝一枚空玻璃片）
  ['cfVoiceText', 'callVoiceText'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = t;
  });
  // 全屏字幕连声波一起收在 cfVoiceWrap 气泡里，小窗只有纯文字行
  ['cfVoiceWrap', 'cfVoiceText', 'callVoiceText'].forEach(id => {
    const n = document.getElementById(id);
    if (n) n.hidden = !t;
  });
}

// 记录一条通话到 data.calls：outcome 为 answer/reject/miss/busy/cancel，durationMs 为接通时长
// cid＝这一本会话（统计按人筛选靠它；旧记录没有这个键＝「那时还没记下是谁」，不猜归属）
function _recordCall(outcome, durationMs) {
  (data.calls = data.calls || []).push({
    id: nextId(),
    cid: _callCid(),
    outcome,
    durationMs: Math.max(0, Math.round(durationMs)),
    duration: _callFmt(durationMs),
    time: time(),
    date: new Date().toLocaleDateString('zh-CN')
  });
  // 通话＝一件事，喂给头像昵称那个事件驱动的热度（BUGS #179）；只算真正接通过的，
  // 没接通的拒绝/忙线不算「你们聊过」。归属是这一通的 cid（通话已有 cid，不落进此刻开着的会话）。
  if (outcome === 'answer' && typeof avlibFeed === 'function' && typeof AV_HEAT_CALL !== 'undefined') avlibFeed(_callCid(), AV_HEAT_CALL, 'call');
  save();
}

function _callSetStatus(text, cls) {
  const el = $('#callStatus');
  el.textContent = text;
  el.className = 'call-status' + (cls ? ' ' + cls : '');
  $('#callWindow').classList.toggle('connected', cls === 'connected');
  // 全屏页开着时同步那一行状态（呼叫结果文案要落在看得见的那一面；接通态该行已隐藏故不动）
  const cf = $('#cfStatus');
  if (cf && !cf.hidden && !$('#callFull').hidden) cf.textContent = text;
}

// 头像两面同涂：小框 #callAvatar 与全屏 #cfAvatar 必须一起写。
// 曾经只有主叫路径 _callOpen 填小框、来电的 cfOpen 只填全屏，于是来电后点「—」最小化＝一枚
// 空的磨砂玻璃盘（连默认人矢量图都没有，因为 innerHTML 从未被写过），见 BUGS.md #052。
// 无头像时给两处各挂 .no-avatar（2026-10-06 第四轮后它只剩「去影、留发丝圈」一件事：
// 那层浅底由内层 .initial-person 统一引 --well 供（css/call.css），外盘再刷白＝两块面叠着）。
function _paintCallAvatar() {
  const src = _callAvatarSrc();
  const html = avatarHTML(src);
  $('#callAvatar').innerHTML = html;
  $('#cfAvatar').innerHTML = html;
  const bare = !src;
  [$('#callWindow').querySelector('.cw-av-disc'), $('#callFull').querySelector('.cf-av-disc')]
    .forEach(d => { if (d) d.classList.toggle('no-avatar', bare); });
}

function _callOpen() {
  _paintCallAvatar();
  $('#callWindow').hidden = false;
}

function _callClose() {
  if (_call) { clearTimeout(_call.timer); clearInterval(_call.tick); _call = null; }
  stopRing();
  _holdEnd();
  $('#callWindow').hidden = true;
  // 全屏通话页一并收起：挂断走的是本函数，只藏小窗会把整页留在屏上
  // （_call 已清空，接听/最小化都被状态守卫挡住＝界面卡死，见 BUGS.md #016）
  const fullEl = $('#callFull');
  if (fullEl) { fullEl.hidden = true; fullEl.classList.remove('connected'); }
  // 通话结束：按设置恢复后台保活（若开启）
  try { if (data.appearance && data.appearance.bgKeepAlive) setBackgroundKeepAlive(true); } catch {}
  // 通话结束：仅当页面可见时恢复信箱后台轮询（不可见时交给 visibilitychange 机制处理）
  try { if (!document.hidden) { resumeWriteScheduler(); } } catch {}
  // 本次通话结束后，安排下一次联系人来电，避免下个轮询立刻再次触发
  _scheduleNextIncomingCall();
}

function startCall() {
  if (_call) return;
  const cs = data.callSettings || defaults.callSettings;
  _call = { cid: data.activeChat, state: 'calling', t0: 0, timer: null, tick: null };
  _callOpen();
  _callSetStatus('正在呼叫…', 'ringing');
  if (!window.__callHoldHinted) { window.__callHoldHinted = true; try { showToast('点小框看全屏 · 长按挂断'); } catch (e) {} }
  startRing(_call.cid);   // 来电/呼出铃声按这一本的联系人单独配置（sound.js _soundCfg 解析）
  const rMin = Math.max(1, Number(cs.ringMin) || 2), rMax = Math.max(rMin, Number(cs.ringMax) || 5);
  _call.timer = setTimeout(() => resolveCall(_pickCallOutcome()), (rMin + Math.random() * (rMax - rMin)) * 1000);
}

function resolveCall(outcome) {
  if (!_call || _call.state !== 'calling') return;
  stopRing();
  const nm = _callName();
  if (outcome === 'answer') {
    _callMsg(nm + ' 接通了');
    _enterConnected();
  } else {
    const map = { reject: [nm + ' 拒绝了', nm + ' 拒绝了你的通话'], miss: [nm + ' 没接', nm + ' 没接你的电话'], busy: [nm + ' 忙线中', nm + ' 忙线中，请稍后再试'] };
    const [txt, msg] = map[outcome];
    _call.state = 'ending';
    _callSetStatus(txt, outcome);
    _call.timer = setTimeout(() => { _callMsg(msg, { outcome, durationMs: 0 }); _recordCall(outcome, 0); _callClose(); }, 1500);
  }
}

// 进入已接通状态：启动计时 + 定时自动挂断（主叫/被叫共用）
function _enterConnected() {
  _call.state = 'connected';
  _call.t0 = Date.now();
  const full = !$('#callFull').hidden;
  if (full) cfSetConnected();
  else _callSetStatus('已接通 00:00', 'connected');
  // 缓存计时元素引用，避免每秒重复查询 DOM（长通话发热优化）
  const elFull = document.getElementById('callFull');
  const elCf = document.getElementById('cfStatus');
  const elTimer = document.getElementById('cfTimer');
  const elStatus = document.getElementById('callStatus');
  _call.tick = setInterval(() => {
    if (_call && _call.state === 'connected' && elCf && elStatus) {
      if (elFull && !elFull.hidden) {
        const d = _callFmt(Date.now() - _call.t0);
        if (elTimer && !elTimer.hidden) elTimer.textContent = d; else elCf.textContent = d;
      } else elStatus.textContent = '已接通 ' + _callFmt(Date.now() - _call.t0);
    }
  }, 1000);
  // 通话前台进行中：暂停后台保活禁音音频，避免持续解码发热（挂断时按开关恢复）
  try { setBackgroundKeepAlive(false); } catch {}
  // 长通话发热优化：通话期间暂停信箱等 30s 后台轮询，挂断后按页面状态恢复
  try { pauseWriteScheduler(); } catch {}
  const cs = data.callSettings || defaults.callSettings;
  if (!cs.noAutoHangup) {
    const cMin = Math.max(1, Number(cs.callMinLen) || 1), cMax = Math.max(cMin, Number(cs.callMaxLen) || 5);
    _call.timer = setTimeout(() => endCall('auto'), (cMin + Math.random() * (cMax - cMin)) * 60000);
  }
  // 接通语音：按概率随机播一条这一本联系人的专属语音字卡（设置-通话可关，见 minimax.js）
  // cid 显式传进去：延迟 600ms 里用户可能已经切走会话，不传就会念出别人的声音
  if (typeof mmCallGreet === 'function') { const at = _call.cid; setTimeout(() => { if (_call && _call.state === 'connected') mmCallGreet(at); }, 600); }
}

function endCall() {
  if (!_call) return;
  const connected = _call.state === 'connected';
  const durMs = connected ? Date.now() - _call.t0 : 0;
  const dur = _callFmt(durMs);
  const nm = _callName();
  clearTimeout(_call.timer); clearInterval(_call.tick);
  if (typeof mmStop === 'function') { try { mmStop(); } catch (e) {} }   // 挂断即停接通语音/朗读
  if (typeof _callGreetText === 'function') { try { _callGreetText(''); } catch (e) {} }   // 挂断清字幕
  const outcome = connected ? 'answer' : 'cancel';
  _recordCall(outcome, durMs);
  _callMsg(connected ? ('与 ' + nm + ' 的通话 · ' + dur) : ('你取消了给 ' + nm + ' 的呼叫'), { outcome, durationMs: durMs });
  _callClose();
}

// 全屏通话页收起 → 落回小框（同一个 #callWindow）
function cfMinimize() {
  if (!_call) return;
  $('#callFull').hidden = true;
  $('#callWindow').hidden = false;
  $('#callWindow').classList.toggle('connected', _call.state === 'connected');
  if (_call.state === 'connected') _callSetStatus('已接通 ' + _callFmt(Date.now() - _call.t0), 'connected');
}
// 点小框 → 展开全屏（主叫/来电都能进，按当前状态重画那一面）
function expandCall() {
  if (!_call) return;
  if (_call.state === 'connected') cfSetConnected();
  else if (_call.incoming) cfOpen();
  else cfOpenOutgoing();
  $('#callFull').hidden = false;
  $('#callWindow').hidden = true;
}

// 小窗拖动
function _drag(el, target) {
  if (!el) return;
  let sx = 0, sy = 0, ox = 0, oy = 0, on = false;
  el.addEventListener('pointerdown', e => {
    // 仅跳过内部按钮（如小窗上的挂断红点），避免拖到按钮时误拖动
    const hit = e.target.closest('button');
    if (hit && hit !== el) return;
    on = true;
    _lastDragMoved = false;
    sx = e.clientX; sy = e.clientY;
    const r = target.getBoundingClientRect();
    ox = r.left; oy = r.top;
    target.style.transform = 'none';
    target.style.right = 'auto';
    target.style.left = ox + 'px';
    target.style.top = oy + 'px';
    try { el.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
  });
  el.addEventListener('pointermove', e => {
    if (!on) return;
    if (Math.abs(e.clientX - sx) > 6 || Math.abs(e.clientY - sy) > 6) _lastDragMoved = true;
    const x = Math.max(4, Math.min(window.innerWidth - target.offsetWidth - 4, ox + e.clientX - sx));
    const y = Math.max(4, Math.min(window.innerHeight - target.offsetHeight - 4, oy + e.clientY - sy));
    target.style.left = x + 'px';
    target.style.top = y + 'px';
  });
  const up = () => { on = false; };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

$('#callBtn').onclick = startCall;
$('#callWindow').addEventListener('pointerdown', _holdStart);
$('#callWindow').addEventListener('pointermove', _holdMove);
window.addEventListener('pointerup', _holdEnd);
window.addEventListener('pointercancel', _holdEnd);
$('#callWindow').addEventListener('click', () => {
  if (_lastDragMoved) { _lastDragMoved = false; return; }
  if (_holdFired) { _holdFired = false; return; }
  expandCall();
});
_drag($('#callWindow'), $('#callWindow'));

// ============================ 来电：联系人主动打给我 ============================

// 全屏通话页显示来电：头像 / 名字 / 状态
function cfOpen() {
  $('#cfName').textContent = _callName();
  _paintCallAvatar();
  const st = $('#cfStatus');
  st.hidden = false;
  st.textContent = '邀请你语音通话';
  const tm = $('#cfTimer');
  if (tm) { tm.hidden = true; tm.textContent = '00:00'; }
  $('#callFull').classList.remove('connected');
  $('#cfActionsIncoming').hidden = false;
  $('#cfActionsConnected').hidden = true;
  $('#callFull').hidden = false;
  $('#callWindow').hidden = true;
}
// 主叫全屏页（点小框展开）：呼叫中＝状态行 + 一枚「取消」，接通后由 cfSetConnected 接管
function cfOpenOutgoing() {
  $('#cfName').textContent = _callName();
  _paintCallAvatar();
  const st = $('#cfStatus');
  st.hidden = false;
  st.textContent = $('#callStatus').textContent || '正在呼叫…';
  const tm = $('#cfTimer');
  if (tm) tm.hidden = true;
  $('#callFull').classList.remove('connected');
  $('#cfActionsIncoming').hidden = true;
  $('#cfEndBtn').querySelector('.cf-lb').textContent = '取消';
  $('#cfActionsConnected').hidden = false;
  $('#callFull').hidden = false;
}
// 接通后：隐藏接听/拒绝与状态行，换成卡里那一行计时 + 挂断（重复调用＝按当前时长重画，供小框再展开时用）
function cfSetConnected() {
  $('#cfActionsIncoming').hidden = true;
  $('#cfActionsConnected').hidden = false;
  $('#cfStatus').hidden = true;
  $('#cfEndBtn').querySelector('.cf-lb').textContent = '挂断';
  const tm = $('#cfTimer');
  if (tm) {
    tm.hidden = false;
    tm.textContent = _call && _call.state === 'connected' ? _callFmt(Date.now() - _call.t0) : '00:00';
  }
  $('#callFull').classList.add('connected');
}
function cfClose() {
  $('#callFull').hidden = true;
}

// 排下一次来电时间（按来电间隔最小/最大分钟数）
function _scheduleNextIncomingCall() {
  const cs = data.callSettings || defaults.callSettings;
  const min = Math.max(1, Math.min(1440, Number(cs.incomingMin) || 60));
  const max = Math.max(min, Math.min(1440, Number(cs.incomingMax) || 180));
  data._nextIncomingCallAt = Date.now() + (min + Math.random() * (max - min)) * 60000;
  save();
}

// 调度 tick（由信箱/推送的 30s 轮询调用）：到点触发一次来电
function maybeTriggerIncomingCall() {
  if (!isSchedulerLeader()) return;
  const cs = data.callSettings || defaults.callSettings;
  if (cs.incomingEnable === false) {
    if (typeof data._nextIncomingCallAt === 'number') { data._nextIncomingCallAt = undefined; save(); }
    return;
  }
  // FIX 2026-09-03 #026 未排期（含 0/undefined）或排期已过期超过宽限期（息屏冻结/导入旧备份）：
  // 重新排期而不是立即触发，避免冷启动/回前台瞬间弹出全屏来电
  const nextAt = typeof data._nextIncomingCallAt === 'number' ? data._nextIncomingCallAt : 0;
  if (!nextAt || Date.now() - nextAt > _SCHED_GRACE_MS) {
    _scheduleNextIncomingCall();
    return;
  }
  if (Date.now() < nextAt) return;
  // 夜间免打扰开着：到点也不打来，只照他的区间推后（闸放在【真到点】这一刻，不在每一跳都重排＝
  // 否则整夜每 30 秒写一次库；也让「早上不补」自然成立——那一格只是被推到了未来，BUGS #306）
  if (typeof nightOn === 'function' && nightOn()) { _scheduleNextIncomingCall(); return; }
  // 有通话正在进行：顺延，避免打断
  if (_call) { _scheduleNextIncomingCall(); return; }
  data._nextIncomingCallAt = undefined;
  save();
  triggerIncomingCall();
}

// 真正弹出一次来电
function triggerIncomingCall() {
  if (_call) { _scheduleNextIncomingCall(); return; }
  const cs = data.callSettings || defaults.callSettings;
  _call = { cid: data.activeChat, state: 'ring-inc', incoming: true, t0: 0, timer: null, tick: null };
  cfOpen();
  startRing(_call.cid); // 来电振铃音效（循环，直到接听/拒绝/超时；按这一本的联系人单独配置）
  // 系统通知（切后台那一族，BUGS #164）：页面在后台时全屏那一页没人看得见，这一发就是唯一的入口。
  // 引擎里那串 force＋callAlert（不吃合并开关·带长震动·不点不消失＋renotify）从上线起没人调过，本批接上。
  // 人在前台时引擎自己记「已看」就 return——那一发由来电整页承担，不重复响
  if (typeof bgNotifyCheck === 'function') {
    bgNotifyCheck(_callName() + ' 来电了', Date.now(), {
      name: _callName() + '来电',
      av: _callAvatarSrc(),
      avFixed: true,        // 按这一通所属那位自己的头像，不兜全局镜像（#156 同口径）
      force: true,
      callAlert: true,
      callTag: _callName(),
      cid: _call.cid,
      kind: 'call'
    });
  }
  const rMin = Math.max(2, Number(cs.incomingRingMin) || 8);
  const rMax = Math.max(rMin, Number(cs.incomingRingMax) || 15);
  _call.timer = setTimeout(() => finishIncoming('miss'), (rMin + Math.random() * (rMax - rMin)) * 1000);
}

// 接听
function answerIncoming() {
  if (!_call || _call.state !== 'ring-inc') return;
  stopRing();
  cfSetConnected(); // 全屏切到已接通（计时 + 挂断）
  _callMsg('你接听了 ' + _callName() + ' 的来电');
  _enterConnected();
}

// 拒绝
function rejectIncoming() {
  if (!_call || _call.state !== 'ring-inc') return;
  stopRing();
  _call.state = 'ending';
  cfClose();
  const nm = _callName();
  _recordCall('reject', 0);
  _callMsg('你拒绝了 ' + nm + ' 的来电', { outcome: 'reject', durationMs: 0 });
  _callClose();
}

// 超时未接
function finishIncoming(outcome) {
  if (!_call || _call.state !== 'ring-inc') return;
  stopRing();
  _call.state = 'ending';
  cfClose();
  const nm = _callName();
  const rec = outcome === 'miss' ? 'miss' : 'cancel';
  _recordCall(rec, 0);
  _callMsg(outcome === 'miss' ? (nm + ' 的来电没接') : (nm + ' 的来电已结束'), { outcome: rec, durationMs: 0 });
  _callClose();
}

$('#cfAnswerBtn').addEventListener('click', answerIncoming);
$('#cfRejectBtn').addEventListener('click', rejectIncoming);
$('#cfEndBtn').addEventListener('click', () => endCall('user'));
$('#cfMinBtn').addEventListener('click', cfMinimize);
