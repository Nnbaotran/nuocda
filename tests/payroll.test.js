import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ATT_ORDER, ATT_STATUS, basePay, computePay, daysInMonth, monthRange, shiftMonth, sumUnits, toCSV } from '../src/modules/payroll/logic.js';

test('daysInMonth: số ngày thực tế, kể cả năm nhuận', () => {
  assert.equal(daysInMonth('2026-02'), 28);
  assert.equal(daysInMonth('2028-02'), 29);
  assert.equal(daysInMonth('2026-11'), 30);
  assert.equal(daysInMonth('2026-01'), 31);
  assert.deepEqual(monthRange('2026-02'), { from: '2026-02-01', to: '2026-02-28' });
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
});

// Các số dưới đây KHỚP kết quả chạy trên database ngày 25/11/2026
test('lương tháng = lương ÷ số ngày của tháng × công', () => {
  assert.equal(basePay('monthly', 6000000, 21, 28), 4500000);
  assert.equal(basePay('monthly', 7000000, 1, 31), 225806); // 225.806,45
  assert.equal(basePay('monthly', 7000000, 1, 30), 233333); // 233.333,33
  assert.equal(basePay('monthly', 5000000, 1, 28), 178571); // 178.571,43
  assert.equal(basePay('monthly', 9000000, 22, 28), 7071429); // 7.071.428,57 -> làm tròn lên
  assert.equal(basePay('monthly', 6000000, 0, 30), 0);
});

test('lương ngày = lương ngày × công (nửa ngày = 0,5)', () => {
  assert.equal(basePay('daily', 250000, 10.5, 28), 2625000);
  assert.equal(basePay('daily', 333333, 0.5, 30), 166667); // 166.666,5 -> làm tròn lên
});

test('thực lĩnh = lương theo công + thưởng − phạt', () => {
  assert.deepEqual(computePay({ salary_type: 'monthly', salary_amount: 6000000, units: 21, days: 28, bonus: 200000, penalty: 50000 }), { base: 4500000, net: 4650000 });
  assert.deepEqual(computePay({ salary_type: 'daily', salary_amount: 200000, units: 1, days: 30, penalty: 500000 }), { base: 200000, net: -300000 });
});

test('sumUnits: cộng công không sai số', () => {
  assert.equal(sumUnits([{ units: 0.1 }, { units: 0.2 }]), 0.3);
  assert.equal(sumUnits([{ units: 1 }, { units: 0.5 }, { units: '0.5' }, { units: 0 }]), 2);
});

test('toCSV: có BOM, bọc ô có dấu phẩy/ngoặc kép', () => {
  const csv = toCSV([{ a: 'Nguyễn, An', b: 'nói "chào"' }], [{ key: 'a', label: 'Tên' }, { key: 'b', label: 'Ghi chú' }]);
  assert.equal(csv, '﻿Tên,Ghi chú\r\n"Nguyễn, An","nói ""chào"""\r\n');
});

import { parseMoney } from '../src/lib/format.js';
import { validateEmployee } from '../src/modules/payroll/logic.js';

test('validateEmployee', () => {
  const ok = validateEmployee({ name: ' An ', salary_type: 'monthly', salary_amount: '6.000.000' }, parseMoney);
  assert.equal(ok.ok, true);
  assert.equal(ok.value.salary_amount, 6000000);
  assert.equal(ok.value.name, 'An');
  const bad = validateEmployee({ name: '', salary_amount: '', phone: 'abc' }, parseMoney);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['name', 'phone', 'salary_amount']);
});

test('nghỉ phép có lương = 1 công, không lương = 0 công', () => {
  assert.equal(ATT_STATUS.leave_paid.units, 1);
  assert.equal(ATT_STATUS.leave.units, 0);
  assert.ok(ATT_ORDER.includes('leave_paid') && ATT_ORDER.includes('leave'));
});
