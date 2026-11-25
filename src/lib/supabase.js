import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Đổi lỗi kỹ thuật của Supabase/Postgres thành câu tiếng Việt dễ hiểu. */
export function friendlyError(error, fallback = 'Có lỗi xảy ra, vui lòng thử lại') {
  if (!error) return fallback;
  const msg = String(error.message ?? error);
  const code = error.code;
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Mất kết nối mạng, kiểm tra Internet rồi thử lại';
  if (/Invalid login credentials/i.test(msg)) return 'Sai email hoặc mật khẩu';
  if (/Email not confirmed/i.test(msg)) return 'Email chưa được xác nhận';
  if (/JWT expired|session/i.test(msg)) return 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại';
  if (code === '23505') return 'Dữ liệu bị trùng (ví dụ mã SKU đã tồn tại)';
  if (code === '23503') return 'Dữ liệu đang được dùng ở nơi khác nên không xoá được';
  if (code === '23514') return 'Dữ liệu không hợp lệ (ngoài giới hạn cho phép)';
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) return 'Bạn không có quyền thực hiện thao tác này';
  if (code === 'P0001' && msg) return msg; // lỗi do database tự báo bằng tiếng Việt
  return fallback;
}
