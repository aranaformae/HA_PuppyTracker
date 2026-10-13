# Owner puppy-preference matrix

The Owners card combines contact management with a planning view for matching
owners and puppies. The **Preference matrix** compares the existing ordered
top-three shortlists for one litter. It is intended to support a placement
decision, not to make that decision automatically.

## Recommended workflow

1. Open **Manage owners** and add the prospective owner or co-owner.
2. Record up to three puppy preferences in order. Add a short note where the
   reason for a preference matters.
3. Switch to **Preference matrix** and select the litter being matched.
4. Review shared first choices, puppies with no interest and owners without a
   choice. Select a populated cell to inspect its complete note.
5. Return to **Manage owners** to adjust a shortlist or placement status.
6. When the placement is final, use **Link owner to puppy**. Linking is a
   separate, explicit action.

Keeping the shortlist after linking preserves the considerations behind a
match. Clear or change it only when that planning history is no longer useful.

## Configuring the card

Both card settings are available in the visual editor:

```yaml
type: custom:puppy-tracker-owner-card
title: Baasjes
default_view: matrix
csv_delimiter: comma
```

| Setting | Values | Purpose |
| --- | --- | --- |
| `title` | text | Optional card heading |
| `default_view` | `owners`, `matrix` | Opens contact management or the comparison first |
| `csv_delimiter` | `comma`, `semicolon` | Selects the owner CSV separator |

The segmented control remains available after the card opens, so
`default_view` only changes the initial view.

## Which owners are shown

The matrix always compares one selected litter. It includes an owner when at
least one of these conditions applies:

- the owner has a preference for a puppy in the selected litter;
- the owner is already linked to a puppy in the selected litter;
- the contact has role **Owner** or **Co-owner** and has no puppy preferences
  yet.

An owner whose shortlist refers only to another litter is left out of the
current comparison unless that owner already has a link in the selected
litter. Contacts with another role, such as breeder or veterinarian, are not
shown solely because their shortlist is empty.

Owners with placement status **Sold** or **Placed** are hidden initially. Enable
**Show sold and placed owners** to include completed placements. All counts and
conflict detection are recalculated for the owners currently included by this
setting.

## Reading the desktop matrix

On a wide card, each row represents an owner and each puppy has a column.
Puppy headings show the call name and collar colour. A puppy without a stored
collar colour is labelled accordingly and receives a visual fallback colour so
the columns remain distinguishable.

A populated cell can contain:

| Signal | Meaning |
| --- | --- |
| `1st`, `2nd` or `3rd` | Position in that owner's shortlist |
| Note icon | A preference-specific note is available |
| Link icon | This owner is already linked to the puppy |
| Warning icon and outline | More than one visible owner has this puppy as first choice |

An existing link can therefore appear without a rank, and a ranked preference
does not imply an existing link. Select a populated cell to see the complete
note, placement status and link status. **Edit owner** opens that owner's form.
Selecting a cell updates only this detail area, which keeps the table and
dashboard scroll position stable.

The footer gives the number of first, second and third choices per puppy. The
matrix itself scrolls when it is larger than the available card space; its
puppy and owner headings remain visible while scrolling.

## Summary and filters

The four summary values are calculated for all puppies in the selected litter
and the owners currently included by the sold/placed setting:

| Summary | Exact meaning |
| --- | --- |
| **First-choice conflicts** | Number of puppies selected first by more than one shown owner |
| **Puppies without preferences** | Number of puppies with no first, second or third choice from a shown owner |
| **Owners without a choice** | Number of shown owners without a preference in this litter |
| **Existing links** | Number of shown owner-puppy links in this litter |

Links do not count as preferences. A linked puppy can consequently still be
listed under **Puppies without preferences** when no shortlist contains it.

Enable **First-choice conflicts only** to reduce the table to puppies with a
shared first choice and the owners who have a preference or existing link for
those puppies. The summary continues to describe the complete selected-litter
comparison, making it possible to retain context while focusing the table. If
there are no conflicts, the card shows an explicit empty state.

## Phone and narrow-card layout

At narrow card widths the wide matrix changes automatically into a puppy-first
list. Choose a puppy to see its interested or linked owners in preference order.
The list retains:

- first, second and third rank totals;
- collar colour and puppy name;
- owner placement status;
- complete preference notes;
- existing-link and conflict indication.

This layout is based on the card width rather than the device type. It therefore
also works when the Owners card occupies a narrow dashboard column on desktop,
and it avoids horizontal page overflow on phones and tablets.

## Data, backup and export behavior

The matrix is derived from three existing sources: owner shortlists, puppies in
the selected litter and each puppy's authoritative owner links. Matrix cells,
summary totals and conflicts are not saved separately. This prevents a second
matching state from becoming stale.

- A full JSON backup includes owners, their ranked preferences and puppy links.
- Owner CSV export includes all three preferences and their notes.
- The matrix view and its active filters are presentation state and are not
  backed up.
- Owner preferences are currently not printed in PDF reports; use owner CSV
  when the planning data is needed outside Home Assistant.
- Partial litter or puppy transfers omit reusable owner records because those
  references cannot be remapped safely without an explicit owner-transfer flow.

If a saved preference points to a puppy that is no longer available, the owner
form preserves it as **Puppy no longer available**. It is not silently moved to
another puppy. Such a reference is not placed in a current litter matrix
because there is no valid puppy column for it.

## Troubleshooting

**An owner is missing**

Check the selected litter, the owner's shortlist and existing puppy links. If
the owner is sold or placed, enable **Show sold and placed owners**. An owner
with preferences only in another litter is intentionally omitted.

**A conflict count changed after showing placed owners**

Conflict detection uses the owners currently included in the comparison.
Showing completed placements can therefore add a first choice that was hidden.

**A linked puppy is reported as having no preference**

Links and preferences are separate. Add that puppy to the owner's shortlist if
the planning record should also reflect the choice.

**The matrix is empty**

Confirm that the litter contains puppies. Then add a preference, create an
owner/co-owner without preferences, or link an existing contact to a puppy in
that litter.

**The old card is still visible after updating**

Restart Home Assistant after installing the integration and fully refresh the
dashboard so the browser loads the current frontend resource.
