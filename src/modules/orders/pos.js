// Màn hình bán hàng kiểu POS — dùng chung cho LÊN ĐƠN MỚI và SỬA ĐƠN.
// Thiết kế cho người lớn tuổi / ít dùng công nghệ:
//   - 4 bước, mỗi màn hình chỉ làm 1 việc: ① Chọn hàng → ② Cách trả tiền → ③ Xác nhận → ④ Xong
//   - Nút cao ≥ 56px, chữ to, tiền hiện rất to; bấm ô sản phẩm = thêm 1 (rung nhẹ trên Android)
//   - Không phải gõ bàn phím: có bàn phím số to ngay trên màn hình
//   - Màu theo việc: xanh lá = đồng ý/trả tiền, vàng = ghi nợ, xanh lam = trả một phần, đỏ = xoá
// Chỉ vẽ lại phần thay đổi (ô được bấm, giỏ hàng, thanh tổng tiền), không vẽ lại cả trang.
import { fromLocalInputVN, toLocalInputVN } from '../../lib/dates.js';
import { $, $$, html, setHtml } from '../../lib/dom.js';
import { formatQty, formatVND } from '../../lib/format.js';
import { confirmDialog, icon, openModal } from '../../lib/ui.js';
import { balanceLabel, lineTotal } from './logic.js';
import {
  addOne, cartCount, cartItems, cartLines, cartTotal, createCart,
  keypadPress, keypadValue, quickAmounts, removeOne, setPrice, setQty,
} from './pos-logic.js';

const buzz = () => navigator.vibrate?.(12);
const KEYS = { money: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'], qty: ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'] };
const keyLabel = (k) => (k === '⌫' ? '⌫' : k);

/** Bàn phím số to (hộp thoại). Trả về Promise<số | null>. */
export function openKeypad({ title, sub = '', mode = 'money', value = '' }) {
  return new Promise((resolve) => {
    let v = mode === 'qty' ? formatQty(value || '') : value ? String(value) : '';
    if (v === '0') v = '';
    let done = false;
    const show = () => (mode === 'money' ? (v ? formatVND(keypadValue(v)) : '0 ₫') : v || '0');
    const { el, close } = openModal({
      title,
      submitLabel: 'Xong',
      body: html`<div class="space-y-3">
        ${sub ? html`<p class="text-lg text-muted">${sub}</p>` : ''}
        <div class="pos-display" data-kp-display aria-live="polite">${show()}</div>
        <div class="grid grid-cols-3 gap-2">
          ${KEYS[mode].map((k) => html`<button type="button" class="pos-key" data-key="${k}" aria-label="${k === '⌫' ? 'Xoá 1 số' : k}">${keyLabel(k)}</button>`)}
        </div>
        <button type="button" class="pos-btn min-h-12 text-lg" data-key="C">Xoá hết số</button>
      </div>`,
      onSubmit: () => {
        done = true;
        resolve(keypadValue(v));
      },
    });
    el.querySelector('.modal-panel').classList.add('md:max-w-sm');
    el.addEventListener('click', (e) => {
      const k = e.target.closest('[data-key]')?.dataset.key;
      if (!k) return;
      v = keypadPress(v, k, mode);
      buzz();
      el.querySelector('[data-kp-display]').textContent = show();
    });
    new MutationObserver((_, obs) => {
      if (!el.isConnected) {
        obs.disconnect();
        if (!done) resolve(null);
      }
    }).observe(document.body, { childList: true });
    void close;
  });
}

/**
 * container: nơi vẽ. Tham số:
 *  customer {id, name}, balance (nợ hiện tại, tuỳ chọn), rows [{product_id, name, unit, price, is_active}]
 *  mode 'create' | 'edit', initial { items, paid, note, orderDate } (khi sửa đơn)
 *  onSave({items, paid, note, orderDate}) -> Promise<{id, code, total, paid}>
 *  onDone(result) (sửa đơn: đóng hộp thoại), onViewOrder(id), onChangeCustomer() (tuỳ chọn)
 *  fixedBar: thanh tổng tiền dính đáy màn hình (trang) hay dính đáy khung (hộp thoại)
 */
