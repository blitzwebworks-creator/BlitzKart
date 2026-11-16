"use client";

import { useEffect, useState } from "react";
import { Check, Clock3, MapPin, PauseCircle, RotateCcw, Save, Truck, Zap } from "lucide-react";
import { resetDeliveryOperatingHoursAction, updateDeliveryOperatingHoursAction, updateDeliveryScheduleOverrideAction } from "@/lib/actions/admin";
import { DELIVERY_DAYS, type DeliveryDay, type DeliveryOperatingSettings, type DeliveryScheduleZone, type DeliveryWeeklySchedule } from "@/lib/delivery-operating-hours";

const dayLabels: Record<DeliveryDay, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
type Mode = "blitz" | "standard";
type Summary = { status: string; openPins: number; enabledPins: number; todayHours: string; nextOpening: string | null };

function ScheduleEditor({ title, mode, schedule, onChange }: {
  title: string; mode: Mode; schedule: DeliveryWeeklySchedule; onChange: (next: DeliveryWeeklySchedule) => void;
}) {
  return <fieldset className={`operating-schedule-editor operating-schedule-${mode}`}>
    <legend>{mode === "blitz" ? <Zap size={17}/> : <Truck size={17}/>} {title}</legend>
    <div className="operating-week-grid">{DELIVERY_DAYS.map((day) => {
      const entry = schedule[day];
      const update = (changes: Partial<typeof entry>) => onChange({ ...schedule, [day]: { ...entry, ...changes } });
      return <div className="operating-day-row" key={day}>
        <label className="operating-day-toggle"><input type="checkbox" checked={entry.enabled} onChange={(event) => update({ enabled: event.target.checked })}/><span>{dayLabels[day]}</span></label>
        <label className="operating-all-day"><input type="checkbox" checked={entry.all_day} disabled={!entry.enabled} onChange={(event) => update({ all_day: event.target.checked })}/><span>24/7</span></label>
        <label className="operating-time-field"><span className="sr-only">{dayLabels[day]} opening time</span><input type="time" value={entry.open} disabled={!entry.enabled || entry.all_day} onChange={(event) => update({ open: event.target.value })}/></label>
        <span className="operating-time-dash" aria-hidden="true">to</span>
        <label className="operating-time-field"><span className="sr-only">{dayLabels[day]} closing time</span><input type="time" value={entry.close === "24:00" ? "23:59" : entry.close} disabled={!entry.enabled || entry.all_day} onChange={(event) => update({ close: event.target.value })}/></label>
      </div>;
    })}</div>
    <p className="operating-editor-note">Times use Asia/Kolkata. A closing time earlier than opening means delivery continues past midnight.</p>
  </fieldset>;
}

function StatusCard({ title, mode, summary, paused }: { title: string; mode: Mode; summary: Summary; paused: boolean }) {
  const Icon = mode === "blitz" ? Zap : Truck;
  const active = summary.status === "Available";
  return <article className={`operating-status-card operating-status-${mode}`}>
    <div className="operating-status-top"><span className="operating-status-icon"><Icon size={21}/></span><span className={`operating-state-pill${active ? " is-open" : " is-closed"}`}><i/> {summary.status}</span></div>
    <h3>{title}</h3>
    <p><Clock3 size={15}/> Today: <strong>{summary.todayHours}</strong></p>
    {paused ? <p className="operating-warning"><PauseCircle size={15}/> Temporary pause is active.</p> : summary.nextOpening ? <p><Clock3 size={15}/> Next opening: <strong>{summary.nextOpening}</strong></p> : <p><Check size={15}/> The configured schedule is open now.</p>}
    <small>{summary.openPins} PIN codes available now · {summary.enabledPins} enabled for this method</small>
  </article>;
}

