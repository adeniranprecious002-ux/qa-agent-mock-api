-- QA-Agent schema
-- Run this in the Supabase SQL editor for your project.

create extension if not exists "pgcrypto";

create table if not exists qa_checks (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null,
  checked_at timestamptz not null default now(),
  status text not null check (status in ('pass', 'anomaly', 'fail')),
  expected_value numeric,
  actual_value numeric,
  delta numeric,
  severity text check (severity in ('none', 'medium', 'high')),
  ai_explanation jsonb,
  raw_response jsonb,

  -- Generated column used to dedupe alerts at the DB layer instead of
  -- in application logic (matches the pattern from the FinanceBot build):
  -- one row per endpoint per hour, so a flapping value or a workflow
  -- retry can't spam duplicate alerts.
  checked_hour text generated always as (to_char(checked_at, 'YYYY-MM-DD-HH24')) stored
);

create unique index if not exists qa_checks_dedupe
  on qa_checks (endpoint, checked_hour, status);

create index if not exists qa_checks_severity_idx on qa_checks (severity);
create index if not exists qa_checks_checked_at_idx on qa_checks (checked_at desc);

-- Convenience view for the dashboard: last 100 checks, newest first.
create or replace view qa_checks_recent as
  select *
  from qa_checks
  order by checked_at desc
  limit 100;

-- Row-level security: allow read with the anon key (dashboard),
-- writes only via the service role key (n8n).
alter table qa_checks enable row level security;

create policy "Allow anon read" on qa_checks
  for select
  using (true);

create policy "Allow service role insert" on qa_checks
  for insert
  with check (auth.role() = 'service_role');
