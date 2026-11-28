import { html, setHtml } from '../../lib/dom.js';
import { icon } from '../../lib/ui.js';

export function renderHome(root, { routes }) {
  const shortcuts = routes.filter((r) => r.path !== '/' && !r.primary);
  setHtml(
    root,
    html`<section class="space-y-5">
      <a href="#/ban-hang" class="btn-success min-h-24 text-3xl">${icon('cart', 'size-10')} BÁN HÀNG</a>
      <div class="grid grid-cols-2 gap-3 md:grid-cols-3">
        ${shortcuts.map(
          (r) => html`<a href="#${r.path}" class="card card-hover flex flex-col gap-3">
            <span class="grid size-10 place-items-center rounded-xl bg-fg/5 text-accent-ink">${icon(r.icon)}</span>
            <span class="text-lg font-semibold text-fg">${r.label}</span>
          </a>`,
        )}
      </div>
    </section>`,
  );
}
