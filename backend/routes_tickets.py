from datetime import date, datetime, time, timezone
from typing import Literal, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from main import get_current_user
from mongo_client import db
from notifications_service import create_user_notification, notify_roles
from request_id_service import generate_request_id

router = APIRouter(prefix="/tickets", tags=["tickets"])


class TicketBase(BaseModel):
    destination: str
    departure_point: str
    departure_date: date
    departure_time: str
    purpose_of_travel: str
    trip_type: str
    hotel_accommodation: bool
    hotel_name: Optional[str] = None
    hotel_location: Optional[str] = None
    transportation_mode: str
    transportation_other: Optional[str] = None
    special_requests: Optional[str] = None
    superior_approval_note: Optional[str] = None
    additional_notes: Optional[str] = None


class TicketCreate(TicketBase):
    full_name: str
    dept_job_position: Optional[str] = None
    phone_number: str
    email: str
    national_id: str


class TicketUserCreate(TicketBase):
    pass


class TicketResponse(TicketCreate):
    id: str
    request_id: Optional[str] = None
    user_id: Optional[str] = None
    status: str = Field(default="pending")
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class TicketStatusUpdate(BaseModel):
    status: Literal["approved", "rejected"]


def serialize_ticket(doc_snapshot) -> TicketResponse:
    """Convert a MongoDB ticket document into the API response model."""
    data = doc_snapshot or {}
    return TicketResponse(
        id=str(data.get("_id")),
        request_id=data.get("request_id"),
        user_id=data.get("user_id"),
        full_name=data.get("full_name"),
        dept_job_position=data.get("dept_job_position"),
        phone_number=data.get("phone_number"),
        email=data.get("email"),
        national_id=data.get("national_id"),
        destination=data.get("destination"),
        departure_point=data.get("departure_point"),
        departure_date=data.get("departure_date"),
        departure_time=data.get("departure_time"),
        purpose_of_travel=data.get("purpose_of_travel"),
        trip_type=data.get("trip_type"),
        hotel_accommodation=data.get("hotel_accommodation"),
        hotel_name=data.get("hotel_name"),
        hotel_location=data.get("hotel_location"),
        transportation_mode=data.get("transportation_mode"),
        transportation_other=data.get("transportation_other"),
        special_requests=data.get("special_requests"),
        superior_approval_note=data.get("superior_approval_note"),
        additional_notes=data.get("additional_notes"),
        status=data.get("status", "pending"),
        created_at=data.get("created_at"),
        updated_at=data.get("updated_at"),
    )


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_email(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    return value.strip().lower()


def ensure_user_role(uid: str):
    """Ensure the given uid exists and has role `user`; returns the user profile data."""
    doc = db["users"].find_one({"_id": uid})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User profile not found")

    data = doc or {}
    role = data.get("role")
    if role != "user":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return data


def ensure_role(uid: str, allowed: tuple[str, ...]):
    """Ensure the user has one of the allowed roles."""
    doc = db["users"].find_one({"_id": uid})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User profile not found")
    role = (doc or {}).get("role")
    if role not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.get("/pending", response_model=list[TicketResponse])
def list_pending_tickets(current_user=Depends(get_current_user)):
    """List pending travel requests for office coordinators and superadmins."""
    uid = current_user["uid"]
    ensure_role(uid, ("office_coordinator", "superadmin"))

    snapshots = db["tickets"].find({"status": "pending"}).sort("created_at", -1)
    return [serialize_ticket(doc) for doc in snapshots]


@router.get("/history", response_model=list[TicketResponse])
def list_ticket_history(current_user=Depends(get_current_user)):
    """List every travel request status for the combined office request/history view."""
    uid = current_user["uid"]
    ensure_role(uid, ("office_coordinator", "superadmin"))

    snapshots = list(db["tickets"].find({}))

    def created_at_value(doc):
        """Sort helper: return created_at timestamp for stable ordering."""
        value = (doc or {}).get("created_at")
        if isinstance(value, datetime):
            return value
        return datetime.min.replace(tzinfo=timezone.utc)

    sorted_docs = sorted(snapshots, key=created_at_value, reverse=True)
    return [serialize_ticket(doc) for doc in sorted_docs]


@router.post("", response_model=TicketResponse)
def create_ticket(payload: TicketUserCreate, current_user=Depends(get_current_user)):
    """Create a new travel request using the current user's saved profile fields."""
    uid = current_user["uid"]
    user_profile = ensure_user_role(uid)

    full_name = user_profile.get("name") or user_profile.get("full_name")
    dept_job_position = user_profile.get("dept_job_position") or user_profile.get("department") or user_profile.get("job_position")
    phone_number = user_profile.get("phone") or user_profile.get("phone_number")
    national_id = user_profile.get("nik") or user_profile.get("national_id")
    email = user_profile.get("email") or current_user.get("email")

    missing_fields = []
    if not full_name:
        missing_fields.append("name")
    if not phone_number:
        missing_fields.append("phone")
    if not national_id:
        missing_fields.append("nik")
    if not email:
        missing_fields.append("email")

    if missing_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User profile incomplete. Missing: {', '.join(missing_fields)}",
        )

    departure_date_value = payload.departure_date
    if isinstance(departure_date_value, date) and not isinstance(departure_date_value, datetime):
        departure_date_value = datetime.combine(departure_date_value, time.min)

    created_at = utc_now()
    data = {
        **payload.model_dump(),
        "departure_date": departure_date_value,
        "full_name": str(full_name),
        "dept_job_position": dept_job_position,
        "phone_number": str(phone_number),
        "email": str(email),
        "national_id": str(national_id),
        "user_id": uid,
        "status": "pending",
        "created_at": created_at,
        "updated_at": created_at,
    }

    ticket_id = uuid4().hex
    data["_id"] = ticket_id
    data["request_id"] = generate_request_id(db, "TR", created_at)
    db["tickets"].insert_one(data)

    create_user_notification(
        uid,
        "Your travel request was submitted successfully. Status is pending and waiting for office coordinator approval.",
        event="submitted",
        entity_type="ticket",
        entity_id=ticket_id,
        status="pending",
        actor_id=uid,
    )

    notify_roles(
        ("office_coordinator", "superadmin"),
        "New travel request submitted. Status is pending and awaiting review.",
        event="incoming_request",
        entity_type="ticket",
        entity_id=ticket_id,
        status="pending",
        actor_id=uid,
    )

    snapshot = db["tickets"].find_one({"_id": ticket_id})
    return serialize_ticket(snapshot)


