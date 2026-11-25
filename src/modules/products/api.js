import { cached, invalidate, LIST_TTL } from '../../lib/cache.js';
import { db, throwFriendly } from '../../lib/supabase.js';

const COLUMNS = 'id, sku, name, unit, price, note, is_active, updated_at';

async function fetchListProductsFresh() {
  const sb = await db();
  const { data, error } = await sb.from('products').select(COLUMNS).order('is_active', { ascending: false }).order('name');
  if (error) throwFriendly(error, 'Không tải được danh sách sản phẩm');
  return data;
}

export async function createProduct(value) {
  invalidate('products');
  const sb = await db();
  const { data, error } = await sb.from('products').insert(value).select(COLUMNS).single();
  if (error) throwFriendly(error, 'Không thêm được sản phẩm');
  return data;
}

export async function updateProduct(id, value) {
  invalidate('products');
  const sb = await db();
  const { data, error } = await sb.from('products').update(value).eq('id', id).select(COLUMNS).single();
  if (error) throwFriendly(error, 'Không lưu được sản phẩm');
  return data;
}

export async function deleteProduct(id) {
  invalidate('products');
  const sb = await db();
  const { error, count } = await sb.from('products').delete({ count: 'exact' }).eq('id', id);
  if (error) {
    if (error.code === '23503') throw new Error('Sản phẩm đã có trong đơn hàng nên không xoá được. Hãy chuyển sang "Ngừng bán".');
    throwFriendly(error, 'Không xoá được sản phẩm');
  }
  if (count === 0) throw new Error('Bạn không có quyền xoá sản phẩm này');
}

/** Có nhớ tạm 30 giây (xem lib/cache.js). */
export function listProducts() {
  return cached('products', LIST_TTL, fetchListProductsFresh);
}
