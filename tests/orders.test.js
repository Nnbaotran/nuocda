import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, formatDateStr, fromLocalInputVN, presetRange, rangeToTimestamps, todayVN, toLocalInputVN } from '../src/lib/dates.js';
import { balanceLabel, buildLedger, cancelResultText, lineTotal, parseQuantity } from '../src/modules/orders/logic.js';

test('parseQuantity: dấu phẩy hoặc chấm đều là số lẻ, tối đa 2 số lẻ', () => {
  assert.deepEqual(parseQuantity('10'), { value: 10 });
  assert.deepEqual(parseQuantity('2,5'), { value: 2.5 });
  assert.deepEqual(parseQuantity('1.15'), { value: 1.15 });
  assert.deepEqual(parseQuantity(''), { value: 0 });
  assert.equal(parseQuantity('1,234').error, 'Tối đa 2 số lẻ');
  assert.equal(parseQuantity('-1').error, 'Số lượng không hợp lệ');
  assert.equal(parseQuantity('abc').error, 'Số lượng không hợp lệ');
  assert.equal(parseQuantity('100001').error, 'Số lượng quá lớn');
});

test('lineTotal: làm tròn đến đồng, khớp với database', () => {
  assert.equal(lineTotal(10, 28000), 280000);
  assert.equal(lineTotal(2.5, 24000), 60000);
  assert.equal(lineTotal(1.15, 20000), 23000); // 1.15*20000 bằng số thực = 22999.999… -> vẫn phải ra 23000
  assert.equal(lineTotal(0.33, 1001), 330); // 330.33 -> 330
  assert.equal(lineTotal(0.5, 1001), 501); // 500.5 -> làm tròn lên 501
  assert.equal(lineTotal(100000, 1000000000), 100000000000000);
});

test('buildLedger: nợ đầu kỳ + tăng − giảm = nợ cuối kỳ, số dư từng dòng', () => {
  const l = buildLedger(50000, [
    { kind: 'order', increase: 240000, decrease: 0 },
    { kind: 'payment', increase: 0, decrease: 100000 },
    { kind: 'order', increase: 10000, decrease: 0 },
  ]);
  assert.equal(l.opening, 50000);
  assert.equal(l.increase, 250000);
  assert.equal(l.decrease, 100000);
  assert.equal(l.closing, 200000);
  assert.deepEqual(l.rows.map((r) => r.balance), [290000, 190000, 200000]);
  assert.equal(buildLedger(0, []).closing, 0);
});

test('balanceLabel: còn nợ / hết nợ / trả dư', () => {
  assert.deepEqual(balanceLabel(140000), { text: 'Còn nợ 140.000 ₫', tone: 'debt' });
  assert.deepEqual(balanceLabel(0), { text: 'Hết nợ', tone: 'clear' });
  assert.deepEqual(balanceLabel(-100000), { text: 'Khách trả dư 100.000 ₫', tone: 'credit' });
});

test('ngày theo giờ Việt Nam', () => {
  assert.equal(todayVN(new Date('2026-11-24T17:30:00Z')), '2026-11-25');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(formatDateStr('2026-11-05'), '05/11/2026');
  assert.deepEqual(presetRange('month', '2026-11-25'), { from: '2026-11-01', to: '2026-11-25' });
  assert.deepEqual(presetRange('lastmonth', '2026-01-15'), { from: '2025-12-01', to: '2025-12-31' });
  assert.deepEqual(presetRange('lastmonth', '2026-03-10'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(presetRange('7d', '2026-11-25'), { from: '2026-11-19', to: '2026-11-25' });
  assert.deepEqual(presetRange('all', '2026-11-25'), { from: null, to: null });
  assert.deepEqual(rangeToTimestamps('2026-11-01', '2026-11-30'), {
    gte: '2026-11-01T00:00:00+07:00',
    lt: '2026-12-01T00:00:00+07:00',
  });
  assert.equal(toLocalInputVN('2026-11-24T17:30:00Z'), '2026-11-25T00:30');
  assert.equal(fromLocalInputVN('2026-11-25T00:30'), '2026-11-25T00:30:00+07:00');
  assert.equal(fromLocalInputVN('sai'), null);
});

test('sổ công nợ: dòng nợ cũ cộng vào dư', () => {
  const l = buildLedger(0, [
    { kind: 'opening', increase: 100000, decrease: 0 },
    { kind: 'order', increase: 50000, decrease: 0 },
    { kind: 'payment', increase: 0, decrease: 120000 },
  ]);
  assert.equal(l.increase, 150000);
  assert.equal(l.closing, 30000);
  assert.deepEqual(l.rows.map((r) => r.balance), [100000, 150000, 30000]);
});

test('thông báo huỷ đơn: tiền trả lại khách', () => {
  const n = (s) => s.replace(/\s/g, ' ');
  assert.equal(cancelResultText('DH1', { paid_in_order: 0, payments_refund: 0 }), 'Đã huỷ đơn DH1');
  assert.equal(n(cancelResultText('DH1', { paid_in_order: 50000, payments_refund: 0 })), n('Đã huỷ đơn DH1. Trả lại khách 50.000 ₫'));
  assert.equal(n(cancelResultText('DH1', { paid_in_order: 10000, payments_refund: 20000 })),
    n('Đã huỷ đơn DH1. Trả lại khách 30.000 ₫ (gồm 20.000 ₫ từ phiếu thu đã huỷ theo)'));
});
