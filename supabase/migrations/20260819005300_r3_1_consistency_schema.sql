-- ==============================================================================
-- C4B-4-R3: Consistency Scoring Schema Migration
-- Migration File: 20260819005300_r3_1_consistency_schema.sql
-- ==============================================================================

-- 1. product_consistency_policies
CREATE TABLE IF NOT EXISTS public.product_consistency_policies (
  id TEXT PRIMARY KEY,
  workspace_id TEXT, -- references public.creative_projects(id) -- UUID or TEXT check baseline
  schema_version TEXT NOT NULL DEFAULT '1.0',
  name TEXT NOT NULL,
  pass_threshold NUMERIC NOT NULL CHECK (pass_threshold >= 0 AND pass_threshold <= 100),
  review_threshold NUMERIC NOT NULL CHECK (review_threshold >= 0 AND review_threshold <= 100),
  dimension_weights JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_thresholds CHECK (pass_threshold > review_threshold)
);

-- 2. product_feature_registries
CREATE TABLE IF NOT EXISTS public.product_feature_registries (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  product_dna_version_id TEXT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT '1.0',
  status TEXT NOT NULL CHECK (status IN ('draft', 'ready', 'needs_review', 'stale')),
  source_hash TEXT NOT NULL,
  unmapped_source_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_registry UNIQUE (product_dna_version_id, schema_version, source_hash)
);

-- 3. product_feature_specs
CREATE TABLE IF NOT EXISTS public.product_feature_specs (
  id TEXT PRIMARY KEY,
  registry_id TEXT NOT NULL REFERENCES public.product_feature_registries(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('silhouette', 'module', 'armrest', 'backrest', 'headrest', 'seat', 'leg', 'material', 'color', 'decoration', 'function', 'accessory')),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  importance TEXT NOT NULL CHECK (importance IN ('hard', 'major', 'minor')),
  must_preserve BOOLEAN NOT NULL,
  applicable_screen_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_value JSONB DEFAULT '{}'::jsonb,
  reference_asset_version_id TEXT,
  reference_crop JSONB,
  source_path TEXT,
  source_value_hash TEXT,
  confidence NUMERIC NOT NULL DEFAULT 1,
  manually_confirmed BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_feature UNIQUE (registry_id, feature_key)
);

-- 4. product_consistency_reports
CREATE TABLE IF NOT EXISTS public.product_consistency_reports (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  screen_id TEXT NOT NULL,
  screen_role TEXT NOT NULL CHECK (screen_role IN ('PRODUCT_HERO', 'LIFESTYLE_SCENE', 'FUNCTION_DEMO', 'DETAIL_CALLOUT', 'MATERIAL_ONLY', 'INSPIRATION_ONLY', 'PARAMETER_SUMMARY')),
  product_dna_version_id TEXT NOT NULL,
  candidate_asset_version_id TEXT NOT NULL,
  consistency_policy_id TEXT NOT NULL REFERENCES public.product_consistency_policies(id),
  schema_version TEXT NOT NULL DEFAULT '1.0',
  report_version INTEGER NOT NULL CHECK (report_version > 0),
  status TEXT NOT NULL CHECK (status IN ('queued', 'evaluating', 'completed', 'failed', 'stale')),
  decision TEXT CHECK (decision IN ('PASS', 'REVIEW', 'FAIL')),
  total_score NUMERIC CHECK (total_score >= 0 AND total_score <= 100),
  confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 1),
  dimension_scores JSONB NOT NULL DEFAULT '[]'::jsonb,
  hard_violations JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  repair_directive JSONB,
  provider TEXT,
  model TEXT,
  request_id TEXT,
  latency_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated_cost NUMERIC,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT unique_report_idem UNIQUE (workspace_id, idempotency_key),
  CONSTRAINT unique_report_version UNIQUE (candidate_asset_version_id, product_dna_version_id, report_version)
);

-- 5. product_consistency_report_references
CREATE TABLE IF NOT EXISTS public.product_consistency_report_references (
  report_id TEXT NOT NULL REFERENCES public.product_consistency_reports(id) ON DELETE CASCADE,
  asset_version_id TEXT NOT NULL,
  reference_role TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (report_id, asset_version_id)
);

-- 6. product_consistency_approvals
CREATE TABLE IF NOT EXISTS public.product_consistency_approvals (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES public.product_consistency_reports(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  approved_by UUID NOT NULL REFERENCES auth.users(id),
  approval_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_feature_registries_dna ON public.product_feature_registries(product_dna_version_id);
CREATE INDEX IF NOT EXISTS idx_feature_specs_registry ON public.product_feature_specs(registry_id);
CREATE INDEX IF NOT EXISTS idx_consistency_reports_workspace ON public.product_consistency_reports(workspace_id, screen_id);
CREATE INDEX IF NOT EXISTS idx_consistency_reports_asset ON public.product_consistency_reports(candidate_asset_version_id);
CREATE INDEX IF NOT EXISTS idx_consistency_reports_dna ON public.product_consistency_reports(product_dna_version_id);
CREATE INDEX IF NOT EXISTS idx_consistency_reports_status ON public.product_consistency_reports(status);
CREATE INDEX IF NOT EXISTS idx_consistency_reports_decision ON public.product_consistency_reports(decision);
CREATE INDEX IF NOT EXISTS idx_consistency_reports_created ON public.product_consistency_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consistency_report_refs_asset ON public.product_consistency_report_references(asset_version_id);

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
