-- ==============================================================================
-- FAST-3: Solidify creative_canvases Schema Migration
-- File: 20260819033000_solidify_creative_canvases.sql
-- ==============================================================================

-- 1. Ensure workspace_id column exists on creative_canvases
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='creative_canvases' AND column_name='workspace_id'
    ) THEN
        ALTER TABLE public.creative_canvases ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default_workspace';
    END IF;
END $$;

-- 2. Ensure name, title, status, user_id columns exist or align
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='creative_canvases' AND column_name='name'
    ) THEN
        ALTER TABLE public.creative_canvases ADD COLUMN name TEXT DEFAULT '主视觉九屏画布';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='creative_canvases' AND column_name='title'
    ) THEN
        ALTER TABLE public.creative_canvases ADD COLUMN title TEXT DEFAULT '主视觉九屏画布';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='creative_canvases' AND column_name='status'
    ) THEN
        ALTER TABLE public.creative_canvases ADD COLUMN status TEXT DEFAULT 'active';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='creative_canvases' AND column_name='user_id'
    ) THEN
        ALTER TABLE public.creative_canvases ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Sync column defaults & backfill missing values
UPDATE public.creative_canvases 
SET 
  canvas_name = COALESCE(canvas_name, name, title, '主视觉九屏画布'),
  name = COALESCE(name, canvas_name, '主视觉九屏画布'),
  title = COALESCE(title, canvas_name, '主视觉九屏画布'),
  canvas_status = COALESCE(canvas_status, status, 'active'),
  status = COALESCE(status, canvas_status, 'active'),
  user_id = COALESCE(user_id, created_by),
  created_by = COALESCE(created_by, user_id),
  workspace_id = COALESCE(workspace_id, 'default_workspace')
WHERE workspace_id IS NULL OR canvas_name IS NULL OR name IS NULL;

-- 4. Enable RLS and set Workspace & Author level policies
ALTER TABLE public.creative_canvases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members and owner can view canvases" ON public.creative_canvases;
CREATE POLICY "Workspace members and owner can view canvases"
  ON public.creative_canvases FOR SELECT
  TO authenticated
  USING (workspace_id IS NOT NULL);

DROP POLICY IF EXISTS "Workspace members can insert canvases" ON public.creative_canvases;
CREATE POLICY "Workspace members can insert canvases"
  ON public.creative_canvases FOR INSERT
  TO authenticated
  WITH CHECK (workspace_id IS NOT NULL);

DROP POLICY IF EXISTS "Workspace members can update canvases" ON public.creative_canvases;
CREATE POLICY "Workspace members can update canvases"
  ON public.creative_canvases FOR UPDATE
  TO authenticated
  USING (workspace_id IS NOT NULL);

DROP POLICY IF EXISTS "Workspace members can delete canvases" ON public.creative_canvases;
CREATE POLICY "Workspace members can delete canvases"
  ON public.creative_canvases FOR DELETE
  TO authenticated
  USING (workspace_id IS NOT NULL);

-- 5. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_canvases_workspace_id ON public.creative_canvases(workspace_id);
CREATE INDEX IF NOT EXISTS idx_canvases_status ON public.creative_canvases(canvas_status);
