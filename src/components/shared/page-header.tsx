"use client";

import { cn } from "@/lib/utils";

export function PageHeader({
  title, description, actions, icon: Icon,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Icon className="size-5" />
          </div>
        )}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function CardSection({
  title, description, action, children, className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card", className)}>
      <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}
