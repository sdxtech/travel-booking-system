import os

from dotenv import load_dotenv

app_env = os.getenv("APP_ENV", "").lower()
if app_env == "staging":
    load_dotenv(".env.staging")
else:
    load_dotenv(".env.local")
load_dotenv()

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from jwt import ExpiredSignatureError, InvalidTokenError

from auth_utils import decode_access_token, get_jwt_secret
from mongo_client import db, init_mongo

app = FastAPI()

origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()


@app.on_event("startup")
def startup_event():
    """Initialize backend dependencies once the app starts."""
    init_mongo()
    get_jwt_secret()


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(security),
):
    """Validate the auth token and return the decoded user payload."""
    token = creds.credentials
    try:
        decoded = decode_access_token(token)
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
        )
    except InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    uid = decoded.get("sub")
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user_doc = db["users"].find_one({"_id": uid})
    if not user_doc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    if user_doc.get("disabled"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )

    return {
        "uid": uid,
        "email": user_doc.get("email"),
        "role": user_doc.get("role"),
    }


from routes_bookings import router as bookings_router
from routes_auth import router as auth_router
from routes_notifications import router as notifications_router
from routes_tickets import router as tickets_router
from routes_users_admin import router as users_router


@app.get("/health")
def health_check():
    """Basic health check for load balancers/uptime monitors."""
    return {"status": "ok"}


@app.get("/healthz")
def healthz_check():
    """Kubernetes-style health endpoint (alias of /health)."""
    return {"status": "ok"}


@app.get("/users/me")
def get_me(current_user=Depends(get_current_user)):
    """Return the current user's profile summary used by the frontend."""
    uid = current_user["uid"]
    doc = db["users"].find_one({"_id": uid})
    if not doc:
        raise HTTPException(status_code=404, detail="User profile not found")

    data = doc
    return {
        "uid": uid,
        "email": current_user.get("email"),
        "name": data.get("name"),
        "role": data.get("role"),
    }


app.include_router(bookings_router)
app.include_router(auth_router)
app.include_router(notifications_router)
app.include_router(tickets_router)
app.include_router(users_router)
