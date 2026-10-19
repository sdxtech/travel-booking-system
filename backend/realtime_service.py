"""Authenticated invalidation events. Business data stays behind the existing APIs."""
import asyncio
import contextlib
import json
import logging
import os
from dataclasses import dataclass, field
from uuid import uuid4

import redis.asyncio as redis_async

from cache_service import _redis_client, invalidate_response_cache
from mongo_client import db

logger = logging.getLogger(__name__)
CHANNEL = "booking-app:realtime"
OFFICE_ROLES = ("office_coordinator", "superadmin")
CALENDAR_ROLES = ("user", *OFFICE_ROLES)
ALL_TOPICS = ("bookings", "tickets", "calendars", "availability", "notifications", "users", "settings", "locations", "permissions", "profile")


@dataclass(eq=False)
class Subscription:
    uid: str
    role: str
    queue: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=32))


class RealtimeHub:
    def __init__(self):
        self.source = uuid4().hex
        self.loop = None
        self.connections = set()
        self.broker_task = None

    async def start(self):
        self.source = uuid4().hex  # Distinct even when an app is preloaded before worker forks.
        self.loop = asyncio.get_running_loop()
        self.broker_task = asyncio.create_task(self._listen())

    async def stop(self):
        if self.broker_task:
            self.broker_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self.broker_task
        self.broker_task = None
        self.loop = None
        self.connections.clear()

    def subscribe(self, uid, role):
        if len(self.connections) >= 500 or sum(item.uid == uid for item in self.connections) >= 8:
            return None
        connection = Subscription(uid, role)
        self.connections.add(connection)
        return connection

    def unsubscribe(self, connection):
        self.connections.discard(connection)

    def deliver(self, event):
        for connection in tuple(self.connections):
            if connection.uid not in event.get("users", ()) and connection.role not in event.get("roles", ()):
                continue
            topics = [topic for topic in event.get("topics", ()) if topic in ALL_TOPICS]
            if not topics:
                continue
            payload = {"type": "changed", "topics": topics}
            if connection.queue.full():
                while not connection.queue.empty():
                    connection.queue.get_nowait()
                payload = {"type": "resync", "topics": list(ALL_TOPICS)}
            connection.queue.put_nowait(payload)

    def publish(self, topics, *, users=(), roles=()):
        if self.loop is None or self.loop.is_closed():
            return
        event = {
            "source": self.source,
            "topics": list(topics),
            "users": list({str(uid) for uid in users if uid}),
            "roles": list(roles),
        }
        try:
            self.loop.call_soon_threadsafe(self.deliver, event)
            _redis_client().publish(CHANNEL, json.dumps(event))
        except Exception:
            # Local delivery and periodic reconciliation continue if Redis is unavailable.
            logger.debug("Realtime broker unavailable; local delivery remains active")

    async def _listen(self):
        while True:
            client = redis_async.Redis.from_url(
                os.getenv("REDIS_URL", "redis://localhost:6379/0"),
                decode_responses=True, socket_connect_timeout=1, socket_timeout=2,
            )
            try:
                async with client.pubsub() as subscription:
                    await subscription.subscribe(CHANNEL)
                    # Recover events missed during a broker outage/reconnection.
                    self.deliver({"topics": ALL_TOPICS, "roles": (*CALENDAR_ROLES, "driver")})
                    while True:
                        message = await subscription.get_message(ignore_subscribe_messages=True, timeout=1)
                        if message and message.get("type") == "message":
                            event = json.loads(message["data"])
                            if isinstance(event, dict) and event.get("source") != self.source:
                                self.deliver(event)
                        await asyncio.sleep(0.01)
            except (OSError, ValueError, redis_async.RedisError):
                await asyncio.sleep(2)
            finally:
                await client.aclose()


hub = RealtimeHub()


def publish_document_change(collection, entity_id, previous=None):
    """Called immediately after a committed write, before synchronous email delivery."""
    if hub.loop is None:
        return
    try:
        current = db[collection].find_one({"_id": entity_id}) or {}
        previous = previous or {}
        users = [current.get("user_id"), current.get("driver_id"), previous.get("user_id"), previous.get("driver_id")]
        invalidate_response_cache()
        topic = "bookings" if collection == "bookings" else "tickets"
        hub.publish((topic,), users=users, roles=OFFICE_ROLES)
        if collection == "bookings":
            hub.publish(("calendars", "availability"), roles=CALENDAR_ROLES)
    except Exception:
        logger.warning("Realtime update deferred to the next synchronization")


def publish_notification(user_id, event):
    if hub.loop is None:
        return
    hub.publish(("notifications",), users=(user_id,))
    if event == "driver_availability_updated":
        invalidate_response_cache()
        hub.publish(("availability", "calendars", "users"), roles=CALENDAR_ROLES)


def publish_api_change(path, actor_uid=None):
    """Other shared resources, emitted only after a successful HTTP mutation."""
    if path.startswith("/notifications"):
        hub.publish(("notifications",), users=(actor_uid,))
    elif path.startswith("/users") or path == "/auth/change-password":
        hub.publish(("users", "availability", "calendars"), roles=CALENDAR_ROLES)
        uid = path.split("/")[2] if path.startswith("/users/") else actor_uid
        hub.publish(("profile",), users=(uid, actor_uid))
    elif path.startswith("/settings/drivers"):
        hub.publish(("users", "availability", "calendars"), roles=CALENDAR_ROLES)
    elif path.startswith("/settings"):
        hub.publish(("settings",), roles=CALENDAR_ROLES)
    elif path.startswith("/pages"):
        hub.publish(("permissions",), roles=CALENDAR_ROLES)
    elif path.startswith("/locations"):
        hub.publish(("locations",), roles=CALENDAR_ROLES)
