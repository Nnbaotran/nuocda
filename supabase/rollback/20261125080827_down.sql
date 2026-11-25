-- Quay lui migration 20261125080827_phase4_payroll
-- CẢNH BÁO: XOÁ toàn bộ nhân viên, chấm công, thưởng/phạt, bảng lương đã chốt. Sao lưu trước:
--   create table backup_employees as table public.employees;
--   create table backup_attendance as table public.attendance;
--   create table backup_salary_adjustments as table public.salary_adjustments;
--   create table backup_payroll as table public.payroll;

drop function if exists public.reopen_payroll(date, text);
drop function if exists public.close_payroll(date);
drop function if exists public.payroll_preview(date);
drop trigger if exists attendance_guard_closed on public.attendance;
drop trigger if exists salary_adjustments_guard_closed on public.salary_adjustments;
drop function if exists public._guard_closed_month();
drop function if exists public._month_closed(date);
drop table if exists public.payroll;
drop table if exists public.salary_adjustments;
drop table if exists public.attendance;
drop table if exists public.employees;
