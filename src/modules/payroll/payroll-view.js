// Trang Bảng lương: lương theo công + thưởng − phạt = thực lĩnh; thêm thưởng/phạt; chốt / mở chốt; xuất CSV.
import { formatDateStr, todayVN } from '../../lib/dates.js';
import { $, html, setHtml } from '../../lib/dom.js';
import { downloadText } from '../../lib/download.js';
import { formatDateTime, formatVND } from '../../lib/format.js';
import { bindMoneyInputs, confirmDialog, emptyState, errorState, icon, loadingState, moneyValue, openModal, promptReason, showFieldErrors, toast } from '../../lib/ui.js';
import { closePayroll, createAdjustment, deleteAdjustment, listAdjustments, listEmployees, payrollPreview, reopenPayroll } from './api.js';
import { monthLabel, monthRange, SALARY_TYPES, toCSV } from './logic.js';
import { currentMonth, mountMonthPicker } from './month-picker.js';

const unitsText = (u) => String(Number(u)).replace('.', ',');

export function renderPayroll(root) {
  const state = { ym: currentMonth(), rows: [], adjustments: [], closed: false };
  setHtml(
    root,
    html`<section class="space-y-4">
      <div data-picker></div>
      <div data-body>${loadingState(3)}</div>
    </section>`,
  );
  const section = $('section', root);
  const body = $('[data-body]', section);

  async function load() {
    setHtml(body, loadingState(3));
    const { from, to } = monthRange(state.ym);
    try {
      [state.rows, state.adjustments] = await Promise.all([payrollPreview(state.ym), listAdjustments(from, to)]);
      state.closed = state.rows.some((r) => r.closed);
      draw();
    } catch (err) {
      setHtml(body, errorState(err.message, load));
    }
  }

  function draw() {
    const rows = state.rows;
    const total = rows.reduce((s, r) => s + Number(r.net_pay), 0);
    const closedAt = rows.find((r) => r.closed_at)?.closed_at;
    setHtml(
      body,
      html`<div class="space-y-5">
        <div class="card flex flex-wrap items-center gap-3 ${state.closed ? 'border-emerald-400/30' : ''}">
          <div class="min-w-0 flex-1">
            <p class="text-sm ${state.closed ? 'text-emerald-300' : 'text-amber-300'}">
              ${state.closed ? `Đã chốt lúc ${formatDateTime(closedAt)}` : 'Chưa chốt – số liệu tạm tính, còn thay đổi theo chấm công'}</p>
            <p class="text-sm text-slate-400">Tổng thực lĩnh</p>
            <p class="gradient-text text-2xl font-bold tabular-nums">${formatVND(total)}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            ${rows.length ? html`<button class="btn-secondary" data-export>Xuất CSV</button>` : ''}
            ${state.closed
              ? html`<button class="btn-secondary" data-reopen>Mở chốt</button>`
              : rows.length ? html`<button class="btn-primary" data-close>Chốt bảng lương</button>` : ''}
          </div>
        </div>

        ${!rows.length
          ? emptyState('Chưa có nhân viên nào trong tháng này')
          : html`<ul class="space-y-2 md:hidden">
              ${rows.map((r) => html`<li class="card p-3">
                <div class="flex items-baseline justify-between gap-2">
                  <p class="truncate font-semibold text-white">${r.employee_name}</p>
                  <p class="font-bold text-cyan-300 tabular-nums">${formatVND(r.net_pay)}</p>
                </div>
                <p class="mt-1 text-xs text-slate-500">${SALARY_TYPES[r.salary_type].label} ${formatVND(r.salary_amount)} · ${unitsText(r.work_units)} công${r.salary_type === 'monthly' ? ` / ${r.days_in_month} ngày` : ''}</p>
                <div class="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div><p class="text-slate-500">Theo công</p><p class="tabular-nums">${formatVND(r.base_pay)}</p></div>
                  <div><p class="text-slate-500">Thưởng</p><p class="text-emerald-300 tabular-nums">+${formatVND(r.bonus)}</p></div>
                  <div><p class="text-slate-500">Phạt</p><p class="text-rose-300 tabular-nums">−${formatVND(r.penalty)}</p></div>
                </div>
              </li>`)}
            </ul>
            <div class="table-wrap hidden md:block">
              <table class="table">
                <thead><tr><th>Nhân viên</th><th>Mức lương</th><th class="text-right">Công</th><th class="text-right">Lương theo công</th><th class="text-right">Thưởng</th><th class="text-right">Phạt</th><th class="text-right">Thực lĩnh</th></tr></thead>
                <tbody>
                  ${rows.map((r) => html`<tr>
                    <td class="font-medium text-white">${r.employee_name}<span class="block text-xs text-slate-500">${r.position}</span></td>
                    <td class="text-slate-400">${formatVND(r.salary_amount)} ${SALARY_TYPES[r.salary_type].unit}</td>
                    <td class="text-right tabular-nums">${unitsText(r.work_units)}${r.salary_type === 'monthly' ? html`<span class="text-slate-500">/${r.days_in_month}</span>` : ''}</td>
                    <td class="text-right tabular-nums">${formatVND(r.base_pay)}</td>
                    <td class="text-right text-emerald-300 tabular-nums">${formatVND(r.bonus)}</td>
                    <td class="text-right text-rose-300 tabular-nums">${formatVND(r.penalty)}</td>
                    <td class="text-right font-bold text-cyan-300 tabular-nums">${formatVND(r.net_pay)}</td>
                  </tr>`)}
                </tbody>
              </table>
            </div>`}

        <div class="space-y-3">
          <div class="flex items-center justify-between gap-3">
            <h3 class="font-semibold text-white">Thưởng / phạt trong tháng</h3>
            ${state.closed ? '' : html`<button class="btn-secondary" data-add-adj>${icon('plus', 'size-4')} Thêm</button>`}
          </div>
          ${!state.adjustments.length
            ? html`<p class="text-sm text-slate-500">Chưa có khoản thưởng/phạt nào.</p>`
            : html`<ul class="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-ink-900/70">
                ${state.adjustments.map((a) => html`<li class="flex items-center gap-3 px-4 py-3">
                  <div class="min-w-0 flex-1">
                    <p class="font-medium text-white">${a.employees?.name ?? ''}</p>
                    <p class="text-xs text-slate-500">${formatDateStr(a.adj_date)} · ${a.reason}</p>
                  </div>
                  <p class="font-semibold tabular-nums ${a.kind === 'bonus' ? 'text-emerald-300' : 'text-rose-300'}">${a.kind === 'bonus' ? '+' : '−'}${formatVND(a.amount)}</p>
                  ${state.closed ? '' : html`<button class="btn-icon hover:text-rose-400" data-del-adj="${a.id}" aria-label="Xoá khoản này">${icon('trash', 'size-4')}</button>`}
                </li>`)}
              </ul>`}
        </div>
      </div>`,
    );
  }

  async function openAdjustment() {
    let emps;
    try {
      emps = await listEmployees();
    } catch (err) {
      return toast(err.message, 'error');
    }
    const active = emps.filter((e) => e.is_active);
    if (!active.length) return toast('Chưa có nhân viên đang làm', 'error');
    const { from, to } = monthRange(state.ym);
    const today = todayVN();
    const defDate = today >= from && today <= to ? today : to;
    const { el } = openModal({
      title: `Thêm thưởng / phạt – ${monthLabel(state.ym)}`,
      submitLabel: 'Lưu',
      body: html`<div class="space-y-4">
        <div>
          <label class="field-label" for="adj-emp">Nhân viên *</label>
          <select class="input" id="adj-emp" name="employee_id">${active.map((e) => html`<option value="${e.id}">${e.name}</option>`)}</select>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <label class="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 has-[:checked]:border-emerald-400/50 has-[:checked]:bg-emerald-500/10">
            <input type="radio" name="kind" value="bonus" class="accent-emerald-400" checked /> Thưởng</label>
          <label class="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 has-[:checked]:border-rose-400/50 has-[:checked]:bg-rose-500/10">
            <input type="radio" name="kind" value="penalty" class="accent-rose-400" /> Phạt</label>
        </div>
        <div>
          <label class="field-label" for="adj-amount">Số tiền (₫) *</label>
          <input class="input text-right text-lg font-semibold tabular-nums" id="adj-amount" name="amount" data-money inputmode="numeric" />
          <p class="field-error hidden" data-error-for="amount"></p>
        </div>
        <div>
          <label class="field-label" for="adj-date">Ngày *</label>
          <input class="input" id="adj-date" name="adj_date" type="date" value="${defDate}" min="${from}" max="${to}" />
          <p class="field-error hidden" data-error-for="adj_date"></p>
        </div>
        <div>
          <label class="field-label" for="adj-reason">Lý do *</label>
          <input class="input" id="adj-reason" name="reason" maxlength="300" placeholder="VD: đi trễ, làm thêm ca…" />
          <p class="field-error hidden" data-error-for="reason"></p>
        </div>
      </div>`,
      onSubmit: async (form) => {
        const f = form.elements;
        const amount = moneyValue(f.amount);
        const errors = {};
        if (!amount || amount <= 0) errors.amount = 'Nhập số tiền lớn hơn 0';
        if (!f.adj_date.value || f.adj_date.value < from || f.adj_date.value > to) errors.adj_date = `Chọn ngày trong ${monthLabel(state.ym).toLowerCase()}`;
        if (!f.reason.value.trim()) errors.reason = 'Vui lòng ghi lý do';
        showFieldErrors(form, errors);
        if (Object.keys(errors).length) return false;
        await createAdjustment({ employee_id: f.employee_id.value, kind: f.kind.value, amount, adj_date: f.adj_date.value, reason: f.reason.value.trim() });
        toast(f.kind.value === 'bonus' ? 'Đã thêm thưởng' : 'Đã thêm phạt');
        load();
      },
    });
    bindMoneyInputs(el);
  }

  function exportCSV() {
    const csv = toCSV(state.rows, [
      { key: 'employee_name', label: 'Nhân viên' },
      { key: 'position', label: 'Chức vụ' },
      { label: 'Cách trả lương', value: (r) => SALARY_TYPES[r.salary_type].label },
      { key: 'salary_amount', label: 'Mức lương' },
      { label: 'Số ngày của tháng', value: (r) => (r.salary_type === 'monthly' ? r.days_in_month : '') },
      { label: 'Số công', value: (r) => unitsText(r.work_units) },
      { key: 'base_pay', label: 'Lương theo công' },
      { key: 'bonus', label: 'Thưởng' },
      { key: 'penalty', label: 'Phạt' },
      { key: 'net_pay', label: 'Thực lĩnh' },
    ]);
    downloadText(`bang-luong-${state.ym}${state.closed ? '' : '-tam-tinh'}.csv`, csv);
  }

  section.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    try {
      if (b.matches('[data-export]')) exportCSV();
      else if (b.matches('[data-add-adj]')) openAdjustment();
      else if (b.dataset.delAdj) {
        if (!(await confirmDialog({ title: 'Xoá khoản thưởng/phạt', message: 'Xoá khoản này?', confirmLabel: 'Xoá' }))) return;
        await deleteAdjustment(b.dataset.delAdj);
        toast('Đã xoá');
        load();
      } else if (b.matches('[data-close]')) {
        const total = state.rows.reduce((s, r) => s + Number(r.net_pay), 0);
        if (!(await confirmDialog({ title: `Chốt lương ${monthLabel(state.ym).toLowerCase()}`,
          message: `Chốt ${state.rows.length} người, tổng thực lĩnh ${formatVND(total)}. Sau khi chốt, chấm công và thưởng/phạt tháng này bị khoá (mở chốt được nếu cần sửa).`,
          confirmLabel: 'Chốt bảng lương', danger: false }))) return;
        await closePayroll(state.ym);
        toast('Đã chốt bảng lương');
        load();
      } else if (b.matches('[data-reopen]')) {
        const reason = await promptReason({ title: 'Mở chốt bảng lương', message: 'Bảng đã chốt sẽ bị gỡ để sửa chấm công/thưởng/phạt, sau đó chốt lại. Bản cũ vẫn được lưu trong nhật ký.', confirmLabel: 'Mở chốt' });
        if (reason === null) return;
        await reopenPayroll(state.ym, reason);
        toast('Đã mở chốt');
        load();
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  mountMonthPicker($('[data-picker]', section), { value: state.ym, onChange: (ym) => { state.ym = ym; load(); } });
  load();
}

