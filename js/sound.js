// ===== 音效：消息 / 通话音效播放 =====
// 支持「内置音效」（Web Audio 合成，无需音频文件）与「自定义音频」（音频文件的 dataURL）。
// 受浏览器自动播放策略限制，首次需用户交互后才能出声，属浏览器正常行为。

let _actx = null;
function _soundCtx() {
  if (!_actx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    _actx = new C();
  }
  if (_actx.state === 'suspended') { try { _actx.resume(); } catch {} }
  return _actx;
}

// iOS 适配：AudioContext 只能在用户手势内创建/恢复。用户进页面后第一件事若是收信/TA 回复
//（非手势时刻触发播放），此前 AudioContext 才第一次创建＝永久 suspended，之后所有音效全哑。
// 在首个手势里提前创建并 resume，把「解锁」从第一次播放挪到第一次触摸。
// #432 二批：补 pointerdown＝解锁再早半拍（按下即锁，不必等抬起），首次「点进入/点字卡」
// 当场就能出声；_soundCtx 是幂等单例，多绑一枚事件不会多建 context。
(function () {
  const unlock = () => { try { _soundCtx(); } catch (e) {} };
  ['pointerdown', 'pointerup', 'touchend', 'keydown'].forEach(ev =>
    window.addEventListener(ev, unlock, { once: true, capture: true }));
})();

// iOS 中断再配置：通话/后台会把已解锁的 context 重新 suspend。回前台时补一次 resume——
// 对「已解锁过」的 context，iOS 允许非手势时刻的 resume（解锁信用跨 suspension 保留）。
// 从未解锁过时这里拿着 null 什么都不做，不破坏上面的首次手势链。
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && _actx && _actx.state === 'suspended') { try { _actx.resume(); } catch (e) {} }
});

// 播放一段内置音效（Web Audio 合成）
function playTone(preset) {
  const ctx = _soundCtx(); if (!ctx) return;
  try {
    const sp = {
      ding: { f: 1047, dur: 0.22, type: 'sine' },
      pop:  { f: 1250, dur: 0.08, type: 'triangle' },
      note: { f: 659,  dur: 0.28, type: 'sine' },
      ring: { f: 784,  dur: 0.24, type: 'sine' }
    }[preset] || { f: 880, dur: 0.2, type: 'sine' };
    const now = ctx.currentTime;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = sp.type;
    osc.frequency.setValueAtTime(sp.f, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.4, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + sp.dur);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(now); osc.stop(now + sp.dur + 0.02);
    // 电话振铃：再接一个回声拍，更像来电铃声
    if (preset === 'ring') {
      const o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o2.type = 'sine'; o2.frequency.setValueAtTime(sp.f, now + 0.34);
      g2.gain.setValueAtTime(0.0001, now + 0.34);
      g2.gain.exponentialRampToValueAtTime(0.4, now + 0.36);
      g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.58);
      o2.connect(g2); g2.connect(ctx.destination);
      o2.start(now + 0.34); o2.stop(now + 0.6);
    }
  } catch {}
}

// 音效解析：联系人单独配置（data.chatSounds[chatId][key]）优先，无配置跟随全局 data.sounds。
// chatId 缺省=当前活跃会话；传 null 强制用全局（设置页试听全局用）
function _soundCfg(key, chatId) {
  const cid = (chatId === undefined) ? data.activeChat : chatId;
  const cs = (cid && data.chatSounds && data.chatSounds[cid]) || null;
  if (cs && cs[key] && typeof cs[key].on === 'boolean') return cs[key];
  return (data.sounds && data.sounds[key]) || { on: false, preset: 'ding', custom: '' };
}

// 播放一次音效（自定义音频优先级高于内置音效）
function playSound(key, chatId) {
  const s = _soundCfg(key, chatId);
  if (!s.on) return;
  if (s.custom) { try { const a = new Audio(s.custom); a.volume = 1; a.play().catch(() => {}); } catch {} return; }
  playTone(s.preset || 'ding');
}

