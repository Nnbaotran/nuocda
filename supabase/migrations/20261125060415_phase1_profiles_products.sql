-- Giai đoạn 1 (phần 1): hồ sơ người dùng + sản phẩm
-- Đã áp lên Supabase ngày 25/11/2026. File này lưu lại nguyên văn để tái tạo DB.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'STAFF' check (role in ('OWNER','STAFF')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  unit text not null default 'cây',
  price numeric(14,0) not null default 0 check (price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'OWNER' and is_active
  );
$$;

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

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_touch
before update on public.products
for each row execute function public.touch_updated_at();

revoke execute on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.products enable row level security;

create policy "profiles_select_own_or_owner" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_owner()));

create policy "profiles_update_owner" on public.profiles
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

create policy "products_select_active_users" on public.products
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active));

create policy "products_insert_owner" on public.products
  for insert to authenticated
  with check ((select public.is_owner()));

create policy "products_update_owner" on public.products
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

create policy "products_delete_owner" on public.products
  for delete to authenticated
  using ((select public.is_owner()));
