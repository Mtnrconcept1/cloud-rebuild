begin;

create table if not exists public.tok_connect_mcp_action_idempotency (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  operation text not null,
  request_hash text not null,
  response_body jsonb,
  status_code integer,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint tok_connect_mcp_action_idempotency_key_length
    check (char_length(idempotency_key) between 8 and 120),
  constraint tok_connect_mcp_action_idempotency_status_code
    check (status_code is null or status_code between 100 and 599),
  unique (user_id, idempotency_key)
);

create index if not exists idx_tok_connect_mcp_action_idempotency_expiry
  on public.tok_connect_mcp_action_idempotency (expires_at);

alter table public.tok_connect_mcp_action_idempotency enable row level security;

revoke all on table public.tok_connect_mcp_action_idempotency from public, anon, authenticated;
grant all on table public.tok_connect_mcp_action_idempotency to service_role;

comment on table public.tok_connect_mcp_action_idempotency is
  'Server-only idempotency store for authenticated TOK Connect MCP mutations.';

commit;
