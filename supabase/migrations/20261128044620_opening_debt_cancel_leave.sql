-- 1) Nợ cũ (nợ đầu) của khách: nhập khi tạo khách, sửa được qua hàm set_opening_debt (có ghi lịch sử).
-- 2) Huỷ đơn = huỷ luôn tiền đã thu cho đơn đó: tiền trả lúc mua tự mất theo đơn; nếu khách đã trả nợ
--    bằng phiếu thu và huỷ đơn làm khách thành "trả dư", tự huỷ phiếu thu mới nhất cho đúng phần dư.
-- 3) Chấm công thêm loại "leave_paid" = nghỉ phép CÓ lương (tính 1 công). "leave" = nghỉ KHÔNG lương (0 công).
-- Quay lui: supabase/rollback/20261128044620_down.sql

alter table public.customers
  add column opening_debt bigint not null default 0 check (opening_debt between 0 and 1000000000000),
  add column opening_debt_date date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date);

-- Chỉ được đổi nợ cũ qua hàm (có kiểm tra + ghi lịch sử), không ghi thẳng vào bảng
revoke insert, update on public.customers from authenticated;
grant insert (name, phone, address, note, is_active) on public.customers to authenticated;
grant update (name, phone, address, note, is_active) on public.customers to authenticated;

create or replace function public._customer_balance(p_customer_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select c.opening_debt from public.customers c where c.id = p_customer_id), 0)
  + coalesce((select sum(o.total - o.paid) from public.orders o
              where o.customer_id = p_customer_id and o.status = 'active'), 0)
  - coalesce((select sum(p.amount) from public.payments p
              where p.customer_id = p_customer_id and p.status = 'active'), 0);
$$;

create or replace view public.customer_balances with (security_invoker = true) as
select c.id as customer_id,
  c.opening_debt
  + coalesce((select sum(o.total - o.paid) from public.orders o
            where o.customer_id = c.id and o.status = 'active'), 0)
  - coalesce((select sum(p.amount) from public.payments p
              where p.customer_id = c.id and p.status = 'active'), 0) as balance
