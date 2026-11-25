// Edge Function: Chủ tạo tài khoản đăng nhập cho nhân viên.
// Chạy trên máy chủ Supabase, dùng khoá service_role có sẵn ở đó (KHÔNG bao giờ gửi xuống trình duyệt).
// Gọi từ app: supabase.functions.invoke('create-staff', { body: { email, password, full_name } })
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Phương thức không hợp lệ' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  // 1. Người gọi phải là Chủ đang hoạt động (kiểm tra bằng quyền của chính người gọi)
  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: isOwner, error: ownerErr } = await asCaller.rpc('is_owner');
  if (ownerErr || isOwner !== true) return reply(403, { error: 'Chỉ Chủ mới được tạo tài khoản' });

  // 2. Kiểm tra dữ liệu
  let body: { email?: string; password?: string; full_name?: string };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Dữ liệu gửi lên không hợp lệ' });
  }
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const fullName = String(body.full_name ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, { error: 'Email không hợp lệ' });
  if (password.length < 8) return reply(400, { error: 'Mật khẩu phải có ít nhất 8 ký tự' });
  if (fullName.length < 1 || fullName.length > 100) return reply(400, { error: 'Họ tên từ 1 đến 100 ký tự' });

  // 3. Tạo tài khoản (đã xác nhận email sẵn), rồi kích hoạt hồ sơ STAFF
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createErr || !created.user) {
    const msg = /already|registered|exists/i.test(createErr?.message ?? '')
      ? 'Email này đã có tài khoản'
      : 'Không tạo được tài khoản, vui lòng thử lại';
    return reply(400, { error: msg });
  }

  const { error: profErr } = await admin
    .from('profiles')
    .update({ full_name: fullName, role: 'STAFF', is_active: true })
    .eq('id', created.user.id);
  if (profErr) {
    // Không để lại tài khoản "mồ côi"
    await admin.auth.admin.deleteUser(created.user.id);
    return reply(500, { error: 'Không kích hoạt được hồ sơ, đã huỷ tạo tài khoản' });
  }

  return reply(200, { id: created.user.id, email });
});
