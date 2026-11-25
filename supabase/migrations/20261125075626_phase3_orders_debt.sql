-- Giai đoạn 3: đơn hàng + công nợ.
--
-- Nguyên tắc giữ tiền không lệch:
-- * Bảng orders / order_items / payments / audit_logs: app CHỈ ĐƯỢC ĐỌC. Mọi thao tác ghi
--   đi qua các hàm dưới đây (mỗi hàm = MỘT giao dịch, lỗi giữa chừng thì không lưu gì).
-- * Tổng đơn do database tự tính từ chi tiết (số lượng × đơn giá), không tin số từ app.
-- * Giá bán được CHỤP vào chi tiết đơn lúc bán; đổi giá sau này không làm đổi đơn cũ.
-- * Công nợ của khách = Σ(tổng đơn − đã trả) của đơn còn hiệu lực − Σ phiếu thu còn hiệu lực.
--   Huỷ đơn / huỷ phiếu thu = đổi trạng thái (không xoá), tự hoàn lại doanh thu và công nợ.
-- * Sửa / huỷ đơn, huỷ phiếu thu đều ghi audit_logs (ai, lúc nào, trước/sau).
-- * Ngày tính theo giờ Việt Nam.
-- Quay lui: supabase/rollback/20261125075626_down.sql

-- ===================== BẢNG =====================

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  order_date timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  total bigint not null check (total between 0 and 1000000000000),
  paid bigint not null default 0 check (paid >= 0),
  note text not null default '' check (length(note) <= 500),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancel_reason text not null default '' check (length(cancel_reason) <= 300),
  constraint orders_paid_le_total check (paid <= total)
);
create index orders_customer_date_idx on public.orders (customer_id, order_date);
create index orders_date_idx on public.orders (order_date);
create trigger orders_touch before update on public.orders
for each row execute function public.touch_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  position int not null,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,           -- chụp lại lúc bán
  unit text not null,                   -- chụp lại lúc bán
  quantity numeric(12, 2) not null check (quantity > 0 and quantity <= 100000),
  unit_price bigint not null check (unit_price between 0 and 1000000000),
  line_total bigint not null check (line_total >= 0)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  amount bigint not null check (amount > 0 and amount <= 1000000000000),
  paid_on date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
  note text not null default '' check (length(note) <= 300),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  cancelled_at timestamptz,
  cancel_reason text not null default '' check (length(cancel_reason) <= 300),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index payments_customer_date_idx on public.payments (customer_id, paid_on);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  entity text not null,
  entity_id uuid not null,
  action text not null,
  changes jsonb not null default '{}'::jsonb,
  actor uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);

-- ===================== HÀM NỘI BỘ =====================

create or replace function public._require_owner()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Chỉ Chủ mới được thao tác' using errcode = '42501';
  end if;
end;
$$;

