-- 让 Agent G 对话表与服务端写入的记录结构一致（server/routes/agentConversationRoutes.ts）。
-- 之前缺列导致云端写入全部失败、回落到服务器本地文件，Cloud Run 重启或重新部署后对话就会丢失。

-- 会话：模型与供应商信息
alter table public.agent_conversations
  add column if not exists provider text not null default 'openai',
  add column if not exists model text not null default 'gpt-6',
  add column if not exists provider_conversation_id text,
  add column if not exists previous_response_id text;

create index if not exists agent_conversations_user_canvas_updated_idx
  on public.agent_conversations (user_id, canvas_id, updated_at desc);

-- 消息：代码使用 role / user_id，content 为 JSON（{ text, model, ... }）
alter table public.agent_messages
  add column if not exists role text,
  add column if not exists user_id uuid;

update public.agent_messages set role = sender where role is null;

alter table public.agent_messages
  alter column sender drop not null,
  drop constraint if exists agent_messages_sender_check;

alter table public.agent_messages
  drop constraint if exists agent_messages_role_check;
alter table public.agent_messages
  add constraint agent_messages_role_check check (role in ('user', 'assistant', 'system', 'tool'));

update public.agent_messages m
  set user_id = c.user_id
  from public.agent_conversations c
  where m.conversation_id = c.id and m.user_id is null;

alter table public.agent_messages
  alter column content type jsonb
  using case
    when content ~ '^\s*\{' then content::jsonb
    else jsonb_build_object('text', content)
  end;

create index if not exists agent_messages_conversation_created_idx
  on public.agent_messages (conversation_id, created_at);
