import base64
import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException
from pydantic import ValidationError
from pymongo.errors import DuplicateKeyError

import main  # noqa: F401
import routes_users_admin as users


class UserTelegramIdTests(unittest.TestCase):
    def payload(self, role="user", **extra):
        return users.UserCreate(name="User", dept_job_position="Office", role=role,
                                plate_number="B 1234 ABC", nik="123", phone="08123456789",
                                email="test@example.com", password="password123", **extra)

    def test_all_roles_accept_id_or_empty(self):
        for role in ("user", "driver", "office_coordinator", "superadmin"):
            self.assertEqual(self.payload(role, telegram_chat_id=" 00123456789 ").telegram_chat_id, "123456789")
            for value in (None, "", " "):
                self.assertIsNone(self.payload(role, telegram_chat_id=value).telegram_chat_id)

    def test_rejects_invalid_personal_ids(self):
        for value in ("@driver", "+62812345", "-1001234", "0", "1.5", True, "4503599627370496"):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                self.payload(telegram_chat_id=value)

    def test_create_persists_and_returns_id_for_every_role(self):
        for role in ("user", "driver", "office_coordinator", "superadmin"):
            collection = Mock()
            document = {}
            collection.insert_one.side_effect = lambda doc: document.update(doc)
            collection.find_one.side_effect = lambda query: document if "_id" in query else None
            with patch.object(users, "db", {"users": collection}), \
                    patch.object(users, "ensure_role", return_value="superadmin"), \
                    patch.object(users, "hash_password", return_value="hash"):
                result = users.create_user(self.payload(role, telegram_chat_id="123"), {"uid": "admin"})
            self.assertEqual(document["telegram_chat_id"], "123")
            self.assertEqual(result.telegram_chat_id, "123")

    def test_edit_omission_preserves_and_clear_revokes_old_link(self):
        document = {"_id": "user", "role": "user", "telegram_chat_id": "123", "telegram_link_hash": "old"}
        collection = Mock()
        collection.find_one.side_effect = lambda query: document.copy()
        collection.update_one.side_effect = lambda query, update: document.update(update["$set"])
        with patch.object(users, "db", {"users": collection}), patch.object(users, "ensure_role", return_value="superadmin"):
            result = users.update_user("user", users.UserUpdate(name="New name"), {"uid": "admin"})
            self.assertEqual(result.telegram_chat_id, "123")
            self.assertEqual(document["telegram_link_hash"], "old")
            result = users.update_user("user", users.UserUpdate(telegram_chat_id="456"), {"uid": "admin"})
            self.assertEqual(result.telegram_chat_id, "456")
            self.assertIsNone(document["telegram_link_hash"])
            result = users.update_user("user", users.UserUpdate(telegram_chat_id=""), {"uid": "admin"})
            self.assertIsNone(result.telegram_chat_id)

    def test_duplicate_id_becomes_readable_conflict(self):
        collection = Mock()
        collection.insert_one.side_effect = DuplicateKeyError("duplicate")
        collection.update_one.side_effect = DuplicateKeyError("duplicate")
        with patch.object(users, "db", {"users": collection}):
            for save in (lambda: users.insert_user_profile({}), lambda: users.update_user_profile("u", {})):
                with self.assertRaises(HTTPException) as error:
                    save()
                self.assertEqual(error.exception.status_code, 409)
                self.assertIn("Telegram ID", error.exception.detail)

    def test_import_template_and_header_alias(self):
        row = users.parse_user_rows_from_xlsx(users.build_user_import_template_xlsx())[0][1]
        self.assertIn("telegram_chat_id", row)
        self.assertEqual(users.HEADER_TO_FIELD["telegram_id"], "telegram_chat_id")
        self.assertEqual(users.HEADER_TO_FIELD["telegram_chat_id"], "telegram_chat_id")

    def test_import_updates_preserve_missing_and_clear_empty_column(self):
        for column, expected in (("", "123"), (",telegram_id", None), (",telegram_chat_id", None)):
            document = {"_id": "u", "role": "user", "telegram_chat_id": "123"}
            collection = Mock()
            collection.find_one.return_value = document
            collection.update_one.side_effect = lambda query, update: document.update(update["$set"])
            csv = "name,dept_job_position,nik,phone,email,password" + column + "\nName,Office,123,08123,test@example.com,password123" + ("," if column else "")
            payload = users.UserImportRequest(filename="users.csv", file_base64=base64.b64encode(csv.encode()).decode(), update_existing=True)
            with patch.object(users, "db", {"users": collection}), \
                    patch.object(users, "ensure_role", return_value="superadmin"), \
                    patch.object(users, "hash_password", return_value="hash"):
                result = users.import_users(payload, {"uid": "admin"})
            self.assertEqual(result.updated, 1)
            self.assertEqual(document["telegram_chat_id"], expected)


if __name__ == "__main__":
    unittest.main()
