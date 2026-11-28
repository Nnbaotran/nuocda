-- Quay lui 20261128044620: bỏ nợ cũ, huỷ đơn kiểu cũ, bỏ nghỉ phép có lương.
-- Chú ý: dòng chấm công 'leave_paid' sẽ đổi thành 'leave' (0 công) trước khi bỏ.
update public.attendance set status = 'leave', units = 0 where status = 'leave_paid';
alter table public.attendance drop constraint attendance_status_check;
alter table public.attendance add constraint attendance_status_check
  check (status in ('present', 'half', 'absent', 'leave'));

drop function public.cancel_order(uuid, text);
create or replace function public.cancel_order(p_order_id uuid, p_reason text default '')
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
  if v_order.status <> 'active' then raise exception 'Đơn này đã huỷ trước đó'; end if;

  update public.orders
  set status = 'cancelled', cancelled_at = now(), cancel_reason = left(trim(coalesce(p_reason, '')), 300)
  where id = p_order_id;

  insert into public.audit_logs (entity, entity_id, action, changes)
  values ('order', p_order_id, 'cancel',
          jsonb_build_object('before', public._order_snapshot(p_order_id) || jsonb_build_object('status', 'active'),
                             'reason', trim(coalesce(p_reason, ''))));
end;
$$;
revoke execute on function public.cancel_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated;

drop function public.set_opening_debt(uuid, bigint, date);
drop function public.create_customer(text, text, text, text, jsonb, bigint, date);
create or replace function public.create_customer(
  p_name text, p_phone text, p_address text, p_note text, p_prices jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_owner() then
    raise exception 'Chỉ Chủ mới được tạo hồ sơ khách' using errcode = '42501';
  end if;
  if p_prices is not null and jsonb_typeof(p_prices) <> 'array' then
    raise exception 'Bảng giá gửi lên không hợp lệ';
  end if;

  insert into public.customers (name, phone, address, note)
  values (trim(p_name), trim(coalesce(p_phone, '')), trim(coalesce(p_address, '')), trim(coalesce(p_note, '')))
  returning id into v_id;

  insert into public.customer_prices (customer_id, product_id, price)
  select v_id, p.id, coalesce(x.price, p.price)
  from public.products p
  left join jsonb_to_recordset(coalesce(p_prices, '[]'::jsonb)) as x(product_id uuid, price bigint)
    on x.product_id = p.id;

  return v_id;
end;
$$;
revoke execute on function public.create_customer(text, text, text, text, jsonb) from public, anon;
grant execute on function public.create_customer(text, text, text, text, jsonb) to authenticated;

create or replace function public._customer_balance(p_customer_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select sum(o.total - o.paid) from public.orders o
              where o.customer_id = p_customer_id and o.status = 'active'), 0)
  - coalesce((select sum(p.amount) from public.payments p
              where p.customer_id = p_customer_id and p.status = 'active'), 0);
$$;
create or replace function public.customer_ledger(p_customer_id uuid, p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_opening bigint := 0;
  v_entries jsonb;
begin
  perform public._require_owner();
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'Ngày bắt đầu phải trước ngày kết thúc';
  end if;

  if p_from is not null then
    v_opening :=
        coalesce((select sum(o.total - o.paid) from public.orders o
                  where o.customer_id = p_customer_id and o.status = 'active'
                    and (o.order_date at time zone 'Asia/Ho_Chi_Minh')::date < p_from), 0)
      - coalesce((select sum(p.amount) from public.payments p
                  where p.customer_id = p_customer_id and p.status = 'active' and p.paid_on < p_from), 0);
  end if;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.date, e.created_at), '[]'::jsonb) into v_entries
  from (
    select (o.order_date at time zone 'Asia/Ho_Chi_Minh')::date as date, 'order' as kind, o.id, o.code,
           o.total, o.paid, (o.total - o.paid) as increase, 0::bigint as decrease, o.note, o.order_date as created_at
    from public.orders o
    where o.customer_id = p_customer_id and o.status = 'active' and o.total > o.paid
    union all
    select p.paid_on, 'payment', p.id, null, null, null, 0::bigint, p.amount, p.note, p.created_at
    from public.payments p
    where p.customer_id = p_customer_id and p.status = 'active'
  ) e
  where (p_from is null or e.date >= p_from) and (p_to is null or e.date <= p_to);

  return jsonb_build_object('opening', v_opening, 'entries', v_entries);
