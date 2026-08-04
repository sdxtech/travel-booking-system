from datetime import datetime, timedelta, timezone
from typing import Literal, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from main import get_current_user
from mongo_client import db
from notifications_service import create_user_notification, notify_roles
from request_id_service import generate_request_id
from settings_service import get_booking_cancellation_deadline, get_booking_cancellation_policy

router = APIRouter(prefix="/bookings", tags=["bookings"])


class BookingCreate(BaseModel):
    driver_id: str = Field(..., min_length=1)
    pickup_location: str = Field(..., min_length=1)
    destination: str = Field(..., min_length=1)
    trip_type: Literal["antar", "jemput", "fulltrip"]
    departure_time: datetime
    estimated_arrival_time: datetime
    passenger_count: int = Field(..., ge=1)


class BookingAssignCreate(BaseModel):
    requester_name: str = Field(..., min_length=1)
    requester_dept_job_position: Optional[str] = Field(default=None, min_length=1)
    requester_nik: Optional[str] = Field(default=None, min_length=1)
    requester_phone: str = Field(..., min_length=1)
    requester_email: str = Field(..., min_length=1)
    driver_email: str = Field(..., min_length=1)
    pickup_location: str = Field(..., min_length=1)
    destination: str = Field(..., min_length=1)
    trip_type: Literal["antar", "jemput", "fulltrip"]
    departure_time: datetime
    estimated_arrival_time: datetime
    passenger_count: int = Field(..., ge=1)


class BookingResponse(BaseModel):
    id: str
    request_id: Optional[str] = None
    user_id: Optional[str] = None
    driver_id: Optional[str] = None
    driver_name: Optional[str] = None
    requester_name: Optional[str] = None
    requester_dept_job_position: Optional[str] = None
    requester_nik: Optional[str] = None
    requester_phone: Optional[str] = None
    requester_email: Optional[str] = None
    pickup_location: str
    destination: str
    trip_type: Literal["antar", "jemput", "fulltrip"]
    departure_time: datetime
    estimated_arrival_time: Optional[datetime] = None
    passenger_count: int
    status: str
    starting_mileage: Optional[int] = None
    ending_mileage: Optional[int] = None
    completion_proof: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    driver_finished_at: Optional[datetime] = None
    validated_at: Optional[datetime] = None
    validated_by: Optional[str] = None
    validated_by_name: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class BookingOfficeHistoryResponse(BookingResponse):
    driver_name: Optional[str] = None


class DriverCalendarBookingResponse(BaseModel):
    id: str
    driver_id: str
    status: str
    departure_time: datetime
    estimated_arrival_time: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    driver_finished_at: Optional[datetime] = None
    validated_at: Optional[datetime] = None
    validated_by: Optional[str] = None


class DriverCalendarResponse(BaseModel):
    driver_id: str
    driver_name: Optional[str] = None
    driver_email: Optional[str] = None
    booking_enabled: bool = True
    bookings: list[DriverCalendarBookingResponse] = Field(default_factory=list)


class BookingStatusUpdate(BaseModel):
    status: Literal["approved", "rejected", "completed"]
    driver_id: Optional[str] = None


class BookingStart(BaseModel):
    starting_mileage: int = Field(..., ge=0)


class BookingComplete(BaseModel):
    ending_mileage: int = Field(..., ge=0)


