// Trang Chấm công (Chủ tự chấm). Hai cách xem:
//  - Theo ngày: mỗi nhân viên 4 nút Đi làm / Nửa ngày / Nghỉ / Nghỉ phép — bấm là lưu.
//  - Bảng tháng: lưới ngày × nhân viên, bấm ô để sửa chi tiết (số công, giờ vào-ra, ghi chú).
import { formatQty } from '../../lib/format.js';
import { addDays, formatDateStr, todayVN } from '../../lib/dates.js';
import { $, $$, html, setHtml } from '../../lib/dom.js';
import { errorState, emptyState, loadingState, openModal, showFieldErrors, toast } from '../../lib/ui.js';
import { parseQuantity } from '../orders/logic.js';
import { clearAttendance, isMonthClosed, listAttendance, listEmployees, saveAttendance } from './api.js';
import { ATT_ORDER, ATT_STATUS, daysInMonth, monthLabel, monthRange, sumUnits } from './logic.js';
import { currentMonth, mountMonthPicker } from './month-picker.js';

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const weekday = (d) => WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()];

function lockBanner(ym) {
  return html`<p class="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-warn">
    ${monthLabel(ym)} đã chốt lương nên không sửa chấm công được. Muốn sửa: vào "Bảng lương" › Mở chốt.</p>`;
}

