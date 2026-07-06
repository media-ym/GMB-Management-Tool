"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
import { FileJson, Search, Copy, Check, Shield, Server, Database, GitBranch, Code2 } from "lucide-react";
import { toast } from "sonner";

interface SchemaProp { field: string; type: string; required?: boolean; example?: string }
interface Schema { name: string; description: string; properties: SchemaProp[] }
interface Param { name: string; location: string; type: string; required?: boolean; default?: string; enum?: string[] }
interface Endpoint {
  tag: string; method: string; path: string; summary: string;
  parameters?: string[]; requestBody?: string; responses: string[];
}
interface SpecData {
  openapi: string;
  info: { title: string; version: string; description: string };
  servers: { url: string; description: string }[];
  tags: string[];
  schemas: Schema[];
  parameters: Param[];
  responses: { code: string; description: string }[];
  securitySchemes: { name: string; type: string; scheme: string; bearerFormat: string; description: string }[];
  endpoints: Endpoint[];
  project: Record<string, unknown>;
}

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  POST: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  PUT: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  PATCH: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  DELETE: "bg-rose-500/10 text-rose-600 border-rose-500/20",
};

const TAG_COLORS: Record<string, string> = {
  Authentication: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  Users: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  Locations: "bg-teal-500/10 text-teal-600 border-teal-500/20",
  "Google Business Profile": "bg-blue-500/10 text-blue-600 border-blue-500/20",
  Reviews: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  "Google Posts": "bg-rose-500/10 text-rose-600 border-rose-500/20",
  Analytics: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  SEO: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  AI: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  Reports: "bg-green-500/10 text-green-600 border-green-500/20",
  Notifications: "bg-pink-500/10 text-pink-600 border-pink-500/20",
  Admin: "bg-red-500/10 text-red-600 border-red-500/20",
  System: "bg-gray-500/10 text-gray-600 border-gray-500/20",
};

