// Chi tiết đơn: các dòng hàng, tổng/đã trả/còn nợ, Sửa đơn, Huỷ đơn, lịch sử sửa/huỷ.
import { $, html, setHtml } from '../../lib/dom.js';
import { formatDateTime, formatVND } from '../../lib/format.js';
import { confirmDialog, errorState, icon, loadingState, openModal, promptReason, toast } from '../../lib/ui.js';
import { getCustomerPrices } from '../customers/api.js';
import { buildPriceRows } from '../customers/logic.js';
import { listProducts } from '../products/api.js';
import { cancelOrder, deleteCancelledOrder, getOrder, updateOrder } from './api.js';
import { mountOrderEditor } from './editor.js';
import { ORDER_STATUS, payModeOf } from './logic.js';

const qtyText = (q) => String(Number(q)).replace('.', ',');

function describeLog(log) {
  if (log.action === 'cancel') {
    return `Huỷ đơn${log.changes?.reason ? ` – lý do: ${log.changes.reason}` : ''}`;
  }
  const b = log.changes?.before ?? {};
  const a = log.changes?.after ?? {};
  const parts = [];
  if (b.total !== a.total) parts.push(`tổng ${formatVND(b.total)} → ${formatVND(a.total)}`);
  if (b.paid !== a.paid) parts.push(`đã trả ${formatVND(b.paid)} → ${formatVND(a.paid)}`);
  const items = (x) => (x.items ?? []).map((i) => `${i.product_name} ${qtyText(i.quantity)}×${formatVND(i.unit_price)}`).join(', ');
  if (items(b) !== items(a)) parts.push(`hàng: ${items(b)} → ${items(a)}`);
  if (b.order_date !== a.order_date) parts.push('đổi ngày giờ đơn');
  if ((b.note ?? '') !== (a.note ?? '')) parts.push('đổi ghi chú');
  return `Sửa đơn: ${parts.join('; ') || 'không đổi số liệu'}`;
}

