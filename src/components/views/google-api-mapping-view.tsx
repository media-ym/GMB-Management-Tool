"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { PageHeader, CardSection } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
import {
  ArrowLeftRight, Search, ArrowDown, ArrowUp, ArrowRightLeft,
  RefreshCw, AlertTriangle, Shield, CheckCircle2, Clock, Server,
  Zap, Database, KeyRound, Activity, Layers,
} from "lucide-react";

interface FieldMapping {
  google: string;
  db: string;
  type: string;
  notes: string;
}

interface EntityMapping {
  id: string;
  googleObject: string;
  dbTable: string;
  dbModel: string;
  fields: FieldMapping[];
  syncDirection: string;
  syncFrequency?: string;
  status: string;
}

interface ApiData {
  googleApis: { name: string; purpose: string; status: string }[];
  authFlow: { step: number; action: string; detail: string }[];
  mappings: EntityMapping[];
  aggregationFlow: { stage: string; source: string; target: string; detail: string }[];
  syncDirection: { googleToDb: string[]; dbToGoogle: string[] };
  syncFrequencies: { entity: string; frequency: string; queue: string; priority: string }[];
  errorMapping: { httpCode: number; meaning: string; action: string; retryable: boolean; logLevel: string }[];
  retryPolicy: {
    retry: { condition: string; backoff: string; maxRetries: number }[];
    doNotRetry: { condition: string; reason: string }[];
  };
  rateLimiting: {
    strategy: string[];
    googleLimits: { readApi: string; writeApi: string; quotaPerDay: string };
    implementation: string;
  };
  serviceLayer: { service: string; responsibility: string; methods: string[] }[];
  backgroundJobs: { job: string; queue: string; frequency: string; module: string; status: string }[];
  dashboardDependencies: { dashboard: string; tables: string[] }[];
  security: { rule: string; implemented: boolean }[];
  productionChecklist: { item: string; done: boolean }[];
}

const DIRECTION_BADGE: Record<string, { label: string; cls: string; icon: typeof ArrowDown }> = {
  "google-to-db": { label: "Google → DB", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: ArrowDown },
  "db-to-google": { label: "DB → Google", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: ArrowUp },
  bidirectional: { label: "Bidirectional", cls: "bg-teal-500/10 text-teal-600 border-teal-500/20", icon: ArrowRightLeft },
  "on-demand": { label: "On Demand", cls: "bg-rose-500/10 text-rose-600 border-rose-500/20", icon: Zap },
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  "future-ready": "bg-slate-500/10 text-slate-500 border-slate-500/20",
  future: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  configured: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  available: "bg-amber-500/10 text-amber-600 border-amber-500/20",
};

const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  medium: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  low: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  future: "bg-slate-500/10 text-slate-500 border-slate-500/20",
};

