-- Migration: 20260824_06_create_schema_contract_checks.sql
-- MANWAH 生产数据库统一收敛：数据库架构契约检查函数 (Schema Contract Validation)

create or replace function public.check_schema_contract()
returns jsonb
language plpgsql
security definer
as $$
declare
  required_tables text[] := array[
    'profiles', 'department_configs', 'usage_logs', 'financial_records',
    'creative_projects', 'creative_canvases', 'canvas_revisions',
    'agent_conversations', 'agent_messages', 'product_dnas', 'product_dna_versions',
    'asset_skus', 'asset_versions', 'copy_skus', 'copy_versions',
    'typography_specs', 'canvas_layout_manifests', 'detail_compositions',
    'detail_composition_versions', 'detail_exports', 'detail_export_slices',
    'generation_history', 'system_prompts', 'system_settings'
  ];
  forbidden_tables text[] := array[
    'projects', 'project_dna', 'product_visual_dna', 'model_assets',
    'pose_assets', 'scene_assets', 'scene_styles', 'project_assets',
    'detailed_usage_records', 'site_usage_summary', 'detail_render_jobs'
  ];
  tbl text;
  missing_tables text[] := array[]::text[];
  found_forbidden text[] := array[]::text[];
  forbidden_columns text[] := array[]::text[];
  missing_columns text[] := array[]::text[];
  has_created_by boolean := false;
  has_user_id boolean := false;
  has_bucket boolean := false;
  has_object_key boolean := false;
  has_finance_summary boolean := false;
  is_valid boolean := true;
begin
  -- 1. Check required tables
  foreach tbl in array required_tables loop
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = tbl
    ) then
      missing_tables := array_append(missing_tables, tbl);
    end if;
  end loop;

  -- 2. Check finance_summary view
  select exists (
    select 1 from information_schema.views
    where table_schema = 'public' and table_name = 'finance_summary'
  ) into has_finance_summary;
  if not has_finance_summary then
    missing_tables := array_append(missing_tables, 'finance_summary (view)');
  end if;

  -- 3. Check forbidden tables
  foreach tbl in array forbidden_tables loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = tbl
    ) or exists (
      select 1 from information_schema.views
      where table_schema = 'public' and table_name = tbl
    ) then
      found_forbidden := array_append(found_forbidden, tbl);
    end if;
  end loop;

  -- 4. Check forbidden column creative_canvases.created_by
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'creative_canvases' and column_name = 'created_by'
  ) into has_created_by;
  if has_created_by then
    forbidden_columns := array_append(forbidden_columns, 'creative_canvases.created_by');
  end if;

  -- 5. Check mandatory columns
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'creative_canvases' and column_name = 'user_id'
  ) into has_user_id;
  if not has_user_id then
    missing_columns := array_append(missing_columns, 'creative_canvases.user_id');
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'asset_versions' and column_name = 'bucket'
  ) into has_bucket;
  if not has_bucket then
    missing_columns := array_append(missing_columns, 'asset_versions.bucket');
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'asset_versions' and column_name = 'object_key'
  ) into has_object_key;
  if not has_object_key then
    missing_columns := array_append(missing_columns, 'asset_versions.object_key');
  end if;

  is_valid := (
    array_length(missing_tables, 1) is null and
    array_length(found_forbidden, 1) is null and
    array_length(forbidden_columns, 1) is null and
    array_length(missing_columns, 1) is null
  );

  return jsonb_build_object(
    'passed', is_valid,
    'checked_at', now(),
    'missing_tables', to_jsonb(missing_tables),
    'forbidden_tables', to_jsonb(found_forbidden),
    'forbidden_columns', to_jsonb(forbidden_columns),
    'missing_columns', to_jsonb(missing_columns)
  );
end;
$$;