// 联系人发来消息的提示音（chatId=消息所属会话，缺省当前会话）
function notifyPartnerMessage(chatId) { playSound('partnerMsg', chatId); }
// 我发出消息的提示音
function notifyMyMessage(chatId) { playSound('myMsg', chatId); }

// ===== 通话响铃（循环振铃）：开始 / 停止 =====
let _ringTimer = null, _ringAudio = null;
function startRing(chatId) {
  stopRing();
  const s = _soundCfg('incomingCall', chatId);
  if (!s.on) return;
  if (s.custom) {
    try {
      const a = new Audio(s.custom);
      a.loop = true;
      a.volume = 1;
      a.play().catch(() => {});
      _ringAudio = a;
      return;
    } catch { return; }
  }
  const cycle = () => {
    playTone('ring');
    _ringTimer = setTimeout(cycle, 1500);
  };
  cycle();
}
function stopRing() {
  if (_ringTimer) { clearTimeout(_ringTimer); _ringTimer = null; }
  if (_ringAudio) { try { _ringAudio.pause(); } catch {} _ringAudio = null; }
}

// ===== 游戏音效：实时合成，只报结果 =====
// 与上面的消息提示音分两套谱：那份的任务是「叮一下」提醒你回来有消息，这份要跟手上有轻重——
// 合并往上走一个音、全清三音上行、局终两音下行，不看屏幕也听得出自己刚做成了什么。
// 只报结果（用户定档）：滑动、点选、落子、塔自己长回来这些「每一下」一律不出声。
// 开关与音量刻意不进 data、不进备份：音量是这台设备上的手感，跟着备份导出跑到别人手机里会突然出声；
// 记 localStorage，与桌面美化台面板高矮（ordinal-desk-panel-h）同源。
const SFX_STORE_KEY = 'ordinal-game-sfx';
const SFX_DEF = { on: true, vol: 60 };
let _sfxCfg = null;

function gameSfxCfg() {
  if (_sfxCfg) return _sfxCfg;
  let o = {};
  try {
    const raw = JSON.parse(localStorage.getItem(SFX_STORE_KEY) || 'null');
    if (raw && typeof raw === 'object') o = raw;
  } catch {}
  let vol = Number(o.vol);
  if (!isFinite(vol)) vol = SFX_DEF.vol;
  _sfxCfg = { on: o.on !== false, vol: Math.max(0, Math.min(100, Math.round(vol))) };
  return _sfxCfg;
}
function setGameSfx(patch) {
  const c = gameSfxCfg();
  if (patch && typeof patch.on === 'boolean') c.on = patch.on;
  if (patch && patch.vol !== undefined) {
    const v = Number(patch.vol);
    if (isFinite(v)) c.vol = Math.max(0, Math.min(100, Math.round(v)));
  }
  try { localStorage.setItem(SFX_STORE_KEY, JSON.stringify(c)); } catch {}
  _sfxGainNow();
  return c;
}

// 独立总线：音量杆乘在这里，不动消息提示音那 0.4 的满幅（用户判过「不要并到聊天那套」）
let _sfxBus = null;
function _sfxBusGet() {
  const ctx = _soundCtx();
  if (!ctx) return null;
  if (!_sfxBus) { _sfxBus = ctx.createGain(); _sfxBus.connect(ctx.destination); }
  _sfxGainNow();
  return _sfxBus;
}
function _sfxGainNow() {
  if (!_sfxBus) return;
  const c = gameSfxCfg();
  try { _sfxBus.gain.value = c.on ? (c.vol / 100) * 0.5 : 0; } catch {}
}

