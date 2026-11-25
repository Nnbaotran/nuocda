// Thẻ "Bán hàng" trong hồ sơ khách: lên đơn (giá tự lấy theo giá riêng) + các đơn gần đây.
import { $, html, setHtml } from '../../lib/dom.js';
import { formatDateTime, formatVND } from '../../lib/format.js';
import { emptyState, errorState, loadingState, toast } from '../../lib/ui.js';
import { createOrder, listOrders } from '../orders/api.js';
import { mountOrderEditor } from '../orders/editor.js';
import { ORDER_STATUS } from '../orders/logic.js';

export function renderSalesTab(panel, { customer, priceRows }) {
  if (!customer.is_active) {
    return setHtml(panel, html`<div class="card py-10 text-center text-muted">Khách đang <strong class="text-fg">ngừng giao dịch</strong>. Bấm "Giao dịch lại" ở trên để lên đơn.</div>`);
  }
  const rows = priceRows.filter((r) => r.is_active).map((r) => ({ ...r, price: r.price }));
  setHtml(
    panel,
    html`<div class="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <section aria-label="Lên đơn mới">
        <h3 class="mb-3 font-semibold text-fg">Lên đơn mới</h3>
        <div data-editor></div>
      </section>
      <section aria-label="Đơn gần đây">
        <h3 class="mb-3 font-semibold text-fg">Đơn gần đây</h3>
        <div data-recent>${loadingState(2)}</div>
      </section>
    </div>`,
  );
  const recentEl = $('[data-recent]', panel);

  async function loadRecent() {
    setHtml(recentEl, loadingState(2));
    try {
      const orders = await listOrders({ customerId: customer.id, limit: 10 });
      if (!orders.length) return setHtml(recentEl, emptyState('Chưa có đơn nào'));
      setHtml(
        recentEl,
        html`<ul class="space-y-2">
          ${orders.map((o) => {
            const debt = o.status === 'active' ? o.total - o.paid : 0;
            return html`<li>
              <a href="#/don-hang/${o.id}" class="card card-hover block p-3 ${o.status === 'cancelled' ? 'opacity-60' : ''}">
                <div class="flex items-center justify-between gap-2">
                  <span class="font-semibold text-fg">${o.code}</span>
                  <span class="${ORDER_STATUS[o.status].badge}">${ORDER_STATUS[o.status].label}</span>
                </div>
                <div class="mt-1 flex items-center justify-between text-sm">
                  <span class="text-subtle">${formatDateTime(o.order_date)}</span>
                  <span class="font-semibold tabular-nums ${o.status === 'cancelled' ? 'text-subtle line-through' : 'text-accent-ink'}">${formatVND(o.total)}</span>
                </div>
                ${debt > 0 ? html`<p class="mt-1 text-right text-xs text-warn">Ghi nợ ${formatVND(debt)}</p>` : ''}
              </a>
            </li>`;
          })}
        </ul>`,
      );
    } catch (err) {
      setHtml(recentEl, errorState(err.message, loadRecent));
    }
  }

  mountOrderEditor($('[data-editor]', panel), {
    rows,
    submitLabel: 'Lưu đơn',
    onSubmit: async ({ items, paid, note, orderDate }) => {
      const r = await createOrder({ customerId: customer.id, items, paid, note, orderDate });
      toast(`Đã lưu đơn ${r.code} – ${formatVND(r.total)}`);
      loadRecent();
      return 'reset';
    },
  });
  loadRecent();
}
