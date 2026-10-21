import base64
import csv
import hashlib
import io
import os
import re
import secrets
import zipfile
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Literal, Optional
from uuid import uuid4
from xml.etree import ElementTree as ET

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import AliasChoices, BaseModel, Field, ValidationError, model_validator, field_validator
from pymongo.errors import DuplicateKeyError

from auth_utils import hash_password
from account_status import account_status
from audit_service import record_audit_event
from email_service import EmailDeliveryError, send_password_reset_email
from main import get_current_user
from mongo_client import db
from profile_fields import department_value

router = APIRouter(prefix="/users", tags=["users"])

Role = Literal["user", "driver", "office_coordinator", "superadmin"]


def normalize_plate(value):
    plate = " ".join(str(value or "").upper().split())
    if not re.fullmatch(r"[A-Z]{1,3}\s*\d{1,4}\s*[A-Z]{0,3}", plate):
        raise ValueError("Plat No is required for Driver and must be valid, for example B 1234 ABC")
    return plate


class TelegramUserFields(BaseModel):
    telegram_chat_id: Optional[str] = None

    @field_validator("telegram_chat_id", mode="before")
    @classmethod
    def validate_telegram_id(cls, value):
        if value is None or (isinstance(value, str) and not value.strip()):
            return None
        text = str(value).strip()
        if not re.fullmatch(r"[0-9]{1,16}", text) or not 0 < int(text) < 2**52:
            raise ValueError("Telegram ID must be a positive personal numeric ID, not a phone number or @username")
        return str(int(text))


class UserCreate(TelegramUserFields):
    plate_number: Optional[str] = Field(default=None, max_length=20)
    name: str = Field(..., min_length=1)
    department: str = Field(..., min_length=1, validation_alias=AliasChoices("department", "dept_job_position"))
    job_position: str = ""
    role: Role
    nik: Optional[str] = None
    phone: str = Field(..., min_length=1)
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=6)

    @model_validator(mode="after")
    def validate_driver_plate(self):
        self.plate_number = normalize_plate(self.plate_number) if self.role == "driver" else None
        return self


class UserUpdate(TelegramUserFields):
    plate_number: Optional[str] = Field(default=None, max_length=20)
    name: Optional[str] = Field(default=None, min_length=1)
    department: Optional[str] = Field(default=None, min_length=1, validation_alias=AliasChoices("department", "dept_job_position"))
    job_position: Optional[str] = None
    role: Optional[Role] = None
    nik: Optional[str] = None
    phone: Optional[str] = Field(default=None, min_length=1)
    email: Optional[str] = Field(default=None, min_length=3)


class UserPasswordUpdate(BaseModel):
    password: str = Field(..., min_length=6)


class UserResponse(BaseModel):
    telegram_chat_id: Optional[str] = None
    plate_number: Optional[str] = None
    uid: str
    name: Optional[str] = None
    department: Optional[str] = None
    job_position: Optional[str] = None
    role: Optional[str] = None
    nik: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    disabled: Optional[bool] = None
    banned: bool = False
    account_status: Literal["active", "deactive", "banned", "password_not_set"] = "active"
    booking_enabled: bool = True


class UserUploadRequest(BaseModel):
    filename: str = Field(..., min_length=1)
    file_base64: str = Field(..., min_length=1)


class UserImportRequest(UserUploadRequest):
    # Retain the old API flag for clients deployed before the separate workflow.
    update_existing: bool = False


class UserMassUpdateRequest(UserUploadRequest):
    pass


class UserImportError(BaseModel):
    row: int
    email: Optional[str] = None
    message: str


class UserImportResponse(BaseModel):
    created: int
    updated: int = 0
    failed: int
    errors: list[UserImportError]


class DistributeAccountRequest(BaseModel):
    emails: list[str] = Field(..., min_length=1, max_length=100)
    role: Role


class DistributeAccountResult(BaseModel):
    email: str
    status: Literal["invited", "failed"]
    message: Optional[str] = None


class DistributeAccountResponse(BaseModel):
    created: int
    failed: int
    results: list[DistributeAccountResult]


