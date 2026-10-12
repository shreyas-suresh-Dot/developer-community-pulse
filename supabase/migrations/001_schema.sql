-- Developer Community Pulse: schema, row-level security and pipeline write functions.
-- Applied to Supabase project dvoypzspyokmxusjhoza (ap-south-1).
create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- Config: what Sumit monitors (editable in the Supabase Table Editor, no code changes) ----------
create table public.topic_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger topic_categories_updated_at before update on public.topic_categories
  for each row execute function public.set_updated_at();

create table public.topic_keywords (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.topic_categories(id) on delete cascade,
  keyword text not null check (length(trim(keyword)) between 2 and 80),
  requires_context boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, keyword)
);
create index topic_keywords_category_idx on public.topic_keywords(category_id);
create trigger topic_keywords_updated_at before update on public.topic_keywords
  for each row execute function public.set_updated_at();

-- Generic keywords (e.g. "false positive") only count when one of these domain terms appears in the same post.
create table public.context_terms (
  term text primary key check (length(trim(term)) between 2 and 40),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.community_sources (
  slug text primary key check (slug in ('hackernews', 'stackoverflow', 'devto')),
  name text not null,
  is_active boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create trigger community_sources_updated_at before update on public.community_sources
  for each row execute function public.set_updated_at();

-- ---------- Collected data ----------
create table public.mentions (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('hackernews', 'stackoverflow', 'devto')),
  external_id text not null,
  kind text not null check (kind in ('story', 'comment', 'question', 'article')),
  thread_key text not null,
  thread_title text not null,
  url text not null,
  excerpt text not null default '',
  author text,
  posted_at timestamptz not null,
  engagement jsonb not null default '{}'::jsonb,
  matched_keywords text[] not null default '{}',
  matched_categories text[] not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (source, external_id)
);
create index mentions_posted_at_idx on public.mentions(posted_at desc);
create index mentions_thread_key_idx on public.mentions(thread_key);

-- AI classification cache, one row per discussion thread (re-used across runs; invalidated when the topic config changes).
create table public.thread_insights (
  thread_key text primary key,
  config_hash text not null,
  model text not null,
  classified_at timestamptz not null default now(),
  insight jsonb not null
);

create table public.briefs (
  id uuid primary key default gen_random_uuid(),
  week_end date not null unique,
  week_start date not null,
  status text not null check (status in ('complete', 'partial', 'failed')),
  trigger text not null check (trigger in ('cron', 'manual', 'backfill')),
  generated_at timestamptz not null default now(),
  stats jsonb not null default '{}'::jsonb,
  analysis jsonb,
  quality jsonb not null default '{}'::jsonb,
  delivery jsonb not null default '{}'::jsonb,
  run_id uuid
);

create table public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null check (trigger in ('cron', 'manual', 'backfill')),
  week_end date not null,
  status text not null default 'running' check (status in ('running', 'complete', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  steps jsonb not null default '[]'::jsonb,
  error text,
  brief_id uuid references public.briefs(id) on delete set null
);
create index pipeline_runs_started_idx on public.pipeline_runs(started_at desc);

-- ---------- Row-level security: the public (publishable) key can only READ ----------
alter table public.topic_categories enable row level security;
alter table public.topic_keywords enable row level security;
alter table public.context_terms enable row level security;
alter table public.community_sources enable row level security;
alter table public.mentions enable row level security;
alter table public.thread_insights enable row level security;
alter table public.briefs enable row level security;
alter table public.pipeline_runs enable row level security;

create policy "public read" on public.topic_categories for select to anon, authenticated using (true);
create policy "public read" on public.topic_keywords for select to anon, authenticated using (true);
create policy "public read" on public.context_terms for select to anon, authenticated using (true);
create policy "public read" on public.community_sources for select to anon, authenticated using (true);
create policy "public read" on public.mentions for select to anon, authenticated using (true);
create policy "public read" on public.thread_insights for select to anon, authenticated using (true);
create policy "public read" on public.briefs for select to anon, authenticated using (true);
create policy "public read" on public.pipeline_runs for select to anon, authenticated using (true);

-- ---------- Writes: only via these functions, which require a server-held pipeline token ----------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.app_secrets (
  name text primary key,
  sha256_hex text not null,
  created_at timestamptz not null default now()
);
-- The token's SHA-256 is inserted out-of-band (never committed):
--   insert into private.app_secrets (name, sha256_hex) values ('pipeline_token', '<sha256 hex of PIPELINE_DB_TOKEN>');

create or replace function private.assert_pipeline_token(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null or not exists (
    select 1 from private.app_secrets s
    where s.name = 'pipeline_token'
      and s.sha256_hex = encode(extensions.digest(p_token, 'sha256'), 'hex')
  ) then
    raise exception 'invalid pipeline token' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.pipeline_start_run(p_token text, p_trigger text, p_week_end date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.assert_pipeline_token(p_token);
  insert into public.pipeline_runs (trigger, week_end) values (p_trigger, p_week_end) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.pipeline_update_run(
  p_token text, p_run_id uuid, p_status text, p_steps jsonb, p_error text default null, p_brief_id uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_pipeline_token(p_token);
  update public.pipeline_runs r set
    status = p_status,
    steps = coalesce(p_steps, r.steps),
    error = p_error,
    brief_id = coalesce(p_brief_id, r.brief_id),
    finished_at = case when p_status = 'running' then null else now() end
  where r.id = p_run_id;
end;
$$;

create or replace function public.pipeline_upsert_mentions(p_token text, p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  perform private.assert_pipeline_token(p_token);
  insert into public.mentions (
    source, external_id, kind, thread_key, thread_title, url, excerpt, author, posted_at,
    engagement, matched_keywords, matched_categories
  )
  select m.source, m.external_id, m.kind, m.thread_key, m.thread_title, m.url, coalesce(m.excerpt, ''), m.author,
         m.posted_at, coalesce(m.engagement, '{}'::jsonb), coalesce(m.matched_keywords, '{}'), coalesce(m.matched_categories, '{}')
  from jsonb_to_recordset(p_rows) as m(
    source text, external_id text, kind text, thread_key text, thread_title text, url text, excerpt text,
    author text, posted_at timestamptz, engagement jsonb, matched_keywords text[], matched_categories text[]
  )
  on conflict (source, external_id) do update set
    thread_title = excluded.thread_title,
    url = excluded.url,
    excerpt = excluded.excerpt,
    engagement = excluded.engagement,
    matched_keywords = excluded.matched_keywords,
    matched_categories = excluded.matched_categories,
    last_seen_at = now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.pipeline_upsert_insights(p_token text, p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  perform private.assert_pipeline_token(p_token);
  insert into public.thread_insights (thread_key, config_hash, model, insight, classified_at)
  select i.thread_key, i.config_hash, i.model, i.insight, now()
  from jsonb_to_recordset(p_rows) as i(thread_key text, config_hash text, model text, insight jsonb)
  on conflict (thread_key) do update set
    config_hash = excluded.config_hash,
    model = excluded.model,
    insight = excluded.insight,
    classified_at = now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.pipeline_save_brief(p_token text, p_brief jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.assert_pipeline_token(p_token);
  insert into public.briefs (week_end, week_start, status, trigger, stats, analysis, quality, delivery, run_id, generated_at)
  values (
    (p_brief->>'week_end')::date,
    (p_brief->>'week_start')::date,
    p_brief->>'status',
    p_brief->>'trigger',
    coalesce(p_brief->'stats', '{}'::jsonb),
    p_brief->'analysis',
    coalesce(p_brief->'quality', '{}'::jsonb),
    coalesce(p_brief->'delivery', '{}'::jsonb),
    nullif(p_brief->>'run_id', '')::uuid,
    now()
  )
  on conflict (week_end) do update set
    week_start = excluded.week_start,
    status = excluded.status,
    trigger = excluded.trigger,
    stats = excluded.stats,
    analysis = excluded.analysis,
    quality = excluded.quality,
    delivery = excluded.delivery,
    run_id = excluded.run_id,
    generated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.pipeline_set_delivery(p_token text, p_brief_id uuid, p_delivery jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_pipeline_token(p_token);
  update public.briefs set delivery = p_delivery where id = p_brief_id;
end;
$$;

notify pgrst, 'reload schema';
