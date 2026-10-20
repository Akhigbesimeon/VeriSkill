-- ─────────────────────────────────────────────────────────────────────────────
-- Supabase pg_cron scheduling for VeriSkill (ADR-016)
--
-- Run this ONCE in the Supabase SQL Editor against each environment
-- (staging, production). This file is not part of the sequelize-cli
-- migration chain because:
--   1. pg_cron / pg_net require the postgres superuser role.
--   2. The schedule depends on environment-specific URLs & secrets, which
--      do not belong in version-controlled migrations.
--
-- Replace the two placeholders before running:
--   <RENDER_BACKEND_URL>  e.g. https://veriskill-backend.onrender.com
--   <CRON_SECRET>         the same value set in Render's env (CRON_SECRET)
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Clear any previously scheduled VeriSkill jobs so this script is idempotent.
do $$
declare job_record record;
begin
  for job_record in
    select jobname from cron.job where jobname like 'veriskill-%'
  loop
    perform cron.unschedule(job_record.jobname);
  end loop;
end $$;

-- ── Monthly URL freshness check ──────────────────────────────────────────────
-- 02:00 UTC on the 1st of every month.
select cron.schedule(
  'veriskill-url-freshness',
  '0 2 1 * *',
  $$
  select net.http_post(
    url := '<RENDER_BACKEND_URL>/internal/cron/url-freshness',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <CRON_SECRET>',
      'Content-Type',  'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- ── Quarterly GitHub rescan ──────────────────────────────────────────────────
-- 03:00 UTC on the 1st of Jan, Apr, Jul, Oct.
select cron.schedule(
  'veriskill-github-rescan',
  '0 3 1 1,4,7,10 *',
  $$
  select net.http_post(
    url := '<RENDER_BACKEND_URL>/internal/cron/github-rescan',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <CRON_SECRET>',
      'Content-Type',  'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- ── Keep-alive heartbeat ─────────────────────────────────────────────────────
-- Every 10 minutes. Also keeps the Supabase project out of the 7-day
-- inactivity pause by issuing a query (the cron.schedule row itself logs
-- an activity record each run). The /health response is discarded.
select cron.schedule(
  'veriskill-render-heartbeat',
  '*/10 * * * *',
  $$
  select net.http_get(
    url := '<RENDER_BACKEND_URL>/health',
    timeout_milliseconds := 15000
  );
  $$
);

-- Verify
select jobname, schedule, active from cron.job where jobname like 'veriskill-%';
