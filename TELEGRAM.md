# Notifikasi Telegram Driver

Bot: **@BookingDriverBot**. Telegram mengikuti event dan isi notifikasi email yang diterima Driver. Employee dan Office Coordinator belum menerima Telegram. Email dan notifikasi aplikasi tetap berjalan; Telegram yang gagal tidak membatalkan booking. Tidak ada pengiriman ulang otomatis atau pengiriman riwayat lama.

## 1. Simpan token

Untuk development Windows, jalankan dari root project:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-telegram-development.ps1
```

Paste token BotFather di prompt tersembunyi. Script menyimpan token dan membuat webhook secret di environment user Windows, di luar repository. Buka terminal baru, lalu restart backend. Untuk Docker:

```powershell
docker compose --env-file .env.development up -d --build backend
```

Jalankan script lagi untuk mengganti token; gunakan `-Clear` untuk menghapus secret lokal. Script ini tidak mendaftarkan webhook.

Untuk production, pasang environment berikut di pengelola service backend dan di terminal saat menjalankan registrasi webhook:

- `TELEGRAM_BOT_TOKEN`: token rahasia dari BotFather.
- `TELEGRAM_WEBHOOK_SECRET`: string acak 32–256 karakter, hanya huruf, angka, `_`, atau `-`. Bisa dibuat dengan `python -c "import secrets; print(secrets.token_urlsafe(32))"`.
- `TELEGRAM_BOT_USERNAME`: `BookingDriverBot` (default).
- `APP_PUBLIC_URL`: URL aplikasi, misalnya `https://booking.plvpilot.space`.

Nilai secret jangan dimasukkan ke file environment yang dilacak Git. Tetap gunakan `.env.development` / `.env.production` untuk konfigurasi non-secret. Restart backend setelah mengatur environment. Tidak ada dependency Python tambahan.

## 2. Aktifkan webhook sekali

Deploy backend terlebih dahulu. Webhook harus bisa dijangkau Telegram melalui HTTPS publik. `localhost` saja tidak cukup; pengujian lokal perlu HTTPS tunnel yang mengarah ke backend. Pastikan URL ini mengarah ke endpoint backend, bukan halaman frontend.

Dari folder `backend`, dengan venv dan environment secret yang sama dengan backend:

```bash
python setup_telegram_webhook.py https://booking.plvpilot.space/api/telegram/webhook
```

Contoh menggunakan prefix reverse proxy `/api`; sesuaikan dengan konfigurasi Nginx aktual. Jika backend dipublikasikan tanpa prefix, gunakan `/telegram/webhook` langsung. Untuk Docker, jalankan script di container yang sudah menerima secrets:

```bash
docker compose exec backend python setup_telegram_webhook.py https://booking.plvpilot.space/api/telegram/webhook
```

Script memeriksa identitas bot, lalu mendaftarkan webhook dengan secret header. Script menolak mengganti webhook lain yang sudah terpasang kecuali diberi `--replace-existing`. Gunakan opsi itu saat sengaja memindahkan bot dari URL pengujian lokal ke production atau sebaliknya. Jika bot sudah punya program yang membaca `getUpdates` (polling), integrasikan handler `/start` ini dengan program tersebut atau hentikan polling sebelum memakai webhook. Satu bot tidak bisa menerima update melalui polling dan webhook sekaligus. Jangan gunakan bot yang sama untuk webhook development dan production bersamaan.

## 3. Hubungkan setiap Driver

### Telegram ID di Manage User

Semua role memiliki field **Telegram ID** opsional di Create/Update User dan kolom tabel Manage User. Field ini menyimpan `telegram_chat_id` yang sama dengan koneksi bot, sehingga Driver yang sudah terhubung tidak perlu dimasukkan ulang. Pencarian User juga mencakup Telegram ID.

Masukkan ID numerik chat pribadi, bukan nomor telepon, username, atau ID grup. ID harus unik antar akun. Mengosongkan field saat edit menghapus tujuan Telegram dan membatalkan link koneksi lama; mengganti role tidak menghapus ID. Mengisi ID manual belum membuktikan bot bisa mengirim: pemilik akun Telegram tetap harus membuka @BookingDriverBot dan klik Start.

Template import menyediakan kolom opsional `telegram_id` (alias `telegram_chat_id` juga diterima). Pada import dengan `update_existing`, kolom yang tidak disertakan mempertahankan ID lama; sel kosong pada kolom yang disertakan menghapus ID lama. Notifikasi Telegram tetap hanya untuk Driver meskipun ID role lain sudah diisi.

### Koneksi otomatis Driver

1. Login sebagai Driver dan buka halaman tugas.
2. Klik **Connect Telegram**, lalu **Open Telegram**.
3. Klik **Start** di @BookingDriverBot dengan akun Telegram pribadi Driver.
4. Kembali ke aplikasi; status berubah menjadi **Connected**. Gunakan **Check status** bila perlu.

Link berlaku 10 menit dan hanya sekali pakai. Jangan bagikan link koneksi. Satu chat pribadi hanya bisa terhubung ke satu akun; gunakan **Disconnect Telegram** pada akun lama sebelum menghubungkannya ke akun lain. Membuka bot secara langsung tanpa link aplikasi belum menghubungkan akun. Setelah koneksi berhasil, bot tidak mengirim balasan Start; status koneksi terlihat di aplikasi.

## Verifikasi

Buat booking yang ditugaskan ke Driver terhubung. Periksa notifikasi aplikasi, email, dan Telegram. Koleksi `notifications` menyimpan `telegram_status` (`skipped`, `pending`, `sent`, `failed`), `telegram_provider_id`, dan waktu pengiriman/kegagalan. `sent` berarti Telegram menerima pesan, bukan bukti Driver membacanya. Driver yang memblokir bot perlu membukanya kembali agar menerima notifikasi berikutnya.

Tes lokal tanpa mengirim pesan sungguhan:

```powershell
cd backend
.\.venv\Scripts\python.exe -m unittest discover -p "test_*.py"
```

Referensi: [Telegram deep linking](https://core.telegram.org/bots/features#deep-linking), [Telegram webhooks](https://core.telegram.org/bots/api#setwebhook), [sendMessage](https://core.telegram.org/bots/api#sendmessage).
