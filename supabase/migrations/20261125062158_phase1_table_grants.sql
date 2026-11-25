-- Giai đoạn 1 (phần 3): cấp quyền bảng tối thiểu.
-- Dự án Supabase này KHÔNG tự cấp quyền SELECT/INSERT... cho bảng mới, nên phải cấp tay.
-- Quyền bảng chỉ là "cửa ngoài"; từng dòng dữ liệu vẫn do RLS (policy) quyết định.
-- Quy ước cho mọi bảng sau này: revoke hết của anon, chỉ grant cho authenticated đúng thao tác cần.
-- Quay lui: supabase/rollback/20261125062158_down.sql

revoke all on public.profiles, public.products from anon;
revoke truncate, references, trigger on public.profiles, public.products from authenticated;

grant select, insert, update, delete on public.products to authenticated;

-- Hồ sơ: chỉ đọc và sửa 3 cột (tên, vai trò, trạng thái). Tạo/xoá do hệ thống làm.
grant select on public.profiles to authenticated;
grant update (full_name, role, is_active) on public.profiles to authenticated;

-- Máy chủ (Edge Function dùng service_role) cần toàn quyền để tạo tài khoản nhân viên.
grant all on public.profiles, public.products to service_role;
