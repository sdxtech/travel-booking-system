import asyncio
import json
import os
import time
import unittest
from contextlib import asynccontextmanager
from unittest.mock import Mock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from auth_utils import create_access_token
import realtime_service as service
import routes_realtime as routes


class RealtimeTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {
            "JWT_SECRET": "realtime-test-secret-do-not-use-in-production", "APP_ENV": "development",
            "CORS_ORIGINS": "https://booking.example.com", "APP_PUBLIC_URL": "https://driver.pesan.biz",
        })
        self.env.start()
        self.addCleanup(self.env.stop)
        self.users = Mock()
        self.users.find_one.side_effect = lambda query, *_: {
            "d1": {"role": "driver"}, "d2": {"role": "driver"},
            "u1": {"role": "user"}, "o1": {"role": "office_coordinator"},
        }.get(query["_id"])
        self.db_patch = patch.object(routes, "db", {"users": self.users})
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)
        self.redis_patch = patch.object(service, "_redis_client", return_value=Mock())
        self.redis_patch.start()
        self.addCleanup(self.redis_patch.stop)

    def headers(self, uid="d1", origin="https://driver.pesan.biz", token=None):
        token = token or create_access_token(user_id=uid, email="test@example.com")[0]
        return {"origin": origin, "cookie": f"access_token={token}"}

    def client(self):
        async def no_broker():
            await asyncio.Event().wait()

        @asynccontextmanager
        async def lifespan(app):
            with patch.object(service.hub, "_listen", no_broker):
                await service.hub.start()
                try:
                    yield
                finally:
                    await service.hub.stop()

        app = FastAPI(lifespan=lifespan)
        app.include_router(routes.router)
        return TestClient(app)

    def test_authentication_and_origin_are_required_before_accept(self):
        for headers in ({}, {"origin": "https://driver.pesan.biz"},
                        self.headers(origin="https://evil.example"), self.headers(token="invalid"),
                        self.headers(uid="missing")):
            with self.subTest(headers=list(headers)):
                with self.client() as client:
                    with self.assertRaises(WebSocketDisconnect) as error:
                        with client.websocket_connect("/realtime", headers=headers):
                            self.fail("Unauthenticated connection was accepted")
                self.assertEqual(error.exception.code, 1008)

    def test_ready_and_driver_events_do_not_leak_to_another_driver(self):
        with self.client() as client:
            with client.websocket_connect("/realtime", headers=self.headers("d1")) as first, \
                    client.websocket_connect("/realtime", headers=self.headers("d2")) as second:
                self.assertEqual(first.receive_json(), {"type": "ready"})
                self.assertEqual(second.receive_json(), {"type": "ready"})
                service.hub.publish(("bookings",), users=("d1",), roles=service.OFFICE_ROLES)
                service.hub.publish(("notifications",), users=("d2",))
                self.assertEqual(first.receive_json(), {"type": "changed", "topics": ["bookings"]})
                self.assertEqual(second.receive_json(), {"type": "changed", "topics": ["notifications"]})

    def test_real_uvicorn_and_websockets_transport(self):
        import socket
        import threading
        import uvicorn
        from websockets.sync.client import connect

        listener = socket.socket()
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
        server = uvicorn.Server(uvicorn.Config(
            self.client().app, host="127.0.0.1", port=port, log_level="error",
            ws_max_size=4096, ws_max_queue=8, ws_per_message_deflate=False,
        ))
        thread = threading.Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
        thread.start()
        try:
            deadline = time.monotonic() + 5
            while not server.started and thread.is_alive() and time.monotonic() < deadline:
                time.sleep(0.01)
            self.assertTrue(server.started)
            with connect(
                f"ws://127.0.0.1:{port}/realtime", origin="https://driver.pesan.biz", proxy=None,
                additional_headers={"Cookie": self.headers()["cookie"]}, open_timeout=2,
            ) as socket_client:
                self.assertEqual(json.loads(socket_client.recv(timeout=2)), {"type": "ready"})
                service.hub.publish(("bookings",), users=("d1",))
                self.assertEqual(json.loads(socket_client.recv(timeout=2)), {"type": "changed", "topics": ["bookings"]})
        finally:
            server.should_exit = True
            thread.join(timeout=5)
            listener.close()
        self.assertFalse(thread.is_alive())

    def test_client_cannot_subscribe_to_another_user_or_run_commands(self):
        with self.client() as client:
            with client.websocket_connect("/realtime", headers=self.headers()) as socket:
                socket.receive_json()
                socket.send_text(json.dumps({"subscribe": "d2", "command": "approve"}))
                with self.assertRaises(WebSocketDisconnect) as error:
                    socket.receive_json()
                self.assertEqual(error.exception.code, 1008)
        self.assertFalse(service.hub.connections)

    def test_binary_commands_are_also_rejected_without_leaking_connections(self):
        with self.client() as client:
            with client.websocket_connect("/realtime", headers=self.headers()) as socket:
                socket.receive_json()
                socket.send_bytes(b"not-an-allowed-command")
                with self.assertRaises(WebSocketDisconnect) as error:
                    socket.receive_json()
                self.assertEqual(error.exception.code, 1008)
        self.assertFalse(service.hub.connections)

    def test_expired_live_session_closes_and_disabled_users_are_rejected(self):
        with self.client() as client, patch.object(routes, "session_user", return_value={
            "uid": "d1", "role": "driver", "expires_at": time.time() + 0.1,
        }):
            with client.websocket_connect("/realtime", headers=self.headers()) as socket:
                self.assertEqual(socket.receive_json()["type"], "ready")
                with self.assertRaises(WebSocketDisconnect) as error:
                    socket.receive_json()
                self.assertEqual(error.exception.code, 4401)
        self.users.find_one.side_effect = None
        self.users.find_one.return_value = {"role": "driver", "disabled": True}
        self.assertIsNone(routes.session_user(self.headers()["cookie"].split("=", 1)[1]))

    def test_live_session_rechecks_account_role(self):
        with self.client() as client, patch.object(routes, "HEARTBEAT_SECONDS", 0.01):
            with client.websocket_connect("/realtime", headers=self.headers()) as socket:
                socket.receive_json()
                self.users.find_one.side_effect = None
                self.users.find_one.return_value = {"role": "user"}
                with self.assertRaises(WebSocketDisconnect) as error:
                    while True:
                        socket.receive_json()
                self.assertEqual(error.exception.code, 4401)

    def test_connection_limits_and_slow_clients_have_bounded_queues(self):
        hub = service.RealtimeHub()
        connections = [hub.subscribe("d1", "driver") for _ in range(8)]
        self.assertIsNone(hub.subscribe("d1", "driver"))
        for _ in range(40):
            hub.deliver({"topics": ["bookings"], "users": ["d1"]})
        for connection in connections:
            self.assertLessEqual(connection.queue.qsize(), 32)
            payload = connection.queue.get_nowait()
            self.assertEqual(payload["type"], "resync")
            self.assertNotIn("users", payload)
        hub.unsubscribe(connections[0])
        self.assertIsNotNone(hub.subscribe("d1", "driver"))

    def test_reassignment_notifies_old_and_new_driver_and_invalidates_cache_first(self):
        collection = Mock()
        collection.find_one.return_value = {"user_id": "u1", "driver_id": "d2", "requester_phone": "private"}
        calls = []
        with patch.object(service, "db", {"bookings": collection}), \
                patch.object(service.hub, "loop", Mock()), \
                patch.object(service, "invalidate_response_cache", side_effect=lambda: calls.append("cache")), \
                patch.object(service.hub, "publish", side_effect=lambda *args, **kwargs: calls.append((args, kwargs))):
            service.publish_document_change("bookings", "b1", {"driver_id": "d1"})
        self.assertEqual(calls[0], "cache")
        self.assertEqual(set(filter(None, calls[1][1]["users"])), {"u1", "d1", "d2"})
        self.assertEqual(calls[2][1]["roles"], service.CALENDAR_ROLES)
        self.assertNotIn("private", str(calls))

    def test_broker_messages_reach_other_workers_and_skip_own_messages(self):
        async def run():
            hub = service.RealtimeHub()
            connection = hub.subscribe("d1", "driver")
            messages = [
                {"type": "message", "data": json.dumps({"source": "other-worker", "users": ["d1"], "topics": ["bookings"]})},
                {"type": "message", "data": json.dumps({"source": hub.source, "users": ["d1"], "topics": ["tickets"]})},
            ]
            class PubSub:
                async def __aenter__(self): return self
                async def __aexit__(self, *args): pass
                async def subscribe(self, channel): self.channel = channel
                async def get_message(self, **kwargs):
                    if messages: return messages.pop(0)
                    await asyncio.Event().wait()
            broker = Mock()
            broker.pubsub.return_value = PubSub()
            from unittest.mock import AsyncMock
            broker.aclose = AsyncMock()
            with patch.object(service.redis_async.Redis, "from_url", return_value=broker):
                task = asyncio.create_task(hub._listen())
                # Broker reconnection emits a resync, then the foreign event arrives.
                await asyncio.wait_for(connection.queue.get(), 1)
                event = await asyncio.wait_for(connection.queue.get(), 1)
                self.assertEqual(event["topics"], ["bookings"])
                await asyncio.sleep(0.04)
                self.assertTrue(connection.queue.empty())
                task.cancel()
                with self.assertRaises(asyncio.CancelledError): await task
                broker.aclose.assert_awaited_once()
        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
