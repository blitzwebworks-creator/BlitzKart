import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const directory = path.dirname(fileURLToPath(import.meta.url));
const compile = (relativePath) => {
  const source = fs.readFileSync(path.join(directory, "..", relativePath), "utf8");
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
};
const deliveryModule = { exports: {} };
new Function("module", "exports", compile("lib/delivery.ts"))(deliveryModule, deliveryModule.exports);
const operatingModule = { exports: {} };
new Function("module", "exports", "require", compile("lib/delivery-operating-hours.ts"))(
  operatingModule,
  operatingModule.exports,
  (specifier) => {
    if (specifier === "@/lib/delivery") return deliveryModule.exports;
    throw new Error(`Unexpected module: ${specifier}`);
  },
);
const { availableScheduledDeliveryMethods, defaultDeliveryWeeklySchedule, deliveryAvailabilityDecision, evaluateDeliverySchedule, formatAvailabilityNotice } = operatingModule.exports;

const settings = {
  timezone: "Asia/Kolkata",
  blitz_enabled: true,
  standard_enabled: true,
  automatic_scheduling: true,
  blitz_paused: false,
  standard_paused: false,
  blitz_weekly_schedule: defaultDeliveryWeeklySchedule(false),
  standard_weekly_schedule: defaultDeliveryWeeklySchedule(true),
};
const zone = {
  postal_code: "110001",
  is_active: true,
  blitz_enabled: true,
  standard_enabled: true,
  blitz_price: 65,
  standard_price: 50,
  blitz_eta: "Same Day",
  standard_eta: "2–4 Days",
};
const at = (hour, minute) => new Date(Date.UTC(2026, 10, 16, hour, minute)); // Monday in Asia/Kolkata.

assert.deepEqual(availableScheduledDeliveryMethods(zone, settings, at(4, 29)).map(({ id }) => id), ["standard"]);
assert.deepEqual(availableScheduledDeliveryMethods(zone, settings, at(4, 30)).map(({ id }) => id), ["blitz", "standard"]);
assert.deepEqual(availableScheduledDeliveryMethods(zone, settings, at(16, 29)).map(({ id }) => id), ["blitz", "standard"]);
assert.deepEqual(availableScheduledDeliveryMethods(zone, settings, at(16, 30)).map(({ id }) => id), ["standard"]);
assert.match(formatAvailabilityNotice(zone, settings, at(16, 30)), /Blitz Delivery is available between 10:00 am–10:00 pm/i);
assert.match(formatAvailabilityNotice(zone, settings, at(16, 30)), /Standard Delivery is currently available/i);

assert.equal(deliveryAvailabilityDecision(zone, { ...settings, blitz_enabled: false }, "blitz", at(6, 0)).reason, "globally_disabled");
assert.equal(deliveryAvailabilityDecision(zone, { ...settings, blitz_paused: true }, "blitz", at(6, 0)).reason, "temporarily_paused");
assert.equal(deliveryAvailabilityDecision({ ...zone, blitz_enabled: false }, settings, "blitz", at(6, 0)).reason, "pin_disabled");
assert.deepEqual(availableScheduledDeliveryMethods({ ...zone, is_active: false }, settings, at(6, 0)), []);

const extended = { ...settings, blitz_weekly_schedule: defaultDeliveryWeeklySchedule(false) };
extended.blitz_weekly_schedule.mon = { enabled: true, all_day: false, open: "09:00", close: "23:00" };
assert.equal(deliveryAvailabilityDecision(zone, extended, "blitz", at(3, 30)).available, true);
const pinOverride = { ...zone, blitz_schedule_override: { ...settings.blitz_weekly_schedule, mon: { enabled: false, all_day: false, open: "10:00", close: "22:00" } } };
assert.equal(deliveryAvailabilityDecision(pinOverride, settings, "blitz", at(6, 0)).reason, "closed_today");

const weekdaysClosed = defaultDeliveryWeeklySchedule(false);
weekdaysClosed.mon = { enabled: false, all_day: false, open: "10:00", close: "22:00" };
assert.equal(evaluateDeliverySchedule(weekdaysClosed, at(6, 0)).available, false);
assert.equal(deliveryAvailabilityDecision(zone, { ...settings, automatic_scheduling: false }, "blitz", at(20, 30)).available, true);

const overnight = defaultDeliveryWeeklySchedule(false);
overnight.sun = { enabled: true, all_day: false, open: "20:00", close: "02:00" };
overnight.mon = { enabled: false, all_day: false, open: "10:00", close: "22:00" };
assert.equal(evaluateDeliverySchedule(overnight, new Date("2026-11-15T19:00:00Z")).available, true); // Mon 12:30 AM IST.
assert.equal(evaluateDeliverySchedule(settings.blitz_weekly_schedule, new Date("2026-11-15T19:00:00Z")).available, false);

console.log("Delivery operating hours checks passed (Asia/Kolkata boundaries, global and PIN switches, pauses, overrides, weekly closures, overnight windows and auto-scheduling).");
