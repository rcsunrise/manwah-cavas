-- Migration: 20260824_01_reset_canvas_test_data.sql
-- MANWAH 生产数据库统一收敛：清空无限画布测试数据

begin;

-- Agent 测试数据
delete from public.agent_messages;
delete from public.agent_conversations;

-- 删除 Copy SKU，依靠外键级联删除对应 Copy Versions。
-- 不直接删除 copy_versions，避免不可变 Trigger 拦截。
delete from public.copy_skus;

-- 防止留下孤立文案版本
do $$
begin
  if exists (
    select 1
    from public.copy_versions
    limit 1
  ) then
    raise exception
      'RESET_ABORTED: copy_versions still contains rows after copy_skus cleanup';
  end if;
end $$;

-- Revision 测试数据
delete from public.canvas_revisions;

-- 无限画布测试数据
delete from public.creative_canvases;
delete from public.creative_projects;

commit;