export function DeliveryOperatingHoursManager({ settings, pincodes, blitzSummary, standardSummary }: {
  settings: DeliveryOperatingSettings;
  pincodes: DeliveryScheduleZone[];
  blitzSummary: Summary;
  standardSummary: Summary;
}) {
  const [blitzSchedule, setBlitzSchedule] = useState(settings.blitz_weekly_schedule);
  const [standardSchedule, setStandardSchedule] = useState(settings.standard_weekly_schedule);
  const [selectedPin, setSelectedPin] = useState(pincodes[0]?.postal_code ?? "");
  const [blitzOverrideEnabled, setBlitzOverrideEnabled] = useState(false);
  const [standardOverrideEnabled, setStandardOverrideEnabled] = useState(false);
  const [blitzOverride, setBlitzOverride] = useState(settings.blitz_weekly_schedule);
  const [standardOverride, setStandardOverride] = useState(settings.standard_weekly_schedule);
  const pin = pincodes.find((row) => row.postal_code === selectedPin);

  useEffect(() => {
    setBlitzSchedule(settings.blitz_weekly_schedule);
    setStandardSchedule(settings.standard_weekly_schedule);
  }, [settings.blitz_weekly_schedule, settings.standard_weekly_schedule]);

  useEffect(() => {
    setBlitzOverrideEnabled(Boolean(pin?.blitz_schedule_override));
    setStandardOverrideEnabled(Boolean(pin?.standard_schedule_override));
    setBlitzOverride(pin?.blitz_schedule_override ?? settings.blitz_weekly_schedule);
    setStandardOverride(pin?.standard_schedule_override ?? settings.standard_weekly_schedule);
  }, [pin, settings.blitz_weekly_schedule, settings.standard_weekly_schedule]);

  return <div className="delivery-operating-workspace">
    <section className="operating-status-grid" aria-label="Live delivery status">
      <StatusCard title="Blitz Delivery Status" mode="blitz" summary={blitzSummary} paused={settings.blitz_paused}/>
      <StatusCard title="Standard Delivery Status" mode="standard" summary={standardSummary} paused={settings.standard_paused}/>
    </section>

    <form action={updateDeliveryOperatingHoursAction} className="panel operating-settings-panel">
      <div className="operating-panel-heading"><div><span className="section-kicker">GLOBAL DELIVERY CONTROLS</span><h2>Operating hours</h2><p>PIN-level delivery switches still apply. Schedules are evaluated on the server in Asia/Kolkata.</p></div><span className="operating-timezone"><Clock3 size={15}/> Asia/Kolkata</span></div>
      <div className="operating-global-switches">
        <label className="operating-switch-card"><input type="checkbox" name="blitz_enabled" defaultChecked={settings.blitz_enabled}/><span><Zap size={18}/><strong>Blitz Delivery</strong><small>Global master switch</small></span></label>
        <label className="operating-switch-card"><input type="checkbox" name="standard_enabled" defaultChecked={settings.standard_enabled}/><span><Truck size={18}/><strong>Standard Delivery</strong><small>Global master switch</small></span></label>
        <label className="operating-switch-card"><input type="checkbox" name="automatic_scheduling" defaultChecked={settings.automatic_scheduling}/><span><Clock3 size={18}/><strong>Automatic scheduling</strong><small>Use each method’s weekly hours</small></span></label>
        <label className={`operating-switch-card operating-pause-switch${settings.blitz_paused ? " is-paused" : ""}`}><input type="checkbox" name="blitz_paused" defaultChecked={settings.blitz_paused}/><span><PauseCircle size={18}/><strong>Pause Blitz temporarily</strong><small>Overrides schedules and PINs until resumed</small></span></label>
        <label className={`operating-switch-card operating-pause-switch${settings.standard_paused ? " is-paused" : ""}`}><input type="checkbox" name="standard_paused" defaultChecked={settings.standard_paused}/><span><PauseCircle size={18}/><strong>Pause Standard temporarily</strong><small>Independent of the Blitz pause</small></span></label>
      </div>
      <input type="hidden" name="blitz_weekly_schedule" value={JSON.stringify(blitzSchedule)}/>
      <input type="hidden" name="standard_weekly_schedule" value={JSON.stringify(standardSchedule)}/>
      <div className="operating-schedule-grid">
        <ScheduleEditor title="Blitz Delivery schedule" mode="blitz" schedule={blitzSchedule} onChange={setBlitzSchedule}/>
        <ScheduleEditor title="Standard Delivery schedule" mode="standard" schedule={standardSchedule} onChange={setStandardSchedule}/>
      </div>
      <p className="operating-priority-note">Availability priority: global method switch → PIN serviceability and method switch → PIN schedule override (if set) or global weekly schedule → temporary pause. Turning automatic scheduling off ignores opening/closing times but still respects switches and pauses.</p>
      <div className="operating-form-actions"><button className="btn btn-outline" type="submit" formAction={resetDeliveryOperatingHoursAction} onClick={(event) => { if (!window.confirm("Restore default schedules and clear every PIN-specific schedule override?")) event.preventDefault(); }}><RotateCcw size={16}/> Reset to Default</button><button className="btn" type="submit"><Save size={16}/> Save Changes</button></div>
    </form>

    <form action={updateDeliveryScheduleOverrideAction} className="panel operating-pin-panel">
      <div className="operating-panel-heading"><div><span className="section-kicker">PIN-BASED OVERRIDES</span><h2>Customize a location</h2><p>Leave a method set to “Use global” to inherit the weekly schedule above. Existing PIN enable switches and fees stay in PIN code management.</p></div><MapPin size={24}/></div>
      <label className="field operating-pin-select"><span>Delhi PIN code</span><select name="postal_code" value={selectedPin} onChange={(event) => setSelectedPin(event.target.value)} required>{pincodes.map((row) => <option key={row.postal_code} value={row.postal_code}>{row.postal_code} · {row.locality}</option>)}</select></label>
      {pin ? <div className="operating-pin-current"><span className={`status ${pin.is_active && pin.blitz_enabled ? "status-paid" : "status-pending"}`}>Blitz {pin.is_active && pin.blitz_enabled ? "enabled" : "disabled"}</span><span className={`status ${pin.is_active && pin.standard_enabled ? "status-paid" : "status-pending"}`}>Standard {pin.is_active && pin.standard_enabled ? "enabled" : "disabled"}</span></div> : null}
      <div className="operating-override-grid">
        <section className="operating-override-section"><label className="operating-override-toggle"><input type="checkbox" name="blitz_override_enabled" checked={blitzOverrideEnabled} onChange={(event) => { setBlitzOverrideEnabled(event.target.checked); if (event.target.checked && !pin?.blitz_schedule_override) setBlitzOverride(settings.blitz_weekly_schedule); }}/><span><Zap size={17}/> Override Blitz hours for this PIN</span></label><input type="hidden" name="blitz_weekly_schedule" value={JSON.stringify(blitzOverride)}/><ScheduleEditor title="PIN-specific Blitz hours" mode="blitz" schedule={blitzOverride} onChange={setBlitzOverride}/></section>
        <section className="operating-override-section"><label className="operating-override-toggle"><input type="checkbox" name="standard_override_enabled" checked={standardOverrideEnabled} onChange={(event) => { setStandardOverrideEnabled(event.target.checked); if (event.target.checked && !pin?.standard_schedule_override) setStandardOverride(settings.standard_weekly_schedule); }}/><span><Truck size={17}/> Override Standard hours for this PIN</span></label><input type="hidden" name="standard_weekly_schedule" value={JSON.stringify(standardOverride)}/><ScheduleEditor title="PIN-specific Standard hours" mode="standard" schedule={standardOverride} onChange={setStandardOverride}/></section>
      </div>
      <div className="operating-form-actions"><button className="btn" type="submit"><Save size={16}/> Save PIN Overrides</button></div>
    </form>
  </div>;
}
