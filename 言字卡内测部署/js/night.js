// ===== 夜间免打扰（2026-10-12 落地，BUGS #306）=====
// 一件只有一层意思的事：夜里那一档（23:00–07:00）到了，TA 会不会自己冒出来。
// 拦法＝**到点不掷**：闸只写在「即将掷出去」那一刻（js/chat.js 的 _activeSendTick、js/call.js 的
// maybeTriggerIncomingCall），那一格照常按他自己的区间推回未来，屏上就是「TA 今晚没说那句」——
// 不攒账、早上不补（用户定档：让它过去）。不在投递口拦也不在渲染口藏：那会留下「已生成但没送到」
// 或「库里有一条屏上没有」的半截账。
// 只管【TA 主动】那两条：你回一句话之后 TA 的那一轮、你寄出去的信的到站时刻，都不在这条链上。
// 时间窗写死不可调（用户定档）：少一格能调错的东西，屏上那句「23:00–07:00」就是这里这两个数。
const NIGHT_FROM_HOUR = 23, NIGHT_TO_HOUR = 7;
// 那一问只属于「夜里刚开头」那两个小时：夜里 1 点以后才第一次打开应用＝不补问
// （否则早上 6 点会弹一句「要不要开启，到 7 点自动解除」——那一问已经没有意义）
const NIGHT_ASK_GRACE_HOUR = 2;
const NIGHT_MODES = ['ask', 'auto', 'off'];
const NIGHT_MODE_LABEL = { ask: '每晚问我', auto: '到点自动开', off: '不用了' };
const NIGHT_DEFAULT = { mode: 'ask', on: false, by: '', askedDay: '' };

// 只有这一个写手：三档由设置页 chips 与弹窗里那枚「别再问我」共同走它。
// 切到 'off' 连 on 一起清——留着 on 就是「屏上写着不用了、消息照样被拦」的假话
function setNightMode(mode) {
  const s = nightCfg();
  if (!s || NIGHT_MODES.indexOf(mode) < 0) return null;
  s.mode = mode;
  if (mode === 'off') { s.on = false; s.by = ''; }
  return s;
}
// data 还没就位（启动前的顶层调用）就返回 null，不在那一瞬往 data 上挂东西——
// 本仓 #296 那一批就是加载期摸 data 把整条启动链炸断的，同一课防一手
function nightCfg() {
  if (typeof data === 'undefined' || !data || typeof data !== 'object') return null;
  if (!data.night || typeof data.night !== 'object' || Array.isArray(data.night)) {
    data.night = JSON.parse(JSON.stringify(NIGHT_DEFAULT));
  }
  return data.night;
}
// 跨零点天然成立：h >= 23 或 h < 7（与 js/avatarlib.js 的 _avQuietNow 同一把写法）
function nightWindow(d) {
  const h = (d ? new Date(d) : new Date()).getHours();
  return h >= NIGHT_FROM_HOUR || h < NIGHT_TO_HOUR;
}
// 此刻生不生效果＝「账上开着」且「确实在夜里那一档」。两道都要：应用整晚关着、早上九点才打开，
// 也不该因为「昨晚的 on 还躺在账上」而继续拦着——出窗口的判据不依赖某一次 tick 正好落在 07:00
function nightOn(d) {
  const s = nightCfg();
  return !!(s && s.on === true && nightWindow(d));
}
// 「今夜」归属哪一天：夜里 0~6 点仍算前一天那一夜，否则同一晚会在 23 点与 0 点各问一次
function nightNightKey(d) {
  let t = d ? new Date(d) : new Date();
  if (t.getHours() < NIGHT_TO_HOUR) t = new Date(t.getTime() - 86400000);
  return t.getFullYear() + '-' + (t.getMonth() + 1) + '-' + t.getDate();
}
// 那一问属于自己的时间段：起点对面那两个小时（23:00–00:59）
function nightAskWindow(d) {
  const h = (d ? new Date(d) : new Date()).getHours();
  return h >= NIGHT_FROM_HOUR || h < (NIGHT_FROM_HOUR + NIGHT_ASK_GRACE_HOUR) % 24;
}
// 屏上那一行读数（设置页那一行与卡头摘要共用，文案只在这里有一份）
function nightStatusText(d) {
  const s = nightCfg();
  if (!s) return '';
  if (s.mode === 'off') return '不用了';
  const win = NIGHT_FROM_HOUR + ':00–' + _nightPad(NIGHT_TO_HOUR) + ':00';
  if (nightOn(d)) return '开着 · 早上 ' + NIGHT_TO_HOUR + ' 点自动解除';
  return '没开 · 夜里 ' + win + (s.mode === 'auto' ? '自动开启' : '问一次');
}
function _nightPad(n) { return (n < 10 ? '0' : '') + n; }

function _nightTurnOn(by) {
  const s = nightCfg();
  if (!s || s.on) return;
  s.on = true; s.by = by;
  if (typeof save === 'function') save();
}
// 那一问：全站唯一那份弹层壳（window.openModal，#288 起兼确认框），三个出口各一条回路。
// 「别再问我」＝就地切成 off——按既有口径「提醒要可执行」，能当场办掉的事不让人再去设置里找。
function _nightAsk() {
  if (typeof openModal !== 'function') return;
  openModal('夜里免打扰', '', () => {
    _nightTurnOn('auto');
    if (typeof showToast === 'function') showToast('已开启 · 早上 ' + NIGHT_TO_HOUR + ' 点自动解除');
  }, {
    noInput: true,
    staticText: '现在夜里 ' + NIGHT_FROM_HOUR + ' 点了。要不要开启夜间免打扰——到早上 ' + NIGHT_TO_HOUR + ' 点之前，TA 不会主动发消息、也不会主动打来；早上 ' + NIGHT_TO_HOUR + ' 点自动解除。',
    okText: '开启',
    midBtn: { label: '别再问我', onPick: () => { setNightMode('off'); if (typeof renderNightSettings === 'function') renderNightSettings(); } },
    onCancel: () => {}
  });
}

// 30 秒一跳（挂在信箱那条公共调度 js/mailbox.js 的 _mailboxTick 上，不新开一条定时器）
function nightTick(now) {
  const s = nightCfg();
  if (!s || typeof save !== 'function') return;
  if (typeof isSchedulerLeader === 'function' && !isSchedulerLeader()) return;
  const d = now ? new Date(now) : new Date();
  if (!nightWindow(d)) {
    // 出窗口＝解除。只解除「由夜里这一档置开」的那一态（本函数没有手动写手，by==='manual' 走不到，
    // 这道判据是给日后真加一枚手动钮的人留的：他自己开的，早上不该悄悄关掉）
    if (s.on && s.by !== 'manual') { s.on = false; s.by = ''; save(); }
    return;
  }
  if (s.on) return;
  if (s.mode === 'off') return;
  if (s.mode === 'auto') { _nightTurnOn('auto'); return; }
  if (!nightAskWindow(d)) return;                      // 夜里 1 点以后才见到这一晚＝不补问
  if (s.askedDay === nightNightKey(d)) return;         // 今晚问过了（答过／没答／关掉都算问过）
  if (typeof document !== 'undefined' && document.hidden) return;   // 后台弹了也没人看得见，留给下一次前台那一跳
  s.askedDay = nightNightKey(d);   // 先记账再弹：没答就刷新／切走，也不会同一晚被问第二遍（「每晚一次」是承诺）
  save();
  _nightAsk();
}
