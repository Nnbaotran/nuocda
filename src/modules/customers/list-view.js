// Danh sách hồ sơ khách (chỉ Chủ). Bấm vào khách -> mở hồ sơ 3 thẻ.
import { $, html, setHtml } from '../../lib/dom.js';
import { emptyState, errorState, icon, loadingState } from '../../lib/ui.js';
import { listCustomers } from './api.js';
import { openCreateCustomer } from './forms.js';
import { matchCustomer } from './logic.js';

export function renderCustomers(root) {
  const state = { items: [], query: '', status: 'active' };
  setHtml(
    root,
    html`<section class="space-y-4">
      <div class="flex flex-wrap items-center gap-3">
        <div class="relative min-w-0 flex-1 basis-56">
          <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-500">${icon('search', 'size-4')}</span>
          <input class="input pl-9" type="search" placeholder="Tìm tên, SĐT, địa chỉ…" data-search aria-label="Tìm khách" />
        </div>
        <select class="input w-auto" data-status aria-label="Lọc trạng thái">
          <option value="active">Đang giao dịch</option>
          <option value="inactive">Ngừng giao dịch</option>
          <option value="all">Tất cả</option>
        </select>
        <button class="btn-primary" data-add>${icon('plus', 'size-4')} Thêm khách</button>
      </div>
      <div data-list>${loadingState()}</div>
    </section>`,
  );
  const section = $('section', root);
  const listEl = $('[data-list]', section);

  async function load() {
    setHtml(listEl, loadingState());
    try {
      state.items = await listCustomers();
      draw();
    } catch (err) {
      setHtml(listEl, errorState(err.message, load));
    }
  }

  function draw() {
    if (!state.items.length) {
      return setHtml(listEl, emptyState('Chưa có hồ sơ khách nào', html`<button class="btn-primary" data-add>${icon('plus', 'size-4')} Thêm khách đầu tiên</button>`));
    }
    const rows = state.items.filter(
      (c) => (state.status === 'all' || (state.status === 'active') === c.is_active) && matchCustomer(c, state.query),
    );
    if (!rows.length) return setHtml(listEl, emptyState('Không có khách phù hợp bộ lọc'));
    setHtml(
      listEl,
      html`<p class="mb-2 text-xs text-slate-500">${rows.length} khách</p>
      <ul class="grid gap-3 md:grid-cols-2">
        ${rows.map(
          (c) => html`<li>
            <a href="#/khach-hang/${c.id}" class="card card-hover flex items-center gap-3">
              <span class="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sky-500/25 to-violet-500/25 font-semibold text-white">
                ${c.name.trim().charAt(0).toUpperCase()}
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-semibold text-white">${c.name}</span>
                <span class="block truncate text-xs text-slate-500">${[c.phone, c.address].filter(Boolean).join(' · ') || 'Chưa có SĐT, địa chỉ'}</span>
              </span>
              ${c.is_active ? '' : html`<span class="badge-gray">Ngừng</span>`}
              <span class="text-slate-600" aria-hidden="true">›</span>
            </a>
          </li>`,
        )}
      </ul>`,
    );
  }

  section.addEventListener('click', (e) => {
    if (e.target.closest('[data-add]')) openCreateCustomer((id) => (location.hash = `#/khach-hang/${id}`));
  });
  $('[data-search]', section).addEventListener('input', (e) => {
    state.query = e.target.value;
    draw();
  });
  $('[data-status]', section).addEventListener('change', (e) => {
    state.status = e.target.value;
    draw();
  });
  load();
}
