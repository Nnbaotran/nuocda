// Kiểm tra dữ liệu khi Chủ tạo tài khoản nhân viên (máy chủ cũng kiểm tra lại).

export function validateStaffAccount(input) {
  const errors = {};
  const full_name = String(input.full_name ?? '').trim();
  const email = String(input.email ?? '').trim().toLowerCase();
  const password = String(input.password ?? '');

  if (!full_name) errors.full_name = 'Vui lòng nhập họ tên';
  else if (full_name.length > 100) errors.full_name = 'Họ tên tối đa 100 ký tự';

  if (!email) errors.email = 'Vui lòng nhập email';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Email không hợp lệ';

  if (password.length < 8) errors.password = 'Mật khẩu phải có ít nhất 8 ký tự';

  const ok = Object.keys(errors).length === 0;
  return { ok, errors, value: ok ? { full_name, email, password } : null };
}
