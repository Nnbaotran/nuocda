import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPriceRows, diffPrices, matchCustomer, validateCustomer } from '../src/modules/customers/logic.js';

const products = [
  { id: 'p1', name: 'Đá viên', sku: 'DA-VIEN', unit: 'bao', price: 25000, is_active: true },
  { id: 'p2', name: 'Đá cây', sku: 'DA-CAY', unit: 'cây', price: 30000, is_active: true },
  { id: 'p3', name: 'Đá bi', sku: null, unit: 'bao', price: 22000, is_active: false },
];

test('validateCustomer: hợp lệ + làm sạch', () => {
  const r = validateCustomer({ name: '  Quán Cô Ba ', phone: '0909 123 456', address: ' Chợ Lớn ', note: '' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { name: 'Quán Cô Ba', phone: '0909 123 456', address: 'Chợ Lớn', note: '' });
});

test('validateCustomer: SĐT để trống được, sai định dạng thì báo', () => {
  assert.equal(validateCustomer({ name: 'A', phone: '' }).ok, true);
  assert.equal(validateCustomer({ name: 'A', phone: '0909abc' }).errors.phone, 'Số điện thoại chỉ gồm số và dấu cách');
  assert.equal(validateCustomer({ name: 'A', phone: '12345' }).errors.phone, 'Số điện thoại phải có 9–12 chữ số');
  assert.equal(validateCustomer({ name: '' }).errors.name, 'Vui lòng nhập tên khách');
});

test('buildPriceRows: lấy giá riêng, thiếu thì dùng giá mặc định; đang bán xếp trước', () => {
  const rows = buildPriceRows(products, [{ product_id: 'p2', price: 28000 }]);
  assert.deepEqual(rows.map((r) => r.product_id), ['p2', 'p1', 'p3']);
  assert.equal(rows[0].price, 28000);
  assert.equal(rows[0].default_price, 30000);
  assert.equal(rows[0].saved, true);
  assert.equal(rows[1].price, 25000);
  assert.equal(rows[1].saved, false);
});

test('diffPrices: chỉ gửi dòng thật sự đổi (và dòng chưa từng lưu)', () => {
  const rows = buildPriceRows(products, [
    { product_id: 'p1', price: 25000 },
    { product_id: 'p2', price: 28000 },
    { product_id: 'p3', price: 22000 },
  ]);
  assert.deepEqual(diffPrices(rows, {}).changes, []);
  assert.deepEqual(diffPrices(rows, { p2: '28.000' }).changes, []);
  assert.deepEqual(diffPrices(rows, { p2: '27.500', p1: '25.000' }).changes, [{ product_id: 'p2', price: 27500 }]);

  const partly = buildPriceRows(products, [{ product_id: 'p1', price: 25000 }]);
  assert.deepEqual(
    diffPrices(partly, {}).changes.map((c) => c.product_id).sort(),
    ['p2', 'p3'],
  );
});

test('diffPrices: giá sai bị chặn, không gửi gì', () => {
  const rows = buildPriceRows(products, []);
  const r = diffPrices(rows, { p1: '', p2: '12,5', p3: '-5' });
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, { p1: 'Nhập giá', p2: 'Giá phải là số nguyên', p3: 'Giá không được âm' });
  assert.equal(diffPrices(rows, { p1: '1.000.000.001' }).errors.p1, 'Giá quá lớn');
});

test('matchCustomer: tìm không dấu, theo SĐT', () => {
  const c = { name: 'Quán Cô Ba', phone: '0909 123 456', address: 'Chợ Lớn' };
  assert.equal(matchCustomer(c, 'quan co'), true);
  assert.equal(matchCustomer(c, '0909123'), true);
  assert.equal(matchCustomer(c, 'cho lon'), true);
  assert.equal(matchCustomer(c, 'xyz'), false);
  assert.equal(matchCustomer(c, ''), true);
});
