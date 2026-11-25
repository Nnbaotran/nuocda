-- Quay lui migration 20261125062158_phase1_table_grants (app sẽ không đọc được dữ liệu sau khi chạy)
revoke select, insert, update, delete on public.products from authenticated;
revoke select on public.profiles from authenticated;
revoke update (full_name, role, is_active) on public.profiles from authenticated;
revoke select, insert, update, delete on public.profiles, public.products from service_role;
