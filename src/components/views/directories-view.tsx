"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { useLocations } from "@/hooks/use-locations";
import { useAppStore } from "@/lib/store";
import { useUser } from "@/lib/user-context";
import { can } from "@/lib/permissions";
import { PageHeader, CardSection } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { LocationMultiSelect } from "@/components/shared/location-multi-select";
import { NumberedPagination } from "@/components/shared/numbered-pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Globe,
  MapPin,
  Link2,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Target,
  RefreshCw,
  Loader2,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import {
  DIRECTORY_PLATFORMS,
  getDirectoryPlatform,
  type DirectoryStatus,
} from "@/lib/directory-platforms";

type Presence = {
  platformId: string;
  status: DirectoryStatus;
  listingUrl: string | null;
  notes: string | null;
  lastCheckedAt: string | null;
  autoDetected: boolean;
};

type DirectoryListing = {
  id: string;
  name: string;
  city: string;
  address: string;
  phone: string | null;
  website: string | null;
  status: string;
  googleLinked: boolean;
  verificationState: string | null;
  mapUrl: string | null;
  coverage: number;
  directories: Presence[];
};

type DirectoriesResponse = {
  platforms: { id: string; name: string; shortName: string }[];
  listings: DirectoryListing[];
  stats: {
    linked: number;
    processing: number;
    unlinked: number;
    errors: number;
    unavailable: number;
    totalCells: number;
    platformCount: number;
    locationCount: number;
    coverage: number;
  };
  platformSummary: {
    platformId: string;
    name: string;
    shortName: string;
    linkedCount: number;
    totalCount: number;
    status: DirectoryStatus;
  }[];
};

const PAGE_SIZE = 15;

