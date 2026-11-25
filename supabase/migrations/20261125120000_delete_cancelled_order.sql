-- Cho phép xoá hẳn đơn ĐÃ HUỶ khỏi lịch sử đơn hàng (yêu cầu 25/11/2026).
-- Chỉ đơn đã huỷ mới xoá được (đơn đã huỷ vốn không còn tính vào doanh thu/công nợ, nên xoá không làm lệch tiền).
-- Bản chụp đơn được giữ lại trong audit_logs để tra cứu khi cần.
-- Quay lui: supabase/rollback/20261125120000_down.sql

create or replace function public.delete_cancelled_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  perform public._require_owner();
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Không tìm thấy đơn hàng'; end if;
  if v_order.status <> 'cancelled' then
    raise exception 'Chỉ xoá được đơn đã huỷ. Hãy huỷ đơn trước.';
  end if;

  insert into public.audit_logs (entity, entity_id, action, changes)
  values ('order', p_order_id, 'delete',
          jsonb_build_object('code', v_order.code, 'customer_id', v_order.customer_id,
                             'cancel_reason', v_order.cancel_reason, 'snapshot', public._order_snapshot(p_order_id)));
  delete from public.orders where id = p_order_id;  -- chi tiết đơn tự xoá theo
end;
$$;

revoke execute on function public.delete_cancelled_order(uuid) from public, anon;
grant execute on function public.delete_cancelled_order(uuid) to authenticated;
