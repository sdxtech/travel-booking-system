import os
from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def get_jwt_secret() -> str:
    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET is not set.")
    return secret


def get_jwt_algorithm() -> str:
    return os.getenv("JWT_ALGORITHM", "HS256")


def get_jwt_expires_hours() -> int:
    value = os.getenv("JWT_EXPIRES_HOURS", "8")
    try:
        hours = int(value)
    except ValueError as exc:
        raise RuntimeError("JWT_EXPIRES_HOURS must be an integer") from exc
    if hours < 1:
        raise RuntimeError("JWT_EXPIRES_HOURS must be at least 1")
    return hours


def create_access_token(*, user_id: str, email: str) -> tuple[str, datetime]:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=get_jwt_expires_hours())
    payload = {
        "sub": user_id,
        "email": email,
        "iat": int(now.timestamp()),
        "exp": expires_at,
    }
    token = jwt.encode(payload, get_jwt_secret(), algorithm=get_jwt_algorithm())
    return token, expires_at


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, get_jwt_secret(), algorithms=[get_jwt_algorithm()])
