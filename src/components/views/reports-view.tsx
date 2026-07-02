"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { useUser } from "@/lib/user-context";
import { can } from "@/lib/permissions";
import { useLocations } from "@/hooks/use-locations";
import { cn } from "@/lib/utils";
import { PageHeader, CardSection } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import {
  FileBarChart,
  Calendar,
  CalendarDays,
  CalendarRange,
  CalendarClock,
  CalendarCheck,
  Filter,
  Plus,
  Download,
  RefreshCw,
  Sparkles,
  Loader2,
  Inbox,
  Building2,
  MapPin,
  User,
  ArrowUpDown,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

/* ---------- Types ---------- */

type ReportType = "daily" | "weekly" | "monthly" | "quarterly" | "annual";

interface ReportItem {
  id: string;
  reportType: ReportType;
  locationId: string | null;
  locationName: string;
  locationCity: string;
  reportName: string;
  fileUrl: string;
  generatedBy: string;
  generatedAt: string;
}

interface AiSummaryResponse {
  summary: string;
  deltas: { searchViews: number };
}

/* ---------- Static metadata ---------- */

interface ReportTypeMeta {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
  accent: "emerald" | "amber" | "teal" | "rose" | "slate";
  description: string;
}

const TYPE_META: Record<ReportType, ReportTypeMeta> = {
  daily: {
    label: "Daily",
    icon: Calendar,
    tint: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
    accent: "slate",
    description: "A snapshot of yesterday's GBP metrics, reviews and posts.",
  },
  weekly: {
    label: "Weekly",
    icon: CalendarDays,
    tint: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    accent: "emerald",
    description: "7-day rolling performance with week-over-week deltas.",
  },
  monthly: {
    label: "Monthly",
    icon: CalendarRange,
    tint: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    accent: "amber",
    description: "Full calendar-month report card with ratings & SEO ranks.",
  },
  quarterly: {
    label: "Quarterly",
    icon: CalendarClock,
    tint: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
    accent: "teal",
    description: "Quarterly business review with trend & cohort analysis.",
  },
  annual: {
    label: "Annual",
    icon: CalendarCheck,
    tint: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    accent: "rose",
    description: "Year-end summary with YoY comparisons and benchmarks.",
  },
};

const TYPE_ORDER: ReportType[] = ["daily", "weekly", "monthly", "quarterly", "annual"];

type FilterTab = "all" | ReportType;
type SortDir = "asc" | "desc";

/* ---------- Helpers ---------- */

function safeRelative(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "—";
  }
}

function safeFull(iso: string): string {
  try {
    return format(new Date(iso), "d MMM yyyy, h:mm a");
  } catch {
    return "—";
  }
}

function suggestReportName(type: ReportType, locationLabel: string): string {
  const today = format(new Date(), "d MMM yyyy");
  return `MyFNG ${locationLabel} ${TYPE_META[type].label} report — ${today}`;
}

/* ---------- Main view ---------- */

