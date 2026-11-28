import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addOne, cartCount, cartItems, cartLines, cartTotal, createCart, keypadPress, keypadValue, quickAmounts, removeOne, setPrice, setQty } from '../src/modules/orders/pos-logic.js';

const rows = [
  { product_id: 'cay', name: 'Đá cây', unit: 'cây' },
  { product_id: 'vien', name: 'Đá viên', unit: 'bao' },
];

test('giỏ hàng: bấm ô = thêm 1, bớt về 0 thì bỏ', () => {
  const c = createCart();
  addOne(c, 'cay', 28000); addOne(c, 'cay', 28000); addOne(c, 'vien', 25000);
  assert.equal(cartCount(c), 2);
  assert.equal(cartTotal(c), 2 * 28000 + 25000);
  removeOne(c, 'vien');
  assert.equal(c.has('vien'), false);
  assert.deepEqual(cartItems(c), [{ product_id: 'cay', quantity: 2, unit_price: 28000 }]);
});

test('giỏ hàng: đặt số lượng lẻ, đổi giá, thứ tự theo danh sách sản phẩm', () => {
  const c = createCart();
  setQty(c, 'vien', 2.5, 25000); setQty(c, 'cay', 10, 28000);
  setPrice(c, 'vien', 24000);
  assert.deepEqual(cartLines(c, rows).map((l) => [l.product_id, l.qty, l.price, l.total]), [['cay', 10, 28000, 280000], ['vien', 2.5, 24000, 60000]]);
  assert.equal(cartTotal(c), 340000);
  setQty(c, 'cay', 0);
  assert.equal(c.has('cay'), false);
  // thêm 1 vào 2,5 -> 3,5 (không sai số)
  addOne(c, 'vien'); assert.equal(c.get('vien').qty, 3.5);
});

test('giỏ hàng từ đơn cũ (sửa đơn)', () => {
  const c = createCart([{ product_id: 'cay', quantity: '10.00', unit_price: 28000 }]);
  assert.equal(cartTotal(c), 280000);
});

test('bàn phím tiền', () => {
  let v = '';
  for (const k of ['1', '5', '000']) v = keypadPress(v, k, 'money');
  assert.equal(v, '15000');
  assert.equal(keypadPress('', '000', 'money'), '');
  assert.equal(keypadPress('0', '5', 'money'), '5');
  assert.equal(keypadPress('150', '⌫', 'money'), '15');
  assert.equal(keypadPress('150', 'C', 'money'), '');
  assert.equal(keypadPress('15', ',', 'money'), '15');
});

test('bàn phím số lượng: dấu phẩy, tối đa 2 số lẻ', () => {
  let v = '';
  for (const k of [',', '5']) v = keypadPress(v, k, 'qty');
  assert.equal(v, '0,5');
  assert.equal(keypadPress('2,55', '1', 'qty'), '2,55');
  assert.equal(keypadPress('2,5', ',', 'qty'), '2,5');
  assert.equal(keypadPress('2', '000', 'qty'), '2');
  assert.equal(keypadValue('2,5'), 2.5);
  assert.equal(keypadValue(''), 0);
});

test('gợi ý tiền trả trước nhỏ hơn tổng đơn', () => {
  assert.deepEqual(quickAmounts(340000), [20000, 50000, 100000, 200000].slice(-4));
  assert.deepEqual(quickAmounts(1500000), [100000, 200000, 500000, 1000000]);
  assert.deepEqual(quickAmounts(15000), []);
});
