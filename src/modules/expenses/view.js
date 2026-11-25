// Trang Chi phí: lọc theo ngày/khoảng ngày/danh mục; thêm, sửa, xoá.
import { formatDateStr, todayVN } from '../../lib/dates.js';
import { $, html, setHtml } from '../../lib/dom.js';
import { formatVND, groupThousands } from '../../lib/format.js';
import { mountRangeFilter } from '../../lib/range-filter.js';
import { bindMoneyInputs, confirmDialog, emptyState, errorState, icon, loadingState, openModal, showFieldErrors, toast } from '../../lib/ui.js';
import { EXPENSE_CATEGORIES, sumByCategory, validateExpense } from '../reports/logic.js';
import { createExpense, deleteExpense, listExpenses, updateExpense } from './api.js';

export function renderExpenses(root) {
  const state = { range: null, category: '', items: [] };
  setHtml(
    root,
    html`<section class="space-y-4">
      <div class="flex flex-wrap items-center gap-3">
        <select class="input w-auto flex-1" data-category aria-label="Lọc danh mục">
          <option value="">Tất cả danh mục</option>
          ${Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => html`<option value="${k}">${v}</option>`)}
        </select>
        <button class="btn-primary" data-add>${icon('plus', 'size-4')} Thêm chi phí</button>
      </div>
      <div data-range></div>
      <div data-list>${loadingState()}</div>
    </section>`,
  );
  const section = $('section', root);
  const listEl = $('[data-list]', section);

  async function load() {
    setHtml(listEl, loadingState());
    try {
      state.items = await listExpenses({ from: state.range.from, to: state.range.to, category: state.category });
      draw();
    } catch (err) {
      setHtml(listEl, errorState(err.message, load));
    }
  }

  function draw() {
    const items = state.items;
    if (!items.length) return setHtml(listEl, emptyState('Chưa có chi phí trong khoảng này', html`<button class="btn-primary" data-add>${icon('plus', 'size-4')} Thêm chi phí</button>`));
    const total = items.reduce((s, e) => s + Number(e.amount), 0);
    const byCat = sumByCategory(items);
    setHtml(
      listEl,
      html`<div class="space-y-4">
        <div class="card">
          <p class="text-sm text-slate-400">Tổng chi phí (${items.length} khoản)</p>
          <p class="text-2xl font-bold text-white tabular-nums">${formatVND(total)}</p>
          ${byCat.length > 1
            ? html`<ul class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                ${byCat.map((c) => html`<li class="flex justify-between gap-2"><span class="text-slate-400">${c.label}</span><span class="tabular-nums">${formatVND(c.amount)}</span></li>`)}
              </ul>`
            : ''}
        </div>
        <ul class="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-ink-900/70">
          ${items.map((e) => html`<li class="flex items-center gap-3 px-4 py-3">
            <div class="min-w-0 flex-1">
              <p class="font-medium text-white">${EXPENSE_CATEGORIES[e.category]}</p>
              <p class="truncate text-xs text-slate-500">${formatDateStr(e.expense_date)}${e.note ? ` · ${e.note}` : ''}</p>
            </div>
            <p class="font-semibold text-white tabular-nums">${formatVND(e.amount)}</p>
            <button class="btn-icon" data-edit="${e.id}" aria-label="Sửa khoản chi">${icon('edit', 'size-4')}</button>
            <button class="btn-icon hover:text-rose-400" data-delete="${e.id}" aria-label="Xoá khoản chi">${icon('trash', 'size-4')}</button>
          </li>`)}
        </ul>
      </div>`,
    );
  }

  function openForm(exp) {
    const editing = Boolean(exp);
    const today = todayVN();
    const e = exp ?? { expense_date: today, category: 'electricity', amount: '', note: '' };
    const { el } = openModal({
      title: editing ? 'Sửa chi phí' : 'Thêm chi phí',
      submitLabel: editing ? 'Lưu thay đổi' : 'Thêm',
      body: html`<div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="field-label" for="xf-date">Ngày *</label>
            <input class="input" id="xf-date" name="expense_date" type="date" value="${e.expense_date}" max="${today}" />
            <p class="field-error hidden" data-error-for="expense_date"></p>
          </div>
          <div>
            <label class="field-label" for="xf-cat">Danh mục *</label>
            <select class="input" id="xf-cat" name="category">
              ${Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => html`<option value="${k}" ${k === e.category ? 'selected' : ''}>${v}</option>`)}
            </select>
            <p class="field-error hidden" data-error-for="category"></p>
          </div>
        </div>
        <div>
          <label class="field-label" for="xf-amount">Số tiền (₫) *</label>
          <input class="input text-right text-lg font-semibold tabular-nums" id="xf-amount" name="amount" data-money inputmode="numeric" value="${e.amount === '' ? '' : groupThousands(e.amount)}" />
          <p class="field-error hidden" data-error-for="amount"></p>
        </div>
        <div>
          <label class="field-label" for="xf-note">Ghi chú</label>
          <input class="input" id="xf-note" name="note" maxlength="300" value="${e.note}" placeholder="VD: tiền điện tháng 11" />
          <p class="field-error hidden" data-error-for="note"></p>
        </div>
      </div>`,
      onSubmit: async (form) => {
        const f = form.elements;
        const { ok, value, errors } = validateExpense({ expense_date: f.expense_date.value, category: f.category.value, amount: f.amount.value, note: f.note.value }, today);
        showFieldErrors(form, errors);
        if (!ok) return false;
        if (editing) await updateExpense(e.id, value);
        else await createExpense(value);
        toast(editing ? 'Đã lưu chi phí' : 'Đã thêm chi phí');
        load();
      },
    });
    bindMoneyInputs(el);
  }

  section.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.matches('[data-add]')) return openForm(null);
    if (b.dataset.edit) return openForm(state.items.find((x) => x.id === b.dataset.edit));
    if (b.dataset.delete) {
      const e = state.items.find((x) => x.id === b.dataset.delete);
      if (!(await confirmDialog({ title: 'Xoá chi phí', message: `Xoá khoản ${EXPENSE_CATEGORIES[e.category]} ${formatVND(e.amount)} ngày ${formatDateStr(e.expense_date)}?`, confirmLabel: 'Xoá' }))) return;
      try {
        await deleteExpense(e.id);
        toast('Đã xoá chi phí');
        load();
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  });
  $('[data-category]', section).addEventListener('change', (ev) => {
    state.category = ev.target.value;
    load();
  });
  const filter = mountRangeFilter($('[data-range]', section), { initial: 'month', onChange: (r) => { state.range = r; load(); } });
  state.range = filter.get();
  load();
}
