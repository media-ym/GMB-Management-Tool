"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { PageHeader, CardSection } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Palette,
  RefreshCw,
  Check,
  X,
  Info,
  Sparkles,
  Search,
  Mail,
  Lock,
  Loader2,
  Type,
  Square,
  Layers,
  Table as TableIcon,
  BarChart3,
  Accessibility,
  Moon,
  PenLine,
  Plus,
  Hash,
  Maximize,
  LayoutGrid,
  Smartphone,
  Bell,
  Zap,
  Component,
  Variable,
  ListChecks,
} from "lucide-react";

/* --------------------------------- Types --------------------------------- */

interface ColorToken {
  hex: string;
  name: string;
  usage: string;
}

interface HeadingSpec {
  level: string;
  size: string;
  weight: string;
  usage: string;
}

interface BreakpointSpec {
  name: string;
  range: string;
  prefix: string;
}

interface DesignSystemData {
  philosophy: { keywords: string[]; avoid: string[] };
  grid: { desktop: string; container: string; contentWidth: string; gutter: string };
  breakpoints: BreakpointSpec[];
  layout: {
    sidebar: { collapsed: string; expanded: string };
    topNav: string[];
    footer: string;
  };
  colors: {
    note: string;
    primary: ColorToken;
    primaryHover: ColorToken;
    success: ColorToken;
    warning: ColorToken;
    danger: ColorToken;
    info: ColorToken;
    background: ColorToken;
    card: ColorToken;
    border: ColorToken;
    textPrimary: ColorToken;
    textSecondary: ColorToken;
    accent: ColorToken;
  };
  typography: {
    font: string;
    headings: HeadingSpec[];
    body: string;
    small: string;
    caption: string;
  };
  borderRadius: { cards: string; buttons: string; inputs: string; dialogs: string };
  shadows: { cards: string; modal: string; dropdown: string; rule: string };
  buttons: { variants: string[]; sizes: string[] };
  inputs: string[];
  cards: string[];
  tables: { features: string[]; types: string[] };
  charts: { library: string; types: string[]; colors: string[] };
  icons: { library: string; sizes: number[] };
  modals: string[];
  toasts: { types: string[]; duration: string; library: string };
  loadingStates: string[];
  emptyStates: { required: string[] };
  errorStates: { required: string[] };
  animations: { maxDuration: string; allowed: string[]; avoid: string[] };
  accessibility: { contrast: string; keyboard: string; aria: string; focusRing: string };
  darkMode: { supported: boolean; method: string; note: string };
  componentNaming: string[];
  themeVariables: string[];
  finalRules: string[];
}

/* Ordered color keys for rendering swatches in spec order. */
const COLOR_KEYS = [
  "primary",
  "primaryHover",
  "success",
  "warning",
  "danger",
  "info",
  "background",
  "card",
  "border",
  "textPrimary",
  "textSecondary",
  "accent",
] as const;

/* Friendly display labels for each color key. */
const COLOR_LABELS: Record<(typeof COLOR_KEYS)[number], string> = {
  primary: "Primary",
  primaryHover: "Primary Hover",
  success: "Success",
  warning: "Warning",
  danger: "Danger",
  info: "Info",
  background: "Background",
  card: "Card",
  border: "Border",
  textPrimary: "Text Primary",
  textSecondary: "Text Secondary",
  accent: "AI Accent",
};

/* ------------------------------ Helpers ------------------------------ */

/** Perceived luminance — returns true for "light" colors (use dark text inside). */
function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  if (c.length < 6) return true;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return true;
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return l > 0.6;
}

/** Parse a chart color entry like "var(--chart-1) emerald" into var + name. */
function parseChartColor(entry: string): { varName: string; label: string } {
  const trimmed = entry.trim();
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) return { varName: trimmed, label: trimmed };
  return {
    varName: trimmed.slice(0, spaceIdx),
    label: trimmed.slice(spaceIdx + 1),
  };
}

/* --------------------------- Loading skeleton --------------------------- */

function DesignSystemSkeleton() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
        <Skeleton className="h-9 w-24" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>

      <Skeleton className="h-72 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    </div>
  );
}

/* ------------------------------ Sub-sections ----------------------------- */

