"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, MessageSquare, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { can } from "@/lib/permissions";
import { setMisaPendingPrompt } from "@/lib/misa-handoff";
import {
  filterMisaInsightsByView,
  getMisaOverviewConfig,
  misaInsightToneLabel,
} from "@/lib/misa-overview";
import type { ViewKey } from "@/lib/types";
import { useUser } from "@/lib/user-context";
import { useAppNavigation } from "@/hooks/use-app-navigation";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { PriorityScanReport } from "@/lib/priority-scan";
import { Download } from "lucide-react";

type MisaInsight = {
  type: "warning" | "success" | "info" | "critical";
  category: string;
  title: string;
  description: string;
  locationName?: string;
  impact: "high" | "medium" | "low";
  action?: string;
};

export function MisaOverviewStrip({ view }: { view: ViewKey }) {
  const user = useUser();
  const { navigate } = useAppNavigation();
  const qc = useQueryClient();
  const selectedLocationIds = useAppStore((s) => s.selectedLocationIds);
  const cfg = getMisaOverviewConfig(view);

  const canUseAi = can(user.role, "ai.use");
  const canViewInsights = canUseAi || can(user.role, "analytics.view");

  const [scanning, setScanning] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanReport, setScanReport] = useState<PriorityScanReport | null>(null);

  const { data, isLoading } = useQuery<{
    insights: MisaInsight[];
    summary: { total: number; critical: number; warnings: number; successes: number };
  }>({
    queryKey: ["misa-overview-insights"],
    queryFn: () => api("/api/analytics/ai-insights"),
    enabled: !!cfg && canViewInsights,
    staleTime: 60_000,
  });

  const insights = useMemo(
    () => filterMisaInsightsByView(data?.insights ?? [], view).slice(0, 3),
    [data?.insights, view],
  );

  if (!cfg || !canViewInsights) return null;

  function openMisa(prompt?: string) {
    if (!canUseAi) {
      toast.error("Is role pe MiSA chat available nahi hai");
      return;
    }
    if (prompt) setMisaPendingPrompt(prompt);
    navigate("ai");
  }

  async function handlePriorityScan() {
    try {
      setScanning(true);
      toast.loading("Saari GMB profiles scan ho rahi hain…", { id: "priority-scan" });
      const report = await api<PriorityScanReport>("/api/analytics/priority-scan", {
        method: "POST",
        body: JSON.stringify({
          locationIds: selectedLocationIds.length > 0 ? selectedLocationIds : undefined,
        }),
      });
      setScanReport(report);
      setScanOpen(true);
      qc.invalidateQueries({ queryKey: ["misa-overview-insights"] });
      qc.invalidateQueries({ queryKey: ["dashboard-misa-insights"] });
      qc.invalidateQueries({ queryKey: ["locations"] });
      toast.success(
        `Scan done · ${report.locationCount} profiles · ${report.summary.critical + report.summary.warnings} issues`,
        { id: "priority-scan" },
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Priority scan failed";
      toast.error(msg, { id: "priority-scan" });
    } finally {
      setScanning(false);
    }
  }

  function downloadScanReport() {
    if (!scanReport?.markdown) return;
    const blob = new Blob([scanReport.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `misa-priority-scan-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openScanInMisa() {
    if (!scanReport?.markdown) return;
    setMisaPendingPrompt(
      `Yeh MiSA Priority Scan report hai. Short summarize karo, top 5 actions batao:\n\n${scanReport.markdown}`,
    );
    setScanOpen(false);
    navigate("ai");
  }

  return (
    <>
      <Card className="misa-overview-strip overflow-hidden border-0 shadow-lg shadow-[#0047AB]/25">
        <div className="relative px-4 py-4 sm:px-5 sm:py-4 text-white">
          {/* Solid blue + shine layers so strip stands out on every tab */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(125deg, #003580 0%, #0047AB 42%, #0096FF 100%)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background:
                "radial-gradient(ellipse 70% 90% at 8% 20%, rgba(255,255,255,0.35) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 92% 80%, rgba(0,200,255,0.35) 0%, transparent 50%)",
            }}
          />
          <div className="misa-overview-shine pointer-events-none absolute inset-0" />

          <div className="relative z-[1] flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="misa-bot-glow size-10 rounded-xl flex items-center justify-center shrink-0 bg-white/15 text-white ring-1 ring-white/40 backdrop-blur-sm">
                  <Bot className="size-5 drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                </div>
                <h3 className="text-base font-semibold tracking-tight text-white">MiSA AI</h3>
                <span className="text-[10px] font-semibold rounded-md bg-white/20 text-white px-2 py-0.5 ring-1 ring-white/25">
                  {cfg.tabLabel}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-cyan-100">
                  <Zap className="size-2.5 fill-cyan-200 text-cyan-200" /> Live
                </span>
              </div>
              <p className="text-xs sm:text-[13px] text-white/85 mt-1.5 leading-relaxed max-w-2xl">
                {cfg.helpLine}
              </p>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {cfg.prompts.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => openMisa(p)}
                    disabled={!canUseAi}
                    className="text-[11px] rounded-full border border-white/30 bg-white/15 px-2.5 py-1 text-white hover:bg-white/25 hover:border-white/50 transition disabled:opacity-50 backdrop-blur-sm"
                  >
                    <Sparkles className="size-2.5 inline mr-1 text-cyan-100" />
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex sm:flex-col gap-2 shrink-0">
              <Button
                size="sm"
                className="flex-1 sm:flex-none bg-white text-[#0047AB] font-semibold hover:bg-cyan-50 shadow-md"
                onClick={() => openMisa()}
                disabled={!canUseAi}
              >
                <MessageSquare className="size-3.5 mr-1.5" />
                Chat
              </Button>
              {cfg.showPriorityScan && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-none border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  onClick={handlePriorityScan}
                  disabled={scanning}
                >
                  {scanning ? (
                    <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5 mr-1.5" />
                  )}
                  Priority scan
                </Button>
              )}
            </div>
          </div>

          <div className="relative z-[1] mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg bg-white/20" />
              ))
            ) : insights.length > 0 ? (
              insights.map((ins, i) => (
                <button
                  key={`${ins.title}-${i}`}
                  type="button"
                  onClick={() =>
                    openMisa(
                      `${ins.title}. Ispe short action plan do - ${ins.description.slice(0, 140)}`,
                    )
                  }
                  disabled={!canUseAi}
                  className="text-left rounded-lg border border-white/25 bg-white/95 text-slate-900 px-3 py-2 hover:bg-white hover:shadow-md transition disabled:opacity-60"
                >
                  <span
                    className={cn(
                      "text-[10px] font-semibold",
                      ins.type === "critical" || ins.impact === "high"
                        ? "text-rose-600"
                        : ins.type === "success"
                          ? "text-emerald-600"
                          : "text-amber-600",
                    )}
                  >
                    {misaInsightToneLabel(ins.type, ins.impact)}
                  </span>
                  <div className="text-xs font-semibold line-clamp-1 mt-0.5">{ins.title}</div>
                  <p className="text-[11px] text-slate-600 line-clamp-1 mt-0.5">
                    {ins.description}
                  </p>
                </button>
              ))
            ) : (
              <div className="sm:col-span-3 text-[11px] text-white/90 rounded-lg border border-dashed border-white/35 bg-white/10 px-3 py-2.5">
                Is tab pe koi urgent alert nahi - quick questions se MiSA se poochho.
              </div>
            )}
          </div>
        </div>
      </Card>

      {cfg.showPriorityScan && (
        <Dialog open={scanOpen} onOpenChange={setScanOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
            <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-[#0096FF]" />
                Priority Scan Report
              </DialogTitle>
              <DialogDescription>
                {scanReport
                  ? `${scanReport.locationCount} profiles · ${new Date(scanReport.scannedAt).toLocaleString("en-IN")}`
                  : "Scanning…"}
              </DialogDescription>
            </DialogHeader>
            {scanReport && (
              <div className="px-5 py-4 overflow-y-auto flex-1 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border p-2">
                    <div className="text-lg font-semibold text-rose-600">{scanReport.summary.critical}</div>
                    <div className="text-[10px] text-muted-foreground">Critical</div>
                  </div>
                  <div className="rounded-lg border p-2">
                    <div className="text-lg font-semibold text-amber-600">{scanReport.summary.warnings}</div>
                    <div className="text-[10px] text-muted-foreground">Warnings</div>
                  </div>
                  <div className="rounded-lg border p-2">
                    <div className="text-lg font-semibold text-emerald-600">{scanReport.summary.successes}</div>
                    <div className="text-[10px] text-muted-foreground">Wins</div>
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {scanReport.topActions.slice(0, 6).map((a, i) => (
                    <li key={i} className="text-xs rounded-lg border px-3 py-2">
                      <Badge variant="outline" className="text-[10px] mr-1.5">
                        {a.severity}
                      </Badge>
                      <span className="font-medium">{a.title}</span>
                      <span className="text-muted-foreground"> - {a.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <DialogFooter className="px-5 py-3 border-t shrink-0">
              <Button type="button" variant="outline" size="sm" onClick={downloadScanReport} disabled={!scanReport}>
                <Download className="size-3.5 mr-1.5" /> Download
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-[linear-gradient(135deg,#0047AB_0%,#0096FF_100%)] text-white"
                onClick={openScanInMisa}
                disabled={!scanReport || !canUseAi}
              >
                <Bot className="size-3.5 mr-1.5" /> Open in MiSA
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
