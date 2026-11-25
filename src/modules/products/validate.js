// Kiểm tra dữ liệu sản phẩm phía giao diện (database cũng kiểm tra lại các giới hạn này).
import { parseMoney } from '../../lib/format.js';

export const PRODUCT_LIMITS = {
  nameMax: 120,
  unitMax: 20,
  noteMax: 500,
  skuMax: 30,
  priceMax: 1_000_000_000,
};

/** Chuẩn hoá mã SKU: viết hoa, khoảng trắng -> "-", bỏ dấu tiếng Việt. */
export function normalizeSku(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'D')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-');
}

/**
 * input: { name, sku, unit, price (chuỗi hoặc số), note, is_active }
 * Trả về { ok, value, errors } — value là dữ liệu sạch để gửi lên database.
 */
export function validateProduct(input) {
  const errors = {};
  const name = String(input.name ?? '').trim();
  const unit = String(input.unit ?? '').trim();
  const note = String(input.note ?? '').trim();
  const sku = normalizeSku(input.sku);
  const price = parseMoney(input.price);

  if (!name) errors.name = 'Vui lòng nhập tên sản phẩm';
  else if (name.length > PRODUCT_LIMITS.nameMax) errors.name = `Tên tối đa ${PRODUCT_LIMITS.nameMax} ký tự`;

  if (sku && !/^[A-Z0-9_-]+$/.test(sku)) errors.sku = 'Mã chỉ gồm chữ không dấu, số, dấu - hoặc _';
  else if (sku.length > PRODUCT_LIMITS.skuMax) errors.sku = `Mã tối đa ${PRODUCT_LIMITS.skuMax} ký tự`;

  if (!unit) errors.unit = 'Vui lòng nhập đơn vị tính';
  else if (unit.length > PRODUCT_LIMITS.unitMax) errors.unit = `Đơn vị tối đa ${PRODUCT_LIMITS.unitMax} ký tự`;

  if (String(input.price ?? '').trim() === '') errors.price = 'Vui lòng nhập giá';
  else if (price === null) errors.price = 'Giá phải là số nguyên (đồng)';
  else if (price < 0) errors.price = 'Giá không được âm';
  else if (price > PRODUCT_LIMITS.priceMax) errors.price = 'Giá quá lớn';

  if (note.length > PRODUCT_LIMITS.noteMax) errors.note = `Ghi chú tối đa ${PRODUCT_LIMITS.noteMax} ký tự`;

  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    errors,
    value: ok ? { name, sku: sku || null, unit, price, note, is_active: input.is_active !== false } : null,
  };
}
