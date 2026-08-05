"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useUser } from "@/lib/user-context";
import { can } from "@/lib/permissions";
import { mergeAutoPostConfig, type AutoPostConfig, type AutoPostTone } from "@/lib/auto-post";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Sparkles, Zap, Ban, Clock } from "lucide-react";
import { toast } from "sonner";

export function AutoPostConfig({
  onRunNow,
  runBusy = false,
}: {
  onRunNow?: () => void;
  runBusy?: boolean;
}) {
  const user = useUser();
  const qc = useQueryClient();
  const canManage = can(user.role, "posts.manage");

  const [config, setConfig] = useState<AutoPostConfig>(() => mergeAutoPostConfig(null));

  const { data: saved, isLoading } = useQuery<AutoPostConfig>({
    queryKey: ["auto-post-config"],
    queryFn: () => api<AutoPostConfig>("/api/posts/auto-post"),
  });

  useEffect(() => {
    if (saved) setConfig(saved);
  }, [saved]);

  const saveMut = useMutation({
    mutationFn: (payload: AutoPostConfig) =>
      api<AutoPostConfig & { runResult?: { published?: number } }>("/api/posts/auto-post", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      setConfig(data);
      qc.invalidateQueries({ queryKey: ["auto-post-config"] });
      qc.invalidateQueries({ queryKey: ["posts"] });
      qc.invalidateQueries({ queryKey: ["posts-stats"] });
      if (data.runResult?.published && data.runResult.published > 0) {
        toast.success(`Auto post enabled · ${data.runResult.published} post(s) published now`);
      } else {
        toast.success("Auto post settings saved");
      }
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    },
  });

  function patch(partial: Partial<AutoPostConfig>) {
    setConfig((prev) => ({ ...prev, ...partial }));
  }

  function handleSave() {
    if (!canManage) {
      toast.error("You don't have permission to manage auto posts");
      return;
    }
    saveMut.mutate(config);
  }

  function handleStop() {
    saveMut.mutate({ ...config, enabled: false });
  }

  if (isLoading) {
    return <Skeleton className="h-64 rounded-xl" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">Daily Auto Posts</h3>
          <Switch
            checked={config.enabled}
            onCheckedChange={(enabled) => patch({ enabled })}
            disabled={!canManage}
          />
          <span className="text-xs text-muted-foreground">{config.enabled ? "ON" : "OFF"}</span>
        </div>
        {onRunNow && (
          <Button
            size="sm"
            variant="outline"
            className="border-teal-500/40 text-teal-700 dark:text-teal-400"
            onClick={onRunNow}
            disabled={!canManage || runBusy}
          >
            {runBusy ? (
              <Loader2 className="size-3.5 mr-1.5 animate-spin" />
            ) : (
              <Zap className="size-3.5 mr-1.5" />
            )}
            Run now (all locations)
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <p className="text-xs text-muted-foreground">
            MiSA AI creates one SEO-focused Google post per verified location each day and publishes
            directly to GMB. Uses tracked keywords + location city. Images rotate from your Media
            library (post-images / business-photos).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium flex items-center gap-1">
                <Clock className="size-3.5" /> Daily run time (IST)
              </label>
              <Select
                value={String(config.runHourIST)}
                onValueChange={(v) => patch({ runHourIST: Number(v) })}
                disabled={!canManage}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[6, 7, 8, 9, 10, 11, 12, 17, 18, 19].map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h - 12} PM`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Post type</label>
              <Select
                value={config.postType}
                onValueChange={(v) => patch({ postType: v as AutoPostConfig["postType"] })}
                disabled={!canManage}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whats_new">What&apos;s New</SelectItem>
                  <SelectItem value="update">Business Update</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Tone</label>
              <Select
                value={config.tone}
                onValueChange={(v) => patch({ tone: v as AutoPostTone })}
                disabled={!canManage}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="local">Local / neighbourhood</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">SEO keywords per post</label>
              <Select
                value={String(config.keywordCount)}
                onValueChange={(v) => patch({ keywordCount: Number(v) })}
                disabled={!canManage}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} keyword{n > 1 ? "s" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Default CTA</label>
              <Select
                value={config.ctaType}
                onValueChange={(v) => patch({ ctaType: v as AutoPostConfig["ctaType"] })}
                disabled={!canManage}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="book">Book</SelectItem>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="learn_more">Learn more</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col justify-end gap-3">
              <label className="flex items-center gap-2 text-xs">
                <Switch
                  checked={config.attachImage}
                  onCheckedChange={(attachImage) => patch({ attachImage })}
                  disabled={!canManage}
                />
                Attach image from Media library
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Switch
                  checked={config.skipIfPostedToday}
                  onCheckedChange={(skipIfPostedToday) => patch({ skipIfPostedToday })}
                  disabled={!canManage}
                />
                Skip if already auto-posted today
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          className="flex-1 bg-slate-800 hover:bg-slate-900 text-white"
          onClick={handleSave}
          disabled={!canManage || saveMut.isPending}
        >
          {saveMut.isPending ? (
            <>
              <Loader2 className="size-3.5 mr-1.5 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Sparkles className="size-3.5 mr-1.5" /> Save & publish now
            </>
          )}
        </Button>
        <Button
          variant="destructive"
          onClick={handleStop}
          disabled={!canManage || saveMut.isPending}
        >
          <Ban className="size-3.5 mr-1.5" /> Stop auto posts
        </Button>
      </div>

      <Card className="bg-purple-50/50 dark:bg-purple-900/10 border-purple-200 dark:border-purple-900/50">
        <CardContent className="p-4 text-xs text-muted-foreground space-y-1">
          <p>
            <strong className="text-foreground">Cron (production):</strong> add{" "}
            <code className="text-[10px] bg-muted px-1 rounded">
              0 * * * * curl -H &quot;x-cron-secret: $CRON_SECRET&quot;
              https://gmb.myfng.in/api/cron/auto-post-daily
            </code>
          </p>
          <p>Runs once per day at the IST hour you select. Use &quot;Run now&quot; for immediate test.</p>
        </CardContent>
      </Card>
    </div>
  );
}
