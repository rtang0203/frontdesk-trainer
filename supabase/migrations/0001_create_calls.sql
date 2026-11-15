create table calls (
  id                   uuid primary key default gen_random_uuid(),
  org_id               text not null default 'demo',
  retell_call_id       text not null unique,
  retell_agent_id      text,
  scenario_id          text not null,
  call_type            text,
  direction            text,
  from_number          text,
  to_number            text,
  status               text not null,
  started_at           timestamptz,
  ended_at             timestamptz,
  duration_ms          integer,
  disconnection_reason text,
  transcript           text,
  transcript_object    jsonb,
  scorecard            jsonb,
  passed               integer,
  applicable           integer,
  scoring_model        text,
  scoring_latency_ms   integer,
  scoring_error        text,
  raw_payload          jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index calls_org_created_idx on calls (org_id, created_at desc);

alter table calls enable row level security;

-- The Supabase project does not auto-expose new tables to the Data API,
-- so grant the server's role explicitly. anon and authenticated get nothing,
-- including the default TRUNCATE/REFERENCES/TRIGGER privileges.
revoke all on calls from anon, authenticated;
grant select, insert, update on calls to service_role;

-- The stale-call rules read updated_at, so the database stamps it on every
-- update instead of trusting each writer to remember.
create function calls_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger calls_set_updated_at
  before update on calls
  for each row execute function calls_set_updated_at();
