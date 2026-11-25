// Thiết lập theo thiết bị: chặn phóng to (2 ngón, chạm đúp), đánh dấu chế độ PWA, đăng ký service worker.

/** iPhone/iPad bỏ qua "user-scalable=no" trong thẻ viewport, nên chặn thêm bằng sự kiện cảm ứng. */
export function lockZoom() {
  // Safari: cử chỉ chụm/mở 2 ngón
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }
  // Mọi trình duyệt: kéo bằng từ 2 ngón trở lên
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
  // Chạm đúp để phóng to: đã chặn bằng CSS touch-action: manipulation (không chặn bằng JS
  // vì sẽ làm mất các lần bấm nhanh liên tiếp, ví dụ nút + số lượng).
}

/** Có đang chạy như app đã cài (PWA) không. */
export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (['localhost', '127.0.0.1'].includes(location.hostname)) return; // chạy thử ở máy: không cần
  const register = () =>
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* không cài được service worker thì app vẫn chạy bình thường */
    });
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

export function setupDevice() {
  lockZoom();
  document.documentElement.classList.toggle('is-standalone', isStandalone());
  registerServiceWorker();
}
