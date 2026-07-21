"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * next-themes injects an inline <script> to avoid theme flash.
 * React 19 logs that as a console error (false positive — SSR still runs the script).
 * Suppress only that specific message in development so the Next overlay doesn't block pages.
 */
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const orig = console.error;
  console.error = (...args: unknown[]) => {
    const msg = typeof args[0] === "string" ? args[0] : "";
    if (msg.includes("Encountered a script tag")) return;
    orig.apply(console, args);
  };
}

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