export function mountPos(container, opts) {
  const { customer, rows, mode = 'create', initial = {}, onSave, onDone, onViewOrder, onChangeCustomer, fixedBar = true } = opts;
  const st = {
    step: 'pick',
    cart: createCart(initial.items ?? []),
    pay: null, // 'full' | 'debt' | 'partial'
    paidText: '',
    paid: 0,
    note: initial.note ?? '',
    orderDate: initial.orderDate ?? null,
    result: null,
    saving: false,
    error: '',
  };
  if (mode === 'edit' && initial.items) {
    const t = cartTotal(st.cart);
    st.pay = initial.paid >= t ? 'full' : initial.paid > 0 ? 'partial' : 'debt';
    st.paid = initial.paid;
    st.paidText = initial.paid ? String(initial.paid) : '';
  }
  const priceOf = (id) => rows.find((r) => r.product_id === id)?.price ?? 0;
  const total = () => cartTotal(st.cart);
  const paidNow = () => (st.pay === 'full' ? total() : st.pay === 'debt' ? 0 : st.paid);

  // ---------- Khung chung ----------
  const head = (n, text) => html`<h3 class="flex items-center gap-3 text-xl font-bold text-fg">
    <span class="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-lg text-white">${n}</span>${text}</h3>`;
  const customerStrip = () => html`<div class="card flex items-center gap-3 p-3">
    <span class="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent/10 text-xl font-black text-accent-ink">${customer.name.trim().charAt(0).toUpperCase()}</span>
    <div class="min-w-0 flex-1">
      <p class="text-sm text-muted">${mode === 'edit' ? 'Sửa đơn của khách' : 'Bán cho khách'}</p>
      <p class="text-2xl leading-tight font-bold break-words text-fg">${customer.name}</p>
      ${opts.balance != null ? html`<p class="text-base ${opts.balance > 0 ? 'text-warn' : 'text-good'}">${balanceLabel(opts.balance).text}</p>` : ''}
    </div>
    ${onChangeCustomer && mode === 'create' ? html`<button type="button" class="btn-secondary min-h-12 shrink-0 self-start px-3 text-base" data-act="change-customer">Đổi khách</button>` : ''}
  </div>`;

  // Thanh ghim đáy chứa nút chính của từng bước (luôn thấy, không phải kéo xuống)
  const barCls = () => `${fixedBar
    ? 'fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 md:bottom-0 md:left-64'
    : 'sticky bottom-0 z-10 -mx-5 -mb-4'} border-t border-fg/10 bg-surface/95 px-4 py-3 shadow-[0_-8px_24px_var(--c-shadow)] backdrop-blur`;
  const actionBar = (inner) => html`<div class="${barCls()}"><div class="mx-auto flex max-w-xl items-center gap-3">${inner}</div></div>`;
  const pad = () => (fixedBar ? 'pb-44 md:pb-28' : 'pb-4');

  function render() {
    if (st.step === 'pick') return renderPick();
    if (st.step === 'pay') return renderPay();
    if (st.step === 'partial') return renderPartial();
    if (st.step === 'confirm') return renderConfirm();
    return renderDone();
  }

  // ---------- ① Chọn hàng ----------
  function renderPick() {
    const active = rows.filter((r) => r.is_active || st.cart.has(r.product_id));
    setHtml(
      container,
      html`<div class="space-y-5 ${pad()}">
        ${customerStrip()}
        <section class="space-y-3">
          ${head(1, 'Chọn hàng')}
          <p class="text-base text-muted">Bấm vào ô hàng để thêm 1. Bấm nhiều lần để thêm nhiều.</p>
          ${active.length
            ? html`<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                ${active.map((r) => html`<button type="button" class="pos-tile" data-tile="${r.product_id}" aria-label="Thêm 1 ${r.unit} ${r.name}">
                  <span class="pos-badge ${st.cart.has(r.product_id) ? '' : 'hidden'}" data-badge></span>
                  <span class="text-xl leading-tight font-bold text-fg">${r.name}</span>
                  <span>
                    <span class="block text-lg font-semibold text-accent-ink tabular-nums">${formatVND(r.price)}</span>
                    <span class="block text-sm text-muted">mỗi ${r.unit}</span>
                  </span>
                </button>`)}
              </div>`
            : html`<p class="card text-lg text-muted">Chưa có sản phẩm đang bán. Thêm ở mục Sản phẩm.</p>`}
        </section>
        <section class="space-y-3" data-cart></section>
        <div class="${barCls()}" data-bar></div>
      </div>`,
    );
    refreshPick();
  }

  function refreshPick() {
    for (const tile of $$('[data-tile]', container)) {
      const item = st.cart.get(tile.dataset.tile);
      tile.dataset.inCart = item ? 'true' : 'false';
      const b = $('[data-badge]', tile);
      b.classList.toggle('hidden', !item);
      b.textContent = item ? formatQty(item.qty) : '';
    }
    const lines = cartLines(st.cart, rows);
    setHtml(
      $('[data-cart]', container),
      lines.length
        ? html`<div class="flex items-center justify-between gap-3">
            <h3 class="text-xl font-bold text-fg">Hàng đã chọn (${lines.length})</h3>
            <button type="button" class="min-h-12 rounded-xl px-3 text-base font-semibold text-bad hover:bg-rose-500/10" data-act="clear">${icon('trash', 'size-5 inline')} Xoá hết</button>
          </div>
          <ul class="space-y-3">
            ${lines.map((l) => html`<li class="card p-3">
              <div class="flex items-baseline justify-between gap-3">
                <p class="min-w-0 text-xl font-bold text-fg">${l.name}</p>
                <p class="shrink-0 text-xl font-bold text-fg tabular-nums">${formatVND(l.total)}</p>
              </div>
              <div class="mt-3 flex items-center gap-2">
                <button type="button" class="pos-step" data-minus="${l.product_id}" aria-label="Bớt 1 ${l.name}">−</button>
                <button type="button" class="pos-display min-w-24 flex-1 py-2 text-center text-3xl" data-qty="${l.product_id}" aria-label="Sửa số lượng ${l.name}">${formatQty(l.qty)}</button>
                <button type="button" class="pos-step" data-plus="${l.product_id}" aria-label="Thêm 1 ${l.name}">+</button>
              </div>
              <div class="mt-2 flex items-center justify-between text-base text-muted">
                <span>${formatQty(l.qty)} ${l.unit} × ${formatVND(l.price)}</span>
                <button type="button" class="min-h-11 rounded-lg px-2 font-semibold text-accent-ink underline-offset-4 hover:underline" data-price="${l.product_id}">Sửa giá</button>
              </div>
            </li>`)}
          </ul>`
        : html`<div class="rounded-2xl border-2 border-dashed border-fg/15 p-6 text-center text-lg text-muted">${icon('cart', 'mx-auto mb-2 size-10 text-faint')}Chưa chọn hàng nào</div>`,
    );
    const t = total();
    setHtml(
      $('[data-bar]', container),
      html`<div class="mx-auto flex max-w-5xl items-center gap-3">
        <div class="min-w-0 flex-1">
          <p class="text-sm text-muted">Tổng tiền ${cartCount(st.cart) ? `(${cartCount(st.cart)} loại hàng)` : ''}</p>
          <p class="truncate text-3xl font-black text-fg tabular-nums">${formatVND(t)}</p>
        </div>
        <button type="button" class="btn-success w-auto min-w-40" data-act="to-pay" ${t <= 0 && !cartCount(st.cart) ? 'disabled' : ''}>Tiếp tục ${icon('back', 'size-6 rotate-180')}</button>
      </div>`,
    );
  }

  // ---------- ② Cách trả tiền ----------
  function renderPay() {
    const t = total();
    setHtml(
      container,
      html`<div class="mx-auto max-w-xl space-y-5 pb-6">
        ${customerStrip()}
        ${head(2, 'Khách trả tiền thế nào?')}
        <div class="card text-center">
          <p class="text-lg text-muted">Tổng tiền đơn</p>
          <p class="text-5xl font-black text-fg tabular-nums">${formatVND(t)}</p>
        </div>
        <div class="space-y-3">
          <button type="button" class="btn-success min-h-20 flex-col gap-0 text-2xl" data-pay="full">${icon('check', 'size-7 inline')} Khách trả đủ
            <span class="text-base font-semibold opacity-90">Nhận ${formatVND(t)}</span></button>
          <button type="button" class="btn-warning min-h-20 flex-col gap-0 text-2xl" data-pay="debt">Ghi nợ hết
            <span class="text-base font-semibold opacity-80">Khách chưa trả đồng nào</span></button>
          <button type="button" class="btn-info min-h-20 flex-col gap-0 text-2xl" data-pay="partial" ${t <= 0 ? 'disabled' : ''}>Trả một phần
            <span class="text-base font-semibold opacity-90">Phần còn lại ghi nợ</span></button>
        </div>
        <button type="button" class="pos-btn" data-act="back-pick">${icon('back', 'size-6')} Quay lại chọn hàng</button>
      </div>`,
    );
  }

  // ---------- ②b Trả một phần: nhập số tiền ----------
  function renderPartial() {
    const t = total();
    const chips = quickAmounts(t);
    setHtml(
      container,
      html`<div class="mx-auto max-w-xl space-y-4 ${pad()}">
        ${head(2, 'Khách trả bao nhiêu?')}
        <p class="text-lg text-muted">Tổng đơn <strong class="text-fg">${formatVND(t)}</strong></p>
        <div class="pos-display" data-paid-display></div>
        <p class="text-xl font-semibold" data-remain></p>
        ${chips.length ? html`<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          ${chips.map((a) => html`<button type="button" class="pos-btn min-h-14 text-lg" data-amount="${a}">${formatVND(a)}</button>`)}
        </div>` : ''}
        <div class="grid grid-cols-3 gap-2">
          ${KEYS.money.map((k) => html`<button type="button" class="pos-key" data-pkey="${k}" aria-label="${k === '⌫' ? 'Xoá 1 số' : k}">${keyLabel(k)}</button>`)}
        </div>
        ${actionBar(html`<button type="button" class="pos-btn w-auto px-4" data-act="back-pay" aria-label="Quay lại">${icon('back', 'size-6')}</button>
          <button type="button" class="btn-success flex-1" data-act="partial-ok">Tiếp tục ${icon('back', 'size-6 rotate-180')}</button>`)}
      </div>`,
    );
    refreshPartial();
  }

  function refreshPartial() {
    const t = total();
    const v = keypadValue(st.paidText);
    $('[data-paid-display]', container).textContent = formatVND(v);
    const r = $('[data-remain]', container);
    const ok = v > 0 && v < t;
    r.className = `text-xl font-semibold ${ok ? 'text-warn' : 'text-bad'}`;
    r.textContent = v <= 0 ? 'Bấm số tiền khách trả' : v >= t ? 'Số tiền phải nhỏ hơn tổng đơn (trả đủ thì chọn "Khách trả đủ")' : `Ghi nợ: ${formatVND(t - v)}`;
    $('[data-act="partial-ok"]', container).disabled = !ok;
  }

  // ---------- ③ Xác nhận ----------
  function renderConfirm() {
    const t = total();
    const paid = paidNow();
    const lines = cartLines(st.cart, rows);
    const payText = { full: 'Khách trả đủ', debt: 'Ghi nợ hết', partial: 'Trả một phần' }[st.pay];
    setHtml(
      container,
      html`<div class="mx-auto max-w-xl space-y-5 ${pad()}">
        ${head(3, 'Kiểm tra lại rồi bấm Lưu')}
        <div class="card space-y-3 p-5">
          <p class="text-lg text-muted">Khách: <strong class="text-2xl text-fg">${customer.name}</strong></p>
          <ul class="divide-y divide-fg/10 border-y border-fg/10">
            ${lines.map((l) => html`<li class="flex items-baseline justify-between gap-3 py-3">
              <span class="text-lg text-fg"><strong>${l.name}</strong><br /><span class="text-base text-muted">${formatQty(l.qty)} ${l.unit} × ${formatVND(l.price)}</span></span>
              <span class="text-xl font-bold whitespace-nowrap text-fg tabular-nums">${formatVND(l.total)}</span>
            </li>`)}
          </ul>
          <div class="flex items-baseline justify-between"><span class="text-xl text-fg-2">Tổng tiền</span><span class="text-4xl font-black whitespace-nowrap text-fg tabular-nums">${formatVND(t)}</span></div>
          <p class="text-lg text-muted">${payText}</p>
          <div class="flex items-baseline justify-between gap-3 text-xl"><span class="text-fg-2">Khách trả</span><span class="font-bold whitespace-nowrap text-good tabular-nums">${formatVND(paid)}</span></div>
          <div class="flex items-baseline justify-between gap-3 text-xl"><span class="text-fg-2">Ghi nợ</span><span class="font-bold whitespace-nowrap tabular-nums ${t - paid > 0 ? 'text-warn' : 'text-muted'}">${formatVND(t - paid)}</span></div>
        </div>
        <details class="card" ${st.note ? 'open' : ''}>
          <summary class="min-h-11 cursor-pointer list-none py-2 text-lg font-semibold text-accent-ink select-none">＋ Ghi chú / đổi ngày giờ đơn</summary>
          <div class="mt-3 space-y-3">
            <label class="block text-base text-fg-2">Ghi chú
              <input class="input mt-1 text-lg" data-note maxlength="500" value="${st.note}" placeholder="VD: giao trước 6 giờ" /></label>
            <label class="block text-base text-fg-2">Ngày giờ đơn
              <input class="input mt-1 text-lg" type="datetime-local" data-date value="${toLocalInputVN(st.orderDate ?? new Date())}" max="${toLocalInputVN(new Date())}" /></label>
          </div>
        </details>
        <p class="form-error text-lg ${st.error ? '' : 'hidden'}" data-error>${st.error}</p>
        ${actionBar(html`<button type="button" class="pos-btn w-auto px-4" data-act="back-pay" aria-label="Quay lại" ${st.saving ? 'disabled' : ''}>${icon('back', 'size-6')}</button>
          <button type="button" class="btn-success flex-1 text-2xl" data-act="save" ${st.saving ? 'disabled' : ''}>
            ${icon('check', 'size-7')} ${st.saving ? 'Đang lưu…' : mode === 'edit' ? 'Lưu thay đổi' : 'Lưu đơn'}</button>`)}
      </div>`,
    );
  }

  // ---------- ④ Xong ----------
  function renderDone() {
    const r = st.result;
    const debt = r.total - r.paid;
    setHtml(
      container,
      html`<div class="mx-auto max-w-xl space-y-5 py-4 text-center">
        <div class="mx-auto grid size-24 place-items-center rounded-full bg-emerald-500/15 text-good ring-8 ring-emerald-500/10">${icon('check', 'size-14')}</div>
        <p class="text-3xl font-black text-fg">Đã lưu đơn</p>
        <p class="text-2xl font-bold text-accent-ink">${r.code}</p>
        <div class="card space-y-2 text-left">
          <p class="flex justify-between text-xl"><span class="text-fg-2">Khách</span><strong class="text-fg">${customer.name}</strong></p>
          <p class="flex justify-between text-xl"><span class="text-fg-2">Tổng tiền</span><strong class="text-fg tabular-nums">${formatVND(r.total)}</strong></p>
          <p class="flex justify-between text-xl"><span class="text-fg-2">Ghi nợ</span><strong class="tabular-nums ${debt > 0 ? 'text-warn' : 'text-good'}">${formatVND(debt)}</strong></p>
        </div>
        <button type="button" class="btn-success min-h-20 text-2xl" data-act="new">${icon('plus', 'size-7')} Bán đơn mới cho ${customer.name}</button>
        <button type="button" class="btn-info" data-act="view">Xem đơn vừa lưu</button>
        ${onChangeCustomer ? html`<button type="button" class="pos-btn" data-act="change-customer">Bán cho khách khác</button>` : ''}
      </div>`,
    );
  }

  async function save() {
    st.note = $('[data-note]', container)?.value.trim() ?? st.note;
    const d = $('[data-date]', container)?.value;
    st.orderDate = d ? fromLocalInputVN(d) : st.orderDate;
    st.saving = true;
    st.error = '';
    renderConfirm();
    try {
      const result = await onSave({ items: cartItems(st.cart), paid: paidNow(), note: st.note, orderDate: st.orderDate ?? new Date().toISOString() });
      st.saving = false;
      if (mode === 'edit') return onDone?.(result);
      st.result = result;
      st.step = 'done';
      render();
      window.scrollTo({ top: 0 });
    } catch (err) {
      st.saving = false;
      st.error = err.message;
      renderConfirm();
    }
  }

  function go(step) {
    st.step = step;
    render();
    (fixedBar ? window : container.closest('.overflow-y-auto') ?? window).scrollTo?.({ top: 0 });
  }

  // ---------- Một bộ bắt sự kiện cho cả màn hình (gán onclick để không bị gắn trùng) ----------
  container.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.tile) {
      addOne(st.cart, d.tile, priceOf(d.tile));
      buzz();
      return refreshPick();
    }
    if (d.plus) { addOne(st.cart, d.plus, priceOf(d.plus)); buzz(); return refreshPick(); }
    if (d.minus) { removeOne(st.cart, d.minus); buzz(); return refreshPick(); }
    if (d.qty) {
      const row = rows.find((r) => r.product_id === d.qty);
      const q = await openKeypad({ title: `Số lượng ${row.name}`, sub: `Tính theo ${row.unit}. Bấm 0 rồi Xong để bỏ khỏi đơn.`, mode: 'qty', value: st.cart.get(d.qty)?.qty });
      if (q !== null) { setQty(st.cart, d.qty, q, row.price); refreshPick(); }
      return;
    }
    if (d.price) {
      const row = rows.find((r) => r.product_id === d.price);
      const p = await openKeypad({ title: `Giá ${row.name} cho đơn này`, sub: `Giá thường: ${formatVND(row.price)} mỗi ${row.unit}`, mode: 'money', value: st.cart.get(d.price)?.price });
      if (p !== null) { setPrice(st.cart, d.price, p); refreshPick(); }
      return;
    }
    if (d.pay) {
      st.pay = d.pay;
      if (d.pay === 'partial') { if (!(st.paid > 0 && st.paid < total())) st.paidText = ''; return go('partial'); }
      return go('confirm');
    }
    if (d.pkey) { st.paidText = keypadPress(st.paidText, d.pkey, 'money'); buzz(); return refreshPartial(); }
    if (d.amount) { st.paidText = d.amount; buzz(); return refreshPartial(); }
    switch (d.act) {
      case 'to-pay':
        if (!cartCount(st.cart)) return;
        return go('pay');
      case 'clear':
        if (await confirmDialog({ title: 'Xoá hết hàng đã chọn?', message: 'Bỏ toàn bộ hàng trong đơn đang lên.', confirmLabel: 'Xoá hết' })) {
          st.cart.clear();
          refreshPick();
        }
        return;
      case 'back-pick': return go('pick');
      case 'back-pay': return go('pay');
      case 'partial-ok':
        st.paid = keypadValue(st.paidText);
        return go('confirm');
      case 'save': return save();
      case 'new':
        st.cart.clear(); st.pay = null; st.paid = 0; st.paidText = ''; st.note = ''; st.orderDate = null; st.result = null;
        return go('pick');
      case 'view': return onViewOrder?.(st.result.id);
      case 'change-customer': return onChangeCustomer?.();
      default:
    }
  };

  render();
  return { lineTotal };
}
