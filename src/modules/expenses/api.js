import { db, throwFriendly } from '../../lib/supabase.js';


/** filters: { from, to ('yyyy-mm-dd' | null), category ('' = tất cả) } */
export async function listExpenses({ from, to, category } = {}) {
  const sb = await db();
  let q = sb.from('expenses').select('id, expense_date, category, amount, note').order('expense_date', { ascending: false }).order('created_at', { ascending: false });
  if (from) q = q.gte('expense_date', from);
  if (to) q = q.lte('expense_date', to);
  if (category) q = q.eq('category', category);
  const { data, error } = await q;
  if (error) throwFriendly(error, 'Không tải được chi phí');
  return data;
}
export async function createExpense(v) {
  const sb = await db();
  const { error } = await sb.from('expenses').insert(v);
  if (error) throwFriendly(error, 'Không lưu được chi phí');
}
export async function updateExpense(id, v) {
  const sb = await db();
  const { data, error } = await sb.from('expenses').update(v).eq('id', id).select('id').maybeSingle();
  if (error) throwFriendly(error, 'Không lưu được chi phí');
  if (!data) throw new Error('Bạn không có quyền sửa khoản này');
}
export async function deleteExpense(id) {
  const sb = await db();
  const { error } = await sb.from('expenses').delete().eq('id', id);
  if (error) throwFriendly(error, 'Không xoá được chi phí');
}
