from datetime import datetime, timezone
from typing import Any, Optional

from mongo_client import db


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def record_audit_event(
    *,
    action: str,
    status: str,
    actor: Optional[dict[str, Any]] = None,
    path: Optional[str] = None,
    target: Optional[str] = None,
    details: Optional[dict[str, Any]] = None,
    ip_address: Optional[str] = None,
) -> None:
    """Persist audit data without ever blocking the primary user workflow."""
    try:
        actor_data = actor or {}
        db["audit_logs"].insert_one({
            "action": action,
            "status": status,
            "actor_id": actor_data.get("uid"),
            "actor_email": actor_data.get("email"),
            "actor_role": actor_data.get("role"),
            "path": path,
            "target": target,
            "details": details or {},
            "ip_address": ip_address,
            "created_at": utc_now(),
        })
    except Exception:
        # Audit storage must not break booking, password, or account workflows.
        return
