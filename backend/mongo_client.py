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

    try:
        init_page_permissions(database)
    except Exception as exc:
        print(f"Page permission setup skipped: {exc}")

    try:
        from request_id_service import backfill_request_ids

        backfill_request_ids(database)
    except Exception as exc:
        print(f"Request ID backfill skipped: {exc}")

    try:
        request_id_index_options = {
            "unique": True,
            "partialFilterExpression": {"request_id": {"$type": "string"}},
        }
        database["bookings"].create_index([("request_id", ASCENDING)], **request_id_index_options)
        database["tickets"].create_index([("request_id", ASCENDING)], **request_id_index_options)
    except Exception as exc:
        print(f"Request ID index setup skipped: {exc}")
    return db

def init_page_permissions(database):
    pages = [
        {
            "_id": "page_ticket_request",
            "name": "Ticket Request",
            "key": "ticket_request",
            "path": "/user/ticket-request",
            "description": "Halaman untuk membuat ticket request",
            "is_active": True,
        },
        {
            "_id": "page_ticket_history",
            "name": "Ticket History",
            "key": "ticket_history",
            "path": "/user/ticket-history",
            "description": "Riwayat ticket user",
            "is_active": True,
        },
        {
            "_id": "page_booking_driver",
            "name": "Booking Driver",
            "key": "booking_driver",
            "path": "/user/booking-driver",
            "description": "Halaman booking driver",
            "is_active": True,
        },
         {
                "_id": "page_booking_history",
                "name": "Booking History",
                "key": "booking_history",
                "path": "/user/booking-history",
                "description": "Halaman booking history",
                "is_active": True,
            },
    ]

    for page in pages:
        database["pages"].update_one(
            {"_id": page["_id"]},
            {"$setOnInsert": page},
            upsert=True,
        )
        database["role_page_permissions"].update_one(
            {"role": "user", "page_id": page["_id"]},
            {"$setOnInsert": {"enabled": True}},
            upsert=True,
        )

    database["pages"].create_index(
        [("key", ASCENDING)],
        unique=True,
    )

    database["pages"].create_index(
        [("path", ASCENDING)],
        unique=True,
    )

    database["role_page_permissions"].create_index(
        [
            ("role", ASCENDING),
            ("page_id", ASCENDING),
        ],
        unique=True,
    )