@router.post("/accommodation", response_model=TicketResponse)
def create_travel_accommodation(payload: TicketCreate, current_user=Depends(get_current_user)):
    """Office-side endpoint to create a travel request on behalf of a user."""
    uid = current_user["uid"]
    ensure_role(uid, ("office_coordinator", "superadmin"))

    linked_user_id = None
    requester_email = normalize_email(payload.email)
    if requester_email:
        user_doc = db["users"].find_one({"email": requester_email})
        if user_doc:
            linked_user_id = str(user_doc.get("_id"))

    departure_date_value = payload.departure_date
    if isinstance(departure_date_value, date) and not isinstance(departure_date_value, datetime):
        departure_date_value = datetime.combine(departure_date_value, time.min)

    created_at = utc_now()
    data = {
        **payload.model_dump(),
        "departure_date": departure_date_value,
        "user_id": linked_user_id,
        "status": "pending",
        "created_by": uid,
        "created_at": created_at,
        "updated_at": created_at,
    }

    ticket_id = uuid4().hex
    data["_id"] = ticket_id
    data["request_id"] = generate_request_id(db, "TR", created_at)
    db["tickets"].insert_one(data)

    if linked_user_id:
        create_user_notification(
            linked_user_id,
            "A travel request has been created for you by the office coordinator. Status is pending and waiting for approval.",
        event="created_by_office",
        entity_type="ticket",
        entity_id=ticket_id,
        status="pending",
        actor_id=uid,
    )

    snapshot = db["tickets"].find_one({"_id": ticket_id})
    return serialize_ticket(snapshot)


