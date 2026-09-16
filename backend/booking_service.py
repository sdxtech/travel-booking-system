from websocket_manager import manager
from typing import Literal, Optional
from pydantic import BaseModel, Field
from datetime import datetime, timedelta, timezone
from mongo_client import db



class BookingResponse(BaseModel):
    cancellation_status: Optional[str] = None
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
        cancellation_status=data.get("cancellation_status"),
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


async def notify_booking_assigned(booking):
    driver_id = booking.get("driver_id")

    if not driver_id:
        return

    await manager.send_to_user(
        driver_id,
        {
            "type": "booking_assigned",
            "data": serialize_booking(booking),
        },
    )