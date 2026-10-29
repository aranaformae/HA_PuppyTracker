# Treatments within care programs (design)

Status: implemented in the working tree. Finite course schedules, selected-pup
results, reusable relative templates, explicit stopping and per-pup progress
are implemented. Course moments use the same dossier editor as standalone and
follow-up administrations; age-based ENS/ESI still use their short result form.

## Decision

Make a finite puppy treatment a **care program variant**, not a separate plan
store or a special recurring reminder. Users manage it under Care > Programs,
carry it out under Care > Daily, and see due items in Today and optionally
Attention. A completed administration remains a normal puppy dossier fact.

This addresses [issue #11](https://github.com/aranaformae/HA_PuppyTracker/issues/11)
and reuses the current deworming and vaccination follow-up workflows. Issue #12
is about test and veterinary-visit follow-up fields, not deworming.

## Why the existing program needs extension

Today `care_programs.py` defines a program for a litter; `care_occurrences.py`
derives one occurrence per active puppy at a configured age day, with at most
one clock time per day. `care_results.py` saves each result as a dossier record.
That already fits the existing nest-wide deworming program. It does not yet fit
an individual course starting on a chosen calendar date or requiring several
administrations on one day. Generic recurring reminders support multiple
daily times, but have no finite course boundary or independent result per
planned moment. Extending that reminder model would duplicate much of the care
program result model.

## User workflow

### Register one administration

The existing medication, deworming and vaccination dossier categories remain
separate. They share a short **Register administration** form in Care, Today,
Attention and Dossier. It asks for owner, actual product, actual dose/unit where
applicable, route, actual date/time, administered by and optional note. The
category controls extra fields such as dewormer ingredient, next due date or
vaccine batch number. All prefilled values remain editable before saving.

A standalone administration needs no program. An existing
deworming/vaccination dossier follow-up still creates a new linked dossier
record; it never rewrites the prior administration. An age-based program or a
new finite treatment program opens the same administration form, with its
instructions and planned moment visible. ENS, ESI and other non-administration
programs keep the existing result form.

### Keep ordinary care programs simple

**Add care program** continues to open the current age-based form by default.
The ENS and ESI templates retain their existing age range, per-day instructions
and result fields. Neither creation nor daily execution asks for a treatment
type, product, dose, selected puppies or calendar dates. **Treatment** is a
separate choice within the same Programs view; only that choice reveals the
course fields. Existing program definitions and saved results require no
conversion, and the same Daily list continues to show their open occurrences.

### Create and follow a treatment program

In **Care > Programs**, choose **Treatment** and enter a product, optional
instruction/source note, and a schedule. A treatment template can prefill
duration and times without locking in pups or dates. Existing ENS/ESI templates
remain age-based. Choose one
puppy or a selected group of puppies. The selected puppy IDs are fixed when the
program is saved: a later addition to the litter is not silently added to a
course. Each puppy gets a separate scheduled moment and separate result.

The first version supports a bounded local-date range with one or more fixed
times per day. The user enters the dates and times; Puppy Tracker does not
recommend or calculate a product, dose, interval or duration. The Calculator
may copy a value into an editable draft only when explicitly requested.
Vaccination stays a standalone or age-based action in the first version;
finite courses cover medication and, where needed, deworming.

Each due moment offers **Register administration** or **Mark missed**. A missed
moment is explicitly recorded as missed and is never displayed as medication
given. Completing or missing one moment never shifts another scheduled time.
The course can be stopped early with a reason while retaining prior results.
Reaching the end date closes future scheduling but does not falsely mark
unrecorded moments as administered.

Mother-dog and whole-litter standalone records retain their current scope.
Finite courses are puppy-targeted in the first version; a mother-dog course
would need explicit mother occurrence and result support before enabling it.
A litter-scoped note is never treated as proof that every puppy received a dose.

## One schedule per action

| Situation | Source of schedule | Result |
| --- | --- | --- |
| Standalone administration | None | Dossier record |
| Next date on a deworming/vaccination record | Existing dossier follow-up | New linked dossier record |
| Age-based nest program | Existing care program | Per-puppy care result record |
| Finite treatment for selected puppies | New care program schedule mode | Per-puppy, per-moment care result record |

The current form does not create a recurring reminder alongside a treatment
program. Before saving, it warns about another program at the same instant,
a possibly overlapping recurring reminder or a dossier next-due date for the
same pup and category. Interval reminders are treated as possible overlaps
because their actual next time can shift after completion. A fuzzy match must
not silently disable another
schedule. A deworming administration linked to a program must not also create
a `next_due_date` follow-up for the next moment of that program.

## Program and result contract

Keep the existing care-program store. Existing `once`/`range` age schedules
remain unchanged. Add a bounded date-range mode
with selected puppy IDs, start/end local dates, fixed local times and the Home
Assistant timezone. Store treatment metadata on the program, not in another
schedule store. Use a new deterministic occurrence namespace containing program
ID, revision, puppy ID, local date and time; retain all existing occurrence IDs
for old programs. The result links to exactly one occurrence.

The program revision and locked-after-results rules remain authoritative.
Changing targets, dates, times or treatment identity after a result exists
requires a new program or revision strategy that preserves old result meaning.
The backend re-derives and validates the requested occurrence; the dossier
write rejects duplicate active occurrence IDs inside its mutation lock. A
program identity edit checks for active results under the same coordinated
lock, so a newly recorded result cannot race past the final check.
Soft-delete or restore of a result re-derives whether
the moment is open. Corrections keep actual administration fields and the PDF
`care_data` representation in sync. A linked treatment result cannot be moved
to another owner because that would break its per-puppy occurrence identity.
Plan and result permissions remain administrator-only.

The saved dossier record keeps its `medication` or `deworming` category and
stores actual administration details plus the existing care program and
occurrence references. An explicit missed result carries a missed status; it
must not populate actual administration fields. Technical IDs stay out of the
normal frontend and PDF.

## Presentation and data portability

- **Care > Daily** shows due treatments with pup name/collar color, planned
  moment and instructions. **Care > Programs** manages the schedule and shows
  completed, missed and pending counts per pup. Today and Attention reuse the same
  due action; Attention remains optional per program.
- Dossier shows what actually happened, including missed results as such.
- PDF follows its existing category and period choices. Only selected
  medication/deworming records appear; a planned dose is never reported as
  administered. A short course summary may appear when its category is enabled.
- Backup/restore and partial transfers carry the extended care-program
  definition and linked dossier records. Old backups and records remain valid;
  no historical medication record is automatically turned into a program.
- Dutch and English labels distinguish **Plan treatment**, **Register
  administration**, **Mark missed**, **Stop treatment** and saved statuses.

## Implementation sequence and acceptance checks

1. Completed in the working tree: extend care-program normalization and
   occurrence derivation with a bounded selected-puppy schedule; keep legacy
   occurrence IDs stable. Save per-moment completed/missed results, show the
   treatment form in Care, Today and Attention, and label course moments in
   notifications and PDF care rows.
2. Completed in the working tree: reuse dossier administration field
   definitions in the care result form; add relative templates, stop reason,
   per-pup progress, full-backup round-trip coverage and PDF result labels.
3. Completed in the working tree: advisory overlap review against other care
   programs, recurring reminders and dossier follow-up dates, without changing
   their schedules.
4. Completed in the working tree: course moments use the dossier editor for
   actual administration fields, date/time, note and missed status. Existing
   PDF export tests cover completed and missed course results.
5. Completed locally: the Python suite and full browser suite pass, with
   course completion and missed-status checks on desktop, iPhone and iPad.
   The workflow still needs verification in a real Home Assistant installation.

Test selected-puppy targeting, multiple times on one day, age-based program
compatibility, standalone and follow-up records, duplicate/stale requests,
missed/stopped moments, result delete/restore, restart and backup round trips,
and Home Assistant timezone boundaries. Ambiguous or nonexistent local times
at a daylight-saving change require explicit review rather than silently
moving a planned administration. Mobile tests must confirm that planned and
missed moments are never shown as administered doses. Regression tests must
also confirm that creating and completing ENS/ESI takes the same steps and
shows the same fields as before the treatment variant was added.
