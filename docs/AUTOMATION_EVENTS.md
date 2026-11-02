# Automation events

Puppy Tracker exposes Home Assistant events for changes, independently of mobile
or persistent notification delivery. Use the existing cards and state entities
to inspect the current situation; events are not a replayable task inventory.

The existing `puppy_tracker_weight_recorded`,
`puppy_tracker_weighing_session_completed` and
`puppy_tracker_dossier_record_changed` contracts remain unchanged. See
[Home Assistant actions and entities](HOME_ASSISTANT.md#react-to-a-saved-weight).

## Care becomes due or stops being due

Event: **`puppy_tracker_care_due_changed`**

| Field | Meaning |
| --- | --- |
| `transition` | `due` or `cleared` |
| `source` | `care_program`, `recurring_reminder` or `dossier_followup` |
| `litter_id` | Stable litter ID |
| `owner_scope` | `puppy`, `mother` or `litter` |
| `owner_id` | Puppy, mother or litter ID for this scope; never a buyer/contact ID |
| `puppy_id` | Puppy ID, or null for mother/litter care |
| `due_at` | Scheduled due instant, UTC ISO datetime |
| `timestamp` | When the transition was observed, UTC ISO datetime |

Source-specific fields are present only for their source:

- care program: `program_id` and `occurrence_id`;
- recurring reminder: `reminder_id`;
- dossier follow-up: `record_id`, identifying the original item with the due date.

A care program with an explicit time becomes due at that time. An age-day
program without an explicit time becomes due at HA local midnight of that day,
matching the Care workflow. A dossier follow-up becomes due on its calendar
date, also at HA local midnight. Recurring reminders follow their existing
once, interval or fixed-times calculation, including postponement. Notification
lead times do not make these events fire early.

Open overdue work remains due. Rechecking it or changing from today to overdue
does not emit another event. Completion/missed execution, disabling, deleting,
archiving an owner, postponing or moving a schedule into the future can emit
`cleared`. **Cleared means the old scheduled item is no longer due, not proof
that care was carried out.** Use dossier-change events when that distinction
matters. Changing the scheduled identity can clear the old moment and, if
already due, announce the replacement. Undoing an execution can make work due
again. A recurring reminder's next moment has its own `due_at` identity.

Example: react once when care becomes due. Add `source`, `owner_scope`,
`litter_id`, `program_id` or `reminder_id` to `event_data` to narrow the selection.

```yaml
alias: Puppy Tracker - care due
triggers:
  - trigger: event
    event_type: puppy_tracker_care_due_changed
    event_data:
      transition: due
actions:
  - action: persistent_notification.create
    data:
      title: Puppy Tracker
      message: Care is due. Open the Care card to check and carry it out.
```

This example creates an independent notification; Puppy Tracker cannot withdraw
notifications created by your own automation. Handle `transition: cleared` in
that automation if you want to remove its notification or reset a device.

## Puppy attention starts, changes or clears

Event: **`puppy_tracker_puppy_attention_changed`**

| Field | Meaning |
| --- | --- |
| `transition` | `started`, `changed` or `cleared` |
| `litter_id`, `puppy_id` | Stable identity of the affected puppy |
| `reason_codes` | Sorted current reasons; empty when cleared |
| `previous_reason_codes` | Reasons before the change; empty when started |
| `care_due_count` | Due care-program occurrences that count for attention |
| `dossier_due_count` | Due follow-ups belonging to this puppy |
| `timestamp` | Observation time, UTC ISO datetime |

Weight reasons reuse canonical monitoring codes: `no_measurement`, `weigh_due`,
`first_day_excess_weight_loss`, `weight_loss` or `low_growth`. `care_due` adds
program occurrences whose **Counts for attention** setting is enabled.
`dossier_followup_due` adds the puppy's own due dossier follow-ups. Generic
reminders emit care events but are not added to this attention aggregate.
Mother/litter work is not attributed to every puppy.

Changing reasons or either due count emits `changed` while attention remains
active. Solving only a care item cannot clear an unresolved weight concern.
Disabling a program's attention setting excludes its count, without disabling
its care event. Acknowledging/hiding an item in a card does not resolve its
underlying condition. Inactive/deleted pups or litters leave this aggregate and
emit one clear if they previously needed attention.

```yaml
alias: Puppy Tracker - puppy attention
triggers:
  - trigger: event
    event_type: puppy_tracker_puppy_attention_changed
    event_data:
      transition: started
actions:
  - action: logbook.log
    data:
      name: Puppy Tracker
      message: "Puppy {{ trigger.event.data.puppy_id }} needs attention."
```

## Timing, restart and privacy

- Confirmed data changes schedule a check; updates during a check are coalesced
  into another pass. A one-minute timer also checks time-based transitions when
  nobody opens a card. HA local midnight refreshes still apply. Observation may
  therefore follow a due instant by up to one check interval, plus HA load.
- Events use committed state across all stores. They wait for writes/restores
  to finish and do not publish temporary results from a failed save or rollback.
- Initial setup/reload silently establishes a baseline. Existing due work or
  attention is not replayed. Unloading does not pretend that active work was
  completed by emitting clears.
- A successful full or partial backup import silently replaces the baseline;
  a failed import retains the previous baseline. Imports are not a batch of new
  real-world tasks. No event history or deduplication state is added to backups.
- A backward UTC clock correction silently resets the baseline. Later changes
  are observed from that point. Normal DST folds are not UTC clock reversals;
  fixed-times reminders reuse their existing gap/fold resolution.
- Global/mobile notification preferences do not switch these events off. Program
  or reminder enablement and owner activity do affect the canonical work.
- Payloads contain identifiers, scheduling instants, generic reason codes and
  counts. They exclude names, free-text notes, day instructions, clinical
  results, medication/doses, measurements and buyer/contact/payment information.
  Treat identifiers and the event bus as private operational information.
