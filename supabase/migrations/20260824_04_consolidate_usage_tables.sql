-- Migration: 20260824_04_consolidate_usage_tables.sql
-- MANWAH 生产数据库统一收敛：收敛使用量与财务表、归档部门账单、统一财务汇总 View

begin;

-- 1. Remove detailed_usage_records trigger and table
do $$
declare
  tg_rec record;
begin
  for tg_rec in (
    select c.relname as table_name, t.tgname as trigger_name
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'public'
      and not t.tgisinternal
      and (p.proname in ('sync_detailed_record', 'clean_up_old_records'))
  ) loop
    execute format('drop trigger if exists %I on public.%I;', tg_rec.trigger_name, tg_rec.table_name);
  end loop;
end $$;

drop function if exists public.sync_detailed_record();
drop function if exists public.clean_up_old_records();
drop table if exists public.detailed_usage_records;

-- 2. Move department_billing_records to archive schema and create compatibility view
create schema if not exists archive;

do $$
declare
  tg_rec record;
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'department_billing_records'
      and table_type = 'BASE TABLE'
  ) then
    for tg_rec in (
      select c.relname as table_name, t.tgname as trigger_name
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_proc p on p.oid = t.tgfoid
      where n.nspname = 'public'
        and not t.tgisinternal
        and p.proname = 'sync_to_department_records'
    ) loop
      execute format('drop trigger if exists %I on public.%I;', tg_rec.trigger_name, tg_rec.table_name);
    end loop;

    drop function if exists public.sync_to_department_records();

    -- Move base table to archive schema
    alter table public.department_billing_records set schema archive;
  end if;
end $$;

-- Create compatibility view in public schema
create or replace view public.department_billing_records
with (security_invoker = true)
as
select
  u.id as record_id,
  d.dept_name,
  p.employee_id,
  p.username as employee_name,
  u.model as model_used,
  u.model_res as model_spec,
  u.tokens_used::bigint as points_spent,
  round(u.tokens_used::numeric / 10000, 2) as amount_w,
  u.cost_usd,
  u.type as operation_type,
  u.created_at
from public.usage_logs u
left join public.profiles p on p.id = u.user_id
left join public.department_configs d on d.id = u.dept_id;

-- 3. Unified Finance Summary View
drop view if exists public.site_usage_summary;

create or replace view public.finance_summary
with (security_invoker = true)
as
select
  coalesce(
    (select sum(amount) from public.financial_records),
    0
  ) as total_deposited,
  coalesce(
    (select sum(cost_usd) from public.usage_logs),
    0
  ) as total_consumed,
  coalesce(
    (select sum(amount) from public.financial_records),
    0
  ) - coalesce(
    (select sum(cost_usd) from public.usage_logs),
    0
  ) as current_balance;

commit;