-- 1234567 -> '1.234.567 ₫' (dùng trong thông báo lỗi)
create or replace function public._vnd(n bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(to_char(n, 'FM999,999,999,999,990'), ',', '.') || ' ₫';
$$;

-- Công nợ hiện tại của 1 khách
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

-- Kiểm tra + tính các dòng hàng. p_items: [{product_id, quantity, unit_price?}]
-- unit_price bỏ trống -> lấy giá riêng của khách, không có thì giá mặc định.
-- p_allowed_inactive: sản phẩm đang ngừng bán nhưng vẫn cho phép (khi sửa đơn cũ).
create or replace function public._prepare_order_items(
  p_customer_id uuid, p_items jsonb, p_allowed_inactive uuid[] default '{}'
)
returns table (
  "position" int, product_id uuid, product_name text, unit text,
  quantity numeric, unit_price bigint, line_total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  v_p public.products%rowtype;
  v_qty numeric;
  v_price bigint;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Đơn hàng phải có ít nhất 1 sản phẩm';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'Đơn hàng quá nhiều dòng (tối đa 100)';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
    group by e->>'product_id' having count(*) > 1
  ) then
    raise exception 'Một sản phẩm bị nhập 2 lần trong cùng đơn';
  end if;

  for r in select e.val, e.ord from jsonb_array_elements(p_items) with ordinality as e(val, ord) loop
    select * into v_p from public.products where id = (r.val->>'product_id')::uuid;
    if not found then
      raise exception 'Có sản phẩm không còn tồn tại, vui lòng tải lại trang';
    end if;
    if not v_p.is_active and not (v_p.id = any(coalesce(p_allowed_inactive, '{}'))) then
      raise exception 'Sản phẩm "%" đang ngừng bán', v_p.name;
    end if;

    v_qty := (r.val->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 100000 or v_qty <> round(v_qty, 2) then
      raise exception 'Số lượng "%" không hợp lệ (lớn hơn 0, tối đa 2 số lẻ)', v_p.name;
    end if;

    if r.val->>'unit_price' is not null then
      v_price := (r.val->>'unit_price')::bigint;
    else
      select cp.price into v_price from public.customer_prices cp
      where cp.customer_id = p_customer_id and cp.product_id = v_p.id;
      if not found then v_price := v_p.price; end if;
    end if;
    if v_price < 0 or v_price > 1000000000 then
      raise exception 'Đơn giá "%" không hợp lệ', v_p.name;
    end if;

    "position" := r.ord;
    product_id := v_p.id;
    product_name := v_p.name;
    unit := v_p.unit;
    quantity := v_qty;
    unit_price := v_price;
    line_total := round(v_qty * v_price)::bigint;
    return next;
  end loop;
end;
$$;

create or replace function public._order_snapshot(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'order_date', o.order_date, 'total', o.total, 'paid', o.paid, 'note', o.note, 'status', o.status,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('product_name', i.product_name, 'quantity', i.quantity,
                                          'unit_price', i.unit_price, 'line_total', i.line_total)
                       order by i.position)
      from public.order_items i where i.order_id = o.id), '[]'::jsonb))
  from public.orders o where o.id = p_order_id;
$$;

-- ===================== HÀM CHO APP GỌI =====================

