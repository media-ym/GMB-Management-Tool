"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
import { Code2, Search, Copy, Check, Lock, Gauge, FileJson, Server } from "lucide-react";
import { toast } from "sonner";

interface ApiEndpoint {
  group: string;
  method: string;
  path: string;
  desc: string;
}

interface ApiDocsData {
  version: string;
  baseUrl: string;
  authentication: string;
  responseFormat: Record<string, unknown>;
  httpStatusCodes: Record<string, string>;
  rateLimiting: Record<string, string>;
  pagination: Record<string, unknown>;
  endpoints: ApiEndpoint[];
}

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  POST: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  PUT: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
  PATCH: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  DELETE: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
};

export function ApiDocsView() {
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [copied, setCopied] = useState<string | null>(null);

  const { data, isLoading } = useQuery<ApiDocsData>({
    queryKey: ["api-docs"],
    queryFn: () => api<ApiDocsData>("/api/api-docs"),
  });

  const groups = useMemo(() => {
    if (!data) return [];
    return ["all", ...Array.from(new Set(data.endpoints.map((e) => e.group)))];
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.endpoints.filter((e) => {
      const matchSearch =
        !search ||
        e.path.toLowerCase().includes(search.toLowerCase()) ||
        e.desc.toLowerCase().includes(search.toLowerCase()) ||
        e.group.toLowerCase().includes(search.toLowerCase());
      const matchGroup = groupFilter === "all" || e.group === groupFilter;
      return matchSearch && matchGroup;
    });
  }, [data, search, groupFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, ApiEndpoint[]>();
    for (const e of filtered) {
      if (!map.has(e.group)) map.set(e.group, []);
      map.get(e.group)!.push(e);
    }
    return Array.from(map.entries());
  }, [filtered]);

  function copyPath(path: string) {
    navigator.clipboard.writeText(path);
    setCopied(path);
    toast.success(`Copied: ${path}`);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader
        title="API Documentation"
        description={`REST API v1 · ${data?.endpoints.length ?? 0} endpoints · JWT authenticated`}
        icon={Code2}
      />

      {/* Overview cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <Lock className="size-5" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Authentication</div>
                <div className="text-sm font-semibold">JWT (NextAuth)</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                <Gauge className="size-5" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Rate Limit</div>
                <div className="text-sm font-semibold">120 req/min general</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-teal-500/10 text-teal-600 flex items-center justify-center">
                <FileJson className="size-5" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Response Format</div>
                <div className="text-sm font-semibold">JSON envelope</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-rose-500/10 text-rose-600 flex items-center justify-center">
                <Server className="size-5" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Base URL</div>
                <div className="text-sm font-mono">/api</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Response format card */}
      <Card>
        <CardContent className="p-5">
          <h3 className="text-sm font-semibold mb-3">Standard Response Format</h3>
          <pre className="text-xs font-mono bg-muted/50 rounded-lg p-4 overflow-x-auto scroll-area">
{`{
  "success": true,
  "message": "Request completed successfully.",
  "data": { ... },
  "errors": null,
  "timestamp": "2025-01-15T10:30:00.000Z"
}`}
          </pre>
          <div className="mt-3 flex flex-wrap gap-2">
            {data &&
              Object.entries(data.httpStatusCodes).map(([code, desc]) => (
                <Badge key={code} variant="outline" className="text-xs font-mono">
                  {code} · {desc}
                </Badge>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search endpoints by path, description, or group..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Group tabs */}
      <Tabs value={groupFilter} onValueChange={setGroupFilter}>
        <TabsList className="flex-wrap h-auto">
          {groups.map((g) => (
            <TabsTrigger key={g} value={g} className="text-xs">
              {g === "all" ? "All Groups" : g}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Endpoints list */}
      <div className="space-y-6">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : grouped.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              No endpoints match your search.
            </CardContent>
          </Card>
        ) : (
          grouped.map(([group, endpoints]) => (
            <div key={group}>
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
                {group}
                <Badge variant="secondary" className="text-xs">
                  {endpoints.length}
                </Badge>
              </h2>
              <div className="space-y-2">
                {endpoints.map((e, i) => (
                  <div
                    key={`${e.path}-${i}`}
                    className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:bg-accent/30 transition group"
                  >
                    <Badge
                      variant="outline"
                      className={cn("font-mono text-xs font-bold shrink-0 w-16 justify-center", METHOD_COLORS[e.method])}
                    >
                      {e.method}
                    </Badge>
                    <code className="text-sm font-mono flex-1 min-w-0 truncate">{e.path}</code>
                    <span className="text-xs text-muted-foreground hidden md:block truncate max-w-xs">{e.desc}</span>
                    <button
                      onClick={() => copyPath(e.path)}
                      className="opacity-0 group-hover:opacity-100 transition shrink-0 p-1.5 rounded hover:bg-muted"
                      aria-label="Copy path"
                    >
                      {copied === e.path ? (
                        <Check className="size-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="size-3.5 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Rate limiting card */}
      <Card>
        <CardContent className="p-5">
          <h3 className="text-sm font-semibold mb-3">Rate Limiting</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {data &&
              Object.entries(data.rateLimiting).map(([type, limit]) => (
                <div key={type} className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground capitalize">{type}</div>
                  <div className="text-sm font-mono font-semibold">{limit}</div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
