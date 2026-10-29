"""Advisory overlap review for finite treatments."""

from custom_components.puppy_tracker.care_course_conflicts import course_schedule_conflicts
from custom_components.puppy_tracker.care_programs import normalize_care_program


class _Storage:
    def __init__(self, records=None):
        self.records = records or []

    def get_puppy(self, litter_id, puppy_id):
        if litter_id != "l1" or puppy_id not in {"p1", "p2"}:
            return None
        return {"id": puppy_id, "name": "Nova" if puppy_id == "p1" else "Milo"}

    def get_records(self, litter_id, puppy_id, *, newest_first=False):
        return self.records if litter_id == "l1" and puppy_id == "p1" else []


def _course(**overrides):
    data = {
        "id": "course-1", "litter_id": "l1", "title": "Kuur",
        "record_type": "deworming", "schedule_type": "course",
        "target_puppy_ids": ["p1"], "start_date": "2026-10-28",
        "end_date": "2026-10-29", "times_of_day": ["08:00"],
        "timezone": "Europe/Amsterdam", "treatment_product": "Middel A",
    }
    data.update(overrides)
    return normalize_care_program(data)


def test_overlap_review_reports_program_reminder_and_dossier_date() -> None:
    candidate = _course()
    other = _course(id="other", title="Andere kuur")
    reminder = {
        "title": "Herinnering", "enabled": True, "litter_id": "l1",
        "owner_scope": "puppy", "owner_id": "p1", "record_type": "deworming",
        "schedule_mode": "fixed_times", "fixed_times": ["08:00"],
        "start_at": "2026-10-27T08:00:00+02:00",
    }
    storage = _Storage([{
        "id": "record-1", "type": "deworming", "title": "Vorige ontworming",
        "data": {"next_due_date": "2026-10-29"},
    }])
    conflicts = course_schedule_conflicts(storage, candidate, [other], [reminder])
    assert {(item["kind"], item["title"]) for item in conflicts} == {
        ("care_program", "Andere kuur"),
        ("reminder", "Herinnering"),
        ("dossier_followup", "Vorige ontworming"),
    }


def test_overlap_review_ignores_other_puppy_category_and_completed_followup() -> None:
    candidate = _course()
    other = _course(id="other", target_puppy_ids=["p2"])
    reminder = {
        "title": "Andere categorie", "litter_id": "l1", "owner_scope": "puppy",
        "owner_id": "p1", "record_type": "medication", "schedule_mode": "fixed_times",
        "fixed_times": ["08:00"],
    }
    storage = _Storage([
        {"id": "source", "type": "deworming", "data": {"next_due_date": "2026-10-29"}},
        {"id": "done", "type": "deworming", "data": {"followup_record_id": "source"}},
    ])
    assert course_schedule_conflicts(storage, candidate, [other], [reminder]) == []
