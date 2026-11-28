// Khung giao diện: header dính trên cùng, sidebar (máy tính), thanh điều hướng dưới + menu trượt (điện thoại).
import { APP_NAME } from '../../config.js';
import { $, $$, html, setHtml } from '../../lib/dom.js';
import { confirmDialog, icon, themeToggle } from '../../lib/ui.js';
import { currentProfile, displayName, ROLE_LABELS, signOut } from '../auth/session.js';

function navLinks(routes) {
  return routes.map(
    (r) => html`<a href="#${r.path}" class="nav-link" data-path="${r.path}">
      ${icon(r.icon)}<span class="flex-1">${r.label}</span>
    </a>`,
  );
}

export function renderShell(root, routes) {
  const p = currentProfile();
  // Thanh dưới: nút Bán hàng nổi bật ở giữa
  const others = routes.filter((r) => r.bottom && !r.primary);
  const primary = routes.find((r) => r.primary);
  const bottom = primary ? [...others.slice(0, 2), primary, ...others.slice(2)] : others;
  setHtml(
    root,
    html`<div class="min-h-dvh md:pl-64">
      <aside class="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-fg/10 bg-surface/80 backdrop-blur md:flex">
        <div class="flex h-16 items-center gap-3 px-5">
          <img src="/assets/logo.svg" alt="" class="size-9" />
          <span class="gradient-text text-lg font-bold">${APP_NAME}</span>
        </div>
        <nav class="flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Menu chính">${navLinks(routes)}</nav>
        <div class="border-t border-fg/10 p-3">
          <div class="mb-2 px-2 text-sm">
            <p class="truncate font-medium text-fg">${displayName()}</p>
            <p class="text-xs text-subtle">${ROLE_LABELS[p.role]}</p>
          </div>
          ${themeToggle({ withLabel: true })}
          <button class="nav-link w-full" data-logout>${icon('logout')} Đăng xuất</button>
        </div>
      </aside>

      <header class="sticky top-0 z-20 border-b border-fg/10 bg-page/80 backdrop-blur-md">
        <div class="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 md:h-16 md:px-6">
          <img src="/assets/logo.svg" alt="" class="size-8 md:hidden" />
          <h1 class="min-w-0 flex-1 truncate font-semibold text-fg" data-page-title>${APP_NAME}</h1>
          <span class="gradient-text hidden text-sm font-semibold sm:inline md:hidden">${APP_NAME}</span>
          ${themeToggle()}
          <button class="btn-icon md:hidden" data-open-menu aria-label="Mở menu">${icon('menu')}</button>
        </div>
      </header>

      <main id="page" class="mx-auto max-w-5xl px-4 pt-4 pb-28 md:px-6 md:pt-6 md:pb-10"></main>

      <nav class="fixed inset-x-0 bottom-0 z-30 flex border-t border-fg/10 bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden" aria-label="Điều hướng nhanh">
        ${bottom.map((r) => r.primary
          ? html`<a href="#${r.path}" class="bottom-link" data-path="${r.path}"><span class="-mt-6 grid size-14 place-items-center rounded-full bg-accent text-white shadow-lg shadow-accent/40 ring-4 ring-page">${icon(r.icon, 'size-7')}</span><span class="font-bold">${r.label}</span></a>`
          : html`<a href="#${r.path}" class="bottom-link" data-path="${r.path}">${icon(r.icon, 'size-6')}<span>${r.label}</span></a>`)}
        <button class="bottom-link" data-open-menu>${icon('menu', 'size-6')}<span>Thêm</span></button>
      </nav>

      <div class="fixed inset-0 z-40 hidden md:hidden" data-drawer>
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" data-close-menu></div>
        <div class="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col border-l border-fg/10 bg-surface shadow-2xl">
          <div class="flex h-14 items-center justify-between px-4">
            <span class="gradient-text font-bold">${APP_NAME}</span>
            <button class="btn-icon" data-close-menu aria-label="Đóng menu">${icon('x')}</button>
          </div>
          <nav class="flex-1 space-y-1 overflow-y-auto px-3" aria-label="Menu đầy đủ">${navLinks(routes)}</nav>
          <div class="border-t border-fg/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <p class="truncate px-2 text-sm font-medium text-fg">${displayName()}</p>
            <p class="mb-2 px-2 text-xs text-subtle">${ROLE_LABELS[p.role]}</p>
            ${themeToggle({ withLabel: true })}
            <button class="nav-link w-full" data-logout>${icon('logout')} Đăng xuất</button>
          </div>
        </div>
      </div>
    </div>`,
  );

  const drawer = $('[data-drawer]', root);
  const openMenu = () => drawer.classList.remove('hidden');
  const closeMenu = () => drawer.classList.add('hidden');
  $$('[data-open-menu]', root).forEach((b) => b.addEventListener('click', openMenu));
  $$('[data-close-menu]', root).forEach((b) => b.addEventListener('click', closeMenu));
  $$('a', drawer).forEach((a) => a.addEventListener('click', closeMenu));
  $$('[data-logout]', root).forEach((b) =>
    b.addEventListener('click', async () => {
      closeMenu();
      if (await confirmDialog({ title: 'Đăng xuất', message: 'Bạn muốn đăng xuất khỏi ứng dụng?', confirmLabel: 'Đăng xuất', danger: false })) {
        await signOut();
      }
    }),
  );

  return {
    page: $('#page', root),
    setActive(route) {
      $('[data-page-title]', root).textContent = route.label;
      document.title = `${route.label} – ${APP_NAME}`;
      $$('[data-path]', root).forEach((a) => {
        if (a.dataset.path === route.navPath) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
    },
  };
}
