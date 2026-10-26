"""Validated, append-only receipts in an owner's litter dossier."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, InvalidOperation
import re
from typing import Any

PAYMENT_KINDS = ("registration_fee", "deposit", "final", "other")
PAYMENT_METHODS = ("none", "bank_transfer", "cash", "card", "other")
MAX_PAYMENT_EVENTS = 200
_IDENTIFIER = re.compile(r"^[a-zA-Z0-9_-]{1,80}$")
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def payment_amount(value: Any) -> str:
    """Require a positive, cent-exact amount; never round a receipt."""
    try:
        amount = Decimal(str(value).replace(",", "."))
    except (InvalidOperation, TypeError) as err:
        raise ValueError("Invalid payment amount") from err
    if not amount.is_finite() or amount <= 0 or amount > Decimal("999999999.99") or amount.as_tuple().exponent < -2:
        raise ValueError("Payment amount must be positive and have at most two decimals")
    return f"{amount:.2f}"


def payment_date(value: Any) -> str:
    if not isinstance(value, str) or not _DATE.fullmatch(value):
        raise ValueError("Payment date must be YYYY-MM-DD")
    try:
        date.fromisoformat(value)
    except ValueError as err:
        raise ValueError("Invalid payment date") from err
    return value


def _optional_text(value: Any, limit: int) -> str:
    if value is None:
        return ""
    if not isinstance(value, str) or len(value) > limit or any(ord(ch) < 32 for ch in value):
        raise ValueError("Invalid payment text")
    return value.strip()


def _timestamp(value: Any) -> str:
    if not isinstance(value, str) or "T" not in value:
        raise ValueError("Invalid payment timestamp")
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as err:
        raise ValueError("Invalid payment timestamp") from err
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("Payment timestamp needs a timezone")
    return value


def normalize_payment_events(value: Any) -> list[dict[str, Any]]:
    """Validate a portable ledger without changing saved event identities."""
    if value is None:
        return []
    if not isinstance(value, list) or len(value) > MAX_PAYMENT_EVENTS:
        raise ValueError("Invalid payment history")
    result = []
    seen = set()
    for raw in value:
        if not isinstance(raw, dict) or set(raw) != {"id", "amount", "date", "kind", "method", "reference", "note", "created_at", "voided_at", "void_reason"}:
            raise ValueError("Invalid payment history entry")
        identifier = raw["id"]
        if not isinstance(identifier, str) or not _IDENTIFIER.fullmatch(identifier) or identifier in seen:
            raise ValueError("Invalid payment identifier")
        seen.add(identifier)
        if raw["kind"] not in PAYMENT_KINDS or raw["method"] not in PAYMENT_METHODS:
            raise ValueError("Invalid payment category or method")
        created_at = _timestamp(raw["created_at"])
        voided_at = _timestamp(raw["voided_at"]) if raw["voided_at"] is not None else None
        if (raw["voided_at"] is None) != (raw["void_reason"] is None):
            raise ValueError("Invalid payment correction")
        if voided_at is not None and not _optional_text(raw["void_reason"], 240):
            raise ValueError("Payment correction needs a reason")
        result.append({"id": identifier, "amount": payment_amount(raw["amount"]),
                       "date": payment_date(raw["date"]), "kind": raw["kind"], "method": raw["method"],
                       "reference": _optional_text(raw["reference"], 120), "note": _optional_text(raw["note"], 240),
                       "created_at": created_at, "voided_at": voided_at,
                       "void_reason": _optional_text(raw["void_reason"], 240) if raw["void_reason"] is not None else None})
    return result


def new_payment_event(*, identifier: str, amount: Any, paid_date: Any, kind: str,
                      method: str, reference: Any = "", note: Any = "", created_at: str) -> dict[str, Any]:
    return normalize_payment_events([{"id": identifier, "amount": amount, "date": paid_date,
                                      "kind": kind, "method": method, "reference": reference, "note": note,
                                      "created_at": created_at, "voided_at": None, "void_reason": None}])[0]


def recorded_total(events: list[dict[str, Any]]) -> str:
    return f"{sum((Decimal(event['amount']) for event in events if not event['voided_at']), Decimal(0)):.2f}"