-- Lên đơn. Trả về {id, code, total, paid}.
create or replace function public.create_order(
  p_customer_id uuid, p_items jsonb, p_paid bigint,
  p_note text default '', p_order_date timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cust public.customers%rowtype;
  v_items jsonb;
  v_total bigint;
  v_date timestamptz := coalesce(p_order_date, now());
  v_prefix text;
  v_n int;
  v_code text;
  v_id uuid;
begin
  perform public._require_owner();
  select * into v_cust from public.customers where id = p_customer_id;
  if not found then raise exception 'Không tìm thấy khách hàng'; end if;
  if not v_cust.is_active then
    raise exception 'Khách đang ngừng giao dịch, hãy cho giao dịch lại trước khi lên đơn';
  end if;
  if v_date > now() + interval '5 minutes' then
    raise exception 'Ngày đơn không được ở tương lai';
  end if;

  select jsonb_agg(to_jsonb(x)), sum(x.line_total) into v_items, v_total
  from public._prepare_order_items(p_customer_id, p_items) x;
  if v_total > 1000000000000 then raise exception 'Tổng đơn quá lớn'; end if;
  if p_paid is null or p_paid < 0 then raise exception 'Số tiền khách trả không hợp lệ'; end if;
  if p_paid > v_total then
    raise exception 'Khách trả (%) lớn hơn tổng đơn (%)', public._vnd(p_paid), public._vnd(v_total);
  end if;

  -- Mã đơn theo ngày: DH251125-001, DH251125-002...
  v_prefix := 'DH' || to_char(v_date at time zone 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-';
  perform pg_advisory_xact_lock(hashtext('order_code:' || v_prefix));
  select coalesce(max(substr(code, length(v_prefix) + 1)::int), 0) + 1 into v_n
  from public.orders where code like v_prefix || '%';
  v_code := v_prefix || lpad(v_n::text, 3, '0');

  insert into public.orders (code, customer_id, order_date, total, paid, note)
  values (v_code, p_customer_id, v_date, v_total, p_paid, trim(coalesce(p_note, '')))
  returning id into v_id;

  insert into public.order_items (order_id, "position", product_id, product_name, unit, quantity, unit_price, line_total)
  select v_id, x."position", x.product_id, x.product_name, x.unit, x.quantity, x.unit_price, x.line_total
  from jsonb_to_recordset(v_items) as x("position" int, product_id uuid, product_name text, unit text,
                                         quantity numeric, unit_price bigint, line_total bigint);

  return jsonb_build_object('id', v_id, 'code', v_code, 'total', v_total, 'paid', p_paid);
end;
$$;

-- Sửa đơn (giữ nguyên mã đơn). Ghi audit trước/sau.
create or replace function public.update_order(
  p_order_id uuid, p_items jsonb, p_paid bigint,
  p_note text default '', p_order_date timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_before jsonb;
  v_items jsonb;
  v_total bigint;
  v_allowed uuid[];
begin
  perform public._require_owner();
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Không tìm thấy đơn hàng'; end if;
  if v_order.status <> 'active' then raise exception 'Đơn đã huỷ, không sửa được'; end if;
  if p_order_date is not null and p_order_date > now() + interval '5 minutes' then
    raise exception 'Ngày đơn không được ở tương lai';
  end if;

  v_before := public._order_snapshot(p_order_id);
  select array_agg(product_id) into v_allowed from public.order_items where order_id = p_order_id;

  select jsonb_agg(to_jsonb(x)), sum(x.line_total) into v_items, v_total
  from public._prepare_order_items(v_order.customer_id, p_items, v_allowed) x;
  if v_total > 1000000000000 then raise exception 'Tổng đơn quá lớn'; end if;
  if p_paid is null or p_paid < 0 then raise exception 'Số tiền khách trả không hợp lệ'; end if;
  if p_paid > v_total then
    raise exception 'Khách trả (%) lớn hơn tổng đơn (%)', public._vnd(p_paid), public._vnd(v_total);
  end if;

  delete from public.order_items where order_id = p_order_id;
  insert into public.order_items (order_id, "position", product_id, product_name, unit, quantity, unit_price, line_total)
  select p_order_id, x."position", x.product_id, x.product_name, x.unit, x.quantity, x.unit_price, x.line_total
  from jsonb_to_recordset(v_items) as x("position" int, product_id uuid, product_name text, unit text,
                                         quantity numeric, unit_price bigint, line_total bigint);

  update public.orders
  set total = v_total, paid = p_paid, note = trim(coalesce(p_note, '')),
      order_date = coalesce(p_order_date, order_date)
  where id = p_order_id;

  insert into public.audit_logs (entity, entity_id, action, changes)
  values ('order', p_order_id, 'update',
          jsonb_build_object('before', v_before, 'after', public._order_snapshot(p_order_id)));

  return jsonb_build_object('id', p_order_id, 'code', v_order.code, 'total', v_total, 'paid', p_paid);
end;
$$;

-- Huỷ đơn: không xoá, chuyển trạng thái -> tự loại khỏi doanh thu và công nợ.
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

-- Ghi nhận khách trả nợ (ghi chung theo khách, không gắn đơn cụ thể).
create or replace function public.record_payment(
  p_customer_id uuid, p_amount bigint, p_paid_on date default null, p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_balance bigint;
  v_id uuid;
begin
  perform public._require_owner();
  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'Không tìm thấy khách hàng';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Số tiền trả phải lớn hơn 0'; end if;
  if coalesce(p_paid_on, v_today) > v_today then raise exception 'Ngày trả không được ở tương lai'; end if;

  perform pg_advisory_xact_lock(hashtext('customer_money:' || p_customer_id::text));
  v_balance := public._customer_balance(p_customer_id);
  if p_amount > v_balance then
    raise exception 'Số tiền trả (%) lớn hơn số nợ hiện tại (%)', public._vnd(p_amount), public._vnd(greatest(v_balance, 0));
  end if;

  insert into public.payments (customer_id, amount, paid_on, note)
  values (p_customer_id, p_amount, coalesce(p_paid_on, v_today), left(trim(coalesce(p_note, '')), 300))
  returning id into v_id;
  return v_id;
end;
$$;

-- Huỷ phiếu thu (nhập nhầm). Không xoá, ghi audit.
create or replace function public.cancel_payment(p_payment_id uuid, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.payments%rowtype;
begin
  perform public._require_owner();
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Không tìm thấy phiếu thu'; end if;
  if v_pay.status <> 'active' then raise exception 'Phiếu thu này đã huỷ trước đó'; end if;

  update public.payments
  set status = 'cancelled', cancelled_at = now(), cancel_reason = left(trim(coalesce(p_reason, '')), 300)
  where id = p_payment_id;

  insert into public.audit_logs (entity, entity_id, action, changes)
  values ('payment', p_payment_id, 'cancel',
          jsonb_build_object('amount', v_pay.amount, 'paid_on', v_pay.paid_on, 'note', v_pay.note,
                             'reason', trim(coalesce(p_reason, ''))));
end;
$$;

-- Sổ công nợ của 1 khách trong khoảng ngày [p_from, p_to] (null = không giới hạn).
-- Trả về {opening, entries:[{date, kind, id, code, total, paid, increase, decrease, note}]}
-- increase = phần ghi nợ của đơn (tổng − đã trả lúc mua); decrease = khách trả nợ.
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

-- Công nợ hiện tại của mọi khách (để hiện ở danh sách khách / chọn khách)
create view public.customer_balances with (security_invoker = true) as
select c.id as customer_id,
  coalesce((select sum(o.total - o.paid) from public.orders o
            where o.customer_id = c.id and o.status = 'active'), 0)
  - coalesce((select sum(p.amount) from public.payments p
              where p.customer_id = c.id and p.status = 'active'), 0) as balance
from public.customers c;

-- ===================== QUYỀN =====================

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.audit_logs enable row level security;

create policy "orders_select_owner" on public.orders for select to authenticated using ((select public.is_owner()));
create policy "order_items_select_owner" on public.order_items for select to authenticated using ((select public.is_owner()));
create policy "payments_select_owner" on public.payments for select to authenticated using ((select public.is_owner()));
create policy "audit_logs_select_owner" on public.audit_logs for select to authenticated using ((select public.is_owner()));

-- Chỉ ĐỌC trực tiếp; ghi phải qua hàm ở trên.
revoke all on public.orders, public.order_items, public.payments, public.audit_logs, public.customer_balances from anon, authenticated;
grant select on public.orders, public.order_items, public.payments, public.audit_logs, public.customer_balances to authenticated;
grant all on public.orders, public.order_items, public.payments, public.audit_logs to service_role;
grant select on public.customer_balances to service_role;

revoke execute on function public._require_owner() from public, anon, authenticated;
revoke execute on function public._vnd(bigint) from public, anon, authenticated;
revoke execute on function public._customer_balance(uuid) from public, anon, authenticated;
revoke execute on function public._prepare_order_items(uuid, jsonb, uuid[]) from public, anon, authenticated;
revoke execute on function public._order_snapshot(uuid) from public, anon, authenticated;

revoke execute on function public.create_order(uuid, jsonb, bigint, text, timestamptz) from public, anon;
revoke execute on function public.update_order(uuid, jsonb, bigint, text, timestamptz) from public, anon;
revoke execute on function public.cancel_order(uuid, text) from public, anon;
revoke execute on function public.record_payment(uuid, bigint, date, text) from public, anon;
revoke execute on function public.cancel_payment(uuid, text) from public, anon;
revoke execute on function public.customer_ledger(uuid, date, date) from public, anon;
grant execute on function public.create_order(uuid, jsonb, bigint, text, timestamptz) to authenticated;
grant execute on function public.update_order(uuid, jsonb, bigint, text, timestamptz) to authenticated;
grant execute on function public.cancel_order(uuid, text) to authenticated;
grant execute on function public.record_payment(uuid, bigint, date, text) to authenticated;
grant execute on function public.cancel_payment(uuid, text) to authenticated;
grant execute on function public.customer_ledger(uuid, date, date) to authenticated;
