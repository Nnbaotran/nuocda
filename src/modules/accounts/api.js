import { friendlyError, supabase } from '../../lib/supabase.js';

export async function listAccounts() {
  const { data, error } = await supabase.from('profiles').select('id, full_name, role, is_active, created_at').order('created_at');
  if (error) throw new Error(friendlyError(error, 'Không tải được danh sách tài khoản'));
  return data;
}

export async function updateAccount(id, patch) {
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', id).select('id').maybeSingle();
  if (error) throw new Error(friendlyError(error, 'Không lưu được tài khoản'));
  if (!data) throw new Error('Bạn không có quyền sửa tài khoản này');
}

/** Gọi Edge Function trên máy chủ (dùng khoá bí mật ở đó) để tạo tài khoản nhân viên. */
export async function createStaffAccount({ email, password, full_name }) {
  const { data, error } = await supabase.functions.invoke('create-staff', { body: { email, password, full_name } });
  if (error) {
    let msg = 'Không tạo được tài khoản, vui lòng thử lại';
    try {
      const body = await error.context?.json?.();
      if (body?.error) msg = body.error;
    } catch {
      /* giữ thông báo mặc định */
    }
    throw new Error(msg);
  }
  return data;
}
