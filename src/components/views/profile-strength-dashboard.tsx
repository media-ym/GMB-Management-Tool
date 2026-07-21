"use client";

import { useMemo, useState } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
} from "recharts";
import { Info, TrendingUp, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  computeProfileStrength,
  type ProfileStrengthInput,
  type ProfileStrengthMetric,
  type ProfileStrengthMetricKey,
} from "@/lib/profile-strength";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

function metricScoreClass(score: number): string {
  if (score >= 7.5) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 5) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function overallScoreClass(score: number): string {
  if (score >= 7.5) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 5) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function statusBadge(status: ProfileStrengthMetric["status"]) {
  if (status === "pass") return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">Pass</Badge>;
  if (status === "warn") return <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">Needs work</Badge>;
  if (status === "unavailable") return <Badge className="bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-100">Not synced</Badge>;
  return <Badge className="bg-rose-100 text-rose-700 border-rose-200 hover:bg-rose-100">Critical</Badge>;
}

function formatScore(score: number | null): string {
  return score == null ? "—" : score.toFixed(2);
}

function exportCsv(locationName: string, metrics: ProfileStrengthMetric[], overall: number | null) {
  const rows = [
    ["Location", locationName],
    ["Overall Score (out of 10)", overall == null ? "N/A" : String(overall)],
    [],
    ["Metric", "Score (out of 10)", "Score %", "Status"],
    ...metrics.map((m) => [m.label, m.score == null ? "N/A" : String(m.score), m.scorePercent == null ? "N/A" : String(m.scorePercent), m.status]),
  ];
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${locationName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-profile-strength.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadReport(locationName: string, metrics: ProfileStrengthMetric[], overall: number | null, improvementAreas: number) {
  const lines = [
    `Profile Strength Report — ${locationName}`,
    `Generated: ${new Date().toLocaleString("en-IN")}`,
    ``,
    `Overall Score: ${overall == null ? "N/A" : `${overall} / 10`}`,
    `Improvement Areas: ${improvementAreas}`,
    ``,
    ...metrics.flatMap((m) => [
      `${m.label}: ${m.score == null ? "N/A" : `${m.score} / 10`}${m.scorePercent == null ? "" : ` (${m.scorePercent}%)`} — ${m.status}`,
      ...m.items.map((item, i) => `  ${i + 1}. ${item.ok ? "✓" : "✗"} ${item.text}`),
      "",
    ]),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${locationName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-profile-strength-report.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ProfileStrengthDashboard({ detail }: { detail: ProfileStrengthInput & { location: { name: string } } }) {
  const result = useMemo(() => computeProfileStrength(detail), [detail]);
  const [activeKey, setActiveKey] = useState<ProfileStrengthMetricKey>("onPage");

  const activeMetric = result.metrics.find((m) => m.key === activeKey) ?? result.metrics[0];
  const radarData = result.metrics
    .filter((m) => m.dataAvailable && m.score != null)
    .map((m) => ({
      metric: m.shortLabel,
      score: m.score as number,
      fullMark: 10,
    }));

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">Profile Strength</h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground">
                    <Info className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Composite score from on-page SEO, content, reviews, sentiment, website, rankings, and traffic — based on live Google Business Profile data.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="border-primary/30 text-primary hover:bg-primary/5" onClick={() => toast.info("Trend view coming soon — historical profile strength tracking.")}>
              <TrendingUp className="size-3.5 mr-1.5" /> See Trend
            </Button>
            <Button size="sm" variant="outline" onClick={() => exportCsv(detail.location.name, result.metrics, result.overallScore)}>
              <Download className="size-3.5 mr-1.5" /> Export CSV
            </Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => downloadReport(detail.location.name, result.metrics, result.overallScore, result.improvementAreas)}>
              <FileText className="size-3.5 mr-1.5" /> Download Report
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className={cn("text-4xl sm:text-5xl font-bold tabular-nums", result.overallScore != null ? overallScoreClass(result.overallScore) : "text-muted-foreground")}>
            {result.overallScore == null ? "—" : result.overallScore}
            <span className="text-lg sm:text-xl font-medium text-muted-foreground ml-1">out of 10</span>
          </div>
          {result.improvementAreas > 0 && (
            <Badge variant="secondary" className="text-sm px-3 py-1 bg-muted text-foreground">
              {result.improvementAreas} Improvement Area{result.improvementAreas === 1 ? "" : "s"}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_220px_1fr] gap-6 items-start">
          <div className="rounded-xl border bg-muted/20 p-4 min-h-[280px]">
            {radarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fontSize: 10 }} axisLine={false} />
                  <Radar name="Score" dataKey="score" stroke="#0047AB" fill="#0096FF" fillOpacity={0.35} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground text-center px-4">
                Sync location data to populate the profile strength chart.
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            {result.metrics.map((m) => {
              const rowTint =
                m.status === "pass"
                  ? "bg-emerald-50/70 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-800/40"
                  : m.status === "warn"
                    ? "bg-amber-50/70 border-amber-100 dark:bg-amber-950/20 dark:border-amber-800/40"
                    : m.status === "fail"
                      ? "bg-rose-50/70 border-rose-100 dark:bg-rose-950/20 dark:border-rose-800/40"
                      : "bg-slate-50/80 border-slate-100 dark:bg-slate-900/30 dark:border-slate-700/40";
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setActiveKey(m.key)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition border",
                    activeKey === m.key
                      ? "bg-[#0096FF]/12 border-[#0096FF]/35 ring-1 ring-[#0096FF]/20"
                      : rowTint,
                    "hover:brightness-[0.98]",
                  )}
                >
                  <span className="font-medium truncate">{m.label}</span>
                  <span className={cn(
                    "font-bold tabular-nums shrink-0",
                    m.score == null ? "text-muted-foreground" : metricScoreClass(m.score),
                  )}>
                    {formatScore(m.score)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className={cn(
            "rounded-xl border p-4 sm:p-5 min-h-[280px]",
            activeMetric.status === "unavailable" ? "bg-muted/40 border-border"
              : activeMetric.status === "pass" ? "bg-emerald-50/60 border-emerald-200/60 dark:bg-emerald-950/20 dark:border-emerald-800/40"
              : activeMetric.status === "warn" ? "bg-amber-50/60 border-amber-200/60 dark:bg-amber-950/20 dark:border-amber-800/40"
                : "bg-rose-50/60 border-rose-200/60 dark:bg-rose-950/20 dark:border-rose-800/40",
          )}>
            <div className="flex items-start justify-between gap-2 mb-4">
              <h4 className="font-semibold text-sm sm:text-base">
                {activeMetric.label}: {formatScore(activeMetric.score)}
              </h4>
              {statusBadge(activeMetric.status)}
            </div>
            <ol className="space-y-3 text-sm text-foreground/90 list-decimal list-inside">
              {activeMetric.items.map((item, i) => (
                <li key={i} className={cn(!item.ok && "text-foreground")}>
                  <span className={cn(!item.ok && "font-medium")}>{item.text}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