def serialize_booking(doc_snapshot) -> BookingResponse:
    """Convert a MongoDB booking document into the API response model."""
    data = doc_snapshot or {}
    validated_by = data.get("validated_by")
    validated_by_name = data.get("validated_by_name")
    if validated_by and not validated_by_name:
        validator = db["users"].find_one({"_id": validated_by}, {"name": 1, "email": 1})
        if validator:
            validated_by_name = validator.get("name") or validator.get("email")

    return BookingResponse(
        id=str(data.get("_id")),
        request_id=data.get("request_id"),
        user_id=data.get("user_id"),
        driver_id=data.get("driver_id"),
        driver_name=data.get("driver_name"),
        requester_name=data.get("requester_name"),
        requester_dept_job_position=data.get("requester_dept_job_position"),
        requester_nik=data.get("requester_nik"),
        requester_phone=data.get("requester_phone"),
        requester_email=data.get("requester_email"),
        pickup_location=data.get("pickup_location"),
        destination=data.get("destination"),
        trip_type=data.get("trip_type"),
        departure_time=data.get("departure_time"),
        estimated_arrival_time=data.get("estimated_arrival_time"),
        passenger_count=data.get("passenger_count"),
        status=data.get("status"),
        starting_mileage=data.get("starting_mileage"),
        ending_mileage=data.get("ending_mileage"),
        completion_proof=data.get("completion_proof"),
        started_at=data.get("started_at"),
        completed_at=data.get("completed_at"),
        driver_finished_at=data.get("driver_finished_at"),
        validated_at=data.get("validated_at"),
        validated_by=validated_by,
        validated_by_name=validated_by_name,
        created_at=data.get("created_at"),
        updated_at=data.get("updated_at"),
    )


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_email(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    return value.strip().lower()


def ensure_role(uid: str, allowed: tuple[str, ...]):
    """Ensure the user has one of the allowed roles and return the resolved role."""
    doc = db["users"].find_one({"_id": uid})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User profile not found")
    role = (doc or {}).get("role")
    if role not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return role


def get_departure_time_epoch_ms(value: Optional[datetime]) -> Optional[int]:
    """Return the departure timestamp as epoch ms (normalized to UTC when naive)."""
    if not isinstance(value, datetime):
        return None

    dt = value
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def normalize_datetime(value: Optional[datetime]) -> Optional[datetime]:
    """Normalize a datetime to an aware UTC value for interval comparisons."""
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def validate_booking_interval(departure_time: datetime, estimated_arrival_time: datetime) -> None:
    """Require an estimated arrival later than the booking departure."""
    start = normalize_datetime(departure_time)
    end = normalize_datetime(estimated_arrival_time)
    if not start or not end or end <= start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Estimated arrival time must be later than departure time",
        )


def booking_interval(data: dict) -> tuple[Optional[datetime], Optional[datetime]]:
    """Resolve a stored interval, with a two-hour fallback for legacy bookings."""
    start = normalize_datetime((data or {}).get("departure_time"))
    if not start:
        return None, None
    end = normalize_datetime((data or {}).get("estimated_arrival_time"))
    if not end or end <= start:
        end = start + timedelta(hours=2)
    return start, end


