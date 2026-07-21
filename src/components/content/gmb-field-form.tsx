"use client";

import { cn } from "@/lib/utils";
import type { ContentFieldMeta } from "@/lib/content-update-fields";
import {
  GMB_AMENITY_GROUPS,
  GMB_DAYS,
  GMB_SOCIAL_FIELDS,
  DEFAULT_DAY_HOURS,
  type DayHours,
  type GmbDay,
} from "@/lib/content-gmb-forms";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { MediaTab } from "@/lib/content-update-fields";
import { mediaTabsForField } from "@/lib/media-categories";
import { Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GmbTagInput } from "@/components/content/gmb-tag-input";
import { GmbCategorySearch } from "@/components/content/gmb-category-search";
import { GmbSpecialHoursForm } from "@/components/content/gmb-special-hours-form";
import type { SpecialHoursEntry } from "@/lib/content-gmb-forms";

interface GmbFieldFormProps {
  meta: ContentFieldMeta;
  value: string;
  onValueChange: (v: string) => void;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  specialHoursEntries: SpecialHoursEntry[];
  onSpecialHoursEntriesChange: (entries: SpecialHoursEntry[]) => void;
  amenities: string[];
  onAmenitiesChange: (items: string[]) => void;
  hours: Record<GmbDay, DayHours>;
  onHoursChange: (h: Record<GmbDay, DayHours>) => void;
  social: Record<(typeof GMB_SOCIAL_FIELDS)[number]["key"], string>;
  onSocialChange: (s: Record<(typeof GMB_SOCIAL_FIELDS)[number]["key"], string>) => void;
  mediaTab: MediaTab;
  onMediaTabChange: (t: MediaTab) => void;
  files: File[];
  onFilesChange: (f: File[]) => void;
}

function GmbFieldLabel({ meta }: { meta: ContentFieldMeta }) {
  return (
    <div className="space-y-1 mb-4">
      <h4 className="text-base font-semibold text-foreground">
        {meta.formHeading ?? meta.label}
      </h4>
      {meta.gmbDescription && (
        <p className="text-sm text-muted-foreground leading-relaxed">{meta.gmbDescription}</p>
      )}
      {meta.hint && !meta.gmbDescription && (
        <p className="text-sm text-muted-foreground leading-relaxed">{meta.hint}</p>
      )}
    </div>
  );
}

