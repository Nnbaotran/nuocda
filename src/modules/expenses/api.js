import { friendlyError, supabase } from '../../lib/supabase.js';

const fail = (error, fallback) => {
  throw new Error(friendlyError(error, fallback));
};

/** filters: { from, to ('yyyy-mm-dd' | null), category ('' = tất cả) } */
export async function listExpenses({ from, to, category } = {}) {
  let q = supabase.from('expenses').select('id, expense_date, category, amount, note').order('expense_date', { ascending: false }).order('created_at', { ascending: false });
  if (from) q = q.gte('expense_date', from);
  if (to) q = q.lte('expense_date', to);
  if (category) q = q.eq('category', category);
  const { data, error } = await q;
  if (error) fail(error, 'Không tải được chi phí');
  return data;
}
export async function createExpense(v) {
  const { error } = await supabase.from('expenses').insert(v);
  if (error) fail(error, 'Không lưu được chi phí');
}
export async function updateExpense(id, v) {
  const { data, error } = await supabase.from('expenses').update(v).eq('id', id).select('id').maybeSingle();
  if (error) fail(error, 'Không lưu được chi phí');
  if (!data) throw new Error('Bạn không có quyền sửa khoản này');
}
export async function deleteExpense(id) {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) fail(error, 'Không xoá được chi phí');
}