export function ReportsView() {
  const user = useUser();
  const activeLocationId = useAppStore((s) => s.activeLocationId);
  const setActiveLocationId = useAppStore((s) => s.setActiveLocationId);
  const qc = useQueryClient();
  const { data: locations } = useLocations();

  const canGenerate = can(user.role, "reports.generate");
  const canUseAi = can(user.role, "ai.use");

  const [typeFilter, setTypeFilter] = useState<FilterTab>("all");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [generateOpen, setGenerateOpen] = useState(false);

  // Generate dialog state
  const [genType, setGenType] = useState<ReportType>("weekly");
  const [genLocation, setGenLocation] = useState<string>("all");
  const [genName, setGenName] = useState<string>("");
  const [genNameTouched, setGenNameTouched] = useState(false);

  // AI summary state
  const [aiLocation, setAiLocation] = useState<string>("");
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiDeltas, setAiDeltas] = useState<{ searchViews: number } | null>(null);
  const [aiLocationLabel, setAiLocationLabel] = useState<string>("");

  /* --- Reports query --- */
  const reportsUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (activeLocationId && activeLocationId !== "all")
      params.set("locationId", activeLocationId);
    if (typeFilter !== "all") params.set("type", typeFilter);
    return `/api/reports?${params.toString()}`;
  }, [activeLocationId, typeFilter]);

  const { data: reports, isLoading } = useQuery<ReportItem[]>({
    queryKey: ["reports", reportsUrl],
    queryFn: () => api<ReportItem[]>(reportsUrl),
  });

  /* --- Sorted list (default desc by date) --- */
  const sortedReports = useMemo(() => {
    const list = reports ? [...reports] : [];
    list.sort((a, b) => {
      const ta = new Date(a.generatedAt).getTime();
      const tb = new Date(b.generatedAt).getTime();
      return sortDir === "desc" ? tb - ta : ta - tb;
    });
    return list;
  }, [reports, sortDir]);

  /* --- Stats from the unfiltered (per-location) report set --- */
  const stats = useMemo(() => {
    const list = reports ?? [];
    return {
      total: list.length,
      daily: list.filter((r) => r.reportType === "daily").length,
      weekly: list.filter((r) => r.reportType === "weekly").length,
      monthly: list.filter((r) => r.reportType === "monthly").length,
      qa: list.filter((r) => r.reportType === "quarterly" || r.reportType === "annual").length,
    };
  }, [reports]);

  /* --- Generate mutation --- */
  const generateMut = useMutation({
    mutationFn: (payload: { reportType: ReportType; locationId?: string; reportName?: string }) =>
      api<{ id: string; reportName: string }>("/api/reports", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (_data, vars) => {
      toast.success(`${TYPE_META[vars.reportType].label} report generated`);
      qc.invalidateQueries({ queryKey: ["reports"] });
      setGenerateOpen(false);
      resetGenerateForm();
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Failed to generate report";
      toast.error(msg);
    },
  });

  /* --- AI summary mutation --- */
  const aiSummaryMut = useMutation({
    mutationFn: (locationId: string) =>
      api<AiSummaryResponse>("/api/ai", {
        method: "POST",
        body: JSON.stringify({ action: "summary", locationId }),
      }),
    onSuccess: (data, locationId) => {
      setAiSummary(data.summary);
      setAiDeltas(data.deltas);
      const loc = (locations ?? []).find((l) => l.id === locationId);
      setAiLocationLabel(loc ? `${loc.name} · ${loc.city}` : "Selected location");
      toast.success("MiSA AI monthly summary ready");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "MiSA AI summary failed";
      toast.error(msg);
    },
  });

  function resetGenerateForm() {
    setGenType("weekly");
    setGenLocation("all");
    setGenName("");
    setGenNameTouched(false);
  }

  function openGenerateDialog() {
    resetGenerateForm();
    setGenerateOpen(true);
  }

  /* Auto-suggest the report name unless the user has manually edited it */
  const suggestedName = useMemo(() => {
    const locLabel =
      genLocation === "all"
        ? "All Locations"
        : (locations ?? []).find((l) => l.id === genLocation)?.city ?? "All";
    return suggestReportName(genType, locLabel);
  }, [genType, genLocation, locations]);

  const effectiveGenName = genNameTouched ? genName : suggestedName;

  function handleGenerate() {
    if (!canGenerate) return;
    const payload: { reportType: ReportType; locationId?: string; reportName?: string } = {
      reportType: genType,
      reportName: effectiveGenName.trim() || suggestedName,
    };
    if (genLocation !== "all") payload.locationId = genLocation;
    generateMut.mutate(payload);
  }

  function handleRegenerate(r: ReportItem) {
    if (!canGenerate) return;
    generateMut.mutate({
      reportType: r.reportType,
      locationId: r.locationId ?? undefined,
      reportName: r.reportName,
    });
  }

  function handleDownload(r: ReportItem) {
    if (!r.fileUrl) {
      toast.error("Report file is not available");
      return;
    }
    window.open(r.fileUrl, "_blank", "noopener,noreferrer");
  }

  function handleGenerateAiSummary() {
    if (!canUseAi) return;
    if (!aiLocation) {
      toast.error("Select a location to generate an AI monthly summary");
      return;
    }
    setAiSummary(null);
    setAiDeltas(null);
    aiSummaryMut.mutate(aiLocation);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <PageHeader
        title="Reports"
        description="Generate & download performance reports"
        icon={FileBarChart}
        actions={
          <>
            <Select
              value={activeLocationId}
              onValueChange={(v) => setActiveLocationId(v as string | "all")}
            >
              <SelectTrigger size="sm" className="min-w-[180px] sm:w-[220px]">
                <Filter className="size-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="All locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {(locations ?? []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name} · {l.city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {canGenerate && (
              <Button size="sm" onClick={openGenerateDialog}>
                <Plus className="size-3.5 mr-1.5" /> Generate Report
              </Button>
            )}
          </>
        }
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              label="Total Reports"
              value={stats.total}
              icon={FileBarChart}
              accent="emerald"
              hint="All types"
            />
            <StatCard
              label="Daily"
              value={stats.daily}
              icon={Calendar}
              accent="slate"
              hint="Snapshot reports"
            />
            <StatCard
              label="Weekly"
              value={stats.weekly}
              icon={CalendarDays}
              accent="emerald"
              hint="7-day reports"
            />
            <StatCard
              label="Monthly"
              value={stats.monthly}
              icon={CalendarRange}
              accent="amber"
              hint="Calendar-month reports"
            />
            <StatCard
              label="Quarterly / Annual"
              value={stats.qa}
              icon={CalendarClock}
              accent="teal"
              hint="Q1–Q4 + Year-end"
            />
          </>
        )}
      </div>

      {/* Filter tabs + sort toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as FilterTab)}>
          <TabsList className="w-full sm:w-auto overflow-x-auto">
            <TabsTrigger value="all">All</TabsTrigger>
            {TYPE_ORDER.map((t) => {
              const M = TYPE_META[t];
              const Icon = M.icon;
              return (
                <TabsTrigger key={t} value={t}>
                  <Icon className="size-3.5" />
                  <span className="hidden sm:inline">{M.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
          className="shrink-0"
        >
          <ArrowUpDown className="size-3.5 mr-1.5" />
          Date {sortDir === "desc" ? "Newest" : "Oldest"}
        </Button>
      </div>

      {/* Reports table */}
      <CardSection
        title="Generated Reports"
        description={`${sortedReports.length} report${sortedReports.length === 1 ? "" : "s"} for the current selection`}
      >
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : sortedReports.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No reports yet"
            description="Generate your first report."
            action={
              canGenerate ? (
                <Button size="sm" onClick={openGenerateDialog}>
                  <Plus className="size-3.5 mr-1.5" /> Generate Report
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="max-h-[calc(100vh-20rem)] overflow-y-auto rounded-md border">
            <ScrollArea className="h-full">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead className="min-w-[220px]">Report</TableHead>
                    <TableHead className="min-w-[110px]">Type</TableHead>
                    <TableHead className="min-w-[180px]">Location</TableHead>
                    <TableHead className="min-w-[140px]">Generated by</TableHead>
                    <TableHead className="min-w-[150px]">Generated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedReports.map((r) => {
                    const M = TYPE_META[r.reportType];
                    const Icon = M.icon;
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-md", M.tint)}>
                              <Icon className="size-4" />
                            </span>
                            <span className="font-medium truncate" title={r.reportName}>
                              {r.reportName}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("font-medium capitalize", M.tint)}>
                            {M.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm">
                            {r.locationId ? (
                              <>
                                <Building2 className="size-3.5 text-muted-foreground" />
                                <span className="truncate">{r.locationName}</span>
                                {r.locationCity && (
                                  <span className="text-muted-foreground truncate">· {r.locationCity}</span>
                                )}
                              </>
                            ) : (
                              <>
                                <MapPin className="size-3.5 text-muted-foreground" />
                                <span className="text-muted-foreground">All Locations</span>
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm">
                            <User className="size-3.5 text-muted-foreground" />
                            <span className="truncate">{r.generatedBy}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help text-sm text-muted-foreground">
                                {safeRelative(r.generatedAt)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{safeFull(r.generatedAt)}</TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownload(r)}
                              title="Download PDF"
                            >
                              <Download className="size-3.5 mr-1.5" />
                              <span className="hidden sm:inline">Download</span>
                            </Button>
                            {canGenerate && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRegenerate(r)}
                                disabled={generateMut.isPending}
                                title="Regenerate this report"
                              >
                                <RefreshCw className={cn("size-3.5", generateMut.isPending && "animate-spin")} />
                                <span className="sr-only">Regenerate</span>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}
      </CardSection>

      {/* AI Monthly Summary (MiSA AI) — gated */}
      {canUseAi && (
        <CardSection
          title="MiSA AI Monthly Summary"
          description="Auto-generated executive summary of last 30 days of GBP performance"
          action={
            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 font-medium">
              <Sparkles className="size-3 mr-1" /> MiSA AI
            </Badge>
          }
        >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Controls */}
            <div className="lg:col-span-1 space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium">
                  Location <span className="text-rose-500">*</span>
                </Label>
                <Select value={aiLocation} onValueChange={setAiLocation}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a location" />
                  </SelectTrigger>
                  <SelectContent>
                    {(locations ?? []).map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name} · {l.city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  A specific location is required to compute month-over-month deltas.
                </p>
              </div>
              <Button
                className="w-full"
                onClick={handleGenerateAiSummary}
                disabled={aiSummaryMut.isPending || !aiLocation}
              >
                {aiSummaryMut.isPending ? (
                  <>
                    <Loader2 className="size-4 mr-2 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4 mr-2" />
                    {aiSummary ? "Regenerate with MiSA AI" : "Generate with MiSA AI"}
                  </>
                )}
              </Button>
              {aiSummaryMut.isPending && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="size-3 animate-spin" />
                  Analyzing 30-day metrics — this takes ~15 seconds.
                </p>
              )}
            </div>

            {/* Result card */}
            <div className="lg:col-span-2">
              {aiSummaryMut.isPending ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 h-full min-h-[220px] flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-32" />
                  </div>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-[95%]" />
                  <Skeleton className="h-4 w-[88%]" />
                  <Skeleton className="h-4 w-[70%]" />
                  <Skeleton className="h-4 w-[60%]" />
                </div>
              ) : aiSummary ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 h-full">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex size-8 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Sparkles className="size-4" />
                      </span>
                      <div>
                        <div className="text-sm font-semibold">Monthly Summary</div>
                        <div className="text-xs text-muted-foreground">{aiLocationLabel}</div>
                      </div>
                    </div>
                    {aiDeltas && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-medium tabular-nums",
                          aiDeltas.searchViews >= 0
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
                        )}
                      >
                        {aiDeltas.searchViews >= 0 ? (
                          <TrendingUp className="size-3 mr-1" />
                        ) : (
                          <TrendingDown className="size-3 mr-1" />
                        )}
                        {aiDeltas.searchViews >= 0 ? "+" : ""}
                        {aiDeltas.searchViews.toLocaleString()} search views
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                    {aiSummary}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 p-5 h-full min-h-[220px] flex flex-col items-center justify-center text-center">
                  <Sparkles className="size-7 text-amber-500 mb-2" />
                  <div className="text-sm font-medium">No summary yet</div>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                    Pick a location and click “Generate with MiSA AI” to produce a
                    narrative summary of the last 30 days.
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardSection>
      )}

      {/* Generate dialog */}
      <Dialog
        open={generateOpen}
        onOpenChange={(o) => {
          setGenerateOpen(o);
          if (!o) resetGenerateForm();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate Report</DialogTitle>
            <DialogDescription>
              Pick a type, optionally scope it to a location, and we'll generate a downloadable PDF.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Report type</Label>
              <Select
                value={genType}
                onValueChange={(v) => setGenType(v as ReportType)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_ORDER.map((t) => {
                    const M = TYPE_META[t];
                    const Icon = M.icon;
                    return (
                      <SelectItem key={t} value={t}>
                        <Icon className="size-4" />
                        <span>{M.label}</span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{TYPE_META[genType].description}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Location (optional)</Label>
              <Select value={genLocation} onValueChange={setGenLocation}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {(locations ?? []).map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name} · {l.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Report name</Label>
              <Input
                value={effectiveGenName}
                onChange={(e) => {
                  setGenName(e.target.value);
                  setGenNameTouched(true);
                }}
                placeholder={suggestedName}
              />
              <p className="text-xs text-muted-foreground">
                Auto-suggested from type, location and today's date. Edit if needed.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setGenerateOpen(false);
                resetGenerateForm();
              }}
              disabled={generateMut.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={generateMut.isPending}
            >
              {generateMut.isPending ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <FileBarChart className="size-4 mr-2" /> Generate
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- Local EmptyState ---------- */

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      <div className="size-12 rounded-full bg-muted flex items-center justify-center mb-3">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <div className="text-sm font-medium">{title}</div>
      {description && (
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
