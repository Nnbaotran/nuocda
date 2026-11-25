// Kết nối Supabase — TẢI SAU (lazy): thư viện supabase-js chiếm hơn nửa dung lượng app,
// nên không bắt điện thoại tải nó trước khi vẽ màn hình. Gọi `await db()` để lấy client;
// lần đầu sẽ tải thư viện, các lần sau dùng lại ngay.
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config.js';

let clientPromise = null;

export function db() {
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    }),
  );
  return clientPromise;
}

/** Bắt đầu tải thư viện ở nền (không chờ). */
export function preloadDb() {
  db().catch(() => {
    /* lỗi mạng sẽ được báo khi thật sự gọi db() */
  });
}

/** Khoá lưu phiên đăng nhập của supabase-js trong localStorage (mặc định: sb-<mã dự án>-auth-token). */
export function sessionStorageKey() {
  try {
    return `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
  } catch {
    return '';
  }
}

export { friendlyError, throwFriendly } from './errors.js';
