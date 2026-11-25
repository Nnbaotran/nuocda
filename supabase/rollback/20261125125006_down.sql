-- Quay lui 20261125125006_delete_cancelled_order (đơn đã xoá không khôi phục được; bản chụp nằm trong audit_logs)
drop function if exists public.delete_cancelled_order(uuid);
