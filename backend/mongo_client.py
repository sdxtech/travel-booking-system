import os
from datetime import timezone

from pymongo import MongoClient, ASCENDING


class MongoDatabaseProxy:
    def __init__(self) -> None:
        self._client: MongoClient | None = None
        self._db = None

    def _init(self):
        if self._db is not None:
            return self._db

        uri = os.getenv("MONGODB_URI")
        if not uri:
            raise RuntimeError("MONGODB_URI is not set. Provide a full MongoDB connection string.")

        if not (uri.startswith("mongodb://") or uri.startswith("mongodb+srv://")):
            indirect = os.getenv(uri)
            if indirect:
                uri = indirect
            else:
                raise RuntimeError(
                    "MONGODB_URI must be a MongoDB connection string (mongodb:// or mongodb+srv://), "
                    "or point to another env var that holds the URI."
                )

        self._client = MongoClient(
            uri,
            tz_aware=True,
            tzinfo=timezone.utc,
            uuidRepresentation="standard",
        )

        self._db = self._client.get_default_database()
        if self._db is None:
            raise RuntimeError("MONGODB_URI must include a database name.")

        return self._db

    def get_db(self):
        return self._init()

    def __getattr__(self, name: str):
        return getattr(self.get_db(), name)

    def __getitem__(self, name: str):
        return self.get_db()[name]


db = MongoDatabaseProxy()


def init_mongo():
    """Initialize Mongo connection early (useful for startup checks)."""
    database = db.get_db()

    # Best-effort index creation; ignore failures (e.g., duplicate data).
    try:
        database["users"].create_index([("email", ASCENDING)], unique=True)
        database["users"].create_index([("role", ASCENDING)])
        database["bookings"].create_index([("user_id", ASCENDING)])
        database["bookings"].create_index([("driver_id", ASCENDING)])
        database["bookings"].create_index([("status", ASCENDING)])
        database["bookings"].create_index([("created_at", ASCENDING)])
        database["tickets"].create_index([("user_id", ASCENDING)])
        database["tickets"].create_index([("status", ASCENDING)])
        database["tickets"].create_index([("created_at", ASCENDING)])
        database["notifications"].create_index([("user_id", ASCENDING)])
        database["notifications"].create_index([("read", ASCENDING)])
        database["notifications"].create_index([("created_at", ASCENDING)])
    except Exception as exc:
        print(f"Mongo index setup skipped: {exc}")
    return db
