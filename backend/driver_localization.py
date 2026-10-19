"""Indonesian copy for Driver notifications, shared by all delivery channels."""
import re
from typing import Mapping, Optional


SUBJECTS = {
    "assigned": "Tugas perjalanan baru",
    "assignment_updated": "Penugasan perjalanan diperbarui",
    "cancelled_by_employee": "Perjalanan dibatalkan oleh pemohon",
    "cancelled": "Perjalanan dibatalkan",
    "completion_validated": "Penyelesaian perjalanan dikonfirmasi",
    "password_changed": "Kata sandi berhasil diubah",
    "driver_availability_updated": "Ketersediaan pengemudi diperbarui",
}

DETAIL_LABELS = {
    "Request ID": "Nomor Permintaan",
    "Requestor": "Pemohon",
    "Phone/WA": "Telepon/WA",
    "Departure Date & Time": "Tanggal & Waktu Keberangkatan",
    "Departure Point": "Lokasi Penjemputan",
    "Destination Point": "Tujuan",
    "Estimated Arrival Date & Time": "Perkiraan Tanggal & Waktu Tiba",
    "Driver": "Pengemudi",
}
MONTHS = dict(zip(
    ("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"),
    ("Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"),
))


def driver_notification_message(message: str, event: Optional[str], status: Optional[str] = None) -> str:
    """Translate system copy without altering user-entered names, routes, or IDs."""
    if event == "assigned":
        if "by the booking system" in message:
            return "Anda mendapat tugas perjalanan baru yang telah disetujui otomatis oleh sistem. Silakan lihat menu Tugas Saya."
        if message.startswith("Anda mendapat tugas"):
            return message
        if message == "You have been assigned a new driver task. Please check Driver Tasks for details.":
            return "Anda mendapat tugas perjalanan baru yang telah disetujui. Silakan lihat menu Tugas Saya."
    if event == "assignment_updated":
        return "Penugasan perjalanan Anda diperbarui oleh Super Admin. Silakan lihat menu Tugas Saya."
    if event == "completion_validated":
        return "Penyelesaian perjalanan Anda telah dikonfirmasi. Perjalanan dinyatakan selesai."
    if event == "password_changed":
        return "Kata sandi Anda berhasil diubah."
    if event == "cancelled_by_employee":
        match = re.fullmatch(r"Booking (.+) was cancelled by the Employee\.", message)
        return f"Perjalanan {match[1]} dibatalkan oleh pemohon." if match else message
    if event == "cancelled":
        return "Perjalanan Anda telah dibatalkan."
    if event == "driver_availability_updated":
        match = re.search(r"by (Super Admin|Office Coordinator)\.", message)
        if match:
            actor = "Koordinator Kantor" if match[1] == "Office Coordinator" else match[1]
            if status == "on" or (status is None and "turned on" in message):
                return f"Ketersediaan Anda untuk menerima perjalanan baru diaktifkan oleh {actor}."
            return f"Ketersediaan Anda untuk menerima perjalanan baru dinonaktifkan oleh {actor}. Tugas yang sudah ada tetap berlaku."
    return message


def driver_notification_details(details: Optional[Mapping[str, object]]) -> Optional[dict[str, object]]:
    if details is None:
        return None
    result = {}
    for label, value in details.items():
        if label in {"Departure Date & Time", "Estimated Arrival Date & Time"}:
            value = re.sub(r"\b(" + "|".join(MONTHS) + r")\b", lambda match: MONTHS[match[0]], str(value or "-"))
        result[DETAIL_LABELS.get(label, label)] = value
    return result
