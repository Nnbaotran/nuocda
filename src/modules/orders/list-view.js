// Trang Đơn hàng: lọc theo ngày/khoảng ngày, khách, trạng thái. Bấm đơn -> chi tiết.
import { $, html, setHtml } from '../../lib/dom.js';
import { formatDateTime, formatVND } from '../../lib/format.js';
import { mountRangeFilter } from '../../lib/range-filter.js';
import { emptyState, errorState, icon, loadingState, openModal } from '../../lib/ui.js';
import { listCustomers } from '../customers/api.js';
import { matchCustomer } from '../customers/logic.js';
import { listOrders } from './api.js';
import { ORDER_STATUS } from './logic.js';

export function renderOrders(root) {
  const state = { range: null, customerId: '', status: 'all', customers: [], orders: [] };

  setHtml(
    root,
    html`<section class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted">Đơn được lên từ thẻ "Bán hàng" trong hồ sơ khách.</p>
        <a class="btn-success w-auto min-h-12 px-5 text-lg" href="#/ban-hang">${icon('cart', 'size-6')} Bán hàng</a>
      </div>
      <div data-range></div>
      <div class="grid grid-cols-2 gap-2">
        <select class="input" data-customer aria-label="Lọc theo khách"><option value="">Tất cả khách</option></select>
        <select class="input" data-status aria-label="Lọc trạng thái">
          <option value="all">Mọi trạng thái</option>
          <option value="active">Hiệu lực</option>
          <option value="cancelled">Đã huỷ</option>
        </select>
      </div>
      <div data-list>${loadingState()}</div>
    </section>`,
  );
  const section = $('section', root);
  const listEl = $('[data-list]', section);
  const custSel = $('[data-customer]', section);

  async function loadCustomers() {
    try {
      state.customers = await listCustomers();
      for (const c of state.customers) custSel.add(new Option(c.name, c.id));
    } catch {
      /* lọc theo khách không bắt buộc */
    }
  }

  async function load() {
    setHtml(listEl, loadingState());
    try {
      state.orders = await listOrders({ from: state.range.from, to: state.range.to, customerId: state.customerId || null, status: state.status });
      draw();
    } catch (err) {
      setHtml(listEl, errorState(err.message, load));
    }
  }

  function draw() {
    const rows = state.orders;
    if (!rows.length) return setHtml(listEl, emptyState('Không có đơn nào trong khoảng này'));
    const debtOf = (o) => (o.status === 'active' ? o.total - o.paid : 0);
    const badge = (o) => html`<span class="${ORDER_STATUS[o.status].badge}">${ORDER_STATUS[o.status].label}</span>`;
    setHtml(
      listEl,
      html`<p class="mb-2 text-xs text-subtle">${rows.length} đơn${rows.length >= 500 ? ' (hiện 500 đơn mới nhất, hãy thu hẹp khoảng ngày)' : ''}</p>
      <ul class="space-y-2 md:hidden">
        ${rows.map(
          (o) => html`<li><a href="#/don-hang/${o.id}" class="card card-hover block p-3 ${o.status === 'cancelled' ? 'opacity-60' : ''}">
            <div class="flex items-center justify-between gap-2">
              <span class="font-semibold text-fg">${o.code}</span>${badge(o)}
            </div>
            <p class="mt-0.5 truncate text-sm text-fg-2">${o.customers?.name ?? ''}</p>
            <div class="mt-1 flex items-end justify-between gap-2">
              <span class="text-xs text-subtle">${formatDateTime(o.order_date)}</span>
              <span class="text-right">
                <span class="block font-semibold tabular-nums ${o.status === 'cancelled' ? 'text-subtle line-through' : 'text-accent-ink'}">${formatVND(o.total)}</span>
                ${debtOf(o) > 0 ? html`<span class="block text-xs text-warn">Ghi nợ ${formatVND(debtOf(o))}</span>` : ''}
              </span>
            </div>
          </a></li>`,
        )}
      </ul>
      <div class="table-wrap hidden md:block">
        <table class="table">
          <thead><tr><th>Mã đơn</th><th>Ngày giờ</th><th>Khách</th><th class="text-right">Tổng tiền</th><th class="text-right">Đã trả</th><th class="text-right" title="Phần chưa trả lúc mua; khách trả nợ sau đó xem ở thẻ Công nợ">Ghi nợ</th><th>Trạng thái</th></tr></thead>
          <tbody>
            ${rows.map(
              (o) => html`<tr class="cursor-pointer ${o.status === 'cancelled' ? 'opacity-60 line-through' : ''}" data-href="#/don-hang/${o.id}">
                <td><a class="font-semibold text-fg hover:underline" href="#/don-hang/${o.id}">${o.code}</a></td>
                <td class="text-muted">${formatDateTime(o.order_date)}</td>
                <td>${o.customers?.name ?? ''}</td>
                <td class="text-right font-semibold text-accent-ink tabular-nums">${formatVND(o.total)}</td>
                <td class="text-right tabular-nums">${formatVND(o.paid)}</td>
                <td class="text-right tabular-nums ${debtOf(o) > 0 ? 'text-warn' : 'text-subtle'}">${formatVND(debtOf(o))}</td>
                <td>${badge(o)}</td>
              </tr>`,
            )}
          </tbody>
        </table>
      </div>`,
    );
  }

  section.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-href]');
    if (tr && !e.target.closest('a')) location.hash = tr.dataset.href;
  });
  custSel.addEventListener('change', () => {
    state.customerId = custSel.value;
    load();
  });
  $('[data-status]', section).addEventListener('change', (e) => {
    state.status = e.target.value;
    load();
  });

  const filter = mountRangeFilter($('[data-range]', section), {
    initial: 'today',
    onChange: (r) => {
      state.range = r;
      load();
    },
  });
  state.range = filter.get();
  loadCustomers();
  load();
}
