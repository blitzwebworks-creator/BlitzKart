const INDIA_TIME_ZONE = "Asia/Kolkata";

function validDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value: string | Date, options?: Intl.DateTimeFormatOptions) {
  const date = validDate(value);
  if (!date) return "—";
  const formatOptions = options ?? { dateStyle: "medium", timeStyle: "short" };
  return new Intl.DateTimeFormat("en-IN", { ...formatOptions, timeZone: INDIA_TIME_ZONE }).format(date);
}

export function formatDate(value: string | Date) {
  const date = validDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: INDIA_TIME_ZONE }).format(date);
}
