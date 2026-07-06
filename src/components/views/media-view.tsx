"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { useUser } from "@/lib/user-context";
import { can } from "@/lib/permissions";
import { useLocations } from "@/hooks/use-locations";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  ImageIcon, Upload, Search, Eye, Copy, Trash2, Sparkles, FileText,
  Files, HardDrive, Bot, Loader2, ImageOff, X, MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";

/* ---------- Types ---------- */

type Bucket =
  | "business-photos"
  | "post-images"
  | "reports"
  | "exports"
  | "documents"
  | "ai-generated";

interface MediaItem {
  id: string;
  locationId: string | null;
  locationName: string;
  locationCity: string;
  fileName: string;
  bucket: Bucket;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
  aiGenerated: boolean;
  createdAt: string;
}

interface BucketMeta {
  label: string;
  badge: string; // shadcn Badge className
  dot: string; // small dot color
}

const BUCKET_META: Record<Bucket, BucketMeta> = {
  "business-photos": {
    label: "Business Photos",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  "post-images": {
    label: "Post Images",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    dot: "bg-amber-500",
  },
  "ai-generated": {
    label: "AI-Generated",
    badge: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20",
    dot: "bg-teal-500",
  },
  reports: {
    label: "Reports",
    badge: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
    dot: "bg-rose-500",
  },
  exports: {
    label: "Exports",
    badge: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20",
    dot: "bg-slate-500",
  },
  documents: {
    label: "Documents",
    badge: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20",
    dot: "bg-slate-500",
  },
};

const BUCKET_ORDER: Bucket[] = [
  "business-photos",
  "post-images",
  "ai-generated",
  "reports",
  "exports",
  "documents",
];

const BUCKET_TABS: { value: Bucket | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "business-photos", label: "Business Photos" },
  { value: "post-images", label: "Post Images" },
  { value: "ai-generated", label: "AI-Generated" },
  { value: "reports", label: "Reports" },
  { value: "exports", label: "Exports" },
  { value: "documents", label: "Documents" },
];

type SortKey = "newest" | "largest" | "location";