/** Hộp thoại sửa 1 ô chấm công. onDone() được gọi sau khi lưu/xoá. */
function openCellEditor({ employee, date, record, locked, onDone }) {
  const r = record ?? { status: 'present', units: 1, check_in: null, check_out: null, note: '' };
  const { el, close } = openModal({
    title: `${employee.name} – ${weekday(date)} ${formatDateStr(date)}`,
    submitLabel: 'Lưu',
    body: html`<div class="space-y-4">
      ${locked ? lockBanner(date.slice(0, 7)) : ''}
      <div class="grid grid-cols-2 gap-2">
        ${ATT_ORDER.map((k) => html`<label class="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-fg/10 bg-fg/[0.03] px-3 has-[:checked]:border-accent/50 has-[:checked]:bg-accent/10">
          <input type="radio" name="status" value="${k}" class="accent-accent" ${r.status === k ? 'checked' : ''} /> ${ATT_STATUS[k].label}
        </label>`)}
      </div>
      <div>
        <label class="field-label" for="ce-units">Số công</label>
        <input class="input w-32 text-center tabular-nums" id="ce-units" name="units" inputmode="decimal" value="${formatQty(r.units)}" />
        <p class="mt-1 text-xs text-subtle">Tự điền theo lựa chọn ở trên (đi làm 1, nửa ngày 0,5); sửa tay được, tối đa 3.</p>
        <p class="field-error hidden" data-error-for="units"></p>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="field-label" for="ce-in">Giờ vào</label><input class="input" id="ce-in" name="check_in" type="time" value="${r.check_in?.slice(0, 5) ?? ''}" /></div>
        <div><label class="field-label" for="ce-out">Giờ ra</label><input class="input" id="ce-out" name="check_out" type="time" value="${r.check_out?.slice(0, 5) ?? ''}" /></div>
      </div>
      <div><label class="field-label" for="ce-note">Ghi chú</label><input class="input" id="ce-note" name="note" maxlength="200" value="${r.note ?? ''}" /></div>
      ${record && !locked ? html`<button type="button" class="text-sm text-bad hover:underline" data-clear>Xoá ô chấm công này</button>` : ''}
    </div>`,
    onSubmit: async (form) => {
      if (locked) throw new Error('Tháng đã chốt lương');
      const f = form.elements;
      const q = parseQuantity(f.units.value);
      const errors = {};
      if (q.error || q.value > 3) errors.units = 'Số công từ 0 đến 3, tối đa 2 số lẻ';
      showFieldErrors(form, errors);
      if (Object.keys(errors).length) return false;
      await saveAttendance([{ employee_id: employee.id, work_date: date, status: f.status.value, units: q.value ?? 0,
        check_in: f.check_in.value || null, check_out: f.check_out.value || null, note: f.note.value.trim() }]);
      toast('Đã lưu chấm công');
      onDone();
    },
  });
  // Đổi lựa chọn -> tự điền số công mặc định
  $$('input[name=status]', el).forEach((radio) =>
    radio.addEventListener('change', () => {
      el.querySelector('[name=units]').value = formatQty(ATT_STATUS[radio.value].units);
    }),
  );
  el.querySelector('[data-clear]')?.addEventListener('click', async () => {
    try {
      await clearAttendance(employee.id, date);
      toast('Đã xoá ô chấm công');
      close();
      onDone();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

export function renderAttendance(root) {
  const state = { mode: 'day', date: todayVN(), ym: currentMonth() };
  setHtml(
    root,
    html`<section class="space-y-4">
      <div class="grid grid-cols-2 gap-1 rounded-2xl border border-fg/10 bg-surface/70 p-1" role="tablist">
        <button class="min-h-11 rounded-xl text-sm font-medium" data-mode="day" role="tab">Chấm theo ngày</button>
        <button class="min-h-11 rounded-xl text-sm font-medium" data-mode="month" role="tab">Bảng tháng</button>
      </div>
      <div data-view></div>
    </section>`,
  );
  const section = $('section', root);
  const view = $('[data-view]', section);

  function paintModes() {
    for (const b of $$('[data-mode]', section)) {
      const on = b.dataset.mode === state.mode;
      b.className = `min-h-11 rounded-xl text-sm font-medium transition ${on ? 'bg-gradient-to-r from-accent/15 to-accent/5 text-fg ring-1 ring-accent/30' : 'text-muted hover:text-fg'}`;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }

  // ---------- Theo ngày ----------
  async function renderDay() {
    const today = todayVN();
    setHtml(view, html`<div class="space-y-3">
      <div class="flex items-center gap-2">
        <button class="btn-icon border border-fg/10" data-day="-1" aria-label="Ngày trước">‹</button>
        <input type="date" class="input flex-1 text-center" data-date value="${state.date}" max="${today}" aria-label="Ngày chấm công" />
        <button class="btn-icon border border-fg/10 disabled:opacity-30" data-day="1" aria-label="Ngày sau" ${state.date >= today ? 'disabled' : ''}>›</button>
      </div>
      <div data-day-body>${loadingState(3)}</div>
    </div>`);
    const body = $('[data-day-body]', view);
    try {
      const [emps, recs, locked] = await Promise.all([listEmployees(), listAttendance(state.date, state.date), isMonthClosed(state.date.slice(0, 7))]);
      const active = emps.filter((e) => e.is_active);
      const byEmp = new Map(recs.map((r) => [r.employee_id, r]));
      if (!active.length) return setHtml(body, emptyState('Chưa có nhân viên. Thêm ở mục "Nhân viên".'));
      const unmarked = active.filter((e) => !byEmp.has(e.id)).length;
      setHtml(body, html`<div class="space-y-3">
        ${locked ? lockBanner(state.date.slice(0, 7)) : ''}
        <div class="flex items-center justify-between text-sm">
          <span class="text-muted">${weekday(state.date)} ${formatDateStr(state.date)} · đã chấm ${active.length - unmarked}/${active.length}</span>
          ${!locked && unmarked ? html`<button class="btn-secondary min-h-10" data-all>Chấm ${unmarked} người còn lại: Đi làm</button>` : ''}
        </div>
        <ul class="space-y-2">
          ${active.map((e) => {
            const r = byEmp.get(e.id);
            return html`<li class="card p-3">
              <div class="mb-2 flex items-center justify-between gap-2">
                <p class="truncate font-medium text-fg">${e.name}</p>
                <button class="text-xs text-accent-ink hover:underline" data-detail="${e.id}">
                  ${r ? `${formatQty(r.units)} công${r.check_in ? ` · ${r.check_in.slice(0, 5)}–${r.check_out?.slice(0, 5) ?? ''}` : ''} ›` : 'Chi tiết ›'}</button>
              </div>
              <div class="grid grid-cols-4 gap-1.5">
                ${ATT_ORDER.map((k) => html`<button class="min-h-11 rounded-xl text-sm font-medium ring-1 transition disabled:opacity-50 ${r?.status === k ? ATT_STATUS[k].cls : 'bg-fg/[0.03] text-muted ring-fg/10 hover:text-fg'}"
                  data-set="${e.id}" data-status="${k}" aria-pressed="${r?.status === k ? 'true' : 'false'}" ${locked ? 'disabled' : ''}>${ATT_STATUS[k].label}</button>`)}
              </div>
            </li>`;
          })}
        </ul>
      </div>`);

      body.onclick = async (ev) => {
        const b = ev.target.closest('button');
        if (!b) return;
        try {
          if (b.dataset.set) {
            const cur = byEmp.get(b.dataset.set);
            $$(`[data-set="${b.dataset.set}"]`, body).forEach((x) => (x.disabled = true));
            if (cur?.status === b.dataset.status) await clearAttendance(b.dataset.set, state.date); // bấm lại = bỏ chấm
            else await saveAttendance([{ employee_id: b.dataset.set, work_date: state.date, status: b.dataset.status, units: ATT_STATUS[b.dataset.status].units }]);
            renderDay();
          } else if (b.matches('[data-all]')) {
            b.disabled = true;
            await saveAttendance(active.filter((e) => !byEmp.has(e.id)).map((e) => ({ employee_id: e.id, work_date: state.date, status: 'present', units: 1 })));
            toast('Đã chấm Đi làm cho những người còn lại');
            renderDay();
          } else if (b.dataset.detail) {
            const emp = active.find((e) => e.id === b.dataset.detail);
            openCellEditor({ employee: emp, date: state.date, record: byEmp.get(emp.id), locked, onDone: renderDay });
          }
        } catch (err) {
          toast(err.message, 'error');
          renderDay();
        }
      };
    } catch (err) {
      setHtml(body, errorState(err.message, renderDay));
    }
    $('[data-date]', view).addEventListener('change', (ev) => {
      if (ev.target.value && ev.target.value <= today) {
        state.date = ev.target.value;
        renderDay();
      }
    });
    $$('[data-day]', view).forEach((b) =>
      b.addEventListener('click', () => {
        const next = addDays(state.date, Number(b.dataset.day));
        if (next > today) return;
        state.date = next;
        renderDay();
      }),
    );
  }

  // ---------- Bảng tháng ----------
  async function renderMonth() {
    setHtml(view, html`<div class="space-y-3"><div data-picker></div><div data-month-body>${loadingState(3)}</div></div>`);
    mountMonthPicker($('[data-picker]', view), { value: state.ym, onChange: (ym) => { state.ym = ym; loadMonth(); } });
    loadMonth();
  }

  async function loadMonth() {
    const body = $('[data-month-body]', view);
    if (!body) return;
    setHtml(body, loadingState(3));
    const ym = state.ym;
    const { from, to } = monthRange(ym);
    try {
      const [emps, recs, locked] = await Promise.all([listEmployees(), listAttendance(from, to), isMonthClosed(ym)]);
      const hasRec = new Set(recs.map((r) => r.employee_id));
      const list = emps.filter((e) => e.is_active || hasRec.has(e.id));
      if (!list.length) return setHtml(body, emptyState('Chưa có nhân viên. Thêm ở mục "Nhân viên".'));
      const map = new Map(recs.map((r) => [`${r.employee_id}|${r.work_date}`, r]));
      const n = daysInMonth(ym);
      const today = todayVN();
      const days = Array.from({ length: n }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`);
      setHtml(body, html`<div class="space-y-3">
        ${locked ? lockBanner(ym) : ''}
        <div class="flex flex-wrap gap-2 text-xs text-muted">
          ${ATT_ORDER.map((k) => html`<span class="inline-flex items-center gap-1"><span class="grid size-5 place-items-center rounded ring-1 ${ATT_STATUS[k].cls}">${ATT_STATUS[k].short}</span>${ATT_STATUS[k].label}</span>`)}
        </div>
        <div class="overflow-x-auto rounded-2xl border border-fg/10 bg-surface/70">
          <table class="border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th class="sticky left-0 z-10 min-w-28 bg-surface px-3 py-2 text-left font-semibold text-muted">Nhân viên</th>
                ${days.map((d) => html`<th class="px-0.5 py-1 text-center font-normal ${weekday(d) === 'CN' ? 'text-bad' : 'text-subtle'}">
                  <span class="block">${weekday(d)}</span><span class="block font-semibold text-fg-2">${d.slice(8)}</span></th>`)}
                <th class="sticky right-0 bg-surface px-3 py-2 text-right font-semibold text-muted">Công</th>
              </tr>
            </thead>
            <tbody>
              ${list.map((e) => {
                const mine = days.map((d) => map.get(`${e.id}|${d}`)).filter(Boolean);
                return html`<tr>
                  <td class="sticky left-0 z-10 max-w-32 truncate border-t border-fg/5 bg-surface px-3 py-1.5 font-medium text-fg">${e.name}</td>
                  ${days.map((d) => {
                    const r = map.get(`${e.id}|${d}`);
                    const future = d > today;
                    return html`<td class="border-t border-fg/5 p-0.5 text-center">
                      <button class="grid size-8 place-items-center rounded-lg ring-1 ${r ? ATT_STATUS[r.status].cls : 'text-faint ring-fg/5 hover:ring-accent/40'} disabled:opacity-30"
                        data-cell="${e.id}|${d}" ${future ? 'disabled' : ''} aria-label="${e.name} ngày ${formatDateStr(d)}: ${r ? ATT_STATUS[r.status].label : 'chưa chấm'}"
                        title="${r ? `${ATT_STATUS[r.status].label} – ${formatQty(r.units)} công` : ''}">${r ? (Number(r.units) !== ATT_STATUS[r.status].units ? formatQty(r.units) : ATT_STATUS[r.status].short) : '·'}</button>
                    </td>`;
                  })}
                  <td class="sticky right-0 border-t border-fg/5 bg-surface px-3 text-right font-semibold text-accent-ink tabular-nums">${formatQty(sumUnits(mine))}</td>
                </tr>`;
              })}
            </tbody>
          </table>
        </div>
        <p class="text-xs text-subtle">Bấm vào ô để chấm hoặc sửa. Kéo ngang để xem đủ tháng.</p>
      </div>`);
      // Gán onclick (thay vì addEventListener) để đổi tháng nhiều lần không bị gắn trùng.
      body.onclick = (ev) => {
        const b = ev.target.closest('[data-cell]');
        if (!b) return;
        const [empId, date] = b.dataset.cell.split('|');
        openCellEditor({ employee: list.find((x) => x.id === empId), date, record: map.get(b.dataset.cell), locked, onDone: loadMonth });
      };
    } catch (err) {
      setHtml(body, errorState(err.message, loadMonth));
    }
  }

  section.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-mode]');
    if (!b || b.dataset.mode === state.mode) return;
    state.mode = b.dataset.mode;
    paintModes();
    if (state.mode === 'day') renderDay();
    else renderMonth();
  });
  paintModes();
  renderDay();
}
