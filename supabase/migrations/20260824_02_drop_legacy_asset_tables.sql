-- Migration: 20260824_02_drop_legacy_asset_tables.sql
-- MANWAH 生产数据库统一收敛：删除旧资产表

begin;

drop table if exists public.model_assets;
drop table if exists public.pose_assets;
drop table if exists public.scene_assets;
drop table if exists public.scene_styles;

commit;
