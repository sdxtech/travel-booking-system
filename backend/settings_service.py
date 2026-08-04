from datetime import datetime, time, timedelta, timezone
from typing import Literal, Optional, TypedDict

from mongo_client import db


BOOKING_CANCELLATION_POLICY_ID = "booking_cancellation_policy"
DEFAULT_CANCELLATION_VALUE = 1
DEFAULT_CANCELLATION_UNIT = "days"
DEFAULT_CANCELLATION_TIME = "17:00"
JAKARTA_TIMEZONE = timezone(timedelta(hours=7), name="Asia/Jakarta")


class BookingCancellationPolicy(TypedDict):
    value: int
    unit: Literal["hours", "days"]
    cutoff_minutes: int
    cutoff_time: str
    updated_at: Optional[datetime]
    updated_by: Optional[str]


def cancellation_cutoff_minutes(value: int, unit: str) -> int:
    """Convert the configured cancellation window into minutes."""
    multiplier = 24 * 60 if unit == "days" else 60
    return value * multiplier


def get_booking_cancellation_policy() -> BookingCancellationPolicy:
    """Return the persisted policy, or the safe application default."""
    document = db["app_settings"].find_one({"_id": BOOKING_CANCELLATION_POLICY_ID}) or {}

    unit = document.get("unit")
    if unit not in ("hours", "days"):
        unit = DEFAULT_CANCELLATION_UNIT

    try:
        value = int(document.get("value", DEFAULT_CANCELLATION_VALUE))
    except (TypeError, ValueError):
        value = DEFAULT_CANCELLATION_VALUE
    if value < 1:
        value = DEFAULT_CANCELLATION_VALUE

    cutoff_time = document.get("cutoff_time", DEFAULT_CANCELLATION_TIME)
    try:
        datetime.strptime(cutoff_time, "%H:%M")
    except (TypeError, ValueError):
        cutoff_time = DEFAULT_CANCELLATION_TIME

    return {
        "value": value,
        "unit": unit,
        "cutoff_minutes": cancellation_cutoff_minutes(value, unit),
        "cutoff_time": cutoff_time,
        "updated_at": document.get("updated_at"),
        "updated_by": document.get("updated_by"),
    }


def get_booking_cancellation_deadline(
    departure_time: datetime,
    policy: Optional[BookingCancellationPolicy] = None,
) -> datetime:
    """Calculate a rolling-hour or Jakarta calendar-day cancellation deadline."""
    active_policy = policy or get_booking_cancellation_policy()
    departure = departure_time
    if departure.tzinfo is None:
        departure = departure.replace(tzinfo=timezone.utc)
    else:
        departure = departure.astimezone(timezone.utc)

    if active_policy["unit"] == "hours":
        return departure - timedelta(hours=active_policy["value"])

    local_departure = departure.astimezone(JAKARTA_TIMEZONE)
    deadline_date = local_departure.date() - timedelta(days=active_policy["value"])
    deadline_clock = time.fromisoformat(active_policy["cutoff_time"])
    local_deadline = datetime.combine(deadline_date, deadline_clock, tzinfo=JAKARTA_TIMEZONE)
    return local_deadline.astimezone(timezone.utc)