def ensure_role(uid: str, allowed: tuple[str, ...]):
    """Return the user's role and enforce the allowed roles."""
    doc = db["users"].find_one({"_id": uid})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User profile not found")

    role = (doc or {}).get("role")
    if (doc or {}).get("disabled"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")
    if (doc or {}).get("banned"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is banned")
    if role not in allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return role


def serialize_user(doc_snapshot) -> UserResponse:
    """Convert a MongoDB user document into the API response schema."""
    data = doc_snapshot or {}
    return UserResponse(
        uid=str(data.get("_id")),
        name=data.get("name"),
        department=department_value(data),
        job_position=data.get("job_position"),
        role=data.get("role"),
        plate_number=data.get("plate_number") if data.get("role") == "driver" else None,
        nik=data.get("nik", data.get("national_id")),
        phone=data.get("phone") or data.get("phone_number"),
        telegram_chat_id=data.get("telegram_chat_id"),
        email=data.get("email"),
        disabled=data.get("disabled", False),
        banned=bool(data.get("banned")),
        account_status=account_status(data),
        booking_enabled=data.get("booking_enabled", True) is not False,
    )


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def telegram_profile_changes(payload, existing=None):
    if "telegram_chat_id" not in payload.model_fields_set:
        return {}
    changes = {"telegram_chat_id": payload.telegram_chat_id}
    if payload.telegram_chat_id != (existing or {}).get("telegram_chat_id"):
        # Revoke old connect links so they cannot overwrite the administrator's edit.
        changes.update(telegram_link_hash=None, telegram_link_expires_at=None, telegram_connected_at=None)
    return changes


def insert_user_profile(document):
    try:
        return db["users"].insert_one(document)
    except DuplicateKeyError:
        raise HTTPException(409, "Email or Telegram ID is already assigned to another user") from None


def update_user_profile(user_id, changes):
    try:
        return db["users"].update_one({"_id": user_id}, {"$set": changes})
    except DuplicateKeyError:
        raise HTTPException(409, "Email or Telegram ID is already assigned to another user") from None


def normalize_header(value: str) -> str:
    """Normalize a header label so it matches our field mapping keys."""
    text = str(value or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


HEADER_TO_FIELD: dict[str, str] = {
    "name": "name",
    "user_name": "name",
    "full_name": "name",
    "nama": "name",
    "dept_job_position": "department",
    "dept_job": "department",
    "dept": "department",
    "department": "department",
    "job_position": "job_position",
    "title_position": "job_position",
    "title": "job_position",
    "position": "job_position",
    "role": "role",
    "plate_number": "plate_number",
    "plat_no": "plate_number",
    "nik": "nik",
    "national_id": "nik",
    "nationalid": "nik",
    "phone": "phone",
    "telegram_id": "telegram_chat_id",
    "telegram_chat_id": "telegram_chat_id",
    "phone_number": "phone",
    "phone_no": "phone",
    "no_hp": "phone",
    "telp": "phone",
    "email": "email",
    "email_address": "email",
    "password": "password",
    "pass": "password",
}


REQUIRED_IMPORT_FIELDS = ("name", "department", "phone", "email", "password")


def normalize_cell_value(value: str) -> str:
    """Normalize imported cell text (trim, de-scientific, strip trailing .0)."""
    if value is None:
        return ""
    text = str(value).strip()

    if re.match(r"^-?\d+\.0$", text):
        text = text[:-2]

    if "e" in text.lower():
        try:
            numeric = Decimal(text)
            if numeric == numeric.to_integral_value():
                return format(numeric.to_integral_value(), "f")
            return format(numeric.normalize(), "f")
        except InvalidOperation:
            return text

    return text


def normalize_email(value: str) -> str:
    """Normalize an email value from imports (trim, lowercase, remove spaces)."""
    text = str(value or "").strip().lower()
    return re.sub(r"\s+", "", text)


def invitation_name(email: str) -> str:
    """Create a temporary display name when the invitation only supplies an email."""
    local_part = email.split("@", 1)[0]
    name = re.sub(r"[._-]+", " ", local_part).strip()
    return name.title() or "Employee"


def format_validation_error(exc: ValidationError) -> str:
    """Flatten Pydantic validation errors into a readable message."""
    parts: list[str] = []
    for err in exc.errors():
        loc = err.get("loc") or []
        loc_text = ".".join(str(item) for item in loc)
        msg = err.get("msg") or "Invalid value"
        parts.append(f"{loc_text}: {msg}" if loc_text else msg)
    return "; ".join(parts) if parts else "Invalid payload"


def xlsx_column_index(cell_ref: str) -> Optional[int]:
    """Convert an Excel cell reference (e.g. 'C2') into a zero-based column index."""
    if not cell_ref:
        return None
    letters = "".join(ch for ch in cell_ref if ch.isalpha())
    if not letters:
        return None
    idx = 0
    for ch in letters.upper():
        idx = idx * 26 + (ord(ch) - ord("A") + 1)
    return idx - 1


def xlsx_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    """Read the shared strings table from an .xlsx file (may be missing)."""
    try:
        raw = zf.read("xl/sharedStrings.xml")
    except KeyError:
        return []

    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    root = ET.fromstring(raw)
    strings: list[str] = []
    for si in root.findall("m:si", ns):
        parts = []
        for t in si.findall(".//m:t", ns):
            parts.append(t.text or "")
        strings.append("".join(parts))
    return strings


def xlsx_first_sheet_path(zf: zipfile.ZipFile) -> str:
    """Resolve the first worksheet XML path from workbook relationships."""
    ns_main = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    ns_rel = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}
    rid_attr = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"

    try:
        workbook = ET.fromstring(zf.read("xl/workbook.xml"))
        sheets = workbook.find("m:sheets", ns_main)
        sheet = sheets.find("m:sheet", ns_main) if sheets is not None else None
        rel_id = sheet.attrib.get(rid_attr) if sheet is not None else None
        if not rel_id:
            raise KeyError

        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        for rel in rels.findall("r:Relationship", ns_rel):
            if rel.attrib.get("Id") == rel_id:
                target = rel.attrib.get("Target") or "worksheets/sheet1.xml"
                target = target.lstrip("/")
                if not target.startswith("xl/"):
                    target = f"xl/{target}"
                return target
    except Exception:
        return "xl/worksheets/sheet1.xml"

    return "xl/worksheets/sheet1.xml"


def xlsx_cell_text(cell: ET.Element, shared_strings: list[str], ns: dict[str, str]) -> str:
    """Extract the textual value from a worksheet cell element."""
    cell_type = cell.attrib.get("t")

    if cell_type == "inlineStr":
        inline = cell.find("m:is", ns)
        if inline is None:
            return ""
        parts = []
        for t in inline.findall(".//m:t", ns):
            parts.append(t.text or "")
        return normalize_cell_value("".join(parts))

    value_elem = cell.find("m:v", ns)
    if value_elem is None or value_elem.text is None:
        return ""

    raw = value_elem.text
    if cell_type == "s":
        try:
            idx = int(raw)
        except ValueError:
            return normalize_cell_value(raw)
        if 0 <= idx < len(shared_strings):
            return normalize_cell_value(shared_strings[idx])
        return ""

    return normalize_cell_value(raw)


def parse_user_rows_from_xlsx(content: bytes, update_existing: bool = False) -> list[tuple[int, dict[str, str]]]:
    """Parse user import rows from an .xlsx file into (row_number, payload) tuples."""
    zf = zipfile.ZipFile(io.BytesIO(content))
    shared = xlsx_shared_strings(zf)
    sheet_path = xlsx_first_sheet_path(zf)

    try:
        sheet_raw = zf.read(sheet_path)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid .xlsx file (sheet not found)") from exc

    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    root = ET.fromstring(sheet_raw)
    sheet_data = root.find("m:sheetData", ns)
    if sheet_data is None:
        return []

    parsed_rows: list[tuple[int, dict[int, str]]] = []
    for row_elem in sheet_data.findall("m:row", ns):
        row_number_raw = row_elem.attrib.get("r") or "0"
        try:
            row_number = int(row_number_raw)
        except ValueError:
            row_number = 0

        cells = row_elem.findall("m:c", ns)
        row_map: dict[int, str] = {}
        for cell in cells:
            ref = cell.attrib.get("r") or ""
            col_idx = xlsx_column_index(ref)
            if col_idx is None:
                continue
            row_map[col_idx] = xlsx_cell_text(cell, shared, ns)

        if any(value.strip() for value in row_map.values()):
            parsed_rows.append((row_number, row_map))

    if not parsed_rows:
        return []

    header_row_number, header_map = parsed_rows[0]
    col_to_field: dict[int, str] = {}
    for col_idx, header_value in header_map.items():
        normalized = normalize_header(header_value)
        field_name = HEADER_TO_FIELD.get(normalized)
        if field_name:
            col_to_field[col_idx] = field_name

    required_fields = ("email",) if update_existing else REQUIRED_IMPORT_FIELDS
    missing = [field for field in required_fields if field not in col_to_field.values()]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing required columns: {', '.join(missing)}",
        )

    results: list[tuple[int, dict[str, str]]] = []
    for row_number, row_map in parsed_rows[1:]:
        if row_number <= header_row_number:
            continue
        row_payload: dict[str, str] = {}
        for col_idx, field_name in col_to_field.items():
            row_payload[field_name] = row_map.get(col_idx, "")
        results.append((row_number, row_payload))

    return results


def parse_user_rows_from_csv(content: bytes, update_existing: bool = False) -> list[tuple[int, dict[str, str]]]:
    """Parse user import rows from a CSV file into (row_number, payload) tuples."""
    text = content.decode("utf-8-sig", errors="replace")
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return []

    header_values = rows[0]
    col_to_field: dict[int, str] = {}
    for idx, header_value in enumerate(header_values):
        normalized = normalize_header(header_value)
        field_name = HEADER_TO_FIELD.get(normalized)
        if field_name:
            col_to_field[idx] = field_name

    required_fields = ("email",) if update_existing else REQUIRED_IMPORT_FIELDS
    missing = [field for field in required_fields if field not in col_to_field.values()]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing required columns: {', '.join(missing)}",
        )

    results: list[tuple[int, dict[str, str]]] = []
    for index, row in enumerate(rows[1:], start=2):
        if not any(str(cell).strip() for cell in row):
            continue
        row_payload: dict[str, str] = {}
        for col_idx, field_name in col_to_field.items():
            row_payload[field_name] = normalize_cell_value(row[col_idx]) if col_idx < len(row) else ""
        results.append((index, row_payload))

    return results


