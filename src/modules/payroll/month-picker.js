// Chọn tháng: ‹ Tháng 11/2026 › (không cho đi quá tháng hiện tại).
import { todayVN } from '../../lib/dates.js';
import { $, html, setHtml } from '../../lib/dom.js';
import { monthLabel, shiftMonth } from './logic.js';

export function currentMonth() {
  return todayVN().slice(0, 7);
}

export function mountMonthPicker(container, { value = currentMonth(), onChange }) {
  let ym = value;
  const max = currentMonth();
  function paint() {
    setHtml(
      container,
      html`<div class="flex items-center gap-2">
        <button type="button" class="btn-icon border border-white/10" data-prev aria-label="Tháng trước">‹</button>
        <p class="min-w-36 flex-1 text-center text-lg font-semibold text-white">${monthLabel(ym)}</p>
        <button type="button" class="btn-icon border border-white/10 disabled:opacity-30" data-next aria-label="Tháng sau" ${ym >= max ? 'disabled' : ''}>›</button>
      </div>`,
    );
    $('[data-prev]', container).addEventListener('click', () => go(-1));
    $('[data-next]', container).addEventListener('click', () => go(1));
  }
  function go(n) {
    const next = shiftMonth(ym, n);
    if (next > max) return;
    ym = next;
    paint();
    onChange?.(ym);
  }
  paint();
  return { get: () => ym };
}
