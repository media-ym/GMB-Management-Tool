"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { viewToPath } from "@/lib/routes";
import { useAppStore } from "@/lib/store";
import type { ViewKey } from "@/lib/types";

/** Navigate to a module by view key — updates URL + store */
export function useAppNavigation() {
  const router = useRouter();
  const setView = useAppStore((s) => s.setView);

  const navigate = useCallback(
    (view: ViewKey, opts?: { search?: string }) => {
      setView(view);
      const path = viewToPath(view);
      router.push(opts?.search ? `${path}?${opts.search}` : path);
    },
    [router, setView],
  );

  return { navigate };
}