def decode_import_file(payload: UserImportRequest) -> tuple[str, bytes]:
    """Decode the base64 file payload and return the original filename + raw bytes."""
    try:
        raw = base64.b64decode(payload.file_base64, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid base64 file payload") from exc

    filename = payload.filename.strip()
    if not filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Filename is required")

    return filename, raw


def parse_import_rows(filename: str, content: bytes, update_existing: bool = False) -> list[tuple[int, dict[str, str]]]:
    """Parse import rows based on the filename extension (.xlsx or .csv)."""
    lower = filename.lower()
    if lower.endswith(".xlsx"):
        return parse_user_rows_from_xlsx(content, update_existing)
    if lower.endswith(".csv"):
        return parse_user_rows_from_csv(content, update_existing)

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported file type. Use .xlsx or .csv")


def xlsx_column_letter(index: int) -> str:
    """Convert a zero-based column index into an Excel column label (A, B, ...)."""
    if index < 0:
        raise ValueError("Column index must be non-negative")

    letters: list[str] = []
    idx = index
    while idx >= 0:
        idx, remainder = divmod(idx, 26)
        letters.append(chr(ord("A") + remainder))
        idx -= 1
    return "".join(reversed(letters))


def xml_escape_text(value: str) -> str:
    """Escape text so it is safe to embed in worksheet XML."""
    text = str(value or "")
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def build_user_import_template_xlsx(update_existing: bool = False) -> bytes:
    """Build an in-memory .xlsx template for user import (headers + example row)."""
    if update_existing:
        # Telegram is intentionally omitted: blank IDs disconnect existing links.
        headers = ["email", "name", "department", "job_position", "role", "nik", "phone", "plate_number"]
        example_row = ["john@example.com", "", "Finance", "Accountant", "", "", "", ""]
    else:
        headers = ["name", "department", "job_position", "role", "nik", "phone", "email", "password", "plate_number", "telegram_id"]
        example_row = ["John Doe", "Finance", "Accountant", "user", "1234567890", "081234567890", "john@example.com", "password123", "", ""]

    def make_row(row_number: int, values: list[str]) -> str:
        """Generate a <row> element with inline string <c> cells."""
        cells: list[str] = []
        for col_idx, value in enumerate(values):
            cell_ref = f"{xlsx_column_letter(col_idx)}{row_number}"
            cell_text = xml_escape_text(value)
            cells.append(f'<c r="{cell_ref}" t="inlineStr"><is><t>{cell_text}</t></is></c>')
        return f'<row r="{row_number}">{"".join(cells)}</row>'

    last_col = xlsx_column_letter(len(headers) - 1)
    dimension_ref = f"A1:{last_col}2"

    sheet_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="{dimension_ref}"/>
  <sheetData>
    {make_row(1, headers)}
    {make_row(2, example_row)}
  </sheetData>
</worksheet>
"""

    content_types_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>
"""

    root_rels_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>
"""

    workbook_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Sheet1" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>
"""

    workbook_rels_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>
"""

    styles_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>
"""

    output = io.BytesIO()
    with zipfile.ZipFile(output, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types_xml)
        zf.writestr("_rels/.rels", root_rels_xml)
        zf.writestr("xl/workbook.xml", workbook_xml)
        zf.writestr("xl/_rels/workbook.xml.rels", workbook_rels_xml)
        zf.writestr("xl/worksheets/sheet1.xml", sheet_xml)
        zf.writestr("xl/styles.xml", styles_xml)

    return output.getvalue()


@router.get("/import/template")
def download_user_import_template():
    """Download the user import template as an Excel (.xlsx) file."""
    content = build_user_import_template_xlsx()
    return Response(
        content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="user_import_template.xlsx"'},
    )


@router.get("", response_model=list[UserResponse])
def list_users(current_user=Depends(get_current_user)):
    """List all users sorted by name (office coordinator/superadmin only)."""
    uid = current_user["uid"]
    ensure_role(uid, ("office_coordinator", "superadmin"))

    snapshots = list(db["users"].find({}))

    def name_value(doc):
        """Return a normalized name string for stable sorting."""
        value = (doc or {}).get("name")
        if isinstance(value, str):
            return value.lower()
        return ""

    sorted_docs = sorted(snapshots, key=name_value)
    return [serialize_user(doc) for doc in sorted_docs]


@router.get("/mass-update/template")
def download_user_mass_update_template(current_user=Depends(get_current_user)):
    """Download a profile-only template for updating existing accounts."""
    ensure_role(current_user["uid"], ("office_coordinator", "superadmin"))
    return Response(
        build_user_import_template_xlsx(update_existing=True),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="user_mass_update_template.xlsx"'},
    )


@router.post("/mass-update", response_model=UserImportResponse)
def mass_update_users(payload: UserMassUpdateRequest, current_user=Depends(get_current_user)):
    """Update existing profiles only; never create accounts or reset passwords."""
    return import_users(UserImportRequest(**payload.model_dump(), update_existing=True), current_user)


@router.post("/import", response_model=UserImportResponse)
def import_users(payload: UserImportRequest, current_user=Depends(get_current_user)):
    """Bulk import users from CSV/XLSX, optionally updating existing accounts."""
    uid = current_user["uid"]
    current_role = ensure_role(uid, ("office_coordinator", "superadmin"))

    filename, content = decode_import_file(payload)
    rows = parse_import_rows(filename, content, payload.update_existing)

    created = 0
    updated = 0
    errors: list[UserImportError] = []

    for row_number, row_data in rows:
        normalized = {key: normalize_cell_value(value) for key, value in row_data.items()}
        email = normalize_email(normalized.get("email")) or None
        try:
            if not email:
                raise HTTPException(400, "Email is required")
            normalized["email"] = email
            existing = db["users"].find_one({"email": email})
            if payload.update_existing:
                if not existing:
                    raise HTTPException(400, "Email not found. Use create mode to create a new account.")
                if current_role == "office_coordinator" and existing.get("role") not in ("user", "driver"):
                    raise HTTPException(403, "Office coordinator can only update roles: user, driver")

                # Email identifies the account; update mode never changes credentials.
                # Omitted/blank profile cells preserve saved values. An explicitly
                # blank Telegram ID still clears the connection, as in Manage User.
                changes = {
                    key: value for key, value in normalized.items()
                    if key not in ("email", "password") and (value or key == "telegram_chat_id")
                }
                if "role" in changes:
                    changes["role"] = changes["role"].lower()
                user_payload = UserUpdate(**changes)
                if current_role == "office_coordinator" and user_payload.role not in (None, "user", "driver"):
                    raise HTTPException(403, "Office coordinator can only update roles: user, driver")
                update_user(str(existing["_id"]), user_payload, current_user)
                updated += 1
            else:
                if existing:
                    raise HTTPException(400, "Email already exists. Enable update mode to update its profile.")
                normalized["role"] = (normalized.get("role") or "user").lower()
                create_user(UserCreate(**normalized), current_user)
                created += 1
        except ValidationError as exc:
            errors.append(UserImportError(row=row_number, email=email, message=format_validation_error(exc)))
        except HTTPException as exc:
            errors.append(
                UserImportError(
                    row=row_number,
                    email=email,
                    message=str(exc.detail),
                )
            )
            continue
        except Exception as exc:
            errors.append(
                UserImportError(
                    row=row_number,
                    email=email,
                    message=f"Failed to save user profile: {exc}",
                )
            )
            continue

    return UserImportResponse(created=created, updated=updated, failed=len(errors), errors=errors)


@router.post("/distribute-account", response_model=DistributeAccountResponse, status_code=status.HTTP_201_CREATED)
def distribute_accounts(payload: DistributeAccountRequest, current_user=Depends(get_current_user)):
    """Create role-selected accounts in bulk and send one-hour set-password links."""
    uid = current_user["uid"]
    ensure_role(uid, ("superadmin",))

    normalized_emails: list[str] = []
    seen: set[str] = set()
    results: list[DistributeAccountResult] = []
    for raw_email in payload.emails:
        email = normalize_email(raw_email)
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
            results.append(DistributeAccountResult(email=str(raw_email).strip(), status="failed", message="Invalid email address"))
            record_audit_event(action="Account invitation", status="failed", actor=current_user, target=str(raw_email).strip(), details={"email": str(raw_email).strip(), "role": payload.role, "reason": "Invalid email address"})
            continue
        if email in seen:
            results.append(DistributeAccountResult(email=email, status="failed", message="Duplicate email in this list"))
            record_audit_event(action="Account invitation", status="failed", actor=current_user, target=email, details={"email": email, "role": payload.role, "reason": "Duplicate email in this list"})
            continue
        seen.add(email)
        normalized_emails.append(email)

    for email in normalized_emails:
        if db["users"].find_one({"email": email}):
            results.append(DistributeAccountResult(email=email, status="failed", message="Email already exists"))
            record_audit_event(action="Account invitation", status="failed", actor=current_user, target=email, details={"email": email, "role": payload.role, "reason": "Email already exists"})
            continue

        now = utc_now()
        user_id = uuid4().hex
        token = secrets.token_urlsafe(32)
        inserted_profile = False
        try:
            insert_user_profile({
                "_id": user_id,
                "name": invitation_name(email),
                "department": "",
                "job_position": "",
                "role": payload.role,
                "plate_number": None,
                "nik": "",
                "phone": "",
                "email": email,
                "disabled": False,
                "created_at": now,
                "updated_at": now,
                "created_by": uid,
                "invited_at": now,
                "invited_by": uid,
            })
            inserted_profile = True
            db["password_reset_tokens"].insert_one({
                "user_id": user_id,
                "token_hash": hashlib.sha256(token.encode()).hexdigest(),
                "expires_at": now + timedelta(hours=1),
                "used": False,
                "purpose": "account_invitation",
                "created_at": now,
            })
            reset_url = f"{os.getenv('APP_PUBLIC_URL', '').rstrip('/')}/reset-password?token={token}"
            email_id = send_password_reset_email(
                to_email=email,
                recipient_name=invitation_name(email),
                reset_url=reset_url,
                invitation=True,
                expires_in_minutes=60,
                language="id" if payload.role == "driver" else "en",
            )
            if email_id is None:
                raise EmailDeliveryError("Invitation email service is not configured")
            results.append(DistributeAccountResult(email=email, status="invited"))
            record_audit_event(action="Account invitation", status="sent", actor=current_user, target=email, details={"email": email, "role": payload.role, "delivery": "sent", "expires_in_minutes": 60})
        except Exception as exc:
            # Do not leave an unusable account when its only login invitation
            # could not be delivered. The administrator can correct the issue
            # and submit the email again.
            if inserted_profile:
                db["password_reset_tokens"].delete_many({"user_id": user_id})
                db["users"].delete_one({"_id": user_id})
            results.append(DistributeAccountResult(email=email, status="failed", message=str(exc) or "Failed to send invitation email"))
            record_audit_event(action="Account invitation", status="failed", actor=current_user, target=email, details={"email": email, "role": payload.role, "delivery": "failed", "reason": str(exc) or "Failed to send invitation email"})

    created = sum(item.status == "invited" for item in results)
    return DistributeAccountResponse(created=created, failed=len(results) - created, results=results)


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, current_user=Depends(get_current_user)):
    """Create a new user account and persist the profile in MongoDB."""
    uid = current_user["uid"]
    current_role = ensure_role(uid, ("office_coordinator", "superadmin"))

    if current_role == "office_coordinator" and payload.role not in ("user", "driver"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    normalized_email = normalize_email(payload.email)
    if db["users"].find_one({"email": normalized_email}):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists")

    user_id = uuid4().hex
    insert_user_profile(
        {
            "_id": user_id,
            "telegram_chat_id": payload.telegram_chat_id,
            "name": payload.name,
            "department": payload.department,
            "job_position": payload.job_position,
            "role": payload.role,
            "plate_number": payload.plate_number,
            "nik": payload.nik,
            "phone": payload.phone,
            "email": normalized_email,
            "password_hash": hash_password(payload.password),
            "disabled": False,
            "created_at": utc_now(),
            "updated_at": utc_now(),
            "created_by": uid,
        }
    )

    snapshot = db["users"].find_one({"_id": user_id})
    return serialize_user(snapshot)


@router.patch("/{user_id}", response_model=UserResponse)
def update_user(user_id: str, payload: UserUpdate, current_user=Depends(get_current_user)):
    """Update a user's profile data."""
    uid = current_user["uid"]
    current_role = ensure_role(uid, ("office_coordinator", "superadmin"))

    snapshot = db["users"].find_one({"_id": user_id})
    if not snapshot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User profile not found")

    target_data = snapshot or {}
    if target_data.get("role") == "superadmin" and current_role != "superadmin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    updates = payload.model_dump(exclude_none=True)
    updates.update(telegram_profile_changes(payload, target_data))
    if not updates and "plate_number" not in payload.model_fields_set:
        return serialize_user(snapshot)

    if current_role == "office_coordinator" and "role" in updates:
        target_role = target_data.get("role")
        next_role = updates.get("role")

        if next_role not in ("user", "driver"):
            if next_role == target_role:
                updates.pop("role", None)
            else:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        elif target_role not in ("user", "driver") and next_role != target_role:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if not updates and "plate_number" not in payload.model_fields_set:
        return serialize_user(snapshot)

    if "email" in updates:
        normalized_email = normalize_email(updates.get("email"))
        existing = db["users"].find_one({"email": normalized_email, "_id": {"$ne": user_id}})
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists")
        updates["email"] = normalized_email

    next_role = updates.get("role", target_data.get("role"))
    if next_role == "driver":
        if "role" in updates or "plate_number" in payload.model_fields_set:
            try:
                updates["plate_number"] = normalize_plate(
                    payload.plate_number if "plate_number" in payload.model_fields_set else target_data.get("plate_number")
                )
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
    else:
        updates["plate_number"] = None

    updates["updated_at"] = utc_now()
    updates["updated_by"] = uid
    update_user_profile(user_id, updates)

    updated_snapshot = db["users"].find_one({"_id": user_id})
    return serialize_user(updated_snapshot)


@router.patch("/{user_id}/password", response_model=UserResponse)
def reset_password(user_id: str, payload: UserPasswordUpdate, current_user=Depends(get_current_user)):
    """Reset a user's password (hash stored in MongoDB)."""
    uid = current_user["uid"]
    current_role = ensure_role(uid, ("office_coordinator", "superadmin"))

    if user_id == uid and current_role != "superadmin":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot reset your own password")

    snapshot = db["users"].find_one({"_id": user_id})
    if not snapshot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User profile not found")

    target_data = snapshot or {}
    target_role = target_data.get("role")
    if target_role == "superadmin" and current_role != "superadmin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if current_role == "office_coordinator" and target_role not in ("user", "driver"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    db["users"].update_one(
        {"_id": user_id},
        {"$set": {"password_hash": hash_password(payload.password), "updated_at": utc_now(), "updated_by": uid}},
    )

    updated_snapshot = db["users"].find_one({"_id": user_id})
    return serialize_user(updated_snapshot)


