-- Giai đoạn 1 (phần 2)
-- 1. Sản phẩm: thêm mã SKU, ghi chú; giá đổi sang số nguyên bigint (VND).
-- 2. Người tự đăng ký (không qua chủ tạo) mặc định BỊ KHOÁ cho tới khi chủ kích hoạt.
-- 3. Không cho khoá/hạ quyền chủ cuối cùng (tránh tự khoá mình ra ngoài).
-- Quay lui: supabase/rollback/20261125061631_down.sql

-- 1. Sản phẩm -----------------------------------------------------------
alter table public.products
  add column sku text,
  add column note text not null default '';

alter table public.products
  alter column price type bigint using price::bigint;

alter table public.products
  add constraint products_sku_format check (sku is null or sku ~ '^[A-Z0-9_-]{1,30}$'),
  add constraint products_name_len check (length(name) <= 120),
  add constraint products_unit_len check (length(trim(unit)) between 1 and 20),
  add constraint products_note_len check (length(note) <= 500),
  add constraint products_price_max check (price <= 1000000000);

create unique index products_sku_unique on public.products (sku) where sku is not null;

-- Hàm dùng chung cho RLS: người đang đăng nhập có tài khoản còn hoạt động không
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and is_active
  );
$$;
revoke execute on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated;

drop policy "products_select_active_users" on public.products;
create policy "products_select_active_users" on public.products
  for select to authenticated
  using ((select public.is_active_user()));

-- 2. Người dùng mới ------------------------------------------------------
-- Người đầu tiên = OWNER (đang hoạt động). Mọi người sau = STAFF, bị khoá,
-- chỉ được mở khi chủ tạo qua chức năng "Tạo tài khoản nhân viên".
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_user boolean;
begin
  perform pg_advisory_xact_lock(hashtext('lexuan_profiles_first_owner'));
  first_user := not exists (select 1 from public.profiles);
  insert into public.profiles (id, full_name, role, is_active)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data->>'full_name', ''), 100),
    case when first_user then 'OWNER' else 'STAFF' end,
    first_user
  );
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

alter table public.profiles alter column is_active set default false;
alter table public.profiles
  add constraint profiles_full_name_len check (length(full_name) <= 100);

-- 3. Bảo vệ chủ cuối cùng ------------------------------------------------
create or replace function public.guard_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id <> old.id then
    raise exception 'Không được đổi mã tài khoản';
  end if;
  if old.role = 'OWNER' and old.is_active
     and (new.role <> 'OWNER' or not new.is_active)
     and not exists (
       select 1 from public.profiles
       where role = 'OWNER' and is_active and id <> old.id
     ) then
    raise exception 'Phải còn ít nhất một tài khoản Chủ đang hoạt động';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_last_owner() from public, anon, authenticated;

create trigger profiles_guard_last_owner
before update on public.profiles
for each row execute function public.guard_last_owner();
