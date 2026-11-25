-- Quay lui 20261125074000_single_owner_only: cho tài khoản đang hoạt động (kể cả STAFF) xem lại dữ liệu.
drop policy if exists "products_select_owner" on public.products;
create policy "products_select_active_users" on public.products
  for select to authenticated using ((select public.is_active_user()));

drop policy if exists "customers_select_owner" on public.customers;
create policy "customers_select_active_users" on public.customers
  for select to authenticated using ((select public.is_active_user()));

drop policy if exists "customer_prices_select_owner" on public.customer_prices;
create policy "customer_prices_select_active_users" on public.customer_prices
  for select to authenticated using ((select public.is_active_user()));
