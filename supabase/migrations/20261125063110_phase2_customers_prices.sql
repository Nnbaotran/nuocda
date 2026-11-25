-- Giai đoạn 2: hồ sơ khách hàng + giá riêng theo từng khách.
-- - customers: hồ sơ khách. customer_prices: giá riêng (mỗi khách × mỗi sản phẩm một dòng).
-- - Giá mỗi khách ĐỘC LẬP: là bản sao tại thời điểm tạo, đổi giá mặc định sau này không ảnh hưởng.
-- - Sản phẩm thêm mới tự có giá cho mọi khách (= giá mặc định lúc thêm).
-- - Tạo khách + giá lần đầu nằm trong MỘT giao dịch (hàm create_customer).
-- Quyền: Chủ toàn quyền; Nhân viên đang hoạt động chỉ XEM (cần để lên đơn ở giai đoạn 3).
-- Quay lui: supabase/rollback/20261125063110_down.sql

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  phone text not null default '' check (phone ~ '^[0-9+ .()-]{0,20}$'),
  address text not null default '' check (length(address) <= 300),
  note text not null default '' check (length(note) <= 500),
  is_active boolean not null default true,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_name_idx on public.customers (lower(name));
create index customers_created_by_idx on public.customers (created_by);

create trigger customers_touch
before update on public.customers
for each row execute function public.touch_updated_at();

create table public.customer_prices (
  customer_id uuid not null references public.customers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  price bigint not null check (price between 0 and 1000000000),
  updated_at timestamptz not null default now(),
  primary key (customer_id, product_id)
);
create index customer_prices_product_idx on public.customer_prices (product_id);

-- Sản phẩm mới -> tự thêm giá (= giá mặc định) cho mọi khách hiện có
create or replace function public.add_product_to_all_customers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.customer_prices (customer_id, product_id, price)
  select c.id, new.id, new.price from public.customers c
  on conflict (customer_id, product_id) do nothing;
  return new;
end;
$$;
revoke execute on function public.add_product_to_all_customers() from public, anon, authenticated;

create trigger products_add_to_customers
after insert on public.products
for each row execute function public.add_product_to_all_customers();

-- Tạo hồ sơ khách + giá lần đầu trong một giao dịch.
-- p_prices: [{"product_id": "...", "price": 30000}, ...]; sản phẩm không có trong danh sách lấy giá mặc định.
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

-- Lưu bảng giá riêng của 1 khách (chỉ ghi dòng thật sự đổi). Trả về số dòng đã đổi.
create or replace function public.set_customer_prices(p_customer_id uuid, p_prices jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_owner() then
    raise exception 'Chỉ Chủ mới được sửa giá' using errcode = '42501';
  end if;
  if jsonb_typeof(p_prices) <> 'array' then
    raise exception 'Bảng giá gửi lên không hợp lệ';
  end if;
  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'Không tìm thấy hồ sơ khách';
  end if;

  insert into public.customer_prices (customer_id, product_id, price)
  select p_customer_id, x.product_id, x.price
  from jsonb_to_recordset(p_prices) as x(product_id uuid, price bigint)
  join public.products p on p.id = x.product_id
  on conflict (customer_id, product_id) do update
    set price = excluded.price, updated_at = now()
    where public.customer_prices.price is distinct from excluded.price;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.set_customer_prices(uuid, jsonb) from public, anon;
grant execute on function public.set_customer_prices(uuid, jsonb) to authenticated;

-- RLS -------------------------------------------------------------------
alter table public.customers enable row level security;
alter table public.customer_prices enable row level security;

create policy "customers_select_active_users" on public.customers
  for select to authenticated using ((select public.is_active_user()));
create policy "customers_insert_owner" on public.customers
  for insert to authenticated with check ((select public.is_owner()));
create policy "customers_update_owner" on public.customers
  for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy "customers_delete_owner" on public.customers
  for delete to authenticated using ((select public.is_owner()));

create policy "customer_prices_select_active_users" on public.customer_prices
  for select to authenticated using ((select public.is_active_user()));
create policy "customer_prices_insert_owner" on public.customer_prices
  for insert to authenticated with check ((select public.is_owner()));
create policy "customer_prices_update_owner" on public.customer_prices
  for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy "customer_prices_delete_owner" on public.customer_prices
  for delete to authenticated using ((select public.is_owner()));

-- Quyền bảng (theo quy ước ở 20261125062158) ------------------------------
revoke all on public.customers, public.customer_prices from anon;
revoke truncate, references, trigger on public.customers, public.customer_prices from authenticated;
grant select, insert, update, delete on public.customers, public.customer_prices to authenticated;
grant all on public.customers, public.customer_prices to service_role;
