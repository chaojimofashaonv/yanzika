// ===== 轻量提示 =====
let _toastTimer = null;
function showToast(msg){
  document.body.removeAttribute('data-toast');
  void document.body.offsetWidth;
  document.body.setAttribute('data-toast', msg);
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => document.body.removeAttribute('data-toast'), 2000);
}

