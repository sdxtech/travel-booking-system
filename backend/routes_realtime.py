"""Same-origin, cookie-authenticated WebSocket endpoint. No tokens in URLs."""
import asyncio
import contextlib
import os
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jwt import InvalidTokenError
from starlette.concurrency import run_in_threadpool

from auth_utils import decode_access_token
from mongo_client import db
from realtime_service import hub

router = APIRouter()
HEARTBEAT_SECONDS = 20


async def send_event(websocket, event):
    await asyncio.wait_for(websocket.send_json(event), timeout=5)


def allowed_origins():
    return {origin.strip().rstrip("/") for origin in (
        os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
        + [os.getenv("APP_PUBLIC_URL", "")]
    ) if origin.strip() and origin.strip() != "*"}


def session_user(token):
    if not token:
        return None
    try:
        claims = decode_access_token(token)
        if not claims.get("sub") or not claims.get("exp"):
            return None
        user = db["users"].find_one({"_id": claims["sub"]}, {"role": 1, "disabled": 1})
        if not user or user.get("disabled") or user.get("role") not in {"driver", "user", "office_coordinator", "superadmin"}:
            return None
        return {"uid": str(claims["sub"]), "role": user["role"], "expires_at": float(claims["exp"])}
    except (InvalidTokenError, TypeError, ValueError):
        return None


@router.websocket("/realtime")
async def realtime(websocket: WebSocket):
    if websocket.headers.get("origin", "").rstrip("/") not in allowed_origins():
        await websocket.close(code=1008)
        return
    token = websocket.cookies.get("access_token")
    try:
        user = await run_in_threadpool(session_user, token)
    except Exception:
        await websocket.close(code=1013)
        return
    if not user:
        await websocket.close(code=1008)
        return
    connection = hub.subscribe(user["uid"], user["role"])
    if connection is None:
        await websocket.close(code=1013)
        return
    receive_task = event_task = None
    try:
        await websocket.accept()
        await send_event(websocket, {"type": "ready"})
        receive_task = asyncio.create_task(websocket.receive())
        event_task = asyncio.create_task(connection.queue.get())
        last_check = time.monotonic()
        while True:
            timeout = max(0, min(HEARTBEAT_SECONDS, user["expires_at"] - time.time()))
            done, _ = await asyncio.wait({receive_task, event_task}, timeout=timeout, return_when=asyncio.FIRST_COMPLETED)
            if user["expires_at"] <= time.time():
                await websocket.close(code=4401)
                break
            if time.monotonic() - last_check >= HEARTBEAT_SECONDS:
                try:
                    fresh_user = await run_in_threadpool(session_user, token)
                except Exception:
                    await websocket.close(code=1013)
                    break
                if not fresh_user or fresh_user["role"] != user["role"]:
                    await websocket.close(code=4401)
                    break
                last_check = time.monotonic()
            if receive_task in done:
                # Clients cannot request arbitrary subscriptions or issue business commands.
                if receive_task.result().get("type") == "websocket.disconnect":
                    break
                await websocket.close(code=1008)
                break
            if event_task in done:
                await send_event(websocket, event_task.result())
                event_task = asyncio.create_task(connection.queue.get())
            elif not done:
                await send_event(websocket, {"type": "heartbeat"})
    except (WebSocketDisconnect, OSError, RuntimeError, TimeoutError):
        pass
    finally:
        hub.unsubscribe(connection)
        for task in (receive_task, event_task):
            if task:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError, WebSocketDisconnect, RuntimeError):
                    await task
