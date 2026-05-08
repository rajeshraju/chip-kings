const APP_TIME_ZONE = "America/Chicago";

function coerceDate(input: string | number | Date): Date | null {
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatAppDate(
  input: string | number | Date,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const date = coerceDate(input);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    ...options,
  }).format(date);
}

export function formatAppDateTime(input: string | number | Date): string {
  return formatAppDate(input, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatAppShortDate(input: string | number | Date): string {
  return formatAppDate(input, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isoDateInAppTimeZone(input: string | number | Date): string {
  const date = coerceDate(input);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = new Map(parts.map((p) => [p.type, p.value]));
  const y = byType.get("year");
  const m = byType.get("month");
  const d = byType.get("day");
  return y && m && d ? `${y}-${m}-${d}` : "";
}
