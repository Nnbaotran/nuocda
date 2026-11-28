// Trang Bán hàng: (1) chọn khách bằng danh sách chữ to  ->  (2) màn hình POS của khách đó.
import { $, html, setHtml } from '../../lib/dom.js';
import { formatVND } from '../../lib/format.js';
import { emptyState, errorState, icon, loadingState } from '../../lib/ui.js';
import { getCustomer, getCustomerPrices, listCustomers } from '../customers/api.js';
import { buildPriceRows, matchCustomer } from '../customers/logic.js';
import { listProducts } from '../products/api.js';
import { createOrder, customerBalances } from './api.js';
import { mountPos } from './pos.js';

/** #/ban-hang — chọn khách */
export async function renderPosPickCustomer(root) {
  setHtml(root, html`<section class="mx-auto max-w-2xl space-y-4">
    <h2 class="text-2xl font-bold text-fg">Bán cho khách nào?</h2>
    <label class="relative block">
      <span class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-subtle">${icon('search', 'size-6')}</span>
      <input class="input min-h-14 pl-12 text-xl" type="search" data-q placeholder="Gõ tên hoặc số điện thoại…" aria-label="Tìm khách" />
    </label>
    <div data-list>${loadingState(4)}</div>
  </section>`);
  const section = $('section', root);
  const list = $('[data-list]', section);
  let customers = [];
  let balances = new Map();

  function draw(q = '') {
    const rows = customers.filter((c) => c.is_active && matchCustomer(c, q));
    if (!customers.length) {
      return setHtml(list, emptyState('Chưa có khách nào', html`<a class="btn-primary" href="#/khach-hang">${icon('plus', 'size-4')} Thêm khách</a>`));
    }
    if (!rows.length) return setHtml(list, emptyState('Không tìm thấy khách. Kiểm tra lại tên hoặc số điện thoại.'));
    setHtml(list, html`<ul class="space-y-3">
      ${rows.map((c) => {
        const b = balances.get(c.id) ?? 0;
        return html`<li><a href="#/ban-hang/${c.id}" class="card card-hover flex min-h-20 items-center gap-4 p-4">
          <span class="grid size-14 shrink-0 place-items-center rounded-2xl bg-accent/10 text-2xl font-black text-accent-ink">${c.name.trim().charAt(0).toUpperCase()}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-xl font-bold text-fg">${c.name}</span>
            <span class="block truncate text-base text-muted">${c.phone || c.address || ' '}</span>
          </span>
          ${b > 0 ? html`<span class="text-right"><span class="block text-sm text-muted">Đang nợ</span><span class="text-lg font-bold text-warn tabular-nums">${formatVND(b)}</span></span>` : ''}
          <span class="text-3xl text-faint" aria-hidden="true">›</span>
        </a></li>`;
      })}
    </ul>`);
  }

  try {
    [customers, balances] = await Promise.all([listCustomers(), customerBalances()]);
    draw();
    $('[data-q]', section).addEventListener('input', (e) => draw(e.target.value));
  } catch (err) {
    setHtml(list, errorState(err.message, () => renderPosPickCustomer(root)));
  }
}

/** Dữ liệu cho POS của 1 khách: thông tin khách, hàng + giá riêng, nợ hiện tại. */
export async function loadPosData(customerId) {
  const [customer, products, prices, balances] = await Promise.all([
    getCustomer(customerId),
    listProducts(),
    getCustomerPrices(customerId),
    customerBalances(),
  ]);
  const rows = buildPriceRows(products, prices).map((r) => ({ product_id: r.product_id, name: r.name, unit: r.unit, is_active: r.is_active, price: r.price }));
  return { customer, rows, balance: balances.get(customerId) ?? 0 };
}

/** Vẽ POS lên đơn mới (dùng ở trang Bán hàng và thẻ Bán hàng trong hồ sơ khách). */
export async function mountCreatePos(container, customerId, { allowChangeCustomer = true } = {}) {
  setHtml(container, loadingState(4));
  try {
    const { customer, rows, balance } = await loadPosData(customerId);
    if (!customer.is_active) {
      return setHtml(container, html`<div class="card py-10 text-center text-xl text-muted">Khách <strong class="text-fg">${customer.name}</strong> đang ngừng giao dịch.<br />
        <a class="mt-4 inline-block text-accent-ink underline" href="#/khach-hang/${customer.id}">Mở hồ sơ để cho giao dịch lại</a></div>`);
    }
    mountPos(container, {
      customer,
      rows,
      balance,
      mode: 'create',
      onSave: async ({ items, paid, note, orderDate }) => createOrder({ customerId: customer.id, items, paid, note, orderDate }),
      onViewOrder: (id) => (location.hash = `#/don-hang/${id}`),
      onChangeCustomer: allowChangeCustomer ? () => (location.hash = '#/ban-hang') : null,
    });
  } catch (err) {
    setHtml(container, errorState(err.message, () => mountCreatePos(container, customerId, { allowChangeCustomer })));
  }
}

/** #/ban-hang/:id */
export function renderPosPage(root, { params }) {
  return mountCreatePos(root, params.id);
}
