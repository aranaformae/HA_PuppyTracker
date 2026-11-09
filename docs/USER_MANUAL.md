# Puppy Tracker: getting started

[English](USER_MANUAL.md) · [Nederlands](GEBRUIKERSHANDLEIDING.md)

This guide covers everyday tasks in simple steps. You do not need to program
or write YAML. The menu and button names below refer to Home Assistant in
English. Settings forms may use **Submit**, while cards usually use **Save**.

Use a Home Assistant administrator account to add or change information.
Other users can view most everyday overviews, but do not have all controls or
access to owner contact information and exports.

## Where do I find things?

| I want to… | Where to go |
| --- | --- |
| Create a litter or change its details | Settings → Devices & services → Puppy Tracker → Configure → Nests and puppies |
| Add or edit a puppy | Home → Puppies, or Nests and puppies in the settings |
| Weigh puppies or view growth | Growth → Weigh / Analysis; weighing is also available in Mobile |
| Save a note, feeding or temperature | Journal → Quick Log; also available in Mobile |
| Find or edit a saved item | Journal → Dossier |
| Carry out scheduled care | Care → Daily → Carry out care; also available in Mobile |
| Set up a program or reminder | Care → Management → Care programs / Reminders |
| Calculate amounts or feeding portions | Care or Mobile → Calculator |
| Manage contacts, puppy preferences or payments | The separate Owners card |
| Create a report or document | The separate Report & export card |
| Make or restore a complete backup | Configure → Data and maintenance → Backup and import |

Your card configuration determines which tabs appear on your dashboard.
**Journal** is the workspace containing several tabs. **Dossier** is its
combined history of saved items. There is no separate Timeline tab anymore.

## 1. Create your first litter and add puppies

1. Open **Settings → Devices & services → Puppy Tracker → Configure**.
2. Choose **Nests and puppies**. If there are no litters yet, the new-litter
   form opens directly.
3. Enter the litter name and the known mother and father details. Submit.
4. Use the option to add a new puppy in that litter's list.
5. Enter the call name, collar colour, known birth date/time and birth weight
   **in grams**. You can add the microchip number and other unknown details later.
6. Submit. You return to the same list and can add the next puppy immediately.

If you have several litters, select the correct litter first. Use the option to
add a new litter when needed. A missing birth time can prevent age-based care
or analysis from being calculated. Do not invent a time just to dismiss a warning.

### Change details later

The shortest route for a puppy is usually **Home → Puppies → the puppy's pencil
button**. In **Growth → Analysis**, you can also use **Edit puppy** for the
selected puppy.

For litter and parent information, open **Nests and puppies**, select the
litter, then choose the option to edit its details. Expand the section you
need, make your changes and submit. You do not need to fill everything in again.

## 2. Add cards to your dashboard

1. Open your dashboard and choose **Edit dashboard → Add card**.
2. Find the Puppy Tracker **Workspace** card.
3. Choose a preset, such as **Home**, **Growth**, **Journal**, **Care** or **Mobile**.
4. Adjust the options you need and save the card.
5. Add **Owners** and **Report & export** separately if you want to use them.

On a phone, you can start with just Mobile. It brings together weighing,
Quick Log, care and the calculator. You can add separate management workspaces
later. Cards load automatically; you normally do not need to add dashboard
resource files yourself.

See [Dashboard cards](DASHBOARD_CARDS.md) for a complete example layout and all
options. On a new installation, the checklist in Home or Mobile can help you
through the first steps.

## 3. Weigh a puppy

1. Open **Growth → Weigh** or **Mobile → Weigh**.
2. Check the litter, puppy name and collar-colour marker.
3. Enter the weight in grams. Check the difference from the previous measurement
   and how long ago that measurement was taken.
4. Choose **Save weight** and check the confirmation with the puppy name and weight.

To weigh the whole litter, choose **Start weighing session** first. After saving,
the card helps you move to the next puppy. Puppies already weighed remain
available for selection. The session button changes to **Reset session**, which
ends the session without deleting saved measurements.

The entered weight stays in the field when you select another puppy. This is
useful if you read the scale first, but always check the puppy before saving.

An unusual difference or possible duplicate measurement asks you to check the
entry. Confirm again only if both puppy and weight are correct. After saving a
wrong measurement, you can **Undo** the last weighing for two minutes.
After that, use a measurement correction.

After a restart, an interrupted session offers **Resume / Close session**.
You do not need to enter saved weights again.

### Correct a wrong weight

Find the measurement in **Dossier** and use its pencil button, or open
**Manage measurements** in Growth → Analysis. Correct the value and confirm.
The original version remains in the history. Do not add an opposite measurement
to compensate for the mistake.

## 4. Record a note, feeding or temperature

1. Open **Quick Log**.
2. Select the litter and who the entry belongs to: **Whole litter**, **Mother**
   or one **Puppy**. For a puppy, check the collar colour too.
