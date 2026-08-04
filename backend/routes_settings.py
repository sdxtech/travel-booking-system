from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from main import get_current_user
from mongo_client import db
from notifications_service import create_user_notification
from settings_service import BOOKING_CANCELLATION_POLICY_ID, get_booking_cancellation_policy


router = APIRouter(prefix="/settings", tags=["settings"])


class BookingCancellationPolicyUpdate(BaseModel):
    value: int = Field(..., ge=1, le=8760)
    unit: Literal["hours", "days"]
    cutoff_time: str = Field(default="17:00", pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")


class BookingCancellationPolicyResponse(BaseModel):
    value: int
    unit: Literal["hours", "days"]
    cutoff_minutes: int
    cutoff_time: str
    updated_at: Optional[datetime] = None
    updated_by: Optional[str] = None


class DriverAvailabilityUpdate(BaseModel):
    booking_enabled: bool


class DriverAvailabilityResponse(BaseModel):
    driver_id: str
    name: Optional[str] = None
    email: Optional[str] = None
    booking_enabled: bool
    account_disabled: bool
    updated_at: Optional[datetime] = None
    updated_by: Optional[str] = None


def require_superadmin(current_user: dict) -> None:
    if current_user.get("role") != "superadmin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super Admin access required")


def serialize_driver_availability(document: dict) -> DriverAvailabilityResponse:
    data = document or {}
    return DriverAvailabilityResponse(
        driver_id=str(data.get("_id")),
        name=data.get("name"),
        email=data.get("email"),
        booking_enabled=data.get("booking_enabled", True) is not False,
        account_disabled=data.get("disabled", False) is True,
        updated_at=data.get("booking_enabled_updated_at"),
        updated_by=data.get("booking_enabled_updated_by"),
    )


@router.get("/booking-cancellation", response_model=BookingCancellationPolicyResponse)
def read_booking_cancellation_policy(current_user=Depends(get_current_user)):
    """Expose the active policy to authenticated users for consistent UI behavior."""
    return BookingCancellationPolicyResponse(**get_booking_cancellation_policy())


@router.patch("/booking-cancellation", response_model=BookingCancellationPolicyResponse)
def update_booking_cancellation_policy(
    payload: BookingCancellationPolicyUpdate,
    current_user=Depends(get_current_user),
):
    """Allow only Super Admin to change the Employee cancellation cutoff."""
    require_superadmin(current_user)

    maximum_value = 365 if payload.unit == "days" else 8760
    if payload.value > maximum_value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum cancellation window is {maximum_value} {payload.unit}",
        )

    now = datetime.now(timezone.utc)
    db["app_settings"].update_one(
        {"_id": BOOKING_CANCELLATION_POLICY_ID},
        {
            "$set": {
                "value": payload.value,
                "unit": payload.unit,
                "cutoff_time": payload.cutoff_time,
                "updated_at": now,
                "updated_by": current_user["uid"],
            }
        },
        upsert=True,
    )
    return BookingCancellationPolicyResponse(**get_booking_cancellation_policy())


@router.get("/drivers", response_model=list[DriverAvailabilityResponse])
def list_driver_availability(current_user=Depends(get_current_user)):
    """List driver booking availability for Super Admin Settings."""
    require_superadmin(current_user)
    drivers = list(db["users"].find({"role": "driver"}))
    drivers.sort(key=lambda item: str((item or {}).get("name") or (item or {}).get("email") or "").lower())
    return [serialize_driver_availability(driver) for driver in drivers]


@router.patch("/drivers/{driver_id}", response_model=DriverAvailabilityResponse)
def update_driver_availability(
    driver_id: str,
    payload: DriverAvailabilityUpdate,
    current_user=Depends(get_current_user),
):
    """Turn a driver's eligibility for new bookings on or off."""
    require_superadmin(current_user)
    driver = db["users"].find_one({"_id": driver_id})
    if not driver:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found")
    if (driver or {}).get("role") != "driver":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected user is not a driver")

    now = datetime.now(timezone.utc)
    db["users"].update_one(
        {"_id": driver_id},
        {
            "$set": {
                "booking_enabled": payload.booking_enabled,
                "booking_enabled_updated_at": now,
                "booking_enabled_updated_by": current_user["uid"],
                "updated_at": now,
                "updated_by": current_user["uid"],
            }
        },
    )

    create_user_notification(
        driver_id,
        (
            "Your availability for new driver bookings has been turned on by Super Admin."
            if payload.booking_enabled
            else "Your availability for new driver bookings has been turned off by Super Admin. Existing tasks are unchanged."
        ),
        event="driver_availability_updated",
        entity_type="user",
        entity_id=driver_id,
        status="on" if payload.booking_enabled else "off",
        actor_id=current_user["uid"],
    )

    updated = db["users"].find_one({"_id": driver_id})
    return serialize_driver_availability(updated)
