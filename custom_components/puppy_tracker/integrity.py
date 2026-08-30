"""Data integrity checks for Puppy Weight Tracker."""

from __future__ import annotations

from collections import Counter, defaultdict, deque
from datetime import datetime
from typing import Any


def _is_valid_iso_timestamp(value: Any) -> bool:
    """Return whether a value is a timezone-aware ISO timestamp."""
    if not isinstance(value, str) or not value:
        return False
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return parsed.tzinfo is not None


def _positive_number(value: Any) -> bool:
    """Return whether a value represents a positive finite weight."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return False
    return number > 0 and number != float("inf") and number != float("-inf")


def inspect_and_repair_data(
    data: dict[str, Any],
    *,
    repair: bool,
) -> tuple[bool, dict[str, Any]]:
    """Inspect stored data and apply only unambiguous repairs.

    The routine deliberately leaves ambiguous branches, duplicate identifiers,
    invalid weights, and multi-node cycles untouched. They are reported as
    unresolved instead of guessing which historical value is correct.
    """
    changed = False
    issue_counts: Counter[str] = Counter()
    repair_counts: Counter[str] = Counter()
    unresolved: list[dict[str, Any]] = []
    unresolved_keys: set[tuple[Any, ...]] = set()
    checked_litters = 0
    checked_puppies = 0
    checked_measurements = 0

    def issue(
        code: str,
        *,
        severity: str = "warning",
        repaired: bool = False,
        litter_id: str | None = None,
        puppy_id: str | None = None,
        measurement_id: str | None = None,
    ) -> None:
        key = (code, severity, litter_id, puppy_id, measurement_id)
        if not repaired and key in unresolved_keys:
            return

        issue_counts[code] += 1
        if repaired:
            repair_counts[code] += 1
            return

        unresolved_keys.add(key)
        if len(unresolved) < 50:
            unresolved.append(
                {
                    "code": code,
                    "severity": severity,
                    "litter_id": litter_id,
                    "puppy_id": puppy_id,
                    "measurement_id": measurement_id,
                }
            )

    for litter_id, litter in data.get("litters", {}).items():
        if not isinstance(litter, dict):
            issue("invalid_litter_record", severity="critical", litter_id=str(litter_id))
            continue
        checked_litters += 1

        puppies = litter.get("puppies", {})
        if not isinstance(puppies, dict):
            issue("invalid_puppies_container", severity="critical", litter_id=str(litter_id))
            continue

        for puppy_id, puppy in puppies.items():
            if not isinstance(puppy, dict):
                issue(
                    "invalid_puppy_record",
                    severity="critical",
                    litter_id=str(litter_id),
                    puppy_id=str(puppy_id),
                )
                continue
            checked_puppies += 1

            measurements = puppy.get("measurements", [])
            if not isinstance(measurements, list):
                issue(
                    "invalid_measurements_container",
                    severity="critical",
                    litter_id=str(litter_id),
                    puppy_id=str(puppy_id),
                )
                continue

            checked_measurements += len(measurements)
            valid_records = [item for item in measurements if isinstance(item, dict)]
            if len(valid_records) != len(measurements):
                issue(
                    "invalid_measurement_record",
                    severity="critical",
                    litter_id=str(litter_id),
                    puppy_id=str(puppy_id),
                )

            ids = [item.get("id") for item in valid_records if item.get("id")]
            id_counts = Counter(ids)
            duplicate_ids = {mid for mid, count in id_counts.items() if count > 1}
            for duplicate_id in sorted(duplicate_ids):
                issue(
                    "duplicate_measurement_id",
                    severity="critical",
                    litter_id=str(litter_id),
                    puppy_id=str(puppy_id),
                    measurement_id=str(duplicate_id),
                )

            # References are unsafe to repair when ids are duplicated.
            by_id = {
                item.get("id"): item
                for item in valid_records
                if item.get("id") and item.get("id") not in duplicate_ids
            }

            for measurement in valid_records:
                measurement_id = measurement.get("id")
                mid = str(measurement_id) if measurement_id else None

                if not measurement_id:
                    issue(
                        "missing_measurement_id",
                        severity="critical",
                        litter_id=str(litter_id),
                        puppy_id=str(puppy_id),
                    )

                if not _positive_number(measurement.get("weight")):
                    issue(
                        "invalid_weight",
                        severity="critical",
                        litter_id=str(litter_id),
                        puppy_id=str(puppy_id),
                        measurement_id=mid,
                    )

                if not _is_valid_iso_timestamp(measurement.get("timestamp")):
                    issue(
                        "invalid_timestamp",
                        severity="critical",
                        litter_id=str(litter_id),
                        puppy_id=str(puppy_id),
                        measurement_id=mid,
                    )

                successor_id = measurement.get("superseded_by")
                source_id = measurement.get("source_measurement_id")

                if measurement_id and successor_id == measurement_id:
                    if repair:
                        measurement["superseded_by"] = None
                        changed = True
                        issue(
                            "self_superseded_link",
                            repaired=True,
                            litter_id=str(litter_id),
                            puppy_id=str(puppy_id),
                            measurement_id=mid,
                        )
                    else:
                        issue(
                            "self_superseded_link",
                            severity="critical",
                            litter_id=str(litter_id),
                            puppy_id=str(puppy_id),
                            measurement_id=mid,
                        )

                if measurement_id and source_id == measurement_id:
                    if repair:
                        measurement["source_measurement_id"] = None
                        changed = True
                        issue(
                            "self_source_link",
                            repaired=True,
                            litter_id=str(litter_id),
                            puppy_id=str(puppy_id),
                            measurement_id=mid,
                        )
                    else:
                        issue(
                            "self_source_link",
                            severity="critical",
                            litter_id=str(litter_id),
                            puppy_id=str(puppy_id),
                            measurement_id=mid,
                        )

            # Safe reference repairs. Iterate because removing a deleted terminal
            # correction can reveal another deleted terminal one step earlier.
            made_progress = True
            while made_progress:
                made_progress = False
                for measurement in valid_records:
                    measurement_id = measurement.get("id")
                    if not measurement_id or measurement_id in duplicate_ids:
                        continue

                    successor_id = measurement.get("superseded_by")
                    if successor_id and successor_id not in by_id:
                        if repair:
                            measurement["superseded_by"] = None
                            changed = True
                            made_progress = True
                            issue(
                                "dangling_successor",
                                repaired=True,
                                litter_id=str(litter_id),
                                puppy_id=str(puppy_id),
                                measurement_id=str(measurement_id),
                            )
                        else:
                            issue(
                                "dangling_successor",
                                severity="critical",
                                litter_id=str(litter_id),
                                puppy_id=str(puppy_id),
                                measurement_id=str(measurement_id),
                            )

                    source_id = measurement.get("source_measurement_id")
                    if source_id and source_id not in by_id:
                        if repair:
                            measurement["source_measurement_id"] = None
                            changed = True
                            made_progress = True
                            issue(
                                "dangling_source",
                                repaired=True,
                                litter_id=str(litter_id),
                                puppy_id=str(puppy_id),
                                measurement_id=str(measurement_id),
                            )
                        else:
                            issue(
                                "dangling_source",
                                severity="critical",
                                litter_id=str(litter_id),
                                puppy_id=str(puppy_id),
                                measurement_id=str(measurement_id),
                            )

                # Rebuild after possible dangling-source cleanup. Detect
                # ambiguous branches before adding a missing forward link; safe
                # repair must never choose one sibling based on list order.
                children_by_source: dict[str, list[str]] = defaultdict(list)
                for child in valid_records:
                    child_id = child.get("id")
                    source_id = child.get("source_measurement_id")
                    if (
                        child_id
                        and source_id in by_id
                        and not child.get("deleted", False)
                    ):
                        children_by_source[str(source_id)].append(str(child_id))

                for measurement in valid_records:
                    measurement_id = measurement.get("id")
                    source_id = measurement.get("source_measurement_id")
                    if (
                        not measurement_id
                        or measurement_id in duplicate_ids
                        or not source_id
                        or source_id not in by_id
                    ):
                        continue

                    source = by_id[source_id]
                    source_successor = source.get("superseded_by")

                    if measurement.get("deleted", False):
                        # Deleting an ordinary terminal correction is an undo.
                        # Clearing an intentionally removed birth weight is not:
                        # when the profile has no birth weight, keep the complete
                        # birth chain inactive.
                        should_keep_birth_inactive = (
                            measurement.get("kind") == "birth"
                            and puppy.get("birth_weight") is None
                        )
                        if (
                            repair
                            and not should_keep_birth_inactive
                            and measurement.get("superseded_by") is None
                            and source_successor == measurement_id
                        ):
                            source["superseded_by"] = None
                            changed = True
                            made_progress = True
                            issue(
                                "deleted_terminal_blocks_predecessor",
                                repaired=True,
                                litter_id=str(litter_id),
                                puppy_id=str(puppy_id),
                                measurement_id=str(measurement_id),
                            )
                        continue

                    if source_successor is None:
                        if len(children_by_source.get(str(source_id), [])) > 1:
                            issue(
                                "correction_branch",
                                severity="critical",
                                litter_id=str(litter_id),
                                puppy_id=str(puppy_id),
                                measurement_id=str(measurement_id),
                            )
                        elif repair:
                            source["superseded_by"] = measurement_id
                            changed = True
                            made_progress = True
                            issue(
                                "missing_forward_link",
                                repaired=True,
                                litter_id=str(litter_id),
                                puppy_id=str(puppy_id),
                                measurement_id=str(measurement_id),
                            )
                        else:
                            issue(
                                "missing_forward_link",
                                severity="warning",
                                litter_id=str(litter_id),
                                puppy_id=str(puppy_id),
                                measurement_id=str(measurement_id),
                            )
                    elif source_successor != measurement_id:
                        issue(
                            "correction_branch",
                            severity="critical",
                            litter_id=str(litter_id),
                            puppy_id=str(puppy_id),
                            measurement_id=str(measurement_id),
                        )

            # Verify forward/backward relation consistency.
            for measurement_id, measurement in by_id.items():
                successor_id = measurement.get("superseded_by")
                if not successor_id or successor_id not in by_id:
                    continue
                successor = by_id[successor_id]
                successor_source = successor.get("source_measurement_id")
                if successor_source is None and repair:
                    successor["source_measurement_id"] = measurement_id
                    changed = True
                    issue(
                        "missing_back_link",
                        repaired=True,
                        litter_id=str(litter_id),
                        puppy_id=str(puppy_id),
                        measurement_id=str(successor_id),
                    )
                elif successor_source != measurement_id:
                    issue(
                        "successor_source_mismatch",
                        severity="critical",
                        litter_id=str(litter_id),
                        puppy_id=str(puppy_id),
                        measurement_id=str(successor_id),
                    )

            # Detect cycles in superseded_by links. Multi-node cycles are not
            # auto-repaired because choosing which historical link to cut would
            # be guesswork.
            cycle_nodes: set[str] = set()
            for start_id in by_id:
                path: list[str] = []
                positions: dict[str, int] = {}
                current_id: str | None = start_id
                while current_id and current_id in by_id:
                    if current_id in positions:
                        cycle_nodes.update(path[positions[current_id] :])
                        break
                    positions[current_id] = len(path)
                    path.append(current_id)
                    next_id = by_id[current_id].get("superseded_by")
                    current_id = str(next_id) if next_id else None
            for cycle_id in sorted(cycle_nodes):
                issue(
                    "correction_cycle",
                    severity="critical",
                    litter_id=str(litter_id),
                    puppy_id=str(puppy_id),
                    measurement_id=cycle_id,
                )

            # Build connected correction components and ensure each non-deleted
            # component has one unambiguous active terminal version.
            neighbours: dict[str, set[str]] = defaultdict(set)
            for measurement_id, measurement in by_id.items():
                for ref in (
                    measurement.get("superseded_by"),
                    measurement.get("source_measurement_id"),
                ):
                    if ref in by_id:
                        neighbours[measurement_id].add(str(ref))
                        neighbours[str(ref)].add(measurement_id)

            seen: set[str] = set()
            for start_id in by_id:
                if start_id in seen:
                    continue
                queue = deque([start_id])
                component: set[str] = set()
                while queue:
                    current_id = queue.popleft()
                    if current_id in component:
                        continue
                    component.add(current_id)
                    queue.extend(neighbours.get(current_id, ()))
                seen.update(component)

                non_deleted = [
                    by_id[mid] for mid in component if not by_id[mid].get("deleted", False)
                ]
                active = [item for item in non_deleted if item.get("superseded_by") is None]
                if non_deleted and len(active) == 0:
                    # A birth chain is intentionally allowed to be inactive when
                    # the birth weight has explicitly been cleared from profile.
                    if not (
                        puppy.get("birth_weight") is None
                        and all(item.get("kind") == "birth" for item in non_deleted)
                    ):
                        issue(
                            "correction_chain_without_active_version",
                            severity="critical",
                            litter_id=str(litter_id),
                            puppy_id=str(puppy_id),
                        )
                elif len(active) > 1:
                    issue(
                        "multiple_active_versions_in_chain",
                        severity="critical",
                        litter_id=str(litter_id),
                        puppy_id=str(puppy_id),
                    )

            # Birth profile consistency. When one active birth measurement is
            # available, it is the authoritative historical record in 0.8.x.
            active_birth = [
                item
                for item in valid_records
                if not item.get("deleted", False)
                and item.get("superseded_by") is None
                and (item.get("kind") == "birth" or item.get("note") == "Geboortegewicht")
            ]

            if puppy.get("birth_weight") is None:
                for birth in active_birth:
                    if repair:
                        birth["deleted"] = True
                        birth["deleted_at"] = birth.get("updated_at") or birth.get("created_at")
                        changed = True
                        issue(
                            "active_birth_without_profile_weight",
                            repaired=True,
                            litter_id=str(litter_id),
                            puppy_id=str(puppy_id),
                            measurement_id=str(birth.get("id")),
                        )
                    else:
                        issue(
                            "active_birth_without_profile_weight",
                            severity="warning",
                            litter_id=str(litter_id),
                            puppy_id=str(puppy_id),
                            measurement_id=str(birth.get("id")),
                        )
                if puppy.get("birth_measurement_id") is not None and repair:
                    puppy["birth_measurement_id"] = None
                    changed = True
            elif len(active_birth) == 1:
                birth = active_birth[0]
                try:
                    birth_weight = float(birth.get("weight"))
                except (TypeError, ValueError):
                    birth_weight = None
                if birth_weight is not None:
                    if repair and puppy.get("birth_weight") != birth_weight:
                        puppy["birth_weight"] = birth_weight
                        changed = True
                        issue(
                            "birth_profile_weight_mismatch",
                            repaired=True,
                            litter_id=str(litter_id),
                            puppy_id=str(puppy_id),
                            measurement_id=str(birth.get("id")),
                        )
                    if repair and puppy.get("birth_time") != birth.get("timestamp"):
                        puppy["birth_time"] = birth.get("timestamp")
                        changed = True
                        issue(
                            "birth_profile_time_mismatch",
                            repaired=True,
                            litter_id=str(litter_id),
                            puppy_id=str(puppy_id),
                            measurement_id=str(birth.get("id")),
                        )
                    if repair and puppy.get("birth_measurement_id") != birth.get("id"):
                        puppy["birth_measurement_id"] = birth.get("id")
                        changed = True
                        issue(
                            "birth_measurement_link_mismatch",
                            repaired=True,
                            litter_id=str(litter_id),
                            puppy_id=str(puppy_id),
                            measurement_id=str(birth.get("id")),
                        )
            elif len(active_birth) > 1:
                issue(
                    "multiple_active_birth_measurements",
                    severity="critical",
                    litter_id=str(litter_id),
                    puppy_id=str(puppy_id),
                )

    issues_found = sum(issue_counts.values())
    repairs_applied = sum(repair_counts.values())
    unresolved_critical = sum(
        1 for item in unresolved if item.get("severity") == "critical"
    )
    unresolved_warnings = len(unresolved) - unresolved_critical

    report = {
        "healthy": unresolved_critical == 0,
        "issues_found": issues_found,
        "repairs_applied": repairs_applied,
        "unresolved_count": len(unresolved),
        "unresolved_critical": unresolved_critical,
        "unresolved_warnings": unresolved_warnings,
        "checked": {
            "litters": checked_litters,
            "puppies": checked_puppies,
            "measurement_versions": checked_measurements,
        },
        "issue_counts": dict(sorted(issue_counts.items())),
        "repair_counts": dict(sorted(repair_counts.items())),
        "unresolved": unresolved,
    }
    return changed, report
