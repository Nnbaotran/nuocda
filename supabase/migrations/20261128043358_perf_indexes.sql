-- Tối ưu hiệu năng theo gợi ý của Supabase (25/11/2026). Không đổi dữ liệu.
-- 1. Thêm chỉ mục cho các khoá ngoại còn thiếu (giúp kiểm tra ràng buộc / lọc nhanh khi dữ liệu lớn).
-- 2. Bỏ chỉ mục lower(name) trên customers: app sắp xếp theo name (không dùng lower) nên chỉ mục này không bao giờ được dùng.
-- Quay lui: supabase/rollback/20261128043358_down.sql
create index if not exists orders_created_by_idx on public.orders (created_by);
create index if not exists payments_created_by_idx on public.payments (created_by);
create index if not exists expenses_created_by_idx on public.expenses (created_by);
create index if not exists payroll_employee_idx on public.payroll (employee_id);
-- Báo cáo & danh sách đơn lọc theo trạng thái + ngày
create index if not exists orders_status_date_idx on public.orders (status, order_date);
drop index if exists public.customers_name_idx;
