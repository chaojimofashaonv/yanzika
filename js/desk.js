// ===== 桌面背景（2026-10-15 由「浮层美化台」改成内联进 设置 → 外观 一张折叠卡）=====
// 入口：设置 → 外观「桌面背景」卡 ∶ 功能中心那行（js/hub.js nav='#desk' → _hubGoFold('desk','deskbg')）
// 控件宿主搬到外观这一页后不再需要开/收面板：拖哪根杆时「所有页面」开着就能看到这页卡片背后当场变；一律即点即存
// 三根杆（压暗/缩放/取景）＋导航条薄纱写进 body 内联变量，壁纸画在 css/theme.css 的 .app-shell::before（只糊图不糊字）
// 取景只有 cover/contain 两档：纵向位置档已被逐像素量具判死（见 theme.css 桌面背景图那段注释）
// 虚化那根杆 2026-10-05 删了：糊 0 与糊 30 逐像素只差 4.5/255（tools/_probe_desk_travel.js），壁纸只从实白卡片缝里露出来＝一根死杆
// 「功能放第二页」那一枚开关 2026-10-09 整族删净（用户定档「只有一页＋底部导航常驻」）：容器／字段／搬移动画一起走，见 css/chats.css 那段

const DESK_DEF = { deskBgVeil: 44, deskBgZoom: 100, deskBgBlur: 0, deskBgSize: 'cover', deskTabVeil: 45 };
const DESK_SIZES = ['cover', 'contain'];