def resolve_driver(driver_id: str, *, allow_unavailable: bool = False) -> dict:
    """Resolve a driver, optionally allowing Super Admin to override availability rules."""
    driver_doc = db["users"].find_one({"_id": driver_id})
    driver_data = driver_doc or {}
    if (
        not driver_doc
        or driver_data.get("role") != "driver"
        or (
            not allow_unavailable
            and (driver_data.get("disabled") is True or driver_data.get("booking_enabled", True) is False)
        )
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected driver is not available")
    return driver_data


def is_driver_busy(
    driver_id: str,
    departure_time: Optional[datetime],
    estimated_arrival_time: Optional[datetime],
    exclude_booking_id: Optional[str] = None,
    blocking_statuses: tuple[str, ...] = ("approved", "in_progress"),
) -> bool:
    """Check whether an existing booking overlaps the requested time interval."""
    requested_start = normalize_datetime(departure_time)
    requested_end = normalize_datetime(estimated_arrival_time)
    if not driver_id or not requested_start or not requested_end:
        return False

    query = db["bookings"].find({"driver_id": driver_id})
    for doc in query:
        if exclude_booking_id and str(doc.get("_id")) == exclude_booking_id:
            continue

        data = doc or {}
        if data.get("status") not in blocking_statuses:
            continue

        other_start, other_end = booking_interval(data)
        if other_start and other_end and requested_start < other_end and requested_end > other_start:
            return True

    return False


@router.post("", response_model=BookingResponse)
def create_booking(payload: BookingCreate, current_user=Depends(get_current_user)):
    """Auto-approve a free driver slot, otherwise keep the request pending."""
    uid = current_user["uid"]
    ensure_role(uid, ("user",))
    validate_booking_interval(payload.departure_time, payload.estimated_arrival_time)
    driver_data = resolve_driver(payload.driver_id)
    driver_name = driver_data.get("name") or driver_data.get("email") or "Driver"
    has_conflict = is_driver_busy(
        payload.driver_id,
        payload.departure_time,
        payload.estimated_arrival_time,
        blocking_statuses=("pending", "approved", "in_progress"),
    )
    booking_status = "pending" if has_conflict else "approved"

    requester_name = None
    requester_phone = None
    requester_dept_job_position = None
    requester_nik = None
    doc = db["users"].find_one({"_id": uid})
    if doc:
        data = doc or {}
        requester_name = data.get("name")
        requester_phone = data.get("phone_number") or data.get("phone")
        requester_dept_job_position = data.get("dept_job_position") or data.get("department") or data.get("job_position")
        requester_nik = data.get("nik") or data.get("national_id")

    booking_id = uuid4().hex
    created_at = utc_now()
    data = {
        "_id": booking_id,
        "request_id": generate_request_id(db, "BD", created_at),
        "user_id": uid,
        "driver_id": payload.driver_id,
        "driver_name": driver_name,
        "requester_email": current_user.get("email"),
        "pickup_location": payload.pickup_location,
        "destination": payload.destination,
        "trip_type": payload.trip_type,
        "departure_time": payload.departure_time,
        "estimated_arrival_time": payload.estimated_arrival_time,
        "passenger_count": payload.passenger_count,
        "status": booking_status,
        "approved_by": "system" if booking_status == "approved" else None,
        "approved_at": utc_now() if booking_status == "approved" else None,
        "created_at": created_at,
        "updated_at": created_at,
    }
    if requester_name:
        data["requester_name"] = requester_name
    if requester_phone:
        data["requester_phone"] = requester_phone
    if requester_dept_job_position:
        data["requester_dept_job_position"] = requester_dept_job_position
    if requester_nik:
        data["requester_nik"] = requester_nik
    db["bookings"].insert_one(data)

    create_user_notification(
        uid,
        (
            "Your driver booking was automatically approved because the selected driver is available."
            if booking_status == "approved"
            else "Your driver booking conflicts with another request and is pending Office Coordinator approval."
        ),
        event="auto_approved" if booking_status == "approved" else "submitted",
        entity_type="booking",
        entity_id=booking_id,
        status=booking_status,
        actor_id="system" if booking_status == "approved" else uid,
    )

    if booking_status == "approved":
        create_user_notification(
            payload.driver_id,
            "You have been assigned a new driver task by the booking system.",
            event="assigned",
            entity_type="booking",
            entity_id=booking_id,
            status="approved",
            actor_id="system",
        )
    else:
        notify_roles(
            ("office_coordinator", "superadmin"),
            "A conflicting driver booking request requires your review.",
            event="incoming_request",
            entity_type="booking",
            entity_id=booking_id,
            status="pending",
            actor_id=uid,
        )

    snapshot = db["bookings"].find_one({"_id": booking_id})
    return serialize_booking(snapshot)


@router.post("/assign", response_model=BookingOfficeHistoryResponse)
def assign_driver(payload: BookingAssignCreate, current_user=Depends(get_current_user)):
    """Create an approved booking directly and assign it to a specific driver (office flow)."""
    uid = current_user["uid"]
    current_role = ensure_role(uid, ("office_coordinator", "superadmin"))
    validate_booking_interval(payload.departure_time, payload.estimated_arrival_time)

    driver_email = normalize_email(payload.driver_email)
    driver_doc = db["users"].find_one({"email": driver_email})
    if not driver_doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found")

    driver_uid = str(driver_doc.get("_id"))

    driver_data = driver_doc or {}
    if driver_data.get("role") != "driver" or (
        current_role != "superadmin"
        and (driver_data.get("disabled") is True or driver_data.get("booking_enabled", True) is False)
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected driver is not available")

    driver_name = driver_data.get("name") or driver_data.get("email")
    if current_role != "superadmin" and is_driver_busy(
        driver_uid, payload.departure_time, payload.estimated_arrival_time
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Driver has another booking that overlaps this time range",
        )

    linked_user_id = None
    requester_email = normalize_email(payload.requester_email)
    if requester_email:
        requester_doc = db["users"].find_one({"email": requester_email})
        if requester_doc:
            linked_user_id = str(requester_doc.get("_id"))

    booking_id = uuid4().hex
    created_at = utc_now()
    data = {
        "_id": booking_id,
        "request_id": generate_request_id(db, "BD", created_at),
        "user_id": linked_user_id,
        "driver_id": driver_uid,
        "driver_name": driver_name,
        "requester_name": payload.requester_name,
        "requester_dept_job_position": payload.requester_dept_job_position,
        "requester_nik": payload.requester_nik,
        "requester_phone": payload.requester_phone,
        "requester_email": payload.requester_email,
        "pickup_location": payload.pickup_location,
        "destination": payload.destination,
        "trip_type": payload.trip_type,
        "departure_time": payload.departure_time,
        "estimated_arrival_time": payload.estimated_arrival_time,
        "passenger_count": payload.passenger_count,
        "status": "approved",
        "created_by": uid,
        "created_at": created_at,
        "updated_at": created_at,
    }
    db["bookings"].insert_one(data)
    snapshot = db["bookings"].find_one({"_id": booking_id})
    booking = serialize_booking(snapshot)

    if linked_user_id:
        create_user_notification(
            linked_user_id,
            "A driver booking has been created for you and has been approved.",
        event="created_by_office",
        entity_type="booking",
        entity_id=booking_id,
        status="approved",
        actor_id=uid,
    )

    create_user_notification(
        driver_uid,
        "You have been assigned a new driver task. Please check Driver Tasks for details.",
        event="assigned",
        entity_type="booking",
        entity_id=booking_id,
        status="approved",
        actor_id=uid,
    )

    return BookingOfficeHistoryResponse(**booking.model_dump())


@router.get("/my", response_model=list[BookingResponse])
def list_my_bookings(current_user=Depends(get_current_user)):
    """List bookings created by the current user (newest first)."""
    uid = current_user["uid"]
    ensure_role(uid, ("user",))

    snapshots = db["bookings"].find({"user_id": uid}).sort("created_at", -1)
    return [serialize_booking(doc) for doc in snapshots]


@router.get("/pending", response_model=list[BookingResponse])
def list_pending_bookings(current_user=Depends(get_current_user)):
    """List pending booking requests for office coordinators and superadmins."""
    uid = current_user["uid"]
    ensure_role(uid, ("office_coordinator", "superadmin"))

    snapshots = db["bookings"].find({"status": "pending"}).sort("created_at", -1)
    return [serialize_booking(doc) for doc in snapshots]


@router.get("/unavailable-drivers", response_model=list[str])
def list_unavailable_drivers(
    departure_time: datetime,
    estimated_arrival_time: Optional[datetime] = None,
    current_user=Depends(get_current_user),
):
    """Return driver ids unavailable for the caller's booking flow and requested interval."""
    uid = current_user["uid"]
    role = ensure_role(uid, ("user", "office_coordinator", "superadmin"))

    requested_start = normalize_datetime(departure_time)
    requested_end = normalize_datetime(estimated_arrival_time) if estimated_arrival_time else None
    if requested_start and not requested_end:
        requested_end = requested_start + timedelta(hours=2)
    if not requested_start or not requested_end or requested_end <= requested_start:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid booking time range")

    blocking_statuses = ["pending", "approved", "in_progress"] if role == "user" else ["approved", "in_progress"]
    snapshots = db["bookings"].find({"status": {"$in": blocking_statuses}})

    unavailable: set[str] = set()
    disabled_for_booking = db["users"].find(
        {
            "role": "driver",
            "$or": [
                {"disabled": True},
                {"booking_enabled": False},
            ],
        }
    )
    unavailable.update(str((driver or {}).get("_id")) for driver in disabled_for_booking if (driver or {}).get("_id"))

    for doc in snapshots:
        data = doc or {}
        driver_id = data.get("driver_id")
        if not driver_id:
            continue
        other_start, other_end = booking_interval(data)
        if other_start and other_end and requested_start < other_end and requested_end > other_start:
            unavailable.add(driver_id)

    return sorted(unavailable)


@router.get("/driver-calendars", response_model=list[DriverCalendarResponse])
def list_driver_calendars(current_user=Depends(get_current_user)):
    """Return driver busy schedules for employee quick-view calendars."""
    uid = current_user["uid"]
    ensure_role(uid, ("user", "office_coordinator", "superadmin"))

    drivers = list(db["users"].find({"role": "driver", "disabled": {"$ne": True}}))

    def driver_sort_value(doc):
        """Return a stable driver display name for sorting."""
        data = doc or {}
        value = data.get("name") or data.get("email") or str(data.get("_id") or "")
        return str(value).lower()

    sorted_drivers = sorted(drivers, key=driver_sort_value)
    driver_ids = [str((driver or {}).get("_id")) for driver in sorted_drivers if (driver or {}).get("_id")]
    bookings_by_driver: dict[str, list[DriverCalendarBookingResponse]] = {driver_id: [] for driver_id in driver_ids}

    if driver_ids:
        booking_docs = db["bookings"].find(
            {
                "driver_id": {"$in": driver_ids},
                "status": {"$in": ["approved", "in_progress", "awaiting_validation", "completed"]},
            }
        )

        for doc in booking_docs:
            data = doc or {}
            driver_id = data.get("driver_id")
            departure_time = data.get("departure_time")
            if not driver_id or driver_id not in bookings_by_driver or not isinstance(departure_time, datetime):
                continue

            bookings_by_driver[driver_id].append(
                DriverCalendarBookingResponse(
                    id=str(data.get("_id")),
                    driver_id=driver_id,
                    status=data.get("status", "approved"),
                    departure_time=departure_time,
                    estimated_arrival_time=data.get("estimated_arrival_time"),
                    started_at=data.get("started_at"),
                    completed_at=data.get("completed_at"),
                )
            )

    results: list[DriverCalendarResponse] = []
    for driver in sorted_drivers:
        data = driver or {}
        driver_id = str(data.get("_id"))
        driver_bookings = bookings_by_driver.get(driver_id, [])
        driver_bookings.sort(key=lambda booking: booking.departure_time)

        results.append(
            DriverCalendarResponse(
                driver_id=driver_id,
                driver_name=data.get("name") or data.get("email") or "Driver",
                driver_email=data.get("email"),
                booking_enabled=data.get("booking_enabled", True) is not False,
                bookings=driver_bookings,
            )
        )

    return results


@router.patch("/{booking_id}/status", response_model=BookingResponse)
def update_booking_status(
    booking_id: str,
    payload: BookingStatusUpdate,
    current_user=Depends(get_current_user),
):
    """Update a booking's status (office flow), including driver assignment for approvals."""
    uid = current_user["uid"]
    current_role = ensure_role(uid, ("office_coordinator", "superadmin"))

    snapshot = db["bookings"].find_one({"_id": booking_id})
    if not snapshot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    booking_data = snapshot or {}

    if payload.status == "approved":
        if not payload.driver_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="driver_id is required for approval")

        driver_data = resolve_driver(payload.driver_id, allow_unavailable=current_role == "superadmin")

        departure_time = booking_data.get("departure_time")
        if not isinstance(departure_time, datetime):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Booking departure time is invalid")

        estimated_arrival_time = booking_data.get("estimated_arrival_time")
        if not isinstance(estimated_arrival_time, datetime):
            estimated_arrival_time = departure_time + timedelta(hours=2)

        if current_role != "superadmin" and is_driver_busy(
            payload.driver_id,
            departure_time,
            estimated_arrival_time,
            exclude_booking_id=booking_id,
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Driver has an overlapping active booking. Cancel that booking before approving this request.",
            )

    updates = {
        "status": payload.status,
        "updated_at": utc_now(),
    }
    if payload.driver_id is not None:
        updates["driver_id"] = payload.driver_id
    if payload.status == "approved" and payload.driver_id is not None:
        updates["driver_name"] = driver_data.get("name") or driver_data.get("email") or "Driver"
        updates["approved_by"] = uid
        updates["approved_at"] = utc_now()

    db["bookings"].update_one({"_id": booking_id}, {"$set": updates})

    user_id = booking_data.get("user_id")
    if user_id:
        if payload.status == "approved":
            message = "Your driver booking request has been approved."
        elif payload.status == "rejected":
            message = "Your driver booking request has been rejected."
        else:
            message = f"Your driver booking request status has been updated to {payload.status}."

        create_user_notification(
            user_id,
            message,
            event="status_updated",
            entity_type="booking",
            entity_id=booking_id,
            status=payload.status,
            actor_id=uid,
        )

    if payload.status == "approved" and payload.driver_id:
        create_user_notification(
            payload.driver_id,
            "You have been assigned a new driver task. Please check Driver Tasks for details.",
            event="assigned",
            entity_type="booking",
            entity_id=booking_id,
            status="approved",
            actor_id=uid,
        )

    updated_snapshot = db["bookings"].find_one({"_id": booking_id})
    return serialize_booking(updated_snapshot)


@router.patch("/{booking_id}", response_model=BookingResponse)
def update_booking(booking_id: str, payload: BookingCreate, current_user=Depends(get_current_user)):
    """Edit an Employee pending request or allow Super Admin to overwrite any booking."""
    uid = current_user["uid"]
    role = ensure_role(uid, ("user", "superadmin"))

    snapshot = db["bookings"].find_one({"_id": booking_id})
    if not snapshot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    data = snapshot or {}
    if role == "user":
        if data.get("user_id") != uid:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        if data.get("status", "pending") != "pending":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending bookings can be edited")

    validate_booking_interval(payload.departure_time, payload.estimated_arrival_time)
    driver_data = resolve_driver(payload.driver_id, allow_unavailable=role == "superadmin")
    driver_name = driver_data.get("name") or driver_data.get("email") or "Driver"

    if role == "superadmin":
        updated_at = utc_now()
        db["bookings"].update_one(
            {"_id": booking_id},
            {
                "$set": {
                    "pickup_location": payload.pickup_location,
                    "destination": payload.destination,
                    "trip_type": payload.trip_type,
                    "driver_id": payload.driver_id,
                    "driver_name": driver_name,
                    "departure_time": payload.departure_time,
                    "estimated_arrival_time": payload.estimated_arrival_time,
                    "passenger_count": payload.passenger_count,
                    "updated_at": updated_at,
                    "updated_by": uid,
                }
            },
        )

        target_user_id = data.get("user_id")
        if target_user_id:
            create_user_notification(
                target_user_id,
                "Your driver booking details were updated by Super Admin.",
                event="updated_by_superadmin",
                entity_type="booking",
                entity_id=booking_id,
                status=data.get("status", "pending"),
                actor_id=uid,
            )
        create_user_notification(
            payload.driver_id,
            "A driver booking assignment was updated by Super Admin. Please check Driver Tasks.",
            event="assignment_updated",
            entity_type="booking",
            entity_id=booking_id,
            status=data.get("status", "pending"),
            actor_id=uid,
        )

        updated_snapshot = db["bookings"].find_one({"_id": booking_id})
        return serialize_booking(updated_snapshot)

    has_conflict = is_driver_busy(
        payload.driver_id,
        payload.departure_time,
        payload.estimated_arrival_time,
        exclude_booking_id=booking_id,
        blocking_statuses=("pending", "approved", "in_progress"),
    )
    booking_status = "pending" if has_conflict else "approved"

    db["bookings"].update_one(
        {"_id": booking_id},
        {
            "$set": {
                "pickup_location": payload.pickup_location,
                "destination": payload.destination,
                "trip_type": payload.trip_type,
                "driver_id": payload.driver_id,
                "driver_name": driver_name,
                "departure_time": payload.departure_time,
                "estimated_arrival_time": payload.estimated_arrival_time,
                "passenger_count": payload.passenger_count,
                "status": booking_status,
                "approved_by": "system" if booking_status == "approved" else None,
                "approved_at": utc_now() if booking_status == "approved" else None,
                "updated_at": utc_now(),
            }
        },
    )

    create_user_notification(
        uid,
        (
            "Your updated driver booking was automatically approved because the selected driver is available."
            if booking_status == "approved"
            else "Your updated driver booking still overlaps another request and requires Office Coordinator approval."
        ),
        event="auto_approved" if booking_status == "approved" else "updated",
        entity_type="booking",
        entity_id=booking_id,
        status=booking_status,
        actor_id="system" if booking_status == "approved" else uid,
    )

    if booking_status == "approved":
        create_user_notification(
            payload.driver_id,
            "You have been assigned a new driver task by the booking system.",
            event="assigned",
            entity_type="booking",
            entity_id=booking_id,
            status="approved",
            actor_id="system",
        )
    else:
        notify_roles(
            ("office_coordinator", "superadmin"),
            "A conflicting driver booking request was updated and requires your review.",
            event="incoming_request",
            entity_type="booking",
            entity_id=booking_id,
            status="pending",
            actor_id=uid,
        )

    updated_snapshot = db["bookings"].find_one({"_id": booking_id})
    return serialize_booking(updated_snapshot)


@router.patch("/{booking_id}/cancel", response_model=BookingResponse)
def cancel_booking(booking_id: str, current_user=Depends(get_current_user)):
    """Cancel a booking with role-based rules (user: pending only, office: approved before start)."""
    uid = current_user["uid"]
    role = ensure_role(uid, ("user", "office_coordinator", "superadmin"))

    snapshot = db["bookings"].find_one({"_id": booking_id})
    if not snapshot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    data = snapshot or {}
    booking_status = data.get("status", "pending")

    if role == "user":
        if data.get("user_id") != uid:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

        if booking_status != "pending":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending bookings can be canceled")

        departure_time = normalize_datetime(data.get("departure_time"))
        policy = get_booking_cancellation_policy()
        if departure_time:
            cancellation_deadline = get_booking_cancellation_deadline(departure_time, policy)
            if utc_now() > cancellation_deadline:
                if policy["unit"] == "days":
                    unit_label = "day" if policy["value"] == 1 else "days"
                    policy_description = (
                        f"until {policy['cutoff_time']} Asia/Jakarta, "
                        f"{policy['value']} {unit_label} before departure"
                    )
                else:
                    unit_label = "hour" if policy["value"] == 1 else "hours"
                    policy_description = f"at least {policy['value']} {unit_label} before departure"
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Booking can only be canceled {policy_description}",
                )
    elif role == "office_coordinator":
        if booking_status != "approved":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only approved bookings can be canceled by office coordinator",
            )

        if data.get("starting_mileage") is not None or data.get("started_at") is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Booking already started and cannot be canceled",
            )

    db["bookings"].update_one(
        {"_id": booking_id},
        {
            "$set": {
                "status": "cancelled",
                "cancelled_by": uid,
                "cancelled_at": utc_now(),
                "updated_at": utc_now(),
            }
        },
    )

    target_user_id = data.get("user_id")
    if role == "user":
        message = "Your driver booking request has been cancelled."
        target_user_id = uid
    else:
        actor_label = "Super Admin" if role == "superadmin" else "the office coordinator"
        message = f"Your driver booking has been cancelled by {actor_label}."

    if target_user_id:
        create_user_notification(
            target_user_id,
            message,
            event="cancelled",
            entity_type="booking",
            entity_id=booking_id,
            status="cancelled",
            actor_id=uid,
        )

    updated_snapshot = db["bookings"].find_one({"_id": booking_id})
    return serialize_booking(updated_snapshot)


