/** Weekly recurring post schedule helpers (day = JS Date.getDay(): 0 Sun … 6 Sat) */

export type PostRecurrenceType = "once" | "weekly";

export const WEEKDAY_OPTIONS = [
  { value: 0, label: "Sun", full: "Sunday" },
  { value: 1, label: "Mon", full: "Monday" },
  { value: 2, label: "Tue", full: "Tuesday" },
  { value: 3, label: "Wed", full: "Wednesday" },
  { value: 4, label: "Thu", full: "Thursday" },
  { value: 5, label: "Fri", full: "Friday" },
  { value: 6, label: "Sat", full: "Saturday" },
] as const;

export function parseTimeParts(time: string): { hours: number; minutes: number } {
  const [h, m] = time.split(":").map(Number);
  return { hours: Number.isFinite(h) ? h : 10, minutes: Number.isFinite(m) ? m : 0 };
}

export function formatTime12(time: string): string {
  const { hours, minutes } = parseTimeParts(time);
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export function weekdayLabel(dayOfWeek: number, style: "short" | "full" = "full"): string {
  const opt = WEEKDAY_OPTIONS.find((w) => w.value === dayOfWeek);
  if (!opt) return "—";
  return style === "short" ? opt.label : opt.full;
}

/** Next occurrence of weekday+time strictly after `from` (defaults to now). */
export function computeNextWeeklyOccurrence(
  dayOfWeek: number,
  time: string,
  from: Date = new Date(),
): Date {
  const { hours, minutes } = parseTimeParts(time);
  const base = new Date(from);
  base.setSeconds(0, 0);

  const candidate = new Date(base);
  candidate.setHours(hours, minutes, 0, 0);

  const diff = (dayOfWeek - candidate.getDay() + 7) % 7;
  candidate.setDate(candidate.getDate() + diff);

  if (candidate.getTime() <= base.getTime()) {
    candidate.setDate(candidate.getDate() + 7);
  }

  return candidate;
}

export function formatWeeklyRecurrence(dayOfWeek: number, time: string): string {
  return `Every ${weekdayLabel(dayOfWeek)} at ${formatTime12(time)}`;
}

export function timeFromDate(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
