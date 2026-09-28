-- ==============================================================================
-- Schema Alignment: detail_render_jobs and Workspace RLS
-- Migration File: 20260820000000_align_detail_render_jobs_schema.sql
-- ==============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='detail_render_jobs' AND column_name='composition_id'
    ) THEN
        ALTER TABLE public.detail_render_jobs ADD COLUMN composition_id TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='detail_render_jobs' AND column_name='composition_version_id'
    ) THEN
        ALTER TABLE public.detail_render_jobs ADD COLUMN composition_version_id TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='detail_render_jobs' AND column_name='attempts'
    ) THEN
        ALTER TABLE public.detail_render_jobs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='detail_render_jobs' AND column_name='max_attempts'
    ) THEN
        ALTER TABLE public.detail_render_jobs ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='detail_render_jobs' AND column_name='heartbeat_at'
    ) THEN
        ALTER TABLE public.detail_render_jobs ADD COLUMN heartbeat_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='detail_render_jobs' AND column_name='locked_at'
    ) THEN
        ALTER TABLE public.detail_render_jobs ADD COLUMN locked_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='detail_render_jobs' AND column_name='locked_by'
    ) THEN
        ALTER TABLE public.detail_render_jobs ADD COLUMN locked_by TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='detail_render_jobs' AND column_name='completed_at'
    ) THEN
        ALTER TABLE public.detail_render_jobs ADD COLUMN completed_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='detail_render_jobs' AND column_name='output_asset_version_id'
    ) THEN
        ALTER TABLE public.detail_render_jobs ADD COLUMN output_asset_version_id TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='detail_render_jobs' AND column_name='output_object_key'
    ) THEN
        ALTER TABLE public.detail_render_jobs ADD COLUMN output_object_key TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='detail_render_jobs' AND column_name='progress_percent'
    ) THEN
        ALTER TABLE public.detail_render_jobs ADD COLUMN progress_percent INTEGER NOT NULL DEFAULT 0;
    END IF;
END $$;

-- Indexes for job lookup and worker claims
CREATE INDEX IF NOT EXISTS idx_render_jobs_status_heartbeat ON public.detail_render_jobs(status, heartbeat_at);
CREATE INDEX IF NOT EXISTS idx_render_jobs_canvas_job ON public.detail_render_jobs(canvas_id, id);

-- Ensure RLS Policies on detail_compositions, detail_composition_versions, detail_render_jobs, detail_exports, detail_export_slices
ALTER TABLE public.detail_compositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detail_composition_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detail_render_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detail_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detail_export_slices ENABLE ROW LEVEL SECURITY;
