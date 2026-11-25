-- Quay lui migration 20261125075626_phase3_orders_debt
-- CẢNH BÁO: XOÁ TOÀN BỘ đơn hàng, phiếu thu nợ và nhật ký. Sao lưu trước:
--   create table backup_orders as table public.orders;
--   create table backup_order_items as table public.order_items;
--   create table backup_payments as table public.payments;
--   create table backup_audit_logs as table public.audit_logs;

drop view if exists public.customer_balances;
drop function if exists public.customer_ledger(uuid, date, date);
drop function if exists public.cancel_payment(uuid, text);
drop function if exists public.record_payment(uuid, bigint, date, text);
drop function if exists public.cancel_order(uuid, text);
drop function if exists public.update_order(uuid, jsonb, bigint, text, timestamptz);
drop function if exists public.create_order(uuid, jsonb, bigint, text, timestamptz);
drop function if exists public._order_snapshot(uuid);
drop function if exists public._prepare_order_items(uuid, jsonb, uuid[]);
drop function if exists public._customer_balance(uuid);
drop function if exists public._vnd(bigint);
drop function if exists public._require_owner();
drop table if exists public.audit_logs;
drop table if exists public.payments;
drop table if exists public.order_items;
drop table if exists public.orders;
