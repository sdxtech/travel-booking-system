from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from main import get_current_user
from mongo_client import db


router = APIRouter(prefix="/audit-logs", tags=["audit logs"])


class AuditLogItem(BaseModel):
    id: str
    action: str
    status: str
    actor_email: Optional[str] = None
    actor_role: Optional[str] = None
    path: Optional[str] = None
    target: Optional[str] = None
    details: dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None


class AuditLogResponse(BaseModel):
    items: list[AuditLogItem]
    total: int


def require_superadmin(current_user: dict) -> None:
    if current_user.get("role") != "superadmin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super Admin access required")


@router.get("", response_model=AuditLogResponse)
def list_audit_logs(
    search: str = "",
    page: int = 1,
    page_size: int = 25,
    current_user=Depends(get_current_user),
):
    require_superadmin(current_user)
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    query: dict[str, Any] = {}
    normalized_search = search.strip()
    if normalized_search:
        query["$or"] = [
            {"action": {"$regex": normalized_search, "$options": "i"}},
            {"actor_email": {"$regex": normalized_search, "$options": "i"}},
            {"actor_role": {"$regex": normalized_search, "$options": "i"}},
            {"path": {"$regex": normalized_search, "$options": "i"}},
            {"target": {"$regex": normalized_search, "$options": "i"}},
            {"details.email": {"$regex": normalized_search, "$options": "i"}},
        ]

    total = db["audit_logs"].count_documents(query)
    logs = list(db["audit_logs"].find(query).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size))
    return AuditLogResponse(
        total=total,
        items=[AuditLogItem(
            id=str(item.get("_id")), action=item.get("action") or "Unknown activity",
            status=item.get("status") or "unknown", actor_email=item.get("actor_email"),
            actor_role=item.get("actor_role"), path=item.get("path"), target=item.get("target"),
            details=item.get("details") or {}, created_at=item.get("created_at"),
        ) for item in logs],
    )
