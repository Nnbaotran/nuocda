// Logic thuần (không đụng giao diện/mạng) cho hồ sơ khách và bảng giá riêng. Có test ở tests/customers.test.js.
import { parseMoney } from '../../lib/format.js';

export const CUSTOMER_LIMITS = { nameMax: 120, phoneMax: 20, addressMax: 300, noteMax: 500, priceMax: 1_000_000_000 };

export function validateCustomer(input) {
  const errors = {};
  const name = String(input.name ?? '').trim();
  const phone = String(input.phone ?? '').trim();
  const address = String(input.address ?? '').trim();
  const note = String(input.note ?? '').trim();

  if (!name) errors.name = 'Vui lòng nhập tên khách';
  else if (name.length > CUSTOMER_LIMITS.nameMax) errors.name = `Tên tối đa ${CUSTOMER_LIMITS.nameMax} ký tự`;

  if (phone) {
    const digits = phone.replace(/\D/g, '');
    if (!/^[0-9+ .()-]+$/.test(phone) || phone.length > CUSTOMER_LIMITS.phoneMax) errors.phone = 'Số điện thoại chỉ gồm số và dấu cách';
    else if (digits.length < 9 || digits.length > 12) errors.phone = 'Số điện thoại phải có 9–12 chữ số';
  }
  if (address.length > CUSTOMER_LIMITS.addressMax) errors.address = `Địa chỉ tối đa ${CUSTOMER_LIMITS.addressMax} ký tự`;
  if (note.length > CUSTOMER_LIMITS.noteMax) errors.note = `Ghi chú tối đa ${CUSTOMER_LIMITS.noteMax} ký tự`;

  const ok = Object.keys(errors).length === 0;
  return { ok, errors, value: ok ? { name, phone, address, note } : null };
}

/**
 * Ghép danh sách sản phẩm với giá riêng của khách.
 * Sản phẩm chưa có giá riêng (hiếm, ví dụ vừa thêm) dùng giá mặc định.
 * Sắp xếp: đang bán trước, rồi theo tên.
 */
export function buildPriceRows(products, customerPrices = []) {
  const own = new Map(customerPrices.map((p) => [p.product_id, Number(p.price)]));
  return products
    .map((p) => ({
      product_id: p.id,
      name: p.name,
      sku: p.sku ?? null,
      unit: p.unit,
      is_active: p.is_active,
      default_price: Number(p.price),
      price: own.has(p.id) ? own.get(p.id) : Number(p.price),
      saved: own.has(p.id),
    }))
    .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name, 'vi'));
}

/**
 * So sánh giá người dùng vừa sửa với giá hiện có.
 * edits: { [product_id]: "chuỗi gõ vào" }
 * Trả về { ok, errors: {product_id: msg}, changes: [{product_id, price}] } — chỉ gồm dòng thật sự đổi
 * (dòng chưa từng lưu cũng được gửi lên để database có bản ghi).
 */
export function diffPrices(rows, edits) {
  const errors = {};
  const changes = [];
  for (const row of rows) {
    const raw = edits[row.product_id];
    const typed = raw === undefined ? row.price : parseMoney(raw);
    if (raw !== undefined && String(raw).trim() === '') {
      errors[row.product_id] = 'Nhập giá';
      continue;
    }
    if (typed === null) {
      errors[row.product_id] = 'Giá phải là số nguyên';
      continue;
    }
    if (typed < 0) {
      errors[row.product_id] = 'Giá không được âm';
      continue;
    }
    if (typed > CUSTOMER_LIMITS.priceMax) {
      errors[row.product_id] = 'Giá quá lớn';
      continue;
    }
    if (typed !== row.price || !row.saved) changes.push({ product_id: row.product_id, price: typed });
  }
  return { ok: Object.keys(errors).length === 0, errors, changes };
}

/** Bỏ dấu + chữ thường, để tìm "quan a" ra "Quán A". */
export function searchKey(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
}

export function matchCustomer(c, query) {
  const q = searchKey(query).trim();
  if (!q) return true;
  const qDigits = q.replace(/\D/g, '');
  const phoneHit = qDigits.length >= 3 && String(c.phone ?? '').replace(/\D/g, '').includes(qDigits);
  return phoneHit || searchKey(c.name).includes(q) || searchKey(c.address).includes(q);
}