@router.patch("/{ticket_id}/status", response_model=TicketResponse)
def update_ticket_status(ticket_id: str, payload: TicketStatusUpdate, current_user=Depends(get_current_user)):
    """Approve or reject a ticket request and notify the requester if linked."""
    uid = current_user["uid"]
    ensure_role(uid, ("office_coordinator", "superadmin"))

    snapshot = db["tickets"].find_one({"_id": ticket_id})
    if not snapshot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    ticket_data = snapshot or {}

    db["tickets"].update_one(
        {"_id": ticket_id},
        {
            "$set": {
                "status": payload.status,
                "processed_by": uid,
                "updated_at": utc_now(),
            }
        },
    )

    user_id = ticket_data.get("user_id")
    if user_id:
        if payload.status == "approved":
            message = "Your travel request has been approved."
        else:
            message = "Your travel request has been rejected."

        create_user_notification(
            user_id,
            message,
            event="status_updated",
            entity_type="ticket",
            entity_id=ticket_id,
            status=payload.status,
            actor_id=uid,
        )

    updated_snapshot = db["tickets"].find_one({"_id": ticket_id})
    return serialize_ticket(updated_snapshot)


@router.patch("/{ticket_id}", response_model=TicketResponse)
def update_ticket(ticket_id: str, payload: TicketUserCreate, current_user=Depends(get_current_user)):
    """Allow a user to edit their own pending travel request."""
    uid = current_user["uid"]
    ensure_user_role(uid)

    snapshot = db["tickets"].find_one({"_id": ticket_id})
    if not snapshot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    ticket_data = snapshot or {}
    if ticket_data.get("user_id") != uid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if ticket_data.get("status", "pending") != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending tickets can be edited")

    departure_date_value = payload.departure_date
    if isinstance(departure_date_value, date) and not isinstance(departure_date_value, datetime):
        departure_date_value = datetime.combine(departure_date_value, time.min)

    update_data = {
        **payload.model_dump(),
        "departure_date": departure_date_value,
        "updated_at": utc_now(),
    }

    db["tickets"].update_one({"_id": ticket_id}, {"$set": update_data})

    create_user_notification(
        uid,
        "Your travel request was updated successfully. Status is pending and waiting for office coordinator approval.",
        event="updated",
        entity_type="ticket",
        entity_id=ticket_id,
        status="pending",
        actor_id=uid,
    )

    updated_snapshot = db["tickets"].find_one({"_id": ticket_id})
    return serialize_ticket(updated_snapshot)


@router.patch("/{ticket_id}/cancel", response_model=TicketResponse)
def cancel_ticket(ticket_id: str, current_user=Depends(get_current_user)):
    """Allow a user to cancel their own pending travel request."""
    uid = current_user["uid"]
    ensure_user_role(uid)

    snapshot = db["tickets"].find_one({"_id": ticket_id})
    if not snapshot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    ticket_data = snapshot or {}
    if ticket_data.get("user_id") != uid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if ticket_data.get("status", "pending") != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending tickets can be canceled")

    db["tickets"].update_one(
        {"_id": ticket_id},
        {
            "$set": {
                "status": "cancelled",
                "cancelled_by": uid,
                "updated_at": utc_now(),
            }
        },
    )

    create_user_notification(
        uid,
        "Your travel request has been cancelled.",
        event="cancelled",
        entity_type="ticket",
        entity_id=ticket_id,
        status="cancelled",
        actor_id=uid,
    )

    updated_snapshot = db["tickets"].find_one({"_id": ticket_id})
    return serialize_ticket(updated_snapshot)


@router.get("/my", response_model=list[TicketResponse])
def list_my_tickets(current_user=Depends(get_current_user)):
    """List travel requests created by the current user (newest first)."""
    uid = current_user["uid"]
    ensure_user_role(uid)

    snapshots = db["tickets"].find({"user_id": uid}).sort("created_at", -1)
    return [serialize_ticket(doc) for doc in snapshots]


@router.get("/stats")
def ticket_stats(current_user=Depends(get_current_user)):
    """Return simple ticket counts grouped by status for office quick views."""
    uid = current_user["uid"]
    ensure_role(uid, ("office_coordinator", "superadmin"))

    return {
        "pending": db["tickets"].count_documents({"status": "pending"}),
        "approved": db["tickets"].count_documents({"status": "approved"}),
        "rejected": db["tickets"].count_documents({"status": "rejected"}),
    }
