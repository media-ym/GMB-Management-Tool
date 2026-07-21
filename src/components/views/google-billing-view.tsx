"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Activity, AlertTriangle, CheckCircle2, Cloud, ExternalLink,
  IndianRupee, Layers, Lock, RefreshCw, Server, Shield, Zap,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer,
  Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import { api } from "@/lib/api-client";
import { useUser } from "@/lib/user-context";
import { can } from "@/lib/permissions";
import { PageHeader, CardSection } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { BillingTier } from "@/lib/google-api-catalog";
import { appendDurationToParams } from "@/lib/location-filter";
import {
  DurationFilter,
  getDurationLabel,
  type DurationValue,
  type DurationCustomRange,
} from "@/components/shared/duration-filter";

interface BillingResponse {
  period: { key: string; days: number; since: string; until: string | null };
  summary: {
    googleApisUsed: number;
    freeApis: number;
    paidApis: number;
    googleEstimatedCost: number;
    aiCost: number;
    totalEstimatedCost: number;
    estimatedGoogleApiCalls: number;
    syncJobs: number;
    syncSuccess: number;
    syncFailed: number;
    recordsProcessed: number;
    aiRequests: number;
    aiTokens: number;
    rateLimitStatus: "normal" | "approaching" | "exceeded";
    rateLimitEvents: number;
  };
  oauth: {
    configured: boolean;
    connected: boolean;
    mode: string;
    redirectUri: string;
    accounts: { email: string; tokenExpiry: string | null; connectedAt: string }[];
    activeProfiles: number;
  };
  apis: {
    id: string;
    name: string;
    serviceId: string;
    endpoint: string;
    purpose: string;
    billing: BillingTier;
    billingLabel: string;
    billingNote: string;
    quotaNote: string;
    usedFor: string[];
    consoleUrl: string;
  }[];
  usage: {
    daily: { date: string; syncJobs: number; syncFailed: number; aiCost: number; aiRequests: number }[];
    syncByModule: { module: string; total: number; failed: number; records: number }[];
    topGoogleActions: { action: string; count: number }[];
    aiDaily: { date: string; requests: number; tokens: number; cost: number }[];
  };
  billing: {
    googleCloud: {
      configured: boolean;
      projectId: string | null;
      billingAccountId: string | null;
      note: string;
      consoleUrl: string;
    };
    costBreakdown: { service: string; amount: number; currency: string; note: string }[];
    recentRateLimitEvents: { id: string; at: string; message: string }[];
  };
  quota: {
    status: string;
    qpsLimit: number;
    note: string;
    eventsLastPeriod: number;
  };
}

const BILLING_BADGE: Record<BillingTier, string> = {
  free: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  paid: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  conditional: "bg-slate-500/10 text-slate-600 border-slate-500/20",
};

const QUOTA_BADGE: Record<string, string> = {
  normal: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  approaching: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  exceeded: "bg-rose-500/10 text-rose-600 border-rose-500/20",
};

function fmtNumber(n: number): string {
  return new Intl.NumberFormat("en-IN").format(n);
}

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount);
}

