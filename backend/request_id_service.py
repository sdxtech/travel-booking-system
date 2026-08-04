import re
from datetime import datetime, timedelta, timezone

from pymongo import ReturnDocument


JAKARTA_TIMEZONE = timezone(timedelta(hours=7), name="Asia/Jakarta")
REQUEST_COLLECTIONS = {
    "BD": "bookings",
    "TR": "tickets",
}


def request_date_token(created_at: datetime | None = None) -> str:
    """Return the request date as DDMMYYYY in the application's local timezone."""
    value = created_at or datetime.now(timezone.utc)
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(JAKARTA_TIMEZONE).strftime("%d%m%Y")


def generate_request_id(database, request_type: str, created_at: datetime | None = None) -> str:
    """Atomically generate SDX-{type}-DDMMYYYY-XXX for a new request."""
    normalized_type = str(request_type or "").strip().upper()
    if normalized_type not in REQUEST_COLLECTIONS:
        raise ValueError(f"Unsupported request type: {request_type}")

    date_token = request_date_token(created_at)
    counter_key = f"{normalized_type}:{date_token}"
    counter = database["request_id_counters"].find_one_and_update(
        {"_id": counter_key},
        {
            "$inc": {"sequence": 1},
            "$setOnInsert": {
                "request_type": normalized_type,
                "request_date": date_token,
            },
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    sequence = int((counter or {}).get("sequence", 1))
    return f"SDX-{normalized_type}-{date_token}-{sequence:03d}"


def backfill_request_ids(database) -> None:
    """Assign request IDs to legacy records while preserving existing sequences."""
    for request_type, collection_name in REQUEST_COLLECTIONS.items():
        collection = database[collection_name]
        pattern = re.compile(rf"^SDX-{request_type}-(\d{{8}})-(\d+)$")

        # Bring counters forward when request IDs already exist but counters do not.
        for document in collection.find(
            {"request_id": {"$regex": rf"^SDX-{request_type}-\d{{8}}-\d+$"}},
            {"request_id": 1},
        ):
            match = pattern.match(str((document or {}).get("request_id") or ""))
            if not match:
                continue
            date_token, sequence_text = match.groups()
            database["request_id_counters"].update_one(
                {"_id": f"{request_type}:{date_token}"},
                {
                    "$max": {"sequence": int(sequence_text)},
                    "$setOnInsert": {
                        "request_type": request_type,
                        "request_date": date_token,
                    },
                },
                upsert=True,
            )

        missing_filter = {
            "$or": [
                {"request_id": {"$exists": False}},
                {"request_id": None},
                {"request_id": ""},
            ]
        }
        legacy_documents = collection.find(missing_filter).sort([("created_at", 1), ("_id", 1)])
        for document in legacy_documents:
            data = document or {}
            request_id = generate_request_id(database, request_type, data.get("created_at"))
            collection.update_one(
                {"_id": data.get("_id"), **missing_filter},
                {"$set": {"request_id": request_id}},
            )
