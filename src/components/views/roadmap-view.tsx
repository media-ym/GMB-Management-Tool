"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Map, RefreshCw, Loader2,
  TrendingUp, CheckCircle2, Clock, CircleDot, ListChecks, CheckSquare,
  CalendarRange, GitBranch, Flag, Target, ShieldAlert,
  Users, Building2, Star, FileText, Hash, FileBarChart, Sparkles, ScrollText,
  CircleCheck, Circle, AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { useUser } from "@/lib/user-context";
import { cn } from "@/lib/utils";
import { PageHeader, CardSection } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// ── Types (mirror /api/roadmap) ──────────────────────────────────────
type PhaseStatus = "completed" | "in_progress" | "pending";
type SprintStatus = "completed" | "in_progress" | "pending";
type RiskImpact = "High" | "Medium";

interface Deliverable { item: string; done: boolean; }
interface Phase {
  phase: number; name: string; weeks: string; objective: string; milestone: string;
  status: PhaseStatus; progress: number; deliverables: Deliverable[];
}
interface Sprint { sprint: number; name: string; phase: number; status: SprintStatus; }
interface Risk { risk: string; impact: RiskImpact; mitigation: string; }
interface SuccessMetric { metric: string; target: string; current: string; achieved: boolean; }

interface RoadmapData {
  timeline: { totalWeeks: string; methodology: string; sprintLength: string };
  summary: {
    totalPhases: number; completedPhases: number; inProgressPhases: number; pendingPhases: number;
    totalDeliverables: number; completedDeliverables: number; overallProgress: number;
  };
  stats: {
    users: number; locations: number; reviews: number; posts: number;
    keywords: number; reports: number; aiJobs: number; auditLogs: number;
  };
  phases: Phase[];
  sprints: Sprint[];
  risks: Risk[];
  successMetrics: SuccessMetric[];
}

// ── Status helpers ───────────────────────────────────────────────────
const STATUS_META: Record<PhaseStatus, {
  label: string;
  badge: string;        // badge bg/text/border
  circle: string;       // numbered circle bg/text
  line: string;         // timeline connector line bg
  progressFill: string; // progress bar fill bg
  dot: string;          // accent dot
}> = {
  completed: {
    label: "Completed",
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    circle: "bg-emerald-500 text-white",
    line: "bg-emerald-300 dark:bg-emerald-700/60",
    progressFill: "bg-emerald-500",
    dot: "bg-emerald-500",
  },
  in_progress: {
    label: "In Progress",
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    circle: "bg-amber-500 text-white",
    line: "bg-amber-300 dark:bg-amber-700/60",
    progressFill: "bg-amber-500",
    dot: "bg-amber-500",
  },
  pending: {
    label: "Pending",
    badge: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
    circle: "bg-slate-400 dark:bg-slate-600 text-white",
    line: "bg-slate-200 dark:bg-slate-700/60",
    progressFill: "bg-slate-400",
    dot: "bg-slate-400",
  },
};