from public.customers c;

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
        coalesce((select c.opening_debt from public.customers c
                  where c.id = p_customer_id and c.opening_debt_date < p_from), 0)
      + coalesce((select sum(o.total - o.paid) from public.orders o
                  where o.customer_id = p_customer_id and o.status = 'active'
                    and (o.order_date at time zone 'Asia/Ho_Chi_Minh')::date < p_from), 0)
      - coalesce((select sum(p.amount) from public.payments p
                  where p.customer_id = p_customer_id and p.status = 'active' and p.paid_on < p_from), 0);
  end if;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.date, e.created_at), '[]'::jsonb) into v_entries
  from (
    select c.opening_debt_date as date, 'opening' as kind, c.id, null::text as code,
           null::bigint as total, null::bigint as paid, c.opening_debt as increase, 0::bigint as decrease,
           'Nợ cũ trước khi dùng app'::text as note, '-infinity'::timestamptz as created_at
    from public.customers c
    where c.id = p_customer_id and c.opening_debt > 0
    union all
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
      coalesce((select sum(cu.opening_debt) from public.customers cu where cu.opening_debt_date <= v_to), 0)
        + coalesce((select sum(x.total - x.paid) from public.orders x
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
      (case when cu.opening_debt_date <= v_to then cu.opening_debt else 0 end)
        + coalesce((select sum(x.total - x.paid) from public.orders x
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

-- Tạo khách (thêm nợ cũ). Bỏ bản cũ 5 tham số; gọi kiểu cũ vẫn chạy nhờ giá trị mặc định.
drop function public.create_customer(text, text, text, text, jsonb);
create function public.create_customer(
  p_name text, p_phone text, p_address text, p_note text, p_prices jsonb,
  p_opening_debt bigint default 0, p_opening_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_id uuid;
begin
  perform public._require_owner();
  if p_prices is not null and jsonb_typeof(p_prices) <> 'array' then
    raise exception 'Bảng giá gửi lên không hợp lệ';
  end if;
  if coalesce(p_opening_debt, 0) < 0 then raise exception 'Nợ cũ không được âm'; end if;
  if coalesce(p_opening_date, v_today) > v_today then raise exception 'Ngày nợ cũ không được ở tương lai'; end if;

  insert into public.customers (name, phone, address, note, opening_debt, opening_debt_date)
  values (trim(p_name), trim(coalesce(p_phone, '')), trim(coalesce(p_address, '')), trim(coalesce(p_note, '')),
          coalesce(p_opening_debt, 0), coalesce(p_opening_date, v_today))
  returning id into v_id;

  insert into public.customer_prices (customer_id, product_id, price)
  select v_id, p.id, coalesce(x.price, p.price)
  from public.products p
  left join jsonb_to_recordset(coalesce(p_prices, '[]'::jsonb)) as x(product_id uuid, price bigint)
    on x.product_id = p.id;

  if coalesce(p_opening_debt, 0) > 0 then
    insert into public.audit_logs (entity, entity_id, action, changes)
    values ('customer', v_id, 'opening_debt',
            jsonb_build_object('before', 0, 'after', p_opening_debt, 'date', coalesce(p_opening_date, v_today)));
  end if;
  return v_id;
end;
$$;
revoke execute on function public.create_customer(text, text, text, text, jsonb, bigint, date) from public, anon;
grant execute on function public.create_customer(text, text, text, text, jsonb, bigint, date) to authenticated;

-- Sửa nợ cũ của khách đã có (không cho sửa làm khách thành "trả dư").
create or replace function public.set_opening_debt(p_customer_id uuid, p_amount bigint, p_date date default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_c public.customers%rowtype;
  v_balance bigint;
begin
  perform public._require_owner();
  if p_amount is null or p_amount < 0 then raise exception 'Nợ cũ không được âm'; end if;
  if p_amount > 1000000000000 then raise exception 'Số tiền quá lớn'; end if;
  if coalesce(p_date, v_today) > v_today then raise exception 'Ngày nợ cũ không được ở tương lai'; end if;
  perform pg_advisory_xact_lock(hashtext('customer_money:' || p_customer_id::text));
  select * into v_c from public.customers where id = p_customer_id for update;
  if not found then raise exception 'Không tìm thấy khách hàng'; end if;

  update public.customers set opening_debt = p_amount, opening_debt_date = coalesce(p_date, v_c.opening_debt_date)
  where id = p_customer_id;
  v_balance := public._customer_balance(p_customer_id);
  if v_balance < 0 then
    raise exception 'Nợ cũ này nhỏ hơn số khách đã trả (khách sẽ thành trả dư %). Kiểm tra lại số tiền.', public._vnd(-v_balance);
  end if;

  insert into public.audit_logs (entity, entity_id, action, changes)
  values ('customer', p_customer_id, 'opening_debt',
          jsonb_build_object('before', v_c.opening_debt, 'after', p_amount,
                             'date', coalesce(p_date, v_c.opening_debt_date)));
  return v_balance;
end;
$$;
revoke execute on function public.set_opening_debt(uuid, bigint, date) from public, anon;
grant execute on function public.set_opening_debt(uuid, bigint, date) to authenticated;

-- Huỷ đơn: huỷ luôn tiền đã thu của đơn. Trả về số tiền phải hoàn cho khách.
drop function public.cancel_order(uuid, text);
create function public.cancel_order(p_order_id uuid, p_reason text default '')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_pay public.payments%rowtype;
  v_need bigint;
  v_refund bigint := 0;
  v_count int := 0;
begin
  perform public._require_owner();
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Không tìm thấy đơn hàng'; end if;
  if v_order.status <> 'active' then raise exception 'Đơn này đã huỷ trước đó'; end if;
  perform pg_advisory_xact_lock(hashtext('customer_money:' || v_order.customer_id::text));

  update public.orders
  set status = 'cancelled', cancelled_at = now(), cancel_reason = left(trim(coalesce(p_reason, '')), 300)
  where id = p_order_id;

  insert into public.audit_logs (entity, entity_id, action, changes)
  values ('order', p_order_id, 'cancel',
          jsonb_build_object('before', public._order_snapshot(p_order_id) || jsonb_build_object('status', 'active'),
                             'reason', trim(coalesce(p_reason, ''))));

  -- Khách thành "trả dư" -> huỷ phiếu thu mới nhất cho đúng phần dư
  v_need := -public._customer_balance(v_order.customer_id);
  if v_need > 0 then
    for v_pay in
      select * from public.payments
      where customer_id = v_order.customer_id and status = 'active'
      order by paid_on desc, created_at desc
      for update
    loop
      exit when v_need <= 0;
      update public.payments
      set status = 'cancelled', cancelled_at = now(), cancel_reason = left('Huỷ theo đơn ' || v_order.code, 300)
      where id = v_pay.id;
      insert into public.audit_logs (entity, entity_id, action, changes)
      values ('payment', v_pay.id, 'cancel',
              jsonb_build_object('amount', v_pay.amount, 'paid_on', v_pay.paid_on, 'note', v_pay.note,
                                 'reason', 'Huỷ theo đơn ' || v_order.code));
      v_count := v_count + 1;
      if v_pay.amount > v_need then
        -- Phiếu lớn hơn phần dư: giữ lại phần còn lại thành phiếu mới, cùng ngày
        insert into public.payments (customer_id, amount, paid_on, note, created_by)
        values (v_order.customer_id, v_pay.amount - v_need, v_pay.paid_on,
                left('Phần còn lại sau khi huỷ đơn ' || v_order.code || case when v_pay.note <> '' then ' – ' || v_pay.note else '' end, 300),
                v_pay.created_by);
        v_refund := v_refund + v_need;
        v_need := 0;
      else
        v_refund := v_refund + v_pay.amount;
        v_need := v_need - v_pay.amount;
      end if;
    end loop;
  end if;

  return jsonb_build_object('paid_in_order', v_order.paid, 'payments_refund', v_refund, 'payments_cancelled', v_count);
end;
$$;
revoke execute on function public.cancel_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated;

-- Nghỉ phép có lương
alter table public.attendance drop constraint attendance_status_check;
alter table public.attendance add constraint attendance_status_check
  check (status in ('present', 'half', 'absent', 'leave', 'leave_paid'));
