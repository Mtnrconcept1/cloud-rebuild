-- Enforce idempotent MCP agent-run creation without rewriting or deleting data.
--
-- `tok-connect-mcp` stores the stable caller and request key in the JSONB input
-- so that both Supabase OAuth users and legacy B2B partners share the same
-- replay semantics. PostgreSQL 17's NULLS NOT DISTINCT also protects future
-- global tools whose runs do not belong to a restaurant.

do $migration$
declare
  duplicate_group_count bigint;
begin
  if to_regclass('public.tok_connect_agent_runs') is null then
    raise exception 'public.tok_connect_agent_runs must exist before applying this migration';
  end if;

  select count(*)
    into duplicate_group_count
  from (
    select
      restaurant_id,
      tool_name,
      btrim(input ->> 'actor_id') as actor_id,
      btrim(input ->> 'idempotency_key') as idempotency_key
    from public.tok_connect_agent_runs
    where jsonb_typeof(input) = 'object'
      and nullif(btrim(input ->> 'actor_id'), '') is not null
      and nullif(btrim(input ->> 'idempotency_key'), '') is not null
    group by
      restaurant_id,
      tool_name,
      btrim(input ->> 'actor_id'),
      btrim(input ->> 'idempotency_key')
    having count(*) > 1
  ) as duplicate_groups;

  if duplicate_group_count > 0 then
    raise exception 'cannot enforce TOK Connect MCP idempotency: % duplicate key group(s) already exist',
      duplicate_group_count
      using
        detail = 'No row was changed or deleted by this migration.',
        hint = 'Inspect duplicate tok_connect_agent_runs groups and reconcile them explicitly before retrying.';
  end if;
end
$migration$;

create unique index if not exists uq_tok_connect_agent_runs_mcp_idempotency
  on public.tok_connect_agent_runs (
    restaurant_id,
    tool_name,
    (btrim(input ->> 'actor_id')),
    (btrim(input ->> 'idempotency_key'))
  ) nulls not distinct
  where jsonb_typeof(input) = 'object'
    and nullif(btrim(input ->> 'actor_id'), '') is not null
    and nullif(btrim(input ->> 'idempotency_key'), '') is not null;

comment on index public.uq_tok_connect_agent_runs_mcp_idempotency is
  'Prevents duplicate MCP agent runs for the same restaurant, tool, actor and idempotency key.';
