import type { NextRequest } from "next/server";

/** Extract `/uploads/media/<file>` from any stored absolute URL. */
export function extractMediaUploadPath(fileUrl: string): string | null {
  const match = fileUrl.match(/\/uploads\/media\/([^/?#]+)/i);
  return match ? `/uploads/media/${match[1]}` : null;
}

export function getRequestOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  if (host) return `${proto}://${host}`.replace(/\/$/, "");
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

/** Rewrites stale ngrok/localhost URLs to the current app origin when file is local. */
export function normalizeMediaFileUrl(fileUrl: string, origin?: string): string {
  const path = extractMediaUploadPath(fileUrl);
  if (!path) return fileUrl;
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return base ? `${base.replace(/\/$/, "")}${path}` : path;
}

export function isExternalMediaUrl(fileUrl: string): boolean {
  return !extractMediaUploadPath(fileUrl);
}
