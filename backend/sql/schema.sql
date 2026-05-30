create extension if not exists pgcrypto;

create table if not exists invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  label text,
  disabled_at timestamptz,
  disabled_reason text,
  max_sessions integer not null default 1,
  current_sessions integer not null default 0,
  daily_message_limit integer not null default 200,
  daily_image_limit integer not null default 20,
  device_binding_required boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  invite_code_id uuid not null references invite_codes(id) on delete cascade,
  token_hash text not null unique,
  device_id_hash text,
  ip_hash text,
  user_agent text,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists sessions_invite_code_id_idx on sessions(invite_code_id);
create index if not exists sessions_expires_at_idx on sessions(expires_at);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_session_id_updated_at_idx on conversations(session_id, updated_at desc);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('system', 'user', 'assistant')),
  content text not null,
  message_type text not null default 'text' check (message_type in ('text', 'image')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_id_created_at_idx on messages(conversation_id, created_at asc);

create table if not exists image_generations (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  session_id uuid not null references sessions(id) on delete cascade,
  prompt text not null,
  image_url text not null,
  provider text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists image_generations_session_id_created_at_idx on image_generations(session_id, created_at desc);

create table if not exists usage_counters (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('invite', 'session')),
  subject_id uuid not null,
  counter_date date not null default current_date,
  kind text not null check (kind in ('chat', 'image')),
  count integer not null default 0,
  unique (subject_type, subject_id, counter_date, kind)
);
