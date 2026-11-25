-- Quay lui migration 20261125081550_phase5_expenses_reports
-- CẢNH BÁO: XOÁ toàn bộ chi phí đã nhập. Sao lưu trước:
--   create table backup_expenses as table public.expenses;
drop function if exists public.report_overview(date, date, boolean);
drop table if exists public.expenses;
