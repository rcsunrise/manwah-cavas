-- Migration: 20260824_05_drop_legacy_runtime_objects.sql
-- MANWAH 生产数据库统一收敛：彻底删除旧运行对象 (禁止使用 CASCADE)

begin;

drop table if exists public.projects;
drop table if exists public.project_dna;
drop table if exists public.product_visual_dna;
drop table if exists public.project_assets;
drop table if exists public.detail_render_jobs;

commit;
