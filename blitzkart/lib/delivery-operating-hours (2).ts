import { availableDeliveryMethods, type DeliveryModeId, type DeliveryZoneMethods } from "@/lib/delivery";

export const DELIVERY_TIMEZONE = "Asia/Kolkata" as const;
export const DELIVERY_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DeliveryDay = typeof DELIVERY_DAYS[number];
export type DeliveryScheduleDay = { enabled: boolean; all_day: boolean; open: string; close: string };
export type DeliveryWeeklySchedule = Record<DeliveryDay, DeliveryScheduleDay>;

export type DeliveryOperatingSettings = {
  timezone: typeof DELIVERY_TIMEZONE;
  blitz_enabled: boolean;
  standard_enabled: boolean;
  automatic_scheduling: boolean;
  blitz_paused: boolean;
  standard_paused: boolean;
  blitz_weekly_schedule: DeliveryWeeklySchedule;
  standard_weekly_schedule: DeliveryWeeklySchedule;
};

export type DeliveryScheduleZone = DeliveryZoneMethods & {
  postal_code?: string;
  locality?: string;
  blitz_schedule_override?: DeliveryWeeklySchedule | null;
  standard_schedule_override?: DeliveryWeeklySchedule | null;
};

type LocalClock = { year: number; month: number; day: number; weekday: DeliveryDay; minute: number };
export type DeliveryAvailabilityDecision = {
  available: boolean;
  reason: "available" | "globally_disabled" | "pin_disabled" | "temporarily_paused" | "closed_today" | "outside_hours" | "no_schedule";
  todayHours: string;
  nextOpening: string | null;
};

const weekdayByIntl: Record<string, DeliveryDay> = { Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat", Sun: "sun" };
const formatTime = (minutes: number) => {
  if (minutes >= 1440) return "12:00 AM";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", hour: "numeric", minute: "2-digit" }).format(new Date(Date.UTC(2020, 0, 1, Math.floor(minutes / 60), minutes % 60)));
};

function localClock(now: Date): LocalClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DELIVERY_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
    weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    weekday: weekdayByIntl[values.weekday] ?? "mon",
    minute: Number(values.hour) * 60 + Number(values.minute),
  };
}

function dayOffset(day: DeliveryDay, offset: number): DeliveryDay {
  return DELIVERY_DAYS[(DELIVERY_DAYS.indexOf(day) + offset + 7) % 7];
}

function parseMinute(value: string, allow24 = false) {
  if (allow24 && value === "24:00") return 1440;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function validEntry(value: unknown): value is DeliveryScheduleDay {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<DeliveryScheduleDay>;
  if (typeof entry.enabled !== "boolean" || typeof entry.all_day !== "boolean" || typeof entry.open !== "string" || typeof entry.close !== "string") return false;
  if (entry.all_day) return true;
  const open = parseMinute(entry.open);
  const close = parseMinute(entry.close, true);
  return open !== null && close !== null && open !== close;
}

function entryFor(schedule: DeliveryWeeklySchedule, day: DeliveryDay) {
  const entry: unknown = schedule?.[day];
  return validEntry(entry) ? entry : null;
}

function todayWindow(entry: DeliveryScheduleDay | null) {
  if (!entry?.enabled) return "Closed today";
  if (entry.all_day) return "24/7";
  return `${formatTime(parseMinute(entry.open) ?? 0)}–${formatTime(parseMinute(entry.close, true) ?? 0)}`;
}

function isOpenAt(schedule: DeliveryWeeklySchedule, clock: LocalClock) {
  const minute = clock.minute;
  const today = entryFor(schedule, clock.weekday);
  if (today?.enabled) {
    if (today.all_day) return true;
    const open = parseMinute(today.open);
    const close = parseMinute(today.close, true);
    if (open !== null && close !== null) {
      if (open < close && minute >= open && minute < close) return true;
      if (open > close && (minute >= open || minute < close)) return true;
    }
  }
  const yesterday = entryFor(schedule, dayOffset(clock.weekday, -1));
  if (yesterday?.enabled && !yesterday.all_day) {
    const open = parseMinute(yesterday.open);
    const close = parseMinute(yesterday.close, true);
    if (open !== null && close !== null && open > close && minute < close) return true;
  }
  return false;
}

function nextOpening(schedule: DeliveryWeeklySchedule, clock: LocalClock) {
  const todayOrdinal = Math.floor(Date.UTC(clock.year, clock.month - 1, clock.day) / 86_400_000);
  const current = todayOrdinal * 1440 + clock.minute;
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = dayOffset(clock.weekday, offset);
    const entry = entryFor(schedule, day);
    if (!entry?.enabled) continue;
    const openingMinute = entry.all_day ? 0 : parseMinute(entry.open);
    if (openingMinute === null) continue;
    const candidate = (todayOrdinal + offset) * 1440 + openingMinute;
    if (candidate <= current) continue;
    const label = offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : new Intl.DateTimeFormat("en-IN", { timeZone: DELIVERY_TIMEZONE, weekday: "long" }).format(new Date(Date.UTC(clock.year, clock.month - 1, clock.day + offset, 12)));
    return `${label}, ${formatTime(openingMinute)}`;
  }
  return null;
}

