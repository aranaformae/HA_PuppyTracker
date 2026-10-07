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

The temporary input and active session are runtime controls. Recorded weights
are persisted only after the save action succeeds.

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
  father: Cooper
```

`name` is required. Birth date and parent names are optional. For full mother
profile management, use the integration configuration so an existing mother
identity can be selected instead of relying only on a display name.

### Add a puppy

```yaml
action: puppy_tracker.add_puppy
data:
  litter_id: 00000000-0000-0000-0000-000000000000
  name: Rood
  collar_color: rood
  sex: female
  birth_weight: 365
  birth_time: "2026-10-01T14:32:00+02:00"
  chip_number: "528000000000000"
  profile_note: Rustige start
```

`litter_id` and `name` are required. Birth weight is in grams. Sex accepts
`male` or `female`. Keep a chip number as text so leading zeroes are preserved.

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
