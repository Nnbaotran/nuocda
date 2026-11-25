// Đổi lỗi kỹ thuật của Supabase/Postgres thành câu tiếng Việt dễ hiểu (dùng chung cho mọi module).

export function friendlyError(error, fallback = 'Có lỗi xảy ra, vui lòng thử lại') {
  if (!error) return fallback;
  const msg = String(error.message ?? error);
  const code = error.code;
  if (/Failed to fetch|NetworkError|network|Load failed|dynamically imported module/i.test(msg)) return 'Mất kết nối mạng, kiểm tra Internet rồi thử lại';
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

/** Ném lỗi tiếng Việt (dùng trong các file api). */
export function throwFriendly(error, fallback) {
  throw new Error(friendlyError(error, fallback));
}
