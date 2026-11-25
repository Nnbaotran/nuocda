-- Giai đoạn 4: nhân viên (không có tài khoản), chấm công, thưởng/phạt, bảng lương.
--
-- Cách tính (đã thống nhất 25/11/2026):
--   Lương THÁNG: lương tháng ÷ số ngày thực tế của tháng (28–31) × số công
--   Lương NGÀY : lương ngày × số công
--   Đi làm = 1 công, nửa ngày = 0,5 công, nghỉ / nghỉ phép = 0 công (sửa được số công từng ngày)
--   Thực lĩnh = lương theo công (làm tròn đến đồng ở bước cuối) + thưởng − phạt
-- Chốt bảng lương = lưu lại bản chụp; tháng đã chốt thì KHOÁ chấm công + thưởng/phạt của tháng đó.
-- Mở chốt = xoá bản chụp (ghi nhật ký) để sửa rồi chốt lại.
-- Quay lui: supabase/rollback/20261125080827_down.sql

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  phone text not null default '' check (phone ~ '^[0-9+ .()-]{0,20}$'),
  position text not null default '' check (length(position) <= 60),
  salary_type text not null default 'monthly' check (salary_type in ('monthly', 'daily')),
  salary_amount bigint not null default 0 check (salary_amount between 0 and 10000000000),
  note text not null default '' check (length(note) <= 300),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger employees_touch before update on public.employees
for each row execute function public.touch_updated_at();

create table public.attendance (
  employee_id uuid not null references public.employees(id) on delete restrict,
  work_date date not null,
  status text not null check (status in ('present', 'half', 'absent', 'leave')),
  units numeric(3, 2) not null check (units between 0 and 3),
  check_in time,
  check_out time,
  note text not null default '' check (length(note) <= 200),
  updated_at timestamptz not null default now(),
  primary key (employee_id, work_date)
);
create index attendance_date_idx on public.attendance (work_date);
create trigger attendance_touch before update on public.attendance
for each row execute function public.touch_updated_at();

create table public.salary_adjustments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  adj_date date not null,
  kind text not null check (kind in ('bonus', 'penalty')),
  amount bigint not null check (amount > 0 and amount <= 10000000000),
  reason text not null check (length(trim(reason)) between 1 and 300),
  created_at timestamptz not null default now()
);
create index salary_adjustments_emp_date_idx on public.salary_adjustments (employee_id, adj_date);

create table public.payroll (
  id uuid primary key default gen_random_uuid(),
  month date not null check (extract(day from month) = 1),
  employee_id uuid not null references public.employees(id) on delete restrict,
  employee_name text not null,
  position text not null default '',
  salary_type text not null,
  salary_amount bigint not null,
  days_in_month int not null,
  work_units numeric(6, 2) not null,
  base_pay bigint not null,
  bonus bigint not null,
  penalty bigint not null,
  net_pay bigint not null,
  closed_at timestamptz not null default now(),
  unique (month, employee_id)
);

-- ===================== HÀM NỘI BỘ =====================

create or replace function public._month_closed(p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.payroll where month = date_trunc('month', p_day)::date);
$$;

-- Tháng đã chốt lương thì không cho thêm/sửa/xoá chấm công, thưởng/phạt của tháng đó.
create or replace function public._guard_closed_month()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old date;
  v_new date;
  v_bad date;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    if tg_table_name = 'attendance' then v_old := old.work_date; else v_old := old.adj_date; end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    if tg_table_name = 'attendance' then v_new := new.work_date; else v_new := new.adj_date; end if;
  end if;

  if v_old is not null and public._month_closed(v_old) then v_bad := v_old;
  elsif v_new is not null and public._month_closed(v_new) then v_bad := v_new;
  end if;
  if v_bad is not null then
    raise exception 'Tháng %/% đã chốt lương. Mở chốt trước khi sửa.', to_char(v_bad, 'MM'), to_char(v_bad, 'YYYY');
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger attendance_guard_closed before insert or update or delete on public.attendance
for each row execute function public._guard_closed_month();
create trigger salary_adjustments_guard_closed before insert or update or delete on public.salary_adjustments
for each row execute function public._guard_closed_month();

-- ===================== HÀM CHO APP GỌI =====================

