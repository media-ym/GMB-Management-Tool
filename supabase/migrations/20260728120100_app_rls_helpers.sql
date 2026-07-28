-- MyFNG GMB — RLS helpers for public app tables
-- Prisma (DATABASE_URL as postgres/superuser) bypasses RLS on the server.
-- These policies protect PostgREST / anon-key direct access.

-- Helper: current app role from JWT user_metadata or public."User"
CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'role'),
    (SELECT u.role FROM public."User" u WHERE u."authId" = auth.uid()::text LIMIT 1),
    'viewer'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_app_role() IN ('super_admin', 'marketing_manager');
$$;

-- Enable RLS on core tables (idempotent). Prisma server role still bypasses.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'User', 'Location', 'GoogleBusinessProfile', 'Review', 'Post',
    'MediaLibrary', 'Notification', 'AuditLog', 'Client', 'ClientAuthorization'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- Authenticated users can read their own User row
DROP POLICY IF EXISTS "Users read own profile" ON public."User";
CREATE POLICY "Users read own profile"
  ON public."User" FOR SELECT TO authenticated
  USING ("authId" = auth.uid()::text OR public.is_app_admin());

DROP POLICY IF EXISTS "Admins manage users" ON public."User";
CREATE POLICY "Admins manage users"
  ON public."User" FOR ALL TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

-- Authenticated staff can read operational tables; writes via service role / Prisma
DROP POLICY IF EXISTS "Staff read locations" ON public."Location";
CREATE POLICY "Staff read locations"
  ON public."Location" FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Staff read reviews" ON public."Review";
CREATE POLICY "Staff read reviews"
  ON public."Review" FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Staff read posts" ON public."Post";
CREATE POLICY "Staff read posts"
  ON public."Post" FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Staff read media" ON public."MediaLibrary";
CREATE POLICY "Staff read media"
  ON public."MediaLibrary" FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Staff read notifications" ON public."Notification";
CREATE POLICY "Staff read notifications"
  ON public."Notification" FOR SELECT TO authenticated
  USING ("userId" IS NULL OR "userId" IN (
    SELECT id FROM public."User" WHERE "authId" = auth.uid()::text
  ));