function SemiCircularGauge({ percentage }: { percentage: number }) {
  const radius = 80;
  const strokeWidth = 14;
  const center = radius + strokeWidth / 2;
  const circumference = Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative flex flex-col items-center">
      <svg
        width={center * 2}
        height={center + 10}
        viewBox={`0 0 ${center * 2} ${center + 10}`}
        className="overflow-visible"
      >
        <path
          d={`M ${strokeWidth / 2} ${center} A ${radius} ${radius} 0 0 1 ${center * 2 - strokeWidth / 2} ${center}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="text-muted/40"
        />
        <path
          d={`M ${strokeWidth / 2} ${center} A ${radius} ${radius} 0 0 1 ${center * 2 - strokeWidth / 2} ${center}`}
          fill="none"
          stroke="url(#dirGaugeGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
        <defs>
          <linearGradient id="dirGaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute bottom-2 flex flex-col items-center">
        <span className="text-3xl font-bold tabular-nums">{percentage}%</span>
        <span className="text-xs text-muted-foreground">Coverage</span>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: DirectoryStatus }) {
  const map: Record<DirectoryStatus, { label: string; className: string }> = {
    linked: {
      label: "Linked",
      className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    },
    processing: {
      label: "Processing",
      className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    },
    unlinked: {
      label: "Unlinked",
      className: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    },
    error: {
      label: "Error",
      className: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
    },
    unavailable: {
      label: "N/A",
      className: "bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20",
    },
  };
  const { label, className } = map[status];
  return (
    <Badge variant="outline" className={cn("text-[10px] font-medium px-2 py-0.5", className)}>
      {status === "linked" && <CheckCircle2 className="size-3 mr-1" />}
      {label}
    </Badge>
  );
}

export function DirectoriesView() {
  const user = useUser();
  const qc = useQueryClient();
  const { data: locations } = useLocations();
  const selectedLocationIds = useAppStore((s) => s.selectedLocationIds);
  const setSelectedLocationIds = useAppStore((s) => s.setSelectedLocationIds);
  const [page, setPage] = useState(1);
  const canManage = can(user.role, "locations.manage") || can(user.role, "system.sync");

  const [connectOpen, setConnectOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeListing, setActiveListing] = useState<DirectoryListing | null>(null);
  const [activePlatformId, setActivePlatformId] = useState<string>("");
  const [listingUrl, setListingUrl] = useState("");
  const [statusDraft, setStatusDraft] = useState<DirectoryStatus>("linked");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [bingWorking, setBingWorking] = useState(false);

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedLocationIds.length > 0) params.set("locationIds", selectedLocationIds.join(","));
    const qs = params.toString();
    return `/api/directories${qs ? `?${qs}` : ""}`;
  }, [selectedLocationIds]);

  const { data, isLoading, isError, error, refetch } = useQuery<DirectoriesResponse>({
    queryKey: ["directories", selectedLocationIds],
    queryFn: () => api<DirectoriesResponse>(queryUrl),
    retry: 1,
  });

  const listings = data?.listings ?? [];
  const stats = data?.stats;
  const platformSummary = data?.platformSummary ?? [];

  const totalPages = Math.ceil(listings.length / PAGE_SIZE);
  const paginatedListings = listings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const matrixPlatforms = DIRECTORY_PLATFORMS.slice(0, 8);

  function openConnect(listing: DirectoryListing, platformId: string) {
    const presence = listing.directories.find((d) => d.platformId === platformId);
    setActiveListing(listing);
    setActivePlatformId(platformId);
    setListingUrl(presence?.listingUrl ?? "");
    setStatusDraft(presence?.status === "unlinked" ? "linked" : presence?.status ?? "linked");
    setConnectOpen(true);
  }

  function openDetails(listing: DirectoryListing) {
    setActiveListing(listing);
    setDetailsOpen(true);
  }

  function searchOnPlatform(listing: DirectoryListing, platformId: string) {
    const platform = getDirectoryPlatform(platformId);
    if (!platform) return;
    const url = platform.searchUrl({
      name: listing.name,
      city: listing.city,
      phone: listing.phone,
      address: listing.address,
    });
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleSavePresence() {
    if (!activeListing || !activePlatformId) return;
    setSaving(true);
    try {
      await api("/api/directories", {
        method: "POST",
        body: JSON.stringify({
          action: "upsert",
          locationId: activeListing.id,
          platformId: activePlatformId,
          status: statusDraft,
          listingUrl: listingUrl.trim() || null,
        }),
      });
      toast.success("Directory status saved");
      setConnectOpen(false);
      await qc.invalidateQueries({ queryKey: ["directories"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncGoogle() {
    setSyncing(true);
    try {
      const res = await api<{ upserted: number }>("/api/directories", {
        method: "POST",
        body: JSON.stringify({ action: "sync-google" }),
      });
      toast.success(`Google links synced (${res.upserted} records)`);
      await qc.invalidateQueries({ queryKey: ["directories"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const bingSummary = platformSummary.find((p) => p.platformId === "bing");

  async function startBingLinking() {
    if (!canManage) {
      toast.error("Bing link karne ke liye locations.manage chahiye");
      return;
    }
    setBingWorking(true);
    try {
      window.open("https://www.bing.com/forbusiness", "_blank", "noopener,noreferrer");
      const res = await api<{ updated: number }>("/api/directories", {
        method: "POST",
        body: JSON.stringify({
          action: "bulk-status",
          platformId: "bing",
          status: "processing",
          onlyUnlinked: true,
          locationIds: selectedLocationIds.length > 0 ? selectedLocationIds : undefined,
        }),
      });
      toast.success(
        `Bing Places khul gaya · ${res.updated} location(s) Processing. Import from Google karo, phir har row pe Bing URL save karo.`,
        { duration: 9000 },
      );
      await qc.invalidateQueries({ queryKey: ["directories"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Bing start failed");
    } finally {
      setBingWorking(false);
    }
  }

  const activePlatform = activePlatformId ? getDirectoryPlatform(activePlatformId) : null;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader
        title={`Directories for ${listings.length || "…"} listing${listings.length === 1 ? "" : "s"}`}
        description="Track where each MyFNG location is listed. Connect buttons save a real link — not mock data."
        icon={Globe}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <LocationMultiSelect
              locations={locations}
              selectedIds={selectedLocationIds}
              onChange={(ids) => {
                setSelectedLocationIds(ids);
                setPage(1);
              }}
              className="w-[200px]"
            />
            {canManage && (
              <Button variant="outline" size="sm" onClick={handleSyncGoogle} disabled={syncing}>
                {syncing ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5 mr-1.5" />
                )}
                Sync Google links
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
        }
      />

      {isLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="p-8 text-center space-y-2">
            <AlertTriangle className="size-8 mx-auto text-rose-500" />
            <p className="text-sm font-medium">Directories data load nahi hui</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
            <Button size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <StatCard
            label="Linked"
            value={stats.linked}
            icon={Link2}
            accent="emerald"
            hint="Location × platform cells"
          />
          <StatCard
            label="Processing"
            value={stats.processing}
            icon={Clock}
            accent="amber"
            hint="In progress"
          />
          <StatCard
            label="Unlinked"
            value={stats.unlinked}
            icon={Globe}
            accent="blue"
            hint="Needs a listing URL"
          />
          <StatCard
            label="Errors"
            value={stats.errors}
            icon={AlertTriangle}
            accent="rose"
            hint="Requires fix"
          />
          <StatCard
            label="Coverage"
            value={`${stats.coverage}%`}
            icon={Target}
            accent="violet"
            hint={`${stats.platformCount} platforms × ${stats.locationCount} locations`}
          />
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6 flex flex-col items-center justify-center">
              <SemiCircularGauge percentage={stats.coverage} />
              <p className="text-[11px] text-muted-foreground mt-2 text-center max-w-[220px]">
                Linked cells ÷ (locations × {stats.platformCount} platforms)
              </p>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Globe className="size-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Platforms tracked</p>
                  <p className="text-2xl font-bold tabular-nums">{stats.platformCount}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <SummaryItem label="Linked cells" count={stats.linked} color="bg-emerald-500" />
                <SummaryItem label="Unlinked cells" count={stats.unlinked} color="bg-blue-500" />
                <SummaryItem label="Processing" count={stats.processing} color="bg-amber-500" />
                <SummaryItem label="Errors" count={stats.errors} color="bg-red-500" />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Example: 9 locations × 12 platforms = 108 cells. Google Maps + GBP auto-link jab location
                Google se connected ho. Baaki platforms pe Connect karke listing URL save karo.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bing Places — primary link flow */}
      <Card className="border-cyan-500/25 bg-gradient-to-r from-cyan-500/5 to-blue-500/5">
        <CardContent className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold">Bing Places link karo</h3>
              {bingSummary && (
                <Badge variant="outline" className="text-[10px]">
                  {bingSummary.linkedCount}/{bingSummary.totalCount} linked
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Bing pe listing claim/import karo (Google se import sabse easy), verify karo, phir matrix mein{" "}
              <span className="font-medium text-foreground">Bing</span> column pe click karke listing URL save karo.
            </p>
            <ol className="text-[11px] text-muted-foreground list-decimal pl-4 space-y-0.5">
              <li>Open Bing Places → Microsoft account se login</li>
              <li>Import from Google Business Profile (saari MyFNG branches)</li>
              <li>Verify → Bing Maps pe listing open karke URL copy</li>
              <li>Is page pe Bing cell → paste URL → Save as Linked</li>
            </ol>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            <Button
              size="sm"
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
              onClick={startBingLinking}
              disabled={bingWorking || !canManage}
            >
              {bingWorking ? (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <ExternalLink className="size-3.5 mr-1.5" />
              )}
              Open Bing Places
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open("https://www.bing.com/forbusiness", "_blank", "noopener,noreferrer")}
            >
              bing.com/forbusiness
            </Button>
          </div>
        </CardContent>
      </Card>

      <CardSection
        title="Platform Connections"
        description="Click Connect to save a listing URL, or Search to find it on that platform"
        icon={Link2}
        accent="teal"
      >
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {platformSummary.map((p) => (
              <Card key={p.platformId} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <div className="size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <Globe className="size-5" />
                  </div>
                  <div className="min-w-0 w-full">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {p.linkedCount}/{p.totalCount} linked
                    </p>
                  </div>
                  <StatusPill status={p.status === "processing" && p.linkedCount === 0 ? "unlinked" : p.status} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardSection>

      <CardSection
        title="Listings Matrix"
        description="Per-location directory status — Connect saves to database"
        icon={MapPin}
        accent="blue"
        action={
          <span className="text-xs text-muted-foreground">
            {listings.length} listing{listings.length !== 1 ? "s" : ""} · Page {page} of{" "}
            {Math.max(totalPages, 1)}
          </span>
        }
      >
        <div className="overflow-x-auto -mx-4 sm:-mx-5">
          <Table className="min-w-[960px]">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-card z-10 min-w-[200px]">Business</TableHead>
                {matrixPlatforms.map((p) => (
                  <TableHead key={p.id} className="text-center text-[11px] px-2 whitespace-nowrap">
                    {p.shortName}
                  </TableHead>
                ))}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                    <Loader2 className="size-5 animate-spin inline mr-2" />
                    Loading directory coverage…
                  </TableCell>
                </TableRow>
              ) : paginatedListings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-sm text-muted-foreground">
                    No locations found. Import locations from Google first.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedListings.map((listing) => (
                  <TableRow key={listing.id} className="group hover:bg-accent/30">
                    <TableCell className="sticky left-0 bg-card group-hover:bg-accent/30 z-10">
                      <p className="text-sm font-medium truncate max-w-[200px]">{listing.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {listing.city} · {listing.coverage}% coverage
                        {listing.phone ? ` · ${listing.phone}` : ""}
                      </p>
                    </TableCell>
                    {matrixPlatforms.map((p) => {
                      const dir = listing.directories.find((d) => d.platformId === p.id);
                      const status = dir?.status ?? "unlinked";
                      return (
                        <TableCell key={p.id} className="text-center px-1">
                          {canManage && status !== "unavailable" ? (
                            <button
                              type="button"
                              className="inline-flex"
                              onClick={() => openConnect(listing, p.id)}
                              title={dir?.listingUrl || "Click to connect / edit"}
                            >
                              <StatusPill status={status} />
                            </button>
                          ) : (
                            <StatusPill status={status} />
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 gap-1"
                        onClick={() => openDetails(listing)}
                      >
                        Details <ExternalLink className="size-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <NumberedPagination
          page={page}
          totalPages={Math.max(1, totalPages)}
          totalItems={listings.length}
          perPage={PAGE_SIZE}
          onPageChange={setPage}
          itemLabel="listings"
          pageBase={1}
          hideWhenSinglePage
          className="mt-4"
        />
      </CardSection>

      {/* Connect / edit dialog */}
      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Connect {activePlatform?.name ?? "directory"}</DialogTitle>
            <DialogDescription>
              {activeListing
                ? `${activeListing.name} · ${activeListing.city}`
                : "Save listing URL for this platform"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {activePlatform?.connectHint && (
              <p className="text-[11px] text-muted-foreground leading-relaxed rounded-lg border bg-muted/30 px-3 py-2">
                {activePlatform.connectHint}
              </p>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={statusDraft} onValueChange={(v) => setStatusDraft(v as DirectoryStatus)}>
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="linked">Linked</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="unlinked">Unlinked</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Listing URL</Label>
              <Input
                value={listingUrl}
                onChange={(e) => setListingUrl(e.target.value)}
                placeholder={
                  activePlatformId === "bing"
                    ? "https://www.bing.com/maps?…"
                    : "https://…"
                }
                disabled={saving}
              />
            </div>
            <div className="flex flex-col gap-2">
              {activePlatform?.manageUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() =>
                    window.open(activePlatform.manageUrl, "_blank", "noopener,noreferrer")
                  }
                >
                  <ExternalLink className="size-3.5 mr-1.5" />
                  Open {activePlatform.name} dashboard
                </Button>
              )}
              {activeListing && activePlatform && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => searchOnPlatform(activeListing, activePlatform.id)}
                >
                  <Search className="size-3.5 mr-1.5" />
                  Search on {activePlatform.name}
                </Button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSavePresence} disabled={saving || !canManage}>
              {saving ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Link2 className="size-3.5 mr-1.5" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Location details dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-6">{activeListing?.name}</DialogTitle>
            <DialogDescription>
              NAP + directory coverage for this location
            </DialogDescription>
          </DialogHeader>
          {activeListing && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 space-y-1.5 text-sm">
                <p>
                  <span className="text-muted-foreground">Name · </span>
                  {activeListing.name}
                </p>
                <p>
                  <span className="text-muted-foreground">Address · </span>
                  {activeListing.address}, {activeListing.city}
                </p>
                <p>
                  <span className="text-muted-foreground">Phone · </span>
                  {activeListing.phone || "Not listed"}
                </p>
                <p>
                  <span className="text-muted-foreground">Website · </span>
                  {activeListing.website || "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Google · </span>
                  {activeListing.googleLinked
                    ? `Linked (${activeListing.verificationState ?? "unknown"})`
                    : "Not linked"}
                  {activeListing.mapUrl && (
                    <>
                      {" · "}
                      <a
                        href={activeListing.mapUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-0.5"
                      >
                        Maps <ExternalLink className="size-3" />
                      </a>
                    </>
                  )}
                </p>
              </div>

              <div className="space-y-2">
                {activeListing.directories.map((d) => {
                  const platform = getDirectoryPlatform(d.platformId);
                  return (
                    <div
                      key={d.platformId}
                      className="flex items-center gap-2 rounded-lg border px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{platform?.name ?? d.platformId}</p>
                        {d.listingUrl ? (
                          <a
                            href={d.listingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-primary truncate block hover:underline"
                          >
                            {d.listingUrl}
                          </a>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">
                            {d.autoDetected ? "Auto from Google" : "No URL saved"}
                          </p>
                        )}
                      </div>
                      <StatusPill status={d.status} />
                      {canManage && d.status !== "unavailable" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs shrink-0"
                          onClick={() => {
                            setDetailsOpen(false);
                            openConnect(activeListing, d.platformId);
                          }}
                        >
                          Edit
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 shrink-0"
                        onClick={() => searchOnPlatform(activeListing, d.platformId)}
                      >
                        <Search className="size-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryItem({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border p-3">
      <span className={cn("size-2.5 rounded-full shrink-0", color)} />
      <div className="min-w-0">
        <p className="text-lg font-bold tabular-nums leading-tight">{count}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    </div>
  );
}
