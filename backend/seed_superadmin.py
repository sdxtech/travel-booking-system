import argparse
import os
from datetime import datetime, timezone
from uuid import uuid4

from dotenv import load_dotenv


def load_environment() -> None:
    app_env = os.getenv("APP_ENV", "development").lower()
    env_name = "production" if app_env == "production" else "development"
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), f".env.{env_name}")
    load_dotenv(env_path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create or update the first local superadmin user.")
    parser.add_argument("--email", required=True, help="Superadmin email address")
    parser.add_argument("--password", required=True, help="Superadmin password")
    parser.add_argument("--name", default="Super Admin", help="Display name")
    parser.add_argument("--dept-job-position", dest="dept_job_position", default="IT", help="Department / job position")
    parser.add_argument("--nik", default="LOCAL-SUPERADMIN", help="NIK / national ID")
    parser.add_argument("--phone", default="080000000000", help="Phone number")
    return parser.parse_args()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_email(value: str) -> str:
    return str(value or "").strip().lower()


def main() -> None:
    args = parse_args()
    from auth_utils import hash_password
    from mongo_client import db, init_mongo

    load_environment()

    email = normalize_email(args.email)
    if not email:
        raise SystemExit("Email is required.")

    init_mongo()

    now = utc_now()
    existing = db["users"].find_one({"email": email})
    password_hash = hash_password(args.password)

    if existing:
        db["users"].update_one(
            {"_id": existing.get("_id")},
            {
                "$set": {
                    "name": args.name,
                    "dept_job_position": args.dept_job_position,
                    "role": "superadmin",
                    "nik": args.nik,
                    "phone": args.phone,
                    "email": email,
                    "password_hash": password_hash,
                    "disabled": False,
                    "updated_at": now,
                    "updated_by": "seed_superadmin",
                }
            },
        )
        print(f"Updated superadmin: {email}")
        return

    db["users"].insert_one(
        {
            "_id": uuid4().hex,
            "name": args.name,
            "dept_job_position": args.dept_job_position,
            "role": "superadmin",
            "nik": args.nik,
            "phone": args.phone,
            "email": email,
            "password_hash": password_hash,
            "disabled": False,
            "created_at": now,
            "updated_at": now,
            "created_by": "seed_superadmin",
        }
    )
    print(f"Created superadmin: {email}")


if __name__ == "__main__":
    main()
