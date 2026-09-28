-- Migration: Align creative_canvases owner column to user_id
-- File: 20260823000000_align_creative_canvases_owner.sql

begin;

alter table public.creative_canvases
  add column if not exists user_id uuid
  references auth.users(id) on delete set null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'creative_canvases'
      and column_name = 'created_by'
  ) then
    execute '
      update public.creative_canvases
      set user_id = coalesce(user_id, created_by)
      where user_id is null
    ';
  end if;
end $$;

create index if not exists idx_creative_canvases_user_id
  on public.creative_canvases(user_id);

commit;