export function GoogleApiMappingView() {
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");

  const { data, isLoading } = useQuery<ApiData>({
    queryKey: ["google-api-mapping"],
    queryFn: () => api<ApiData>("/api/google-api-mapping"),
  });

  const filteredMappings = useMemo(() => {
    if (!data) return [];
    return data.mappings.filter((m) => {
      const matchSearch =
        !search ||
        m.googleObject.toLowerCase().includes(search.toLowerCase()) ||
        m.dbTable.toLowerCase().includes(search.toLowerCase()) ||
        m.dbModel.toLowerCase().includes(search.toLowerCase());
      const matchFilter = entityFilter === "all" || m.syncDirection === entityFilter;
      return matchSearch && matchFilter;
    });
  }, [data, search, entityFilter]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Google API Mapping"
        description="Complete mapping between Google Business Profile APIs & MyFNG database"
        icon={ArrowLeftRight}
      />

      {/* Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <OverviewCard icon={Layers} label="Google APIs" value={data?.googleApis.length ?? 0} accent="emerald" />
        <OverviewCard icon={ArrowLeftRight} label="Entity Mappings" value={data?.mappings.length ?? 0} accent="teal" />
        <OverviewCard icon={RefreshCw} label="Sync Jobs" value={data?.backgroundJobs.length ?? 0} accent="amber" />
        <OverviewCard icon={Server} label="Service Layer" value={data?.serviceLayer.length ?? 0} accent="rose" />
      </div>

      <Tabs defaultValue="mappings">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="mappings" className="text-xs">Entity Mappings</TabsTrigger>
          <TabsTrigger value="auth" className="text-xs">Auth Flow</TabsTrigger>
          <TabsTrigger value="sync" className="text-xs">Sync & Frequency</TabsTrigger>
          <TabsTrigger value="errors" className="text-xs">Error & Retry</TabsTrigger>
          <TabsTrigger value="services" className="text-xs">Service Layer</TabsTrigger>
          <TabsTrigger value="security" className="text-xs">Security</TabsTrigger>
        </TabsList>

        {/* ── Entity Mappings Tab ── */}
        <TabsContent value="mappings" className="space-y-4 mt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder="Search mappings by Google object, DB table, or model..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Tabs value={entityFilter} onValueChange={setEntityFilter}>
              <TabsList className="h-9">
                <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                <TabsTrigger value="google-to-db" className="text-xs">Google → DB</TabsTrigger>
                <TabsTrigger value="db-to-google" className="text-xs">DB → Google</TabsTrigger>
                <TabsTrigger value="bidirectional" className="text-xs">Bidirectional</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)
          ) : (
            <div className="space-y-4">
              {filteredMappings.map((m) => {
                const dir = DIRECTION_BADGE[m.syncDirection] ?? DIRECTION_BADGE["google-to-db"];
                const DirIcon = dir.icon;
                return (
                  <Card key={m.id} className="overflow-hidden">
                    <div className="flex items-center justify-between gap-3 px-5 py-3 border-b bg-muted/30">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <Database className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm">{m.googleObject}</div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {m.dbTable} → {m.dbModel}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {m.syncFrequency && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Clock className="size-3" /> {m.syncFrequency}
                          </Badge>
                        )}
                        <Badge variant="outline" className={cn("text-xs gap-1", dir.cls)}>
                          <DirIcon className="size-3" /> {dir.label}
                        </Badge>
                        <Badge variant="outline" className={cn("text-xs", STATUS_BADGE[m.status] ?? STATUS_BADGE.active)}>
                          {m.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="overflow-x-auto scroll-area">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/20">
                            <th className="text-left px-5 py-2 font-medium text-muted-foreground">Google Field</th>
                            <th className="text-left px-5 py-2 font-medium text-muted-foreground">DB Column</th>
                            <th className="text-left px-5 py-2 font-medium text-muted-foreground">Type</th>
                            <th className="text-left px-5 py-2 font-medium text-muted-foreground">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.fields.map((f, i) => (
                            <tr key={i} className="border-b last:border-0 hover:bg-muted/20 transition">
                              <td className="px-5 py-2 font-medium">{f.google}</td>
                              <td className="px-5 py-2 font-mono text-emerald-600 dark:text-emerald-400">{f.db}</td>
                              <td className="px-5 py-2 font-mono text-amber-600 dark:text-amber-400">{f.type}</td>
                              <td className="px-5 py-2 text-muted-foreground">{f.notes || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                );
              })}
              {filteredMappings.length === 0 && (
                <Card>
                  <CardContent className="p-10 text-center text-sm text-muted-foreground">No mappings match your filters.</CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Aggregation flow */}
          {data && (
            <CardSection title="Performance Aggregation Flow" description="How Google metrics flow through the system">
              <div className="flex flex-col sm:flex-row items-stretch gap-3">
                {data.aggregationFlow.map((stage, i) => (
                  <div key={i} className="flex-1 flex flex-col sm:flex-row items-center gap-3">
                    <div className="flex-1 rounded-lg border p-4 w-full">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20">{stage.stage}</Badge>
                      </div>
                      <div className="text-xs font-mono text-muted-foreground mb-1">{stage.source}</div>
                      <div className="text-sm font-semibold flex items-center gap-1">
                        <ArrowDown className="size-3" /> {stage.target}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{stage.detail}</div>
                    </div>
                    {i < data.aggregationFlow.length - 1 && (
                      <ArrowRightLeft className="size-5 text-muted-foreground hidden sm:block shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </CardSection>
          )}
        </TabsContent>

        {/* ── Auth Flow Tab ── */}
        <TabsContent value="auth" className="space-y-4 mt-4">
          {data && (
            <>
              <CardSection title="Google APIs Used" description="Official Google APIs integrated with the platform">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {data.googleApis.map((a) => (
                    <div key={a.name} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <div className="text-sm font-semibold">{a.name}</div>
                        <div className="text-xs text-muted-foreground">{a.purpose}</div>
                      </div>
                      <Badge variant="outline" className={cn("text-xs", STATUS_BADGE[a.status] ?? STATUS_BADGE.configured)}>{a.status}</Badge>
                    </div>
                  ))}
                </div>
              </CardSection>

              <CardSection title="Authentication Flow" description="OAuth 2.0 flow from user login to API calls" icon={KeyRound}>
                <div className="space-y-2">
                  {data.authFlow.map((s) => (
                    <div key={s.step} className="flex items-start gap-3">
                      <div className="size-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">{s.step}</div>
                      <div className="flex-1 pt-0.5">
                        <div className="text-sm font-medium">{s.action}</div>
                        <div className="text-xs text-muted-foreground">{s.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardSection>

              <CardSection title="Sync Direction" description="Data flow between Google, database, and dashboard">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-emerald-500/20 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <ArrowDown className="size-4 text-emerald-500" />
                      <span className="text-sm font-semibold">Google → Database</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {data.syncDirection.googleToDb.map((item) => (
                        <Badge key={item} variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20">{item}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-amber-500/20 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <ArrowUp className="size-4 text-amber-500" />
                      <span className="text-sm font-semibold">Database → Google</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {data.syncDirection.dbToGoogle.map((item) => (
                        <Badge key={item} variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/20">{item}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardSection>
            </>
          )}
        </TabsContent>

        {/* ── Sync & Frequency Tab ── */}
        <TabsContent value="sync" className="space-y-4 mt-4">
          {data && (
            <>
              <CardSection title="Sync Frequencies" description="How often each entity syncs with Google" icon={RefreshCw}>
                <div className="overflow-x-auto scroll-area">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Entity</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Frequency</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Queue</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Priority</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.syncFrequencies.map((f) => (
                        <tr key={f.entity} className="border-b last:border-0 hover:bg-muted/20 transition">
                          <td className="py-2.5 px-3 font-medium">{f.entity}</td>
                          <td className="py-2.5 px-3 font-mono text-xs">{f.frequency}</td>
                          <td className="py-2.5 px-3"><Badge variant="outline" className="text-xs font-mono">{f.queue}</Badge></td>
                          <td className="py-2.5 px-3"><Badge variant="outline" className={cn("text-xs", PRIORITY_BADGE[f.priority] ?? PRIORITY_BADGE.low)}>{f.priority}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardSection>

              <CardSection title="Background Sync Jobs" description="7 background workers handling Google sync" icon={Activity}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {data.backgroundJobs.map((j) => (
                    <div key={j.job} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold">{j.job}</span>
                        <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20">{j.status}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="font-mono">{j.queue}</span>
                        <span>·</span>
                        <span>{j.frequency}</span>
                        <span>·</span>
                        <span>module: {j.module}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardSection>

              <CardSection title="Dashboard Dependencies" description="Which DB tables each dashboard depends on" icon={Layers}>
                <div className="space-y-2">
                  {data.dashboardDependencies.map((d) => (
                    <div key={d.dashboard} className="rounded-lg border p-3">
                      <div className="text-sm font-semibold mb-2">{d.dashboard}</div>
                      <div className="flex flex-wrap gap-2">
                        {d.tables.map((t) => (
                          <Badge key={t} variant="outline" className="text-xs font-mono bg-muted/30">{t}</Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardSection>
            </>
          )}
        </TabsContent>

        {/* ── Error & Retry Tab ── */}
        <TabsContent value="errors" className="space-y-4 mt-4">
          {data && (
            <>
              <CardSection title="Error Mapping" description="How Google API errors are handled" icon={AlertTriangle}>
                <div className="overflow-x-auto scroll-area">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">HTTP Code</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Meaning</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Action</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Retryable</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Log Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.errorMapping.map((e) => (
                        <tr key={e.httpCode} className="border-b last:border-0 hover:bg-muted/20 transition">
                          <td className="py-2.5 px-3"><Badge variant="outline" className={cn("text-xs font-mono font-bold", e.retryable ? "bg-amber-500/10 text-amber-600 border-amber-500/20" : "bg-rose-500/10 text-rose-600 border-rose-500/20")}>{e.httpCode}</Badge></td>
                          <td className="py-2.5 px-3 text-xs">{e.meaning}</td>
                          <td className="py-2.5 px-3 text-xs text-muted-foreground">{e.action}</td>
                          <td className="py-2.5 px-3">{e.retryable ? <CheckCircle2 className="size-4 text-emerald-500" /> : <span className="text-rose-500 text-xs">No</span>}</td>
                          <td className="py-2.5 px-3"><Badge variant="outline" className={cn("text-xs", e.logLevel === "error" ? "bg-rose-500/10 text-rose-600" : e.logLevel === "warning" ? "bg-amber-500/10 text-amber-600" : "bg-slate-500/10 text-slate-600")}>{e.logLevel}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardSection>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CardSection title="Retry Policy" description="Conditions that trigger automatic retry" icon={RefreshCw}>
                  <div className="space-y-3">
                    {data.retryPolicy.retry.map((r, i) => (
                      <div key={i} className="rounded-lg border border-emerald-500/20 p-3">
                        <div className="text-sm font-semibold mb-1">{r.condition}</div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="font-mono text-amber-600 dark:text-amber-400">Backoff: {r.backoff}</span>
                          <span className="text-muted-foreground">Max retries: {r.maxRetries}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardSection>

                <CardSection title="Do Not Retry" description="Conditions where retrying won't help" icon={AlertTriangle}>
                  <div className="space-y-3">
                    {data.retryPolicy.doNotRetry.map((r, i) => (
                      <div key={i} className="rounded-lg border border-rose-500/20 p-3">
                        <div className="text-sm font-semibold mb-1 text-rose-600 dark:text-rose-400">{r.condition}</div>
                        <div className="text-xs text-muted-foreground">{r.reason}</div>
                      </div>
                    ))}
                  </div>
                </CardSection>
              </div>

              <CardSection title="Rate Limiting" description="Strategy to stay within Google API quotas" icon={Zap}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Strategy</div>
                    {data.rateLimiting.strategy.map((s) => (
                      <div key={s} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="size-4 text-emerald-500 shrink-0" /> {s}
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Google Limits</div>
                    <div className="rounded-lg border p-3 space-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">Read API:</span><span className="font-mono">{data.rateLimiting.googleLimits.readApi}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Write API:</span><span className="font-mono">{data.rateLimiting.googleLimits.writeApi}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Daily Quota:</span><span className="font-mono">{data.rateLimiting.googleLimits.quotaPerDay}</span></div>
                    </div>
                  </div>
                </div>
                <div className="mt-3 rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 text-xs text-amber-700 dark:text-amber-400">
                  {data.rateLimiting.implementation}
                </div>
              </CardSection>
            </>
          )}
        </TabsContent>

        {/* ── Service Layer Tab ── */}
        <TabsContent value="services" className="space-y-4 mt-4">
          {data && (
            <CardSection title="Google API Service Layer" description="10 service classes handling all Google API interactions" icon={Server}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {data.serviceLayer.map((s) => (
                  <div key={s.service} className="rounded-lg border p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Server className="size-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold font-mono">{s.service}</div>
                        <div className="text-xs text-muted-foreground">{s.responsibility}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {s.methods.map((m) => (
                        <Badge key={m} variant="outline" className="text-xs font-mono bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/15">{m}()</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardSection>
          )}
        </TabsContent>

        {/* ── Security Tab ── */}
        <TabsContent value="security" className="space-y-4 mt-4">
          {data && (
            <>
              <CardSection title="Security Controls" description="Security rules for Google API integration" icon={Shield}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {data.security.map((s) => (
                    <div key={s.rule} className="flex items-center gap-3 rounded-lg border p-3">
                      {s.implemented ? <CheckCircle2 className="size-5 text-emerald-500 shrink-0" /> : <AlertTriangle className="size-5 text-amber-500 shrink-0" />}
                      <span className="text-sm">{s.rule}</span>
                      <Badge variant="outline" className={cn("text-xs ml-auto shrink-0", s.implemented ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600")}>
                        {s.implemented ? "Implemented" : "Pending"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardSection>

              <CardSection title="Production Checklist" description="Verification items before go-live" icon={CheckCircle2}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {data.productionChecklist.map((c) => (
                    <div key={c.item} className="flex items-center gap-3 rounded-lg border p-3">
                      {c.done ? <CheckCircle2 className="size-5 text-emerald-500 shrink-0" /> : <Clock className="size-5 text-slate-400 shrink-0" />}
                      <span className={cn("text-sm", c.done ? "" : "text-muted-foreground")}>{c.item}</span>
                    </div>
                  ))}
                </div>
              </CardSection>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OverviewCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: number; accent: string }) {
  const accentMap: Record<string, string> = {
    emerald: "bg-emerald-500/10 text-emerald-600",
    teal: "bg-teal-500/10 text-teal-600",
    amber: "bg-amber-500/10 text-amber-600",
    rose: "bg-rose-500/10 text-rose-600",
  };
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-3">
        <div className={cn("size-10 rounded-lg flex items-center justify-center", accentMap[accent])}>
          <Icon className="size-5" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
