// Bảng giá theo khách: dùng chung cho popup "Cấu hình giá lần đầu" và thẻ "Cấu hình sản phẩm & giá bán".
import { $$, html } from '../../lib/dom.js';
import { formatVND, groupThousands, parseMoney } from '../../lib/format.js';
import { bindMoneyInputs } from '../../lib/ui.js';

export function priceTable(rows, { editable }) {
  if (!rows.length) {
    return html`<p class="rounded-xl border border-fg/10 bg-fg/[0.03] p-4 text-sm text-muted">Chưa có sản phẩm nào trong kho. Hãy thêm sản phẩm trước.</p>`;
  }
  return html`<ul class="divide-y divide-fg/5 overflow-hidden rounded-2xl border border-fg/10 bg-surface/70">
    ${rows.map(
      (r) => html`<li class="flex items-center gap-3 px-4 py-3 ${r.is_active ? '' : 'opacity-60'}" data-row="${r.product_id}">
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium text-fg">
            ${r.name} ${r.is_active ? '' : html`<span class="badge-gray ml-1">Ngừng bán</span>`}
          </p>
          <p class="text-xs text-subtle">
            Giá chung: ${formatVND(r.default_price)} / ${r.unit}
            <span class="ml-1 text-accent-ink ${r.price !== r.default_price ? '' : 'hidden'}" data-own-badge>· giá riêng</span>
          </p>
          <p class="field-error hidden" data-price-error="${r.product_id}"></p>
        </div>
        ${editable
          ? html`<div class="w-36 shrink-0 sm:w-44">
              <label class="sr-only" for="price-${r.product_id}">Giá cho ${r.name}</label>
              <input class="input text-right font-semibold tabular-nums" id="price-${r.product_id}" inputmode="numeric" data-money
                data-price-for="${r.product_id}" data-original="${r.price}" data-default="${r.default_price}" value="${groupThousands(r.price)}" />
            </div>`
          : html`<p class="shrink-0 text-right font-semibold text-accent-ink tabular-nums">${formatVND(r.price)}</p>`}
      </li>`,
    )}
  </ul>`;
}

/** Gắn hành vi cho ô giá; onChange(soDongDaSua) được gọi mỗi khi gõ. */
export function bindPriceTable(container, onChange) {
  bindMoneyInputs(container);
  const inputs = $$('[data-price-for]', container);
  const update = () => {
    let changed = 0;
    for (const input of inputs) {
      const v = parseMoney(input.value);
      const isChanged = v !== Number(input.dataset.original);
      if (isChanged) changed += 1;
      input.classList.toggle('border-accent/60', isChanged);
      const own = input.closest('[data-row]').querySelector('[data-own-badge]');
      own?.classList.toggle('hidden', v === null || v === Number(input.dataset.default));
    }
    onChange?.(changed);
  };
  inputs.forEach((i) => i.addEventListener('input', update));
  return { refresh: update };
}

export function readPriceEdits(container) {
  return Object.fromEntries($$('[data-price-for]', container).map((i) => [i.dataset.priceFor, i.value]));
}

export function showPriceErrors(container, errors) {
  for (const el of $$('[data-price-error]', container)) {
    const msg = errors[el.dataset.priceError];
    el.textContent = msg ?? '';
    el.classList.toggle('hidden', !msg);
    container.querySelector(`[data-price-for="${el.dataset.priceError}"]`)?.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  const first = Object.keys(errors)[0];
  if (first) container.querySelector(`[data-price-for="${first}"]`)?.focus();
}
