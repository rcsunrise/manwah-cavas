-- ==============================================================================
-- FAST-3: Detail Export & Task Queue Migration
-- File: 20260819030000_fast3_detail_export_schema.sql
-- ==============================================================================

-- 1. Detail Compositions Table
CREATE TABLE IF NOT EXISTS public.detail_compositions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default_workspace',
  canvas_id TEXT NOT NULL,
  screen_id TEXT NOT NULL,
  screen_role TEXT NOT NULL DEFAULT 'PRODUCT_HERO',
  status TEXT NOT NULL DEFAULT 'ready',
  current_version_id TEXT DEFAULT NULL,
  idempotency_key TEXT UNIQUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.detail_compositions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members can select detail compositions" ON public.detail_compositions;
CREATE POLICY "Workspace members can select detail compositions"
  ON public.detail_compositions FOR SELECT
  TO authenticated
  USING (workspace_id IS NOT NULL);

DROP POLICY IF EXISTS "Workspace members can insert detail compositions" ON public.detail_compositions;
CREATE POLICY "Workspace members can insert detail compositions"
  ON public.detail_compositions FOR INSERT
  TO authenticated
  WITH CHECK (workspace_id IS NOT NULL);

DROP POLICY IF EXISTS "Workspace members can update detail compositions" ON public.detail_compositions;
CREATE POLICY "Workspace members can update detail compositions"
  ON public.detail_compositions FOR UPDATE
  TO authenticated
  USING (workspace_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_compositions_canvas ON public.detail_compositions(canvas_id, screen_id);


-- 2. Detail Composition Versions Table
CREATE TABLE IF NOT EXISTS public.detail_composition_versions (
  id TEXT PRIMARY KEY,
  composition_id TEXT NOT NULL REFERENCES public.detail_compositions(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL DEFAULT 'default_workspace',
  canvas_id TEXT NOT NULL,
  screen_id TEXT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  asset_version_id TEXT DEFAULT NULL,
  layout_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  text_layers JSONB NOT NULL DEFAULT '[]'::jsonb,
  image_layers JSONB NOT NULL DEFAULT '[]'::jsonb,
  checksum TEXT DEFAULT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.detail_composition_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members can select composition versions" ON public.detail_composition_versions;
CREATE POLICY "Workspace members can select composition versions"
  ON public.detail_composition_versions FOR SELECT
  TO authenticated
  USING (workspace_id IS NOT NULL);

DROP POLICY IF EXISTS "Workspace members can insert composition versions" ON public.detail_composition_versions;
CREATE POLICY "Workspace members can insert composition versions"
  ON public.detail_composition_versions FOR INSERT
  TO authenticated
  WITH CHECK (workspace_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_comp_versions_comp ON public.detail_composition_versions(composition_id, version_number);


-- 3. Detail Render Jobs Table (DB-backed Async Queue)
CREATE TABLE IF NOT EXISTS public.detail_render_jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default_workspace',
  canvas_id TEXT NOT NULL,
  job_type TEXT NOT NULL DEFAULT 'single_screen', -- 'single_screen' | 'full_canvas_export'
  screen_id TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'queued', -- 'queued' | 'processing' | 'completed' | 'failed'
  progress INTEGER NOT NULL DEFAULT 0,
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_result JSONB DEFAULT NULL,
  error_message TEXT DEFAULT NULL,
  idempotency_key TEXT UNIQUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.detail_render_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members can view render jobs" ON public.detail_render_jobs;
CREATE POLICY "Workspace members can view render jobs"
  ON public.detail_render_jobs FOR SELECT
  TO authenticated
  USING (workspace_id IS NOT NULL);

DROP POLICY IF EXISTS "Workspace members can create render jobs" ON public.detail_render_jobs;
CREATE POLICY "Workspace members can create render jobs"
  ON public.detail_render_jobs FOR INSERT
  TO authenticated
  WITH CHECK (workspace_id IS NOT NULL);

DROP POLICY IF EXISTS "Workspace members can update render jobs" ON public.detail_render_jobs;
CREATE POLICY "Workspace members can update render jobs"
  ON public.detail_render_jobs FOR UPDATE
  TO authenticated
  USING (workspace_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_render_jobs_canvas_status ON public.detail_render_jobs(canvas_id, status);


-- 4. Detail Exports Table (Immutable Long-Form Output)
CREATE TABLE IF NOT EXISTS public.detail_exports (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default_workspace',
  canvas_id TEXT NOT NULL,
  export_version_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'processing' | 'ready' | 'failed'
  asset_version_id TEXT DEFAULT NULL,
  object_key TEXT DEFAULT NULL,
  public_url TEXT DEFAULT NULL,
  width INTEGER NOT NULL DEFAULT 2100,
  height INTEGER NOT NULL DEFAULT 14800,
  file_size_bytes BIGINT DEFAULT 0,
  checksum TEXT DEFAULT NULL,
  composition_version_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  revision_id TEXT DEFAULT NULL,
  idempotency_key TEXT UNIQUE,
  error_message TEXT DEFAULT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.detail_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members can view detail exports" ON public.detail_exports;
CREATE POLICY "Workspace members can view detail exports"
  ON public.detail_exports FOR SELECT
  TO authenticated
  USING (workspace_id IS NOT NULL);

DROP POLICY IF EXISTS "Workspace members can create detail exports" ON public.detail_exports;
CREATE POLICY "Workspace members can create detail exports"
  ON public.detail_exports FOR INSERT
  TO authenticated
  WITH CHECK (workspace_id IS NOT NULL);

DROP POLICY IF EXISTS "Workspace members can update detail exports" ON public.detail_exports;
CREATE POLICY "Workspace members can update detail exports"
  ON public.detail_exports FOR UPDATE
  TO authenticated
  USING (workspace_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_detail_exports_canvas ON public.detail_exports(canvas_id, export_version_number);


-- 5. Detail Export Slices Table (5 Exact Slices)
CREATE TABLE IF NOT EXISTS public.detail_export_slices (
  id TEXT PRIMARY KEY,
  export_id TEXT NOT NULL REFERENCES public.detail_exports(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL DEFAULT 'default_workspace',
  canvas_id TEXT NOT NULL,
  slice_index INTEGER NOT NULL,
  slice_name TEXT NOT NULL,
  start_y INTEGER NOT NULL,
  end_y INTEGER NOT NULL,
  width INTEGER NOT NULL DEFAULT 2100,
  height INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  public_url TEXT DEFAULT NULL,
  file_size_bytes BIGINT DEFAULT 0,
  checksum TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.detail_export_slices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members can view export slices" ON public.detail_export_slices;
CREATE POLICY "Workspace members can view export slices"
  ON public.detail_export_slices FOR SELECT
  TO authenticated
  USING (workspace_id IS NOT NULL);

DROP POLICY IF EXISTS "Workspace members can create export slices" ON public.detail_export_slices;
CREATE POLICY "Workspace members can create export slices"
  ON public.detail_export_slices FOR INSERT
  TO authenticated
  WITH CHECK (workspace_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_export_slices_export ON public.detail_export_slices(export_id, slice_index);
