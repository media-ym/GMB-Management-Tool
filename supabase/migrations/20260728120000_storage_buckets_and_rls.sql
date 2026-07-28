-- MyFNG GMB — Supabase Storage buckets + RLS
-- Run against self-hosted Supabase SQL editor (or `supabase db push`).

-- ── Buckets (public images / private docs) ──────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('business-photos', 'business-photos', true, 20971520, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('profile-images', 'profile-images', true, 5242880, ARRAY['image/jpeg','image/png','image/webp']),
  ('post-images', 'post-images', true, 20971520, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('reports', 'reports', false, 52428800, ARRAY['application/pdf','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  ('exports', 'exports', false, 52428800, NULL),
  ('documents', 'documents', false, 20971520, NULL),
  ('ai-cache', 'ai-cache', false, 52428800, NULL),
  ('backups', 'backups', false, 104857600, NULL)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── Storage RLS ─────────────────────────────────────────────────────────────
-- Public buckets: anyone can read; authenticated users can write.
-- Private buckets: authenticated users only.

DROP POLICY IF EXISTS "Public read business-photos" ON storage.objects;
CREATE POLICY "Public read business-photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'business-photos');

DROP POLICY IF EXISTS "Auth upload business-photos" ON storage.objects;
CREATE POLICY "Auth upload business-photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'business-photos');

DROP POLICY IF EXISTS "Auth update business-photos" ON storage.objects;
CREATE POLICY "Auth update business-photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'business-photos');

DROP POLICY IF EXISTS "Auth delete business-photos" ON storage.objects;
CREATE POLICY "Auth delete business-photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'business-photos');

DROP POLICY IF EXISTS "Public read profile-images" ON storage.objects;
CREATE POLICY "Public read profile-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-images');

DROP POLICY IF EXISTS "Auth write profile-images" ON storage.objects;
CREATE POLICY "Auth write profile-images"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'profile-images')
  WITH CHECK (bucket_id = 'profile-images');

DROP POLICY IF EXISTS "Public read post-images" ON storage.objects;
CREATE POLICY "Public read post-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'post-images');

DROP POLICY IF EXISTS "Auth write post-images" ON storage.objects;
CREATE POLICY "Auth write post-images"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'post-images')
  WITH CHECK (bucket_id = 'post-images');

DROP POLICY IF EXISTS "Auth read private reports" ON storage.objects;
CREATE POLICY "Auth read private reports"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('reports', 'exports', 'documents', 'ai-cache', 'backups'));

DROP POLICY IF EXISTS "Auth write private reports" ON storage.objects;
CREATE POLICY "Auth write private reports"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id IN ('reports', 'exports', 'documents', 'ai-cache', 'backups'))
  WITH CHECK (bucket_id IN ('reports', 'exports', 'documents', 'ai-cache', 'backups'));
