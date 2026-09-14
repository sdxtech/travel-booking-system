import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException
from pydantic import ValidationError

import main  # noqa: F401
import routes_users_admin as users


class DriverPlateTests(unittest.TestCase):
    def payload(self, **changes):
        return dict(name="Budi", dept_job_position="Driver", role="driver", nik="123",
                    phone="08123456789", email="budi@example.com", password="password123", **changes)

    def test_create_requires_plate_only_for_driver(self):
        for plate in (None, "", "   ", "INVALID"):
            with self.subTest(plate=plate), self.assertRaises(ValidationError):
                users.UserCreate(**self.payload(plate_number=plate))
        driver = users.UserCreate(**self.payload(plate_number=" b 1234 abc "))
        self.assertEqual(driver.plate_number, "B 1234 ABC")
        for role in ("user", "office_coordinator", "superadmin"):
            data = self.payload(plate_number="B 1234 ABC")
            data["role"] = role
            self.assertIsNone(users.UserCreate(**data).plate_number)

    def test_edit_persists_plate_and_role_change_clears_it(self):
        doc = {"_id": "driver", "role": "driver", "plate_number": "B 1234 ABC"}
        collection = Mock()
        collection.find_one.side_effect = lambda *args, **kwargs: doc.copy()
        collection.update_one.side_effect = lambda query, update: doc.update(update["$set"])
        with patch.object(users, "db", {"users": collection}), patch.object(users, "ensure_role", return_value="office_coordinator"):
            result = users.update_user("driver", users.UserUpdate(plate_number="b 1235 xyz"), {"uid": "office"})
            self.assertEqual(result.plate_number, "B 1235 XYZ")
            for plate in ("", None):
                with self.subTest(plate=plate), self.assertRaises(HTTPException):
                    users.update_user("driver", users.UserUpdate(plate_number=plate), {"uid": "office"})
            result = users.update_user("driver", users.UserUpdate(role="user"), {"uid": "office"})
            self.assertIsNone(doc["plate_number"])
            self.assertIsNone(result.plate_number)
            with self.assertRaises(HTTPException):
                users.update_user("driver", users.UserUpdate(role="driver"), {"uid": "office"})

    def test_import_template_includes_plate_column(self):
        rows = users.parse_user_rows_from_xlsx(users.build_user_import_template_xlsx())
        self.assertEqual(len(rows), 1)
        self.assertIn("plate_number", rows[0][1])


if __name__ == "__main__":
    unittest.main()
