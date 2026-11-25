import { friendlyError, supabase } from '../../lib/supabase.js';

const COLUMNS = 'id, sku, name, unit, price, note, is_active, updated_at';

export async function listProducts() {
  const { data, error } = await supabase.from('products').select(COLUMNS).order('is_active', { ascending: false }).order('name');
  if (error) throw new Error(friendlyError(error, 'Không tải được danh sách sản phẩm'));
  return data;
}

export async function createProduct(value) {
  const { data, error } = await supabase.from('products').insert(value).select(COLUMNS).single();
  if (error) throw new Error(friendlyError(error, 'Không thêm được sản phẩm'));
  return data;
}

export async function updateProduct(id, value) {
  const { data, error } = await supabase.from('products').update(value).eq('id', id).select(COLUMNS).single();
  if (error) throw new Error(friendlyError(error, 'Không lưu được sản phẩm'));
  return data;
}

export async function deleteProduct(id) {
  const { error, count } = await supabase.from('products').delete({ count: 'exact' }).eq('id', id);
  if (error) {
    if (error.code === '23503') throw new Error('Sản phẩm đã có trong đơn hàng nên không xoá được. Hãy chuyển sang "Ngừng bán".');
    throw new Error(friendlyError(error, 'Không xoá được sản phẩm'));
  }
  if (count === 0) throw new Error('Bạn không có quyền xoá sản phẩm này');
}
