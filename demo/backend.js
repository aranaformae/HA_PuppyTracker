// Fictional, in-memory data only. This module has no network or storage access.
export const DEMO_COMMANDS = [
  "config/entity_registry/list", "config/device_registry/list", "puppy_tracker/subscribe",
  "puppy_tracker/litters", "puppy_tracker/data", "puppy_tracker/measurements",
  "puppy_tracker/records", "puppy_tracker/record/add", "puppy_tracker/record/update",
  "puppy_tracker/record/delete", "puppy_tracker/record/restore", "puppy_tracker/upcoming",
  "puppy_tracker/mother/records", "puppy_tracker/mother/record/add",
  "puppy_tracker/mother/record/update", "puppy_tracker/mother/record/delete",
  "puppy_tracker/mother/record/restore", "puppy_tracker/recurring_reminders",
  "puppy_tracker/care_occurrences", "puppy_tracker/care_occurrence/record",
  "puppy_tracker/attention_acknowledgements", "puppy_tracker/feeding_settings/update",
  "puppy_tracker/export",
];

export class DemoBackend {
  constructor() {
    this.listeners = new Set();
    this.now = Date.now();
    this.revision = 0;
    this.birth = new Date(this.now - 14 * 86400000).toISOString();
    this.litter = { id: "demo-litter", name: "Voorbeeldnest · Example litter", active: true,
      birth_date: this.birth.slice(0, 10), mother: "Demo mother", mother_id: "demo-mother", records: [] };
    this.puppies = [["p1", "Nova", "paars", 400], ["p2", "Milo", "blauw", 420], ["p3", "Pip", "rood", 380]].map(([id, name, collar_color, birth_weight]) => ({
      id, name, collar_color, birth_weight, birth_time: this.birth, active: true, records: [],
      measurements: Array.from({ length: 15 }, (_, day) => ({ id: `${id}-${day}`, kind: day ? "weight" : "birth",
        weight: birth_weight + day * 60, timestamp: new Date(this.now - (14 - day) * 86400000).toISOString(), deleted: false })),
    }));
    this.motherRecords = [];
    this.puppies[0].records.push({ id: "demo-note", type: "note", scope: "puppy", puppy_id: "p1",
      litter_id: this.litter.id, title: "Kennismaken · Getting to know you", note: "Dit zijn verzonnen gegevens. These are fictional records.",
      occurred_at: new Date(this.now - 3600000).toISOString(), data: {}, deleted: false });
    const today = new Date(this.now).toLocaleDateString("sv-SE");
    this.occurrences = this.puppies.map((puppy) => ({ id: `ens-${puppy.id}`, program_id: "demo-ens", title: "ENS · Demo",
      litter_id: this.litter.id, puppy_id: puppy.id, puppy_name: puppy.name, collar_color: puppy.collar_color,
      age_days: 14, scheduled_date: today, scheduled_at: new Date(this.now).toISOString(),
      status: "due_today", days_until_due: 0, record_type: "test", result_fields: ["note"],
      instructions: "Lees de instructies en noteer je observatie. Read the instructions and record your observation.",
      instructions_for_day: "Oefenvoorbeeld: rustig contact. Practice example: calm contact." }));
    this.devices = [{ id: "demo-litter-device", identifiers: [["puppy_tracker", `litter_${this.litter.id}`]], name: this.litter.name }];
    this.entities = [];
    this.states = {};
    for (const puppy of this.puppies) {
      const device = `device-${puppy.id}`;
      this.devices.push({ id: device, name: puppy.name, identifiers: [["puppy_tracker", `puppy_${puppy.id}`]], via_device_id: "demo-litter-device" });
      const weight = puppy.measurements.at(-1).weight;
      for (const [suffix, state, attributes = {}] of [
        ["weight", weight, { unit_of_measurement: "g" }], ["birth_weight", puppy.birth_weight],
        ["previous_weight", weight - 60], ["weight_change", 60], ["growth_24h_percent", 60 / (weight - 60) * 100],
        ["growth_percentage", (weight / puppy.birth_weight - 1) * 100],
        ["status", "Goed", { status_code: "ok", needs_attention: false }], ["age", "14 d"],
        ["collar_color", puppy.collar_color], ["sex", puppy.id === "p2" ? "male" : "female"], ["birth_time", this.birth], ["last_weighed", new Date(this.now).toISOString()],
      ]) {
        const entity_id = `sensor.demo_${puppy.id}_${suffix}`;
        this.entities.push({ entity_id, unique_id: `${puppy.id}_${suffix}`, device_id: device, disabled_by: null });
        this.states[entity_id] = { entity_id, state: String(state), attributes, last_changed: new Date(this.now).toISOString(), last_updated: new Date(this.now).toISOString() };
      }
    }
  }

