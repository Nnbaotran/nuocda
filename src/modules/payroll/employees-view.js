// Trang Nhân viên: danh sách để chấm công & tính lương (nhân viên KHÔNG có tài khoản đăng nhập).
import { $, html, setHtml } from '../../lib/dom.js';
import { formatVND, groupThousands, parseMoney } from '../../lib/format.js';
import { bindMoneyInputs, confirmDialog, emptyState, errorState, icon, loadingState, openModal, showFieldErrors, toast } from '../../lib/ui.js';
import { createEmployee, deleteEmployee, listEmployees, updateEmployee } from './api.js';
import { SALARY_TYPES, validateEmployee } from './logic.js';

export function renderEmployees(root) {
  const state = { items: [], showInactive: false };
  setHtml(
    root,
    html`<section class="space-y-4">
      <div class="flex flex-wrap items-center gap-3">
        <label class="flex min-h-11 flex-1 items-center gap-2 text-sm text-muted">
          <input type="checkbox" class="size-5 accent-accent" data-inactive /> Hiện cả người đã nghỉ việc
        </label>
        <button class="btn-primary" data-add>${icon('plus', 'size-4')} Thêm nhân viên</button>
      </div>
      <div data-list>${loadingState()}</div>
    </section>`,
  );
  const section = $('section', root);
  const listEl = $('[data-list]', section);

  async function load() {
    setHtml(listEl, loadingState());
    try {
      state.items = await listEmployees();
      draw();
    } catch (err) {
      setHtml(listEl, errorState(err.message, load));
    }
  }

  function draw() {
    const rows = state.items.filter((e) => state.showInactive || e.is_active);
    if (!state.items.length) {
      return setHtml(listEl, emptyState('Chưa có nhân viên nào', html`<button class="btn-primary" data-add>${icon('plus', 'size-4')} Thêm nhân viên đầu tiên</button>`));
    }
    if (!rows.length) return setHtml(listEl, emptyState('Không có nhân viên đang làm'));
    setHtml(
      listEl,
      html`<ul class="grid gap-3 md:grid-cols-2">
        ${rows.map(
          (e) => html`<li class="card ${e.is_active ? '' : 'opacity-60'}">
            <div class="flex items-start gap-3">
              <span class="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent/15 to-accent/5 font-semibold text-fg">${e.name.trim().charAt(0).toUpperCase()}</span>
              <div class="min-w-0 flex-1">
                <p class="truncate font-semibold text-fg">${e.name}</p>
                <p class="truncate text-xs text-subtle">${[e.position, e.phone].filter(Boolean).join(' · ') || 'Chưa có chức vụ'}</p>
                <p class="mt-1 text-sm"><span class="font-semibold text-accent-ink tabular-nums">${formatVND(e.salary_amount)}</span>
                  <span class="text-subtle">${SALARY_TYPES[e.salary_type].unit}</span></p>
              </div>
              ${e.is_active ? '' : html`<span class="badge-gray">Nghỉ việc</span>`}
            </div>
            <div class="mt-3 flex gap-1 border-t border-fg/5 pt-2">
              <button class="btn-secondary flex-1" data-edit="${e.id}">${icon('edit', 'size-4')} Sửa</button>
              <button class="btn-icon hover:text-bad" data-delete="${e.id}" aria-label="Xoá ${e.name}">${icon('trash')}</button>
            </div>
          </li>`,
        )}
      </ul>`,
    );
  }

  function openForm(emp) {
    const editing = Boolean(emp);
    const e = emp ?? { name: '', phone: '', position: '', salary_type: 'monthly', salary_amount: 0, note: '', is_active: true };
    const { el } = openModal({
      title: editing ? 'Sửa nhân viên' : 'Thêm nhân viên',
      submitLabel: editing ? 'Lưu thay đổi' : 'Thêm nhân viên',
      body: html`<div class="space-y-4">
        <div>
          <label class="field-label" for="ef-name">Họ tên *</label>
          <input class="input" id="ef-name" name="name" maxlength="100" value="${e.name}" required />
          <p class="field-error hidden" data-error-for="name"></p>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="field-label" for="ef-pos">Chức vụ</label>
            <input class="input" id="ef-pos" name="position" maxlength="60" value="${e.position}" placeholder="VD: Giao hàng" />
            <p class="field-error hidden" data-error-for="position"></p>
          </div>
          <div>
            <label class="field-label" for="ef-phone">Số điện thoại</label>
            <input class="input" id="ef-phone" name="phone" type="tel" inputmode="tel" maxlength="20" value="${e.phone}" />
            <p class="field-error hidden" data-error-for="phone"></p>
          </div>
        </div>
        <fieldset>
          <legend class="field-label">Cách trả lương *</legend>
          <div class="grid grid-cols-2 gap-2">
            ${Object.entries(SALARY_TYPES).map(([k, t]) => html`<label class="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-fg/10 bg-fg/[0.03] px-3 has-[:checked]:border-accent/50 has-[:checked]:bg-accent/10">
              <input type="radio" name="salary_type" value="${k}" class="accent-accent" ${e.salary_type === k ? 'checked' : ''} /> ${t.label}
            </label>`)}
          </div>
        </fieldset>
        <div>
          <label class="field-label" for="ef-salary">Mức lương (₫) *</label>
          <input class="input text-right text-lg font-semibold tabular-nums" id="ef-salary" name="salary_amount" data-money inputmode="numeric" value="${groupThousands(e.salary_amount)}" />
          <p class="mt-1 text-xs text-subtle">Lương tháng: chia theo số ngày thực tế của tháng rồi nhân số công.</p>
          <p class="field-error hidden" data-error-for="salary_amount"></p>
        </div>
        <div>
          <label class="field-label" for="ef-note">Ghi chú</label>
          <input class="input" id="ef-note" name="note" maxlength="300" value="${e.note}" />
          <p class="field-error hidden" data-error-for="note"></p>
        </div>
        <label class="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-fg/10 bg-fg/[0.03] px-3">
          <input type="checkbox" name="is_active" class="size-5 accent-accent" ${e.is_active ? 'checked' : ''} /> Đang làm việc
        </label>
      </div>`,
      onSubmit: async (form) => {
        const f = form.elements;
        const { ok, value, errors } = validateEmployee(
          { name: f.name.value, phone: f.phone.value, position: f.position.value, salary_type: f.salary_type.value, salary_amount: f.salary_amount.value, note: f.note.value, is_active: f.is_active.checked },
          parseMoney,
        );
        showFieldErrors(form, errors);
        if (!ok) return false;
        if (editing) await updateEmployee(e.id, value);
        else await createEmployee(value);
        toast(editing ? 'Đã lưu nhân viên' : 'Đã thêm nhân viên');
        load();
      },
    });
    bindMoneyInputs(el);
  }

  async function remove(emp) {
    if (!(await confirmDialog({ title: 'Xoá nhân viên', message: `Xoá "${emp.name}"? Nếu người này đã có chấm công, hãy sửa và bỏ tích "Đang làm việc" thay vì xoá.`, confirmLabel: 'Xoá' }))) return;
    try {
      await deleteEmployee(emp.id);
      toast('Đã xoá nhân viên');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  section.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.matches('[data-add]')) openForm(null);
    if (b.dataset.edit) openForm(state.items.find((x) => x.id === b.dataset.edit));
    if (b.dataset.delete) remove(state.items.find((x) => x.id === b.dataset.delete));
  });
  $('[data-inactive]', section).addEventListener('change', (ev) => {
    state.showInactive = ev.target.checked;
    draw();
  });
  load();
}
