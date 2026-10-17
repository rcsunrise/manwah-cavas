-- Migration: 20261017_create_user_devices_schema.sql
-- Manwah Cavas | Local Asset Bridge 设备绑定与安全连接授权表

begin;

create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_name text not null,
  device_fingerprint text not null,
  device_token text not null unique,
  status text not null default 'offline' check (status in ('online', 'offline')),
  authorized_directories jsonb not null default '[]'::jsonb,
  last_ip text,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 设备一次性配对码临时表 (5 分钟有效期)
create table if not exists public.device_pair_codes (
  code text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.user_devices enable row level security;
alter table public.device_pair_codes enable row level security;

-- Policies for user_devices
drop policy if exists "Users can manage own devices" on public.user_devices;
create policy "Users can manage own devices"
  on public.user_devices for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Policies for device_pair_codes
drop policy if exists "Users can manage own pair codes" on public.device_pair_codes;
create policy "Users can manage own pair codes"
  on public.device_pair_codes for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Indexes
create index if not exists idx_user_devices_user on public.user_devices(user_id, status);
create index if not exists idx_device_pair_codes_expiry on public.device_pair_codes(expires_at);

commit;
