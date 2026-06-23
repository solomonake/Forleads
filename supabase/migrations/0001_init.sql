-- ============================================================================
-- Forleads — schema (docs/Forleads_Architecture_v1.md §5 +
-- _ProductionMarketPlan_ §5). PostGIS + pgvector + RLS-ready, tenant/agent
-- scoped, with idempotency keys for connector writes. Every money/market claim
-- carries source + confidence all the way to the row.
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists postgis;
create extension if not exists vector;

-- ---- Identity ---------------------------------------------------------------
create table if not exists agent (
  id              uuid primary key default uuid_generate_v4(),
  auth_uid        uuid unique,                 -- maps to auth.users.id for RLS
  name            text not null,
  email           text not null,
  brand_voice     text not null default 'warm_local'
                    check (brand_voice in ('warm_local','crisp_pro','luxury')),
  signature_html  text,
  locale          text not null default 'en-US',
  mode            text not null default 'crm' check (mode in ('crm','overlay')),
  created_at      timestamptz not null default now()
);

-- ---- Connectors -------------------------------------------------------------
create table if not exists connector_account (
  id                   uuid primary key default uuid_generate_v4(),
  agent_id             uuid not null references agent(id) on delete cascade,
  provider             text not null
                         check (provider in ('google','microsoft','followupboss','gohighlevel','twilio','zapier')),
  scopes               text[] not null default '{}',
  status               text not null default 'mock'
                         check (status in ('connected','mock','needs_setup','error','not_connected')),
  credentials_ref      text not null,          -- pointer to vault; NEVER raw secrets
  capabilities         text[] not null default '{}',
  last_healthcheck_at  timestamptz,
  created_at           timestamptz not null default now(),
  unique (agent_id, provider)
);

-- ---- The spatial unit -------------------------------------------------------
create table if not exists lead_surface (
  id             uuid primary key default uuid_generate_v4(),
  agent_id       uuid not null references agent(id) on delete cascade,
  geom           geography(Point, 4326) not null,
  address        text not null,
  locality       text,
  h3_index       text not null,
  status         text not null default 'new'
                   check (status in ('new','researching','contacted','nurturing','appointment','won','dead')),
  label          text,
  contact_json   jsonb,                          -- {name,email,phone,optOutEmail,optOutSms}
  first_seen_at  timestamptz not null default now(),
  last_worked_at timestamptz not null default now()
);
create index if not exists lead_surface_geom_gix on lead_surface using gist (geom);
create index if not exists lead_surface_h3_ix on lead_surface (h3_index);
create index if not exists lead_surface_agent_ix on lead_surface (agent_id);

-- ---- Grounded evidence (never a naked number) -------------------------------
create table if not exists evidence_card (
  id               uuid primary key default uuid_generate_v4(),
  lead_surface_id  uuid not null references lead_surface(id) on delete cascade,
  scout            text not null check (scout in ('property','imagery','people','market','risk')),
  claim            text not null,
  value_json       jsonb,                         -- null ONLY when confidence='D'
  source_json      jsonb not null default '[]',   -- [{name,url,as_of}]
  confidence       text not null check (confidence in ('A','B','C','D')),
  reasoning        text,
  created_at       timestamptz not null default now(),
  -- The "no fabrication" contract, enforced at the row level:
  constraint evidence_contract check (
    (confidence = 'D' and value_json is null)
    or (confidence <> 'D' and value_json is not null and jsonb_array_length(source_json) >= 1)
  )
);
create index if not exists evidence_lead_ix on evidence_card (lead_surface_id);

-- ---- Notes & situations -----------------------------------------------------
create table if not exists note (
  id               uuid primary key default uuid_generate_v4(),
  lead_surface_id  uuid not null references lead_surface(id) on delete cascade,
  agent_id         uuid not null references agent(id) on delete cascade,
  body             text not null,
  modality         text not null default 'text' check (modality in ('text','voice')),
  situation        text,
  created_at       timestamptz not null default now()
);

-- ---- Loops ------------------------------------------------------------------
create table if not exists loop_definition (
  id              uuid primary key default uuid_generate_v4(),
  agent_id        uuid not null references agent(id) on delete cascade,
  name            text not null,
  description     text,
  trigger_json    jsonb not null,
  conditions_json jsonb not null default '[]',
  actions_json    jsonb not null default '[]',
  cadence_json    jsonb,
  active          boolean not null default true,
  stats_json      jsonb not null default '{"runs":0,"approved":0,"replies":0,"blocked":0}',
  created_at      timestamptz not null default now()
);

