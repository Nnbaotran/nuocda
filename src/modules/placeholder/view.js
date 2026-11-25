import { html, setHtml } from '../../lib/dom.js';
import { icon } from '../../lib/ui.js';

export function renderComingSoon(root, route) {
  setHtml(
    root,
    html`<div class="card flex flex-col items-center gap-3 py-14 text-center">
      <div class="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-accent/15 to-accent/5 text-accent-ink ring-1 ring-accent/20">
        ${icon(route.icon, 'size-7')}
      </div>
      <h2 class="text-lg font-semibold text-fg">${route.label}</h2>
      <p class="max-w-xs text-sm text-muted">Chức năng này sẽ có ở giai đoạn ${route.phase}.</p>
    </div>`,
  );
}