  subscribe(callback) { this.listeners.add(callback); return () => this.listeners.delete(callback); }
  notify() {
    this.revision++;
    queueMicrotask(() => { for (const listener of this.listeners) listener({ updated_at: String(this.revision) }); });
  }
  records(message) {
    if (message.type.includes("/mother/")) return this.motherRecords;
    if (message.puppy_id) {
      const puppy = this.puppies.find((p) => p.id === message.puppy_id);
      if (!puppy) throw Error("Unknown demo puppy");
      return puppy.records;
    }
    return this.litter.records;
  }

  async call(message) {
    if (message.litter_id && message.litter_id !== this.litter.id) throw Error("Unknown demo litter");
    let result;
    const command = message.type;
    if (command === "config/device_registry/list") result = this.devices;
    else if (command === "config/entity_registry/list") result = this.entities;
    else if (command === "puppy_tracker/litters") result = { litters: [this.litter] };
    else if (command === "puppy_tracker/data") result = { can_manage_records: true, updated_at: String(this.revision),
      litter: this.litter, puppies: this.puppies.map((p) => ({ ...p, summary: { current_weight: p.measurements.at(-1).weight,
        previous_weight: p.measurements.at(-2).weight, last_weighed: p.measurements.at(-1).timestamp,
        growth_since_birth_percent: (p.measurements.at(-1).weight / p.birth_weight - 1) * 100,
        status: { status_code: "ok", needs_attention: false } } })), summary: {} };
    else if (command === "puppy_tracker/measurements") result = { measurements: this.puppies.find((p) => p.id === message.puppy_id)?.measurements || [] };
    else if (command.endsWith("/records")) result = { can_manage_records: true, records: this.records(message).filter((r) => message.include_deleted || !r.deleted),
      owner: { id: "demo-mother", name: "Demo mother" } };
    else if (command === "puppy_tracker/upcoming") result = { actions: [] };
    else if (command === "puppy_tracker/recurring_reminders") result = { reminders: [] };
    else if (command === "puppy_tracker/attention_acknowledgements") result = { acknowledgements: {} };
    else if (command === "puppy_tracker/care_occurrences") result = { occurrences: this.occurrences, skipped: [], context: { total_programs: 1, enabled_programs: 1, active_puppies: 3 }, execution: {} };
    else if (command === "puppy_tracker/care_occurrence/record") {
      const item = this.occurrences.find((o) => o.id === message.occurrence_id && o.puppy_id === message.puppy_id);
      if (!item) throw Error("This demo action is already complete");
      const puppy = this.puppies.find((p) => p.id === item.puppy_id);
      const id = `demo-care-${++this.revision}`;
      puppy.records.push({ id, type: "test", scope: "puppy", puppy_id: puppy.id, litter_id: this.litter.id,
        title: item.title, note: message.note || "", occurred_at: new Date().toISOString(), deleted: false,
        data: { care_program_id: item.program_id, care_occurrence_id: item.id, care_status: message.status || "completed", care_instructions: item.instructions_for_day } });
      this.occurrences = this.occurrences.filter((o) => o !== item);
      this.notify();
      result = { record_id: id };
    } else if (command.includes("/record/")) {
      const records = this.records(message);
      const action = command.split("/").at(-1);
      if (action === "add") {
        const id = `demo-record-${++this.revision}`;
        const mother = command.includes("/mother/");
        records.push({ id, type: message.record_type, scope: mother ? "mother" : message.puppy_id ? "puppy" : "litter",
          puppy_id: message.puppy_id || null, litter_id: this.litter.id, title: message.title || "",
          note: message.note || "", data: message.data || {}, occurred_at: message.occurred_at || new Date().toISOString(), deleted: false });
        result = { record_id: id };
      } else {
        const record = records.find((r) => r.id === message.record_id);
        if (!record) throw Error("Unknown demo record");
        if (action === "delete" || action === "restore") record.deleted = action === "delete";
        else if (action === "update") {
          for (const key of ["title", "note", "data", "occurred_at"]) if (key in message) record[key] = message[key];
          if (message.record_type) record.type = message.record_type;
        } else throw Error("This action is not included in the demo");
        result = { record_id: record.id };
      }
      this.notify();
    } else if (command === "puppy_tracker/feeding_settings/update") {
      this.litter.feeding_settings = message.settings;
      result = { settings: message.settings };
      this.notify();
    } else throw Error("Deze functie zit niet in de demo. This feature is not included in the demo.");
    return structuredClone(result);
  }
}

export function createOfflineHass(backend, language) {
  return { language, locale: { language }, config: { time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    user: { id: "demo-user", is_admin: true, name: "Demo" }, states: backend.states, localize: () => "",
    connection: { subscribeMessage: async (callback, message) => {
      if (message.type !== "puppy_tracker/subscribe") throw Error("Unsupported demo subscription");
      return backend.subscribe(callback);
    } },
    callWS: (message) => backend.call(message),
    callService: async () => { throw Error("Home Assistant actions are not available in this demo"); },
  };
}
