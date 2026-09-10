from fastapi import HTTPException, status

from mongo_client import db


def enforce_employee_page_permission(user_id: str, page_key: str) -> None:
    """Enforce configured page access for employees; other roles keep role-based access."""
    user = db["users"].find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User profile not found")
    if user.get("disabled"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")
    if user.get("role") != "user":
        return

    page = db["pages"].find_one({"key": page_key, "is_active": True})
    if not page:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Page not found")

    permission = db["role_page_permissions"].find_one({
        "role": "user",
        "page_id": page["_id"],
        "enabled": True,
    })
    if not permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this page",
        )
