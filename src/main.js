// Điểm khởi động app: khôi phục đăng nhập -> vẽ khung -> điều hướng theo địa chỉ (#/...).
import { renderLogin } from './modules/auth/login-view.js';
import { currentProfile, initSession, onSessionChange } from './modules/auth/session.js';
import { renderShell } from './modules/layout/shell.js';
import { findRoute, routesFor } from './routes.js';

const app = document.getElementById('app');
let shell = null;

function currentPath() {
  const p = location.hash.replace(/^#/, '') || '/';
  return p.startsWith('/') ? p : `/${p}`;
}

function navigate() {
  const profile = currentProfile();
  if (!profile) {
    shell = null;
    return renderLogin(app);
  }
  const routes = routesFor(profile.role);
  if (!shell) shell = renderShell(app, routes);
  const route = findRoute(currentPath(), profile.role) ?? findRoute('/', profile.role);
  if (currentPath() !== route.path) history.replaceState(null, '', `#${route.path}`);
  shell.setActive(route);
  shell.page.classList.remove('fade-in');
  void shell.page.offsetWidth; // khởi động lại hiệu ứng xuất hiện
  shell.page.classList.add('fade-in');
  route.render(shell.page, { routes });
  window.scrollTo({ top: 0 });
}

async function start() {
  const { error } = await initSession();
  window.addEventListener('hashchange', navigate);
  onSessionChange(() => {
    shell = null;
    navigate();
  });
  if (error) renderLogin(app, { notice: error });
  else navigate();
}

start();
