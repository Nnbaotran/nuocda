import { html, setHtml } from '../../lib/dom.js';
import { icon } from '../../lib/ui.js';
import { currentProfile, displayName, ROLE_LABELS } from '../auth/session.js';

export function renderHome(root, { routes }) {
  const p = currentProfile();
  const shortcuts = routes.filter((r) => r.path !== '/');
  setHtml(
    root,
    html`<section class="space-y-5">
      <div class="card relative overflow-hidden">
        <div class="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-accent/15 blur-3xl"></div>
        <p class="text-sm text-muted">Xin chào,</p>
        <h2 class="text-2xl font-bold text-fg">${displayName()}</h2>
        <span class="${p?.role === 'OWNER' ? 'badge-violet' : 'badge-cyan'} mt-2">${ROLE_LABELS[p?.role] ?? ''}</span>
      </div>
      <div class="grid grid-cols-2 gap-3 md:grid-cols-3">
        ${shortcuts.map(
          (r) => html`<a href="#${r.path}" class="card card-hover flex flex-col gap-3">
            <span class="grid size-10 place-items-center rounded-xl bg-fg/5 text-accent-ink">${icon(r.icon)}</span>
            <span class="text-sm font-medium text-fg">${r.label}</span>
            ${r.phase ? html`<span class="badge-gray w-fit">Sắp có</span>` : ''}
          </a>`,
        )}
      </div>
    </section>`,
  );
}
