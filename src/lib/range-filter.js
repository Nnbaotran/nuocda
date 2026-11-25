// Bộ lọc khoảng ngày dùng chung: các nút nhanh (Hôm nay, Tháng này…) + "Tuỳ chọn" từ ngày – đến ngày.
import { isDateStr, PRESETS, presetRange, todayVN } from './dates.js';
import { $, $$, html, setHtml } from './dom.js';

export function mountRangeFilter(container, { initial = 'month', onChange }) {
  const today = todayVN();
  let current = { preset: initial, ...presetRange(initial, today) };

  setHtml(
    container,
    html`<div class="space-y-2">
      <div class="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Khoảng ngày">
        ${[...PRESETS, { id: 'custom', label: 'Tuỳ chọn' }].map(
          (p) => html`<button type="button" class="min-h-10 shrink-0 rounded-full border px-3.5 text-sm font-medium transition"
            data-preset="${p.id}">${p.label}</button>`,
        )}
      </div>
      <div class="hidden grid-cols-2 gap-2" data-custom>
        <label class="text-xs text-muted">Từ ngày
          <input type="date" class="input mt-1" data-from max="${today}" />
        </label>
        <label class="text-xs text-muted">Đến ngày
          <input type="date" class="input mt-1" data-to max="${today}" />
        </label>
        <p class="field-error col-span-2 hidden" data-range-error></p>
      </div>
    </div>`,
  );

  const custom = $('[data-custom]', container);
  const fromEl = $('[data-from]', custom);
  const toEl = $('[data-to]', custom);
  const errEl = $('[data-range-error]', custom);

  function paint() {
    for (const b of $$('[data-preset]', container)) {
      const on = b.dataset.preset === current.preset;
      b.className = `min-h-10 shrink-0 rounded-full border px-3.5 text-sm font-medium transition ${
        on ? 'border-accent/50 bg-accent/15 text-fg' : 'border-fg/10 bg-fg/[0.03] text-muted hover:text-fg'
      }`;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    custom.classList.toggle('hidden', current.preset !== 'custom');
    custom.classList.toggle('grid', current.preset === 'custom');
  }

  function emit() {
    paint();
    onChange?.({ ...current });
  }

  container.addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]');
    if (!b) return;
    const id = b.dataset.preset;
    if (id === 'custom') {
      current = { preset: 'custom', from: current.from ?? today, to: current.to ?? today };
      fromEl.value = current.from;
      toEl.value = current.to;
    } else {
      current = { preset: id, ...presetRange(id, today) };
    }
    emit();
  });

  const onDates = () => {
    const from = fromEl.value;
    const to = toEl.value;
    let msg = '';
    if (!isDateStr(from) || !isDateStr(to)) msg = 'Chọn đủ từ ngày và đến ngày';
    else if (from > to) msg = 'Từ ngày phải trước đến ngày';
    errEl.textContent = msg;
    errEl.classList.toggle('hidden', !msg);
    if (msg) return;
    current = { preset: 'custom', from, to };
    emit();
  };
  fromEl.addEventListener('change', onDates);
  toEl.addEventListener('change', onDates);

  paint();
  return { get: () => ({ ...current }) };
}