// 谱：f=基准频率（Hz）、d=时长（秒）、t=波形、p=满幅、at=相对这一发起点的延时（秒）
const SFX_SPECS = {
  blend: [{ f: 660, d: 0.11, t: 'sine', p: 0.9 }, { f: 990, d: 0.07, t: 'triangle', p: 0.3, at: 0.012 }],
  clear: [{ f: 523, d: 0.12, t: 'sine', p: 0.8 }, { f: 659, d: 0.12, t: 'sine', p: 0.8, at: 0.09 }, { f: 784, d: 0.2, t: 'sine', p: 0.85, at: 0.18 }],
  mile:  [{ f: 523, d: 0.1, t: 'sine', p: 0.7 }, { f: 784, d: 0.1, t: 'sine', p: 0.75, at: 0.08 },
          { f: 1046, d: 0.12, t: 'sine', p: 0.8, at: 0.16 }, { f: 1568, d: 0.24, t: 'triangle', p: 0.35, at: 0.26 }],
  over:  [{ f: 392, d: 0.16, t: 'sine', p: 0.8 }, { f: 262, d: 0.34, t: 'sine', p: 0.85, at: 0.14 }],
  win:   [{ f: 659, d: 0.1, t: 'sine', p: 0.75 }, { f: 784, d: 0.1, t: 'sine', p: 0.8, at: 0.09 }, { f: 1175, d: 0.26, t: 'sine', p: 0.85, at: 0.18 }]
};
const SFX_SEMI = 12;                 // opts.step 的钳位：最多往上偏一个八度
const _sfxUnknown = {};              // 打错的音效名在这里留一手，探针据此判「调用点接上了但名字对不上谱表」
const _sfxLastAt = {};
let _sfxVoices = 0;
const SFX_MAX_VOICES = 6;            // 同一瞬最多几路：连锁合并几十发一起响只会变成噪声

function playSfx(name, opts) {
  const spec = SFX_SPECS[name];
  if (!spec) {
    if (!_sfxUnknown[name]) { _sfxUnknown[name] = 1; try { console.warn('[sfx] 未知音效名：' + name); } catch {} }
    return;
  }
  const c = gameSfxCfg();
  if (!c.on || c.vol <= 0) return;
  const o = opts || {};
  const now = Date.now();
  if (o.gated !== false && name === 'blend' && now - (_sfxLastAt[name] || 0) < 45) return;   // 连锁合并几十发一起响＝同一发 45ms 内只出一次
  _sfxLastAt[name] = now;
  const ctx = _soundCtx();
  const bus = _sfxBusGet();
  if (!ctx || !bus) return;
  const semi = Math.max(-SFX_SEMI, Math.min(SFX_SEMI, Number(o.step) || 0));
  const power = o.power != null ? Math.max(0, Math.min(1, Number(o.power))) : 1;
  const weak = o.weak ? 0.6 : 1;
  const t0 = ctx.currentTime;
  for (const n of spec) {
    if (_sfxVoices >= SFX_MAX_VOICES) break;
    const at = t0 + (n.at || 0);
    const peak = Math.max(0.0002, n.p * power * weak);
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = n.t;
    osc.frequency.setValueAtTime(_sfxHz(n.f, semi), at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + n.d);
    osc.connect(gain); gain.connect(bus);
    osc.start(at); osc.stop(at + n.d + 0.02);
    _sfxVoices++;
    setTimeout(() => { _sfxVoices--; }, ((n.at || 0) + n.d) * 1000 + 40);
  }
}
function _sfxHz(base, semi) { return base * Math.pow(2, semi / 12); }
// 试听一小段（设置页那一枚钮）：合并→全清→局终，三发各占一位，间隔给足耳朵反应。
// 关着的时候按它＝用户想听，就地开回来（调用方负责回显开关），不留一枚点了没反应的钮。
function gameSfxAudition() {
  if (!gameSfxCfg().on) setGameSfx({ on: true });
  playSfx('blend', { step: 0 });
  setTimeout(() => playSfx('clear'), 260);
  setTimeout(() => playSfx('over'), 700);
}
