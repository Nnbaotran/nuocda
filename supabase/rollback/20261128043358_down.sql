-- Quay lui 20261125131000_perf_indexes (chỉ là chỉ mục, không ảnh hưởng dữ liệu)
drop index if exists public.orders_created_by_idx;
drop index if exists public.payments_created_by_idx;
drop index if exists public.expenses_created_by_idx;
drop index if exists public.payroll_employee_idx;
drop index if exists public.orders_status_date_idx;
create index if not exists customers_name_idx on public.customers (lower(name));
