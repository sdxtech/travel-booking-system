from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from main import get_current_user
from mongo_client import db

router = APIRouter(prefix="/locations", tags=["locations"])


class LocationPayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)


class LocationResponse(BaseModel):
    id: str
    name: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


def ensure_allowed_role(uid: str, roles: tuple[str, ...]) -> str:
    user = db["users"].find_one({"_id": uid})
    role = (user or {}).get("role")
    if role not in roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return role


def clean_name(value: str) -> str:
    name = " ".join(str(value or "").split())
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Location name is required")
    return name


def serialize_location(doc: dict) -> LocationResponse:
    return LocationResponse(
        id=str(doc.get("_id")),
        name=doc.get("name", ""),
        created_at=doc.get("created_at"),
        updated_at=doc.get("updated_at"),
    )


@router.get("", response_model=list[LocationResponse])
def list_locations(current_user=Depends(get_current_user)):
    ensure_allowed_role(current_user["uid"], ("user", "office_coordinator", "superadmin"))
    locations = db["booking_locations"].find().sort("name", 1)
    return [serialize_location(location) for location in locations]


@router.post("", response_model=LocationResponse, status_code=status.HTTP_201_CREATED)
def create_location(payload: LocationPayload, current_user=Depends(get_current_user)):
    ensure_allowed_role(current_user["uid"], ("superadmin",))
    name = clean_name(payload.name)
    existing = db["booking_locations"].find_one({"name": {"$regex": f"^{name}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Location already exists")

    now = datetime.now(timezone.utc)
    location = {"_id": uuid4().hex, "name": name, "created_at": now, "updated_at": now}
    db["booking_locations"].insert_one(location)
    return serialize_location(location)


@router.patch("/{location_id}", response_model=LocationResponse)
def update_location(location_id: str, payload: LocationPayload, current_user=Depends(get_current_user)):
    ensure_allowed_role(current_user["uid"], ("superadmin",))
    name = clean_name(payload.name)
    existing = db["booking_locations"].find_one({
        "_id": {"$ne": location_id},
        "name": {"$regex": f"^{name}$", "$options": "i"},
    })
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Location already exists")

    result = db["booking_locations"].find_one_and_update(
        {"_id": location_id},
        {"$set": {"name": name, "updated_at": datetime.now(timezone.utc)}},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    return serialize_location(result)


@router.delete("/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_location(location_id: str, current_user=Depends(get_current_user)):
    ensure_allowed_role(current_user["uid"], ("superadmin",))
    result = db["booking_locations"].delete_one({"_id": location_id})
    if not result.deleted_count:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
