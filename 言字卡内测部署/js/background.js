(function () { try {
(function () {
const GNS = '';
const store = { get: function () { return null; } };
// ===== 本机小件库（自定义保活音频∶心跳∶通知点击回执）=====
// 这几件原本住在 js/music.js 的 IIFE 里（播放器下线后全仓只剩本模块在读），故整层搬到这里＝一处只有一份实现。
// 库名由 ordinal-music-db 换成 ordinal-keep-db：一次性搬家只捞用户上传的那枚自定义保活音频，
// 旧库整个删掉＝播放器存的那些音频文件随之抹净（用户 2026-10-10 定档「一并抹掉」）。
const KEEP_DB = 'ordinal-keep-db';
const OLD_MUSIC_DB = 'ordinal-music-db';
const OLD_MUSIC_LS = 'ordinal-music-';
const KA_AUDIO_KEY = GNS + ':__ka-audio';
let _keepDbP = null;
function _keepDb() {
if (_keepDbP) return _keepDbP;
_keepDbP = new Promise(function (resolve) {
try {
const req = indexedDB.open(KEEP_DB, 1);
req.onupgradeneeded = function () { try { req.result.createObjectStore('files'); } catch (e) {} };
req.onsuccess = function () { resolve(req.result); };
req.onerror = function () { resolve(null); };
} catch (e) { resolve(null); }
});
return _keepDbP;
}
// 下面五个读写口的**返回值语义**与原 js/music.js 那一份逐字对齐（get 回记录本身、取不到就是 undefined；
// put/delete 回 true/false；getAllKeys 没有库时回空数组）——搬家改的是库名，不是这几条判据：
// 消费方各按「typeof v === 'string'」与「=== true」自己判，换成另一种回法就做成时灵时不灵。
function _keepReq(mode, build) {
return _keepDb().then(function (db) {
return new Promise(function (resolve, reject) {
if (!db) { reject(new Error('no-db')); return; }
try {
const r = build(db.transaction('files', mode).objectStore('files'));
r.onsuccess = function () { resolve(r); };
r.onerror = function () { reject(r.error); };
} catch (e) { reject(e); }
});
});
}
window.idbGet = function (key) {
return _keepReq('readonly', function (os) { return os.get(key); }).then(function (r) { return r.result; }).catch(function () { return undefined; });
};
window.idbSet = function (key, val) {
return _keepReq('readwrite', function (os) { return os.put(val, key); }).then(function () { return true; }).catch(function () { return false; });
};
window.idbDelete = function (key) {
return _keepReq('readwrite', function (os) { return os.delete(key); }).then(function () { return true; }).catch(function () { return false; });
};
window.idbGetAllKeys = function () {
return _keepReq('readonly', function (os) { return os.getAllKeys(); }).then(function (r) { return r.result || []; }).catch(function () { return []; });
};
window.idbGetMany = function (keys) {
return Promise.all((keys || []).map(function (k) { return window.idbGet(k).then(function (v) { return [k, v]; }); })).then(function (entries) {
const map = {}; entries.forEach(function (en) { map[en[0]] = en[1]; }); return map;
});
};
// 「清空全部数据」的落点：本机小件＋播放器遗留命名空间一起抹（js/db.js 的 resetAllData 引这一处，不留第二份口径）
window.localFilesWipe = function () {
try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf(OLD_MUSIC_LS) === 0) localStorage.removeItem(k); }); } catch (e) {}
try { indexedDB.deleteDatabase(KEEP_DB); } catch (e) {}
try { indexedDB.deleteDatabase(OLD_MUSIC_DB); } catch (e) {}
};
// 播放器退场的一次性清扫：捞那一枚自定义保活音频 → 删旧库（库里其余全是播放器的歌）→ 删 LS 那一族 → 落标记
(function retirePlayerStores() {
let flag = null;
try { flag = localStorage.getItem('ordinal-player-retired'); } catch (e) {}
if (flag === '1') return;
function done() { try { localStorage.setItem('ordinal-player-retired', '1'); } catch (e) {} }
function wipeLs() { try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf(OLD_MUSIC_LS) === 0) localStorage.removeItem(k); }); } catch (e) {} }
try {
const req = indexedDB.open(OLD_MUSIC_DB, 1);
req.onupgradeneeded = function () { try { req.result.createObjectStore('files'); } catch (e) {} };
req.onsuccess = function () {
const db = req.result;
let has = false;
try { has = db.objectStoreNames.contains('files'); } catch (e) {}
if (!has) { try { db.close(); } catch (e) {} indexedDB.deleteDatabase(OLD_MUSIC_DB); wipeLs(); done(); return; }
try {
const gtx = db.transaction('files', 'readonly').objectStore('files').get(KA_AUDIO_KEY);
gtx.onsuccess = function () {
const v = gtx.result;
try { db.close(); } catch (e) {}
indexedDB.deleteDatabase(OLD_MUSIC_DB);
wipeLs();
if (typeof v === 'string' && v.length > 10) {
window.idbSet(KA_AUDIO_KEY, v).then(function () {
// 搬家成功＝这一趟也立刻用上（kaLoadCustomAudio 在本层写完之前已经跑过一次，不补就读不到自己）
try { kaCustomAudio = v; kaApplyCustomAudio(); syncKaAudioUI(); } catch (e) {}
done();
});
} else { done(); }
};
gtx.onerror = function () { try { db.close(); } catch (e) {} indexedDB.deleteDatabase(OLD_MUSIC_DB); wipeLs(); done(); };
} catch (e) { try { db.close(); } catch (e2) {} indexedDB.deleteDatabase(OLD_MUSIC_DB); wipeLs(); done(); }
};
req.onerror = function () { wipeLs(); done(); };
} catch (e) { wipeLs(); done(); }
})();
function __bgIsIOS() { try { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); } catch (e) { return false; } }
function __bgWhenData(fn) {
const tick = function () {
let ok = false;
try { ok = typeof data === 'object' && !!data && !!data.appearance && typeof data.appearance.bgKeepAlive === 'boolean'; } catch (e) { ok = false; }
if (ok) { try { fn(); } catch (e2) {} return; }
setTimeout(tick, 200);
};
tick();
}
function __bgEnsureHealBar() {
let bar = document.getElementById('notify-heal-bar');
if (bar) return bar;
bar = document.createElement('div');
bar.id = 'notify-heal-bar';
bar.hidden = true;
bar.innerHTML = '<span id="notify-heal-txt"></span><button id="notify-heal-refresh" type="button">立即刷新</button><button id="notify-heal-close" type="button" aria-label="关闭">×</button>';
(document.body || document.documentElement).appendChild(bar);
return bar;
}
function __bgPickFile(opt) {
opt = opt || {};
try {
const inp = document.createElement('input');
inp.type = 'file';
if (opt.accept) inp.accept = opt.accept;
inp.style.display = 'none';
document.body.appendChild(inp);
inp.addEventListener('change', function () {
const files = Array.prototype.slice.call(inp.files || []);
try { if (opt.onFiles) opt.onFiles(files); } catch (e2) {}
try { inp.remove(); } catch (e3) {}
});
inp.click();
} catch (e) {}
}
function __bgOpenModal(title, text, fn, opts) {
opts = opts || {};
let mask = document.getElementById('bgModalMask');
if (mask) { try { mask.remove(); } catch (e0) {} }
mask = document.createElement('div');
mask.id = 'bgModalMask';
mask.className = 'bg-modal-mask';
(document.body || document.documentElement).appendChild(mask);
const card = document.createElement('div');
card.className = 'bg-modal' + (opts.big ? ' big' : '');
const h = document.createElement('h3');
h.textContent = title || '';
card.appendChild(h);
const body = opts.staticText || text || '';
if (body) {
const p = document.createElement('div');
p.className = 'bg-modal-txt';
p.textContent = body;
card.appendChild(p);
}
const btns = document.createElement('div');
btns.className = 'bg-modal-btns';
const close = function () { try { mask.remove(); } catch (e2) {} };
const pick = function (v) { close(); try { if (fn) fn(v); } catch (e3) {} };
(opts.pills && opts.pills.length ? opts.pills : [{ label: '知道了', value: '' }]).forEach(function (pl) {
const b = document.createElement('button');
b.type = 'button';
b.textContent = pl.label;
b.addEventListener('click', function () { pick(pl.value); });
btns.appendChild(b);
});
card.appendChild(btns);
mask.appendChild(card);
if (!opts.lock) {
mask.addEventListener('click', function (ev) { if (ev.target === mask) pick(''); });
}
return { okText: function () {} };
}
function gGet(k) {
try {
if (k === 'bg-keepalive') return (typeof data === 'object' && data && data.appearance && data.appearance.bgKeepAlive) ? '1' : '0';
if (k === 'bg-notify') return (typeof data === 'object' && data && data.appearance && data.appearance.bgNotify) ? '1' : '0';
if (k === 'bg-notify-nodedup') return (typeof data === 'object' && data && data.appearance && data.appearance.bgNotifyNoDedup) ? '1' : '0';
return localStorage.getItem('ordinal-bg-' + k);
} catch (e) { return null; }
}
function bgNoDedup() {
try { return gGet('bg-notify-nodedup') === '1'; } catch (e) { return false; }
}
function gSet(k, v) {
try {
if (k === 'bg-keepalive' || k === 'bg-notify' || k === 'bg-notify-nodedup') {
if (typeof data === 'object' && data && data.appearance) {
const fk = k === 'bg-keepalive' ? 'bgKeepAlive' : (k === 'bg-notify' ? 'bgNotify' : 'bgNotifyNoDedup');
data.appearance[fk] = v === '1';
try { save(); } catch (e2) {}
}
return;
}
localStorage.setItem('ordinal-bg-' + k, v);
} catch (e) {}
}
function toast(msg, dur) {
let t = document.getElementById('bgToast');
if (!t) {
t = document.createElement('div');
t.id = 'bgToast';
(document.body || document.documentElement).appendChild(t);
}
t.textContent = msg;
t.className = 'bg-toast'; void t.offsetWidth; t.className = 'bg-toast show';
clearTimeout(t._timer);
t._timer = setTimeout(() => { t.className = 'bg-toast'; }, (dur || 2600) + 250);
}
let kaCustomAudio = null;
let kaCustomAudioName = '';
function kaCustomOn() { try { return gGet('__ka-audio-on') === '1'; } catch (e) { return false; } }
function kaAudioLabel() { return (kaCustomAudio || kaCustomOn()) ? '自定义音频' : '默认静音音频'; }
function kaApplyCustomAudio() {
if (!kaCustomAudio || !keepAudio || !keepAudio.el) return;
if (keepAudio.mode === KA_MODE_WA) { kaSwapTransducer(); return; }
try {
if (keepAudio.el.src !== kaCustomAudio) {
keepAudio.el.src = kaCustomAudio;
kaApplyToneVolume();
}
} catch (e) {}
}
function kaLoadCustomAudio() {
if (!kaCustomOn() || kaCustomAudio) return;
try {
if (!window.idbGet) return;
window.idbGet(GNS + ':__ka-audio').then(function (v) {
if (v && typeof v === 'string' && v.length > 10) {
kaCustomAudio = v;
try { kaCustomAudioName = gGet('__ka-audio-name') || ''; } catch (e) {}
kaApplyCustomAudio();
syncKaAudioUI();
}
}).catch(function () {});
} catch (e) {}
}
function kaSetDefaultAudio() {
kaCustomAudio = null;
kaCustomAudioName = '';
try {
['__ka-audio', '__ka-audio-on', '__ka-audio-name'].forEach(function (k) { try { localStorage.removeItem('ordinal-bg-' + k); } catch (e2) {} });
} catch (e) {}
if (keepEnabled && keepAudio && keepAudio.el) {
try { kaSwapTransducer(true); } catch (e) {}
}
syncKaAudioUI();
toast('已恢复默认静音音频');
}
function kaPickCustomAudio() {
__bgPickFile({
id: 'mochi-ka-audio-pick', accept: 'audio/*',
onFiles: function (files) {
const f = files && files[0];
if (!f) { toast('没有取到音频，请再选一次'); return; }
if (f.size > 3 * 1024 * 1024) toast('音频较大（>3MB），可能占用较多存储空间');
toast('正在读取音频…');
const r = new FileReader();
r.onload = function () {
kaCustomAudio = String(r.result || '');
kaCustomAudioName = f.name || '自定义音频';
try {
gSet('__ka-audio', kaCustomAudio);
gSet('__ka-audio-on', '1');
gSet('__ka-audio-name', kaCustomAudioName);
} catch (e) {}
if (keepEnabled && keepAudio && keepAudio.el) {
try { kaApplyToneVolume(); } catch (e) {}
kaApplyCustomAudio();
}
syncKaAudioUI();
toast('已设为自定义保活音频（按原音量循环播放）');
};
r.onerror = function () { toast('音频读取失败'); };
r.readAsDataURL(f);
}
});
}
function openKaAudioPicker() {
if (!__bgOpenModal) return;
const pills = [
{ label: '默认静音音频', value: 'default' },
{ label: '上传自定义音频', value: 'upload' }
];
if (kaCustomAudio || kaCustomOn()) pills.push({ label: '清除自定义', value: 'clear' });
const hasCustom = !!(kaCustomAudio || kaCustomOn());
const cur = kaAudioLabel() + (hasCustom && kaCustomAudioName ? '（' + kaCustomAudioName + '）' : '');
const txt = '后台保活需要在后台持续播放一段音频来让页面保持运行。\n\n· 默认静音音频：内置生成、近乎无声，推荐。\n· 自定义音频：上传自己的音频（白噪音 / 助眠声，或更彻底的静音文件），按原音量循环播放。\n\n注意：默认静音音频走「不抢其他 App 的声音」那条通道（见 设置→提醒→消息提醒 同名开关），不再把别的 App 的音量压低；但上传自定义音频是要出声的，它仍会占用手机音频通道，可能影响其他 App 的声音（详见「后台保活」功能说明）。\n当前：' + cur;
__bgOpenModal('【保活音频】', '', function (v) {
if (v === 'default' || v === 'clear') kaSetDefaultAudio();
else if (v === 'upload') kaPickCustomAudio();
}, { noInput: true, pillSubmit: true, staticText: txt, pills: pills });
}
let keepAudio = null;
let keepInterval = null;
let keepEnabled = false;
let keepUserTouched = false; // v3.26.x #88：本会话用户手动动过保活开关 → 回填后不重读覆盖
let wakeSentinel = null; // v3.5.131：模块级，供 stopKeepAlive 释放
const KA_MODE_MEDIA = '媒体元素(占媒体通道)', KA_MODE_WA = 'WebAudio(不占媒体通道)';
function kaNoDuckSaved() { try { const v = gGet('__ka-noduck'); return v === null ? true : v === '1'; } catch (e) { return true; } }
function kaCustomWanted() { return !!kaCustomAudio || kaCustomOn(); }
let kaWaBroken = false; // #1489：本会话 WebAudio 路失败过（无 ctx／解码被拒）→ 不再反复试，留在媒体元素
function kaNoDuckNow() { return kaNoDuckSaved() && !kaCustomWanted() && !kaWaBroken; }
function kaOnPlayEdge() { kaMarkPlayed(); }
function kaOnPauseEdge() {
if (!keepEnabled || !keepAudio || !keepAudio.el) return;
if (kaTimer) return; // 已在退避轨道
if (kaYieldStealFocus()) return; // #924：隐藏期被外部抢走焦点＝用户正在听歌/看视频，不回抢
kaSchedule(); // 连击计数由 kaSchedule 内部递增
}
let kaWaCtx = null, kaWaGain = null, kaWaSrc = null, kaWaBuf = null, kaWaVol = 0, kaWaPaused = true, kaWaErr = '';
function kaWaDecode(cb) {
if (kaWaBuf) { cb(true); return; }
if (!kaWaCtx || !KEEP_AUDIO_WAV) { kaWaErr = 'no wav/ctx'; cb(false); return; }
let done = false;
const fin = function (ok) { if (done) return; done = true; cb(!!ok); };
try {
if (!kaWaGain) { kaWaGain = kaWaCtx.createGain(); kaWaGain.connect(kaWaCtx.destination); }
const ab = KEEP_AUDIO_WAV.slice(0);
const p = kaWaCtx.decodeAudioData(ab, function (b) { if (b) kaWaBuf = b; fin(!!b); },
function () { kaWaErr = 'decode rejected'; fin(false); });
if (p && p.then) p.then(function (b) { if (b) kaWaBuf = b; fin(!!b); }, function () { kaWaErr = 'decode threw'; fin(false); });
} catch (e) { kaWaErr = String((e && e.message) || e); fin(false); }
}
function kaWaStopSrc() {
try { if (kaWaSrc) { kaWaSrc.onended = null; kaWaSrc.stop(); } } catch (e) {}
try { if (kaWaSrc) kaWaSrc.disconnect(); } catch (e) {}
kaWaSrc = null;
}
function kaWaStart() {
return new Promise(function (res, rej) {
if (!keepEnabled) { rej(new Error('keep off')); return; }
const run = function () {
try {
if (kaWaCtx.state !== 'running') { rej(new Error('ctx ' + kaWaCtx.state)); return; } // 自动播放策略未解锁＝如实报错，交给既有退避／首次交互补播
kaWaStopSrc();
const s = kaWaCtx.createBufferSource();
s.buffer = kaWaBuf; s.loop = true; s.connect(kaWaGain); s.start(0);
kaWaSrc = s; kaWaPaused = false;
kaApplyToneVolume(); // #1374a：转子换完仍由唯一落点档位说了算（前台＝0）
kaOnPlayEdge();
res();
} catch (e) { rej(e); }
};
kaWaDecode(function (ok) {
if (!ok) { kaWaBroken = true; kaFallbackToMedia(); rej(new Error(kaWaErr || 'decode fail')); return; } // #1489④：解码路不通＝本会话不再试，并当场换回媒体元素（保活绝不因新档而死）
try {
const rp = kaWaCtx.state === 'running' ? null : kaWaCtx.resume();
if (rp && rp.then) rp.then(function () { run(); }, function () { run(); });
else run();
} catch (e) { run(); }
});
});
}
function kaFallbackToMedia() {
if (!keepEnabled || !keepAudio || keepAudio.mode !== KA_MODE_WA) return;
if (!kaBuildTransducer(kaToneLevel)) return;
setKeepMediaSession();
try { const p = keepAudio.el.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
}
function kaWaKill() {
kaWaStopSrc();
try { if (kaWaCtx && kaWaCtx.close) kaWaCtx.close(); } catch (e) {}
kaWaCtx = null; kaWaGain = null; kaWaBuf = null; kaWaPaused = true;
}
function kaMakeWebAudioKeep() {
const AC = window.AudioContext || window.webkitAudioContext;
if (!AC) return null;
if (!kaWaCtx) { try { kaWaCtx = new AC(); } catch (e) { return null; } }
const el = {
loop: true,
get paused() { return kaWaPaused; },
set paused(v) { kaWaPaused = !!v; },
get volume() { return kaWaVol; },
set volume(v) { kaWaVol = v; try { if (kaWaGain) kaWaGain.gain.value = v; } catch (e) {} },
get src() { return 'webaudio:' + (kaWaBuf ? 'decoded' : 'pending'); },
set src(_v) {}, // 自定义音频绝不吃这条通道（#1489④ 由 kaCustomWanted 把转子换成媒体元素）
play: function () { return kaWaStart(); },
pause: function () { if (kaWaSrc || !kaWaPaused) { kaWaStopSrc(); kaWaPaused = true; kaOnPauseEdge(); } },
removeAttribute: function () {}, load: function () {}, setAttribute: function () {}, addEventListener: function () {}
};
return { el: el, mode: KA_MODE_WA, arm: function () {}, kill: kaWaKill };
}
function kaMakeMediaKeep() {
const keepEl = document.createElement('audio');
keepEl.loop = true;
keepEl.setAttribute('playsinline', '');
keepEl.addEventListener('play', function () { kaOnPlayEdge(); });
keepEl.addEventListener('pause', function () { kaOnPauseEdge(); });
return { el: keepEl, mode: KA_MODE_MEDIA, arm: function (s) { keepEl.src = s; }, kill: null };
}
function kaTeardownTransducer() {
const old = keepAudio; keepAudio = null; // 先摘在册：换通道那一刻的 pause 边沿不该排补播
if (!old) return;
try { if (old.el && old.el.pause) old.el.pause(); } catch (e) {}
try { if (old.kill) old.kill(); } catch (e) {}
}
function kaBuildTransducer(level) {
kaTeardownTransducer();
const src = kaCustomAudio || ensureKeepAudioDataUrl();
if (!src) return false;
let t = kaNoDuckNow() ? kaMakeWebAudioKeep() : kaMakeMediaKeep();
if (!t) { kaWaBroken = true; t = kaMakeMediaKeep(); } // #1489④ 环境不支持＝静默回落，保活不因新档而死
keepAudio = t;
kaSetToneLevel(level || KA_VOL_BASE); // #1374a：档位只有一个写入方；#724 基础档＋#1374b visible⇒0／hidden⇒该档
t.arm(src);
return true;
}
function kaSwapTransducer(resetBase) {
if (!keepEnabled) return;
if (!kaBuildTransducer(resetBase ? KA_VOL_BASE : kaToneLevel)) return;
if (kaNoDuckNow()) kaReleaseKeepMediaSession(); else setKeepMediaSession(); // #1489③
try { const p = keepAudio.el.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
}
function kaReleaseKeepMediaSession() {
try {
if (!('mediaSession' in navigator) || !navigator.mediaSession) return;
const md = navigator.mediaSession.metadata;
if (md && String(md.title) !== '言字卡 后台保活') return; // 不是我们的条，不摘
} catch (e) { return; }
kaClearKeepMediaSession();
}
function kaClearKeepMediaSession() {
try {
if ('mediaSession' in navigator && navigator.mediaSession) {
try { navigator.mediaSession.playbackState = 'paused'; } catch (e2) {}
navigator.mediaSession.metadata = null;
try { navigator.mediaSession.setActionHandler('play', null); } catch (e) {}
try { navigator.mediaSession.setActionHandler('pause', null); } catch (e) {}
}
} catch (e) {}
}
let kaTimer = null;     // 排中的退避补播定时器
let kaDelay = 0;        // 下一次补播间隔 ms；0=不在退避轨道
let kaPauseStreak = 0;  // 连续被打断次数（稳定播放一段时间后清零）
let kaLastPlayAt = 0;   // 最近一次 play() 被接受的时间（音频跑起来后刷新）
let kaPlayFailStreak = 0; // 连续 play() 被拒次数（补播一直失败时翻倍退避，不无限撞墙）
function kaCfg() {
let base = 5000, max = 60000;
try { if (typeof window.__kaRetryBaseMs === 'number') base = Math.max(1, window.__kaRetryBaseMs); } catch (e) {}
try { if (typeof window.__kaRetryMaxMs === 'number') max = Math.max(1, window.__kaRetryMaxMs); } catch (e) {}
return { base: base, max: Math.max(base, max) };
}
function kaStableMs() {
try { if (typeof window.__kaStableMs === 'number') return Math.max(1, window.__kaStableMs); } catch (e) {}
return 90000;
}
function kaSchedule(delayMs) {
if (!keepEnabled || kaTimer) return;
const cfg = kaCfg();
if (!delayMs) {
kaPauseStreak++;
delayMs = Math.min(cfg.base * Math.pow(2, Math.min(kaPauseStreak - 1, 10)), cfg.max);
}
if (document.visibilityState === 'hidden' && delayMs > 20000) delayMs = 20000;
kaDelay = delayMs;
window.__kaNextDelayMs = delayMs; // 回归探针
kaTimer = setTimeout(function () {
kaTimer = null;
if (!keepEnabled || !keepAudio || !keepAudio.el) { kaDelay = 0; return; }
if (!keepAudio.el.paused) { kaDelay = 0; return; }
const p = keepAudio.el.play();
const after = function () {
if (keepEnabled && keepAudio && keepAudio.el && keepAudio.el.paused) {
const c2 = kaCfg();
kaSchedule(Math.min((kaDelay || c2.base) * 2, c2.max));
}
};
if (p && p.then) p.then(after, after); else after();
}, kaDelay);
}
function kaStopTimer() { if (kaTimer) { clearTimeout(kaTimer); kaTimer = null; } kaDelay = 0; }
function kaResetBackoff() { kaStopTimer(); kaPauseStreak = 0; kaPlayFailStreak = 0; }
function kaMarkPlayed() { kaLastPlayAt = Date.now(); }
const KA_VOL_BASE = 0.2, KA_VOL_MAX = 0.35;
let KEEP_AUDIO_DATAURL = '', KEEP_AUDIO_WAV = null;
let kaToneLevel = KA_VOL_BASE; // #724 分级读数：断流命中一次升 KA_VOL_MAX，本会话不回改
function kaVisibleNow() { try { return document.visibilityState === 'visible'; } catch (e) { return false; } }
function kaApplyToneVolume() {
try {
if (!keepAudio || !keepAudio.el) return;
keepAudio.el.volume = kaCustomAudio ? 1 : (kaVisibleNow() ? 0 : kaToneLevel);
} catch (e) {}
}
function kaSetToneLevel(v) { kaToneLevel = v; kaApplyToneVolume(); }
document.addEventListener('visibilitychange', function () { kaApplyToneVolume(); });
function kaIsIOS() {
return __bgIsIOS();
}
function kaYieldStealFocus() {
return kaIsIOS() && document.visibilityState === 'hidden';
}
function ensureKeepAudioDataUrl() {
if (KEEP_AUDIO_DATAURL) return KEEP_AUDIO_DATAURL;
try {
const sr = 44100, sec = 1, n = sr * sec;
const amp = kaIsIOS() ? 0.002 : 0.02;
const freq = 18000;
const buf = new ArrayBuffer(44 + n * 2);
const dv = new DataView(buf);
const ws = function (o, s) { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
ws(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE');
ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
ws(36, 'data'); dv.setUint32(40, n * 2, true);
for (let i = 0; i < n; i++) {
const v = Math.sin(2 * Math.PI * freq * (i / sr)) * amp;
dv.setInt16(44 + i * 2, Math.round(v * 32767), true);
}
const bytes = new Uint8Array(buf);
KEEP_AUDIO_WAV = buf; // #1489：WebAudio 转子要 ArrayBuffer 本体（媒体元素那份走 dataURL）
let bin = '';
for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
KEEP_AUDIO_DATAURL = 'data:audio/wav;base64,' + btoa(bin);
} catch (e) { KEEP_AUDIO_DATAURL = ''; KEEP_AUDIO_WAV = null; }
return KEEP_AUDIO_DATAURL;
}
function setKeepMediaSession() {
try {
if (!('mediaSession' in navigator) || !navigator.mediaSession || !window.MediaMetadata) return;
if (kaNoDuckNow()) { kaReleaseKeepMediaSession(); return; }
navigator.mediaSession.metadata = new window.MediaMetadata({
title: '言字卡 后台保活',
artist: 'mochi',
album: '后台消息提醒运行中'
});
try { navigator.mediaSession.playbackState = 'playing'; } catch (e) {}
try {
navigator.mediaSession.setActionHandler('play', function () {});
navigator.mediaSession.setActionHandler('pause', function () {});
} catch (e) {}
} catch (e) {}
}
let kaPc1 = null, kaPc2 = null, kaWebrtcTimer = null;
let kaCand1 = [], kaCand2 = [];
let kaWebrtcBootTimer = null;   // 启动延迟建锚定时器
let kaWebrtcDiscTimer = null;   // disconnected 自愈观察窗定时器
let kaWebrtcRebuildDelay = 0;   // 下次重建间隔 ms（指数退避轨道）；0=不在轨道
let kaWebrtcOkAt = 0;           // 最近一次进入 connected 的时刻（稳定判定用）
function kaWebrtcDeferredStart(delayMs) {
if (kaWebrtcBootTimer) { clearTimeout(kaWebrtcBootTimer); kaWebrtcBootTimer = null; }
kaWebrtcBootTimer = setTimeout(function () {
kaWebrtcBootTimer = null;
if (!keepEnabled || kaPc1 || kaPc2) return;
if (document.hidden) return;
kaWebrtcStart();
}, delayMs);
}
function kaWebrtcScheduleRebuild() {
if (kaWebrtcOkAt && Date.now() - kaWebrtcOkAt > 300000) kaWebrtcRebuildDelay = 0;
kaWebrtcRebuildDelay = kaWebrtcRebuildDelay ? Math.min(kaWebrtcRebuildDelay * 2, 900000) : 30000;
if (keepEnabled && !kaWebrtcTimer) kaWebrtcTimer = setTimeout(function () {
kaWebrtcTimer = null;
if (!keepEnabled || document.hidden) return;
kaWebrtcStart();
}, kaWebrtcRebuildDelay);
}
function kaWebrtcStart() {
if (kaPc1 || kaPc2) return;
if (kaWebrtcTimer) { clearTimeout(kaWebrtcTimer); kaWebrtcTimer = null; }
if (kaWebrtcBootTimer) { clearTimeout(kaWebrtcBootTimer); kaWebrtcBootTimer = null; }
if (kaWebrtcDiscTimer) { clearTimeout(kaWebrtcDiscTimer); kaWebrtcDiscTimer = null; }
if (typeof RTCPeerConnection === 'undefined') return;
try {
const p1 = new RTCPeerConnection(), p2 = new RTCPeerConnection();
p1.onicecandidate = function (e) { if (e.candidate) kaCand1.push(e.candidate); };
p2.onicecandidate = function (e) { if (e.candidate) kaCand2.push(e.candidate); };
p1.createDataChannel('mochi-ka');
const wire = function (a, b) {
return a.createOffer()
.then(function (o) { return a.setLocalDescription(o); })
.then(function () { return b.setRemoteDescription(a.localDescription); })
.then(function () { return b.createAnswer(); })
.then(function (ans) { return b.setLocalDescription(ans); })
.then(function () { return a.setRemoteDescription(b.localDescription); });
};
const gathered = function (pc) {
return new Promise(function (res) {
let done = false;
const fin = function () { if (!done) { done = true; res(); } };
try { if (pc.iceGatheringState === 'complete') { fin(); return; } } catch (e) { fin(); return; }
try {
pc.addEventListener('icegatheringstatechange', function () {
try { if (pc.iceGatheringState === 'complete') fin(); } catch (e) { fin(); }
});
} catch (e) { fin(); }
setTimeout(fin, 3000);
});
};
const flush = function () {
try { for (let i = 0; i < kaCand2.length; i++) p1.addIceCandidate(kaCand2[i]); } catch (e) {}
try { for (let i = 0; i < kaCand1.length; i++) p2.addIceCandidate(kaCand1[i]); } catch (e) {}
};
wire(p1, p2)
.then(function () { return Promise.all([gathered(p1), gathered(p2)]); })
.then(flush)
.catch(function () { kaWebrtcStop(); kaWebrtcScheduleRebuild(); });
p1.onconnectionstatechange = function () {
const st = p1.connectionState;
if (st === 'connected') {
kaWebrtcOkAt = Date.now();
if (kaWebrtcDiscTimer) { clearTimeout(kaWebrtcDiscTimer); kaWebrtcDiscTimer = null; }
return;
}
if (st === 'disconnected') {
if (kaWebrtcDiscTimer) return;
kaWebrtcDiscTimer = setTimeout(function () {
kaWebrtcDiscTimer = null;
if (!kaPc1) return;
const s2 = kaPc1.connectionState;
if (s2 === 'connected') { kaWebrtcOkAt = Date.now(); return; }
kaWebrtcStop();
kaWebrtcScheduleRebuild();
}, 8000);
return;
}
if (st === 'failed' || st === 'closed') {
kaWebrtcStop();
kaWebrtcScheduleRebuild();
}
};
kaPc1 = p1; kaPc2 = p2;
} catch (e) {}
}
function kaWebrtcStop() {
if (kaWebrtcTimer) { clearTimeout(kaWebrtcTimer); kaWebrtcTimer = null; }
if (kaWebrtcBootTimer) { clearTimeout(kaWebrtcBootTimer); kaWebrtcBootTimer = null; }
if (kaWebrtcDiscTimer) { clearTimeout(kaWebrtcDiscTimer); kaWebrtcDiscTimer = null; }
try { if (kaPc1) kaPc1.close(); } catch (e) {}
try { if (kaPc2) kaPc2.close(); } catch (e) {}
kaPc1 = kaPc2 = null;
kaCand1 = []; kaCand2 = [];
}
const KA_HB_KEY = '__ka-hb';
let kaHbTimer = null;
let kaHb = null;
function kaHbTick() {
if (!kaHb) return;
kaHb.n++;
kaHb.ts = Date.now();
try { kaHb.trail.push(kaHb.ts); if (kaHb.trail.length > 8) kaHb.trail.shift(); } catch (e) {}
try { if (window.idbSet) window.idbSet(KA_HB_KEY, kaHb); } catch (e) {}
}
function kaHbStart() {
if (kaHbTimer) return;
kaHb = { n: 0, hid: Date.now(), ts: Date.now(), resumed: 0, trail: [] };
kaHbTick();
kaHbTimer = setInterval(kaHbTick, 30000);
}
function kaHbStop() {
if (kaHbTimer) { clearInterval(kaHbTimer); kaHbTimer = null; }
}
let kaEv = { stall: 0, died: 0 };
try {
const _evSaved = gGet('__ka-ev');
if (_evSaved && String(_evSaved).charAt(0) === '{') {
const _ev = JSON.parse(_evSaved);
if (_ev && typeof _ev === 'object') kaEv = Object.assign(kaEv, _ev);
}
} catch (e) {}
function kaEvSave() { try { gSet('__ka-ev', JSON.stringify(kaEv)); } catch (e) {} }
let kaDiedCounted = false; // 本次启动只记一次「后台终止」取证；#1199 TDZ 闸：必须声明在 sessBootCheck() 之前
const SESS_KEY = '__sess-alive';
function sessMark(closed) { try { gSet(SESS_KEY, JSON.stringify({ t: Date.now(), closed: !!closed })); } catch (e) {} }
function sessBootCheck() {
try {
const prev = JSON.parse(gGet(SESS_KEY) || 'null');
if (prev && typeof prev.t === 'number' && !prev.closed && (Date.now() - prev.t) < 30 * 60 * 1000) {
kaEv.died++;
kaEvSave();
kaDiedCounted = true;
}
} catch (e) {}
sessMark(false);
}
try { window.addEventListener('pagehide', function () { sessMark(true); }); } catch (e) {}
try { document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') sessMark(false); }); } catch (e) {}
document.addEventListener('visibilitychange', function () {
if (document.visibilityState === 'hidden') {
if (!keepEnabled) return;
kaHbStart();
} else {
if (kaHb) {
kaHb.resumed = Date.now();
if (kaHb.ts && kaHb.resumed - kaHb.ts > 90000) {
kaEv.stall++; kaEvSave();
try { if (keepAudio && keepAudio.el && !kaCustomAudio) kaSetToneLevel(KA_VOL_MAX); } catch (e) {}
if (kaHb.hid && kaHb.resumed - kaHb.hid >= 600000) {
toast('⚠ 挂后台太久，保活被系统冻结截断过\n这段时间的后台消息/后台弹窗可能失效（回本页已自动恢复）\n经常失效：彻底关闭网页重新打开，再把「后台保活」「后台弹窗」开关重新打开', 6000);
}
}
try { if (window.idbSet) window.idbSet(KA_HB_KEY, kaHb); } catch (e) {}
}
kaHbStop();
}
});
try {
sessBootCheck(); // #961：通用存活标记启动判定（含正常收尾标记，与保活开关无关）
if (window.idbGet) window.idbGet(KA_HB_KEY).then(function (old) {
if (kaDiedCounted) return;
if (old && old.n > 0 && !old.resumed && !old.bye) {
kaEv.died++;
kaEvSave();
kaDiedCounted = true;
}
}).catch(function () {});
} catch (e) {}
window.addEventListener('pagehide', function () {
if (!kaHb) return;
kaHb.bye = 1;
try { if (window.idbSet) window.idbSet(KA_HB_KEY, kaHb); } catch (e) {}
});
let kaPermNoticeArmed = false;
function kaNoticeCool(key, ms) {
try { const t = Number(gGet(key)) || 0; return t > 0 && (Date.now() - t) < ms; } catch (e) { return false; }
}
function kaNoticeStamp(key) { try { gSet(key, String(Date.now())); } catch (e) {} }
function kaNoticeAfterSplash(fn) {
try {
if (chanSplashGone()) { fn(); return; }
const s = document.getElementById('splash');
if (!s) { fn(); return; }
let done = false;
let mo = null, moBody = null, tmr = null;
const cleanup = function () {
done = true;
try { if (mo) mo.disconnect(); } catch (e) {}
try { if (moBody) moBody.disconnect(); } catch (e) {}
try { if (tmr) clearTimeout(tmr); } catch (e) {}
};
const fire = function () { if (done) return; cleanup(); try { fn(); } catch (e) {} };
if (typeof MutationObserver === 'function') {
mo = new MutationObserver(function () { if (chanSplashGone()) fire(); });
try { mo.observe(s, { attributes: true, attributeFilter: ['class', 'hidden'] }); } catch (e) {}
moBody = new MutationObserver(function () { if (!s.isConnected) fire(); });
try { moBody.observe(document.body, { childList: true }); } catch (e) {}
}
tmr = setTimeout(cleanup, 90000);
} catch (e) { try { fn(); } catch (e2) {} }
}
function nbPermPendingNotice() {
try { if (!notifyEnabled) return; } catch (e) { return; }
let p = 'default';
try { p = nbPermState(); } catch (e) { return; }
if (p !== 'default' && p !== 'denied') return;   // 已授权 / 本机无通知能力（unsupported）都不在此提示
if (kaNoticeCool('__nb-perm-note-at', 12 * 3600 * 1000)) return;
try { if (document.visibilityState !== 'visible') return; } catch (e) { return; }
kaNoticeStamp('__nb-perm-note-at');
const nn = bgPermNativeNote(p);   // APK 里那条「去浏览器网站设置」的指路是假话
toast(nn || (p === 'denied'
? '⚠「后台通知」开关开着，但浏览器还挡着本站的通知权限\n地址栏左侧图标 → 网站设置 → 通知 → 允许（允许后自动生效，不用再点开关）\n这是权限限制，不是开关坏了'
: '⚠「后台通知」开关开着，但浏览器还没给通知权限\n地址栏左侧图标 → 网站设置 → 通知 → 允许（没允许之前，后台消息不会弹窗）\n这是权限限制，不是开关坏了'), 7000);
}
try {
setTimeout(function () { kaPermNoticeArmed = true; kaNoticeAfterSplash(nbPermPendingNotice); }, 20000);
} catch (e) {}
window.__kaProbe = function () {
let audio = null, ms = null;
try { audio = keepAudio && keepAudio.el ? { paused: !!keepAudio.el.paused, volume: keepAudio.el.volume, loop: !!keepAudio.el.loop } : null; } catch (e) {}
try { ms = ('mediaSession' in navigator && navigator.mediaSession) ? { metadata: !!navigator.mediaSession.metadata, state: navigator.mediaSession.playbackState } : null; } catch (e) {}
return {
keep: keepEnabled,
notify: notifyEnabled,
perm: nbPermState(),
chan: bgNativeCh() ? 'native' : ('serviceWorker' in navigator ? 'web' : 'page'),
anchor: keepAudio ? (keepAudio.mode || '?') : null,
noduck: kaNoDuckNow(),
duckIn: { saved: kaNoDuckSaved(), custom: kaCustomWanted(), broken: kaWaBroken },
waErr: kaWaBroken ? (kaWaErr || 'webaudio unavailable') : '',
audio: audio,
ms: ms,
pc: kaPc1 ? (kaPc1.connectionState || 'new') : 'off',
pcGathering: kaPc1 ? (function () { try { return kaPc1.iceGatheringState || '?'; } catch (e) { return '?'; } })() : 'off',
pcCand: (kaCand1.length + kaCand2.length) | 0,
pcNext: kaWebrtcTimer ? kaWebrtcRebuildDelay : 0,
hb: kaHb ? { n: kaHb.n, hid: kaHb.hid, ts: kaHb.ts, resumed: kaHb.resumed, trail: (kaHb.trail || []).slice() } : null,
ev: { stall: kaEv.stall, died: kaEv.died }
};
};
function startKeepAlive(showToast) {
if (keepAudio) return;
try {
if (!kaBuildTransducer(KA_VOL_BASE)) { if (showToast) toast('后台保活启动失败（无法生成保活音频）'); return; }
const playIt = function () {
const p = keepAudio.el.play();
if (p && p.catch) p.catch(function () {});
};
playIt();
setKeepMediaSession();
kaWebrtcDeferredStart(10000);
const resumeOnInteraction = function () {
if (keepAudio && keepAudio.el && keepAudio.el.paused) {
const p = keepAudio.el.play();
if (p && p.catch) p.catch(function () {});
}
};
document.addEventListener('click', resumeOnInteraction, { once: true });
document.addEventListener('touchstart', resumeOnInteraction, { once: true });
document.addEventListener('keydown', resumeOnInteraction, { once: true });
keepInterval = setInterval(function () {
try { if (window.__mochiPhase) window.__mochiPhase('ka-tick'); } catch (e0) {}
if (keepAudio && keepAudio.el) {
try {
if (!keepAudio.el.paused) {
let hold = !kaNoDuckNow(); // #1489③：新档下这条心跳不再把 playbackState 按回 'playing'（那正是抢媒体焦点的那一手）
try {
if (document.visibilityState === 'hidden') {
const md = navigator.mediaSession && navigator.mediaSession.metadata;
hold = !!(md && String(md.title) === '言字卡 后台保活');
}
} catch (e) { hold = true; }
if (hold) {
try {
if (navigator.mediaSession && navigator.mediaSession.playbackState !== 'playing') {
try { if (window.__mochiPhase) window.__mochiPhase('ka-ms'); } catch (e0) {}
navigator.mediaSession.playbackState = 'playing';
}
} catch (e) {}
}
if (kaPauseStreak && Date.now() - kaLastPlayAt > kaStableMs()) kaPauseStreak = 0;
return;
}
if (!kaTimer && !kaYieldStealFocus()) kaSchedule();
} catch (e) {}
}
}, 5000);
const requestWakeLock = function () {
if (navigator.wakeLock && document.visibilityState === 'visible') {
navigator.wakeLock.request('screen').then(function (sentinel) {
wakeSentinel = sentinel;
if (wakeSentinel) {
wakeSentinel.addEventListener('release', function () {
setTimeout(function () { if (keepEnabled) requestWakeLock(); }, 1000);
});
}
}).catch(function () {});
}
};
requestWakeLock();
if (showToast) {
const isNative = !!bgNativeCh();
if (!bgNotifyAllowed()) {
toast(isNative
? '后台保活已启动（还没给通知权限：手机 设置 → 应用 → 言字卡 → 通知 → 允许）'
: (!('Notification' in window)
? '后台保活已启动（注意：本环境不支持系统通知，需 HTTPS 访问）'
: '后台保活已启动（通知未授权：去设置→提醒→消息提醒→系统通知→开启并允许权限）'));
} else {
showSysNotification('后台保活已启动', { body: '正在播放静音音频以保持后台活跃，请勿关闭此页面' }).then(function (ok) {
toast(ok
? (isNative ? '后台保活已启动 · 通知栏应弹出提示条，若没有请到 手机设置 → 应用 → 言字卡 → 通知 → 允许' : '后台保活已启动 · 通知栏应弹出提示条，若没有请到系统设置→通知→Chrome→允许通知')
: '后台保活已启动（通知发送未受理，请检查系统通知权限）');
});
}
}
} catch (e) {}
}
function stopKeepAlive(showToast) {
try { if (keepAudio && keepAudio.el) { keepAudio.el.pause(); keepAudio.el.removeAttribute('src'); try { keepAudio.el.load(); } catch (e2) {} } } catch (e) {}
try { if (keepAudio && keepAudio.kill) keepAudio.kill(); } catch (e) {}
kaClearKeepMediaSession();
try { if (wakeSentinel) { wakeSentinel.release(); } } catch (e) {}
wakeSentinel = null;
kaStopTimer();
kaPauseStreak = 0;
kaPlayFailStreak = 0;
kaWebrtcStop();
clearInterval(keepInterval);
keepAudio = null;
keepInterval = null;
if (showToast) toast('后台保活已关闭');
}
function healKeepAlive() {
if (!keepEnabled) return;
kaResetBackoff();
if (!kaPc1 && !kaWebrtcTimer && !kaWebrtcBootTimer) kaWebrtcDeferredStart(3000);
if (keepAudio && keepAudio.el && keepAudio.el.paused) {
const p = keepAudio.el.play();
if (p && p.catch) p.catch(function () {});
}
[0, 600, 1800].forEach(function (d) {
setTimeout(function () {
if (!keepEnabled) return;
if (keepAudio && keepAudio.el && keepAudio.el.paused) {
const p = keepAudio.el.play();
if (p && p.catch) p.catch(function () {});
}
}, d);
});
setKeepMediaSession();
try {
if (navigator.wakeLock && document.visibilityState === 'visible') {
navigator.wakeLock.request('screen').then(function (sentinel) {
wakeSentinel = sentinel;
if (wakeSentinel) {
wakeSentinel.addEventListener('release', function () {
setTimeout(function () { if (keepEnabled) requestWakeLockTop(); }, 1000);
});
}
}).catch(function () {});
}
} catch (e) {}
}
let _fgResumeAt = 0;
let _fgFromHiddenFor = 0;
function _onFgVisible() {
const now = Date.now();
if (now - _fgResumeAt < 1000) return;
_fgResumeAt = now;
try { _fgFromHiddenFor = lastHiddenAt > 0 ? now - lastHiddenAt : 0; } catch (e) { _fgFromHiddenFor = 0; }
healKeepAlive();
try { document.dispatchEvent(new Event('mochi-fg-resume')); } catch (e) {}
}
document.addEventListener('visibilitychange', function () {
if (document.visibilityState === 'visible') _onFgVisible();
});
document.addEventListener('focus', function () {
if (document.visibilityState === 'visible') _onFgVisible();
});
window.addEventListener('pageshow', function (e) {
if (e.persisted || document.visibilityState === 'visible') _onFgVisible();
});
document.addEventListener('visibilitychange', function () {
if (document.visibilityState !== 'hidden') return;
if (!keepEnabled || !keepAudio || !keepAudio.el) return;
if (!keepAudio.el.paused) return;
if (kaYieldStealFocus()) return;
kaResetBackoff();
const p = keepAudio.el.play();
if (p && p.catch) p.catch(function () {});
kaSchedule();
});
function requestWakeLockTop() {
try {
if (navigator.wakeLock && document.visibilityState === 'visible' && keepEnabled) {
navigator.wakeLock.request('screen').then(function (sentinel) {
wakeSentinel = sentinel;
}).catch(function () {});
}
} catch (e) {}
}
function kaOpenEnableHints() {
try {
if (typeof __bgOpenModal !== 'function') return;
__bgOpenModal('后台保活已开启 · 三条必知', '', function () {}, {
noInput: true, pillSubmit: true,
pills: [{ label: '知道了', value: 'ok' }],
staticText: '保活＝页面在后台持续播放一段近无声音频，让系统不冻结本页。有三条硬限制（手机/浏览器限制，不是网站故障）：\n\n① 别的 App 会把保活截断：刷视频、听歌等会占用手机音频通道，保活音频被暂停＝保活失效，回到本页才自动恢复；被截断期间后台消息收不到、后台弹窗不弹。（反过来也一样：老路会把你正在听的音乐压低——现在默认静音音频改走「不抢其他 App 的声音」那条通道，切进切出不再忽响忽轻，代价是通知栏那条「后台保活」不再出现；想要回到老路（占住音频通道、通知栏有媒体条）就把 设置→提醒→消息提醒→「保活不抢其他 App 的声音」关掉。）\n\n② 后台挂久了会失效：系统省电/内存策略会把挂久的页面冻结甚至丢弃重载（Edge「睡眠标签页」/Chrome「内存节省程序」约 30 分钟就会丢）。失效后请彻底关闭网页重新打开，再把「后台保活」「后台弹窗」开关重新打开。\n\n③ 开着它时本站不会在后台自己换新版（换版要重载页面＝会把后台运行打断）：线上有新版时提醒长在开屏公告页那一行「线上已有新版 · 点按刷新进入」，你自己挑时间点按它即可；不按也不影响使用，下次彻底关闭网页重开会自然换到新版。'
});
} catch (e) {}
}
const kaBtn = document.getElementById('bgKeepAlive');
function syncKeepUI() { if (kaBtn) kaBtn.checked = keepEnabled; }
let kaInputAt = 0;
try {
const kaMarkInput = function (e) {
try { if (e && e.isTrusted === false) return; } catch (er) {}
kaInputAt = Date.now();
};
['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click', 'keydown'].forEach(function (t) {
try { document.addEventListener(t, kaMarkInput, { passive: true, capture: true }); } catch (err) {}
});
} catch (e) {}
function kaUserGesture(e) {
try {
if (e && e.isTrusted === false) return false;
if (Date.now() - kaInputAt <= 1200) return true;
if (navigator.userActivation && navigator.userActivation.hasBeenActive === false) return false;
} catch (er) {}
return true;
}
if (kaBtn) {
kaBtn.addEventListener('change', function (e) {
if (!kaUserGesture(e)) { syncKeepUI(); try { kaBtn.checked = keepEnabled; } catch (er) {} return; }
keepUserTouched = true; // #88：手动动过 → 回填后不再重读覆盖
keepEnabled = kaBtn.checked;
gSet('bg-keepalive', keepEnabled ? '1' : '0');
gSet('__ka-user-off', keepEnabled ? '0' : '1');
if (keepEnabled) { startKeepAlive(true); kaOpenEnableHints(); }
else stopKeepAlive(true);
});
}
const kaNoduckBtn = document.getElementById('bg-keep-noduck');
function syncKaNoduckUI() { try { if (kaNoduckBtn) kaNoduckBtn.checked = kaNoDuckSaved(); } catch (e) {} }
function kaApplyNoduckPref(on) {
gSet('__ka-noduck', on ? '1' : '0');
syncKaNoduckUI();
try { if (window.__mochiPhase) window.__mochiPhase('ka-noduck'); } catch (e) {}
kaSwapTransducer();
}
window.__kaNoduckSet = kaApplyNoduckPref;
if (kaNoduckBtn) kaNoduckBtn.addEventListener('change', function (e) {
if (!kaUserGesture(e)) { syncKaNoduckUI(); return; }
kaApplyNoduckPref(!!(e.target && e.target.checked));
});
syncKaNoduckUI();
__bgWhenData(function () {
const saved = gGet('bg-keepalive');
keepEnabled = saved === '1';
if (gGet('__ka-user-off') === '1') {
keepEnabled = false;
if (saved === '1') gSet('bg-keepalive', '0');
}
syncKeepUI();
if (keepEnabled) startKeepAlive(false);
});
const kaAudioBtn = document.getElementById('bg-keep-audio-btn');
function syncKaAudioUI() { if (kaAudioBtn) kaAudioBtn.textContent = kaAudioLabel(); }
if (kaAudioBtn) kaAudioBtn.addEventListener('click', function (e) {
e.preventDefault();
e.stopPropagation();
openKaAudioPicker();
});
kaLoadCustomAudio();
syncKaAudioUI();
try { document.addEventListener('ordinal-data-ready', function () { kaLoadCustomAudio(); syncKaAudioUI(); }); } catch (e) {}
let notifyEnabled = false;
let notifyUserTouched = false; // v3.26.x #88：本会话用户手动动过通知开关 → 回填后不重读覆盖
const NOTIFY_ICON = (function () {
try { return new URL('./icon.svg', location.href).href; } catch (e) { return ''; }
})();
let BADGE_DATAURL = '';
let badgeReady = false;
let badgeQueue = null;
function getBadgeUrl(cb) {
cb = cb || function () {};
if (badgeReady) { cb(BADGE_DATAURL); return; }
if (badgeQueue) { badgeQueue.push(cb); return; }
badgeQueue = [cb];
if (!NOTIFY_ICON) { badgeReady = true; BADGE_DATAURL = ''; const q = badgeQueue; badgeQueue = null; for (let i = 0; i < q.length; i++) q[i](''); return; }
const img = new Image();
img.onload = function () {
try {
const s = 96;
const c = document.createElement('canvas');
c.width = s; c.height = s;
const ctx = c.getContext('2d');
ctx.drawImage(img, 0, 0, s, s);
const d = ctx.getImageData(0, 0, s, s);
const px = d.data;
for (let i = 0; i < px.length; i += 4) {
const r = px[i], g = px[i + 1], b = px[i + 2];
if (r > 248 && g > 248 && b > 248) px[i + 3] = 0;   // 白底 → 透明
else { px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; px[i + 3] = 255; } // 内容 → 白色不透明
}
ctx.putImageData(d, 0, 0);
BADGE_DATAURL = c.toDataURL('image/png');
} catch (e) { BADGE_DATAURL = ''; }
badgeReady = true;
const q = badgeQueue; badgeQueue = null;
for (let i = 0; i < q.length; i++) { try { q[i](BADGE_DATAURL); } catch (e2) {} }
};
img.onerror = function () { badgeReady = true; BADGE_DATAURL = ''; const q = badgeQueue; badgeQueue = null; for (let i = 0; i < q.length; i++) { try { q[i](''); } catch (e) {} } };
img.src = NOTIFY_ICON;
}
function dataUrlToBlob(dataUrl, cb) {
try {
fetch(dataUrl).then(function (r) { return r.blob(); }).then(function (b) {
cb(b && b.size ? b : null);
}, function () { cb(null); });
} catch (e) { cb(null); }
}
function prepMediaBlobs(target, done) {
const keys = ['icon', 'badge', 'image'];
let pending = 0;
const finish = function () { if (!pending && done) { const d = done; done = null; d(); } };
keys.forEach(function (k) {
const v = target[k];
if (typeof v === 'string' && v.indexOf('data:') === 0) {
pending++;
dataUrlToBlob(v, function (b) {
if (b) {
try { target[k] = URL.createObjectURL(b); } catch (e) { delete target[k]; }
} else {
delete target[k];
}
if (--pending === 0) finish();
});
}
});
finish();
}
function kaWithTimeout(p, ms) {
return new Promise(function (resolve, reject) {
let done = false;
const t = setTimeout(function () { if (!done) { done = true; const te = new Error('ka-timeout'); te.kaTimeout = true; reject(te); } }, ms);
try {
const pr = (typeof p === 'function') ? p() : p;
Promise.resolve(pr).then(function (v) { if (!done) { done = true; clearTimeout(t); resolve(v); } },
function (e) { if (!done) { done = true; clearTimeout(t); reject(e); } });
} catch (e) { if (!done) { done = true; clearTimeout(t); reject(e); } }
});
}
function kaSWReady() {
if (!('serviceWorker' in navigator) || !navigator.serviceWorker) return Promise.resolve(null);
const start = function () {
return navigator.serviceWorker.getRegistration().then(function (reg) {
return (reg && reg.active) ? reg : null;
}).catch(function () { return null; }).then(function (reg) {
if (reg) return reg;
try { navigator.serviceWorker.register('./sw.js').catch(function () {}); } catch (e) {}
return kaWithTimeout(navigator.serviceWorker.ready, 4000).then(function (r2) {
return r2 || null;
}).catch(function () { return null; });
});
};
return kaWithTimeout(start(), 5000).catch(function () { return null; });
}
let lastNotifyChannel = '';   // 'sw' | 'page' | 'none'：最近一次实际通道
;
let notifyUnsettled = 0;      // FIX 2026-09-25 #1241：本会话「通知已交出、内核回执未落地」的次数（诊断点名用）
;
let swLaterQueue = [];        // FIX 2026-09-20 #921：待补发队列——原单发闸在等待窗内只收第一条，
let swLaterTimer = null;      // 「就绪即补发」等待窗（同时只挂一个定时器，到点统一 flush）
function swNotifyNote(ch, chanOut) {
lastNotifyChannel = ch;
if (typeof chanOut === 'function') { try { chanOut(ch); } catch (e) {} }
}
function swLaterFlush(reg) {
if (!swLaterTimer) return; // 已 flush 过（ready 与 60s 到点谁先到都只跑一次）
clearTimeout(swLaterTimer); swLaterTimer = null;
if (document.visibilityState !== 'hidden') {
for (let i = 0; i < swLaterQueue.length; i++) swNotifyNote('none', swLaterQueue[i].chanOut);
swLaterQueue = [];
return;
}
const q = swLaterQueue; swLaterQueue = [];
if (!reg) {
for (let i = 0; i < q.length; i++) swNotifyNote('none', q[i].chanOut);
chanDownPending += q.length;
tryShowNotifyHealBar();
return;
}
chanDownPending = 0;
try { const hb = document.getElementById('notify-heal-bar'); if (hb) hb.hidden = true; } catch (e) {}
for (let i = 0; i < q.length; i++) {
const o = Object.assign({}, q[i].opts);
delete o.image; delete o.icon; delete o.badge;
if (!o.urgency) o.urgency = 'high';
try { reg.showNotification(q[i].title, o); swNotifyNote('sw', q[i].chanOut); } catch (e) { swNotifyNote('none', q[i].chanOut); }
}
}
function swNotifyLater(title, opts, chanOut) {
if (!('serviceWorker' in navigator) || !navigator.serviceWorker) { swNotifyNote('none', chanOut); return; }
swLaterQueue.push({ title: title, opts: opts, chanOut: chanOut });
if (swLaterTimer) return;
swLaterTimer = setTimeout(function () { swLaterFlush(null); }, 60000);
kaWithTimeout(navigator.serviceWorker.ready, 60000).then(swLaterFlush, function () { swLaterFlush(null); });
}
let chanDownPending = 0;
let chanDownShown = 0;
let chanDownDismissAt = 0;
function chanSplashGone() {
const s = document.getElementById('splash');
return !s || !s.isConnected || s.classList.contains('gone');
}
function tryShowNotifyHealBar() {
if (!chanDownPending) return;
if (document.visibilityState !== 'visible' || !chanSplashGone()) return;
const n = chanDownPending; chanDownPending = 0;
if (chanDownShown >= 2 || Date.now() - chanDownDismissAt < 12 * 3600 * 1000) return;
chanDownShown++;
const bar = __bgEnsureHealBar();
const txt = document.getElementById('notify-heal-txt');
if (txt) txt.textContent = '⚠ 后台通知通道未就绪：刚才有 ' + n + ' 条消息没能弹出。点「立即刷新」恢复；无效请彻底关闭浏览器后重开';
bar.hidden = false;
const act = document.getElementById('notify-heal-refresh');
if (act) act.onclick = function () { try { location.reload(); } catch (e) {} };
const close = document.getElementById('notify-heal-close');
if (close) close.onclick = function () { chanDownDismissAt = Date.now(); bar.hidden = true; };
}
document.addEventListener('visibilitychange', function () {
if (document.visibilityState !== 'visible') return;
setTimeout(tryShowNotifyHealBar, 800); // 回前台补出条（隐藏期间发生的丢失也提示）；错开回前台渲染高峰
});
// 通知有两条通道：APK 里走手机系统（Capacitor LocalNotifications），浏览器/PWA 里走 Web Notification。
// Android WebView 根本不实现 Web Notifications（window.Notification 不存在），历轮所有门禁都只问它，
// 于是包里那条真能弹的原生通道永远走不到——门必须在动手之前先问对东西。
function bgNativeCh() {
try {
const LC = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications;
// 没注册的插件在 Capacitor 里是一枚「一取属性就抛」的代理，所以两次探测都要包在 try 里
if (!LC || typeof LC.schedule !== 'function' || typeof LC.checkPermissions !== 'function') return null;
return LC;
} catch (e) { return null; }
}
function bgNativePermSet(st) {
window.__bgNativePerm = st;
try { nbSyncPermWarn(); } catch (e) {}
}
function bgNativePermProbe(cb) {
const LC = bgNativeCh();
if (!LC) { bgNativePermSet('unsupported'); if (cb) cb('unsupported'); return; }
let done = false;
const finish = function (st) {
if (done) return;
done = true;
bgNativePermSet(st);
if (cb) cb(st);
};
// 原生不回执（老插件／桥断了）时不许把状态永久挂在「没查过」，否则每一条消息都被「没查过」挡掉
const soft = function () { finish(window.__bgNativePerm === 'granted' ? 'granted' : 'default'); };
try {
LC.checkPermissions().then(function (p) {
const v = p && p.notifications;
finish(v === 'granted' ? 'granted' : (v === 'denied' ? 'denied' : 'default'));
}, soft);
} catch (e) { soft(); return; }
setTimeout(soft, 8000);
}
function bgNotifyAllowed() {
if (bgNativeCh()) {
// 'unsupported' 是「刚才没桥、现在有了」那种历史值，不能当终局（Capacitor 的桥可能晚于本模块就绪）
if (window.__bgNativePerm === undefined || window.__bgNativePerm === 'unsupported') bgNativePermProbe(null);
return window.__bgNativePerm === 'granted';
}
return ('Notification' in window) && Notification.permission === 'granted';
}
// 原生通知的「点一下直达那本会话」：Web 那侧由 sw 的 notificationclick 记账，这边得自己接事件
function bgNativeTapBind() {
const LC = bgNativeCh();
if (!LC || typeof LC.addListener !== 'function') return;
let bound = false;
try { bound = !!LC.__ordinalTapBound; } catch (e) {}
if (bound) return;
try { LC.__ordinalTapBound = true; } catch (e2) {}
try {
LC.addListener('localNotificationActionPerformed', function (res) {
try {
const n = res && res.notification;
const tag = n && n.extra ? String(n.extra.tag || '') : '';
if (!tag) return;
notifyRoute(notifyConsume(tag) || notifyEntryFromTag(tag));
} catch (e3) {}
});
} catch (e4) {}
}
if (bgNativeCh()) bgNativePermProbe(null);   // 早一步查，第一批消息不至于撞在「还没查过」上
function showSysNotification(title, opts, chanOut) {
opts = opts || {};
const note = function (ch) {
lastNotifyChannel = ch;
if (typeof chanOut === 'function') { try { chanOut(ch); } catch (e) {} }
};
return new Promise(function (resolve) {
try {
try {
const LC = bgNativeCh();
if (LC) {
bgNativeTapBind();
const nid = (Date.now() % 2000000000) + 1 + Math.floor(Math.random() * 999);
// 通道名先落定：这一发确实是交给系统的，成败由 resolve 说＝拒收时测试那行才指得对地方（说浏览器是假话）
note('native');
try {
// 原生这边只认 title/body/extra：头像与夹图 dataURL 交不进系统通知（要附件得先落地成本机资源）
LC.schedule({ notifications: [{ id: nid, title: title, body: String(opts.body || ''), autoCancel: true, extra: { tag: String(opts.tag || '') } }] })
.then(function () { resolve(true); }, function () { resolve(false); });
} catch (eN) { resolve(false); }
return;
}
} catch (eLC) {}
if (!('Notification' in window) || Notification.permission !== 'granted') { note('none'); resolve(false); return; }
const hidden = document.visibilityState === 'hidden';
const pageFallback = function () {
const noMedia = Object.assign({}, opts);
delete noMedia.image;
delete noMedia.icon;
delete noMedia.badge;
note('page');
try {
new Notification(title, noMedia);
resolve(!hidden);
} catch (e) { note('none'); resolve(false); }
};
if ('serviceWorker' in navigator && navigator.serviceWorker) {
const swOpts = Object.assign({}, opts);
if (!swOpts.urgency) swOpts.urgency = 'high';
if (!swOpts.badge) swOpts.badge = BADGE_DATAURL || NOTIFY_ICON || undefined;
kaSWReady().then(function (reg) {
if (!reg) { if (hidden) { swNotifyLater(title, opts, chanOut); note('none'); resolve(false); } else { pageFallback(); } return; }
const STRIP_LADDER = [[], ['image'], ['image', 'badge'], ['image', 'badge', 'icon']];
let ladderIdx = 0;
const tryNext = function () {
if (ladderIdx >= STRIP_LADDER.length) { note('none'); resolve(false); return; }
const attempt = Object.assign({}, swOpts);
STRIP_LADDER[ladderIdx++].forEach(function (k) { delete attempt[k]; });
prepMediaBlobs(attempt, function () {
kaWithTimeout(function () { return reg.showNotification(title, attempt); }, 4000)
.then(function () { note('sw'); resolve(true); }, function (e) {
if (e && e.kaTimeout) { notifyUnsettled++; note('sw'); resolve(true); return; } // #1241 回执未落地＝按已挂出收手，绝不重发（旧写法退回 tryNext＝四级阶梯弹四条）
tryNext();
});
});
};
tryNext();
}).catch(pageFallback);
} else {
pageFallback();
}
} catch (e) { note('none'); resolve(false); }
});
}
function requestNotifyPermission(cb, failCb, opts) {
const quiet = !!(opts && opts.quiet);
const say = function (m) { if (!quiet) toast(m); };
const fail = function (why) { if (failCb) failCb(why); };
try {
const LC = bgNativeCh();
if (LC) {
const ok = function (v) { return v === 'granted' || v === 'withprovision'; };
const done = function (st) {
bgNativePermSet(st);
if (st === 'granted') { if (cb) cb(); } else fail(st === 'denied' ? 'denied' : 'error');
};
try {
LC.checkPermissions().then(function (p) {
const v = p && p.notifications;
if (ok(v)) { done('granted'); return; }
if (typeof LC.requestPermissions !== 'function') { done('denied'); return; }
LC.requestPermissions().then(function (p2) {
const v2 = p2 && p2.notifications;
if (ok(v2)) done('granted');
else done(v2 === 'prompt' || v2 === 'undetermined' ? 'default' : 'denied');   // 还没问过 ≠ 被你拒绝，别把它钉成 denied
}, function () { done('denied'); });
}, function () { done('denied'); });
} catch (eN) { done('denied'); }
return;
}
} catch (eC) {}
if (!('Notification' in window)) {
const _isIOS = __bgIsIOS();
say(_isIOS
? 'iPhone / iPad 在 Safari 标签页里没有系统通知能力\n请到 Safari「添加到主屏幕」，之后从桌面图标打开本站再开这个开关；期间可先用「桌面消息弹窗」'
: '当前浏览器不支持系统通知\n请改用 Chrome/Edge 打开本站（安卓或电脑都行）');
fail('unsupported');
return;
}
if (Notification.permission === 'granted') { if (cb) cb(); return; }
if (Notification.permission !== 'default') {
say('通知权限被拒绝，请在浏览器设置中允许通知');
fail('denied');
return;
}
try {
let settled = false;
const once = function (p) {
if (settled) return;
settled = true;
if (p === 'granted') { if (cb) cb(); return; }
if (p === 'denied') { say('通知权限被拒绝，请在浏览器设置中允许通知'); fail('denied'); return; }
say('还没拿到通知权限：请在浏览器弹窗里点「允许」（地址栏左侧图标 → 网站设置 → 通知）');
fail('pending');
};
const ret = Notification.requestPermission(once);
if (ret && typeof ret.then === 'function') {
ret.then(function (p) { once(p); }, function () { once('error'); });
}
} catch (e) { fail('error'); }
}
const ndBtn = document.getElementById('bgNotifyNoDedup');
let ndUserTouched = false;
function syncNoDedupUI() { if (ndBtn) ndBtn.checked = (gGet('bg-notify-nodedup') === '1'); }
if (ndBtn) {
syncNoDedupUI();
ndBtn.addEventListener('change', function (e) {
if (!kaUserGesture(e)) { syncNoDedupUI(); return; }
ndUserTouched = true;
if (ndBtn.checked) { gSet('bg-notify-nodedup', '1'); toast('已开启：以后每条消息都单独弹通知（内容重复时会连环弹）'); }
else { gSet('bg-notify-nodedup', '0'); toast('已关闭：恢复去重（内容相同或近期弹过的只弹一条）'); }
});
}
const nbBtn = document.getElementById('bgNotify');
function syncNotifyUI() { if (nbBtn) nbBtn.checked = notifyEnabled; }
function nbPermState() {
try {
if (bgNativeCh()) {
// 「插件在不在」不等于「权限给没给」：安卓 13 起这是运行时权限，必须真去 checkPermissions()
if (window.__bgNativePerm === undefined || window.__bgNativePerm === 'unsupported') bgNativePermProbe(null);
return window.__bgNativePerm === undefined ? 'default' : window.__bgNativePerm;
}
return ('Notification' in window) ? Notification.permission : 'unsupported';
} catch (e) { return 'unsupported'; }
}
// 原生通道下那几条「去浏览器网站设置里允许」的指路全是假话，换成系统设置的口径（网页侧返回空串＝沿用原文）
function bgPermNativeNote(why) {
if (!bgNativeCh()) return '';
return why === 'denied'
? '⚠ 系统没给 言字卡 通知权限（安卓 13 起是运行时权限，拒绝过一次就不再弹）\n手机 设置 → 应用 → 言字卡 → 通知 → 允许\n开关已记住你的选择：允许后自动生效，不用再点一次开关'
: '⚠ 还没给 言字卡 通知权限\n手机 设置 → 应用 → 言字卡 → 通知 → 允许（没允许之前，后台消息不会弹窗）';
}
// 权限可能在手机设置里被改过：等待窗里隔几秒真去问一次（已经好了就不打扰）
function bgNativeRefreshProbe() {
if (!bgNativeCh() || window.__bgNativePerm === 'granted') return;
bgNativePermProbe(null);
}
const NB_SETTLE_MS = 12000; // 待决等待上限：覆盖「系统弹窗弹着、用户过几秒才点允许」的正常窗口
let nbAttempt = 0;          // 每轮「用户动开关」的代号：回调/轮询只认自己那一轮，过期即弃
let nbSettleTimer = null;
let nbSettlePoke = null;    // 待决轮询的「探一脚」入口（回前台/重新聚焦时立刻补查）
let nbAppliedFor = 0;       // 已落地的轮次（granted 可能从回调与轮询两边同时到）
function nbAttemptNext() {
nbAttempt++;
if (nbSettleTimer) { clearTimeout(nbSettleTimer); nbSettleTimer = null; }
nbSettlePoke = null;
return nbAttempt;
}
function nbRevertOff() { notifyEnabled = false; gSet('bg-notify', '0'); syncNotifyUI(); }
function nbApplyOn(my) {
if (my !== nbAttempt || nbAppliedFor === my) return;
nbAppliedFor = my;
notifyEnabled = true;
gSet('bg-notify', '1');
syncNotifyUI();
nbSyncPermWarn();   // #1014：权限已到位，撤掉行下那条标红说明（否则权限好了还挂着「还挡着」）
showSysNotification('通知已开启', { body: '后台消息提醒将正常弹窗' });
if (kaIsIOS()) setTimeout(function () { toast('iPhone 提示：受系统限制，后台弹窗不保证弹出；消息不会丢，回来自动补看'); }, 1600);
setTimeout(function () {
const keep = document.getElementById('bgKeepAlive');
const keepOn = keepEnabled;
const userWantsKeepOff = gGet('bg-keepalive') === '0' || gGet('__ka-user-off') === '1';
if (!keepOn && userWantsKeepOff) {
toast('你已手动关闭「后台保活」，保持你的设置；但后台消息可能收不到通知，需要时请手动开启');
} else if (!keepOn) {
if (keep) keep.checked = true;
keepEnabled = true;
gSet('bg-keepalive', '1');
gSet('__ka-user-off', '0');
startKeepAlive(false);
syncKeepUI();
toast('已自动开启后台保活（后台消息必需）');
}
if (!bgNativeCh() && location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
toast('提醒：需 HTTPS 访问，浏览器才允许通知');
}
}, 400);
}
function nbNoticeOnce(key, msg) {
try { if (kaNoticeCool(key, 60 * 1000)) return; kaNoticeStamp(key); } catch (e) {}
toast(msg, 7000);
}
function nbPermWarnText() {
const p = nbPermState();
if (p === 'unsupported') {
return __bgIsIOS()
? '⚠ 本机没有网页通知能力（iPhone / iPad 的能力只在「Safari → 添加到主屏幕」后的独立应用形态里，Safari 标签页里没有）：装过去再回来开这个开关；期间请靠「桌面消息弹窗」的应用内横幅'
: '⚠ 本机浏览器没有通知能力（小米 / vivo / OPPO 自带浏览器、UC、夸克、Via 常见如此）：请改用 Chrome / Edge 打开本站';
}
if (!notifyEnabled) return '';
if (p === 'denied') { const nt = bgPermNativeNote('denied'); if (nt) return nt; return '⚠ 浏览器已把本站通知记成「屏蔽」（授权框反复弹出后 Chrome 会自动挡，多半不是你点了拒绝）。两条路恢复：① 地址栏左侧图标 → 权限 → 通知 → 改「允许」；② Chrome 右上角 ⋮ → 设置 → 网站设置 → 通知 → 「添加网站例外」→ 输入本站网址。改了仍不弹＝Chrome 对本站的自动屏蔽无法解除：请换 Edge / 电脑打开本站（聊天记录可在 设置 → 数据 导出 / 导入 迁移）。允许后自动生效，不用再点开关；从主屏幕图标打开的（已安装应用）：长按图标卸载后重新「添加到主屏幕」即可重置授权'; }
if (p === 'default') { const nd = bgPermNativeNote('default'); if (nd) return nd; return '⚠ 还没给本站通知权限：点「测试」或开关会请求一次；没弹授权框＝Chrome 对弹过多次的站静默拒绝。两条路手动恢复：① 地址栏左侧图标 → 权限 → 通知 → 允许；② Chrome ⋮ → 设置 → 网站设置 → 通知 → 「添加网站例外」→ 输入本站网址。允许后自动生效；从主屏幕图标打开的（已安装应用）：卸载后重新「添加到主屏幕」可重置授权'; }
return '';
}
function nbSyncPermWarn() {
try {
const el = document.getElementById('bgNotifyPermWarn');
if (!el) return;
const t = nbPermWarnText();
el.textContent = t;
el.hidden = !t;
} catch (e) {}
}
let nbWaitingGrant = false;   // 意图在、权限没到位＝正等一个授权（等到了自动生效）
let nbWatchTimer = null;
let nbWatchFor = -1;          // 等待窗属于哪一轮（同轮不重挂，见 nbArmWatch）
function nbArmWatch(my) {
const p0 = nbPermState();
if (bgNativeCh() && window.__bgNativePerm === undefined) return;   // 还没查到＝不许把「没查过」当「没允许」（否则每次冷启动都会补一声「通知已开启」）
const want = !!notifyEnabled && (p0 === 'denied' || p0 === 'default');
if (nbWatchTimer && nbWaitingGrant && nbWatchFor === my && want) return;
if (nbWatchTimer) { clearTimeout(nbWatchTimer); nbWatchTimer = null; }
nbWaitingGrant = want;
nbWatchFor = my;
if (!nbWaitingGrant) return;
let ticks = 0;
const tick = function () {
nbWatchTimer = null;
if (my !== nbAttempt || !notifyEnabled) { nbWaitingGrant = false; return; }
bgNativeRefreshProbe();   // 系统里的授权可能在页面外被改，隔 5 秒真去问一次
const p = nbPermState();
try { nbSyncPermWarn(); } catch (e) {}   // #1014：读数为 default/unsupported 时标红说明也要跟着变
if (p === 'granted') { nbWaitingGrant = false; nbApplyOn(my); return; }
if (p === 'unsupported' || ++ticks >= 24) { nbWaitingGrant = false; return; }  // 2 分钟封顶，不做永动机
nbWatchTimer = setTimeout(tick, 5000);
};
nbWatchTimer = setTimeout(tick, 5000);
}
function nbHoldOn(my, why) {
if (my !== nbAttempt) return;
notifyEnabled = true;
gSet('bg-notify', '1');
syncNotifyUI();
nbSyncPermWarn();
nbArmWatch(my);
if (why === 'denied') {
nbNoticeOnce('__nb-denied-note-at', bgPermNativeNote('denied') ||
'⚠ 浏览器这次没放行通知权限（可能没弹授权框就直接挡了）\n地址栏左侧图标 → 网站设置 → 通知 → 允许；列表里没有本站就在「允许」里手动添加本站网址\n开关已记住你的选择：允许后自动生效，不用再点一次开关');
}
nbArmRetry(my);
}
function nbSettleStart(my, quiet) {
const start = Date.now();
const tick = function () {
if (my !== nbAttempt) return;
if (nbSettleTimer) { clearTimeout(nbSettleTimer); nbSettleTimer = null; }
bgNativeRefreshProbe();
const p = nbPermState();
if (p === 'granted') { nbSettlePoke = null; nbApplyOn(my); return; }
if (p === 'denied') {
nbSettlePoke = null;
nbHoldOn(my, 'denied');
return;
}
if (Date.now() - start < NB_SETTLE_MS) {
nbSettleTimer = setTimeout(tick, (Date.now() - start) < 3000 ? 600 : 2000);
return;
}
nbSettlePoke = null;
if (!quiet) toast(bgNativeCh() ? '通知权限还没定下来：手机 设置 → 应用 → 言字卡 → 通知 → 允许；开关已为你保持开启，允许后自动生效' : '通知权限还没定下来：地址栏左侧图标 → 网站设置 → 通知 → 允许；开关已为你保持开启，允许后自动生效');
nbArmRetry(my);
};
nbSettlePoke = tick;
nbSettleTimer = setTimeout(tick, 600);
}
let nbRetryTap = null;
let nbRetryUsed = 0;   // 哪一轮已经用过「下一次点按」这次机会
function nbArmRetry(my) {
if (nbRetryTap) {   // 单例：先撤掉上一份（同轮重复收口不得叠加监听）
try {
document.removeEventListener('pointerdown', nbRetryTap, true);
document.removeEventListener('keydown', nbRetryTap, true);
} catch (e) {}
nbRetryTap = null;
}
if (my !== nbAttempt || !notifyEnabled || nbPermState() !== 'default') return;
if (nbRetryUsed === my) return;
const onTap = function () {
document.removeEventListener('pointerdown', onTap, true);
document.removeEventListener('keydown', onTap, true);
if (nbRetryTap === onTap) nbRetryTap = null;
if (my !== nbAttempt) return;
bgNativeRefreshProbe();
const p = nbPermState();
if (p === 'granted') { nbApplyOn(my); return; }
if (p === 'denied') { nbHoldOn(my, 'denied'); return; }   // FIX #1014：同上，不回弹
if (p !== 'default') return;
nbRetryUsed = my;   // 这一轮的机会用掉了（用户再动一次开关才会换新的一轮）
requestNotifyPermission(null, function () {}, { quiet: true });
nbSettleStart(my, true);
};
nbRetryTap = onTap;
document.addEventListener('pointerdown', onTap, true);
document.addEventListener('keydown', onTap, true);
}
function nbPermRecheck() {
try { if (bgNativeCh()) bgNativePermProbe(null); } catch (eN) {}   // 授权可能在手机设置里被改过（含「本来是有的、被关了」），回场真去问一次
try { if (nbSettlePoke) nbSettlePoke(); } catch (e) {}
try { if (nbWaitingGrant && notifyEnabled && nbPermState() === 'granted') { nbWaitingGrant = false; nbApplyOn(nbAttempt); } } catch (e) {}
try { nbSyncPermWarn(); } catch (e) {}
}
try { window.addEventListener('focus', nbPermRecheck); } catch (e) {}
if (nbBtn) {
nbBtn.addEventListener('change', function (e) {
if (!kaUserGesture(e)) { syncNotifyUI(); try { nbBtn.checked = notifyEnabled; } catch (er) {} return; }
notifyUserTouched = true; // #88：手动动过 → 回填后不再重读覆盖
const my = nbAttemptNext();
if (nbBtn.checked) {
const p0 = nbPermState();
notifyEnabled = true;
gSet('bg-notify', '1');
syncNotifyUI();
nbSyncPermWarn();
if (p0 === 'unsupported') {
requestNotifyPermission(null, function () {
if (my !== nbAttempt) return;
nbAttemptNext(); nbRevertOff();
});
return;
}
requestNotifyPermission(function () {
if (my !== nbAttempt) return;
nbApplyOn(my);
}, function (why) {
nbHoldOn(my, why);
});
if (p0 === 'default') nbSettleStart(my, false);
return;
}
notifyEnabled = false;
gSet('bg-notify', '0');
nbWaitingGrant = false;
if (nbWatchTimer) { clearTimeout(nbWatchTimer); nbWatchTimer = null; }
nbAttemptNext();
syncNotifyUI();
nbSyncPermWarn();
});
}
__bgWhenData(function () {
notifyEnabled = gGet('bg-notify') === '1';
if (bgNotifyAllowed()) { getBadgeUrl(function () {}); }
syncNotifyUI();
nbSyncPermWarn();
if (notifyEnabled) nbArmWatch(nbAttempt);
});
function reheatBgSwitches() {
try { if (!ndUserTouched) syncNoDedupUI(); } catch (e) {}
if (!keepUserTouched) {
const wantKeep = gGet('bg-keepalive') === '1' && gGet('__ka-user-off') !== '1';
if (wantKeep !== keepEnabled) {
keepEnabled = wantKeep;
syncKeepUI();
if (wantKeep) startKeepAlive(false);
else stopKeepAlive(false);
try { console.info('[mochi] #88 回填后重读后台保活：' + (wantKeep ? '开' : '关')); } catch (e) {}
}
}
if (!notifyUserTouched) {
const wantNotify = gGet('bg-notify') === '1';
if (wantNotify !== notifyEnabled) {
notifyEnabled = wantNotify;
syncNotifyUI();
if (wantNotify) getBadgeUrl(function () {}); // 预热 badge 单色图（同初始化）
try { console.info('[mochi] #88 回填后重读后台通知：' + (wantNotify ? '开' : '关')); } catch (e) {}
}
try { nbSyncPermWarn(); } catch (e) {}
try { nbArmWatch(nbAttempt); } catch (e) {}
}
}
try {
document.addEventListener('ordinal-data-ready', function () { reheatBgSwitches(); });
document.addEventListener('mochi-wrj-heal', function () { reheatBgSwitches(); });
setTimeout(reheatBgSwitches, 16000); // 回填整体挂起设备的兜底
} catch (e) {}
const testBtn = document.getElementById('testNotify');
if (testBtn) {
let testSeq = 0;          // 每轮点按的代号：迟到的异步结论只认自己那一轮
let env = [];             // 结果行（第一段写满即出，后续证据原地追加）
let resultShown = false;  // 结果单飞闸（发送/超时/队列回读三路只出一次，之后只改内容）
let verStale = false;     // 旧包（#761）——排查步骤据此把「先升级」排在第一位
const showResult = function () {
if (!env.length) return;
resultShown = true;
toast('测试结果：\n' + env.join('\n'), 6000);
try { const el = document.getElementById('bgTestResult'); if (el) el.textContent = env.join('\n'); } catch (e2) {}
};
const pushLine = function (line) {
if (env.indexOf(line) >= 0) return;
env.push(line);
if (resultShown) showResult();   // 已出过结果：原地重写同一条 toast（不重开一条，不动驻留窗口语义）
};
const envCheck = function () {
env = [];
resultShown = false;
verStale = !!window.__updStale;   // 由 js/update-check.js 比过 version.json 才置真（file:// 与 apk 里拿不到线上版本＝这条恒 false，不猜「你这就是旧包」）
env.push(notifyEnabled
? '✓ 后台通知开关：已开启'
: '✗ 后台通知开关：未开启——后台消息不会弹通知（点本行开关把它打开）');
const p = nbPermState();
const NAT = !!bgNativeCh();
if (NAT) env.push('· 通知通道：系统原生（直接交给手机的通知栏，不吃浏览器权限）');
if (p === 'granted') env.push('✓ 通知权限：已允许');
else if (NAT) env.push(p === 'denied'
? '✗ 通知权限：系统里被关着——手机 设置 → 应用 → 言字卡 → 通知 → 允许（拒绝过一次后手机不再弹授权框，只能去设置里开）'
: '✗ 通知权限：还没允许——点「测试」会弹授权框，或去 手机 设置 → 应用 → 言字卡 → 通知 → 允许');
else if (p === 'default') env.push('✗ 通知权限：还没允许——地址栏左侧图标 → 网站设置 → 通知 → 允许');
else if (p === 'denied') env.push('✗ 通知权限：被浏览器挡着——地址栏左侧图标 → 网站设置 → 通知 → 允许（允许后自动生效）');
else env.push('✗ 通知权限：本机浏览器没有通知能力——请改用 Chrome / Edge（安卓或电脑都行）');
let kp = null;
try { kp = (typeof window.__kaProbe === 'function') ? window.__kaProbe() : null; } catch (e) {}
if (!kp || !kp.keep) env.push('✗ 后台保活：未开启（后台不产生消息，通知无从弹起）');
else {
env.push((kp.audio && !kp.audio.paused) ? '✓ 后台保活：音频播放中' : '! 后台保活：音频已暂停（回本页自动恢复；后台消息可能到不了）');
const anchor = [];
if (kp.ms && kp.ms.metadata) anchor.push('媒体会话');
if (kp.pc && kp.pc !== 'off') anchor.push('连接保活');
if (kp.hb && kp.hb.n) anchor.push('心跳 ' + kp.hb.n + ' 拍');
if (anchor.length) env.push('· 保活锚点：' + anchor.join(' / '));
if (kp.ev && (kp.ev.stall || kp.ev.died)) env.push('! 历史取证：断流 ' + kp.ev.stall + ' 次 / 后台终止 ' + kp.ev.died + ' 次（被系统冻结或丢弃过——恢复口径见本行「功能说明」）');
}
if (NAT) env.push('· 后台服务：本包走系统原生通道，不依赖 Service Worker（那一条是浏览器/PWA 才需要的）');
else try {
kaSWReady().then(function (reg) {
pushLine(reg
? '✓ 后台服务：已就绪（Service Worker 通道，切后台 / 关屏也能弹）'
: '! 后台服务：未就绪——只会走页面通道，切后台就不弹了（刷新页面后重测）');
});
} catch (e) {}
};
const queueProbe = function (wasHidden) {
kaSWReady().then(function (reg) {
if (!reg || !reg.getNotifications) return null;
return new Promise(function (res) {
setTimeout(function () {
try { reg.getNotifications().then(res, function () { res(null); }); } catch (e) { res(null); }
}, 500);
});
}).then(function (list) {
const found = !!(list && list.some && list.some(function (n) { return n && n.title === '后台通知测试'; }));
pushLine(found
? '✓ 已确认进入系统通知队列——手机上没看到＝系统层拦截（通知总开关/悬浮横幅/省电限制），见本行「功能说明」排查'
: '! 已提交但未进系统通知队列＝多半被系统拦截，见本行「功能说明」排查');
if (found && wasHidden) {
pushLine('✓ 发送时页面在后台——屏幕上方应有横幅；没看见＝系统层拦截（通知总开关/悬浮横幅/省电限制）见本行「功能说明」');
} else if (found) {
pushLine('! 前台发送不弹顶层横幅——要验「屏幕上方弹出」请用下方第二段：按 Home 切后台（或锁屏）再发一条');
}
}).catch(function () {});
};
const verProbe = function () {};
const askSeen = function (phase2) {
if (typeof __bgOpenModal !== 'function') return;
__bgOpenModal('自检确认', '', function (choice) {
if (choice === 'seen') {
toast(phase2 ? '✓ 后台弹窗链路全通：切后台（锁屏）也能弹横幅' : '✓ 弹窗链路全通：以后后台消息没弹时，先回来点这个测试', 4000);
return;
}
if (choice !== 'miss') return;
const MARKS = ['①', '②', '③', '④', '⑤', '⑥'];
const steps = [];
const push = function (s) { steps.push(MARKS[steps.length] + ' ' + s); };
if (verStale) push('先升级：开屏公告那一行已经写着「线上已有新版 · 点按刷新进入」——按它（或彻底关闭浏览器再重开），旧包＝「没改任何东西弹窗突然全没」的头号原因');
push('先关勿扰/免打扰：手机系统的「勿扰/免打扰」（iPhone 叫「专注模式」：勿扰·睡眠·驾驶·工作）会把所有应用的通知静默收进通知栏——屏幕上方不弹横幅，而网页读不到它的状态，所以体检全绿你也可能什么都没看到。先看下拉通知栏里有没有刚才那条测试通知：有＝被系统压住了，不是链路坏了，去系统设置关掉勿扰（或在勿扰里把本浏览器/桌面上的 言字卡 加进「允许的应用/例外」）；顺手确认这条通知没被长按成「静默/减少干扰」、浏览器「网站通知」那一类没单独关掉、iPhone 没开「定时推送摘要」');
push('重置浏览器通知权限：浏览器设置 → 网站设置 → 通知 → 把本站「关闭」再「允许」，然后强杀浏览器重开（「权限明明开着、通知却消失好几天」多数被这一步救活——JS 读到的一直是 granted，坏的是浏览器内部那条通道）');
push('系统通知设置：系统设置 → 通知管理 → 本浏览器 → 总开关打开、「允许横幅通知/在屏幕上方显示」打开、通知重要性选「提醒」；国产 ROM（vivo/OPPO/小米/华为）每项可能各自独立');
push('省电限制：允许本浏览器后台运行/关闭对它的省电优化（否则挂后台时整页被冻结，消息与通知都无从产生）；Edge 的「睡眠标签页」/Chrome 的「内存节省程序」默认把挂后台约 30 分钟的页面丢弃重载（表现＝回来时页面自动刷新、保活/通知可能被重置）——浏览器设置里把本站加入「永不睡眠/始终保持活动」名单');
steps.push('每做完一步就按 Home 键把页面切到后台、让 TA 发一条消息验证；全部走完仍不弹 → 用「信息诊断」里的反馈入口一键上报');
__bgOpenModal('没弹出 → 按顺序排查（实效从高到低）', '', function () {}, {
noInput: true, big: true,
staticText: steps.join('\n')
});
}, {
noInput: true, lock: true,
staticText: (phase2
? '刚才按 Home 把页面切到后台（或锁屏）之后，屏幕上方弹出「后台通知测试（后台阶段）」这条横幅了吗？\n（通知栏里有小图标 ≠ 屏幕上方弹出；锁屏界面上的通知算弹出）'
: '刚才屏幕上方弹出「后台通知测试」横幅了吗？\n（通知栏里有小图标 ≠ 屏幕上方弹出；前台发送通常只进通知栏，要验横幅请用第二段：按 Home 切后台后再测一次）'),
pills: [{ label: '看到了，顶部弹出', value: 'seen' }, { label: '没看到', value: 'miss' }],
pillSubmit: true
});
};
const bgT2 = { armed: false, sent: false, done: false, ok: false, chan: '', reported: false, hideT: null, disarmT: null };
const bgT2Arm = function () {
if (bgT2.armed && !bgT2.sent) return;
if (bgT2.hideT) { clearTimeout(bgT2.hideT); bgT2.hideT = null; }
bgT2.armed = true; bgT2.sent = false; bgT2.done = false; bgT2.ok = false; bgT2.chan = ''; bgT2.reported = false;
toast('第二段已就绪：按 Home 把页面切到后台（可锁屏），5 秒后自动发一条；回到本页看结论', 7000);
if (bgT2.disarmT) clearTimeout(bgT2.disarmT);
bgT2.disarmT = setTimeout(function () { if (!bgT2.sent) bgT2.armed = false; }, 180000); // 3 分钟没切后台就作废
};
const bgT2Report = function () {
if (!bgT2.armed || !bgT2.sent || !bgT2.done || bgT2.reported) return;   // #1017：未落定不下结论
if (document.visibilityState === 'hidden') return;   // 后台弹的 toast 用户看不见，等回前台再说
bgT2.reported = true;
bgT2.armed = false;
if (bgT2.disarmT) { clearTimeout(bgT2.disarmT); bgT2.disarmT = null; }
const chTxt = bgT2.chan === 'sw' ? 'Service Worker 通道' : (bgT2.chan === 'native' ? '系统原生通道' : (bgT2.chan === 'page' ? '页面通道（后台会被系统抑制）' : '通道未就绪'));
const sayIt = function () { toast('第二段（后台阶段）结果：\n'
+ (bgT2.ok
? '✓ 页面切到后台后发出的通知已提交系统（' + chTxt + '）\n（通知栏里有小图标 ≠ 屏幕上方弹出，下面请如实回答）'
: '✗ 页面切到后台后没能发出通知（' + chTxt + '）——后台弹窗这一半不通，见本行「功能说明」排查'), 8000); };
setTimeout(sayIt, 700);
if (bgT2.ok) setTimeout(function () { askSeen(true); }, 1800);
};
const offerPhase2 = function () {
if (typeof __bgOpenModal !== 'function') return;
__bgOpenModal('后台弹窗自测 · 第二段', '', function (choice) {
if (choice === 'go') { bgT2Arm(); return; }
if (choice === 'no') askSeen(false);
}, {
noInput: true,
staticText: '第一段测的是「现在能不能发出通知」。第二段测你真正关心的那一半：按 Home 把页面切到后台（可锁屏）之后还会不会弹。\n\n点「现在测（切后台）」后：按 Home → 页面在后台 5 秒后自动发一条 → 回到本页即出结论并问你看没看到。\n（第一段前台发的那条通常只进通知栏，屏幕上方横幅只能这样验）\n点「不用了」＝只测第一段，会照旧问你一句「刚才那条看到了吗」。',
pills: [{ label: '现在测（切后台）', value: 'go' }, { label: '不用了', value: 'no' }],
pillSubmit: true
});
};
document.addEventListener('visibilitychange', function () {
if (!bgT2.armed) return;
if (document.visibilityState === 'hidden') {
if (bgT2.sent || bgT2.hideT) return;
bgT2.hideT = setTimeout(function () {
bgT2.hideT = null;
if (!bgT2.armed || bgT2.sent || document.visibilityState !== 'hidden') return;
bgT2.sent = true;
try {
const nm = partnerName();
showSysNotification('后台通知测试（后台阶段）', { body: '这条是在页面切到后台之后发出的 · 来自 ' + nm }, function (ch) { bgT2.chan = ch; })
.then(function (ok) { bgT2.ok = !!ok; bgT2.done = true; bgT2Report(); });
} catch (e) { bgT2.ok = false; bgT2.done = true; bgT2Report(); }
}, 5000);
return;
}
if (bgT2.hideT) { clearTimeout(bgT2.hideT); bgT2.hideT = null; }
bgT2Report();
});
const runTest = function (my) {
const testWasHidden = document.hidden;   // 发送那一刻在不在后台（决定「屏幕上方横幅」怎么解释）
let testChan = '';
let settled = false;
const settle = function () {
if (my !== testSeq || settled) return;
settled = true;
showResult();
if (testChan === 'sw' || testChan === 'native') offerPhase2();
};
try {
const name = partnerName();
showSysNotification('后台通知测试', { body: '来自 ' + name + ' · 如果能看到这条，后台通知就通了' }, function (ch) { testChan = ch; }).then(function (ok) {
if (my !== testSeq) return;
if (testChan === 'sw' && ok) {
pushLine('✓ 测试通知已发送并真正提交系统显示（Service Worker 通道：后台关屏也能弹）');
} else if (testChan === 'native') {
pushLine(ok
? '✓ 测试通知已交给系统（原生通道：后台关屏也能弹）'
: '✗ 测试通知被系统拒收——手机 设置 → 应用 → 言字卡 → 通知 → 允许（总开关与这一类都要开着）');
} else if (testChan === 'page') {
pushLine(ok
? '✓ 测试通知已发送（页面通道：仅本页前台可见）'
: '! 未真正送达：后台服务未就绪，页面通道在后台会被系统抑制（已挂自动补发，或刷新页面重试）');
} else {
pushLine('✗ 测试通知提交失败：被浏览器/系统拒绝——见本行「功能说明」排查（权限已允许仍被拒＝查系统设置里本浏览器的通知总开关）');
}
settle();
if (testChan === 'sw' && ok) queueProbe(testWasHidden);
verProbe();
});
} catch (e) {
pushLine('✗ 测试执行异常：' + (e && e.message ? e.message : e));
settle();
return;
}
setTimeout(function () {
if (my !== testSeq || settled) return;
settled = true;
pushLine('✗ 测试超时：通知发送链 8 秒未落定（应用内故障，非权限/系统问题）——请用「诊断信息」一键反馈');
showResult();
}, 8000);
};
testBtn.addEventListener('click', function () {
const my = ++testSeq;
toast('正在检查通知环境…');
envCheck();
if (bgNativeCh()) {
// APK 里那条「本机浏览器没有通知能力」是指错了对象：这一包用的是手机系统的通知，去问系统要权限
const pn = nbPermState();
if (pn === 'granted') { runTest(my); return; }
requestNotifyPermission(function () {
if (my !== testSeq) return;
envCheck();
runTest(my);
}, function (why) {
if (my !== testSeq) return;
pushLine(why === 'denied'
? '✗ 通知权限：系统没给——手机 设置 → 应用 → 言字卡 → 通知 → 允许，再点一次测试'
: '✗ 通知权限：这次没能问到（系统没弹授权框或被拦截）——去 手机 设置 → 应用 → 言字卡 → 通知 里直接打开');
showResult();
}, { quiet: true });
return;
}
if (!('Notification' in window)) {
if (!window.isSecureContext) {
pushLine('✗ 当前浏览器不支持 Notification API');
pushLine('原因：' + location.protocol + '//' + location.host + ' 不是安全上下文，浏览器不开放通知能力');
pushLine('解决：用 https:// 部署访问（GitHub Pages 即是 HTTPS）');
} else if (kaIsIOS()) {
pushLine('✗ 当前浏览器不支持 Notification API');
pushLine('原因：iPhone / iPad 的网页通知能力只在「Safari → 添加到主屏幕」后的独立应用形态里提供，Safari 标签页里没有');
pushLine('解决：到 Safari 分享菜单「添加到主屏幕」，之后从桌面图标打开本站再开这个开关；期间可先用 设置 → 系统 →「桌面消息弹窗」的应用内横幅');
} else {
pushLine('✗ 当前浏览器不支持 Notification API');
pushLine('原因：本机浏览器没有通知能力（小米 / vivo / OPPO 等自带浏览器、UC、夸克、Via 常见如此）');
pushLine('解决：改用 Chrome / Edge 打开本站（安卓或电脑都行）');
}
showResult();
return;
}
if (Notification.permission === 'default') {
Notification.requestPermission().then(function (p) {
if (my !== testSeq) return;
if (p === 'granted') { envCheck(); runTest(my); return; }
pushLine('✗ 通知权限：这次没能拿到' + (p === 'denied' ? '（浏览器没放行——可能没弹授权框就直接挡了）' : '（还没在弹窗里做选择）'));
pushLine('解决：地址栏左侧图标 → 网站设置 → 通知 → 允许（开关已记住你的选择，允许后自动生效）');
pushLine('② 若列表里没有本站：Chrome ⋮ → 设置 → 网站设置 → 通知 → 「添加网站例外」→ 输入 ' + location.origin);
pushLine('③ 上面改了还是不行＝Chrome 对本站的自动屏蔽无法解除：换 Edge / 电脑打开本站（数据在 设置 → 数据 导出 / 导入 迁移）');
if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
pushLine('本站当前是「已安装应用」（主屏图标）形态：通知权限由应用自己管理（Chrome 网站设置里不显示本站＝正常）。授权框不出现时——长按主屏图标卸载本应用，重新打开网站「添加到主屏幕」并允许通知，即可重置');
}
showResult();
}).catch(function () {
if (my !== testSeq) return;
pushLine('✗ 请求通知权限失败（浏览器没给授权框）——地址栏左侧图标 → 网站设置 → 通知 → 允许');
showResult();
});
return;
}
runTest(my);
});
}
const NOTIFY_KIND_LABEL = {
msg: '条新消息', checkin: '次查岗', chatreq: '次求聊天', ask: '条提问',
feed: '条新动态', invite: '个申请', call: '次来电', mail: '封来信', wish: '个心愿', other: '条提醒'
};
let hiddenSent = {};
let hiddenSentCount = 0; // 总条数：只用来判「这一场后台发过没有」，文案不再拿它冒充消息数
let hiddenSentName = '';
const sentAdd = function (kind) {
hiddenSentCount++;
hiddenSent[kind] = (hiddenSent[kind] || 0) + 1;
};
const sentReset = function () { hiddenSent = {}; hiddenSentCount = 0; hiddenSentName = ''; };
const sentSummaryText = function () {
const order = ['msg', 'checkin', 'chatreq', 'ask', 'invite', 'call', 'mail', 'wish', 'feed', 'other'];
const parts = [];
order.forEach(function (k) { if (hiddenSent[k]) parts.push(hiddenSent[k] + ' ' + NOTIFY_KIND_LABEL[k]); });
if (!parts.length) return '你不在的时候有 ' + hiddenSentCount + ' 条提醒';
return '你不在的时候收到 ' + parts.join(' · ');
};
const notifyKind = function (extra) {
const k = extra && extra.kind;
return NOTIFY_KIND_LABEL[k] ? k : 'other';
};
const NOTIFY_LEDGER_KEY = '__notify-ledger';
function notifyLedger() {
try {
const raw = gGet(NOTIFY_LEDGER_KEY);
if (!raw) return [];
const a = JSON.parse(raw);
return Array.isArray(a) ? a : [];
} catch (e) { return []; }
}
function notifyLedgerPush(entry) {
try {
const list = notifyLedger().filter(function (x) { return x && x.ts > Date.now() - 6 * 3600 * 1000; });
list.push(entry);
while (list.length > 12) list.shift();
gSet(NOTIFY_LEDGER_KEY, JSON.stringify(list));
} catch (e) {}
}
function notifyConsume(tag) {
try {
const list = notifyLedger();
let hit = null;
for (let i = list.length - 1; i >= 0; i--) {
if (list[i] && list[i].tag === tag) { hit = list[i]; list.splice(i, 1); break; }
}
if (hit) gSet(NOTIFY_LEDGER_KEY, JSON.stringify(list));
return hit;
} catch (e) { return null; }
}
function notifyEntryFromTag(tag) {
try {
const p = String(tag || '').split('|');
if (p[0] !== 'nk' || p.length < 4) return null;
return { kind: p[1], cid: p[2], tag: String(tag) };
} catch (e) { return null; }
}
function notifyRoute(entry) {
const kind = (entry && entry.kind) || '';
const cid = entry && entry.cid;
// cid 那一本要先切过去再进聊天页，否则点通知进来停在的仍是「此刻开着的那本」＝提醒不可执行（BUGS #164）。
// 旧写法调 window.setActiveContact ＋ window.__activeCid——这两个全局在本仓从来没有写手，那道 if 恒假＝一条死路
const goesToChat = kind !== 'mail';
try {
if (goesToChat && cid && cid !== 'default' && typeof switchChat === 'function' && data.chats && data.chats[cid]) {
switchChat(cid);
}
} catch (e) {}
try {
if (kind === 'mail') { try { showView('mailbox'); } catch (e0) {} return true; }
try { showView('chat'); } catch (x1) {} return true;
} catch (x) {}
return false;
}
;
function notifyPendingClick(cb) {
try {
if (!window.idbGet) { cb(null); return; }
Promise.resolve(window.idbGet('__notify-click')).then(function (raw) {
if (!raw) { cb(null); return; }
try { if (window.idbDelete) window.idbDelete('__notify-click'); } catch (e0) {}
let o = raw;
try { if (typeof raw === 'string') o = JSON.parse(raw); } catch (e1) { cb(null); return; }
if (!o || !o.tag || !o.ts || Date.now() - o.ts > 3 * 60000) { cb(null); return; }
cb(notifyConsume(String(o.tag)) || notifyEntryFromTag(String(o.tag)));
}, function () { cb(null); });
} catch (e) { cb(null); }
}
document.addEventListener('visibilitychange', function () {
const vis = document.visibilityState;
if (vis === 'hidden') {
hiddenSentCount = 0;
hiddenSentName = '';
return;
}
if (vis !== 'visible') return;
nbPermRecheck();
try { if (kaPermNoticeArmed) kaNoticeAfterSplash(nbPermPendingNotice); } catch (e) {}
const saved = gGet('bg-notify');
if (saved === '1') {
const keepOn = keepEnabled;
if (!keepOn) {
toast('提醒：后台保活已关闭，后台消息到不了，通知不会弹（设置里开启）');
}
}
try {
// 桌面前台弹窗口径：言字卡 无 mochi 的 page-chat，在不在聊天页看 body[data-view]（原判定恒 false=死代码）
const inChat = document.body.dataset.view === 'chat';
const n = hiddenSentCount;
const who = hiddenSentName || partnerName();
const summaryText = sentSummaryText(); // #1443d：先按类别拼好话，再清账（清早了就没得报）
sentReset();
if (!inChat && n > 0) {
try { if (window.showDeskPopup) window.showDeskPopup({ uid: 'bg-resume', name: who, text: summaryText, views: ['chat'] }); } catch (eDP) {}
const now = Date.now();
if (saved === '1' && bgNotifyAllowed() &&
(!lastResumeNotifyAt || now - lastResumeNotifyAt > 30000)) {
lastResumeNotifyAt = now;
const notiIcon = ((data && data.profile && data.profile.avatar) || '');
const sendNoti = function (iconVal) {
const o = { body: summaryText };
if (iconVal) o.icon = iconVal;
showSysNotification(who, o);
};
if (notiIcon && (notiIcon.indexOf('data:') === 0 || /^https?:\/\//i.test(notiIcon))) {
makeAvatarThumb(notiIcon, function (u) { sendNoti(u || notiIcon); });
} else {
sendNoti('');
}
}
}
} catch (e) {}
});
let lastResumeNotifyAt = 0; // v3.5.154：回前台汇总通知去重
let lastVisibleAt = Date.now();
let lastHiddenAt = 0; // v3.16.x：最近一次切后台时刻（修复过渡期闸门失效）
(function () {
const markVisible = function () {
if (document.visibilityState === 'visible') {
lastVisibleAt = Date.now();
lastHiddenAt = 0;
} else if (document.visibilityState === 'hidden') {
lastHiddenAt = Date.now();
}
};
document.addEventListener('visibilitychange', markVisible);
window.addEventListener('pageshow', markVisible);
window.addEventListener('focus', markVisible);
})();
const NOTIFY_HIDDEN_MIN_MS = 15000;
const NOTIFY_CHAT_DUP_MS = 5 * 60000;  // v3.20.x：历史聊天查重 15→5 分钟
const NOTIFY_SENT_DUP_MS = 2 * 60000;  // v3.20.x：已发通知查重 6→2 分钟
const NOTIFY_SEEN_DUP_MS = 3 * 60000;  // v3.20.x：前台看过记忆 15→3 分钟
const NOTIFY_FRESH_CHAT_DUP_MS = 30 * 60000;
function normNotifyKey(raw) {
let s = String(raw || '');
if (s.length > 1024) s = s.slice(0, 1024); // 先截断再正则，避免超长 base64 全文替换开销
s = s.replace(/data:[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, '[附件]')
.replace(/@@m:[0-9a-f]{32}/g, '[附件]') // FIX 2026-09-13 #401 令牌串入指纹同口径
.replace(/\|\|\|.*$/, '')
.replace(/<[^>]*>/g, '');
return s.replace(/\s+/g, '').slice(0, 100);
}
function sampleDataUrl(dataUrl) {
try {
if (!dataUrl || typeof dataUrl !== 'string') return '';
const m = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,/.exec(dataUrl);
const b64 = m ? dataUrl.slice(m[0].length) : dataUrl;
const h = function (shift) {
let x = 0;
for (let i = shift; i < b64.length; i += 7) x = (x * 31 + b64.charCodeAt(i)) & 0x7fffffff;
return x.toString(36);
};
return '|' + (m ? m[1] : '?') + ':' + b64.length + ':' + h(0) + ':' + h(1) + ':' + h(2);
} catch (e) { return ''; }
}
function msgFingerprint(text, img) {
let t = String(text || '');
const isPh = /^\[(图片|表情包|语音|附件)\]$/.test(t.trim());
const imgOnly = isPh || !t.trim() || t.indexOf('data:') === 0;
let k = normNotifyKey(imgOnly && img ? '[附件]' : t);
const a = sampleDataUrl(img);
if (a) k += a;
return k;
}
function recentChatDup(key, refTs, windowMs) {
if (!key) return false;
try {
const arr = window.getChatMsgs ? window.getChatMsgs() : null;
if (!arr || !arr.length) return false;
const cutoff = Date.now() - (windowMs || NOTIFY_CHAT_DUP_MS);
for (let i = arr.length - 1, n = 0; i >= 0 && n < 150; i--, n++) {
const m = arr[i];
if (!m) continue;
const mts = m.ts || 0;
if (mts && mts < cutoff) break; // 追加有序，更早的不可能落在窗口内
if (refTs && (mts >= refTs - 2500 || (!mts && i === arr.length - 1) || Date.now() - mts < 2500)) continue;
if (m.side !== 'in') continue;
let t = m.text || '';
let img = '';
if ((!t || t.indexOf('data:') === 0) && m.parts && m.parts.length) {
const texts = [], images = [];
for (let p = 0; p < m.parts.length; p++) {
const part = m.parts[p];
if (!part || !part.k) continue;
if (part.k === 'text') texts.push(part.v);
else if (part.k === 'image' || part.k === 'sticker' || part.k === 'voice') images.push(part.v);
}
t = texts.join(' ');
img = images[0] || '';
} else if (t.indexOf('data:') === 0) {
img = t; // 无 parts 的旧式纯图消息：dataURL 即正文
t = '';
} else if (t.indexOf('|||') >= 0) {
t = t.split('|||')[0];
}
const mf = msgFingerprint(t, img);
if (mf === key) return true;
if (mf.length >= 6 && key.length > mf.length && key.length >= mf.length * 1.6 && key.indexOf(mf) >= 0) return true;
if (key.length >= 6 && mf.length > key.length && mf.length >= key.length * 1.6 && mf.indexOf(key) >= 0) return true;
}
} catch (e) {}
return false;
}
const notifiedRecently = new Map();
function notifiedDup(key) {
if (!key) return false;
const last = notifiedRecently.get(key);
return !!(last && Date.now() - last < NOTIFY_SENT_DUP_MS);
}
function markNotified(key) {
if (!key) return;
notifiedRecently.set(key, Date.now());
if (notifiedRecently.size > 60) { // 上限防膨胀：删最早的（Map 保持插入序）
notifiedRecently.delete(notifiedRecently.keys().next().value);
}
}
const seenRecently = new Map();
function markSeen(key) {
if (!key) return;
seenRecently.set(key, Date.now());
if (seenRecently.size > 80) { // 上限防膨胀：删最早的（Map 保持插入序）
seenRecently.delete(seenRecently.keys().next().value);
}
}
function seenDup(key) {
if (!key) return false;
const last = seenRecently.get(key);
return !!(last && Date.now() - last < NOTIFY_SEEN_DUP_MS);
}
let gateStats = { total: 0, tooFresh: 0, dup: 0, replay: 0, sent: 0 };
window.bgNotifyGateStats = function () { return Object.assign({}, gateStats); };
;
;
window.bgNotifyCheck = function (text, ts, extra) {
if (!notifyEnabled) return;
extra = extra || {};
const nkey = msgFingerprint(text, extra.img);
if (document.visibilityState === 'visible') { if (!extra.late) { markSeen(nkey); return; } }
if (!bgNotifyAllowed()) return;
if (!extra.force && extra.msgTs) {
try {
const d = window.__mochiMsgDelivered ? window.__mochiMsgDelivered(extra.msgTs, 'in') : null;
if (d && (d.vis || d.nAt)) { gateStats.replay++; return; }
} catch (e) {}
}
gateStats.total++;
const force = !!extra.force;
if (!force && !bgNoDedup() && lastHiddenAt > 0 && Date.now() - lastHiddenAt < NOTIFY_HIDDEN_MIN_MS &&
recentChatDup(nkey, ts, NOTIFY_FRESH_CHAT_DUP_MS)) { gateStats.tooFresh++; return; }
if (!force && !bgNoDedup() && (notifiedDup(nkey) || seenDup(nkey))) { gateStats.dup++; return; }
if (!force && !bgNoDedup() && recentChatDup(nkey, ts)) { gateStats.dup++; return; }
gateStats.sent++; markNotified(nkey);
sentAdd(notifyKind(extra)); // #1443d：按类别记账，未登记的一律算「提醒」
hiddenSentName = extra.name || partnerName();
const name = extra.name || partnerName();
let t = '';
if (ts) {
const d = new Date(ts);
t = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
}
const body = String(text || '收到一条新消息')
.replace(/data:[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, '[附件]')
.replace(/@@m:[0-9a-f]{32}/g, '[图片]')
.replace(/\|\|\|.*$/, '');
const bodyFitted = body;
const opts = { body: (t ? t + '  ' : '') + (bodyFitted && bodyFitted.length > 40 ? bodyFitted.slice(0, 40) + '…' : bodyFitted) };
if (extra.callAlert) {
opts.vibrate = [700, 300, 700, 300, 700, 300, 700, 300, 700];
opts.requireInteraction = true;
opts.tag = 'mochi-call-' + (extra.callTag || 'call');
opts.renotify = true;
}
let bigIcon = '';   // 右侧大图标：联系人头像；无头像时兜底 mochi 字母图标（见下）
let previewImg = ''; // 展开大图：消息图片
const avatar = extra.avFixed
? (extra.av || '')
: (extra.av || (data && data.profile && data.profile.avatar) || '');
if (avatar && (avatar.indexOf('data:') === 0 || /^https?:\/\//i.test(avatar))) bigIcon = avatar;
if (!bigIcon) bigIcon = NOTIFY_ICON;
if (extra.img && (extra.img.indexOf('data:') === 0 || /^https?:\/\//i.test(extra.img))) previewImg = extra.img;
const cropAvatarToSquare = makeAvatarThumb;
const sendFinal = function (iconVal) {
if (iconVal) opts.icon = iconVal;
if (previewImg) opts.image = previewImg;
const nk = notifyKind(extra);
const ncid = String(extra.cid || window.__activeCid || 'default');
let ntag = '';
try { ntag = String(opts.tag || ''); } catch (eT0) { ntag = ''; }
if (!ntag) {
ntag = 'nk|' + nk + '|' + ncid + '|' + Date.now().toString(36);
try { opts.tag = ntag; } catch (eT) {}
}
notifyLedgerPush({ tag: ntag, kind: nk, cid: ncid, ts: Date.now() });
showSysNotification(name, opts).then(function (ok) {
if (ok) {
try { if (extra.msgTs && window.__mochiMsgNotified) window.__mochiMsgNotified(extra.msgTs, 'in'); } catch (e) {}
} else {
notifiedRecently.delete(nkey); // #800：发送失败回滚决定点早记账，保留「失败可重试」
}
});
};
if (bigIcon) {
const cropFired = { v: false };
const cropTimer = setTimeout(function () { if (!cropFired.v) { cropFired.v = true; sendFinal(''); } }, 1200);
cropAvatarToSquare(bigIcon, function (u) {
clearTimeout(cropTimer);
if (cropFired.v) return;
cropFired.v = true;
sendFinal(u || bigIcon);
});
} else {
sendFinal(bigIcon);
}
};
function makeAvatarThumb(dataUrl, cb) {
try {
const img = new Image();
if (/^https?:\/\//i.test(dataUrl)) { img.crossOrigin = 'anonymous'; }
img.onload = function () {
try {
if (!img.width || !img.height) { cb(''); return; }
const maxSide = 96;
const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
const w = Math.max(1, Math.round(img.width * scale));
const h = Math.max(1, Math.round(img.height * scale));
const c = document.createElement('canvas');
c.width = w; c.height = h;
const ctx = c.getContext('2d');
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, w, h);
ctx.drawImage(img, 0, 0, w, h);
cb(c.toDataURL('image/jpeg', 0.85));
} catch (e) { cb(''); }
};
img.onerror = function () { cb(''); };
img.src = dataUrl;
} catch (e) { cb(''); }
}
try {
if ('serviceWorker' in navigator && navigator.serviceWorker) {
navigator.serviceWorker.addEventListener('message', function (e) {
if (!e || !e.data || e.data.type !== 'MOCHI_NOTIFY_CLICK') return;
let entry = null;
try { entry = notifyConsume(String(e.data.tag || '')) || notifyEntryFromTag(String(e.data.tag || '')); } catch (x) {}
notifyRoute(entry);
});
try {
const bootRoute = function () { try { notifyPendingClick(function (en) { if (en) notifyRoute(en); }); } catch (e0) {} };
document.addEventListener('ordinal-data-ready', bootRoute);
} catch (e1) {}
}
} catch (e) {}
window.__bgSetKeep = function (on) {
try {
if (on) { keepEnabled = true; startKeepAlive(false); }
else { keepEnabled = false; stopKeepAlive(false); }
syncKeepUI();
} catch (e) {}
};
try {
const tk = document.getElementById('testKeepAlive');
if (tk) tk.addEventListener('click', function () {
let m = '';
try {
const kp = window.__kaProbe ? window.__kaProbe() : null;
const Ctx = window.AudioContext || window.webkitAudioContext;
if (!Ctx) { m = '当前浏览器不支持 AudioContext，后台保活不可用'; }
else {
const ctx = new Ctx();
const now = ctx.currentTime;
const osc = ctx.createOscillator();
osc.type = 'sine';
osc.frequency.setValueAtTime(880, now);
osc.frequency.setValueAtTime(1174.66, now + 0.18);
osc.frequency.setValueAtTime(880, now + 0.36);
const gain = ctx.createGain();
gain.gain.setValueAtTime(0.0001, now);
gain.gain.linearRampToValueAtTime(0.5, now + 0.05);
gain.gain.setValueAtTime(0.5, now + 0.3);
gain.gain.linearRampToValueAtTime(0, now + 0.52);
osc.connect(gain); gain.connect(ctx.destination);
osc.start(now); osc.stop(now + 0.55);
if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e3) {} }
m = '已播放测试提示音：切到浏览器后台若仍能听到，说明浏览器允许后台播放';
if (kp) {
m += '\n保活开关：' + (kp.keep ? '开' : '关') + ' · 音频：' + (kp.audio ? (kp.audio.paused ? '已暂停（回本页自动恢复）' : '播放中') : '未启动') + ' · 通道：' + (kp.anchor || '-') + (kp.pc && kp.pc !== 'off' ? ' · 连接锚点：' + kp.pc : '') + (kp.hb && kp.hb.n ? ' · 心跳 ' + kp.hb.n + ' 拍' : '') + ((kp.ev && (kp.ev.stall || kp.ev.died)) ? '\n历史取证：断流 ' + kp.ev.stall + ' 次 / 后台终止 ' + kp.ev.died + ' 次' : '');
}
}
} catch (e2) { m = '后台保活测试失败：' + (e2 && e2.message ? e2.message : e2); }
try { const el = document.getElementById('bgTestResult'); if (el) el.textContent = m; } catch (e4) {}
});
} catch (e) {}
})();
} catch (__e) { if (window.__mochiErrLoaded) window.__mochiErrLoaded.push("bg-keep.js"); try { console.error("[JS] bg-keep.js", __e && __e.message || __e); } catch (x) {} if (window.__jsErrors) window.__jsErrors.push("[bg-keep.js] " + String(__e && __e.message || __e)); } })();

// ===== 旧接口兼容（app.js / call.js / render.js 历史调用点，内部转 mochi 移植引擎）=====
function setBackgroundKeepAlive(on) { try { if (window.__bgSetKeep) window.__bgSetKeep(!!on); } catch (e) {} }
