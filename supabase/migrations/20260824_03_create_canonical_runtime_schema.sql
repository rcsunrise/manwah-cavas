-- Migration: 20260824_03_create_canonical_runtime_schema.sql
-- MANWAH 生产数据库统一收敛：补齐并统一唯一正式运行 Schema (UUID 主外键，RLS 与标准索引)

begin;

-- 1. Ensure creative_projects has standard structure
create table if not exists public.creative_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  owner_id uuid references auth.users(id) on delete set null,
  name text not null,
  project_type text not null default 'detail_page',
  status text not null default 'active',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Ensure creative_canvases has standard structure (user_id instead of created_by)
create table if not exists public.creative_canvases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creative_projects(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  canvas_name text not null default '主视觉九屏画布',
  canvas_status text not null default 'active',
  nodes_draft jsonb not null default '[]'::jsonb,
  edges_draft jsonb not null default '[]'::jsonb,
  viewport_draft jsonb not null default '{"x":0,"y":0,"zoom":1}'::jsonb,
  source_revision_id uuid,
  current_revision integer not null default 0,
  snapshot_checksum text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_saved_at timestamptz not null default now()
);

-- Ensure user_id exists and created_by is cleaned up if present
alter table public.creative_canvases add column if not exists user_id uuid references public.profiles(id) on delete set null;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'creative_canvases' and column_name = 'created_by'
  ) then
    execute 'update public.creative_canvases set user_id = coalesce(user_id, created_by) where user_id is null;';
    execute 'alter table public.creative_canvases drop column if exists created_by cascade;';
  end if;
end $$;

-- 3. Canvas Revisions
create table if not exists public.canvas_revisions (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references public.creative_canvases(id) on delete cascade,
  revision_number integer not null,
  version_name text not null,
  change_summary text default '',
  version_tag text default '正式版',
  status text not null default 'ready',
  manifest jsonb,
  nodes_snapshot jsonb not null default '[]'::jsonb,
  edges_snapshot jsonb not null default '[]'::jsonb,
  viewport_snapshot jsonb not null default '{"x":0,"y":0,"zoom":1}'::jsonb,
  asset_total integer default 0,
  asset_ready_count integer default 0,
  failed_asset_count integer default 0,
  idempotency_key text,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  unique (canvas_id, revision_number)
);

-- 4. Asset SKUs
create table if not exists public.asset_skus (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  project_id uuid not null references public.creative_projects(id) on delete cascade,
  canvas_id uuid not null references public.creative_canvases(id) on delete cascade,
  scene_key text not null,
  name text not null default '',
  status text not null default 'active',
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canvas_id, scene_key)
);

-- 5. Asset Versions
create table if not exists public.asset_versions (
  id uuid primary key default gen_random_uuid(),
  asset_sku_id uuid references public.asset_skus(id) on delete cascade,
  version_number integer not null default 1,
  parent_version_id uuid references public.asset_versions(id) on delete set null,
  status text not null default 'pending',
  bucket text not null default 'creative-canvas-assets',
  object_key text not null,
  preview_object_key text,
  thumbnail_object_key text,
  mime_type text not null default 'image/png',
  file_size_bytes bigint not null default 0,
  width integer,
  height integer,
  checksum text,
  generation_provider text default 'google',
  generation_model text default 'imagen-3.0-generate-002',
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  unique (asset_sku_id, version_number),
  unique (bucket, object_key)
);

-- Add foreign key constraint from asset_skus to asset_versions
alter table public.asset_skus
  drop constraint if exists fk_asset_skus_current_version;
alter table public.asset_skus
  add constraint fk_asset_skus_current_version
  foreign key (current_version_id) references public.asset_versions(id) on delete set null;

-- 6. Canvas Revision Assets (Junction)
create table if not exists public.canvas_revision_assets (
  revision_id uuid not null references public.canvas_revisions(id) on delete cascade,
  asset_version_id uuid not null references public.asset_versions(id) on delete cascade,
  object_key text,
  checksum text,
  required boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (revision_id, asset_version_id)
);

-- 7. Product DNAs and Versions
create table if not exists public.product_dnas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  project_id uuid references public.creative_projects(id) on delete cascade,
  canvas_id uuid references public.creative_canvases(id) on delete cascade,
  name text not null default '',
  category text default 'sofa',
  status text not null default 'active',
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canvas_id)
);

create table if not exists public.product_dna_versions (
  id uuid primary key default gen_random_uuid(),
  product_dna_id uuid not null references public.product_dnas(id) on delete cascade,
  version_number integer not null default 1,
  version_code text not null default 'V001',
  dna_data jsonb not null default '{}'::jsonb,
  checksum text,
  status text not null default 'ready',
  created_at timestamptz not null default now(),
  unique (product_dna_id, version_number)
);

alter table public.product_dnas
  drop constraint if exists fk_product_dnas_current_version;
alter table public.product_dnas
  add constraint fk_product_dnas_current_version
  foreign key (current_version_id) references public.product_dna_versions(id) on delete set null;

-- 8. Typography Specs
create table if not exists public.typography_specs (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references public.creative_canvases(id) on delete cascade,
  scene_key text not null,
  copy_sku_id uuid references public.copy_skus(id) on delete set null,
  copy_version_id uuid references public.copy_versions(id) on delete set null,
  slots jsonb not null default '[]'::jsonb,
  status text not null default 'ready',
  checksum text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canvas_id, scene_key)
);