create table if not exists loop_run (
  id                 uuid primary key default uuid_generate_v4(),
  loop_definition_id uuid not null references loop_definition(id) on delete cascade,
  agent_id           uuid not null references agent(id) on delete cascade,
  lead_surface_id    uuid references lead_surface(id) on delete set null,
  status             text not null
                       check (status in ('started','skipped_condition','produced_artifact','blocked_compliance','completed','error')),
  planner_trace      jsonb not null default '[]',
  artifact_ids       uuid[] not null default '{}',
  started_at         timestamptz not null default now(),
  completed_at       timestamptz
);
create index if not exists loop_run_agent_ix on loop_run (agent_id, started_at desc);

-- ---- Artifacts (drafts) -----------------------------------------------------
create table if not exists artifact (
  id                uuid primary key default uuid_generate_v4(),
  agent_id          uuid not null references agent(id) on delete cascade,
  lead_surface_id   uuid references lead_surface(id) on delete set null,
  loop_run_id       uuid references loop_run(id) on delete set null,
  type              text not null check (type in ('email','sms','task','calendar','crm_note')),
  status            text not null default 'drafted'
                      check (status in ('drafted','blocked','approved','sent','cancelled','snoozed')),
  payload_json      jsonb not null,
  evidence_used     jsonb not null default '[]',
  compliance_result jsonb not null,            -- {pass, flags[], linterVersion}
  model_trace       jsonb not null,            -- {model, promptVersion, mode}
  external_draft_ref jsonb,                    -- {provider, externalId, url, idempotencyKey}
  trace_id          uuid,
  created_at        timestamptz not null default now(),
  approved_at       timestamptz,
  sent_at           timestamptz,
  snooze_until      timestamptz,
  -- Fail-closed at the DB: an artifact cannot be approved/sent if compliance failed.
  constraint compliance_gate check (
    status not in ('approved','sent') or (compliance_result->>'pass')::boolean = true
  )
);
create index if not exists artifact_agent_ix on artifact (agent_id, created_at desc);

-- ---- Connector writes (idempotency ledger) ----------------------------------
create table if not exists connector_write (
  id               uuid primary key default uuid_generate_v4(),
  agent_id         uuid not null references agent(id) on delete cascade,
  artifact_id      uuid references artifact(id) on delete set null,
  provider         text not null,
  idempotency_key  text not null,
  external_id      text,
  status           text not null default 'ok',
  created_at       timestamptz not null default now(),
  unique (idempotency_key)                       -- retries never duplicate side effects
);

-- ---- Domain events (append-only bus) ----------------------------------------
create table if not exists domain_event (
  id               uuid primary key default uuid_generate_v4(),
  agent_id         uuid not null references agent(id) on delete cascade,
  lead_surface_id  uuid references lead_surface(id) on delete set null,
  type             text not null,
  payload          jsonb not null default '{}',
  source           text not null,
  created_at       timestamptz not null default now()
);
create index if not exists domain_event_agent_ix on domain_event (agent_id, created_at desc);

-- ---- Agent traces ("why this happened") -------------------------------------
create table if not exists agent_trace (
  id                   uuid primary key default uuid_generate_v4(),
  agent_id             uuid not null references agent(id) on delete cascade,
  artifact_id          uuid references artifact(id) on delete cascade,
  loop_run_id          uuid references loop_run(id) on delete set null,
  trigger              text not null,
  situation            text,
  situation_confidence numeric,
  evidence_used        jsonb not null default '[]',
  excluded             jsonb not null default '[]',
  policy               jsonb not null default '[]',
  connector            jsonb,
  cost                 jsonb not null default '{}',
  created_at           timestamptz not null default now()
);

-- ---- Standing watchers ------------------------------------------------------
create table if not exists watcher (
  id           uuid primary key default uuid_generate_v4(),
  agent_id     uuid not null references agent(id) on delete cascade,
  name         text not null,
  criteria_json jsonb not null,
  area_geom    geography(Polygon, 4326),
  area_label   text,
  last_run_at  timestamptz,
  active       boolean not null default true,
  hits         integer not null default 0,
  created_at   timestamptz not null default now()
);

-- ---- Memory (RAG) -----------------------------------------------------------
create table if not exists memory_chunk (
  id               uuid primary key default uuid_generate_v4(),
  agent_id         uuid not null references agent(id) on delete cascade,
  lead_surface_id  uuid references lead_surface(id) on delete set null,
  content          text not null,
  embedding        vector(1024),                -- BGE-M3 dim
  kind             text,
  created_at       timestamptz not null default now()
);
create index if not exists memory_chunk_agent_ix on memory_chunk (agent_id);

-- ---- Reports ----------------------------------------------------------------
create table if not exists report (
  id            uuid primary key default uuid_generate_v4(),
  agent_id      uuid not null references agent(id) on delete cascade,
  period_start  timestamptz not null,
  period_end    timestamptz not null,
  metrics_json  jsonb not null,
  insights_json jsonb not null default '[]',
  recs_json     jsonb not null default '[]',
  generated_at  timestamptz not null default now()
);