3. Choose the entry type, such as Note, Feeding, Daily care, Temperature,
   Deworming or Medication.
4. Fill in the relevant values and an optional note.
5. Leave **Complete reminder** set to **Log only** if you only want to record
   something. Explicitly select a reminder if this entry should complete it.
6. Save and check the confirmation, including whose dossier received the entry.

For the mother's temperature, select **Mother**. **Whole litter** is a different
dossier and does not mean the mother.

In a dossier form, **owner** means the animal or litter the record belongs to.
The **Owners** card manages human contacts; these are different meanings.

For temperature charts, open **Journal → Temperature**. Use **Behavior** for
behavior observations: score only what you actually observed. Empty scores do
not count as zero. At least one score is required to save an observation.

The **Multiple puppies** action in Journal records the same information for
several puppies. Check the selection first. If some entries fail, only the
unsaved puppies remain selected for retrying.

## 5. Find, edit or move a saved item

1. Open **Journal → Dossier**.
2. Select a puppy, mother, whole litter or **All** for the combined history.
3. Search by text or use the category and date filters.
4. Expand **Details** to read the complete text. Use the pencil button to edit.
5. Save your changes. Even in All, the item stays in its original owner's dossier.

The three-dot menu lets you **Change owner** or delete an ordinary dossier item.
Filters can reveal deleted dossier items so you can restore them. Weights use
their separate correction workflow. Care-program results cannot be moved to
another animal because they belong to a scheduled action for a specific puppy.

**New entry** also works in All, but asks you to choose an owner before saving.
Selecting no categories deliberately means **show no items**. Use **Clear
filters** if you cannot find an entry.

## 6. Carry out scheduled care

1. Open **Carry out care** in Care or Mobile.
2. Check the day. Today's view can also include unfinished actions from earlier
   days. Source filters determine whether you see programs, reminders and
   follow-ups from dossier entries.
3. Open the action for the correct puppy or mother.
4. Read the instructions and check what you actually did. Adjust the product,
   amount, result, note or next date where needed.
5. Save the completion. This creates a new dossier entry; it does not replace
   the original administration or earlier note.

Use **Mark missed** if a program moment was not carried out. It is not recorded
as medication given or as a completed action.

An eye icon or **Mark as seen** only acknowledges an attention item. It does
not complete care. A reminder's pencil edits its schedule; its completion action
records what happened now.

You can postpone a reminder once without rewriting its repeating schedule.
Postponing creates no dossier entry. Cancel the postponement to return to the
original scheduled moment.

### Add a care program or reminder

- **Care programs:** for care at fixed ages, such as your own ENS/ESI protocol.
  Choose a template, review the days, instructions and result fields, then
  save the program for the selected litter.
- **Treatment:** for a limited series of medication or deworming moments for
  selected puppies. Check puppies, start/end dates, times and product.
- **Reminders:** for an interval, fixed daily times or a single moment. First
  choose the correct litter and the dossier the reminder belongs to.

Use one schedule for the same action where possible, to avoid duplicate tasks.
A template is a starting point: review it before use. Changing a template does
not change programs you already created from it.

A program's attention setting controls whether it appears in Attention.
Switching it off does not remove the program from Carry out care or hide weight
concerns. Notification lead time can be set per program or reminder; an empty
value uses the integration default.

### Amounts based on weight

A program or reminder can have an amount per kg, a unit and a maximum age for
the weight used. The displayed amount is a calculation, not a dose automatically
recorded as given. Check the weight and enter the amount actually administered
in the completion form.

An expired-weight warning requires review; a missing weight is never guessed.
This calculation is currently unavailable for the mother, because Puppy Tracker
has no separate weighing history for her to use for this calculation.

## 7. View growth and feeding portions

In **Growth → Analysis**, choose the puppy and chart/period you want to view.
**Growth is slowing** describes the growth rate: the puppy may still be gaining
weight. Actual weight loss is reported separately.

The littermate comparison shows weight relative to the other puppies at the
same age. 100% means equal to their median, the middle weight. Expand the
comparison to see the eight-week chart. Weekly figures and the explanation of
the calculation can be opened separately. Choose earlier litters for a personal
reference when those data are available. This compares your own records; it is
not a health standard.

The **Calculator** has two modes:

- **Per kg:** enter the amount per kilogram and the unit yourself.
- **Feeding:** check the kibble and meat calculation methods, their ratio and
  their separate portions per day. One kibble meal plus two meat meals means
  three feeding moments, not three equal mixed portions.

Feeding settings are saved per litter. Calculations do not create feeding
records. Check the settings before using the results; the app does not decide
which food or amount is suitable.

## 8. Manage owners, puppy preferences and payments

### Add or edit an owner

1. Open **Owners** and select the correct litter.
2. Choose **Add owner**, or expand an existing owner and use the pencil button.
3. Enter contact details. Open the sections you need, such as address,
   placement, puppy preferences or financial details.