@router.patch("/{booking_id}/start", response_model=BookingResponse)
def start_booking(booking_id: str, payload: BookingStart, current_user=Depends(get_current_user)):
    """Driver action: mark a booking as started and store the starting mileage."""
    uid = current_user["uid"]
    ensure_role(uid, ("driver",))

    snapshot = db["bookings"].find_one({"_id": booking_id})
    if not snapshot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    data = snapshot or {}
    if data.get("driver_id") != uid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if data.get("status") != "approved":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Booking is not in an approvable state")

    if data.get("starting_mileage") is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Booking already started")

    db["bookings"].update_one(
        {"_id": booking_id},
        {
            "$set": {
                "starting_mileage": payload.starting_mileage,
                "status": "in_progress",
                "started_at": utc_now(),
                "updated_at": utc_now(),
            }
        },
    )

    updated_snapshot = db["bookings"].find_one({"_id": booking_id})
    return serialize_booking(updated_snapshot)


@router.patch("/{booking_id}/complete", response_model=BookingResponse)
def complete_booking(booking_id: str, payload: BookingComplete, current_user=Depends(get_current_user)):
    """Driver action: submit ending mileage and request completion validation."""
    uid = current_user["uid"]
    ensure_role(uid, ("driver",))

    snapshot = db["bookings"].find_one({"_id": booking_id})
    if not snapshot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    data = snapshot or {}
    if data.get("driver_id") != uid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if data.get("status") not in ("approved", "in_progress"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Booking is not in a completable state")

    starting = data.get("starting_mileage")
    if starting is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Booking must be started first")

    if isinstance(starting, int) and payload.ending_mileage < starting:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ending mileage must be greater than or equal to starting mileage",
        )

    finished_at = utc_now()
    db["bookings"].update_one(
        {"_id": booking_id},
        {
            "$set": {
                "ending_mileage": payload.ending_mileage,
                "status": "awaiting_validation",
                "driver_finished_at": finished_at,
                "updated_at": finished_at,
            },
            "$unset": {
                "completion_proof": "",
                "completed_at": "",
                "validated_at": "",
                "validated_by": "",
                "validated_by_name": "",
            },
        },
    )

    target_user_id = data.get("user_id")
    if target_user_id:
        create_user_notification(
            target_user_id,
            "The driver has finished your trip. Please validate the completion from Booking Driver Status & History.",
            event="completion_validation_requested",
            entity_type="booking",
            entity_id=booking_id,
            status="awaiting_validation",
            actor_id=uid,
        )
    else:
        notify_roles(
            ("office_coordinator", "superadmin"),
            "A driver trip without a linked Employee account is waiting for completion validation.",
            event="completion_validation_requested",
            entity_type="booking",
            entity_id=booking_id,
            status="awaiting_validation",
            actor_id=uid,
        )

    updated_snapshot = db["bookings"].find_one({"_id": booking_id})
    return serialize_booking(updated_snapshot)