export function OpenApiSpecView() {
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const [copied, setCopied] = useState<string | null>(null);

  const { data, isLoading } = useQuery<SpecData>({
    queryKey: ["openapi-spec"],
    queryFn: () => api<SpecData>("/api/openapi-spec"),
  });

  const filteredEndpoints = useMemo(() => {
    if (!data) return [];
    return data.endpoints.filter((e) => {
      const matchSearch = !search ||
        e.path.toLowerCase().includes(search.toLowerCase()) ||
        e.summary.toLowerCase().includes(search.toLowerCase()) ||
        e.tag.toLowerCase().includes(search.toLowerCase());
      const matchTag = tagFilter === "all" || e.tag === tagFilter;
      return matchSearch && matchTag;
    });
  }, [data, search, tagFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, Endpoint[]>();
    for (const e of filteredEndpoints) {
      if (!map.has(e.tag)) map.set(e.tag, []);
      map.get(e.tag)!.push(e);
    }
    return Array.from(map.entries());
  }, [filteredEndpoints]);

  function copyPath(path: string) {
    navigator.clipboard.writeText(path);
    setCopied(path);
    toast.success(`Copied: ${path}`);
    setTimeout(() => setCopied(null), 2000);
  }

  function downloadYaml() {
    const yaml = `openapi: 3.1.0\ninfo:\n  title: MyFNG Local AI Manager API\n  version: 1.0.0\nservers:\n  - url: https://localai.myfng.in/api/v1\n    description: Production\n  - url: http://localhost:3000/api/v1\n    description: Development\n# ${data?.endpoints.length ?? 0} endpoints across ${data?.tags.length ?? 0} tags\n# Full spec available at /api/openapi-spec`;
    const blob = new Blob([yaml], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "myfng-openapi-spec.yaml"; a.click();
    URL.revokeObjectURL(url);
    toast.success("OpenAPI spec downloaded");
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <FileJson className="size-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold">OpenAPI 3.1 Specification</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {data?.endpoints.length ?? 0} endpoints · {data?.tags.length ?? 0} tags · {data?.schemas.length ?? 0} schemas · JWT Bearer auth
            </p>
          </div>
        </div>
        <button onClick={downloadYaml} className="text-xs font-medium text-primary hover:underline shrink-0 hidden sm:block">
          Download YAML
        </button>
      </div>

      {/* Servers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {data?.servers.map((s) => (
          <div key={s.url} className="rounded-lg border p-3 bg-card">
            <div className="text-xs text-muted-foreground">{s.description}</div>
            <code className="text-xs font-mono text-primary">{s.url}</code>
          </div>
        ))}
      </div>

      <Tabs defaultValue="endpoints">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="endpoints" className="text-xs">Endpoints ({data?.endpoints.length ?? 0})</TabsTrigger>
          <TabsTrigger value="schemas" className="text-xs">Schemas ({data?.schemas.length ?? 0})</TabsTrigger>
          <TabsTrigger value="parameters" className="text-xs">Parameters ({data?.parameters.length ?? 0})</TabsTrigger>
          <TabsTrigger value="security" className="text-xs">Security</TabsTrigger>
          <TabsTrigger value="responses" className="text-xs">Status Codes</TabsTrigger>
          <TabsTrigger value="info" className="text-xs">Info</TabsTrigger>
        </TabsList>

        {/* ─── Endpoints Tab ─── */}
        <TabsContent value="endpoints" className="space-y-4 mt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder="Search endpoints by path, summary, or tag..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="h-9 rounded-lg border bg-card px-3 text-sm">
              <option value="all">All Tags</option>
              {data?.tags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)
          ) : grouped.length === 0 ? (
            <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No endpoints match your search.</CardContent></Card>
          ) : (
            grouped.map(([tag, endpoints]) => (
              <div key={tag}>
                <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
                  {tag}
                  <Badge variant="secondary" className="text-xs">{endpoints.length}</Badge>
                </h3>
                <div className="space-y-1.5">
                  {endpoints.map((e, i) => (
                    <div key={`${e.path}-${i}`} className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:bg-accent/30 transition group">
                      <Badge variant="outline" className={cn("font-mono text-xs font-bold shrink-0 w-16 justify-center", METHOD_COLORS[e.method])}>{e.method}</Badge>
                      <code className="text-sm font-mono flex-1 min-w-0 truncate">{e.path}</code>
                      <span className="text-xs text-muted-foreground hidden md:block truncate max-w-xs">{e.summary}</span>
                      {e.requestBody && <Badge variant="outline" className="text-xs shrink-0 hidden lg:flex">body</Badge>}
                      <div className="flex gap-1 shrink-0">
                        {e.responses.map((r) => (
                          <span key={r} className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded",
                            r.startsWith("2") ? "bg-emerald-500/10 text-emerald-600" :
                            r.startsWith("4") ? "bg-amber-500/10 text-amber-600" :
                            "bg-rose-500/10 text-rose-600"
                          )}>{r}</span>
                        ))}
                      </div>
                      <button onClick={() => copyPath(e.path)} className="opacity-0 group-hover:opacity-100 transition shrink-0 p-1.5 rounded hover:bg-muted">
                        {copied === e.path ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5 text-muted-foreground" />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </TabsContent>

        {/* ─── Schemas Tab ─── */}
        <TabsContent value="schemas" className="space-y-3 mt-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)
          ) : (
            data?.schemas.map((s) => (
              <Card key={s.name}>
                <div className="px-5 py-3 border-b flex items-center justify-between">
                  <div>
                    <code className="text-sm font-mono font-semibold text-primary">{s.name}</code>
                    <span className="text-xs text-muted-foreground ml-2">{s.description}</span>
                  </div>
                </div>
                <div className="overflow-x-auto scroll-area">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b"><th className="text-left px-5 py-2 font-medium text-muted-foreground">Field</th><th className="text-left px-5 py-2 font-medium text-muted-foreground">Type</th><th className="text-left px-5 py-2 font-medium text-muted-foreground">Required</th></tr></thead>
                    <tbody>
                      {s.properties.map((p, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-5 py-2 font-mono font-medium">{p.field}</td>
                          <td className="px-5 py-2 font-mono text-amber-600 dark:text-amber-400">{p.type}</td>
                          <td className="px-5 py-2">{p.required ? <Check className="size-3.5 text-emerald-500" /> : <span className="text-muted-foreground">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ─── Parameters Tab ─── */}
        <TabsContent value="parameters" className="mt-4">
          <Card>
            <div className="overflow-x-auto scroll-area">
              <table className="w-full text-sm">
                <thead><tr className="border-b"><th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Name</th><th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Location</th><th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Type</th><th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Required</th><th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Default</th></tr></thead>
                <tbody>
                  {data?.parameters.map((p) => (
                    <tr key={p.name} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="py-2.5 px-4 font-mono font-medium">{p.name}</td>
                      <td className="py-2.5 px-4"><Badge variant="outline" className="text-xs">{p.location}</Badge></td>
                      <td className="py-2.5 px-4 font-mono text-xs text-amber-600">{p.type}</td>
                      <td className="py-2.5 px-4">{p.required ? <Check className="size-4 text-emerald-500" /> : <span className="text-muted-foreground text-xs">no</span>}</td>
                      <td className="py-2.5 px-4 font-mono text-xs text-muted-foreground">{p.default ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ─── Security Tab ─── */}
        <TabsContent value="security" className="space-y-3 mt-4">
          {data?.securitySchemes.map((s) => (
            <Card key={s.name}>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Shield className="size-5" /></div>
                  <div>
                    <code className="text-sm font-mono font-semibold">{s.name}</code>
                    <div className="text-xs text-muted-foreground">{s.description}</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div><span className="text-muted-foreground">Type:</span> <code className="font-mono">{s.type}</code></div>
                  <div><span className="text-muted-foreground">Scheme:</span> <code className="font-mono">{s.scheme}</code></div>
                  <div><span className="text-muted-foreground">Format:</span> <code className="font-mono">{s.bearerFormat}</code></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ─── Status Codes Tab ─── */}
        <TabsContent value="responses" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data?.responses.map((r) => (
              <div key={r.code} className={cn("rounded-lg border p-4 flex items-center gap-3",
                r.code.startsWith("2") ? "border-emerald-500/20 bg-emerald-500/5" :
                r.code.startsWith("4") ? "border-amber-500/20 bg-amber-500/5" :
                "border-rose-500/20 bg-rose-500/5"
              )}>
                <span className={cn("text-2xl font-bold font-mono",
                  r.code.startsWith("2") ? "text-emerald-600" :
                  r.code.startsWith("4") ? "text-amber-600" : "text-rose-600"
                )}>{r.code}</span>
                <span className="text-sm text-muted-foreground">{r.description}</span>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ─── Info Tab ─── */}
        <TabsContent value="info" className="space-y-3 mt-4">
          <Card>
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Server className="size-4" /> API Info</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Title:</span><span className="font-medium">{data?.info.title}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Version:</span><code className="font-mono">{data?.info.version}</code></div>
                <div className="flex justify-between"><span className="text-muted-foreground">OpenAPI:</span><code className="font-mono">{data?.openapi}</code></div>
                <div className="text-xs text-muted-foreground mt-2">{data?.info.description}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Database className="size-4" /> Project Stack</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {data && Object.entries(data.project as Record<string, unknown>).map(([k, v]) => (
                  <div key={k} className="flex justify-between rounded border p-2">
                    <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}:</span>
                    <span className="font-mono">{Array.isArray(v) ? v.join(", ") : String(v)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
