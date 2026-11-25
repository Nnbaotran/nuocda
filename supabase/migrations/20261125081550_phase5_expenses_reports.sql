-- Giai đoạn 5: chi phí + báo cáo.
-- Báo cáo tổng hợp hoàn toàn trong database (hàm report_overview), app chỉ hiển thị.
--
-- Định nghĩa số liệu (ngày theo giờ Việt Nam, chỉ tính đơn/phiếu thu CÒN HIỆU LỰC):
--   Doanh thu      = Σ tổng tiền các đơn trong khoảng ngày
--   Đã thu         = Σ tiền khách trả lúc mua (đơn trong khoảng) + Σ phiếu thu nợ trong khoảng
--   Chi phí        = Σ chi phí trong khoảng (+ lương nếu chọn "tính lương")
--   Lương          = Σ thực lĩnh của bảng lương ĐÃ CHỐT, tháng có ngày 1 nằm trong khoảng
--   Lợi nhuận      = Doanh thu − Chi phí (− Lương nếu chọn)
--   Công nợ phải thu = tổng nợ của mọi khách tính đến hết ngày cuối khoảng
-- Quay lui: supabase/rollback/20261125081550_down.sql

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category text not null check (category in ('electricity', 'water', 'fuel', 'transport', 'repair', 'other')),
  amount bigint not null check (amount > 0 and amount <= 10000000000),
  note text not null default '' check (length(note) <= 300),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index expenses_date_idx on public.expenses (expense_date);
create trigger expenses_touch before update on public.expenses
for each row execute function public.touch_updated_at();

alter table public.expenses enable row level security;
create policy "expenses_owner_all" on public.expenses for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
revoke all on public.expenses from anon, authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant all on public.expenses to service_role;

-- Báo cáo. p_from/p_to null = từ đơn đầu tiên / đến hôm nay.
-- Trả về { range, granularity, summary, by_customer, by_product, series }
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

revoke execute on function public.report_overview(date, date, boolean) from public, anon;
grant execute on function public.report_overview(date, date, boolean) to authenticated;