const SPRINT_META: Record<SprintStatus, { label: string; cls: string }> = {
  completed: { label: "Completed", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  in_progress: { label: "In Progress", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  pending: { label: "Pending", cls: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" },
};

const IMPACT_META: Record<RiskImpact, { cls: string }> = {
  High: { cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" },
  Medium: { cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
};

// ── Custom progress bar (color-controlled by status) ─────────────────
function ProgressBar({ value, fillClass, className }: { value: number; fillClass: string; className?: string }) {
  return (
    <div className={cn("relative h-2 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/60", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500", fillClass)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

// ── Main view ────────────────────────────────────────────────────────
export function RoadmapView() {
  const user = useUser();
  const queryClient = useQueryClient();
  const setView = useAppStore((s) => s.setView);

  const { data, isLoading, isFetching, isError, refetch } = useQuery<RoadmapData>({
    queryKey: ["roadmap"],
    queryFn: () => api<RoadmapData>("/api/roadmap"),
    staleTime: 60_000,
  });

  const handleRefresh = async () => {
    try {
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["roadmap"] });
      toast.success("Roadmap refreshed", { description: "Implementation status recomputed from live data." });
    } catch (e) {
      toast.error("Failed to refresh roadmap", { description: e instanceof Error ? e.message : "Unknown error" });
    }
  };

  const summary = data?.summary;
  const timeline = data?.timeline;

  // ── Loading ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-5">
        <PageHeader
          title="Project Roadmap"
          description="20–24 week phased implementation plan · Agile Scrum"
          icon={Map}
          actions={
            <Button variant="outline" size="sm" disabled>
              <Loader2 className="size-4 animate-spin" />
              Refresh
            </Button>
          }
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-7 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-5 space-y-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-full" />
          </CardContent>
        </Card>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5 flex gap-4">
                <Skeleton className="size-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2 w-full" />
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────
  if (isError || !data || !summary || !timeline) {
    return (
      <div className="p-4 sm:p-6">
        <PageHeader
          title="Project Roadmap"
          description="20–24 week phased implementation plan · Agile Scrum"
          icon={Map}
          actions={
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="size-4" />
              Refresh
            </Button>
          }
        />
        <Card>
          <CardContent className="p-10 text-center">
            <ShieldAlert className="size-12 mx-auto text-amber-500 mb-3" />
            <h2 className="text-lg font-semibold">Unable to load roadmap</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              The roadmap data could not be fetched. Please check your connection and try again.
            </p>
            <Button className="mt-4" onClick={handleRefresh}>
              <RefreshCw className="size-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const overallPct = summary.overallProgress;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title="Project Roadmap"
        description={`${timeline.totalWeeks} weeks phased implementation plan · ${timeline.methodology} · ${timeline.sprintLength}`}
        icon={Map}
        actions={
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
            {isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Refresh
          </Button>
        }
      />

      {/* ── Summary stat row (6 cards) ─────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <StatCard
          label="Overall Progress"
          value={`${overallPct}%`}
          icon={TrendingUp}
          accent="emerald"
          hint={`${summary.completedDeliverables}/${summary.totalDeliverables} deliverables`}
        />
        <StatCard
          label="Completed Phases"
          value={`${summary.completedPhases}/${summary.totalPhases}`}
          icon={CheckCircle2}
          accent="emerald"
        />
        <StatCard
          label="In Progress"
          value={summary.inProgressPhases}
          icon={Clock}
          accent="amber"
        />
        <StatCard
          label="Pending"
          value={summary.pendingPhases}
          icon={CircleDot}
          accent="slate"
        />
        <StatCard
          label="Total Deliverables"
          value={summary.totalDeliverables}
          icon={ListChecks}
          accent="teal"
        />
        <StatCard
          label="Completed Items"
          value={summary.completedDeliverables}
          icon={CheckSquare}
          accent="emerald"
        />
      </div>

      {/* ── Overall progress bar ───────────────────────────────────── */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-semibold">Overall Implementation Progress</span>
            </div>
            <span className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {overallPct}%
            </span>
          </div>
          <ProgressBar value={overallPct} fillClass="bg-emerald-500" className="h-3" />
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500" />
              {summary.completedPhases} completed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-amber-500" />
              {summary.inProgressPhases} in progress
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-slate-400" />
              {summary.pendingPhases} pending
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Phase Timeline (centerpiece) ────────────────────────────── */}
      <CardSection
        title="Phase Timeline"
        description="10-phase development plan with deliverables and milestones"
        action={
          <Badge variant="outline" className="hidden sm:inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
            <CalendarRange className="size-3" />
            {timeline.totalWeeks} weeks
          </Badge>
        }
      >
        <div className="max-h-[calc(100vh-20rem)] overflow-y-auto scroll-area pr-2 -mr-2">
          <ol className="relative space-y-4">
            {data.phases.map((p, idx) => {
              const meta = STATUS_META[p.status];
              const isLast = idx === data.phases.length - 1;
              const doneCount = p.deliverables.filter((d) => d.done).length;
              return (
                <li key={p.phase} className="relative">
                  {/* Connector line (rendered on the circle column) */}
                  {!isLast && (
                    <span
                      className={cn(
                        "absolute left-5 top-12 bottom-[-1rem] w-0.5",
                        meta.line,
                      )}
                      aria-hidden
                    />
                  )}
                  <div className="flex gap-3 sm:gap-4">
                    {/* Numbered circle */}
                    <div className="flex flex-col items-center shrink-0">
                      <div
                        className={cn(
                          "size-10 rounded-full flex items-center justify-center font-bold text-sm shadow-sm ring-4 ring-background",
                          meta.circle,
                        )}
                      >
                        {p.status === "completed" ? <CheckCircle2 className="size-5" /> : p.phase}
                      </div>
                    </div>

                    {/* Phase card */}
                    <Card className="flex-1 min-w-0 overflow-hidden">
                      <CardContent className="p-4 sm:p-5">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-sm sm:text-base font-semibold">
                                Phase {p.phase}: {p.name}
                              </h4>
                              <Badge variant="outline" className={cn("font-medium", meta.badge)}>
                                {meta.label}
                              </Badge>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <CalendarRange className="size-3" />
                                {p.weeks}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Flag className="size-3" />
                                Milestone: <span className="font-medium text-foreground">{p.milestone}</span>
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs text-muted-foreground">Progress</div>
                            <div className="text-lg font-bold tabular-nums">{p.progress}%</div>
                          </div>
                        </div>

                        <p className="text-sm text-muted-foreground mb-3">{p.objective}</p>

                        <div className="flex items-center gap-3 mb-3">
                          <ProgressBar value={p.progress} fillClass={meta.progressFill} className="flex-1" />
                          <span className="text-xs font-medium tabular-nums text-muted-foreground w-9 text-right">
                            {doneCount}/{p.deliverables.length}
                          </span>
                        </div>

                        {/* Deliverables checklist */}
                        <div className="rounded-lg bg-muted/40 dark:bg-muted/20 p-3">
                          <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                            Deliverables
                          </div>
                          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5">
                            {p.deliverables.map((d, di) => (
                              <li key={di} className="flex items-start gap-2 text-sm min-w-0">
                                {d.done ? (
                                  <CircleCheck className="size-4 shrink-0 mt-0.5 text-emerald-500" />
                                ) : (
                                  <Circle className="size-4 shrink-0 mt-0.5 text-slate-300 dark:text-slate-600" />
                                )}
                                <span className={cn("min-w-0", d.done ? "text-foreground" : "text-muted-foreground line-through decoration-muted-foreground/40")}>
                                  {d.item}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </CardSection>

      {/* ── Sprint Breakdown ──────────────────────────────────────── */}
      <CardSection
        title="Sprint Breakdown"
        description="12 sprints · 2-week cadence"
        action={
          <Badge variant="outline" className="hidden sm:inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
            <GitBranch className="size-3" />
            {timeline.sprintLength}
          </Badge>
        }
      >
        {/* Desktop: table */}
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Sprint</TableHead>
                <TableHead>Focus</TableHead>
                <TableHead className="w-24">Phase</TableHead>
                <TableHead className="w-32">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.sprints.map((s) => {
                const meta = SPRINT_META[s.status];
                return (
                  <TableRow key={s.sprint}>
                    <TableCell className="font-mono font-semibold tabular-nums">#{s.sprint}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20">
                        Phase {s.phase}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("font-medium", meta.cls)}>
                        {meta.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Mobile: cards */}
        <div className="md:hidden grid grid-cols-1 gap-2 max-h-96 overflow-y-auto scroll-area">
          {data.sprints.map((s) => {
            const meta = SPRINT_META[s.status];
            return (
              <div key={s.sprint} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-mono font-semibold text-sm">Sprint #{s.sprint}</span>
                  <Badge variant="outline" className={cn("font-medium", meta.cls)}>{meta.label}</Badge>
                </div>
                <p className="text-sm font-medium">{s.name}</p>
                <div className="mt-1">
                  <Badge variant="outline" className="bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20">
                    Phase {s.phase}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </CardSection>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Risk Register ─────────────────────────────────────────── */}
        <CardSection
          title="Risk Register"
          description="Top risks with mitigation strategies"
          action={
            <Badge variant="outline" className="hidden sm:inline-flex items-center gap-1.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20">
              <ShieldAlert className="size-3" />
              {data.risks.length} risks
            </Badge>
          }
        >
          {/* Desktop table */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Risk</TableHead>
                  <TableHead className="w-24">Impact</TableHead>
                  <TableHead>Mitigation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.risks.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium align-top">{r.risk}</TableCell>
                    <TableCell className="align-top">
                      <Badge variant="outline" className={cn("font-medium", IMPACT_META[r.impact].cls)}>
                        {r.impact}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground align-top">{r.mitigation}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {data.risks.map((r, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-medium text-sm">{r.risk}</span>
                  <Badge variant="outline" className={cn("font-medium shrink-0", IMPACT_META[r.impact].cls)}>
                    {r.impact}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{r.mitigation}</p>
              </div>
            ))}
          </div>
        </CardSection>

        {/* ── Success Metrics ───────────────────────────────────────── */}
        <CardSection
          title="Success Metrics"
          description="Launch criteria and current status"
          action={
            <Badge variant="outline" className="hidden sm:inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
              <Target className="size-3" />
              {data.successMetrics.filter(m => m.achieved).length}/{data.successMetrics.length} achieved
            </Badge>
          }
        >
          {/* Desktop table */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead className="w-24">Target</TableHead>
                  <TableHead className="w-32">Current</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.successMetrics.map((m, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{m.metric}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{m.target}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{m.current}</TableCell>
                    <TableCell>
                      {m.achieved ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-medium">
                          <CheckCircle2 className="size-3" />
                          Achieved
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 font-medium">
                          <Clock className="size-3" />
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {data.successMetrics.map((m, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-medium text-sm flex-1">{m.metric}</span>
                  {m.achieved ? (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-medium shrink-0">
                      <CheckCircle2 className="size-3" />
                      Achieved
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 font-medium shrink-0">
                      <Clock className="size-3" />
                      Pending
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>Target: <span className="font-medium text-foreground">{m.target}</span></span>
                  <span>·</span>
                  <span>Current: <span className="font-medium text-foreground">{m.current}</span></span>
                </div>
              </div>
            ))}
          </div>
        </CardSection>
      </div>

      {/* ── Platform Stats ─────────────────────────────────────────── */}
      <CardSection
        title="Platform Stats"
        description="Live data counts backing the roadmap implementation status"
        action={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setView("dashboard")}
          >
            View dashboard
          </Button>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <PlatformStat icon={Users} label="Users" value={data.stats.users} accent="emerald" />
          <PlatformStat icon={Building2} label="Locations" value={data.stats.locations} accent="emerald" />
          <PlatformStat icon={Star} label="Reviews" value={data.stats.reviews} accent="amber" />
          <PlatformStat icon={FileText} label="Posts" value={data.stats.posts} accent="amber" />
          <PlatformStat icon={Hash} label="Keywords" value={data.stats.keywords} accent="teal" />
          <PlatformStat icon={FileBarChart} label="Reports" value={data.stats.reports} accent="teal" />
          <PlatformStat icon={Sparkles} label="AI Jobs" value={data.stats.aiJobs} accent="amber" />
          <PlatformStat icon={ScrollText} label="Audit Logs" value={data.stats.auditLogs} accent="slate" />
        </div>
      </CardSection>

      {/* Footer hint for viewer role */}
      <p className="sr-only">
        Viewing project roadmap as {user.role.replace("_", " ")}. {summary.completedPhases} of {summary.totalPhases} phases complete.
      </p>
    </div>
  );
}

// ── Platform stat mini-card ─────────────────────────────────────────
function PlatformStat({
  icon: Icon, label, value, accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent: "emerald" | "amber" | "teal" | "rose" | "slate";
}) {
  const ACCENT: Record<typeof accent, string> = {
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    teal: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    slate: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  };
  return (
    <div className="rounded-lg border bg-card p-3 sm:p-4 flex items-center gap-3">
      <div className={cn("size-9 rounded-md flex items-center justify-center shrink-0", ACCENT[accent])}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        <div className="text-lg font-bold tabular-nums">{value.toLocaleString()}</div>
      </div>
    </div>
  );
}
