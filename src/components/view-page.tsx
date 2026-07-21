"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { MisaOverviewStrip } from "@/components/shared/misa-overview-strip";
import { getMisaOverviewConfig } from "@/lib/misa-overview";
import { canAccessView } from "@/lib/permissions";
import { pathToView } from "@/lib/routes";
import { useAppStore } from "@/lib/store";
import { useUser } from "@/lib/user-context";
import type { ViewKey } from "@/lib/types";

export function ViewPage({ view, children }: { view: ViewKey; children: React.ReactNode }) {
  const user = useUser();
  const pathname = usePathname();
  const setView = useAppStore((s) => s.setView);

  useEffect(() => {
    setView(pathToView(pathname) ?? view);
  }, [pathname, view, setView]);

  if (!canAccessView(user.role, view)) {
    return (
      <div className="p-6 sm:p-8">
        <Card>
          <CardContent className="p-10 text-center">
            <ShieldAlert className="size-12 mx-auto text-amber-500 mb-3" />
            <h2 className="text-lg font-semibold">Access restricted</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Your role ({user.role.replace("_", " ")}) doesn&apos;t have permission to view this module.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeView = pathToView(pathname) ?? view;
  const showMisa = getMisaOverviewConfig(activeView) !== null;

  return (
    <div className="flex flex-col min-h-0">
      {showMisa && (
        <div className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-5 pb-0">
          <MisaOverviewStrip view={activeView} />
        </div>
      )}
      {children}
    </div>
  );
}
