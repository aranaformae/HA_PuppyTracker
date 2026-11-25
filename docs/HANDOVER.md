# Prepare a puppy handover

Open the **Puppies** tab in Workspace's Nest view and choose **Handover** beside
the puppy. The same action is available for the selected puppy in the growth
overview. No extra dashboard card or YAML setting is needed. An administrator
can edit; other dashboard readers see the status in the litter overview.

## Puppy status and owners

Before a final owner is linked, choose **Available**, **On hold** or **Reserved**.
Once owners are linked on the Owners card, the puppy shows **Assigned**
automatically. Removing all links restores the saved planning status. Mark
**Departed** and enter the actual departure date when the puppy leaves.

The expected pickup date, owner placement status and payments remain on the
Owners card. They are not overwritten by a handover. Linking another owner does
not reset the puppy's checklist or departure history: review those confirmations
when making a new arrangement. Use the existing call-name field when renaming a
puppy; there is no second buyer-requested name field.

## Checklist

The eleven checks cover the chip, registration, vaccination, deworming, puppy
test, vet check, contract, food/instructions, passport, dossier/report and
departure weight. Each starts unchecked. Tick an item after checking it yourself;
a vaccination note, generated contract or PDF download never ticks it for you.
The form shows the chip number and latest known weight/time as reference data;
these are not an automatically recorded departure weight. Record that weighing
through the ordinary weighing workflow.

The status shows completed checks out of eleven. Remaining unchecked items stay
visible. You can save progress at any time. Departing with an incomplete
checklist requires explicit confirmation. The departure date cannot be before
birth or after today. This date is distinct from the owner's expected pickup date.

Departure does not archive a puppy, finish care programs or disable weight
warnings. Those existing controls remain independent.

## Correct a departure

Reopen Handover to correct the date or choose a planning/assigned status to clear
it. The dossier shows one **Departed** milestone derived from the date. Its
Handover button opens the original workflow; it cannot be edited, deleted or
moved as an ordinary note. Clearing the date removes that current milestone;
the audit history retains the handover changes. The milestone displays a date,
not an invented departure time.

## PDF and backups

**Handover and checklist** is an independent checkbox on the Report card. It
prints the selected puppies' current status, actual departure date and checked/
open items. It works without Identity or Owners enabled and does not add contact
names, payment information or addresses. Those still require their own sections.
The Full dossier and Owner handover presets include it; Internal breeding record
and existing custom profiles leave it off unless selected. The dossier's
ordinary milestone category can separately include the departure event.

A report period filters historical dossier items, but the handover section always
shows the current planning/checklist state. Individual-puppy reports contain only
that puppy's handover. Mother reports have no puppy handover section.

Full, litter and puppy JSON backups retain handover state. Older backups without
it still restore; their puppies start with an empty checklist. A failed save keeps
the form open, and a concurrent puppy/profile/owner-link change requires reopening
the form instead of silently overwriting it.