@router.patch("/{booking_id}/validate-completion", response_model=BookingResponse)
def validate_booking_completion(booking_id: str, current_user=Depends(get_current_user)):
    """Confirm a driver's finish report through the linked Employee or Office fallback."""
    uid = current_user["uid"]
    role = ensure_role(uid, ("user", "office_coordinator", "superadmin"))

    snapshot = db["bookings"].find_one({"_id": booking_id})
    if not snapshot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    data = snapshot or {}
    if role != "superadmin" and data.get("status") != "awaiting_validation":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Booking is not waiting for validation")

    linked_user_id = data.get("user_id")
    if role == "user":
        if linked_user_id != uid:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    elif role == "office_coordinator" and linked_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This booking must be validated by the linked Employee",
        )

    validated_at = utc_now()
    completed_at = data.get("driver_finished_at") or validated_at
    validator = db["users"].find_one({"_id": uid}, {"name": 1, "email": 1}) or {}
    validated_by_name = validator.get("name") or validator.get("email") or uid
    db["bookings"].update_one(
        {"_id": booking_id},
        {
            "$set": {
                "status": "completed",
                "completed_at": completed_at,
                "validated_at": validated_at,
                "validated_by": uid,
                "validated_by_name": validated_by_name,
                "updated_at": validated_at,
            }
        },
    )

    driver_id = data.get("driver_id")
    if driver_id:
        create_user_notification(
            driver_id,
            "Your trip completion has been validated.",
            event="completion_validated",
            entity_type="booking",
            entity_id=booking_id,
            status="completed",
            actor_id=uid,
        )

    updated_snapshot = db["bookings"].find_one({"_id": booking_id})
    return serialize_booking(updated_snapshot)


