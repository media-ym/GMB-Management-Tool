-- ═══════════════════════════════════════════════════════════════════════════
-- MyFNG GMB — Supabase pg_cron jobs (HTTP → https://gmb.myfng.in/api/cron/*)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- COPY-PASTE: Supabase Dashboard → SQL Editor → Run (poora script ek saath)
--
-- Pehle check karo (Database → Extensions):
--   ✓ pg_cron  — installed
--   ✓ pg_net   — enabled (HTTP calls ke liye zaroori)
--
-- CRON_SECRET yahan aur gmb.myfng.in .env dono jagah SAME hona chahiye.
-- ON/OFF / Run now: gmb.myfng.in → System → Jobs tab
--
-- ┌────────────────────────────┬─────────────────────┬──────────────────────────────┐
-- │ Job name                   │ Schedule (UTC)      │ Kya karta hai                │
-- ├────────────────────────────┼─────────────────────┼──────────────────────────────┤
-- │ myfng-sync-all             │ 0 */2 * * *         │ Full Google sync (har 2 ghante)│
-- │ myfng-publish-scheduled    │ */15 * * * *        │ Scheduled posts publish      │
-- │ myfng-auto-reply-reviews   │ */30 * * * *        │ Pending reviews auto-reply   │
-- │ myfng-auto-post-daily      │ 0 * * * *           │ MiSA daily AI posts (IST hr) │
-- │ myfng-drift-detection      │ 0 2 * * *           │ Profile drift (2AM UTC=7:30 IST)│
-- └────────────────────────────┴─────────────────────┴──────────────────────────────┘
--
-- Safe to re-run: purane myfng-* jobs delete karke naye schedule karta hai.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  app_url text := 'https://gmb.myfng.in';
  cron_secret text := 'ea47e15b27d8983f248ee84ddd121578';
  r record;
BEGIN
  IF cron_secret IS NULL OR length(trim(cron_secret)) < 8 THEN
    RAISE EXCEPTION 'cron_secret empty hai — .env se CRON_SECRET paste karo';
  END IF;

  -- Purane MyFNG jobs hatao (dobara run karne par safe)
  FOR r IN SELECT jobname FROM cron.job WHERE jobname LIKE 'myfng-%'
  LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;

  -- 1) Full Google Sync — reviews, posts, photos, analytics, profile
  --    Har 2 ghante (UTC). Last run: System → Cron Jobs
  PERFORM cron.schedule(
    'myfng-sync-all',
    '0 */2 * * *',
    format(
      $sql$SELECT net.http_get(url := %L, headers := jsonb_build_object('x-cron-secret', %L));$sql$,
      app_url || '/api/cron/sync-all',
      cron_secret
    )
  );

  -- 2) Publish Scheduled Posts — Content → Posts queue
  --    Har 15 minute
  PERFORM cron.schedule(
    'myfng-publish-scheduled',
    '*/15 * * * *',
    format(
      $sql$SELECT net.http_get(url := %L, headers := jsonb_build_object('x-cron-secret', %L));$sql$,
      app_url || '/api/cron/publish-scheduled',
      cron_secret
    )
  );

  -- 3) Auto-Reply Reviews — template rules (Reviews → Auto Replies)
  --    Har 30 minute
  PERFORM cron.schedule(
    'myfng-auto-reply-reviews',
    '*/30 * * * *',
    format(
      $sql$SELECT net.http_get(url := %L, headers := jsonb_build_object('x-cron-secret', %L));$sql$,
      app_url || '/api/cron/auto-reply-reviews',
      cron_secret
    )
  );

  -- 4) Daily MiSA Auto-Posts — AI post per location, direct publish
  --    Har ghanta check; actual IST hour app settings se (Content → Auto Posts)
  PERFORM cron.schedule(
    'myfng-auto-post-daily',
    '0 * * * *',
    format(
      $sql$SELECT net.http_get(url := %L, headers := jsonb_build_object('x-cron-secret', %L));$sql$,
      app_url || '/api/cron/auto-post-daily',
      cron_secret
    )
  );

  -- 5) Profile Drift Detection — Google vs cached listing compare
  --    Roz 2:00 AM UTC (= 7:30 AM IST)
  PERFORM cron.schedule(
    'myfng-drift-detection',
    '0 2 * * *',
    format(
      $sql$SELECT net.http_get(url := %L, headers := jsonb_build_object('x-cron-secret', %L));$sql$,
      app_url || '/api/cron/drift-detection',
      cron_secret
    )
  );

  RAISE NOTICE 'MyFNG cron jobs scheduled for %', app_url;
END $$;

-- ── Verify: 5 jobs dikhne chahiye, active = true ───────────────────────────
SELECT
  jobid,
  jobname,
  schedule,
  active,
  LEFT(command, 80) AS command_preview
FROM cron.job
WHERE jobname LIKE 'myfng-%'
ORDER BY jobname;

-- ── Optional: last HTTP responses (200 = OK) ───────────────────────────────
-- SELECT id, status_code, error_msg, created
-- FROM net._http_response
-- ORDER BY created DESC
-- LIMIT 20;

-- ═══════════════════════════════════════════════════════════════════════════
-- App user ko cron ON/OFF + status UI ke liye permission (ek baar chalao)
-- Bina iske gmb.myfng.in → System → Cron Jobs "permission denied" dikhayega
-- ═══════════════════════════════════════════════════════════════════════════
GRANT USAGE ON SCHEMA cron TO myfng_app;
GRANT SELECT ON ALL TABLES IN SCHEMA cron TO myfng_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA cron TO myfng_app;

GRANT USAGE ON SCHEMA net TO myfng_app;
GRANT SELECT ON net._http_response TO myfng_app;
