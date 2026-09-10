from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from main import get_current_user
from mongo_client import db

router = APIRouter(prefix="/pages", tags=["permissions"])

class PagePermissionUpdate(BaseModel):
    role: Literal["user", "office_coordinator"]
    page_id: str
    enabled: bool

def ensure_role(uid: str, allowed: tuple[str, ...]):
    """Return the user's role and enforce the allowed roles."""
    doc = db["users"].find_one({"_id": uid})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User profile not found")

    role = (doc or {}).get("role")
    if (doc or {}).get("disabled"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")
    if role not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return role

@router.get("")
def get_pages(current_user=Depends(get_current_user),):
    uid = current_user["uid"]
    ensure_role(uid,("superadmin",))
    pages = list(db["pages"].find({"is_active": True}).sort("name", 1))
    return [
        {
            "id": page["_id"],
            "name": page["name"],
            "key": page["key"],
            "path": page["path"],
            "description": page.get("description"),
            "is_active": page.get("is_active", True),
        }
        for page in pages
    ]

@router.get("/permissions/{role}")
def get_role_permissions(role: str, current_user=Depends(get_current_user),):
    uid = current_user["uid"]
    actor_role = ensure_role(uid, ("superadmin", "user", "driver", "office_coordinator"))
    if role not in {"user", "driver", "office_coordinator"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")
    if actor_role != "superadmin" and role != actor_role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    pages = list(db["pages"].find({"is_active": True}).sort("name", 1))
    permissions = db["role_page_permissions"].find({
        "role": role
    })
    permission_map = {
        permission["page_id"]: permission.get("enabled", False)
        for permission in permissions
    }
    return [
        {
            "page_id": page["_id"],
            "name": page["name"],
            "key": page["key"],
            "path": page["path"],
            "enabled": permission_map.get(
                page["_id"],
                # Coordinator pages predate configurable permissions. Keep
                # existing pages available until an admin explicitly turns
                # them off; explicit False records still remain respected.
                role == "office_coordinator"
            ),
        }
        for page in pages
    ]

@router.put("/permissions")
def update_page_permission(
    payload: PagePermissionUpdate,
    current_user=Depends(get_current_user),
):
    uid = current_user["uid"]

    ensure_role(
        uid,
        ("superadmin",)
    )

    page = db["pages"].find_one({
        "_id": payload.page_id
    })

    if not page:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Page not found",
        )

    if payload.role == "superadmin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Superadmin permissions cannot be modified",
        )

    db["role_page_permissions"].update_one(
        {
            "role": payload.role,
            "page_id": payload.page_id,
        },
        {
            "$set": {
                "enabled": payload.enabled,
            }
        },
        upsert=True,
    )


    return {
        "message": "Page permission updated successfully",
        "role": payload.role,
        "page_id": payload.page_id,
        "enabled": payload.enabled,
    }
