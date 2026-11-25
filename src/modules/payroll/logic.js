// Logic thuần cho chấm công & lương (có test ở tests/payroll.test.js).
// Database (payroll_preview) là nơi tính chính thức; phần này cho số hiện ngay và phải KHỚP database.

export const ATT_STATUS = {
  present: { label: 'Đi làm', short: 'X', units: 1, cls: 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/40' },
  half: { label: 'Nửa ngày', short: '½', units: 0.5, cls: 'bg-cyan-500/20 text-cyan-200 ring-cyan-400/40' },
  absent: { label: 'Nghỉ', short: 'N', units: 0, cls: 'bg-rose-500/15 text-rose-200 ring-rose-400/30' },
  leave: { label: 'Nghỉ phép', short: 'P', units: 0, cls: 'bg-violet-500/20 text-violet-200 ring-violet-400/40' },
};
export const ATT_ORDER = ['present', 'half', 'absent', 'leave'];

export const SALARY_TYPES = {
  monthly: { label: 'Lương tháng', unit: '/ tháng' },
  daily: { label: 'Lương ngày', unit: '/ ngày' },
};

/** '2026-02' -> 28 */
export function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** '2026-02' -> { from: '2026-02-01', to: '2026-02-28' } */
export function monthRange(ym) {
  return { from: `${ym}-01`, to: `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}` };
}

export function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** '2026-02' -> 'Tháng 02/2026' */
export function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return `Tháng ${m}/${y}`;
}

/** Tổng công (cộng theo phần trăm để không sai số thực). */
export function sumUnits(records) {
  const h = records.reduce((s, r) => s + Math.round(Number(r.units) * 100), 0);
  return h / 100;
}

/**
 * Lương theo công, làm tròn ĐẾN ĐỒNG Ở BƯỚC CUỐI (giống database, làm tròn .5 lên).
 *   tháng: lương × công ÷ số ngày của tháng
 *   ngày : lương × công
 */
export function basePay(salaryType, salaryAmount, units, days) {
  const unitsH = BigInt(Math.round(Number(units) * 100)); // công × 100
  const num = BigInt(salaryAmount) * unitsH;
  const den = salaryType === 'monthly' ? 100n * BigInt(days) : 100n;
  return Number((2n * num + den) / (2n * den));
}

export function computePay({ salary_type, salary_amount, units, days, bonus = 0, penalty = 0 }) {
  const base = basePay(salary_type, salary_amount, units, days);
  return { base, net: base + Number(bonus) - Number(penalty) };
}

/** Chuỗi CSV (có BOM để Excel đọc đúng tiếng Việt). columns: [{ key, label }] */
export function toCSV(rows, columns) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const lines = [columns.map((c) => esc(c.label)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => esc(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** Kiểm tra hồ sơ nhân viên. Trả về { ok, errors, value }. */
export function validateEmployee(input, parseMoney) {
  const errors = {};
  const name = String(input.name ?? '').trim();
  const phone = String(input.phone ?? '').trim();
  const position = String(input.position ?? '').trim();
  const note = String(input.note ?? '').trim();
  const salary_type = input.salary_type === 'daily' ? 'daily' : 'monthly';
  const salary_amount = parseMoney(input.salary_amount);

  if (!name) errors.name = 'Vui lòng nhập tên nhân viên';
  else if (name.length > 100) errors.name = 'Tên tối đa 100 ký tự';
  if (phone && (!/^[0-9+ .()-]+$/.test(phone) || phone.length > 20)) errors.phone = 'Số điện thoại chỉ gồm số và dấu cách';
  if (position.length > 60) errors.position = 'Chức vụ tối đa 60 ký tự';
  if (String(input.salary_amount ?? '').trim() === '') errors.salary_amount = 'Vui lòng nhập mức lương';
  else if (salary_amount === null || salary_amount < 0) errors.salary_amount = 'Mức lương phải là số nguyên (đồng)';
  else if (salary_amount > 10_000_000_000) errors.salary_amount = 'Mức lương quá lớn';
  if (note.length > 300) errors.note = 'Ghi chú tối đa 300 ký tự';

  const ok = Object.keys(errors).length === 0;
  return { ok, errors, value: ok ? { name, phone, position, salary_type, salary_amount, note, is_active: input.is_active !== false } : null };
}
