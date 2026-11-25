-- Quay lui migration 20261125061631_phase1_products_sku_note_guards
-- CẢNH BÁO: xoá cột sku và note sẽ mất dữ liệu trong 2 cột này. Sao lưu trước:
--   create table backup_products_20261125 as table public.products;

drop trigger if exists profiles_guard_last_owner on public.profiles;
drop function if exists public.guard_last_owner();

alter table public.profiles drop constraint if exists profiles_full_name_len;
alter table public.profiles alter column is_active set default true;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case when not exists (select 1 from public.profiles) then 'OWNER' else 'STAFF' end
  );
  return new;
end;
$$;

drop policy if exists "products_select_active_users" on public.products;
create policy "products_select_active_users" on public.products
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active));
drop function if exists public.is_active_user();

drop index if exists public.products_sku_unique;
alter table public.products
  drop constraint if exists products_sku_format,
  drop constraint if exists products_name_len,
  drop constraint if exists products_unit_len,
  drop constraint if exists products_note_len,
  drop constraint if exists products_price_max;
alter table public.products alter column price type numeric(14,0);
alter table public.products drop column if exists sku, drop column if exists note;
