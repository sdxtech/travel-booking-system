from datetime import datetime, timezone
from typing import Any, Optional

from mongo_client import db


SENSITIVE_KEYS = {
    "password", "password_hash", "new_password", "confirm_password", "token", "token_hash",
    "file_base64", "telegram_link_hash", "telegram_link_expires_at",
}
IGNORED_CHANGE_KEYS = {"_id", "created_at", "updated_at", "created_by", "updated_by", "invited_at", "invited_by"}


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


def safe_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): safe_value(item) for key, item in value.items() if str(key) not in SENSITIVE_KEYS}
    if isinstance(value, list):
        return [safe_value(item) for item in value]
    return value


def audit_changes(before: Optional[dict[str, Any]], after: Optional[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return safe, human-reviewable before/after field changes."""
    before_data = before or {}
    after_data = after or {}
    changes = []
    for key in sorted(set(before_data) | set(after_data)):
        if key in SENSITIVE_KEYS or key in IGNORED_CHANGE_KEYS:
            continue
        old_value = safe_value(before_data.get(key))
        new_value = safe_value(after_data.get(key))
        if old_value != new_value:
            changes.append({"field": key, "before": old_value, "after": new_value})
    return changes


def safe_request_details(payload: Any) -> dict[str, Any]:
    """Keep create/update input reviewable while excluding credentials and files."""
    if not isinstance(payload, dict):
        return {}
    return safe_value({key: value for key, value in payload.items() if key not in SENSITIVE_KEYS})
