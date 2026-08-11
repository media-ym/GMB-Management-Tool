import { createAdminClient } from "./admin";
import { getSupabaseUrl, isSupabaseConfigured } from "./env";

export const MEDIA_BUCKET = "business-photos";

export function isSupabaseStorageConfigured(): boolean {
  return isSupabaseConfigured() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function uploadMediaFile(opts: {
  path: string;
  bytes: Buffer | Uint8Array;
  contentType: string;
  bucket?: string;
}): Promise<{ path: string; publicUrl: string }> {
  const bucket = opts.bucket ?? MEDIA_BUCKET;
  const admin = createAdminClient();
  const { error } = await admin.storage.from(bucket).upload(opts.path, opts.bytes, {
    contentType: opts.contentType,
    upsert: false,
  });
  if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);

  const { data } = admin.storage.from(bucket).getPublicUrl(opts.path);
  return { path: opts.path, publicUrl: data.publicUrl };
}

export function publicStorageUrl(bucket: string, path: string): string {
  const base = getSupabaseUrl();
  if (!base) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  return `${base}/storage/v1/object/public/${bucket}/${path.replace(/^\//, "")}`;
}