export function renderOrderDetail(root, { params }) {
  const id = params.id;
  let order = null;

  setHtml(root, html`<section class="space-y-4">
    <a href="#/don-hang" class="inline-flex min-h-11 items-center gap-1 text-sm text-slate-400 hover:text-white">‹ Danh sách đơn</a>
    <div data-body>${loadingState(3)}</div>
  </section>`);
  const section = $('section', root);
  const body = $('[data-body]', section);

  async function load() {
    setHtml(body, loadingState(3));
    try {
      order = await getOrder(id);
      draw();
    } catch (err) {
      setHtml(body, errorState(err.message, load));
    }
  }

  function draw() {
    const o = order;
    const active = o.status === 'active';
    const debt = active ? o.total - o.paid : 0;
    setHtml(
      body,
      html`<div class="space-y-4">
        <div class="card">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 class="text-xl font-bold text-white">${o.code}</h2>
              <p class="text-sm text-slate-400">${formatDateTime(o.order_date)}</p>
              <a class="mt-1 inline-block text-cyan-300 hover:underline" href="#/khach-hang/${o.customer_id}/cong-no">${o.customers?.name ?? ''}</a>
            </div>
            <span class="${ORDER_STATUS[o.status].badge}">${ORDER_STATUS[o.status].label}</span>
          </div>
          ${!active ? html`<p class="mt-3 rounded-xl bg-white/5 px-3 py-2 text-sm text-slate-300">Đã huỷ lúc ${formatDateTime(o.cancelled_at)}${o.cancel_reason ? ` – ${o.cancel_reason}` : ''}. Đơn không còn tính vào doanh thu và công nợ.</p>` : ''}
          ${o.note ? html`<p class="mt-3 text-sm text-slate-400 italic">${o.note}</p>` : ''}
          ${active
            ? html`<div class="mt-4 flex gap-2">
                <button class="btn-secondary flex-1" data-edit>${icon('edit', 'size-4')} Sửa đơn</button>
                <button class="btn-secondary flex-1 hover:text-rose-300" data-cancel>${icon('x', 'size-4')} Huỷ đơn</button>
              </div>`
            : html`<div class="mt-4">
                <button class="btn-danger w-full" data-delete>${icon('trash', 'size-4')} Xoá khỏi lịch sử đơn hàng</button>
              </div>`}
        </div>

        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Sản phẩm</th><th class="text-right">SL</th><th class="text-right">Đơn giá</th><th class="text-right">Thành tiền</th></tr></thead>
            <tbody>
              ${o.items.map((i) => html`<tr>
                <td class="font-medium text-white">${i.product_name} <span class="text-xs text-slate-500">/ ${i.unit}</span></td>
                <td class="text-right tabular-nums">${qtyText(i.quantity)}</td>
                <td class="text-right tabular-nums">${formatVND(i.unit_price)}</td>
                <td class="text-right font-semibold tabular-nums">${formatVND(i.line_total)}</td>
              </tr>`)}
            </tbody>
          </table>
        </div>

        <div class="card space-y-2">
          <div class="flex justify-between"><span class="text-slate-400">Tổng tiền</span><span class="text-lg font-bold text-white tabular-nums">${formatVND(o.total)}</span></div>
          <div class="flex justify-between"><span class="text-slate-400">Khách đã trả lúc mua</span><span class="tabular-nums">${formatVND(o.paid)}</span></div>
          <div class="flex justify-between"><span class="text-slate-400">Ghi nợ</span><span class="font-semibold tabular-nums ${debt > 0 ? 'text-amber-300' : 'text-emerald-300'}">${formatVND(debt)}</span></div>
          <p class="text-xs text-slate-500">Khách trả nợ sau đó được ghi chung ở thẻ "Công nợ" của khách.</p>
        </div>

        ${o.logs.length
          ? html`<div class="card">
              <h3 class="mb-2 font-semibold text-white">Lịch sử thay đổi</h3>
              <ul class="space-y-2 text-sm">
                ${o.logs.map((l) => html`<li class="border-l-2 border-cyan-400/40 pl-3">
                  <p class="text-xs text-slate-500">${formatDateTime(l.created_at)}</p>
                  <p class="text-slate-300">${describeLog(l)}</p>
                </li>`)}
              </ul>
            </div>`
          : ''}
      </div>`,
    );
  }

  async function openEdit() {
    let rows;
    try {
      const [products, prices] = await Promise.all([listProducts(), getCustomerPrices(order.customer_id)]);
      const inOrder = new Set(order.items.map((i) => i.product_id));
      rows = buildPriceRows(products, prices)
        .filter((r) => r.is_active || inOrder.has(r.product_id))
        .map((r) => ({ product_id: r.product_id, name: r.name, unit: r.unit, is_active: r.is_active, price: r.price }));
    } catch (err) {
      return toast(err.message, 'error');
    }
    const { el, close } = openModal({ title: `Sửa đơn ${order.code}`, wide: true, body: html`<div data-editor></div>` });
    $('footer', el)?.remove(); // khung sửa có nút Lưu riêng
    mountOrderEditor($('[data-editor]', el), {
      rows,
      submitLabel: 'Lưu thay đổi',
      initial: {
        qty: Object.fromEntries(order.items.map((i) => [i.product_id, qtyText(i.quantity)])),
        prices: Object.fromEntries(order.items.map((i) => [i.product_id, Number(i.unit_price)])),
        mode: payModeOf(order.total, order.paid),
        paid: order.paid,
        note: order.note,
        orderDate: order.order_date,
      },
      onSubmit: async ({ items, paid, note, orderDate }) => {
        await updateOrder({ orderId: order.id, items, paid, note, orderDate });
        toast('Đã lưu thay đổi của đơn');
        close();
        load();
      },
    });
  }

  async function onCancel() {
    const reason = await promptReason({
      title: `Huỷ đơn ${order.code}`,
      message: `Đơn ${formatVND(order.total)} sẽ bị loại khỏi doanh thu và công nợ. Không xoá, vẫn xem lại được.`,
      confirmLabel: 'Huỷ đơn',
    });
    if (reason === null) return;
    try {
      await cancelOrder(order.id, reason);
      toast('Đã huỷ đơn');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function onDelete() {
    const ok = await confirmDialog({
      title: `Xoá đơn ${order.code}`,
      message: 'Đơn đã huỷ sẽ bị xoá hẳn khỏi lịch sử đơn hàng, không khôi phục được. Doanh thu và công nợ không thay đổi (đơn huỷ vốn không được tính).',
      confirmLabel: 'Xoá hẳn',
    });
    if (!ok) return;
    try {
      await deleteCancelledOrder(order.id);
      toast(`Đã xoá đơn ${order.code}`);
      location.hash = '#/don-hang';
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  section.addEventListener('click', (e) => {
    if (!order) return;
    if (e.target.closest('[data-delete]')) onDelete();
    if (e.target.closest('[data-edit]')) openEdit();
    if (e.target.closest('[data-cancel]')) onCancel();
  });

  load();
}
