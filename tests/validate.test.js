import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateStaffAccount } from '../src/modules/accounts/validate.js';
import { normalizeSku, validateProduct } from '../src/modules/products/validate.js';

const good = { name: ' Đá cây ', sku: 'da cay', unit: 'cây', price: '30.000', note: '', is_active: true };

test('validateProduct: dữ liệu đúng được làm sạch', () => {
  const r = validateProduct(good);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { name: 'Đá cây', sku: 'DA-CAY', unit: 'cây', price: 30000, note: '', is_active: true });
});

test('validateProduct: mã SKU để trống thì lưu null', () => {
  assert.equal(validateProduct({ ...good, sku: '  ' }).value.sku, null);
});

test('validateProduct: báo lỗi từng ô bằng tiếng Việt', () => {
  const r = validateProduct({ name: '', sku: 'A/B', unit: '', price: '12,5', note: 'x'.repeat(501) });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['name', 'note', 'price', 'sku', 'unit']);
  assert.equal(r.value, null);
});

test('validateProduct: giá', () => {
  assert.equal(validateProduct({ ...good, price: '' }).errors.price, 'Vui lòng nhập giá');
  assert.equal(validateProduct({ ...good, price: '-1' }).errors.price, 'Giá không được âm');
  assert.equal(validateProduct({ ...good, price: '1.000.000.001' }).errors.price, 'Giá quá lớn');
  assert.equal(validateProduct({ ...good, price: '0' }).ok, true);
});

test('normalizeSku: bỏ dấu, viết hoa', () => {
  assert.equal(normalizeSku('đá viên 1'), 'DA-VIEN-1');
});

test('validateStaffAccount', () => {
  assert.equal(validateStaffAccount({ full_name: 'An', email: 'An@Vidu.com', password: '12345678' }).value.email, 'an@vidu.com');
  const bad = validateStaffAccount({ full_name: '', email: 'sai', password: '123' });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['email', 'full_name', 'password']);
});
