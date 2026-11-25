-- Quay lui migration 20261125063110_phase2_customers_prices
-- CẢNH BÁO: XOÁ toàn bộ hồ sơ khách và giá riêng. Sao lưu trước:
--   create table backup_customers as table public.customers;
--   create table backup_customer_prices as table public.customer_prices;

drop function if exists public.set_customer_prices(uuid, jsonb);
drop function if exists public.create_customer(text, text, text, text, jsonb);
drop trigger if exists products_add_to_customers on public.products;
drop function if exists public.add_product_to_all_customers();
drop table if exists public.customer_prices;
drop table if exists public.customers;
