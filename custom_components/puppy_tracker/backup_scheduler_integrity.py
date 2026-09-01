"""Cross-store referential integrity for portable scheduler backup data."""

from __future__ import annotations

from typing import Any


def validate_scheduler_references(
    data: dict[str, Any],
    schedulers: dict[str, Any],
) -> None:
    """Validate active scheduler ownership against authoritative main storage.

    Quarantined scheduler definitions are deliberately ignored. They are opaque
    preservation data and may use a future schema this runtime cannot interpret.
    """
    litters = data.get("litters")
    if not isinstance(litters, dict):
        raise ValueError("Main backup litter container is invalid")
    mothers = data.get("mothers", {})
    if not isinstance(mothers, dict):
        raise ValueError("Main backup mother container is invalid")

    care_store = schedulers.get("care_programs")
    recurring_store = schedulers.get("recurring_reminders")
    if not isinstance(care_store, dict) or not isinstance(recurring_store, dict):
        raise ValueError("Scheduler backup stores are incomplete")

    programs = care_store.get("programs", {})
    reminders = recurring_store.get("reminders", {})
    if not isinstance(programs, dict) or not isinstance(reminders, dict):
        raise ValueError("Scheduler active-definition containers are invalid")

    for program_id, program in programs.items():
        if not isinstance(program, dict):
            raise ValueError(f"Care program {program_id} is invalid")
        litter_id = str(program.get("litter_id") or "")
        if litter_id not in litters:
            raise ValueError(
                f"Care program {program_id} references unknown litter {litter_id or '<empty>'}"
            )

    for reminder_id, reminder in reminders.items():
        if not isinstance(reminder, dict):
            raise ValueError(f"Recurring reminder {reminder_id} is invalid")

        litter_id = str(reminder.get("litter_id") or "")
        litter = litters.get(litter_id)
        if not isinstance(litter, dict):
            raise ValueError(
                f"Recurring reminder {reminder_id} references unknown litter "
                f"{litter_id or '<empty>'}"
            )

        owner_scope = str(reminder.get("owner_scope") or "")
        owner_id = str(reminder.get("owner_id") or "")

        if owner_scope == "litter":
            if owner_id != litter_id:
                raise ValueError(
                    f"Recurring reminder {reminder_id} litter owner does not match litter_id"
                )
            continue

        if owner_scope == "puppy":
            puppies = litter.get("puppies", {})
            if not isinstance(puppies, dict) or owner_id not in puppies:
                raise ValueError(
                    f"Recurring reminder {reminder_id} references puppy {owner_id or '<empty>'} "
                    f"outside litter {litter_id}"
                )
            puppy = puppies.get(owner_id)
            if not isinstance(puppy, dict) or str(puppy.get("id") or owner_id) != owner_id:
                raise ValueError(
                    f"Recurring reminder {reminder_id} puppy owner is inconsistent"
                )
            continue

        if owner_scope == "mother":
            mother = mothers.get(owner_id)
            if not isinstance(mother, dict):
                raise ValueError(
                    f"Recurring reminder {reminder_id} references unknown mother "
                    f"{owner_id or '<empty>'}"
                )
            if str(mother.get("id") or "") != owner_id:
                raise ValueError(
                    f"Recurring reminder {reminder_id} mother owner is inconsistent"
                )
            if str(litter.get("mother_id") or "") != owner_id:
                raise ValueError(
                    f"Recurring reminder {reminder_id} mother is not linked to litter {litter_id}"
                )
            continue

        raise ValueError(
            f"Recurring reminder {reminder_id} has unsupported owner scope {owner_scope or '<empty>'}"
        )
