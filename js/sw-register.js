// FIX 2026-09-01 #007 file:// 协议下 SW 注册被拒绝且未捕获，控制台抛 5 个 SecurityError（BUGS.md #007）
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register('./sw.js').then(() => console.log('[言字卡] Service Worker 已注册')).catch(() => {});
}