// ===== 内置预设壁纸 =====
// 六款内置渐变（纯 SVG dataURL，不占存储不用找图），点一枚即写入 appearance.deskBg ——
// 与自传图走同一条管线（压暗/缩放/取景/铺到全站照常生效）；选了自定义图后预设高亮自动让位。
const DESK_PRESETS = [
  { id: 'dawn', name: '晨雾', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="960"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e4ecf3"/><stop offset="1" stop-color="#c8d6e2"/></linearGradient></defs><rect width="480" height="960" fill="url(#g)"/><circle cx="110" cy="180" r="200" fill="#ffffff" opacity=".3"/><circle cx="410" cy="770" r="270" fill="#a9c1d5" opacity=".35"/></svg>' },
  { id: 'dusk', name: '暮色', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="960"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eee2ec"/><stop offset="1" stop-color="#cbb8d8"/></linearGradient></defs><rect width="480" height="960" fill="url(#g)"/><circle cx="370" cy="210" r="190" fill="#f9ebe2" opacity=".45"/><circle cx="90" cy="780" r="250" fill="#b3a1cb" opacity=".38"/></svg>' },
  { id: 'moss', name: '苔原', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="960"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2ebdb"/><stop offset="1" stop-color="#c0d4bd"/></linearGradient></defs><rect width="480" height="960" fill="url(#g)"/><circle cx="130" cy="230" r="210" fill="#ffffff" opacity=".28"/><circle cx="400" cy="750" r="240" fill="#a4c2a3" opacity=".35"/></svg>' },
  { id: 'latte', name: '奶咖', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="960"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f5eddf"/><stop offset="1" stop-color="#e4d3bd"/></linearGradient></defs><rect width="480" height="960" fill="url(#g)"/><circle cx="360" cy="200" r="200" fill="#ffffff" opacity=".38"/><circle cx="110" cy="760" r="250" fill="#d5bd9f" opacity=".4"/></svg>' },
  { id: 'night', name: '夜航', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="960"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#36435d"/><stop offset="1" stop-color="#1e2940"/></linearGradient></defs><rect width="480" height="960" fill="url(#g)"/><circle cx="356" cy="190" r="60" fill="#e9eef7" opacity=".5"/><circle cx="90" cy="770" r="260" fill="#4a5c80" opacity=".4"/></svg>' },
  { id: 'slate', name: '黛青', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="960"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e0e9ea"/><stop offset="1" stop-color="#bfd1d4"/></linearGradient></defs><rect width="480" height="960" fill="url(#g)"/><circle cx="120" cy="210" r="200" fill="#ffffff" opacity=".3"/><circle cx="410" cy="760" r="250" fill="#9fb8bd" opacity=".35"/></svg>' }
];
const DESK_PRESET_URLS = {};
DESK_PRESETS.forEach(p => { DESK_PRESET_URLS[p.id] = 'data:image/svg+xml;utf8,' + encodeURIComponent(p.svg); });

// 当前选中的是不是某款预设（回显状态行文案与缩略卡高亮共用）
function deskPresetOf(bg) { return DESK_PRESETS.find(p => DESK_PRESET_URLS[p.id] === bg) || null; }

function renderDeskPresets() {
  const box = $('#deskPresets');
  if (!box) return;
  const cur = (data && data.appearance && typeof data.appearance.deskBg === 'string') ? data.appearance.deskBg : '';
  box.innerHTML = DESK_PRESETS.map(p =>
    '<button type="button" class="ds-preset' + (cur === DESK_PRESET_URLS[p.id] ? ' on' : '') + '" data-preset="' + p.id + '" aria-label="预设壁纸 ' + p.name + '" style="background-image:url(\'' + DESK_PRESET_URLS[p.id] + '\')"><span>' + p.name + '</span></button>'
  ).join('');
}

function _deskNum(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
function _deskClamp(v, lo, hi, d) { const n = _deskNum(Number(v), d); return Math.max(lo, Math.min(hi, n)); }

// 当前壁纸观感（越界与脏值一律回落默认，供 applyDeskVars 与面板回显共用同一份口径）
function deskBgView() {
  const a = (data && data.appearance) || {};
  return {
    bg: typeof a.deskBg === 'string' ? a.deskBg : '',
    veil: _deskClamp(a.deskBgVeil, 0, 90, DESK_DEF.deskBgVeil),
    zoom: _deskClamp(a.deskBgZoom, 100, 200, DESK_DEF.deskBgZoom),
    blur: _deskClamp(a.deskBgBlur, 0, 40, DESK_DEF.deskBgBlur),
    size: DESK_SIZES.indexOf(a.deskBgSize) >= 0 ? a.deskBgSize : DESK_DEF.deskBgSize,
    tabVeil: _deskClamp(a.deskTabVeil, 0, 100, DESK_DEF.deskTabVeil)
  };
}

// 由 settings.js 的 applyAppearance 调用（开机/导入/换图都走那一处），也供面板拖动时单独调用
function applyDeskVars() {
  const g = deskBgView(), rs = document.body.style;
  // 这两枚写的是「无单位数字」，百分号由 CSS 侧的 calc(x * 1%) 加：
  // 带 % 的数只能喂给 color-mix，写成数字两边都能用（--chat-veil 早就是这个口径）。
  // 紧跟着再写一枚小数副本（-a 结尾）：老引擎不认 color-mix() 时整条声明作废，
  // 回落那几条要进 rgba() 的 alpha 位，而 calc() 进 alpha 位老 Safari 没验过——
  // 故由这里一次算好，回落规则只写 rgba(var(--ink-rgb),var(--desk-veil-a,.44)) 纯 CSS3。
  // 两枚数同一个来源 g.veil／g.tabVeil＝一份事实只有一个写手（滑杆照样拖得出来）。
  rs.setProperty('--desk-veil', String(g.veil));
  rs.setProperty('--desk-veil-a', (g.veil / 100).toFixed(3));
  rs.setProperty('--desk-zoom', (g.zoom / 100).toFixed(2));
  // 背景模糊（壁纸本体）：写带 px 的长度，CSS 侧 filter/inset 直接用。0 不挂 data-ap-deskblur＝这一层逐字节同旧。
  rs.setProperty('--desk-blur', g.blur + 'px');
  if (g.blur > 0) document.body.dataset.apDeskBlur = 'on'; else delete document.body.dataset.apDeskBlur;
  rs.setProperty('--desk-size', g.size);
  rs.setProperty('--tabbar-veil', String(g.tabVeil));
  rs.setProperty('--tabbar-veil-a', (g.tabVeil / 100).toFixed(3));
  if (g.bg) {
    rs.setProperty('--desk-bg', 'url("' + g.bg + '")');
    document.body.dataset.apDesk = 'on';
  } else {
    rs.removeProperty('--desk-bg');
    document.body.dataset.apDesk = 'off';
  }
}


function _deskEcho() {
  const g = deskBgView();
  const o2 = $('#deskBgVeilOut'), o3 = $('#deskBgZoomOut'), o4 = $('#deskTabVeilOut'), st = $('#deskBgState'), o5 = $('#deskBgBlurOut');
  if (o2) o2.textContent = g.veil + '%';
  if (o3) o3.textContent = g.zoom + '%';
  if (o4) o4.textContent = g.tabVeil + '%';
  if (o5) o5.textContent = g.blur + 'px';
  const preset = deskPresetOf(g.bg);
  if (st) st.textContent = g.bg ? (preset ? '预设 · ' + preset.name : '已设置') : '未设置';
  $$('#deskBgSizeRow .contact-chip').forEach(c => c.classList.toggle('active', c.dataset.size === g.size));
}

function renderDeskStation() {
  const g = deskBgView();
  const v = $('#deskBgVeil'), z = $('#deskBgZoom'), t = $('#deskTabVeil'), b = $('#deskBgBlur');
  if (v) v.value = g.veil;
  if (z) z.value = g.zoom;
  if (t) t.value = g.tabVeil;
  if (b) b.value = g.blur;
  renderDeskPresets();
  _deskEcho();
  echoApSets();   // 「壁纸铺到全站」那一行是外观格同一族 chips，回显走 js/settings.js 那一份口径，不做第二套
}

function _deskBindRange(sel, key, lo, hi) {
  const el = $(sel);
  if (!el) return;
  const write = () => { data.appearance[key] = _deskClamp(el.value, lo, hi, DESK_DEF[key]); applyDeskVars(); _deskEcho(); };
  el.addEventListener('input', write);
  el.addEventListener('change', async () => { write(); await save(); });
}
_deskBindRange('#deskBgVeil', 'deskBgVeil', 0, 90);
_deskBindRange('#deskBgZoom', 'deskBgZoom', 100, 200);
_deskBindRange('#deskBgBlur', 'deskBgBlur', 0, 40);
_deskBindRange('#deskTabVeil', 'deskTabVeil', 0, 100);

$('#deskBgSizeRow').addEventListener('click', async e => {
  const chip = e.target.closest('.contact-chip');
  if (!chip || DESK_SIZES.indexOf(chip.dataset.size) < 0) return;
  data.appearance.deskBgSize = chip.dataset.size;
  applyDeskVars();
  _deskEcho();
  await save();
});

// 预设壁纸：点一枚即换（写 appearance.deskBg，与自传图同管线），高亮与状态行随 renderDeskStation 回显
const _deskPresetsBox = $('#deskPresets');
if (_deskPresetsBox) _deskPresetsBox.addEventListener('click', async e => {
  const btn = e.target.closest('.ds-preset');
  if (!btn) return;
  const url = DESK_PRESET_URLS[btn.dataset.preset];
  if (!url || data.appearance.deskBg === url) return;
  data.appearance.deskBg = url;
  applyDeskVars();
  renderDeskStation();
  await save();
});

// 首页布局那一行（同一页／滑到第二页）与它的 resize 复位 2026-10-09 整族删净：
// 首页自此只有一屏纵向流，两页横滑的容器·字段·开关一起走（见 html/view-chats.html 与 js/utils.js）。


$('#deskBgUpload').onclick = () => $('#deskBgInput').click();
$('#deskBgInput').onchange = async e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const img = await fileData(f, 1440, 0.8);
  if (!img) return;
  data.appearance.deskBg = img;
  applyDeskVars();
  renderDeskStation();
  await save();
  showToast('桌面背景已更新');
};
$('#deskBgClear').onclick = async () => {
  data.appearance.deskBg = '';
  applyDeskVars();
  renderDeskStation();
  await save();
};
$('#deskBgReset').onclick = async () => {
  Object.assign(data.appearance, DESK_DEF);
  applyDeskVars();
  renderDeskStation();
  await save();
};
