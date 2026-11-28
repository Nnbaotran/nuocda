// Logic thuần của màn hình bán hàng kiểu POS (có test ở tests/pos.test.js).
// Giỏ hàng = Map(product_id -> { qty, price }). Tiền tính bằng lineTotal (khớp database).
import { lineTotal, QTY_MAX } from './logic.js';

export function createCart(initial = []) {
  const cart = new Map();
  for (const it of initial) cart.set(it.product_id, { qty: Number(it.quantity), price: Number(it.unit_price) });
  return cart;
}

/** Bấm vào ô sản phẩm: thêm 1. */
export function addOne(cart, productId, price) {
  const cur = cart.get(productId);
  const qty = Math.min(QTY_MAX, Math.round(((cur?.qty ?? 0) + 1) * 100) / 100);
  cart.set(productId, { qty, price: cur?.price ?? Number(price) });
  return cart;
}

/** Bớt 1; về 0 thì bỏ khỏi giỏ. */
export function removeOne(cart, productId) {
  const cur = cart.get(productId);
  if (!cur) return cart;
  const qty = Math.round((cur.qty - 1) * 100) / 100;
  if (qty <= 0) cart.delete(productId);
  else cart.set(productId, { ...cur, qty });
  return cart;
}

/** Đặt số lượng (0 = bỏ khỏi giỏ). */
export function setQty(cart, productId, qty, price) {
  const q = Math.round(Number(qty) * 100) / 100;
  if (!(q > 0)) cart.delete(productId);
  else cart.set(productId, { qty: Math.min(QTY_MAX, q), price: cart.get(productId)?.price ?? Number(price) });
  return cart;
}

export function setPrice(cart, productId, price) {
  const cur = cart.get(productId);
  if (cur) cart.set(productId, { ...cur, price: Math.max(0, Math.round(Number(price) || 0)) });
  return cart;
}

/** Các dòng trong giỏ theo thứ tự sản phẩm hiển thị. rows: [{ product_id, name, unit }] */
export function cartLines(cart, rows) {
  return rows
    .filter((r) => cart.has(r.product_id))
    .map((r) => {
      const { qty, price } = cart.get(r.product_id);
      return { product_id: r.product_id, name: r.name, unit: r.unit, qty, price, total: lineTotal(qty, price) };
    });
}

export function cartTotal(cart) {
  let t = 0;
  for (const { qty, price } of cart.values()) t += lineTotal(qty, price);
  return t;
}

export function cartCount(cart) {
  return cart.size;
}

/** Dữ liệu gửi lên database. */
export function cartItems(cart) {
  return [...cart.entries()].map(([product_id, { qty, price }]) => ({ product_id, quantity: qty, unit_price: price }));
}

/**
 * Bàn phím số trên màn hình. mode 'qty' (có dấu phẩy, tối đa 2 số lẻ) hoặc 'money' (có nút 000).
 * Trả về chuỗi mới sau khi bấm phím.
 */
export function keypadPress(value, key, mode = 'money') {
  let v = String(value ?? '');
  if (key === 'C') return '';
  if (key === '⌫') return v.slice(0, -1);
  if (key === ',') {
    if (mode !== 'qty' || v.includes(',')) return v;
    return (v || '0') + ',';
  }
  if (key === '000') {
    if (mode !== 'money' || !v || v === '0') return v;
    key = '000';
  } else if (!/^\d$/.test(key)) return v;
  if (mode === 'qty' && v.includes(',') && v.split(',')[1].length + key.length > 2) return v;
  let next = v === '0' ? key.replace(/^0+(?=\d)/, '') : v + key;
  if (next.replace(/\D/g, '').length > (mode === 'money' ? 13 : 8)) return v;
  if (mode === 'money') next = next.replace(/^0+(?=\d)/, '');
  return next;
}

/** Chuỗi bàn phím -> số ('2,5' -> 2.5). */
export function keypadValue(value) {
  const n = Number(String(value || '0').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Gợi ý số tiền khách trả trước (nhỏ hơn tổng đơn), tối đa 4 nút. */
export function quickAmounts(total) {
  const steps = [20000, 50000, 100000, 200000, 500000, 1000000, 2000000, 5000000];
  const out = steps.filter((a) => a < total);
  return out.slice(-4);
}
