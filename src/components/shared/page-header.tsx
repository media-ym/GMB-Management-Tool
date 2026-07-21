"use client";

import { cn } from "@/lib/utils";
import type { StatAccent } from "@/components/shared/stat-card";
import { STAT_ACCENT_STYLES } from "@/components/shared/stat-card";
import { accentForPageTitle } from "@/lib/view-theme";

export function PageHeader({
  title,
  description,
  actions,
  icon: Icon,
  accent,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: StatAccent;
}) {
  const colorKey = accent ?? accentForPageTitle(title);
  const style = STAT_ACCENT_STYLES[colorKey];

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/50 shadow-sm mb-6 overflow-hidden",
        "bg-gradient-to-r",
        style.gradient,
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 sm:p-5">
        <div className="flex items-start gap-3 min-w-0">
          {Icon && (
            <div
              className={cn(
                "size-11 rounded-xl flex items-center justify-center shrink-0 text-white shadow-sm",
                style.iconBg,
              )}
            >
              <Icon className="size-5" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{title}</h1>
            {description && (
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{description}</p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div>
        )}
      </div>
    </div>
  );
}

export function CardSection({
  title,
  description,
  action,
  children,
  className,
  noPadding,
  icon: Icon,
  accent = "emerald",
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: StatAccent;
}) {
  const style = STAT_ACCENT_STYLES[accent];

  return (
    <div className={cn("kt-card overflow-hidden", className)}>
      <div
        className={cn(
          "kt-card-header flex-col sm:flex-row items-start sm:items-center gap-3 border-b",
          "bg-gradient-to-r",
          style.gradient,
        )}
      >
        <div className="min-w-0 w-full sm:w-auto flex items-start gap-2.5">
          {Icon && (
            <div
              className={cn(
                "size-8 rounded-lg flex items-center justify-center shrink-0 text-white shadow-sm mt-0.5",
                style.iconBg,
              )}
            >
              <Icon className="size-4" />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="kt-card-title">{title}</h3>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0 w-full sm:w-auto">{action}</div>}
      </div>
      <div className={cn(!noPadding && "kt-card-body")}>{children}</div>
    </div>
  );
}
