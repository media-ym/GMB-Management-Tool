"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2, CheckCircle2, Link2, Loader2, LogOut, MapPin, Plug, RefreshCw, Star,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type PortalMe = {
  user: { id: string; name: string; email: string };
  client: { id: string; name: string; clientCode: string | null; status: string; locationCount: number };
  google: { connected: boolean; email?: string; status?: string; tokenExpiry?: string | null };
  authorization: { id: string; status: string; grantedAt: string } | null;
  locations: Array<{
    id: string;
    name: string;
    city: string;
    avgRating: number;
    reviewCount: number;
    syncStatus: string;
    lastSyncedAt: string | null;
    verificationState: string | null;
    mapUrl: string | null;
  }>;
};

type AvailableLoc = {
  googleLocationId: string;
  name: string;
  address?: string;
  city?: string;
  averageRating?: number;
  totalReviews?: number;
  verificationState?: string;
  alreadyImported?: boolean;
};

export function PortalDashboard() {
  const qc = useQueryClient();
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data, isLoading, refetch } = useQuery<PortalMe>({
    queryKey: ["portal", "me"],
    queryFn: () => api<PortalMe>("/api/portal/me"),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google_connected") === "true") {
      toast.success("Google Business Profile connected");
      window.history.replaceState({}, "", "/portal");
      void refetch();
      setPickerOpen(true);
    }
    const err = params.get("google_error");
    if (err) {
      toast.error(`Google connect failed: ${decodeURIComponent(err)}`);
      window.history.replaceState({}, "", "/portal");
    }
  }, [refetch]);

  const { data: available, isFetching: loadingAvail, refetch: refetchAvail } = useQuery<{
    status: string;
    locations: AvailableLoc[];
    message?: string;
  }>({
    queryKey: ["portal", "available-locations"],
    queryFn: async () => {
      const res = await fetch("/api/google/available-locations");
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "Failed to load locations");
      return json.data;
    },
    enabled: !!data?.google?.connected && pickerOpen,
  });

  const availList = useMemo(() => available?.locations ?? [], [available]);

  async function connectGoogle() {
    setConnecting(true);
    try {
      const res = await api<{ authUrl: string }>("/api/portal/connect", { method: "POST", body: "{}" });
      if (!res.authUrl) throw new Error("No auth URL");
      window.location.href = res.authUrl;
    } catch (e: any) {
      toast.error(e?.message || "Failed to start Google connect");
      setConnecting(false);
    }
  }

  async function importSelected() {
    if (selected.size === 0) {
      toast.error("Select at least one location");
      return;
    }
    setImporting(true);
    try {
      const locations = availList
        .filter((l) => selected.has(l.googleLocationId || (l as any).name))
        .map((l) => ({
          googleLocationId: l.googleLocationId || (l as any).name,
          name: l.name,
          address: l.address || "",
          city: l.city || "",
          averageRating: l.averageRating,
          totalReviews: l.totalReviews,
          verificationState: l.verificationState,
        }));

      const res = await fetch("/api/locations/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locations }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "Import failed");
      const imported = json.data?.imported?.length ?? 0;
      toast.success(imported ? `Imported ${imported} location(s)` : json.message || "Done");
      setSelected(new Set());
      setPickerOpen(false);
      qc.invalidateQueries({ queryKey: ["portal"] });
    } catch (e: any) {
      toast.error(e?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  if (isLoading || !data) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const googleOk = !!data.google.connected;

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-sm tracking-tight">MyFNG Client Portal</div>
            <div className="text-[11px] text-muted-foreground truncate max-w-[220px] sm:max-w-none">
              {data.client.name}
              {data.client.clientCode ? ` · ${data.client.clientCode}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">{data.user.email}</span>
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="size-3.5 mr-1.5" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Welcome, {data.user.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Connect your Google account, then choose which Business Profile locations MyFNG can manage.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <Stat
            label="Google"
            value={googleOk ? "Connected" : "Not connected"}
            icon={Plug}
            ok={googleOk}
          />
          <Stat
            label="Authorization"
            value={data.authorization ? "Active" : "Pending"}
            icon={CheckCircle2}
            ok={!!data.authorization}
          />
          <Stat
            label="Locations"
            value={String(data.locations.length)}
            icon={Building2}
            ok={data.locations.length > 0}
          />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="size-4" /> Connect Google Business Profile
            </CardTitle>
            <CardDescription>
              You&apos;ll sign in with the Google account that owns your Business Profile listings.
              Tokens are stored securely for your client account only.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {googleOk ? (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border bg-emerald-50/60 border-emerald-200/60 p-3">
                <div className="text-sm">
                  <div className="font-medium text-emerald-800">Connected as {data.google.email}</div>
                  <div className="text-xs text-emerald-700/80 mt-0.5">
                    Status: {data.google.status}
                    {data.authorization ? " · Authorization recorded" : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setPickerOpen(true); void refetchAvail(); }}>
                    <MapPin className="size-3.5 mr-1.5" /> Choose locations
                  </Button>
                  <Button variant="outline" size="sm" onClick={connectGoogle} disabled={connecting}>
                    {connecting ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5 mr-1.5" />}
                    Reconnect
                  </Button>
                </div>
              </div>
            ) : (
              <Button onClick={connectGoogle} disabled={connecting}>
                {connecting ? <Loader2 className="size-4 animate-spin mr-2" /> : <Plug className="size-4 mr-2" />}
                Connect Google
              </Button>
            )}
          </CardContent>
        </Card>

        {pickerOpen && googleOk && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Select locations to manage</CardTitle>
              <CardDescription>
                {available?.message || "Pick the listings you want MyFNG to sync and manage."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingAvail ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : availList.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  {available?.status === "not_connected"
                    ? "Google not connected — reconnect first."
                    : "No new locations available (all may already be imported)."}
                </p>
              ) : (
                <ul className="space-y-2 max-h-80 overflow-y-auto">
                  {availList.map((loc) => {
                    const id = loc.googleLocationId || (loc as any).name;
                    const checked = selected.has(id);
                    return (
                      <li key={id}>
                        <label className="flex items-start gap-3 rounded-lg border p-3 hover:bg-accent/40 cursor-pointer">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => {
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(id)) next.delete(id);
                                else next.add(id);
                                return next;
                              });
                            }}
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{loc.name}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {loc.city || loc.address || "—"}
                              {loc.verificationState === "verified" ? " · Verified" : ""}
                            </div>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" size="sm" onClick={() => setPickerOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={importSelected} disabled={importing || selected.size === 0}>
                  {importing ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : null}
                  Import {selected.size || ""} location{selected.size === 1 ? "" : "s"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Your locations</CardTitle>
                <CardDescription>Profiles linked to {data.client.name}</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => refetch()}>
                <RefreshCw className="size-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {data.locations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No locations yet. Connect Google and import your Business Profiles.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.locations.map((loc) => (
                  <li key={loc.id} className="rounded-lg border p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{loc.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                        <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{loc.city}</span>
                        <span className="inline-flex items-center gap-1"><Star className="size-3" />{loc.avgRating?.toFixed?.(1) ?? loc.avgRating} ({loc.reviewCount})</span>
                        {loc.lastSyncedAt && (
                          <span>Synced {formatDistanceToNow(new Date(loc.lastSyncedAt), { addSuffix: true })}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant="outline" className="text-[10px] capitalize">{loc.syncStatus || "—"}</Badge>
                      {loc.verificationState === "verified" && (
                        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/20">Verified</Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function Stat({
  label, value, icon: Icon, ok,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  ok: boolean;
}) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className={`text-sm font-semibold mt-1 ${ok ? "text-emerald-700" : "text-amber-700"}`}>{value}</div>
    </div>
  );
}
