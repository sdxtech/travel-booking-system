import os
import hashlib
import secrets

from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from main import get_current_user
from bson import ObjectId


from auth_utils import create_access_token, verify_password, hash_password, get_jwt_expires_hours
from mongo_client import db
from notifications_service import create_user_notification
from email_service import send_password_reset_email, send_notification_email


router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=1)
    remember_me: bool = False


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    confirm_password: str = Field(..., min_length=6)
    new_password: str = Field(..., min_length=6)

class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6)
    confirm_password: str = Field(..., min_length=6)
    
class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=3)
    
def use_secure_cookie() -> bool:
    return os.getenv("APP_ENV", "development").strip().lower() == "production"


@router.post("/login")
def login(payload: LoginRequest, response: Response):
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
        cookie_max_age = None

    token, expires_at = create_access_token(
        user_id=str(user.get("_id")),
        email=email,
        expires_hours=expires_hours,
    )
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=use_secure_cookie(),
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
    secure=use_secure_cookie(),
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

@router.post("/forgot-password")
def forgot_password(
    payload: ForgotPasswordRequest,
):
    email = payload.email.strip().lower()

    user = db["users"].find_one({
        "email": email
    })

    if not user:
        return {
            "message": (
                "If an account exists with this email, "
                "a password reset link has been sent."
            )
        }

    # Generate raw token
    token = secrets.token_urlsafe(32)

    # Store only hash
    token_hash = hashlib.sha256(
        token.encode()
    ).hexdigest()

    now = datetime.now(timezone.utc)

    expires_at = now + timedelta(
        minutes=30
    )

    db["password_reset_tokens"].insert_one({
        "user_id": str(user["_id"]),
        "token_hash": token_hash,
        "expires_at": expires_at,
        "used": False,
        "created_at": now,
    })

    reset_url = (
        f"{os.getenv('APP_PUBLIC_URL')}"
        f"/reset-password?token={token}"
    )

    send_password_reset_email(
        to_email=user["email"],
        recipient_name=user.get("name"),
        reset_url=reset_url,
    )

    return {
        "message": (
            "If an account exists with this email, "
            "a password reset link has been sent."
        )
    }

@router.post("/test-email")
def test_email():
    email_id = send_notification_email(
        to_email="raihanlail07@gmail.com",
        recipient_name="Test User",
        message="This is a test email from BDTR.",
        event="test",
        entity_type="booking",
        notification_id="test-email-001",
    )

    print("RESEND EMAIL ID:", email_id)

    return {
        "success": email_id is not None,
        "email_id": email_id,
    }
    

@router.post("/reset-password")
def reset_password(
    payload: ResetPasswordRequest,
):
    if payload.new_password != payload.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match"
        )

    token_hash = hashlib.sha256(
        payload.token.encode()
    ).hexdigest()

    reset_record = db[
        "password_reset_tokens"
    ].find_one({
        "token_hash": token_hash,
        "used": False,
    })

    if not reset_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )

    now = datetime.now(timezone.utc)

    if reset_record["expires_at"] < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )

    new_password_hash = hash_password(
        payload.new_password
    )

    result = db["users"].update_one(
        {
            "_id": reset_record["user_id"]
            
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
            detail="Failed to reset password"
        )

    # Make token single-use
    db[
        "password_reset_tokens"
    ].update_one(
        {
            "_id": reset_record["_id"]
        },
        {
            "$set": {
                "used": True
            }
        }
    )

    return {
        "message": "Password reset successfully"
    }