# Home Assistant entities and actions

Puppy Tracker creates normal Home Assistant devices and entities in addition
to its dashboard cards. Use them in automations, templates and ordinary Home
Assistant cards. Entity IDs are assigned by Home Assistant and may differ
after renaming, so select entities from the UI instead of assuming an ID.

## Devices and entities

Open **Settings -> Devices & services -> Puppy Tracker** to see the devices
created for the integration.

### Weighing station

The **Puppy weighing station** device provides:

- litter and puppy selectors;
- a temporary weight input in grams;
- start, save and reset buttons;
- session status, progress and remaining-puppy sensors;
- the next and last weighed puppy;
- a user-facing session message.

The temporary input is runtime-only. Active-session checkpoints are persisted
with saved measurements and require explicit resume or close after a restart.
Native Start resumes an interrupted session; Reset closes it without deleting
saved weights. Dashboard administrators also have a two-minute Undo action for
the last station save. See [Weighing workflow](GROWTH_ANALYSIS.md#weighing-workflow).

### Litter devices

Every litter has summary entities for:

- overall status, active puppy count and attention count;
- average weight, lightest puppy and heaviest puppy;
- average normalized 24-hour growth;
- current weighing-session progress and next puppy;
- timestamp of the last fully completed weighing session;
- an attention binary sensor.

Litter summaries use active puppies and the same canonical metrics as the
Workspace cards.

### Puppy devices

Every puppy has entities for:

- current, birth and previous weight;
- difference from the previous measurement;
- growth since birth;
- normalized 24-hour growth in grams and percent;
- last weighing, status, collar colour, sex, birth time and age;
- an attention binary sensor with the monitoring reason in its attributes.

Archived puppies retain their historical data and devices but are excluded
from active operational lists where applicable.

### Other integration entities

- The **Puppy care** device exposes vaccination/deworming follow-up switches
  and the first follow-up lead time in days.
- Mother dogs are persistent Home Assistant devices so one mother identity can
  be linked to several litters. Their dossier is managed through Puppy Tracker
  cards rather than a separate sensor set.
- **Puppy Tracker last backup** reports `ok` or `error` and exposes the last
  backup time, path, scope, file count and error in its attributes.

## Home Assistant actions

The actions below are available under **Developer tools -> Actions** and from
automations. The UI shows selectors for their supported fields.

### Create a litter

```yaml
action: puppy_tracker.create_litter
data:
  name: Luna 2026
  birth_date: "2026-10-01"
  mother: Luna
  mother_registered_name: Milky Way Moonlight
  mother_birth_date: "2022-05-06"
  mother_breed: Multi-generation Australian Labradoodle
  mother_wala_number: WALA-MOTHER
  mother_chip_number: "000123456789012"
  father: Cooper
  father_registered_name: Doodle Cooper Star
  father_birth_date: "2021-02-03"
  father_breed: Multi-generation Australian Labradoodle
  father_wala_number: WALA-FATHER
  father_chip_number: "000987654321098"
```

`name` is required. Birth date and parent identity fields are optional. The
`mother` and `father` values are call names; `*_registered_name` stores the
official name. For full mother profile management, use the integration
configuration so an existing reusable mother identity can be selected.

### Add a puppy

```yaml
action: puppy_tracker.add_puppy
data:
  litter_id: 00000000-0000-0000-0000-000000000000
  name: Rood
  registered_name: Milky Way Aurora
  collar_color: rood
  coat_color: Caramel
  breed: Multi-generation Australian Labradoodle
  sex: female
  birth_weight: 365
  birth_time: "2026-10-01T14:32:00+02:00"
  chip_number: "528000000000000"
  profile_note: Rustige start
```

`litter_id` and call-name `name` are required. `registered_name` is the puppy's
official/nest name. Birth weight is in grams. Sex accepts `male` or `female`.
Keep a chip number as text so leading zeroes are preserved.

### Record a weight

```yaml
action: puppy_tracker.record_weight
data:
  litter_id: 00000000-0000-0000-0000-000000000000
  puppy_id: 11111111-1111-1111-1111-111111111111
  weight: 428
  timestamp: "2026-10-02T08:00:00+02:00"
  note: Ochtendweging
```

The weight is in grams. Leaving `timestamp` empty uses the current time. This
action uses the same storage and weighing-session update path as the dashboard,
including metric refresh and completion of an active session.

### Add a dossier entry

Choose **Puppy Tracker: Dossieritem toevoegen** under **Developer tools ->
Actions**. Select the literal owner scope: `litter`, `mother` or `puppy`.
For a puppy, also enter its ID from the selected litter. Leave `puppy_id`
empty for the whole litter or mother. The mother must be linked to that litter.

```yaml
action: puppy_tracker.add_dossier_record
data:
  litter_id: 00000000-0000-0000-0000-000000000000
  scope: puppy
  puppy_id: 11111111-1111-1111-1111-111111111111
  record_type: feeding
  title: Ochtendvoeding
  data:
    feeding_category: bottle
    amount: 30
    unit: ml
response_variable: saved_feeding
```

`record_type` uses the dossier category identifier, such as `note`, `feeding`,
`daily_care` or `medication`. `data` is optional for a note, while structured
types keep their normal validation (for example, Daily care needs `care_area`
and `observation`). Optional `occurred_at` takes a date and time; otherwise the
current time is used. Optional `followup_record_id` and `followup_due_date`
complete one existing dossier follow-up with a new entry. If the automation
requests a response, it receives `record_id`, `litter_id`, `scope` and
`puppy_id` (null for non-puppy scopes). The action is administrator-only when
called by a user; Home Assistant automations can invoke it without a user
context. It refreshes the same dashboard and entities as a card entry.

### Change or recover a dossier entry

Use **Dossieritem wijzigen**, **Dossieritem verwijderen** and **Dossieritem
herstellen** in Developer tools -> Actions. Pass the `record_id` returned by
the add action, the same `litter_id` and the item's exact `scope`. A puppy item
also needs its `puppy_id`.

```yaml
action: puppy_tracker.update_dossier_record
data:
  litter_id: 00000000-0000-0000-0000-000000000000
  scope: puppy
  puppy_id: 11111111-1111-1111-1111-111111111111
  record_id: 22222222-2222-2222-2222-222222222222
  note: Hoeveelheid gecontroleerd
  data:
    amount: 35
```

The update action requires at least one of `record_type`, `occurred_at`,
`title`, `note` or `data`. Omitted fields stay as they were. Keys in `data` are
merged with existing structured fields, so a small adjustment does not erase
the rest. Use the normal dossier validation for each category. Deleted items
must be restored before they can be changed. The delete action soft-deletes
the item; the restore action makes it visible again. Both take only the four
identifying fields from the example (`litter_id`, `scope`, optional `puppy_id`,
`record_id`). All three actions can return the record ID; delete and restore
also return the resulting `deleted` state. Like the add action, these actions
require an administrator when called by a user and work in automations without
a user context.

### React to a saved weight

Puppy Tracker emits `puppy_tracker_weight_recorded` after a successful new
weighing from the dashboard or the weight action. Its event data contains
`litter_id`, `puppy_id`, `measurement_id`, `weight_g` (grams) and `timestamp`
(ISO date and time). Corrections, deletions and failed saves do not emit this
event. For example:

```yaml
triggers:
  - trigger: event
    event_type: puppy_tracker_weight_recorded
actions:
  - action: logbook.log
    data:
      name: Puppy Tracker
      message: "Nieuwe weging: {{ trigger.event.data.weight_g }} g"
```

When the last puppy in an active weighing session is saved, Puppy Tracker also
emits `puppy_tracker_weighing_session_completed` once. It contains `litter_id`,
`session_id`, `completed_at` and `puppy_count`. These event names and listed
fields are the supported automation contract; internal dispatcher signals are
not public events.

### Back up to a file

```yaml
action: puppy_tracker.backup_to_file
data:
  path: backups/puppy-tracker/backup.json
  scope: full
  include_timestamp: true
  keep_last: 14
```

The path must remain inside the Home Assistant configuration directory and end
in `.json`. See [Backup, restore and transfer](backup-restore.md) for scopes,
rotation and restore safety.

## Internal litter and puppy IDs

Actions use stable Puppy Tracker UUIDs, not display names or Home Assistant
entity IDs. The safest way to inspect them is an exported JSON backup: litter
objects contain their `id`, and each nested puppy contains its own `id`. Do not
edit Home Assistant `.storage` files to obtain or change these values.

When possible, prefer the integration configuration and Workspace cards for
interactive management. Use the actions when another Home Assistant
automation or device provides the source event.

## Automation example

This example creates a rotating full backup every night:

```yaml
alias: Puppy Tracker nachtbackup
triggers:
  - trigger: time
    at: "03:15:00"
actions:
  - action: puppy_tracker.backup_to_file
    data:
      path: backups/puppy-tracker/backup.json
      scope: full
      include_timestamp: true
      keep_last: 14
mode: single
```

Monitor the backup-status sensor in a separate automation when a failed backup
must generate a notification.
