import { friendlyError, supabase } from '../../lib/supabase.js';

const COLUMNS = 'id, name, phone, address, note, is_active, created_at';

export async function listCustomers() {
  const { data, error } = await supabase.from('customers').select(COLUMNS).order('is_active', { ascending: false }).order('name');
  if (error) throw new Error(friendlyError(error, 'Không tải được danh sách khách'));
  return data;
}

export async function getCustomer(id) {
  const { data, error } = await supabase.from('customers').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(friendlyError(error, 'Không tải được hồ sơ khách'));
  if (!data) throw new Error('Không tìm thấy hồ sơ khách (có thể đã bị xoá)');
  return data;
}

/** Tạo hồ sơ + giá lần đầu trong MỘT giao dịch ở database. prices: [{product_id, price}] */
export async function createCustomer(info, prices) {
  const { data, error } = await supabase.rpc('create_customer', {
    p_name: info.name,
    p_phone: info.phone,
    p_address: info.address,
    p_note: info.note,
    p_prices: prices,
  });
  if (error) throw new Error(friendlyError(error, 'Không tạo được hồ sơ khách'));
  return data; // id khách mới
}

export async function updateCustomer(id, patch) {
  const { data, error } = await supabase.from('customers').update(patch).eq('id', id).select('id').maybeSingle();
  if (error) throw new Error(friendlyError(error, 'Không lưu được hồ sơ khách'));
  if (!data) throw new Error('Bạn không có quyền sửa hồ sơ này');
}

export async function deleteCustomer(id) {
  const { error, count } = await supabase.from('customers').delete({ count: 'exact' }).eq('id', id);
  if (error) {
    if (error.code === '23503') throw new Error('Khách đã có đơn hàng nên không xoá được. Hãy chuyển sang "Ngừng giao dịch".');
    throw new Error(friendlyError(error, 'Không xoá được hồ sơ khách'));
  }
  if (count === 0) throw new Error('Bạn không có quyền xoá hồ sơ này');
}

export async function getCustomerPrices(customerId) {
  const { data, error } = await supabase.from('customer_prices').select('product_id, price').eq('customer_id', customerId);
  if (error) throw new Error(friendlyError(error, 'Không tải được bảng giá của khách'));
  return data;
}

/** Lưu các giá đã đổi. changes: [{product_id, price}]. Trả về số dòng đã đổi. */
export async function saveCustomerPrices(customerId, changes) {
  const { data, error } = await supabase.rpc('set_customer_prices', { p_customer_id: customerId, p_prices: changes });
  if (error) throw new Error(friendlyError(error, 'Không lưu được bảng giá'));
  return data;
}
