from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jwt import ExpiredSignatureError, InvalidTokenError

from auth_utils import decode_access_token
from mongo_client import db

from websocket_manager import manager


router = APIRouter(tags=["websocket"])


def authenticate_websocket(websocket: WebSocket):

    token = websocket.cookies.get("access_token")

    if not token:
        return None

    try:
        decoded = decode_access_token(token)

    except (ExpiredSignatureError, InvalidTokenError):
        return None

    uid = decoded.get("sub")

    if not uid:
        return None

    user_doc = db["users"].find_one({
        "_id": uid
    })

    if not user_doc:
        return None

    if user_doc.get("disabled"):
        return None

    return {
        "uid": str(user_doc["_id"]),
        "email": user_doc.get("email"),
        "role": user_doc.get("role"),
    }


@router.websocket("/ws/notifications")
async def notification_websocket(websocket: WebSocket):

    current_user = authenticate_websocket(websocket)

    if not current_user:
        await websocket.close(code=1008)
        return

    uid = current_user["uid"]

    await manager.connect(
        uid,
        websocket,
    )

    print(f"Notification WebSocket connected: {uid}")

    try:

        while True:

            # Keep connection alive and wait for client messages.
            await websocket.receive_text()

    except WebSocketDisconnect:

        manager.disconnect(uid,)

        print(
            f"Notification WebSocket disconnected: {uid}"
        )

@router.websocket("/ws/bookings/assigned")
async def assigned_bookings_websocket(websocket: WebSocket):

    current_user = authenticate_websocket(websocket)

    if not current_user:
        await websocket.close(code=1008)
        return

    if current_user["role"] != "driver":
        await websocket.close(code=1008)
        return

    uid = current_user["uid"]

    await manager.connect(uid, websocket)

    print(f"Assigned booking WebSocket connected: {uid}")

    try:
        while True:
            await websocket.receive_text()

    except WebSocketDisconnect:
        manager.disconnect(uid, websocket)

        print(f"Assigned booking WebSocket disconnected: {uid}")