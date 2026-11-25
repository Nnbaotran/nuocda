import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDate, formatDateTime, formatVND, groupThousands, parseMoney } from '../src/lib/format.js';

test('formatVND: dấu chấm ngăn cách hàng nghìn + ký hiệu ₫', () => {
  assert.equal(formatVND(1234567), '1.234.567 ₫');
  assert.equal(formatVND(0), '0 ₫');
  assert.equal(formatVND(999), '999 ₫');
  assert.equal(formatVND(1000), '1.000 ₫');
  assert.equal(formatVND(-25000), '-25.000 ₫');
  assert.equal(formatVND(null), '0 ₫');
});

test('groupThousands: số lớn', () => {
  assert.equal(groupThousands(1000000000), '1.000.000.000');
});

test('parseMoney: đọc đúng các kiểu gõ thường gặp', () => {
  assert.equal(parseMoney('1.234.567'), 1234567);
  assert.equal(parseMoney('1234567'), 1234567);
  assert.equal(parseMoney(' 30.000 ₫ '), 30000);
  assert.equal(parseMoney('25.000đ'), 25000);
  assert.equal(parseMoney(0), 0);
  assert.equal(parseMoney(15000), 15000);
});

test('parseMoney: từ chối dữ liệu sai thay vì đoán', () => {
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney('abc'), null);
  assert.equal(parseMoney('12,5'), null);
  assert.equal(parseMoney('1e5'), null);
  assert.equal(parseMoney(12.5), null);
  assert.equal(parseMoney('99999999999999999999'), null);
});

test('formatDate/formatDateTime: dd/mm/yyyy theo giờ Việt Nam', () => {
  // 17:30 UTC ngày 24/11 = 00:30 ngày 25/11 giờ Việt Nam
  assert.equal(formatDate('2026-11-24T17:30:00Z'), '25/11/2026');
  assert.equal(formatDateTime('2026-11-24T17:30:00Z'), '25/11/2026 00:30');
  assert.equal(formatDate('2026-01-05T03:00:00Z'), '05/01/2026');
  assert.equal(formatDate('không phải ngày'), '');
});