export function evaluateDeliverySchedule(schedule: DeliveryWeeklySchedule, now: Date = new Date()) {
  const clock = localClock(now);
  const entry = entryFor(schedule, clock.weekday);
  const todayHours = todayWindow(entry);
  const available = isOpenAt(schedule, clock);
  return {
    available,
    todayHours,
    nextOpening: available ? null : nextOpening(schedule, clock),
    reason: available ? "available" as const : entry?.enabled ? "outside_hours" as const : "closed_today" as const,
  };
}

function modeSchedule(settings: DeliveryOperatingSettings, zone: DeliveryScheduleZone, method: DeliveryModeId) {
  return method === "blitz"
    ? zone.blitz_schedule_override ?? settings.blitz_weekly_schedule
    : zone.standard_schedule_override ?? settings.standard_weekly_schedule;
}

export function deliveryAvailabilityDecision(zone: DeliveryScheduleZone, settings: DeliveryOperatingSettings, method: DeliveryModeId, now: Date = new Date()): DeliveryAvailabilityDecision {
  const globalEnabled = method === "blitz" ? settings.blitz_enabled : settings.standard_enabled;
  const pinEnabled = method === "blitz" ? zone.blitz_enabled : zone.standard_enabled;
  const paused = method === "blitz" ? settings.blitz_paused : settings.standard_paused;
  const zoneIsActive = zone.is_active ?? zone.is_serviceable ?? false;
  const schedule = modeSchedule(settings, zone, method);
  const scheduled = evaluateDeliverySchedule(schedule, now);
  if (!globalEnabled) return { ...scheduled, available: false, reason: "globally_disabled" };
  if (!zoneIsActive || !pinEnabled) return { ...scheduled, available: false, reason: "pin_disabled" };
  if (paused) return { ...scheduled, available: false, reason: "temporarily_paused" };
  if (!settings.automatic_scheduling) return { ...scheduled, available: true, reason: "available" };
  return scheduled;
}

export function availableScheduledDeliveryMethods(zone: DeliveryScheduleZone, settings: DeliveryOperatingSettings, now: Date = new Date()) {
  return availableDeliveryMethods(zone).filter((method) => deliveryAvailabilityDecision(zone, settings, method.id, now).available);
}

export function formatAvailabilityNotice(zone: DeliveryScheduleZone, settings: DeliveryOperatingSettings, now: Date = new Date()) {
  const describe = (method: DeliveryModeId) => {
    const decision = deliveryAvailabilityDecision(zone, settings, method, now);
    const name = method === "blitz" ? "Blitz Delivery" : "Standard Delivery";
    if (decision.available) return `${name} is currently available.`;
    if (decision.reason === "temporarily_paused") return `${name} is temporarily paused.`;
    if (decision.reason === "globally_disabled") return `${name} is currently turned off.`;
    if (decision.reason === "pin_disabled") return `${name} is not enabled for this PIN code.`;
    if (decision.reason === "closed_today") return `${name} is not scheduled for today.`;
    if (decision.reason === "outside_hours") return `${name} is available between ${decision.todayHours}.`;
    return `${name} is unavailable right now.`;
  };
  return `${describe("blitz")} ${describe("standard")}`;
}

export function summarizeDeliverySchedule(method: DeliveryModeId, settings: DeliveryOperatingSettings, zones: DeliveryScheduleZone[], now: Date = new Date()) {
  const schedule = method === "blitz" ? settings.blitz_weekly_schedule : settings.standard_weekly_schedule;
  const globalEnabled = method === "blitz" ? settings.blitz_enabled : settings.standard_enabled;
  const paused = method === "blitz" ? settings.blitz_paused : settings.standard_paused;
  const openPins = zones.filter((zone) => deliveryAvailabilityDecision(zone, settings, method, now).available).length;
  const enabledPins = zones.filter((zone) => (zone.is_active ?? zone.is_serviceable ?? false) && (method === "blitz" ? zone.blitz_enabled : zone.standard_enabled)).length;
  const scheduled = evaluateDeliverySchedule(schedule, now);
  const status = !globalEnabled ? "Disabled" : paused ? "Temporarily paused" : openPins ? "Available" : settings.automatic_scheduling && !scheduled.available ? "Outside operating hours" : enabledPins ? "Unavailable" : "No enabled PIN codes";
  return { status, openPins, enabledPins, todayHours: scheduled.todayHours, nextOpening: settings.automatic_scheduling ? scheduled.nextOpening : null };
}

export function defaultDeliveryWeeklySchedule(allDay = false): DeliveryWeeklySchedule {
  return Object.fromEntries(DELIVERY_DAYS.map((day) => [day, {
    enabled: true,
    all_day: allDay,
    open: allDay ? "00:00" : "10:00",
    close: allDay ? "23:59" : "22:00",
  }])) as DeliveryWeeklySchedule;
}
