"""Best-effort Redis response cache for safe, frequently-read backend data."""

import hashlib
import json
import os
from typing import Any

import redis


_client: redis.Redis | None = None
CACHE_TTL_SECONDS = max(1, int(os.getenv("REDIS_CACHE_TTL_SECONDS", "15")))


def _redis_client() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis.from_url(
            os.getenv("REDIS_URL", "redis://localhost:6379/0"),
            socket_connect_timeout=0.2,
            socket_timeout=0.2,
            health_check_interval=30,
            decode_responses=True,
        )
    return _client


def _key(namespace: str, identity: str) -> str:
    digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()
    return f"booking-app:cache:{namespace}:{digest}"


def get_cached_json(namespace: str, identity: str) -> Any | None:
    try:
        value = _redis_client().get(_key(namespace, identity))
        return json.loads(value) if value is not None else None
    except (redis.RedisError, json.JSONDecodeError, TypeError, ValueError) as exc:
        print(f"Redis cache read skipped: {exc}")
        return None


def set_cached_json(namespace: str, identity: str, value: Any) -> None:
    try:
        encoded = json.dumps(value, separators=(",", ":"), ensure_ascii=False)
        _redis_client().set(_key(namespace, identity), encoded, ex=CACHE_TTL_SECONDS)
    except (redis.RedisError, TypeError, ValueError) as exc:
        print(f"Redis cache write skipped: {exc}")


def invalidate_response_cache() -> None:
    """Clear application response cache after any successful API mutation."""
    try:
        client = _redis_client()
        keys = client.scan_iter(match="booking-app:cache:*", count=100)
        while True:
            batch = []
            for key in keys:
                batch.append(key)
                if len(batch) >= 100:
                    client.delete(*batch)
                    batch = []
            if batch:
                client.delete(*batch)
            break
    except redis.RedisError as exc:
        print(f"Redis cache invalidation skipped: {exc}")
