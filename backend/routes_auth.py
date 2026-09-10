from datetime import datetime

from fastapi import APIRouter, HTTPException, status, Response, Depends
from pydantic import BaseModel, Field
from bson import ObjectId
from main import get_current_user

from auth_utils import create_access_token, verify_password, hash_password, get_jwt_expires_hours
from mongo_client import db
from notifications_service import create_user_notification



router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=1)
    remember_me: bool = False


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime

class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    confirm_password: str = Field(..., min_length=6)
    new_password: str = Field(..., min_length=6)


@router.post("/login")
def login(payload: LoginRequest, response: Response,):
    email = payload.email.strip().lower()
    user = db["users"].find_one({
        "email": email
    })
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    if user.get("disabled"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled"
        )
    password_hash = user.get("password_hash")
    if (
        not password_hash
        or not verify_password(payload.password, password_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    if payload.remember_me:
        expires_hours = 24 * 30  
        cookie_max_age = 60 * 60 * 24 * 30
    else:
        expires_hours = get_jwt_expires_hours()
        cookie_max_age = expires_hours * 60 * 60

    token, expires_at = create_access_token(
        user_id=str(user.get("_id")),
        email=email,
        expires_hours=expires_hours,
    )
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=False,  
        samesite="lax",
        max_age=cookie_max_age,
        path="/",
    )
    return {
        "message": "Login successful",
        "expires_at": expires_at,
        "remember_me": payload.remember_me,
    }

@router.patch("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    current_user=Depends(get_current_user),
):
    user_id = current_user["uid"]
    user = db["users"].find_one({
        "_id": user_id
    })
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    if payload.new_password != payload.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password and confirmation password do not match"
        )
    if not verify_password(
        payload.current_password,
        user.get("password_hash", "")
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    if verify_password(
        payload.new_password,
        user.get("password_hash", "")
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from your current password"
        )
    new_password_hash = hash_password(
        payload.new_password
    )
    result = db["users"].update_one(
        {
            "_id": user_id
        },
        {
            "$set": {
                "password_hash": new_password_hash
            }
        }
    )
    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update password"
        )
    create_user_notification(
        user_id=user_id,
        message="Your password was changed successfully.",
        event="password_changed",
        entity_type="user",
        entity_id=user_id,
        status="success",
        actor_id=user_id,
    )
    return {
        "message": "Password changed successfully"
    }
    
@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(
    key="access_token",
    path="/",
    secure=False,
    httponly=True,
    samesite="lax",
)

    return {
        "message": "Logout successful"
    }

@router.get("/me")
def get_current_user_profile(current_user=Depends(get_current_user)):
    uid = current_user["uid"]
    user = db["users"].find_one({"_id": uid})
    role = user["role"]
    if role == "superadmin":
        pages = db["pages"].find({
            "is_active": True
        })
        permissions = [
            page["key"]
            for page in pages
        ]
    else:
        permissions = []
        permission_docs = db[
            "role_page_permissions"
        ].find({
            "role": role,
            "enabled": True,
        })
        page_ids = [
            doc["page_id"]
            for doc in permission_docs
        ]
        pages = db["pages"].find({
            "_id": {
                "$in": page_ids
            },
            "is_active": True,
        })
        permissions = [
            page["key"]
            for page in pages
        ]
    return {
        "uid": user["_id"],
        "name": user["name"],
        "role": role,
        "permissions": permissions,
    }
