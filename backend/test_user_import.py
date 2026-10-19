import base64
import csv
import io
import unittest
import zipfile
from unittest.mock import Mock, patch

from fastapi import HTTPException

import main  # noqa: F401 - Initialize routers before importing handlers.
import routes_users_admin as users


class UserImportTests(unittest.TestCase):
    def employee(self, **changes):
        return {
            "_id": "employee", "name": "Employee", "email": "employee@example.com",
            "department": "Finance", "job_position": "Accountant", "role": "user",
            "nik": "00123", "phone": "0812345", "password_hash": "saved-hash",
            "telegram_chat_id": "12345", "disabled": False, **changes,
        }

    def file_content(self, headers, rows, extension):
        if extension == "csv":
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerows([headers, *rows])
            return output.getvalue().encode("utf-8-sig")
        xml_rows = []
        for number, row in enumerate([headers, *rows], start=1):
            cells = [
                f'<c r="{users.xlsx_column_letter(index)}{number}" t="inlineStr"><is><t>{users.xml_escape_text(value)}</t></is></c>'
                for index, value in enumerate(row)
            ]
            xml_rows.append(f'<row r="{number}">{"".join(cells)}</row>')
        sheet = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + "".join(xml_rows) + '</sheetData></worksheet>'
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as archive:
            archive.writestr("xl/worksheets/sheet1.xml", sheet)
        return output.getvalue()

    def run_import(self, headers, rows, documents, *, update=True, role="superadmin", extension="csv"):
        collection = Mock()

        def find_one(query):
            for document in documents:
                if all(document.get(key) == value for key, value in query.items()):
                    return document.copy()
            return None

        def update_one(query, update):
            for document in documents:
                if document["_id"] == query["_id"]:
                    document.update(update["$set"])
                    return Mock(modified_count=1)
            return Mock(modified_count=0)

        collection.find_one.side_effect = find_one
        collection.update_one.side_effect = update_one
        collection.insert_one.side_effect = lambda value: documents.append(value.copy())
        content = self.file_content(headers, rows, extension)
        request_model = users.UserMassUpdateRequest if update else users.UserImportRequest
        payload = request_model(filename=f"users.{extension}", file_base64=base64.b64encode(content).decode())
        with patch.object(users, "db", {"users": collection}), \
                patch.object(users, "ensure_role", return_value=role), \
                patch.object(users, "hash_password", return_value="new-hash") as hash_password:
            handler = users.mass_update_users if update else users.import_users
            result = handler(payload, {"uid": "admin"})
        return result, collection, hash_password

    def test_csv_and_xlsx_update_accept_email_and_one_profile_column(self):
        for extension in ("csv", "xlsx"):
            with self.subTest(extension=extension):
                documents = [self.employee()]
                result, collection, password_hash = self.run_import(
                    ["email", "department"], [[" Employee@Example.com ", "Operations"]], documents, extension=extension,
                )
                self.assertEqual((result.created, result.updated, result.failed), (0, 1, 0))
                self.assertEqual(documents[0]["department"], "Operations")
                self.assertEqual(documents[0]["job_position"], "Accountant")
                self.assertEqual(documents[0]["password_hash"], "saved-hash")
                self.assertEqual(documents[0]["role"], "user")
                self.assertEqual(documents[0]["telegram_chat_id"], "12345")
                collection.insert_one.assert_not_called()
                password_hash.assert_not_called()

    def test_mass_update_template_is_separate_and_contains_no_password_or_telegram_column(self):
        with patch.object(users, "ensure_role", return_value="office_coordinator"):
            response = users.download_user_mass_update_template({"uid": "office"})
        self.assertIn("user_mass_update_template.xlsx", response.headers["content-disposition"])
        row = users.parse_user_rows_from_xlsx(response.body, update_existing=True)[0][1]
        self.assertIn("email", row)
        self.assertIn("department", row)
        self.assertIn("job_position", row)
        self.assertNotIn("password", row)
        self.assertNotIn("telegram_chat_id", row)
        create_row = users.parse_user_rows_from_xlsx(users.build_user_import_template_xlsx())[0][1]
        self.assertIn("password", create_row)

    def test_mass_update_cannot_be_switched_to_create_mode_by_request_flag(self):
        request = users.UserMassUpdateRequest.model_validate({
            "filename": "users.csv", "file_base64": "ZW1haWwK", "update_existing": False,
        })
        with patch.object(users, "import_users") as process:
            users.mass_update_users(request, {"uid": "admin"})
        self.assertTrue(process.call_args.args[0].update_existing)

    def test_employee_cannot_mass_update_users_or_download_its_template(self):
        collection = Mock()
        collection.find_one.return_value = self.employee()
        request = users.UserMassUpdateRequest(filename="users.csv", file_base64="ZW1haWwK")
        with patch.object(users, "db", {"users": collection}):
            with self.assertRaises(HTTPException) as upload_error:
                users.mass_update_users(request, {"uid": "employee"})
            self.assertEqual(upload_error.exception.status_code, 403)
            with self.assertRaises(HTTPException) as template_error:
                users.download_user_mass_update_template({"uid": "employee"})
            self.assertEqual(template_error.exception.status_code, 403)
        collection.update_one.assert_not_called()
        collection.insert_one.assert_not_called()

    def test_update_ignores_password_column_even_if_it_is_too_short(self):
        documents = [self.employee()]
        result, _, password_hash = self.run_import(
            ["email", "name", "password"], [["employee@example.com", "New Name", "x"]], documents,
        )
        self.assertEqual((result.updated, result.failed), (1, 0))
        self.assertEqual(documents[0]["name"], "New Name")
        self.assertEqual(documents[0]["password_hash"], "saved-hash")
        password_hash.assert_not_called()

    def test_blank_ordinary_cells_preserve_profile_and_email_only_is_a_noop(self):
        documents = [self.employee()]
        original = documents[0].copy()
        result, collection, _ = self.run_import(
            ["email", "name", "department", "job_position", "role", "phone", "nik", "plate_number"],
            [["employee@example.com", "", "  ", "", "", "", "", ""]], documents,
        )
        self.assertEqual((result.updated, result.failed), (1, 0))
        self.assertEqual(documents[0], original)
        collection.update_one.assert_not_called()
        result, collection, _ = self.run_import(["email"], [["employee@example.com"]], documents)
        self.assertEqual((result.updated, result.failed), (1, 0))
        collection.update_one.assert_not_called()

    def test_update_mode_never_creates_unknown_accounts(self):
        documents = []
        result, collection, password_hash = self.run_import(
            ["email", "name", "department", "nik", "phone", "password"],
            [["unknown@example.com", "New User", "Finance", "123", "08123", "password123"]], documents,
        )
        self.assertEqual((result.created, result.updated, result.failed), (0, 0, 1))
        self.assertIn("Email not found", result.errors[0].message)
        collection.insert_one.assert_not_called()
        collection.update_one.assert_not_called()
        password_hash.assert_not_called()

    def test_driver_update_without_role_or_plate_keeps_assignment_fields(self):
        documents = [self.employee(role="driver", plate_number="B 1234 ABC", booking_enabled=False)]
        result, _, _ = self.run_import(["email", "department"], [["employee@example.com", "Transport"]], documents)
        self.assertEqual((result.updated, result.failed), (1, 0))
        self.assertEqual((documents[0]["role"], documents[0]["plate_number"]), ("driver", "B 1234 ABC"))
        self.assertFalse(documents[0]["booking_enabled"])

    def test_switching_to_driver_requires_a_valid_plate(self):
        for plate, expected in ((None, 0), ("INVALID", 0), (" b 1234 abc ", 1)):
            with self.subTest(plate=plate):
                documents = [self.employee()]
                headers, row = ["email", "role"], ["employee@example.com", "Driver"]
                if plate is not None:
                    headers.append("plate_number")
                    row.append(plate)
                result, collection, _ = self.run_import(headers, [row], documents)
                self.assertEqual(result.updated, expected)
                if expected:
                    self.assertEqual((documents[0]["role"], documents[0]["plate_number"]), ("driver", "B 1234 ABC"))
                else:
                    self.assertEqual(documents[0]["role"], "user")
                    collection.update_one.assert_not_called()

    def test_role_change_away_from_driver_clears_plate(self):
        documents = [self.employee(role="driver", plate_number="B 1234 ABC")]
        result, _, _ = self.run_import(["email", "role"], [["employee@example.com", "user"]], documents)
        self.assertEqual(result.updated, 1)
        self.assertIsNone(documents[0]["plate_number"])

    def test_blank_telegram_id_clears_connection_but_missing_column_preserves_it(self):
        documents = [self.employee(telegram_link_hash="old-link", telegram_connected_at="old-date")]
        result, _, _ = self.run_import(["email", "telegram_id"], [["employee@example.com", ""]], documents)
        self.assertEqual(result.updated, 1)
        for field in ("telegram_chat_id", "telegram_link_hash", "telegram_connected_at"):
            self.assertIsNone(documents[0][field])

    def test_coordinator_cannot_update_privileged_accounts_or_assign_privileged_roles(self):
        for target_role, next_role in (("superadmin", ""), ("office_coordinator", ""), ("user", "superadmin"), ("driver", "office_coordinator")):
            with self.subTest(target_role=target_role, next_role=next_role):
                documents = [self.employee(role=target_role, plate_number="B 1234 ABC")]
                result, collection, _ = self.run_import(
                    ["email", "role", "department"], [["employee@example.com", next_role, "New"]],
                    documents, role="office_coordinator",
                )
                self.assertEqual((result.updated, result.failed), (0, 1))
                collection.update_one.assert_not_called()

    def test_superadmin_can_update_its_own_privileged_account(self):
        documents = [self.employee(_id="admin", role="superadmin")]
        result, _, _ = self.run_import(["email", "department"], [["employee@example.com", "IT"]], documents)
        self.assertEqual((result.updated, result.failed), (1, 0))
        self.assertEqual(documents[0]["department"], "IT")

    def test_bad_rows_report_their_row_number_and_other_rows_still_update(self):
        documents = [self.employee()]
        result, _, _ = self.run_import(
            ["email", "department", "telegram_id"],
            [["employee@example.com", "Should not save", "@invalid"], ["employee@example.com", "Operations", "12345"]],
            documents,
        )
        self.assertEqual((result.updated, result.failed), (1, 1))
        self.assertEqual(result.errors[0].row, 2)
        self.assertEqual(documents[0]["department"], "Operations")

    def test_create_mode_keeps_required_fields_and_default_role_for_csv_and_xlsx(self):
        headers = ["name", "department", "job_position", "nik", "phone", "email", "password"]
        row = ["Employee", "Finance", "Accountant", "00123", "0812345", "employee@example.com", "password123"]
        for extension in ("csv", "xlsx"):
            with self.subTest(extension=extension):
                documents = []
                result, _, password_hash = self.run_import(headers, [row], documents, update=False, extension=extension)
                self.assertEqual((result.created, result.updated, result.failed), (1, 0, 0))
                self.assertEqual(documents[0]["role"], "user")
                self.assertEqual((documents[0]["department"], documents[0]["job_position"]), ("Finance", "Accountant"))
                self.assertEqual(documents[0]["password_hash"], "new-hash")
                password_hash.assert_called_once_with("password123")
        result, collection, _ = self.run_import(["email"], [["new@example.com"]], [], update=True)
        self.assertEqual(result.failed, 1)
        collection.insert_one.assert_not_called()
        with self.assertRaises(HTTPException) as error:
            self.run_import(["email"], [["new@example.com"]], [], update=False)
        self.assertIn("Missing required columns", error.exception.detail)

    def test_create_import_allows_missing_or_blank_nik_in_csv_and_xlsx(self):
        for extension in ("csv", "xlsx"):
            for include_nik in (False, True):
                with self.subTest(extension=extension, include_nik=include_nik):
                    headers = ["name", "department", "phone", "email", "password"]
                    row = ["Employee", "Finance", "0812345", "employee@example.com", "password123"]
                    if include_nik:
                        headers.append("nik")
                        row.append("")
                    documents = []
                    result, _, _ = self.run_import(headers, [row], documents, update=False, extension=extension)
                    self.assertEqual((result.created, result.failed), (1, 0))
                    self.assertIn(documents[0].get("nik"), (None, ""))

    def test_create_mode_rejects_duplicate_email_without_overwriting_account(self):
        documents = [self.employee()]
        result, collection, _ = self.run_import(
            ["name", "department", "nik", "phone", "email", "password"],
            [["Replacement", "New", "999", "08999", "employee@example.com", "password123"]],
            documents, update=False,
        )
        self.assertEqual((result.created, result.updated, result.failed), (0, 0, 1))
        self.assertEqual(documents[0]["name"], "Employee")
        collection.update_one.assert_not_called()
        collection.insert_one.assert_not_called()


if __name__ == "__main__":
    unittest.main()
