"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  CONTENT_FIELD_META,
  type ContentFieldKey,
  type MediaTab,
} from "@/lib/content-update-fields";
import {
  DEFAULT_DAY_HOURS,
  serializeHours,
  serializeSpecialHours,
  type DayHours,
  type GmbDay,
  type SpecialHoursEntry,
} from "@/lib/content-gmb-forms";
import type { LocationWithStats } from "@/lib/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { GmbFieldForm } from "@/components/content/gmb-field-form";
import { fieldKeyToMediaTab, mediaTabToGoogleCategory } from "@/lib/media-categories";
import {
  Search,
  ShieldCheck,
  Loader2,
  MapPin,
  Lightbulb,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export interface ContentUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fieldKey: ContentFieldKey | null;
  locations: LocationWithStats[] | undefined;
  preselectedIds?: string[];
  missingIds?: string[];
  totalLocations?: number;
  onNavigateTab?: (tab: "posts" | "bulk-products") => void;
}

const EMPTY_IDS: string[] = [];

export function ContentUpdateDialog({
  open,
  onOpenChange,
  fieldKey,
  locations,
  preselectedIds = EMPTY_IDS,
  missingIds = EMPTY_IDS,
  totalLocations: totalLocationsProp,
  onNavigateTab,
}: ContentUpdateDialogProps) {
  const qc = useQueryClient();
  const meta = fieldKey ? CONTENT_FIELD_META[fieldKey] : null;

  const missingIdsRef = useRef(missingIds);
  const locationsRef = useRef(locations);
  const preselectedIdsRef = useRef(preselectedIds);
  missingIdsRef.current = missingIds;
  locationsRef.current = locations;
  preselectedIdsRef.current = preselectedIds;

  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [value, setValue] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [specialHoursEntries, setSpecialHoursEntries] = useState<SpecialHoursEntry[]>([]);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [hours, setHours] = useState<Record<GmbDay, DayHours>>(DEFAULT_DAY_HOURS);
  const [social, setSocial] = useState({ facebook: "", instagram: "", youtube: "", linkedin: "" });
  const [mediaTab, setMediaTab] = useState<MediaTab>("interior");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [listingsOpen, setListingsOpen] = useState(true);

  useEffect(() => {
    if (!open || !fieldKey) return;

    setSearch("");
    setTags([]);
    setSpecialHoursEntries([]);
    setAmenities([]);
    setHours({ ...DEFAULT_DAY_HOURS });
    setSocial({ facebook: "", instagram: "", youtube: "", linkedin: "" });
    setFiles([]);
    setListingsOpen(true);
    setMediaTab(fieldKeyToMediaTab(fieldKey));

    const fieldMeta = CONTENT_FIELD_META[fieldKey];
    if (fieldMeta.inputType === "choice" && fieldMeta.choices?.[0]) {
      setValue(fieldMeta.choices[0].value);
    } else {
      setValue("");
    }

    const pre = preselectedIdsRef.current;
    const missing = missingIdsRef.current;
    const locs = locationsRef.current;
    const initial =
      pre.length > 0 ? pre : missing.length > 0 ? missing : locs?.map((l) => l.id) ?? [];
    setSelectedIds(initial);
  }, [open, fieldKey]);

  const filteredLocations = useMemo(() => {
    if (!locations) return [];
    const q = search.trim().toLowerCase();
    const list = !q
      ? locations
      : locations.filter(
          (l) =>
            l.name.toLowerCase().includes(q) ||
            l.city.toLowerCase().includes(q) ||
            l.address?.toLowerCase().includes(q),
        );
    return [...list].sort((a, b) => {
      const aMissing = missingIds.includes(a.id);
      const bMissing = missingIds.includes(b.id);
      if (aMissing !== bMissing) return aMissing ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [locations, search, missingIds]);

  const selectedLocations = useMemo(
    () => locations?.filter((l) => selectedIds.includes(l.id)) ?? [],
    [locations, selectedIds],
  );

  const primaryListing = selectedLocations[0];

  function toggleLocation(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function selectAll() {
    setSelectedIds(locations?.map((l) => l.id) ?? []);
  }

  function selectMissingOnly() {
    setSelectedIds(missingIds);
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  function buildPayloadValue(): string {
    if (!meta || !fieldKey) return "";
    if (meta.inputType === "tags") return tags.join(", ");
    if (meta.inputType === "amenities") return amenities.join(", ");
    if (meta.inputType === "hours") return serializeHours(hours);
    if (meta.inputType === "specialHours") return serializeSpecialHours(specialHoursEntries);
    return value.trim();
  }

  function validateForm(): boolean {
    if (!meta || !fieldKey) return false;
    if (meta.inputType === "info") return true;
    if (selectedIds.length === 0) {
      toast.error("Select at least one profile");
      return false;
    }
    if (meta.inputType === "categorySearch" && !value.trim()) {
      toast.error("Select a primary category from the list");
      return false;
    }
    if (meta.inputType === "specialHours" && specialHoursEntries.length === 0) {
      toast.error("Add at least one special hours date");
      return false;
    }
    if (meta.inputType === "tags" && tags.length === 0) {
      toast.error(`Add at least one ${meta.key === "services" ? "service" : "category"}`);
      return false;
    }
    if (meta.inputType === "amenities" && amenities.length === 0) {
      toast.error("Select at least one attribute");
      return false;
    }
    if (meta.inputType === "hours") {
      const anyOpen = Object.values(hours).some((h) => h.open);
      if (!anyOpen) {
        toast.error("Enable hours for at least one day");
        return false;
      }
      return true;
    }
    if (meta.inputType === "media") {
      if (files.length === 0) {
        toast.error("Choose at least one file to upload");
        return false;
      }
      return true;
    }
    if (meta.inputType === "social") return true;
    const payloadValue = buildPayloadValue();
    if (!payloadValue && meta.inputType !== "choice") {
      toast.error("Fill in the required field");
      return false;
    }
    return true;
  }

  async function uploadMediaToLocations() {
    setSubmitting(true);
    let okCount = 0;
    let failCount = 0;
    let googleWarnings = 0;

    for (const locationId of selectedIds) {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        form.append("locationId", locationId);
        form.append("publishToGoogle", "true");
        const googleCategory = mediaTabToGoogleCategory(mediaTab);
        if (googleCategory) form.append("category", googleCategory);
        try {
          const res = await fetch("/api/media", { method: "POST", body: form });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.success) {
            throw new Error(json?.message || `Upload failed (${res.status})`);
          }
          okCount++;
          if (json.data?.googleError) googleWarnings++;
        } catch (e: unknown) {
          failCount++;
          if (failCount === 1) {
            toast.error(e instanceof Error ? e.message : "Upload failed");
          }
        }
      }
    }

    setSubmitting(false);
    qc.invalidateQueries({ queryKey: ["content-updates"] });
    qc.invalidateQueries({ queryKey: ["locations"] });

    if (failCount === 0 && okCount > 0) {
      if (googleWarnings > 0) {
        toast.warning(
          `Saved ${okCount} photo(s) to your dashboard. Google sync had issues — reconnect Google in Settings if needed.`,
        );
      } else {
        toast.success(`Uploaded ${okCount} photo(s) to ${selectedIds.length} profile(s)`);
      }
      onOpenChange(false);
    } else if (failCount === 0 && okCount === 0) {
      toast.error("No files were uploaded — select a file and try again");
    } else if (okCount > 0) {
      toast.warning(`Uploaded ${okCount} file(s); ${failCount} failed`);
    } else {
      toast.warning(`Uploaded 0 file(s); ${failCount} failed`);
    }
  }

  async function submitUpdate() {
    if (!fieldKey || !meta) return;
    if (meta.inputType === "info") {
      if (fieldKey === "products") onNavigateTab?.("bulk-products");
      else if (fieldKey === "posts") onNavigateTab?.("posts");
      onOpenChange(false);
      return;
    }
    if (!validateForm()) return;

    if (meta.inputType === "media") {
      await uploadMediaToLocations();
      return;
    }

    const payload: Record<string, unknown> = {};
    if (meta.inputType === "social") {
      payload.social = social;
    } else {
      payload.value = buildPayloadValue();
    }

    setSubmitting(true);
    try {
      const res = await api<{ updated: number; failed: number }>("/api/content-updates", {
        method: "POST",
        body: JSON.stringify({ field: fieldKey, locationIds: selectedIds, payload }),
      });
      qc.invalidateQueries({ queryKey: ["content-updates"] });
      qc.invalidateQueries({ queryKey: ["locations"] });
      toast.success(`Updated ${res.updated} profile(s)${res.failed ? ` · ${res.failed} failed` : ""}`);
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!meta) return null;

  const totalListings = totalLocationsProp ?? locations?.length ?? 0;
  const completeCount = Math.max(0, totalListings - missingIds.length);
  const submitLabel =
    meta.inputType === "info"
      ? meta.submitLabel ?? "Close"
      : meta.submitLabel ?? `Save ${meta.label}`;

  const tips = meta.tips ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-none sm:w-[min(960px,96vw)] p-0 gap-0 overflow-hidden flex flex-col h-full border-l shadow-2xl [&>button]:top-5 [&>button]:right-5 [&>button]:size-9 [&>button]:rounded-full [&>button]:border [&>button]:bg-background [&>button]:opacity-100"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0 text-left bg-gradient-to-r from-cyan-50/80 to-sky-50/50">
          <div className="pr-10 space-y-2">
            <SheetTitle className="text-xl font-bold tracking-tight">{meta.label}</SheetTitle>
            <div className="flex flex-wrap gap-2">
              {missingIds.length > 0 ? (
                <Badge className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100 tabular-nums">
                  {missingIds.length}/{totalListings} missing
                </Badge>
              ) : (
                <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100 tabular-nums">
                  {totalListings}/{totalListings} complete
                </Badge>
              )}
              <Badge variant="secondary" className="tabular-nums">
                {selectedIds.length} selected
              </Badge>
            </div>
            {primaryListing && selectedIds.length === 1 ? (
              <div className="space-y-0.5 pt-1">
                <p className="text-sm font-medium">{primaryListing.name}</p>
                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <MapPin className="size-3.5 shrink-0 mt-0.5" />
                  {[primaryListing.address, primaryListing.city].filter(Boolean).join(", ") ||
                    primaryListing.city}
                </p>
              </div>
            ) : (
              <SheetDescription>
                Bulk update {meta.label.toLowerCase()} on {selectedIds.length} Google Business Profiles
              </SheetDescription>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Step 1: Select profiles */}
          <div className="shrink-0 border-b">
            <button
              type="button"
              onClick={() => setListingsOpen((v) => !v)}
              className="w-full flex items-center justify-between px-6 py-3 hover:bg-muted/30 text-left"
            >
              <span className="text-sm font-semibold">
                Step 1 · Select profiles
              </span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="text-green-600">{completeCount} OK</span>
                <span>·</span>
                <span className={missingIds.length ? "text-red-600" : ""}>{missingIds.length} missing</span>
                {listingsOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </span>
            </button>

            {listingsOpen && (
              <div className="px-6 pb-4 space-y-3 bg-muted/10">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search profiles…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" className="h-7 text-xs" onClick={selectAll}>
                    All ({totalListings})
                  </Button>
                  {missingIds.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs text-red-700 border-red-200"
                      onClick={selectMissingOnly}
                    >
                      Missing ({missingIds.length})
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={clearSelection}>
                    Clear
                  </Button>
                </div>
                <div className="max-h-[200px] overflow-y-auto rounded-lg border divide-y bg-background">
                  {filteredLocations.map((loc) => {
                    const checked = selectedIds.includes(loc.id);
                    const isMissing = missingIds.includes(loc.id);
                    return (
                      <label
                        key={loc.id}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 cursor-pointer",
                          isMissing ? "bg-red-50/70" : "bg-green-50/30",
                          checked && "ring-1 ring-inset ring-primary/25",
                        )}
                      >
                        <Checkbox checked={checked} onCheckedChange={() => toggleLocation(loc.id)} />
                        <div className={cn("size-2 rounded-full shrink-0", isMissing ? "bg-red-500" : "bg-green-500")} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium line-clamp-1">{loc.name}</p>
                          <p className="text-[10px] text-muted-foreground">{loc.city}</p>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] h-5",
                            isMissing ? "text-red-700 border-red-200 bg-red-50" : "text-green-700 border-green-200 bg-green-50",
                          )}
                        >
                          {isMissing ? "Missing" : "OK"}
                        </Badge>
                        {loc.verificationState === "verified" && (
                          <ShieldCheck className="size-3.5 text-emerald-600 shrink-0" />
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Step 2: GMB-style field form */}
          <div className="flex-1 min-h-0 overflow-y-auto bg-muted/20">
            <div className="px-6 py-5">
              <p className="text-sm font-semibold mb-4">Step 2 · {meta.formHeading ?? `Update ${meta.label}`}</p>
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_240px] gap-5">
                <GmbFieldForm
                  meta={meta}
                  value={value}
                  onValueChange={setValue}
                  tags={tags}
                  onTagsChange={setTags}
                  specialHoursEntries={specialHoursEntries}
                  onSpecialHoursEntriesChange={setSpecialHoursEntries}
                  amenities={amenities}
                  onAmenitiesChange={setAmenities}
                  hours={hours}
                  onHoursChange={setHours}
                  social={social}
                  onSocialChange={setSocial}
                  mediaTab={mediaTab}
                  onMediaTabChange={setMediaTab}
                  files={files}
                  onFilesChange={setFiles}
                />

                {tips.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Tips to improve ranking
                    </p>
                    {tips.map((tip) => (
                      <div key={tip.title} className="rounded-xl border bg-card p-4 shadow-sm space-y-2">
                        <div className="flex items-start gap-2">
                          <Lightbulb className="size-4 text-primary shrink-0 mt-0.5" />
                          <p className="text-xs font-semibold">{tip.title}</p>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed pl-6">{tip.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {meta.inputType !== "info" && (
                <p className="text-xs text-muted-foreground mt-4 px-1">
                  Changes will apply to <strong>{selectedIds.length}</strong> of{" "}
                  <strong>{totalListings}</strong> profiles on Google.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t shrink-0 bg-background flex justify-end gap-2">
          <Button type="button" variant="outline" className="h-10" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            className="h-10 min-w-[180px]"
            disabled={submitting || (meta.inputType !== "info" && selectedIds.length === 0)}
            onClick={submitUpdate}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              submitLabel
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