-- 9. Canvas Layout Manifests (9 posters, 2100x2800)
create table if not exists public.canvas_layout_manifests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.creative_projects(id) on delete cascade,
  canvas_id uuid not null references public.creative_canvases(id) on delete cascade,
  schema_version text not null default 'poster-layout-manifest/v2',
  screen_count integer not null default 9 check (screen_count = 9),
  screen_width integer not null default 2100 check (screen_width = 2100),
  screen_height integer not null default 2800 check (screen_height = 2800),
  screens jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  checksum text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 10. Detail Compositions & Versions
create table if not exists public.detail_compositions (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references public.creative_canvases(id) on delete cascade,
  scene_key text not null,
  screen_id text not null,
  screen_role text not null default 'PRODUCT_HERO',
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canvas_id, scene_key)
);

create table if not exists public.detail_composition_versions (
  id uuid primary key default gen_random_uuid(),
  composition_id uuid not null references public.detail_compositions(id) on delete cascade,
  version_number integer not null default 1,
  composition_snapshot jsonb not null default '{}'::jsonb,
  asset_version_id uuid references public.asset_versions(id) on delete set null,
  copy_version_id uuid references public.copy_versions(id) on delete set null,
  typography_spec_id uuid references public.typography_specs(id) on delete set null,
  checksum text,
  status text not null default 'ready',
  created_at timestamptz not null default now(),
  unique (composition_id, version_number)
);

alter table public.detail_compositions
  drop constraint if exists fk_detail_compositions_current_version;
alter table public.detail_compositions
  add constraint fk_detail_compositions_current_version
  foreign key (current_version_id) references public.detail_composition_versions(id) on delete set null;

-- 11. Detail Exports & Slices
create table if not exists public.detail_exports (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references public.creative_canvases(id) on delete cascade,
  workspace_id text not null default 'default_workspace',
  export_version_number integer not null default 1,
  status text not null default 'ready',
  zip_bucket text,
  zip_object_key text,
  zip_filename text,
  zip_public_url text,
  zip_file_size_bytes bigint default 0,
  checksum text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.detail_export_slices (
  id uuid primary key default gen_random_uuid(),
  export_id uuid not null references public.detail_exports(id) on delete cascade,
  canvas_id uuid not null references public.creative_canvases(id) on delete cascade,
  slice_index integer not null check (slice_index between 1 and 9),
  scene_key text not null,
  filename text not null,
  width integer not null default 2100 check (width = 2100),
  height integer not null default 2800 check (height = 2800),
  bucket text not null default 'creative-canvas-assets',
  object_key text not null,
  public_url text,
  file_size_bytes bigint not null default 0,
  checksum text,
  status text not null default 'ready',
  created_at timestamptz not null default now(),
  unique (export_id, slice_index)
);

-- 12. Generation History
create table if not exists public.generation_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  prompt text not null default '',
  model text not null default '',
  aspect_ratio text not null default '1:1',
  image_url text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 13. Enable RLS on all tables
alter table public.creative_projects enable row level security;
alter table public.creative_canvases enable row level security;
alter table public.canvas_revisions enable row level security;
alter table public.asset_skus enable row level security;
alter table public.asset_versions enable row level security;
alter table public.canvas_revision_assets enable row level security;
alter table public.product_dnas enable row level security;
alter table public.product_dna_versions enable row level security;
alter table public.typography_specs enable row level security;
alter table public.canvas_layout_manifests enable row level security;
alter table public.detail_compositions enable row level security;
alter table public.detail_composition_versions enable row level security;
alter table public.detail_exports enable row level security;
alter table public.detail_export_slices enable row level security;
alter table public.generation_history enable row level security;

-- 14. Standard Indexes for performance
create index if not exists idx_creative_projects_user ON public.creative_projects(user_id, created_at desc);
create index if not exists idx_creative_canvases_project ON public.creative_canvases(project_id);
create index if not exists idx_creative_canvases_user ON public.creative_canvases(user_id);
create index if not exists idx_canvas_revisions_canvas ON public.canvas_revisions(canvas_id, revision_number desc);
create index if not exists idx_asset_skus_canvas ON public.asset_skus(canvas_id, scene_key);
create index if not exists idx_asset_versions_sku ON public.asset_versions(asset_sku_id, version_number desc);
create index if not exists idx_asset_versions_object ON public.asset_versions(bucket, object_key);
create index if not exists idx_product_dnas_canvas ON public.product_dnas(canvas_id);
create index if not exists idx_product_dna_versions_dna ON public.product_dna_versions(product_dna_id);
create index if not exists idx_typography_specs_canvas ON public.typography_specs(canvas_id, scene_key);
create index if not exists idx_canvas_layout_manifests_canvas ON public.canvas_layout_manifests(canvas_id);
create index if not exists idx_detail_compositions_canvas ON public.detail_compositions(canvas_id, scene_key);
create index if not exists idx_detail_exports_canvas ON public.detail_exports(canvas_id);
create index if not exists idx_detail_export_slices_export ON public.detail_export_slices(export_id, slice_index);
create index if not exists idx_generation_history_user ON public.generation_history(user_id, created_at desc);

commit;
