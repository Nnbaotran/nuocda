// Bộ điều khiển sáng/tối DUY NHẤT của app (theo nguyên lý theme-browser-v13 của AutoTax):
// - Mặc định SÁNG; chỉ đổi khi người dùng tự chọn; hệ điều hành không ghi đè lựa chọn.
// - Ghi nhớ bằng localStorage; đồng bộ giữa các tab/cửa sổ (sự kiện storage).
// - Không nháy nền: index.html đặt sẵn data-theme trong <head> trước khi vẽ trang.
// - Nút nào có thuộc tính data-theme-toggle đều tự chuyển chế độ (bắt sự kiện tập trung 1 chỗ).

export const THEME_KEY = 'lexuan-theme';
const META_COLOR = { light: '#f3f5f7', dark: '#09090b' };
const root = document.documentElement;

function read() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* trình duyệt chặn lưu trữ: dùng mặc định */
  }
  return 'light';
}

export function currentTheme() {
  return root.dataset.theme === 'dark' ? 'dark' : 'light';
}

function apply(theme) {
  const before = root.dataset.theme;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLOR[theme]);
  for (const btn of document.querySelectorAll('[data-theme-toggle]')) {
    const next = theme === 'light' ? 'tối' : 'sáng';
    btn.setAttribute('aria-label', `Chuyển sang chế độ ${next}`);
    btn.setAttribute('title', `Chế độ ${next}`);
    btn.setAttribute('aria-pressed', String(theme === 'dark'));
    btn.dataset.themeState = theme;
    const label = btn.querySelector('[data-theme-label]');
    if (label) label.textContent = `Chế độ ${next}`;
  }
  if (before !== theme) window.dispatchEvent(new CustomEvent('theme-change', { detail: { theme } }));
}

export function setTheme(theme) {
  if (theme !== 'light' && theme !== 'dark') return;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* không lưu được thì vẫn đổi cho phiên này */
  }
  apply(theme);
}

export function toggleTheme() {
  setTheme(currentTheme() === 'light' ? 'dark' : 'light');
}

/** Gọi khi giao diện vừa vẽ lại để nút chuyển hiện đúng nhãn. */
export function refreshThemeButtons() {
  apply(currentTheme());
}

export function setupTheme() {
  apply(read());
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-theme-toggle]')) {
      e.preventDefault();
      toggleTheme();
    }
  });
  window.addEventListener('storage', (e) => {
    if (e.key === THEME_KEY && (e.newValue === 'light' || e.newValue === 'dark')) apply(e.newValue);
  });
  window.addEventListener('pageshow', () => apply(read()));
}
