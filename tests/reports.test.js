import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bucketLabel, compactVND, niceTicks, sumByCategory, validateExpense } from '../src/modules/reports/logic.js';

test('validateExpense', () => {
  const ok = validateExpense({ expense_date: '2026-11-20', category: 'fuel', amount: '200.000', note: ' dầu ' }, '2026-11-25');
  assert.deepEqual(ok.value, { expense_date: '2026-11-20', category: 'fuel', amount: 200000, note: 'dầu' });
  const bad = validateExpense({ expense_date: '2026-12-01', category: 'xyz', amount: '0' }, '2026-11-25');
  assert.deepEqual(Object.keys(bad.errors).sort(), ['amount', 'category', 'expense_date']);
});

test('sumByCategory', () => {
  assert.deepEqual(
    sumByCategory([
      { category: 'fuel', amount: 100 },
      { category: 'electricity', amount: 500 },
      { category: 'fuel', amount: 50 },
    ]),
    [
      { category: 'electricity', label: 'Điện', amount: 500 },
      { category: 'fuel', label: 'Nhiên liệu', amount: 150 },
    ],
  );
});

test('compactVND', () => {
  assert.equal(compactVND(1250000), '1,25 tr');
  assert.equal(compactVND(350000), '350 k');
  assert.equal(compactVND(2000000000), '2 tỷ');
  assert.equal(compactVND(-1100000), '-1,1 tr');
  assert.equal(compactVND(0), '0');
});

test('niceTicks: bước tròn, luôn gồm 0, phủ cả số âm', () => {
  assert.deepEqual(niceTicks(0, 550000), [0, 200000, 400000, 600000]);
  assert.deepEqual(niceTicks(-1100000, 400000), [-1500000, -1000000, -500000, 0, 500000]);
  assert.deepEqual(niceTicks(0, 0), [0, 1000]);
});

test('bucketLabel', () => {
  assert.equal(bucketLabel('2026-11-05'), '05/11');
  assert.equal(bucketLabel('2026-11-05', true), '05/11/2026');
  assert.equal(bucketLabel('2026-11'), 'T11/26');
  assert.equal(bucketLabel('2026-11', true), 'Tháng 11/2026');
});
