-- Đổi yêu cầu (25/11/2026): app chỉ có MỘT tài khoản là Chủ. Nhân viên không đăng nhập
-- (chỉ là danh sách để chấm công, làm ở giai đoạn 4).
-- => Mọi dữ liệu kinh doanh chỉ Chủ được xem. Tài khoản lạ (nếu ai đó tự đăng ký) không thấy gì.
-- Quay lui: supabase/rollback/20261125074000_down.sql

drop policy "products_select_active_users" on public.products;
create policy "products_select_owner" on public.products
  for select to authenticated using ((select public.is_owner()));

drop policy "customers_select_active_users" on public.customers;
create policy "customers_select_owner" on public.customers
  for select to authenticated using ((select public.is_owner()));

drop policy "customer_prices_select_active_users" on public.customer_prices;
create policy "customer_prices_select_owner" on public.customer_prices
  for select to authenticated using ((select public.is_owner()));