@router.patch("/{user_id}/activate", response_model=UserResponse)
def activate_user(user_id: str, current_user=Depends(get_current_user)):
    """Re-enable login and clear a failed-login ban without changing passwords."""
    uid = current_user["uid"]
    current_role = ensure_role(uid, ("office_coordinator", "superadmin"))
    if user_id == uid and current_role != "superadmin":
        raise HTTPException(status_code=400, detail="Cannot activate your own account")
    snapshot = db["users"].find_one({"_id": user_id})
    if not snapshot:
        raise HTTPException(status_code=404, detail="User profile not found")
    if snapshot.get("role") == "superadmin" and current_role != "superadmin":
        raise HTTPException(status_code=403, detail="Forbidden")

    db["users"].update_one(
        {"_id": user_id},
        {"$set": {"disabled": False, "banned": False, "failed_login_attempts": 0,
                  "updated_at": utc_now(), "updated_by": uid},
         "$unset": {"banned_at": "", "last_failed_login_at": ""}},
    )
    return serialize_user(db["users"].find_one({"_id": user_id}))


@router.patch("/{user_id}/deactivate", response_model=UserResponse)
def deactivate_user(user_id: str, current_user=Depends(get_current_user)):
    """Disable a user and mark the profile as disabled."""
    uid = current_user["uid"]
    current_role = ensure_role(uid, ("office_coordinator", "superadmin"))

    if user_id == uid and current_role != "superadmin":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot deactivate your own account")

    snapshot = db["users"].find_one({"_id": user_id})
    if not snapshot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User profile not found")

    target_data = snapshot or {}
    if target_data.get("role") == "superadmin" and current_role != "superadmin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    db["users"].update_one(
        {"_id": user_id},
        {"$set": {"disabled": True, "updated_at": utc_now(), "updated_by": uid}},
    )

    updated_snapshot = db["users"].find_one({"_id": user_id})
    return serialize_user(updated_snapshot)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: str, current_user=Depends(get_current_user)):
    """Delete a user from MongoDB."""
    uid = current_user["uid"]
    ensure_role(uid, ("superadmin",))

    result = db["users"].delete_one({"_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User account not found")

    return Response(status_code=status.HTTP_204_NO_CONTENT)
