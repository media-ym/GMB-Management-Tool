"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useUser } from "@/lib/user-context";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Clock,
  Loader2,
  Play,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface CronJobStatus {
  id: string;
  name: string;
  description: string;
  schedule: string;
  scheduleLabel: string;
  endpoint: string;
  category: string;
  pgCronInstalled: boolean;
  registered: boolean;
  enabled: boolean;
  pgJobId: number | null;
  liveSchedule: string | null;
  liveScheduleLabel: string | null;
  lastRun: string | null;
}

interface CronJobsResponse {
  jobs: CronJobStatus[];
  pgCronAvailable: boolean;
  pgCronPermissionDenied?: boolean;
  cronSecretConfigured: boolean;
  appBaseUrl: string;
  recentHttp: { id: number; status_code: number | null; error_msg: string | null; created: string }[] | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  sync: "Sync",
  content: "Content",
  reviews: "Reviews",
  maintenance: "Maintenance",
};

function fmtRelative(iso: string | null) {
  if (!iso) return "Never";
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return "—";
  }
}

export function CronJobsTab() {
  const user = useUser();
  const qc = useQueryClient();
  const canManage = can(user.role, "system.sync") || can(user.role, "settings.manage");

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery<CronJobsResponse>({
    queryKey: ["cron-jobs"],
    queryFn: () => api<CronJobsResponse>("/api/cron/jobs"),
    refetchInterval: 60_000,
  });

  const toggleMut = useMutation({
    mutationFn: ({ jobId, enabled }: { jobId: string; enabled: boolean }) =>
      api<CronJobsResponse>("/api/cron/jobs", {
        method: "PATCH",
        body: JSON.stringify({ jobId, enabled }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["cron-jobs"] });
      toast.success(vars.enabled ? "Cron job enabled" : "Cron job disabled");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const runMut = useMutation({
    mutationFn: (jobId: string) =>
      api<CronJobsResponse & { runResult?: { message?: string } }>("/api/cron/jobs", {
        method: "POST",
        body: JSON.stringify({ jobId }),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["cron-jobs"] });
      toast.success(res.runResult?.message ?? "Cron triggered");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Run failed"),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="p-6 text-center space-y-3">
          <XCircle className="size-8 text-destructive mx-auto" />
          <p className="text-sm font-medium">Could not load cron jobs</p>
          <p className="text-xs text-muted-foreground">{error instanceof Error ? error.message : "Unknown error"}</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            <RefreshCw className="size-3.5 mr-1.5" /> Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const jobs = data?.jobs ?? [];
  const activeCount = jobs.filter((j) => j.enabled && j.registered).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="size-5 text-emerald-600" />
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums">{activeCount}</div>
              <div className="text-xs text-muted-foreground">Active cron jobs</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-lg bg-teal-500/10 flex items-center justify-center">
              <Timer className="size-5 text-teal-600" />
            </div>
            <div>
              <div className="text-sm font-semibold">
                {data?.pgCronAvailable ? "Supabase pg_cron" : "pg_cron not detected"}
              </div>
              <div className="text-xs text-muted-foreground">
                {data?.cronSecretConfigured ? "CRON_SECRET configured" : "CRON_SECRET missing"}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground min-w-0">
              App URL: <span className="font-mono text-foreground">{data?.appBaseUrl ?? "—"}</span>
            </div>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
            </Button>
          </CardContent>
        </Card>
      </div>

      {!data?.pgCronAvailable && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex gap-3 text-sm">
            <AlertTriangle className="size-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-300">
                {data?.pgCronPermissionDenied
                  ? "pg_cron installed — app user needs DB permission"
                  : "pg_cron not linked yet"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {data?.pgCronPermissionDenied ? (
                  <>
                    Run the <strong>GRANT</strong> block at the bottom of{" "}
                    <code className="bg-muted px-1 rounded">supabase/cron-jobs.sql</code> in Supabase SQL Editor
                    (gives <code className="bg-muted px-1 rounded">myfng_app</code> read access to{" "}
                    <code className="bg-muted px-1 rounded">cron.job</code>).
                  </>
                ) : (
                  <>
                    Run <code className="bg-muted px-1 rounded">supabase/cron-jobs.sql</code> in Supabase SQL Editor
                    to schedule jobs. Until then, use <strong>Run now</strong> to trigger manually.
                  </>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="size-4" /> Scheduled jobs
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="table-fixed min-w-[980px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[17%] min-w-[150px] align-top">Job</TableHead>
                <TableHead className="w-[30%] min-w-[220px] align-top">What it does</TableHead>
                <TableHead className="w-[18%] min-w-[160px] align-top">Schedule</TableHead>
                <TableHead className="w-[11%] min-w-[90px]">Last run</TableHead>
                <TableHead className="w-[10%] min-w-[80px]">Status</TableHead>
                {canManage && (
                  <TableHead className="w-[14%] min-w-[150px] text-right">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="align-top whitespace-normal">
                    <div className="font-medium text-sm leading-snug">{job.name}</div>
                    <div className="text-[10px] font-mono text-muted-foreground mt-0.5 break-all">{job.id}</div>
                    <Badge variant="outline" className="text-[10px] mt-1.5">
                      {CATEGORY_LABEL[job.category] ?? job.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground align-top whitespace-normal break-words leading-relaxed pr-3">
                    {job.description}
                  </TableCell>
                  <TableCell className="text-xs align-top whitespace-normal leading-relaxed">
                    <div className="font-medium">{job.liveScheduleLabel ?? job.scheduleLabel}</div>
                    <div className="font-mono text-[10px] text-muted-foreground mt-0.5 break-all">
                      {job.liveSchedule ?? job.schedule}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">UTC timezone</div>
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap align-top">{fmtRelative(job.lastRun)}</TableCell>
                  <TableCell className="align-top">
                    {!job.registered ? (
                      <Badge variant="secondary" className="text-[10px]">
                        <XCircle className="size-3 mr-1" /> Not in pg_cron
                      </Badge>
                    ) : job.enabled ? (
                      <Badge className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                        <CheckCircle2 className="size-3 mr-1" /> ON
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        OFF
                      </Badge>
                    )}
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right align-top whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <Switch
                          checked={job.enabled}
                          disabled={!job.registered || toggleMut.isPending}
                          onCheckedChange={(enabled) =>
                            toggleMut.mutate({ jobId: job.id, enabled })
                          }
                          aria-label={`Toggle ${job.name}`}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={runMut.isPending}
                          onClick={() => runMut.mutate(job.id)}
                        >
                          {runMut.isPending && runMut.variables === job.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Play className="size-3.5" />
                          )}
                          <span className="ml-1 hidden sm:inline">Run now</span>
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {data?.recentHttp && data.recentHttp.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-sm">Recent pg_net HTTP responses</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            {data.recentHttp.map((r) => (
              <div key={r.id} className="flex items-center gap-3 font-mono">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] tabular-nums",
                    r.status_code === 200
                      ? "text-emerald-600"
                      : r.status_code
                        ? "text-rose-600"
                        : "text-muted-foreground",
                  )}
                >
                  {r.status_code ?? "—"}
                </Badge>
                <span className="text-muted-foreground truncate flex-1 min-w-0">
                  {r.error_msg ?? (r.status_code === 200 ? "OK" : `HTTP ${r.status_code ?? "error"}`)}
                </span>
                <span className="text-muted-foreground shrink-0">{fmtRelative(r.created)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default CronJobsTab;
