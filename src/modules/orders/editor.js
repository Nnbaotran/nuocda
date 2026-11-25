// Khung lên đơn / sửa đơn (dùng chung). Tự tính thành tiền, tổng, còn nợ ngay khi gõ.
import { fromLocalInputVN, toLocalInputVN } from '../../lib/dates.js';
import { $, $$, html, setHtml } from '../../lib/dom.js';
import { formatVND, groupThousands } from '../../lib/format.js';
import { bindMoneyInputs, icon } from '../../lib/ui.js';
import { buildOrderItems, lineTotal, PAY_MODES, parseQuantity, resolvePaid } from './logic.js';

/**
 * rows: [{ product_id, name, unit, is_active, price }]  (price = đơn giá gợi ý)
 * initial: { qty: {id: số}, prices: {id: giá}, mode, paid, note, orderDate }
 * onSubmit({ items, paid, note, orderDate }) -> Promise; trả về 'reset' để xoá form sau khi lưu.
 */
export function mountOrderEditor(container, { rows, initial = {}, submitLabel = 'Lưu đơn', onSubmit }) {
  const qty = initial.qty ?? {};
  const prices = initial.prices ?? {};
  const mode = initial.mode ?? 'full';

  setHtml(
    container,
    html`<form class="space-y-4" novalidate>
      ${rows.length === 0
        ? html`<p class="card text-sm text-slate-400">Chưa có sản phẩm đang bán.</p>`
        : html`<ul class="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-ink-900/70">
            ${rows.map((r) => {
              const p = prices[r.product_id] ?? r.price;
              const q = qty[r.product_id] ?? '';
              return html`<li class="px-4 py-3" data-line="${r.product_id}">
                <div class="flex items-baseline justify-between gap-3">
                  <p class="min-w-0 truncate font-medium text-white">${r.name} <span class="text-xs font-normal text-slate-500">/ ${r.unit}</span>
                    ${r.is_active ? '' : html`<span class="badge-gray ml-1">Ngừng bán</span>`}</p>
                  <p class="shrink-0 font-semibold text-cyan-300 tabular-nums" data-line-total></p>
                </div>
                <div class="mt-2 flex items-center gap-2">
                  <label class="sr-only" for="price-${r.product_id}">Đơn giá ${r.name}</label>
                  <input class="input min-h-10 w-28 text-right text-sm tabular-nums sm:w-32" id="price-${r.product_id}" data-money inputmode="numeric"
                    data-price value="${groupThousands(p)}" title="Đơn giá (₫)" />
                  <span class="text-xs text-slate-500">₫ ×</span>
                  <div class="ml-auto flex items-center gap-1">
                    <button type="button" class="btn-icon size-10 border border-white/10" data-step="-1" aria-label="Bớt 1 ${r.name}">−</button>
                    <label class="sr-only" for="qty-${r.product_id}">Số lượng ${r.name}</label>
                    <input class="input min-h-10 w-16 text-center font-semibold tabular-nums" id="qty-${r.product_id}" data-qty inputmode="decimal" placeholder="0" value="${q}" />
                    <button type="button" class="btn-icon size-10 border border-white/10" data-step="1" aria-label="Thêm 1 ${r.name}">${icon('plus', 'size-4')}</button>
                  </div>
                </div>
                <p class="field-error hidden" data-line-error></p>
              </li>`;
            })}
          </ul>`}

      <div class="card space-y-4">
        <div class="flex items-baseline justify-between">
          <span class="text-slate-400">Tổng tiền</span>
          <span class="gradient-text text-2xl font-bold tabular-nums" data-total>0 ₫</span>
        </div>
        <div class="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1" role="radiogroup" aria-label="Cách thanh toán">
          ${PAY_MODES.map((m) => html`<label class="cursor-pointer">
            <input type="radio" name="mode" value="${m.id}" class="peer sr-only" ${m.id === mode ? 'checked' : ''} />
            <span class="flex min-h-11 items-center justify-center rounded-lg px-1 text-center text-sm font-medium text-slate-400 transition peer-checked:bg-gradient-to-r peer-checked:from-sky-500/30 peer-checked:to-violet-500/25 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-400">${m.label}</span>
          </label>`)}
        </div>
        <div class="${mode === 'partial' ? '' : 'hidden'}" data-partial>
          <label class="field-label" for="paid-now">Khách trả ngay (₫)</label>
          <input class="input text-right text-lg font-semibold tabular-nums" id="paid-now" name="partial" data-money inputmode="numeric"
            value="${mode === 'partial' ? groupThousands(initial.paid ?? 0) : ''}" />
        </div>
        <div class="flex items-baseline justify-between text-sm">
          <span class="text-slate-400">Ghi nợ vào công nợ khách</span>
          <span class="font-semibold text-amber-300 tabular-nums" data-debt>0 ₫</span>
        </div>
        <details class="group" ${initial.note || initial.orderDate ? 'open' : ''}>
          <summary class="cursor-pointer list-none text-sm text-cyan-300 select-none">＋ Ghi chú, ngày giờ đơn</summary>
          <div class="mt-3 space-y-3">
            <div>
              <label class="field-label" for="order-note">Ghi chú</label>
              <input class="input" id="order-note" name="note" maxlength="500" value="${initial.note ?? ''}" />
            </div>
            <div>
              <label class="field-label" for="order-date">Ngày giờ đơn</label>
              <input class="input" id="order-date" name="orderDate" type="datetime-local" value="${toLocalInputVN(initial.orderDate ?? new Date())}" max="${toLocalInputVN(new Date())}" />
            </div>
          </div>
        </details>
        <p class="form-error hidden" data-editor-error></p>
        <button type="submit" class="btn-primary w-full text-base">${submitLabel}</button>
      </div>
    </form>`,
  );

  const form = $('form', container);
  const errBox = $('[data-editor-error]', form);
  bindMoneyInputs(form);

  function collect() {
    return buildOrderItems(
      $$('[data-line]', form).map((li) => ({
        product_id: li.dataset.line,
        qtyText: $('[data-qty]', li).value,
        priceText: $('[data-price]', li).value,
      })),
    );
  }

  function currentMode() {
    return form.elements.mode.value;
  }

  function refresh() {
    for (const li of $$('[data-line]', form)) {
      const q = parseQuantity($('[data-qty]', li).value);
      const price = Number($('[data-price]', li).value.replace(/\D/g, '')) || 0;
      const err = $('[data-line-error]', li);
      err.classList.toggle('hidden', !q.error);
      err.textContent = q.error ?? '';
      $('[data-line-total]', li).textContent = q.value ? formatVND(lineTotal(q.value, price)) : '';
      li.classList.toggle('bg-cyan-500/[0.06]', Boolean(q.value));
    }
    const { total } = collect();
    $('[data-total]', form).textContent = formatVND(total);
    const m = currentMode();
    $('[data-partial]', form).classList.toggle('hidden', m !== 'partial');
    const r = resolvePaid(m, total, form.elements.partial.value);
    $('[data-debt]', form).textContent = formatVND(r.error ? (m === 'partial' ? total : 0) : total - r.paid);
  }

  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]');
    if (!b) return;
    const input = $('[data-qty]', b.closest('[data-line]'));
    const cur = parseQuantity(input.value).value ?? 0;
    const next = Math.max(0, Math.round((cur + Number(b.dataset.step)) * 100) / 100);
    input.value = next ? String(next).replace('.', ',') : '';
    refresh();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.classList.add('hidden');
    const built = collect();
    const showErr = (msg) => {
      errBox.textContent = msg;
      errBox.classList.remove('hidden');
    };
    if (built.empty && !Object.keys(built.errors).length) return showErr('Nhập số lượng cho ít nhất 1 sản phẩm');
    if (!built.ok) return showErr('Có dòng chưa đúng, xem chữ đỏ ở trên');
    const pay = resolvePaid(currentMode(), built.total, form.elements.partial.value);
    if (pay.error) return showErr(pay.error);
    const orderDate = fromLocalInputVN(form.elements.orderDate.value);
    if (!orderDate) return showErr('Ngày giờ đơn không hợp lệ');

    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Đang lưu…';
    try {
      const result = await onSubmit({ items: built.items, paid: pay.paid, note: form.elements.note.value.trim(), orderDate });
      if (result === 'reset') {
        $$('[data-qty]', form).forEach((i) => (i.value = ''));
        form.elements.partial.value = '';
        form.elements.note.value = '';
        form.elements.orderDate.value = toLocalInputVN(new Date());
        refresh();
      }
    } catch (err) {
      showErr(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });

  refresh();
  return { refresh };
}