-- Bảng lương 1 tháng. Đã chốt -> trả bản chụp; chưa chốt -> tính trực tiếp.
-- Gồm nhân viên đang làm + nhân viên đã nghỉ nhưng có chấm công/thưởng/phạt trong tháng.
create or replace function public.payroll_preview(p_month date)
returns table (
  employee_id uuid, employee_name text, "position" text, salary_type text, salary_amount bigint,
  days_in_month int, work_units numeric, base_pay bigint, bonus bigint, penalty bigint, net_pay bigint,
  closed boolean, closed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m0 date := date_trunc('month', p_month)::date;
  m1 date := (date_trunc('month', p_month) + interval '1 month')::date;
  ndays int := (m1 - m0);
begin
  perform public._require_owner();
  if exists (select 1 from public.payroll p where p.month = m0) then
    return query
      select p.employee_id, p.employee_name, p.position, p.salary_type, p.salary_amount, p.days_in_month,
             p.work_units, p.base_pay, p.bonus, p.penalty, p.net_pay, true, p.closed_at
      from public.payroll p where p.month = m0 order by p.employee_name;
    return;
  end if;

  return query
    with emp as (
      select e.* from public.employees e
      where e.is_active
         or exists (select 1 from public.attendance a where a.employee_id = e.id and a.work_date >= m0 and a.work_date < m1)
         or exists (select 1 from public.salary_adjustments s where s.employee_id = e.id and s.adj_date >= m0 and s.adj_date < m1)
    ), calc as (
      select e.id, e.name, e.position, e.salary_type, e.salary_amount,
        coalesce((select sum(a.units) from public.attendance a
                  where a.employee_id = e.id and a.work_date >= m0 and a.work_date < m1), 0)::numeric as units,
        coalesce((select sum(s.amount) from public.salary_adjustments s
                  where s.employee_id = e.id and s.kind = 'bonus' and s.adj_date >= m0 and s.adj_date < m1), 0)::bigint as bonus,
        coalesce((select sum(s.amount) from public.salary_adjustments s
                  where s.employee_id = e.id and s.kind = 'penalty' and s.adj_date >= m0 and s.adj_date < m1), 0)::bigint as penalty
      from emp e
    )
    select c.id, c.name, c.position, c.salary_type, c.salary_amount, ndays, c.units,
      b.base, c.bonus, c.penalty, b.base + c.bonus - c.penalty, false, null::timestamptz
    from calc c
    cross join lateral (
      select (case when c.salary_type = 'monthly'
                   then round(c.salary_amount::numeric * c.units / ndays)
                   else round(c.salary_amount::numeric * c.units) end)::bigint as base
    ) b
    order by c.name;
end;
$$;

-- Chốt bảng lương tháng (lưu bản chụp, khoá chấm công + thưởng/phạt tháng đó).
create or replace function public.close_payroll(p_month date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  m0 date := date_trunc('month', p_month)::date;
  v_count integer;
begin
  perform public._require_owner();
  if m0 > date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Không chốt lương tháng ở tương lai';
  end if;
  perform pg_advisory_xact_lock(hashtext('payroll:' || m0::text));
  if exists (select 1 from public.payroll where month = m0) then
    raise exception 'Tháng này đã chốt lương rồi';
  end if;

  insert into public.payroll (month, employee_id, employee_name, position, salary_type, salary_amount,
                              days_in_month, work_units, base_pay, bonus, penalty, net_pay)
  select m0, x.employee_id, x.employee_name, x."position", x.salary_type, x.salary_amount,
         x.days_in_month, x.work_units, x.base_pay, x.bonus, x.penalty, x.net_pay
  from public.payroll_preview(m0) x;
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'Không có nhân viên nào để chốt lương'; end if;

  insert into public.audit_logs (entity, entity_id, action, changes)
  values ('payroll', md5('payroll:' || m0::text)::uuid, 'close',
          jsonb_build_object('month', m0, 'employees', v_count,
                             'total_net', (select sum(net_pay) from public.payroll where month = m0)));
  return v_count;
end;
$$;

-- Mở chốt (để sửa chấm công/thưởng/phạt rồi chốt lại). Ghi nhật ký bản chụp cũ.
create or replace function public.reopen_payroll(p_month date, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m0 date := date_trunc('month', p_month)::date;
  v_snapshot jsonb;
begin
  perform public._require_owner();
  select jsonb_agg(to_jsonb(p) - 'id') into v_snapshot from public.payroll p where p.month = m0;
  if v_snapshot is null then raise exception 'Tháng này chưa chốt lương'; end if;
  delete from public.payroll where month = m0;
  insert into public.audit_logs (entity, entity_id, action, changes)
  values ('payroll', md5('payroll:' || m0::text)::uuid, 'reopen',
          jsonb_build_object('month', m0, 'reason', trim(coalesce(p_reason, '')), 'snapshot', v_snapshot));
end;
$$;

-- ===================== QUYỀN =====================

alter table public.employees enable row level security;
alter table public.attendance enable row level security;
alter table public.salary_adjustments enable row level security;
alter table public.payroll enable row level security;

create policy "employees_owner_all" on public.employees for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
create policy "attendance_owner_all" on public.attendance for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
create policy "salary_adjustments_owner_all" on public.salary_adjustments for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
create policy "payroll_select_owner" on public.payroll for select to authenticated
  using ((select public.is_owner()));

revoke all on public.employees, public.attendance, public.salary_adjustments, public.payroll from anon, authenticated;
grant select, insert, update, delete on public.employees, public.attendance, public.salary_adjustments to authenticated;
grant select on public.payroll to authenticated;  -- ghi qua close_payroll / reopen_payroll
grant all on public.employees, public.attendance, public.salary_adjustments, public.payroll to service_role;

revoke execute on function public._month_closed(date) from public, anon, authenticated;
revoke execute on function public._guard_closed_month() from public, anon, authenticated;
revoke execute on function public.payroll_preview(date) from public, anon;
revoke execute on function public.close_payroll(date) from public, anon;
revoke execute on function public.reopen_payroll(date, text) from public, anon;
grant execute on function public.payroll_preview(date) to authenticated;
grant execute on function public.close_payroll(date) to authenticated;
grant execute on function public.reopen_payroll(date, text) to authenticated;
