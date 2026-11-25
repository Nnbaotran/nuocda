// Logic thuần cho chi phí & báo cáo (có test ở tests/reports.test.js).
import { formatDateStr } from '../../lib/dates.js';
import { parseMoney } from '../../lib/format.js';

export const EXPENSE_CATEGORIES = {
  electricity: 'Điện',
  water: 'Nước',
  fuel: 'Nhiên liệu',
  transport: 'Vận chuyển',
  repair: 'Sửa chữa máy',
  other: 'Khác',
};

export function validateExpense(input, today) {
  const errors = {};
  const amount = parseMoney(input.amount);
  const note = String(input.note ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expense_date ?? '')) errors.expense_date = 'Chọn ngày';
  else if (input.expense_date > today) errors.expense_date = 'Ngày không được ở tương lai';
  if (!EXPENSE_CATEGORIES[input.category]) errors.category = 'Chọn danh mục';
  if (String(input.amount ?? '').trim() === '') errors.amount = 'Vui lòng nhập số tiền';
  else if (amount === null || amount <= 0) errors.amount = 'Số tiền phải lớn hơn 0';
  else if (amount > 10_000_000_000) errors.amount = 'Số tiền quá lớn';
  if (note.length > 300) errors.note = 'Ghi chú tối đa 300 ký tự';
  const ok = Object.keys(errors).length === 0;
  return { ok, errors, value: ok ? { expense_date: input.expense_date, category: input.category, amount, note } : null };
}

/** Tổng theo danh mục: [{ category, label, amount }] sắp giảm dần. */
export function sumByCategory(expenses) {
  const m = new Map();
  for (const e of expenses) m.set(e.category, (m.get(e.category) ?? 0) + Number(e.amount));
  return [...m.entries()]
    .map(([category, amount]) => ({ category, label: EXPENSE_CATEGORIES[category] ?? category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** Số tiền gọn cho trục biểu đồ: 1.250.000 -> "1,25 tr"; 350.000 -> "350 k"; 2.000.000.000 -> "2 tỷ" */
export function compactVND(n) {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  const fmt = (x) => String(Math.round(x * 100) / 100).replace('.', ',');
  if (a >= 1e9) return `${fmt(v / 1e9)} tỷ`;
  if (a >= 1e6) return `${fmt(v / 1e6)} tr`;
  if (a >= 1e3) return `${fmt(v / 1e3)} k`;
  return String(v);
}

/** Các mốc trục "đẹp" (bước 1/2/5 × 10^k) phủ [min, max], luôn gồm 0. */
export function niceTicks(min, max, count = 4) {
  let lo = Math.min(0, min);
  let hi = Math.max(0, max);
  if (lo === hi) return [lo, lo + 1000]; // chưa có số liệu
  const raw = (hi - lo) / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t));
  return ticks;
}

/** Nhãn mốc thời gian: '2026-11-05' -> '05/11'; '2026-11' -> 'T11/26' */
export function bucketLabel(key, long = false) {
  if (key.length === 10) return long ? formatDateStr(key) : `${key.slice(8)}/${key.slice(5, 7)}`;
  return long ? `Tháng ${key.slice(5)}/${key.slice(0, 4)}` : `T${key.slice(5)}/${key.slice(2, 4)}`;
}
