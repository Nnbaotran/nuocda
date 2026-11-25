// Điểm khởi động app: khôi phục đăng nhập -> vẽ khung -> điều hướng theo địa chỉ (#/...).
import { setupDevice } from './lib/device.js';
import { setHtml } from './lib/dom.js';
import { refreshThemeButtons, setupTheme } from './lib/theme.js';
import { errorState, loadingState } from './lib/ui.js';
import { renderLogin } from './modules/auth/login-view.js';
import { currentProfile, initSession, onSessionChange, takeNotice } from './modules/auth/session.js';
import { renderShell } from './modules/layout/shell.js';
import { findRoute, routesFor } from './routes.js';

const app = document.getElementById('app');
let shell = null;
let navId = 0; // chống vẽ chồng khi bấm chuyển trang liên tục lúc mã trang đang tải

function currentPath() {
  const p = location.hash.replace(/^#/, '') || '/';
  return p.startsWith('/') ? p : `/${p}`;
}

async function navigate() {
  const id = ++navId;
  const profile = currentProfile();
  if (!profile) {
    shell = null;
    renderLogin(app, { notice: takeNotice() });
    return refreshThemeButtons();
  }
  const routes = routesFor(profile.role);
  if (!shell) shell = renderShell(app, routes);
  let route = findRoute(currentPath(), profile.role);
  if (!route) {
    route = findRoute('/', profile.role);
    history.replaceState(null, '', '#/');
  }
  shell.setActive(route);
  window.scrollTo({ top: 0 });
  // Trang con: chỉ vẽ vào một khung riêng; nếu người dùng đã chuyển trang khác thì bỏ qua
  const page = document.createElement('div');
  page.className = 'fade-in';
  setHtml(page, loadingState(3));
  shell.page.replaceChildren(page);
  try {
    await route.render(page, { routes, params: route.params });
  } catch (err) {
    if (id === navId) setHtml(page, errorState('Không tải được trang (mất mạng?). Bấm để thử lại.', () => navigate()));
    console.error(err);
  }
  if (id === navId) refreshThemeButtons();
}

async function start() {
  setupTheme();
  setupDevice();
  const { error } = await initSession();
  window.addEventListener('hashchange', navigate);
  onSessionChange(() => {
    shell = null;
    navigate();
  });
  if (error) {
    renderLogin(app, { notice: error });
    refreshThemeButtons();
  } else navigate();
}

start();