export function GoogleBillingView() {
  const user = useUser();
  const qc = useQueryClient();
  const [duration, setDuration] = useState<DurationValue>("30");
  const [customRange, setCustomRange] = useState<DurationCustomRange | null>(null);

  const billingUrl = useMemo(() => {
    const params = new URLSearchParams();
    appendDurationToParams(params, duration === "all" ? "90" : duration, customRange);
    return `/api/admin/google-billing?${params.toString()}`;
  }, [duration, customRange]);

  const periodLabel = getDurationLabel(duration === "all" ? "90" : duration, customRange);

  const { data, isLoading, isFetching, refetch } = useQuery<BillingResponse>({
    queryKey: ["google-billing", duration, customRange],
    queryFn: () => api<BillingResponse>(billingUrl),
    refetchOnWindowFocus: false,
  });

  const chartData = useMemo(() => {
    return (data?.usage.daily ?? []).map((d) => ({
      date: format(new Date(d.date), "dd MMM"),
      syncJobs: d.syncJobs,
      aiCost: Math.round(d.aiCost * 100) / 100,
      aiRequests: d.aiRequests,
    }));
  }, [data?.usage.daily]);

  function handleRefresh() {
    qc.invalidateQueries({ queryKey: ["google-billing"] });
    refetch();
    toast.success("Billing dashboard refreshed");
  }

  if (!can(user.role, "system.view")) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader title="API & Billing" description="Google Cloud usage and cost overview" icon={Cloud} />
        <Card>
          <CardContent className="p-10 text-center">
            <Lock className="size-12 mx-auto text-amber-500 mb-3" />
            <h3 className="text-base font-semibold">Access restricted</h3>
            <p className="text-sm text-muted-foreground mt-1.5">Only admins can view API billing.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const summary = data?.summary;
  const quotaPct = summary
    ? Math.min(100, summary.rateLimitEvents > 0 ? 40 + summary.rateLimitEvents * 10 : 15)
    : 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <PageHeader
        title="API & Billing"
        description="Google Cloud / API usage, quotas, and cost breakdown for this platform"
        icon={Cloud}
        actions={
          <div className="flex items-center gap-2">
            <DurationFilter
              value={duration === "all" ? "90" : duration}
              onChange={setDuration}
              customRange={customRange}
              onCustomRangeChange={setCustomRange}
              hideAllTime
              className="w-[150px] sm:w-[170px]"
            />
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
              <RefreshCw className={cn("size-3.5 mr-1.5", isFetching && "animate-spin")} />
              Refresh
            </Button>
          </div>
        }
      />

      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <StatCard
              label="Google API Cost"
              value={formatINR(summary?.googleEstimatedCost ?? 0)}
              icon={CheckCircle2}
              accent="emerald"
              hint="GBP APIs are free"
            />
            <StatCard
              label="MiSA AI Cost"
              value={formatINR(summary?.aiCost ?? 0)}
              icon={IndianRupee}
              accent="amber"
              hint={`${fmtNumber(summary?.aiRequests ?? 0)} requests`}
            />
            <StatCard
              label="Est. Google Calls"
              value={fmtNumber(summary?.estimatedGoogleApiCalls ?? 0)}
              icon={Server}
              accent="teal"
              hint={`${fmtNumber(summary?.syncJobs ?? 0)} sync jobs`}
            />
            <StatCard
              label="Total Est. Cost"
              value={formatINR(summary?.totalEstimatedCost ?? 0)}
              icon={Layers}
              accent="rose"
              hint={periodLabel}
            />
          </>
        )}
      </div>

      {/* OAuth + Quota status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CardSection title="Google Connection" description="OAuth status for API access" icon={Shield}>
          {isLoading ? (
            <Skeleton className="h-28 rounded-lg" />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={data?.oauth.connected ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-rose-500/10 text-rose-600 border-rose-500/20"}>
                  {data?.oauth.connected ? "Connected" : "Not connected"}
                </Badge>
                <Badge variant="outline">{data?.oauth.activeProfiles ?? 0} active profiles</Badge>
                <Badge variant="outline">{data?.summary.freeApis ?? 0} free APIs</Badge>
              </div>
              {data?.oauth.accounts[0] && (
                <p className="text-sm text-muted-foreground">
                  Account: <span className="font-medium text-foreground">{data.oauth.accounts[0].email}</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground font-mono truncate">{data?.oauth.redirectUri}</p>
            </div>
          )}
        </CardSection>

        <CardSection title="API Quota Health" description="Rate limit status (10 QPS cap in app)" icon={Zap}>
          {isLoading ? (
            <Skeleton className="h-28 rounded-lg" />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className={QUOTA_BADGE[data?.quota.status ?? "normal"]}>
                  {data?.quota.status === "exceeded" ? "Quota pressure" : data?.quota.status === "approaching" ? "Watch quota" : "Healthy"}
                </Badge>
                <span className="text-xs text-muted-foreground">{data?.quota.eventsLastPeriod ?? 0} rate-limit events</span>
              </div>
              <Progress value={quotaPct} className="h-2" />
              <p className="text-xs text-muted-foreground">{data?.quota.note}</p>
            </div>
          )}
        </CardSection>
      </div>

      <Tabs defaultValue="apis" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="apis"><Server className="size-3.5" /> APIs Used</TabsTrigger>
          <TabsTrigger value="usage"><Activity className="size-3.5" /> Usage</TabsTrigger>
          <TabsTrigger value="billing"><IndianRupee className="size-3.5" /> Billing</TabsTrigger>
        </TabsList>

        {/* APIs tab */}
        <TabsContent value="apis" className="space-y-4">
          <CardSection
            title="APIs in this platform"
            description="All Google & third-party APIs — billing status and purpose"
          >
            {isLoading ? (
              <Skeleton className="h-64 rounded-lg" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>API</TableHead>
                      <TableHead>Billing</TableHead>
                      <TableHead className="hidden md:table-cell">Purpose</TableHead>
                      <TableHead className="hidden lg:table-cell">Quota</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.apis ?? []).map((apiRow) => (
                      <TableRow key={apiRow.id}>
                        <TableCell>
                          <div className="font-medium text-sm">{apiRow.name}</div>
                          <div className="text-xs text-muted-foreground font-mono truncate max-w-[220px]">{apiRow.serviceId}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={BILLING_BADGE[apiRow.billing]}>
                            {apiRow.billing === "free" ? "Free" : apiRow.billing === "paid" ? "Paid" : "Conditional"}
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-1 max-w-[180px]">{apiRow.billingNote}</p>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-[200px]">
                          {apiRow.purpose}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-[180px]">
                          {apiRow.quotaNote}
                        </TableCell>
                        <TableCell>
                          <a
                            href={apiRow.consoleUrl.startsWith("http") ? apiRow.consoleUrl : apiRow.consoleUrl}
                            target={apiRow.consoleUrl.startsWith("http") ? "_blank" : undefined}
                            rel="noopener noreferrer"
                            className="inline-flex text-muted-foreground hover:text-primary"
                          >
                            <ExternalLink className="size-3.5" />
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardSection>
        </TabsContent>

        {/* Usage tab */}
        <TabsContent value="usage" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <CardSection title="Daily Activity" description="Sync jobs & AI usage" className="lg:col-span-2">
              {chartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">No usage data yet.</div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                      <RTooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar yAxisId="left" dataKey="syncJobs" name="Sync jobs" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={24} />
                      <Bar yAxisId="right" dataKey="aiRequests" name="AI requests" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardSection>

            <CardSection title="Sync by Module" description="Google sync breakdown">
              {(data?.usage.syncByModule ?? []).map((m) => (
                <div key={m.module} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <span className="text-sm capitalize">{m.module}</span>
                  <div className="text-right">
                    <span className="text-sm font-mono tabular-nums">{m.total}</span>
                    {m.failed > 0 && (
                      <span className="text-xs text-rose-500 ml-2">({m.failed} failed)</span>
                    )}
                  </div>
                </div>
              ))}
            </CardSection>
          </div>

          {(data?.billing.recentRateLimitEvents.length ?? 0) > 0 && (
            <CardSection title="Recent Rate Limit Events" description="429 / quota errors" icon={AlertTriangle}>
              <div className="space-y-2">
                {data!.billing.recentRateLimitEvents.map((e) => (
                  <div key={e.id} className="text-sm flex gap-3 py-2 border-b border-border/50 last:border-0">
                    <span className="text-xs text-muted-foreground shrink-0">{format(new Date(e.at), "dd MMM HH:mm")}</span>
                    <span className="text-muted-foreground">{e.message}</span>
                  </div>
                ))}
              </div>
            </CardSection>
          )}
        </TabsContent>

        {/* Billing tab */}
        <TabsContent value="billing" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CardSection title="Cost Breakdown" description={`Estimated charges - ${periodLabel}`} icon={IndianRupee}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="hidden sm:table-cell">Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.billing.costBreakdown ?? []).map((row) => (
                    <TableRow key={row.service}>
                      <TableCell className="font-medium text-sm">{row.service}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {row.amount === 0 ? "₹0" : formatINR(row.amount)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{row.note}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/30">
                    <TableCell className="font-semibold">Total</TableCell>
                    <TableCell className="text-right font-mono font-semibold tabular-nums">
                      {formatINR(summary?.totalEstimatedCost ?? 0)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">Google GBP = ₹0</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardSection>

            <CardSection title="Google Cloud Billing" description="Link to GCP console for real invoices" icon={Cloud}>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={data?.billing.googleCloud.configured ? "bg-emerald-500/10 text-emerald-600" : "bg-slate-500/10 text-slate-600"}>
                    {data?.billing.googleCloud.configured ? "Project linked" : "Not configured"}
                  </Badge>
                  {data?.billing.googleCloud.projectId && (
                    <Badge variant="outline" className="font-mono text-xs">{data.billing.googleCloud.projectId}</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{data?.billing.googleCloud.note}</p>
                <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1 font-mono text-muted-foreground">
                  <div>GOOGLE_CLOUD_PROJECT_ID=your-project-id</div>
                  <div>GCP_BILLING_ACCOUNT_ID=XXXXXX-XXXXXX-XXXXXX</div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a href={data?.billing.googleCloud.consoleUrl ?? "https://console.cloud.google.com/billing"} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3.5 mr-1.5" />
                    Open Google Cloud Billing
                  </a>
                </Button>
              </div>
            </CardSection>
          </div>

          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="p-4 text-sm">
              <p className="font-medium text-amber-700 dark:text-amber-400">Important: Google Business Profile APIs are free</p>
              <p className="text-muted-foreground mt-1">
                Google does not charge per API call for Business Profile (reviews, posts, locations, analytics).
                Your only platform cost here is <strong>MiSA AI tokens</strong>. If your GCP project also uses paid APIs
                (Maps, Places, etc.), those appear in Google Cloud Console — not in this app unless billing export is configured.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default GoogleBillingView;