end;
$$;
create or replace function public.report_overview(p_from date default null, p_to date default null, p_include_payroll boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tz constant text := 'Asia/Ho_Chi_Minh';
  v_today date := (now() at time zone tz)::date;
  v_from date;
  v_to date := coalesce(p_to, v_today);
  v_gran text;
  v_summary jsonb;
  v_by_customer jsonb;
  v_by_product jsonb;
  v_series jsonb;
begin
  perform public._require_owner();
  v_from := coalesce(p_from,
                     least((select min((o.order_date at time zone tz)::date) from public.orders o),
                           (select min(e.expense_date) from public.expenses e)),
                     v_to);
  if v_from > v_to then raise exception 'Ngày bắt đầu phải trước ngày kết thúc'; end if;
  v_gran := case when v_to - v_from <= 62 then 'day' else 'month' end;

  -- Tổng quan
  with o as (
    select * from public.orders o
    where o.status = 'active' and (o.order_date at time zone tz)::date between v_from and v_to
  ), s as (
    select
      coalesce((select sum(total) from o), 0) as revenue,
      (select count(*) from o) as order_count,
      coalesce((select sum(paid) from o), 0)
        + coalesce((select sum(p.amount) from public.payments p
                    where p.status = 'active' and p.paid_on between v_from and v_to), 0) as collected,
      coalesce((select sum(e.amount) from public.expenses e where e.expense_date between v_from and v_to), 0) as expenses,
      case when p_include_payroll then
        coalesce((select sum(pr.net_pay) from public.payroll pr where pr.month between v_from and v_to), 0)
      else 0 end as payroll,
      coalesce((select sum(x.total - x.paid) from public.orders x
                where x.status = 'active' and (x.order_date at time zone tz)::date <= v_to), 0)
        - coalesce((select sum(p.amount) from public.payments p
                    where p.status = 'active' and p.paid_on <= v_to), 0) as receivable
  )
  select jsonb_build_object(
    'revenue', revenue, 'order_count', order_count, 'collected', collected,
    'expenses', expenses, 'payroll', payroll, 'profit', revenue - expenses - payroll,
    'receivable', receivable,
    'payroll_open_months', (  -- tháng trong khoảng chưa chốt lương (để nhắc)
      select coalesce(jsonb_agg(to_char(m, 'YYYY-MM') order by m), '[]'::jsonb)
      from generate_series(date_trunc('month', v_from::timestamp), v_to::timestamp, interval '1 month') m
      where m::date >= v_from
        and not exists (select 1 from public.payroll pr where pr.month = m::date)))
  into v_summary from s;

  -- Theo khách: khách có đơn / trả nợ trong khoảng, hoặc còn nợ tính đến cuối khoảng
  with o as (
    select * from public.orders o
    where o.status = 'active' and (o.order_date at time zone tz)::date between v_from and v_to
  ), c as (
    select cu.id, cu.name,
      coalesce((select sum(total) from o where o.customer_id = cu.id), 0) as revenue,
      (select count(*) from o where o.customer_id = cu.id) as order_count,
      coalesce((select sum(paid) from o where o.customer_id = cu.id), 0)
        + coalesce((select sum(p.amount) from public.payments p
                    where p.customer_id = cu.id and p.status = 'active' and p.paid_on between v_from and v_to), 0) as collected,
      coalesce((select sum(x.total - x.paid) from public.orders x
                where x.customer_id = cu.id and x.status = 'active' and (x.order_date at time zone tz)::date <= v_to), 0)
        - coalesce((select sum(p.amount) from public.payments p
                    where p.customer_id = cu.id and p.status = 'active' and p.paid_on <= v_to), 0) as debt
    from public.customers cu
  )
  select coalesce(jsonb_agg(to_jsonb(c) order by c.revenue desc, c.debt desc, c.name), '[]'::jsonb)
  into v_by_customer
  from c where c.revenue <> 0 or c.collected <> 0 or c.debt <> 0;

  -- Theo sản phẩm (tên/đơn vị lấy theo lần bán gần nhất)
  select coalesce(jsonb_agg(to_jsonb(t) order by t.revenue desc, t.name), '[]'::jsonb)
  into v_by_product
  from (
    select i.product_id,
      (array_agg(i.product_name order by o.order_date desc))[1] as name,
      (array_agg(i.unit order by o.order_date desc))[1] as unit,
      sum(i.quantity) as quantity,
      sum(i.line_total) as revenue,
      count(distinct o.id) as order_count
    from public.order_items i
    join public.orders o on o.id = i.order_id
    where o.status = 'active' and (o.order_date at time zone tz)::date between v_from and v_to
    group by i.product_id
  ) t;

  -- Theo thời gian (ngày nếu ≤ 62 ngày, ngược lại theo tháng). Lương đặt vào ngày/tháng đầu của tháng lương.
  with b as (
    select g::date as k_start,
      case when v_gran = 'day' then g::date else least((g + interval '1 month - 1 day')::date, v_to) end as k_end
    from generate_series(case when v_gran = 'day' then v_from::timestamp else date_trunc('month', v_from::timestamp) end,
                         v_to::timestamp,
                         case when v_gran = 'day' then interval '1 day' else interval '1 month' end) g
  ), r as (
    select b.k_start,
      coalesce((select sum(o.total) from public.orders o
                where o.status = 'active'
                  and (o.order_date at time zone tz)::date between greatest(b.k_start, v_from) and b.k_end), 0) as revenue,
      coalesce((select sum(e.amount) from public.expenses e
                where e.expense_date between greatest(b.k_start, v_from) and b.k_end), 0) as expenses,
      case when p_include_payroll then
        coalesce((select sum(pr.net_pay) from public.payroll pr
                  where pr.month between greatest(b.k_start, v_from) and b.k_end), 0)
      else 0 end as payroll
    from b
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', case when v_gran = 'day' then to_char(r.k_start, 'YYYY-MM-DD') else to_char(r.k_start, 'YYYY-MM') end,
           'revenue', r.revenue, 'expenses', r.expenses, 'payroll', r.payroll,
           'profit', r.revenue - r.expenses - r.payroll) order by r.k_start), '[]'::jsonb)
  into v_series from r;

  return jsonb_build_object(
    'range', jsonb_build_object('from', v_from, 'to', v_to, 'include_payroll', p_include_payroll),
    'granularity', v_gran,
    'summary', v_summary,
    'by_customer', v_by_customer,
    'by_product', v_by_product,
    'series', v_series);
end;
$$;
drop view public.customer_balances;
create view public.customer_balances with (security_invoker = true) as
select c.id as customer_id,
  coalesce((select sum(o.total - o.paid) from public.orders o
            where o.customer_id = c.id and o.status = 'active'), 0)
  - coalesce((select sum(p.amount) from public.payments p
              where p.customer_id = c.id and p.status = 'active'), 0) as balance
from public.customers c;
revoke all on public.customer_balances from anon, authenticated;
grant select on public.customer_balances to authenticated, service_role;

revoke insert, update on public.customers from authenticated;
grant insert, update on public.customers to authenticated;
alter table public.customers drop column opening_debt, drop column opening_debt_date;