4. Save. You do not have to link a puppy yet.

Contact information can be reused across litters. Preferences, payments and
placement information belong to the separate litter dossier. Check the selected
litter before changing those details.

**Sold** means the sale has been agreed; **Placed** means the puppy has been
handed over. The status filter hides placed/archived dossiers by default.
Choose **All dossiers** or clear filters to find them again.

### Record a preference or a final link

Enter up to three puppy preferences, each with a short note. The **Preference
matrix** helps compare overlapping choices. A preference does not reserve or
link a puppy. Use the separate action to link an owner to a puppy when the
assignment is final.

### Record a payment

There are two separate sections:

- **Financial:** the agreed total, registration fee, deposit, final instalment
  and actual outstanding amount.
- **Payments received:** individual receipts with amount, date, payment type,
  method and optional reference/note.

Expand the owner and use **Payments received → Add receipt** to record a payment.
An incorrect receipt can be voided with a reason; its history remains visible.

**Adding a receipt does not automatically update the outstanding balance.**
Maintain that separately under Financial. When fully paid, use **Record payment
in full**, check the date and payment method, then save. This sets the
outstanding amount to zero but does not create an individual receipt.

## 9. Create a PDF, contact list or document

### Export a dossier as PDF

1. Open **Report & export**.
2. Select the litter, one puppy or the mother, and the period.
3. Open **PDF report** and choose what you want to share.
4. Check the summary and choose **Download PDF**.

An individual puppy PDF can include whole-litter notes when that source is
enabled in the dossier filters. The mother has her own report. Owner information
appears only when linked and when you enable those sections. The new litter
comparison chart is available in Growth and is not yet a separate PDF chapter.

### Export owners for Word or another tool

Use **Export selection (CSV)** in Owners. Current filters determine which
dossiers are included. Select all litters and all dossiers for a complete list.
When importing into a spreadsheet, set telephone and microchip columns to
**Text** so leading zeroes are preserved.

### Create a document from a template

1. Enter your own details under **Configure → Breeder information**.
2. Check the puppy details and link the buyer to the puppy.
3. Open **Documents and contracts** in Report & export, then **Document from template**.
4. Choose a template, puppy and primary buyer. For a payment receipt, also
   select the actual recorded payment.
5. Enter the document date and signing location. Choose **Check and download PDF preview**.
6. Complete missing information and review the preview.
7. Choose **Save and download document**.

A saved document preserves the PDF as it was at that moment. Later data changes
do not update old documents. Create a new document for a correction. Custom
templates can be downloaded and imported as JSON; see the detailed
[template guide](DOCUMENT_TEMPLATES.md).

## 10. Make and restore a backup

1. Open **Configure → Data and maintenance → Backup and import**.
2. Choose **Export backup** and a **Complete Puppy Tracker backup**.
3. Download the file and keep a copy outside Home Assistant.

A complete JSON backup includes owner information, programs, custom templates
and saved documents. A litter export is more limited. PDF and CSV exports are
not restorable backups. Keep backups private: they can contain addresses and
payment information.

Use **Import / restore backup** to restore data. Read the preview before
confirming. **Replace all current Puppy Tracker data with this backup** replaces
your current Puppy Tracker data; do not use it just to inspect an old file.
Make a new backup first and follow the [restore guide](backup-restore.md).

For automatic file backups, use the `puppy_tracker.backup_to_file` action in
**Developer tools → Actions**. Choose a path inside the Home Assistant
configuration directory, outside `www`. You can include the date/time in the
filename and choose how many versions to keep. The action does not schedule
itself: add it to an automation if you want it to run daily, for example.

## 11. Set up notifications

Open **Configure → Growth and notifications → Manage notifications**.
Under **Notification preferences**, choose the default lead time and the phones
that may receive notifications. Use **Send test notification** before relying
on automatic delivery.

Completing or resolving an item clears supported tagged mobile notifications.
Disabling notifications does not delete schedules or dossier records. Care
remains available on the cards. See [Notifications](NOTIFICATIONS.md) for the
difference between notifications, attention and scheduled actions.

## If something is missing

- Check litter, puppy/mother, categories, search text and period. Selecting no
  categories means no results.
- Check the status filter in Owners. A placed dossier has not been deleted.
- Program missing from Attention? Check its attention setting and look in
  **Carry out care**, including another day if needed.
- Mother missing? Check that the correct mother is linked to the litter.
- Button missing? Check that you are signed in as an administrator.
- After an update, restart Home Assistant and refresh the browser or Companion App.
- Older HACS versions may lack an update icon even when the local integration
  icons are correct. This is separate from your breeder logo for documents.

Archive an old litter to remove it from active overviews. Permanent deletion is
different from archiving or restoring a deleted dossier item. Do not delete data
just to tidy a list.

[Back to the documentation index](README.md)