@router.get("/assigned", response_model=list[BookingResponse])
def list_assigned_bookings(current_user=Depends(get_current_user)):
    """List bookings assigned to the current driver."""
    uid = current_user["uid"]
    ensure_role(uid, ("driver",))

    query = db["bookings"].find({"driver_id": uid})
    return [serialize_booking(doc) for doc in query]


@router.get("/history", response_model=list[BookingOfficeHistoryResponse])
def list_booking_history(current_user=Depends(get_current_user)):
    """List every booking status for the combined office request/history view."""
    uid = current_user["uid"]
    ensure_role(uid, ("office_coordinator", "superadmin"))

    snapshots = list(db["bookings"].find({}))

    def created_at_value(doc):
        """Sort helper: return created_at timestamp for stable ordering."""
        value = (doc or {}).get("created_at")
        if isinstance(value, datetime):
            return value
        return datetime.min.replace(tzinfo=timezone.utc)

    sorted_docs = sorted(snapshots, key=created_at_value, reverse=True)

    driver_name_cache: dict[str, Optional[str]] = {}

    def resolve_driver_name(driver_id: Optional[str]) -> Optional[str]:
        """Resolve driver display name with a small in-request cache."""
        if not driver_id:
            return None
        if driver_id in driver_name_cache:
            return driver_name_cache[driver_id]

        doc = db["users"].find_one({"_id": driver_id})
        name = None
        if doc:
            data = doc or {}
            name = data.get("name") or data.get("email")

        driver_name_cache[driver_id] = name
        return name

    results: list[BookingOfficeHistoryResponse] = []
    for doc in sorted_docs:
        booking = serialize_booking(doc)
        data = doc or {}
        driver_name = data.get("driver_name") or resolve_driver_name(booking.driver_id)
        results.append(
            BookingOfficeHistoryResponse(
                **booking.model_dump(exclude={"driver_name"}),
                driver_name=driver_name,
            )
        )

    return results


@router.get("/stats")
def booking_stats(current_user=Depends(get_current_user)):
    """Return simple booking counts grouped by status for office quick views."""
    uid = current_user["uid"]
    ensure_role(uid, ("office_coordinator", "superadmin"))

    def count_status(status_value: str) -> int:
        """Count bookings for a specific status."""
        return db["bookings"].count_documents({"status": status_value})

    return {
        "pending": count_status("pending"),
        "approved": count_status("approved"),
        "rejected": count_status("rejected"),
        "completed": count_status("completed"),
    }
