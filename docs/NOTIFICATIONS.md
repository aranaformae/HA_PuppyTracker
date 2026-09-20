# Notifications

Puppy Tracker can create Home Assistant persistent notifications and send
tagged messages to configured `notify.*` targets. Notification delivery is a
view of current monitoring, reminder and care state; turning notifications off
does not stop schedules, dossier completion or dashboard attention items.

## Configure notifications

Open **Settings -> Devices & services -> Puppy Tracker -> Configure ->
Notifications**. The available preferences include:

- general Puppy Tracker notifications;
- default notification lead time;
- recurring-reminder notification delivery;
- configured `notify.*` targets;
- optional recovery and completed-session messages;
- a test-notification action.

The default lead time is used when a recurring reminder or care program leaves
its own **Notify before** value empty. Per-item values accept 0 through 10080
minutes. A value of 0 waits until the due time.

## What becomes actionable

- Weight monitoring follows the configured monitoring and weighing thresholds.
- A recurring reminder becomes `due_soon` inside its lead-time window and
  `overdue` after the deadline.
- A clocked care occurrence can become `due_soon`, then `due_today` at its
  scheduled local time, and `overdue` after it passes.
- An unclocked age-based occurrence is due for its complete local calendar day.

Care-program delivery requires both the general Puppy Tracker notification
setting and the program's own notification setting. Related occurrences for
several puppies are grouped when possible. Day-specific instructions are
included in persistent and mobile care notifications.

The `counts_for_attention` care-program option only controls the Attention
card. It does not remove the occurrence from Care Execution and does not hide
independent weight warnings.

## Clearing resolved messages

Puppy Tracker uses stable notification tags. When an item is completed,
disabled, deleted or no longer belongs to an active puppy/litter, the
integration dismisses its Home Assistant persistent notification and sends a
clear command to compatible configured mobile targets. Disabling a notification
category also clears active tagged messages from that category.

A clear command is sent only for a notification that Puppy Tracker tracked as
active. This avoids repeated clear service calls for future, disabled or
already completed items.

When recovery messages are enabled, a resolved warning may be replaced by a
recovery message under the same tag.

## Update and restart behaviour

Dashboard changes request an immediate notification reconciliation. If another
update arrives while a check is already running, one follow-up run is queued so
the transition is not delayed until the periodic check. A periodic check still
runs approximately every ten minutes as a safety net.

Care mobile-delivery deduplication is runtime-only. An unresolved care message
may therefore be delivered again after Home Assistant or the integration is
restarted. Schedules and recorded results remain authoritative and persistent.

## Safe test workflow

1. Leave automatic recurring-reminder delivery disabled.
2. Verify due state and completion on the dashboard.
3. Configure the desired `notify.*` targets.
4. Use **Send test notification**.
5. Enable automatic delivery when the test arrives correctly.

The test action does not create, complete, postpone or otherwise modify a
reminder, care occurrence or dossier entry. Delivery/configuration failures are
reported to the options flow.

Implementation details and state ownership are documented in
[Architecture](ARCHITECTURE.md#notification-architecture).