function PhilosophyCard({ data }: { data: DesignSystemData }) {
  return (
    <CardSection
      title="Design Philosophy"
      description="Core principles that guide every component decision"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="size-7 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Check className="size-4" />
            </div>
            <h4 className="text-sm font-semibold">Keywords</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.philosophy.keywords.map((k) => (
              <Badge
                key={k}
                variant="outline"
                className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-medium"
              >
                {k}
              </Badge>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="size-7 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <X className="size-4" />
            </div>
            <h4 className="text-sm font-semibold">Avoid</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.philosophy.avoid.map((k) => (
              <Badge
                key={k}
                variant="outline"
                className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 font-medium line-through decoration-rose-400/60"
              >
                {k}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </CardSection>
  );
}

function ColorSwatch({
  label,
  token,
}: {
  label: string;
  token: ColorToken;
}) {
  const light = isLightColor(token.hex);
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-3">
      <div
        className="size-16 shrink-0 rounded-lg flex items-end justify-end p-1.5 ring-1 ring-black/5"
        style={{ backgroundColor: token.hex }}
        aria-hidden
      >
        <span
          className={cn(
            "text-[10px] font-mono font-semibold leading-none",
            light ? "text-slate-700" : "text-white",
          )}
        >
          {token.hex}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs font-mono text-muted-foreground">{token.name}</div>
        <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{token.usage}</div>
      </div>
    </div>
  );
}

function ColorPaletteSection({ data }: { data: DesignSystemData }) {
  return (
    <CardSection
      title="Color Palette"
      description="Brand, semantic & surface tokens used across the platform"
    >
      <Alert className="mb-4 border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300">
        <Info className="size-4 text-amber-600 dark:text-amber-400" />
        <AlertTitle className="text-amber-800 dark:text-amber-200">Color note</AlertTitle>
        <AlertDescription className="text-amber-700 dark:text-amber-300/90">
          {data.colors.note}
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {COLOR_KEYS.map((k) => (
          <ColorSwatch key={k} label={COLOR_LABELS[k]} token={data.colors[k]} />
        ))}
      </div>
    </CardSection>
  );
}

function TypographySection({ data }: { data: DesignSystemData }) {
  // Map spec rows to inline px sizes for actual rendering.
  const sizePx = (size: string): number => {
    const m = size.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 16;
  };

  return (
    <CardSection
      title="Typography"
      description={`${data.typography.font} — rendered at actual sizes`}
    >
      <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/20 p-3 mb-5 flex items-center gap-3">
        <div className="size-9 rounded-md bg-primary/10 text-primary flex items-center justify-center">
          <Type className="size-5" />
        </div>
        <div>
          <div className="text-sm font-semibold">Font Family</div>
          <div className="text-xs text-muted-foreground">{data.typography.font}</div>
        </div>
      </div>

      <div className="space-y-4">
        {data.typography.headings.map((h) => {
          const px = sizePx(h.size);
          const wt = parseInt(h.weight, 10) || 600;
          return (
            <div
              key={h.level}
              className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-4 border-b last:border-b-0 pb-3 last:pb-0"
            >
              <div
                className="font-semibold text-foreground tracking-tight leading-tight"
                style={{ fontSize: `${px}px`, fontWeight: wt }}
              >
                {h.level === "H1"
                  ? "Heading 1"
                  : h.level === "H2"
                    ? "Heading 2"
                    : h.level === "H3"
                      ? "Heading 3"
                      : h.level === "H4"
                        ? "Heading 4"
                        : "Heading 5"}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                <Badge variant="outline" className="font-mono">
                  {h.level}
                </Badge>
                <span className="font-mono">{h.size}</span>
                <span className="text-muted-foreground/60">·</span>
                <span className="font-mono">{h.weight}</span>
                <span className="text-muted-foreground/60">·</span>
                <span>{h.usage}</span>
              </div>
            </div>
          );
        })}

        {/* Body / Small / Caption samples */}
        {[
          { label: "Body", spec: data.typography.body, sample: "Body text sample — used for paragraphs and primary content." },
          { label: "Small", spec: data.typography.small, sample: "Small text sample — used for secondary info and table cells." },
          { label: "Caption", spec: data.typography.caption, sample: "Caption text sample — used for hints and meta info." },
        ].map((row) => {
          const px = sizePx(row.spec);
          return (
            <div
              key={row.label}
              className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-4 border-b last:border-b-0 pb-3 last:pb-0"
            >
              <div className="text-foreground" style={{ fontSize: `${px}px` }}>
                {row.sample}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                <Badge variant="outline" className="font-mono">
                  {row.label}
                </Badge>
                <span className="font-mono">{row.spec}</span>
              </div>
            </div>
          );
        })}
      </div>
    </CardSection>
  );
}

function BorderRadiusSection({ data }: { data: DesignSystemData }) {
  const items: { label: string; spec: string; radius: string }[] = [
    { label: "Cards", spec: data.borderRadius.cards, radius: "12px" },
    { label: "Buttons", spec: data.borderRadius.buttons, radius: "10px" },
    { label: "Inputs", spec: data.borderRadius.inputs, radius: "10px" },
    { label: "Dialogs", spec: data.borderRadius.dialogs, radius: "16px" },
  ];
  return (
    <CardSection
      title="Border Radius"
      description="Corner radius applied to surfaces and controls"
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((it) => (
          <div key={it.label} className="flex flex-col items-center text-center gap-3">
            <div
              className="size-20 border-2 border-primary/40 bg-primary/5 flex items-center justify-center"
              style={{ borderRadius: it.radius }}
              aria-hidden
            >
              <Square className="size-6 text-primary/60" />
            </div>
            <div>
              <div className="text-sm font-medium">{it.label}</div>
              <div className="text-xs text-muted-foreground font-mono">{it.spec}</div>
            </div>
          </div>
        ))}
      </div>
    </CardSection>
  );
}

function ShadowsSection({ data }: { data: DesignSystemData }) {
  const items: { label: string; cls: string; spec: string }[] = [
    { label: "Cards", cls: "shadow-sm", spec: data.shadows.cards },
    { label: "Dropdown", cls: "shadow-md", spec: data.shadows.dropdown },
    { label: "Modal", cls: "shadow-lg", spec: data.shadows.modal },
  ];
  return (
    <CardSection
      title="Shadows"
      description="Layered elevation for surfaces and overlays"
      action={
        <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-500/20 bg-amber-500/5">
          {data.shadows.rule}
        </Badge>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {items.map((it) => (
          <div key={it.label} className="flex flex-col items-center text-center gap-3 py-2">
            <div
              className={cn(
                "h-20 w-full max-w-[180px] rounded-xl border bg-card flex items-center justify-center",
                it.cls,
              )}
            >
              <span className="text-xs font-mono text-muted-foreground">{it.cls}</span>
            </div>
            <div>
              <div className="text-sm font-medium">{it.label}</div>
              <div className="text-xs text-muted-foreground">{it.spec}</div>
            </div>
          </div>
        ))}
      </div>
    </CardSection>
  );
}

function ButtonsShowcase({ data }: { data: DesignSystemData }) {
  return (
    <CardSection
      title="Buttons"
      description="Variants and sizes from the shadcn Button component"
    >
      <div className="space-y-5">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Variants
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="outline">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Danger</Button>
            <Button variant="outline" size="icon" aria-label="Add">
              <Plus className="size-4" />
            </Button>
            <Button disabled>
              <Loader2 className="size-4 animate-spin" />
              Loading
            </Button>
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Sizes
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="default">Medium</Button>
            <Button size="lg">Large</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Variants spec
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.buttons.variants.map((v) => (
                <Badge key={v} variant="outline" className="font-normal">
                  {v}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Sizes spec
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.buttons.sizes.map((s) => (
                <Badge key={s} variant="outline" className="font-normal">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>
    </CardSection>
  );
}

function InputsShowcase({ data }: { data: DesignSystemData }) {
  return (
    <CardSection
      title="Inputs"
      description="Live shadcn form controls with input-type catalog"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Text</label>
          <Input placeholder="Enter your name" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Search</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder="Search…" className="pl-8" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Email</label>
          <div className="relative">
            <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input type="email" placeholder="you@example.com" className="pl-8" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Password</label>
          <div className="relative">
            <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input type="password" defaultValue="supersecret" className="pl-8" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Select</label>
          <Select defaultValue="emerald">
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose an option" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="emerald">Emerald</SelectItem>
              <SelectItem value="amber">Amber</SelectItem>
              <SelectItem value="teal">Teal</SelectItem>
              <SelectItem value="rose">Rose</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Textarea</label>
          <Textarea placeholder="Write a longer message…" rows={3} />
        </div>
      </div>

      <div className="mt-5 pt-4 border-t">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Input catalog
        </div>
        <div className="flex flex-wrap gap-1.5">
          {data.inputs.map((i) => (
            <Badge key={i} variant="outline" className="font-normal">
              {i}
            </Badge>
          ))}
        </div>
      </div>
    </CardSection>
  );
}

function CardsShowcase({ data }: { data: DesignSystemData }) {
  return (
    <CardSection
      title="Card Types"
      description="Reusable surface patterns used across modules"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.cards.map((c) => (
          <div
            key={c}
            className="flex items-start gap-3 rounded-lg border bg-card p-3"
          >
            <div className="size-8 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Component className="size-4" />
            </div>
            <div className="text-sm font-medium pt-1">{c}</div>
          </div>
        ))}
      </div>
    </CardSection>
  );
}

function TablesSection({ data }: { data: DesignSystemData }) {
  return (
    <CardSection
      title="Tables"
      description="Feature set and table types used for data display"
      action={<TableIcon className="size-4 text-muted-foreground" />}
    >
      <div className="space-y-5">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Features
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.tables.features.map((f) => (
              <Badge
                key={f}
                variant="outline"
                className="bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20 font-medium"
              >
                {f}
              </Badge>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Types
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.tables.types.map((t) => (
              <Badge key={t} variant="outline" className="font-normal">
                {t}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </CardSection>
  );
}

function ChartsSection({ data }: { data: DesignSystemData }) {
  return (
    <CardSection
      title="Charts"
      description={`${data.charts.library} — chart types and color tokens`}
      action={<BarChart3 className="size-4 text-muted-foreground" />}
    >
      <div className="space-y-5">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Chart types
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.charts.types.map((t) => (
              <Badge key={t} variant="outline" className="font-normal">
                {t}
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Color tokens
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {data.charts.colors.map((entry) => {
              const { varName, label } = parseChartColor(entry);
              return (
                <div
                  key={entry}
                  className="flex items-center gap-2.5 rounded-lg border bg-card p-2.5"
                >
                  <span
                    className="size-5 rounded-full ring-1 ring-black/10 shrink-0"
                    style={{ backgroundColor: varName }}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-medium capitalize truncate">{label}</div>
                    <div className="text-[10px] font-mono text-muted-foreground truncate">
                      {varName}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </CardSection>
  );
}

function BreakpointsSection({ data }: { data: DesignSystemData }) {
  return (
    <CardSection
      title="Breakpoints & Grid"
      description="Responsive breakpoints and the 12-column grid system"
      action={<Smartphone className="size-4 text-muted-foreground" />}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Desktop Grid", value: data.grid.desktop },
          { label: "Container", value: data.grid.container },
          { label: "Content Width", value: data.grid.contentWidth },
          { label: "Gutter", value: data.grid.gutter },
        ].map((g) => (
          <div key={g.label} className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">{g.label}</div>
            <div className="text-sm font-semibold mt-0.5">{g.value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto scroll-area">
        <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Range</TableHead>
            <TableHead>Prefix</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.breakpoints.map((bp) => (
            <TableRow key={bp.name}>
              <TableCell className="font-medium">{bp.name}</TableCell>
              <TableCell className="text-muted-foreground font-mono text-xs">
                {bp.range}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="font-mono">
                  {bp.prefix}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        </Table>
      </div>
    </CardSection>
  );
}

function LayoutSection({ data }: { data: DesignSystemData }) {
  return (
    <CardSection
      title="App Shell Layout"
      description="Sidebar, top navigation and footer structure"
      action={<LayoutGrid className="size-4 text-muted-foreground" />}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Sidebar
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Collapsed</span>
              <Badge variant="outline" className="font-mono">
                {data.layout.sidebar.collapsed}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Expanded</span>
              <Badge variant="outline" className="font-mono">
                {data.layout.sidebar.expanded}
              </Badge>
            </div>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Footer
          </div>
          <p className="text-sm text-muted-foreground">{data.layout.footer}</p>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Top navigation
        </div>
        <div className="flex flex-wrap gap-1.5">
          {data.layout.topNav.map((n) => (
            <Badge key={n} variant="outline" className="font-normal">
              {n}
            </Badge>
          ))}
        </div>
      </div>
    </CardSection>
  );
}

function AccessibilityCard({ data }: { data: DesignSystemData }) {
  const items: { label: string; value: string }[] = [
    { label: "Color Contrast", value: data.accessibility.contrast },
    { label: "Keyboard Nav", value: data.accessibility.keyboard },
    { label: "ARIA Support", value: data.accessibility.aria },
    { label: "Focus Ring", value: data.accessibility.focusRing },
  ];
  return (
    <CardSection
      title="Accessibility"
      description="Standards compliance for inclusive UX"
      action={<Accessibility className="size-4 text-muted-foreground" />}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((it) => (
          <div
            key={it.label}
            className="flex items-center gap-3 rounded-lg border bg-card p-3"
          >
            <div className="size-7 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Check className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium">{it.label}</div>
              <div className="text-xs text-muted-foreground">{it.value}</div>
            </div>
          </div>
        ))}
      </div>
    </CardSection>
  );
}

function DarkModeCard({ data }: { data: DesignSystemData }) {
  return (
    <CardSection
      title="Dark Mode"
      description="Theme switching architecture"
      action={<Moon className="size-4 text-muted-foreground" />}
    >
      <div className="flex items-start gap-3">
        <div className="size-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
          {data.darkMode.supported ? (
            <Check className="size-5" />
          ) : (
            <X className="size-5" />
          )}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">
              {data.darkMode.supported ? "Supported" : "Not supported"}
            </span>
            <Badge
              variant="outline"
              className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
            >
              {data.darkMode.method}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{data.darkMode.note}</p>
        </div>
      </div>
    </CardSection>
  );
}

function FinalRulesCard({ data }: { data: DesignSystemData }) {
  return (
    <CardSection
      title="Final Design Rules"
      description="The 10 commandments every contributor must follow"
      action={<ListChecks className="size-4 text-muted-foreground" />}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {data.finalRules.map((rule, idx) => (
          <div
            key={rule}
            className="flex items-start gap-2.5 rounded-lg border bg-card p-3"
          >
            <div className="size-5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
              <Check className="size-3.5" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-mono text-muted-foreground mr-1.5">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <span className="text-sm font-medium">{rule}</span>
            </div>
          </div>
        ))}
      </div>
    </CardSection>
  );
}

function ComponentNamingCard({ data }: { data: DesignSystemData }) {
  return (
    <CardSection
      title="Component Naming"
      description="PascalCase conventions for shared components"
      action={<PenLine className="size-4 text-muted-foreground" />}
    >
      <div className="flex flex-wrap gap-1.5">
        {data.componentNaming.map((c) => (
          <Badge
            key={c}
            variant="outline"
            className="font-mono bg-slate-500/5 text-slate-700 dark:text-slate-300 border-slate-500/20"
          >
            {c}
          </Badge>
        ))}
      </div>
    </CardSection>
  );
}

function ThemeVariablesCard({ data }: { data: DesignSystemData }) {
  return (
    <CardSection
      title="Theme Variables"
      description="CSS custom properties that drive the token system"
      action={<Variable className="size-4 text-muted-foreground" />}
    >
      <div className="flex flex-wrap gap-1.5">
        {data.themeVariables.map((v) => (
          <Badge
            key={v}
            variant="outline"
            className="font-mono bg-amber-500/5 text-amber-700 dark:text-amber-300 border-amber-500/20"
          >
            {v}
          </Badge>
        ))}
      </div>
    </CardSection>
  );
}

function MiscSpecsCards({ data }: { data: DesignSystemData }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <CardSection title="Icons" description={data.icons.library} action={<Hash className="size-4 text-muted-foreground" />}>
        <div className="flex items-center gap-2 flex-wrap">
          {data.icons.sizes.map((s) => (
            <Badge key={s} variant="outline" className="font-mono">
              {s}px
            </Badge>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3 text-muted-foreground">
          {[18, 20, 24].map((s, i) => (
            <span key={s} className="inline-flex flex-col items-center gap-1">
              <Plus style={{ width: s, height: s }} className="text-primary" />
              <span className="text-[10px] font-mono">{data.icons.sizes[i] ?? s}px</span>
            </span>
          ))}
        </div>
      </CardSection>

      <CardSection title="Modals" description="Dialog size presets" action={<Maximize className="size-4 text-muted-foreground" />}>
        <div className="flex flex-wrap gap-1.5">
          {data.modals.map((m) => (
            <Badge key={m} variant="outline" className="font-normal">
              {m}
            </Badge>
          ))}
        </div>
      </CardSection>

      <CardSection
        title="Toasts"
        description={`${data.toasts.library} · ${data.toasts.duration}`}
        action={<Bell className="size-4 text-muted-foreground" />}
      >
        <div className="flex flex-wrap gap-1.5 mb-3">
          {data.toasts.types.map((t) => (
            <Badge key={t} variant="outline" className="font-normal">
              {t}
            </Badge>
          ))}
        </div>
      </CardSection>

      <CardSection title="Loading States" description="Feedback patterns" action={<Loader2 className="size-4 text-muted-foreground" />}>
        <div className="flex flex-wrap gap-1.5">
          {data.loadingStates.map((l) => (
            <Badge key={l} variant="outline" className="font-normal">
              {l}
            </Badge>
          ))}
        </div>
      </CardSection>

      <CardSection title="Empty States" description="Required elements" action={<Info className="size-4 text-muted-foreground" />}>
        <ul className="space-y-1.5">
          {data.emptyStates.required.map((e) => (
            <li key={e} className="flex items-center gap-2 text-sm">
              <Check className="size-3.5 text-emerald-500 shrink-0" />
              <span>{e}</span>
            </li>
          ))}
        </ul>
      </CardSection>

      <CardSection title="Error States" description="Required elements" action={<X className="size-4 text-muted-foreground" />}>
        <ul className="space-y-1.5">
          {data.errorStates.required.map((e) => (
            <li key={e} className="flex items-center gap-2 text-sm">
              <Check className="size-3.5 text-emerald-500 shrink-0" />
              <span>{e}</span>
            </li>
          ))}
        </ul>
      </CardSection>

      <CardSection
        title="Animations"
        description={`Max duration: ${data.animations.maxDuration}`}
        action={<Zap className="size-4 text-muted-foreground" />}
      >
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {data.animations.allowed.map((a) => (
              <Badge
                key={a}
                variant="outline"
                className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-normal"
              >
                {a}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.animations.avoid.map((a) => (
              <Badge
                key={a}
                variant="outline"
                className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 font-normal line-through decoration-rose-400/60"
              >
                {a}
              </Badge>
            ))}
          </div>
        </div>
      </CardSection>
    </div>
  );
}

/* ------------------------------ Main view ------------------------------ */

export function DesignSystemView() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<DesignSystemData>({
    queryKey: ["design-system"],
    queryFn: () => api<DesignSystemData>("/api/design-system"),
  });

  function handleRefresh() {
    toast.promise(
      refetch().then((r) => {
        if (r.isError) throw new Error("Failed to refresh");
        return r.data;
      }),
      {
        loading: "Refreshing design tokens…",
        success: "Design system refreshed",
        error: "Failed to refresh design system",
      },
    );
  }

  if (isLoading) return <DesignSystemSkeleton />;

  if (isError || !data) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader
          title="Design System"
          description="Enterprise design tokens, colors, typography & components"
          icon={Palette}
          actions={
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="size-4" />
              Retry
            </Button>
          }
        />
        <Card>
          <CardContent className="p-10 text-center">
            <X className="size-10 mx-auto text-rose-500 mb-3" />
            <h2 className="text-lg font-semibold">Couldn&apos;t load design system</h2>
            <p className="text-sm text-muted-foreground mt-1">
              The design tokens endpoint returned an error. Please try again.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Design System"
        description="Enterprise design tokens, colors, typography & components"
        icon={Palette}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching}
          >
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      {/* AI accent strip */}
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5">
        <Sparkles className="size-4 text-amber-500 shrink-0" />
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Living reference — every component on the platform should match these tokens. Emerald primary · Amber AI accent · Zero indigo/blue.
        </p>
      </div>

      <PhilosophyCard data={data} />

      <ColorPaletteSection data={data} />

      <TypographySection data={data} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BorderRadiusSection data={data} />
        <ShadowsSection data={data} />
      </div>

      <ButtonsShowcase data={data} />

      <InputsShowcase data={data} />

      <CardsShowcase data={data} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TablesSection data={data} />
        <ChartsSection data={data} />
      </div>

      <BreakpointsSection data={data} />

      <LayoutSection data={data} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AccessibilityCard data={data} />
        <DarkModeCard data={data} />
      </div>

      <MiscSpecsCards data={data} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ComponentNamingCard data={data} />
        <ThemeVariablesCard data={data} />
      </div>

      <FinalRulesCard data={data} />

      {/* Footer credit */}
      <div className="flex items-center justify-center gap-2 pt-2 pb-4 text-xs text-muted-foreground">
        <Layers className="size-3.5" />
        <span>Design System v1 · MyFNG Local AI Manager · doc 16</span>
      </div>
    </div>
  );
}
