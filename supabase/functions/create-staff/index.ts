// ĐÃ NGỪNG (25/11/2026): app chỉ có 1 tài khoản Chủ, không tạo tài khoản nhân viên nữa.
// Hàm này luôn từ chối. Có thể xoá hẳn trong Supabase > Edge Functions > create-staff > Delete.
Deno.serve(() =>
  new Response(JSON.stringify({ error: 'Chức năng đã ngừng' }), {
    status: 410,
    headers: { 'Content-Type': 'application/json' },
  }),
);
