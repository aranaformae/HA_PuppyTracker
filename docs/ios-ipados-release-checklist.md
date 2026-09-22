# Puppy Tracker iOS / iPadOS release checklist

Use this checklist before a release that changes dashboard cards, frontend loading, exports, or interaction behavior. Automated Playwright coverage runs on Chromium and WebKit, but it does not replace a final check in the real Home Assistant Companion App and Safari.

## Test record

- Puppy Tracker version:
- Home Assistant version:
- Companion App version:
- iPhone model / iOS version:
- iPad model / iPadOS version:
- Tester / date:

## Upgrade and cold start

- [ ] Upgrade Puppy Tracker from the previous released version through HACS.
- [ ] Perform a full Home Assistant restart.
- [ ] Open the Puppy Tracker dashboard from a cold Companion App start.
- [ ] Confirm all configured Puppy Tracker cards appear without `Custom element doesn't exist`, `Configuratiefout`, or a delayed configuration error.
- [ ] Leave the dashboard open for at least 30 seconds and confirm async/live updates do not make a card disappear.
- [ ] Repeat once in Safari to catch browser-cache differences.

## iPhone

- [ ] Dashboard remains usable in portrait orientation.
- [ ] Litter and puppy selectors open and commit the selected value on the first interaction.
- [ ] Weight input accepts numeric input and keeps focus while Home Assistant state updates arrive.
- [ ] Start weighing session, save a weight, and reset the session.
- [ ] Scroll below a Workspace with `preset: mobile`, leave the Weighing tab active for at least 30 seconds and confirm background updates do not move the page to the top.
- [ ] Switch among Weighing, Quick Log, Today and Care today and confirm the surrounding dashboard keeps its scroll position.
- [ ] Disable `show_litter_selector` and confirm the nest control is absent on Weighing, Quick Log, Today and Care while their other selectors remain usable.
- [ ] Complete a Care today item, enter configured result/score/note values and confirm the dialog closes without moving the page.
- [ ] The Home preset Attention tab loads alerts/upcoming actions after data arrives.
- [ ] The Journal preset Temperature tab loads the selected nest, owner scope and period without clipped selectors.
- [ ] Temperature can save a reading with an observation and shows it in the latest-reading area and history.
- [ ] The Journal Dossier editor can be opened, typed in, and cancelled without losing unrelated dashboard state.
- [ ] Owner card can create/edit/expand a contact and the notes field keeps its full text visible.
- [ ] The Care preset Programs tab can load a template and show day-specific instructions where configured.

## iPad

- [ ] Dashboard remains usable in portrait orientation.
- [ ] Rotate to landscape and confirm cards reflow without broken controls or clipped action buttons.
- [ ] Rotate back to portrait and confirm the current litter/puppy selections remain intact.
- [ ] Native selectors, date/time inputs, text fields, and textareas remain responsive.
- [ ] Temperature history scrolls inside the card and long observations remain readable without horizontal overflow.
- [ ] Weight input and dossier form focus are not lost during live updates.
- [ ] The Mobile preset keeps its current tab and dashboard scroll position during live updates in portrait and landscape.

## Dossier

- [ ] Select litter-level dossier and a puppy dossier.
- [ ] Create a general note.
- [ ] Select the linked mother as a dossier owner when available.
- [ ] Create at least one structured record type (feeding, vaccination, deworming, medication, test, vet visit, or milestone).
- [ ] Move a dossier record between puppy, mother and litter owners and confirm it appears only under the new owner.
- [ ] Change record type while editing and confirm entered values are preserved where expected.
- [ ] Edit an existing record.
- [ ] Open the aggregate All scope and edit/delete/restore an existing litter, mother and puppy record.
- [ ] Open a care-program result and verify status, result, score and day-specific instruction are visible; edit the supported result fields.
- [ ] Soft-delete a record.
- [ ] Enable deleted items and restore the record.
- [ ] Edit a profile note and save it.
- [ ] Trigger or wait for a live update while an editor is open and confirm unsaved form data remains intact.

## Growth / measurements

- [ ] Switch graph metric and time range.
- [ ] Select a puppy and switch between one-puppy and all-puppies chart focus.
- [ ] Open measurement management.
- [ ] Edit a measurement and verify the corrected value appears.
- [ ] Delete and restore a measurement.
- [ ] Confirm tapping a chart point still opens/highlights its measurement on touch devices.

## Reports and downloads

Test in both Companion App and Safari where practical.

- [ ] PDF download starts and the resulting PDF opens or can be shared/saved.
- [ ] CSV download starts and produces the selected puppy/range data.
- [ ] JSON backup download starts and contains the full litter backup.
- [ ] Full backup includes owner/contact data and user-owned care-program templates.
- [ ] PDF section switches can include or omit care results, owners and contact details as intended.
- [ ] Whole-litter and individual-puppy PDF exports include inactive puppies when selected, and owner contact details cannot be enabled without the owner section.
- [ ] Repeated downloads do not leave the dashboard controls unresponsive.

## Final visual pass

- [ ] Check light mode.
- [ ] Check dark mode.
- [ ] No horizontal page overflow on iPhone.
- [ ] No overlapping controls on iPad portrait or landscape.
- [ ] Dutch UI is fully Dutch when Home Assistant is set to Dutch.
- [ ] English UI is fully English when Home Assistant is set to English.

If any item fails, do not publish the frontend-changing release until the failure is fixed or explicitly documented as a known limitation.