function toggleAmenity(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function GmbFieldForm({
  meta,
  value,
  onValueChange,
  tags,
  onTagsChange,
  specialHoursEntries,
  onSpecialHoursEntriesChange,
  amenities,
  onAmenitiesChange,
  hours,
  onHoursChange,
  social,
  onSocialChange,
  mediaTab,
  onMediaTabChange,
  files,
  onFilesChange,
}: GmbFieldFormProps) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <GmbFieldLabel meta={meta} />

      {meta.inputType === "choice" && meta.choices && (
        <div className="space-y-2">
          {meta.choices.map((choice) => {
            const selected = value === choice.value;
            return (
              <button
                key={choice.value}
                type="button"
                onClick={() => onValueChange(choice.value)}
                className={cn(
                  "w-full flex items-center justify-between gap-3 px-4 py-4 rounded-xl border text-left transition-all",
                  selected
                    ? "border-primary bg-primary/[0.05] ring-1 ring-primary/25"
                    : "border-border hover:border-primary/30 hover:bg-muted/40",
                )}
              >
                <span className="text-sm font-medium">{choice.label}</span>
                <span
                  className={cn(
                    "size-5 rounded-full border-2 flex items-center justify-center shrink-0",
                    selected ? "border-primary" : "border-muted-foreground/35",
                  )}
                >
                  {selected && <span className="size-2.5 rounded-full bg-primary" />}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {meta.inputType === "phone" && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Phone number</label>
          <Input
            type="tel"
            placeholder={meta.placeholder}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            className="h-11 text-base"
            autoFocus
          />
        </div>
      )}

      {meta.inputType === "date" && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Opening date</label>
          <Input
            type="date"
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            className="h-11 max-w-xs"
            autoFocus
          />
        </div>
      )}

      {(meta.inputType === "text" || meta.inputType === "url") && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">{meta.label}</label>
          <Input
            type={meta.inputType === "url" ? "url" : "text"}
            placeholder={meta.placeholder}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            className="h-11"
            autoFocus
          />
        </div>
      )}

      {meta.inputType === "categorySearch" && (
        <GmbCategorySearch
          value={value}
          onChange={onValueChange}
          suggestions={meta.tagSuggestions ?? []}
          placeholder={meta.placeholder ?? "Search categories…"}
        />
      )}

      {meta.inputType === "specialHours" && (
        <GmbSpecialHoursForm entries={specialHoursEntries} onChange={onSpecialHoursEntriesChange} />
      )}

      {meta.inputType === "tags" && (
        <GmbTagInput
          label={meta.key === "services" ? "Services" : "Categories"}
          emptyLabel={meta.key === "services" ? "No services added yet" : "No categories added yet"}
          placeholder={meta.key === "services" ? "Search for a service…" : "Search for a category…"}
          tags={tags}
          onTagsChange={onTagsChange}
          suggestions={meta.tagSuggestions}
          maxTags={meta.maxTags ?? 9}
        />
      )}

      {meta.inputType === "textarea" && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">{meta.label}</label>
          <Textarea
            placeholder={meta.placeholder}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            rows={meta.key === "description" ? 6 : 5}
            maxLength={meta.maxLength}
            className="resize-none min-h-[120px] text-sm leading-relaxed"
            autoFocus
          />
          {meta.maxLength && (
            <p className="text-xs text-muted-foreground text-right tabular-nums">
              {value.length}/{meta.maxLength}
            </p>
          )}
        </div>
      )}

      {meta.inputType === "amenities" && (
        <div className="space-y-5">
          {GMB_AMENITY_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">
                {group.title}
              </p>
              <div className="flex flex-wrap gap-2">
                {group.items.map((item) => {
                  const on = amenities.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => onAmenitiesChange(toggleAmenity(amenities, item))}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                        on
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-background text-foreground border-border hover:border-primary/40",
                      )}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {amenities.length > 0 && (
            <p className="text-xs text-muted-foreground pt-1">
              {amenities.length} attribute{amenities.length !== 1 ? "s" : ""} selected
            </p>
          )}
        </div>
      )}

      {meta.inputType === "hours" && (
        <div className="space-y-1 divide-y rounded-lg border overflow-hidden">
          {GMB_DAYS.map((day) => {
            const row = hours[day];
            return (
              <div key={day} className="flex flex-wrap items-center gap-3 px-3 py-2.5 bg-background">
                <span className="w-24 text-sm font-medium shrink-0">{day}</span>
                <Switch
                  checked={row.open}
                  onCheckedChange={(open) =>
                    onHoursChange({ ...hours, [day]: { ...row, open } })
                  }
                />
                {row.open ? (
                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                    <Input
                      type="time"
                      value={row.from}
                      onChange={(e) =>
                        onHoursChange({ ...hours, [day]: { ...row, from: e.target.value } })
                      }
                      className="h-9 w-[120px] text-sm"
                    />
                    <span className="text-muted-foreground text-sm">to</span>
                    <Input
                      type="time"
                      value={row.to}
                      onChange={(e) =>
                        onHoursChange({ ...hours, [day]: { ...row, to: e.target.value } })
                      }
                      className="h-9 w-[120px] text-sm"
                    />
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Closed</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {meta.inputType === "social" && (
        <div className="space-y-4">
          {GMB_SOCIAL_FIELDS.map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{label}</label>
              <Input
                type="url"
                placeholder={placeholder}
                value={social[key]}
                onChange={(e) => onSocialChange({ ...social, [key]: e.target.value })}
                className="h-10"
              />
            </div>
          ))}
        </div>
      )}

      {meta.inputType === "media" && (
        <div className="space-y-4">
          {(() => {
            const tabs = mediaTabsForField(meta.key);
            const singleTab = tabs.length === 1;

            const uploadZone = (
              <div
                className="border-2 border-dashed rounded-xl p-8 text-center hover:border-primary/50 cursor-pointer bg-muted/20 transition-colors"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  onFilesChange(Array.from(e.dataTransfer.files));
                }}
                onClick={() => document.getElementById("content-media-input")?.click()}
              >
                <Upload className="size-9 mx-auto text-primary mb-2" />
                <p className="text-sm font-medium">Drag photos here or click to upload</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {meta.key === "businessLogo"
                    ? "Square logo, min 250×250px (JPG or PNG)"
                    : meta.key === "coverPhoto"
                      ? "Landscape cover photo, min 720×720px (JPG or PNG)"
                      : "Recommended: JPG or PNG, min 720×720px"}
                </p>
                <input
                  id="content-media-input"
                  type="file"
                  accept={meta.key === "videos" ? "video/*" : "image/*"}
                  multiple={meta.key === "photos"}
                  className="hidden"
                  onChange={(e) => onFilesChange(Array.from(e.target.files ?? []))}
                />
              </div>
            );

            if (singleTab) return uploadZone;

            return (
              <Tabs value={mediaTab} onValueChange={(v) => onMediaTabChange(v as MediaTab)}>
                <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-muted/50">
                  {tabs.map((t) => (
                    <TabsTrigger key={t.id} value={t.id} className="text-xs">
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {tabs.map((t) => (
                  <TabsContent key={t.id} value={t.id} className="mt-3">
                    {uploadZone}
                  </TabsContent>
                ))}
              </Tabs>
            );
          })()}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((f) => (
                <Badge key={f.name} variant="secondary" className="gap-1 pr-1">
                  <span className="truncate max-w-[160px]">{f.name}</span>
                  <button type="button" onClick={() => onFilesChange(files.filter((x) => x !== f))}>
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {meta.inputType === "info" && (
        <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground text-center">
          This update opens in a dedicated section — use the button below to continue.
        </div>
      )}
    </div>
  );
}