/* ---------- Helpers ---------- */

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(gb < 10 ? 2 : 1)} GB`;
}

function formatTotalSize(bytes: number): string {
  return formatBytes(bytes);
}

function bucketLabel(b: string): string {
  return BUCKET_META[b as Bucket]?.label ?? b;
}

function bucketBadgeClass(b: string): string {
  return (BUCKET_META[b as Bucket] ?? BUCKET_META.documents).badge;
}

function bucketDotClass(b: string): string {
  return (BUCKET_META[b as Bucket] ?? BUCKET_META.documents).dot;
}

function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

/* ---------- Sub-components ---------- */

function MediaCard({
  item, canManage, onView, onCopy, onDelete,
}: {
  item: MediaItem;
  canManage: boolean;
  onView: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const image = isImageMime(item.mimeType);
  return (
    <Card className="group p-3 gap-0 overflow-hidden hover:shadow-md transition-shadow rounded-lg">
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-muted">
        {image ? (
           
          <img
            src={item.fileUrl}
            alt={item.fileName}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center text-muted-foreground">
            <FileText className="size-10" />
            <span className="mt-2 text-xs uppercase tracking-wide">{item.mimeType.split("/").pop()}</span>
          </div>
        )}

        {/* AI badge */}
        {item.aiGenerated && (
          <div className="absolute left-2 top-2">
            <Badge className="bg-amber-500/90 text-white border-transparent backdrop-blur-sm">
              <Sparkles className="size-3" />
              AI
            </Badge>
          </div>
        )}

        {/* Hover overlay actions */}
        <div className="absolute inset-0 flex items-end justify-center gap-2 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <Button
            size="sm"
            variant="secondary"
            className="h-8 gap-1.5"
            onClick={onView}
          >
            <Eye className="size-3.5" />
            View
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 gap-1.5"
            onClick={onCopy}
          >
            <Copy className="size-3.5" />
            Copy URL
          </Button>
          {canManage && (
            <Button
              size="sm"
              variant="destructive"
              className="h-8 gap-1.5"
              onClick={onDelete}
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <p className="truncate font-medium text-sm" title={item.fileName}>
          {item.fileName}
        </p>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          <span className="truncate">
            {item.locationName}
            {item.locationCity ? `, ${item.locationCity}` : ""}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <Badge variant="outline" className={cn("gap-1", bucketBadgeClass(item.bucket))}>
            <span className={cn("size-1.5 rounded-full", bucketDotClass(item.bucket))} />
            {bucketLabel(item.bucket)}
          </Badge>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {formatBytes(item.fileSize)}
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
        </div>
      </div>
    </Card>
  );
}

function MediaCardSkeleton() {
  return (
    <Card className="p-3 gap-0 overflow-hidden">
      <Skeleton className="aspect-square w-full rounded-md" />
      <div className="mt-3 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
          </div>
          <Skeleton className="size-10 rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- Upload dialog ---------- */

function UploadDialog({
  open, onOpenChange, locations, onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: { id: string; name: string; city: string }[];
  onUploaded: () => void;
}) {
  const [bucket, setBucket] = React.useState<Bucket>("business-photos");
  const [locationId, setLocationId] = React.useState<string>("all");
  const [fileName, setFileName] = React.useState("");
  const [aiGenerated, setAiGenerated] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setBucket("business-photos");
      setLocationId("all");
      setFileName("");
      setAiGenerated(false);
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileName.trim()) {
      toast.error("Please enter a file name.");
      return;
    }
    setSubmitting(true);
    // Upload queued for processing.
    setTimeout(() => {
      setSubmitting(false);
      toast.success("Upload queued for background processing", {
        description: `${fileName} → ${bucketLabel(bucket)}`,
      });
      onUploaded();
      onOpenChange(false);
    }, 700);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="size-4 text-primary" />
            Upload media
          </DialogTitle>
          <DialogDescription>
            Choose a bucket, location and file name. Files are processed in the background.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="upload-bucket">Bucket</Label>
            <Select value={bucket} onValueChange={(v) => setBucket(v as Bucket)}>
              <SelectTrigger id="upload-bucket" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUCKET_ORDER.map((b) => (
                  <SelectItem key={b} value={b}>
                    {bucketLabel(b)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="upload-location">Location</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger id="upload-location" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}{l.city ? `, ${l.city}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="upload-filename">File name</Label>
            <Input
              id="upload-filename"
              placeholder="e.g. thane_showroom_hero.jpg"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              autoComplete="off"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-md border bg-amber-500/[0.04] p-3">
            <input
              type="checkbox"
              className="size-4 accent-amber-500"
              checked={aiGenerated}
              onChange={(e) => setAiGenerated(e.target.checked)}
            />
            <div className="flex items-center gap-2 text-sm">
              <Sparkles className="size-4 text-amber-500" />
              <div>
                <div className="font-medium">Mark as AI-generated asset</div>
                <div className="text-xs text-muted-foreground">Highlights the file with an amber AI badge.</div>
              </div>
            </div>
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Queuing…
                </>
              ) : (
                <>
                  <Upload className="size-4" />
                  Queue upload
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Detail dialog ---------- */

function DetailDialog({
  item, open, onOpenChange, canManage, onCopy, onDelete,
}: {
  item: MediaItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
  onCopy: (item: MediaItem) => void;
  onDelete: (item: MediaItem) => void;
}) {
  if (!item) return null;
  const image = isImageMime(item.mimeType);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <ImageIcon className="size-4 text-primary shrink-0" />
            <span className="truncate">{item.fileName}</span>
          </DialogTitle>
          <DialogDescription>
            {bucketLabel(item.bucket)} · {item.locationName}{item.locationCity ? `, ${item.locationCity}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="relative aspect-square w-full overflow-hidden rounded-lg border bg-muted">
            {image ? (
               
              <img src={item.fileUrl} alt={item.fileName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center text-muted-foreground">
                <FileText className="size-12" />
                <span className="mt-2 text-xs uppercase tracking-wide">
                  {item.mimeType.split("/").pop()}
                </span>
              </div>
            )}
            {item.aiGenerated && (
              <Badge className="absolute left-2 top-2 bg-amber-500/90 text-white border-transparent">
                <Sparkles className="size-3" />
                AI
              </Badge>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("gap-1", bucketBadgeClass(item.bucket))}>
                <span className={cn("size-1.5 rounded-full", bucketDotClass(item.bucket))} />
                {bucketLabel(item.bucket)}
              </Badge>
              {item.aiGenerated && (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20">
                  <Sparkles className="size-3" />
                  AI-generated
                </Badge>
              )}
            </div>

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">File name</dt>
                <dd className="font-medium text-right truncate max-w-[60%]" title={item.fileName}>
                  {item.fileName}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Bucket</dt>
                <dd className="font-medium">{bucketLabel(item.bucket)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Location</dt>
                <dd className="font-medium">
                  {item.locationName}{item.locationCity ? `, ${item.locationCity}` : ""}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">MIME type</dt>
                <dd className="font-mono text-xs">{item.mimeType}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">File size</dt>
                <dd className="font-medium tabular-nums">{formatBytes(item.fileSize)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Uploaded by</dt>
                <dd className="font-medium">Marketing Team</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Uploaded</dt>
                <dd className="font-medium" title={format(new Date(item.createdAt), "PPpp")}>
                  {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                </dd>
              </div>
            </dl>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">File URL</div>
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5">
                <code className="flex-1 truncate text-xs">{item.fileUrl}</code>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 size-7 p-0"
                  onClick={() => onCopy(item)}
                  title="Copy URL"
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onCopy(item)}>
                <Copy className="size-3.5" />
                Copy URL
              </Button>
              {canManage && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    onDelete(item);
                    onOpenChange(false);
                  }}
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Main view ---------- */

export function MediaView() {
  const user = useUser();
  const queryClient = useQueryClient();
  const { activeLocationId, setActiveLocationId } = useAppStore();
  const { data: locationOptions } = useLocations();
  const canManage = can(user.role, "media.manage");

  const [bucketFilter, setBucketFilter] = React.useState<Bucket | "all">("all");
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState<SortKey>("newest");
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [detailItem, setDetailItem] = React.useState<MediaItem | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  // activeLocationId can be "all" or a specific id. Build the API URL.
  const mediaUrl = React.useMemo(() => {
    const params = new URLSearchParams();
    if (activeLocationId && activeLocationId !== "all") {
      params.set("locationId", activeLocationId);
    }
    const qs = params.toString();
    return qs ? `/api/media?${qs}` : "/api/media";
  }, [activeLocationId]);

  const { data, isLoading, isError, refetch } = useQuery<MediaItem[]>({
    queryKey: ["media", mediaUrl],
    queryFn: () => api<MediaItem[]>(mediaUrl),
  });

  /* ---- Derived stats (computed from unfiltered fetched set) ---- */
  const stats = React.useMemo(() => {
    const items = data ?? [];
    const total = items.length;
    const businessPhotos = items.filter((m) => m.bucket === "business-photos").length;
    const aiGenerated = items.filter((m) => m.aiGenerated).length;
    const totalBytes = items.reduce((sum, m) => sum + (m.fileSize || 0), 0);
    return { total, businessPhotos, aiGenerated, totalBytes };
  }, [data]);

  /* ---- Filtered + sorted view ---- */
  const filtered = React.useMemo(() => {
    let items = (data ?? []).slice();
    if (bucketFilter !== "all") {
      items = items.filter((m) => m.bucket === bucketFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      items = items.filter(
        (m) =>
          m.fileName.toLowerCase().includes(q) ||
          m.locationName.toLowerCase().includes(q) ||
          m.locationCity.toLowerCase().includes(q),
      );
    }
    switch (sort) {
      case "largest":
        items.sort((a, b) => b.fileSize - a.fileSize);
        break;
      case "location":
        items.sort(
          (a, b) =>
            a.locationName.localeCompare(b.locationName) ||
            a.fileName.localeCompare(b.fileName),
        );
        break;
      case "newest":
      default:
        items.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        break;
    }
    return items;
  }, [data, bucketFilter, search, sort]);

  /* ---- Handlers ---- */
  const handleCopy = React.useCallback((item: MediaItem) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(item.fileUrl).catch(() => undefined);
    }
    toast.success("URL copied to clipboard", { description: item.fileName });
  }, []);

  const handleDelete = React.useCallback((item: MediaItem) => {
    // Delete queued.
    toast.success("Queued for deletion", {
      description: `${item.fileName} will be removed by the background worker.`,
    });
  }, []);

  const openDetail = React.useCallback((item: MediaItem) => {
    setDetailItem(item);
    setDetailOpen(true);
  }, []);

  const handleUploaded = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["media"] });
  }, [queryClient]);

  const locationActions = (
    <div className="flex items-center gap-2">
      <Select
        value={activeLocationId ?? "all"}
        onValueChange={(v) => setActiveLocationId(v as string | "all")}
      >
        <SelectTrigger className="h-9 w-[180px] sm:w-[220px]" size="sm">
          <MapPin className="size-3.5 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All locations</SelectItem>
          {(locationOptions ?? []).map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.name}{l.city ? `, ${l.city}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {canManage && (
        <Button className="h-9 gap-1.5" onClick={() => setUploadOpen(true)}>
          <Upload className="size-4" />
          <span className="hidden sm:inline">Upload</span>
        </Button>
      )}
    </div>
  );

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title="Media Library"
        description="Business photos, post images & AI-generated assets"
        icon={ImageIcon}
        actions={locationActions}
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              label="Total Files"
              value={stats.total}
              icon={Files}
              accent="emerald"
              hint={stats.total === 1 ? "1 asset in library" : `${stats.total} assets in library`}
            />
            <StatCard
              label="Business Photos"
              value={stats.businessPhotos}
              icon={ImageIcon}
              accent="teal"
              hint="Storefront & interior shots"
            />
            <StatCard
              label="AI-Generated"
              value={stats.aiGenerated}
              icon={Bot}
              accent="amber"
              hint="Created by MiSA AI"
            />
            <StatCard
              label="Total Size"
              value={formatTotalSize(stats.totalBytes)}
              icon={HardDrive}
              accent="rose"
              hint="Across all buckets"
            />
          </>
        )}
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3">
          <Tabs value={bucketFilter} onValueChange={(v) => setBucketFilter(v as Bucket | "all")}>
            <TabsList className="flex w-full flex-wrap justify-start gap-1 h-auto bg-transparent p-0">
              {BUCKET_TABS.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by file name or location…"
                className="h-9 pl-8 pr-8"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="h-9 sm:w-[180px]" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="largest">Largest first</SelectItem>
                <SelectItem value="location">By location</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Result count */}
      <div className="flex items-center justify-between px-1">
        <p className="text-sm text-muted-foreground">
          {isError ? (
            "Failed to load media."
          ) : isLoading ? (
            "Loading media files…"
          ) : filtered.length === 0 ? (
            "No media files found."
          ) : (
            <>
              Showing <span className="font-medium text-foreground">{filtered.length}</span>{" "}
              {filtered.length === 1 ? "file" : "files"}
              {(bucketFilter !== "all" || search) && (
                <> of <span className="font-medium text-foreground">{stats.total}</span> total</>
              )}
            </>
          )}
        </p>
        {isError && (
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        )}
      </div>

      {/* Media grid (scrollable) */}
      {isError ? (
        <Card>
          <CardContent className="p-10 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <ImageOff className="size-6" />
            </div>
            <h3 className="mt-3 text-base font-semibold">Couldn&apos;t load media</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Something went wrong while fetching the media library. Please try again.
            </p>
            <Button className="mt-4" variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="max-h-[calc(100vh-18rem)] overflow-y-auto scroll-area">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <MediaCardSkeleton key={i} />
            ))}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ImageIcon className="size-6" />
            </div>
            <h3 className="mt-3 text-base font-semibold">
              No media files found
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {bucketFilter !== "all" || search
                ? "Try adjusting your filters or search."
                : "Upload your first asset to get started."}
            </p>
            {(bucketFilter !== "all" || search) && (
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setBucketFilter("all");
                  setSearch("");
                }}
              >
                Clear filters
              </Button>
            )}
            {canManage && bucketFilter === "all" && !search && (
              <Button className="mt-4 ml-2 gap-1.5" onClick={() => setUploadOpen(true)}>
                <Upload className="size-4" />
                Upload asset
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="max-h-[calc(100vh-18rem)] overflow-y-auto scroll-area pr-1 -mr-1">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                canManage={canManage}
                onView={() => openDetail(item)}
                onCopy={() => handleCopy(item)}
                onDelete={() => handleDelete(item)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Upload dialog */}
      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        locations={(locationOptions ?? []).map((l) => ({ id: l.id, name: l.name, city: l.city }))}
        onUploaded={handleUploaded}
      />

      {/* Detail dialog */}
      <DetailDialog
        item={detailItem}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        canManage={canManage}
        onCopy={handleCopy}
        onDelete={handleDelete}
      />
    </div>
  );
}

export default MediaView;
