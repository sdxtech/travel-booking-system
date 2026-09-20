# booking-driver-ticket-request

Booking dan travel request app dengan:
- `backend`: FastAPI + MongoDB (`pymongo`)
- `frontend`: React + Vite

## Database

Project ini sekarang menggunakan MongoDB sebagai database utama. Koleksi yang dipakai:
- `users`
- `bookings`
- `tickets`
- `notifications`

Koneksi MongoDB diambil dari `MONGODB_URI` dan harus menyertakan nama database.

## Local Setup (Rekomendasi: Docker)

Pastikan Docker Desktop sudah berjalan, lalu masuk ke folder project:

```powershell
cd "C:\xampp81\htdocs\SODEXO\00-INTERNAL\101-TRAVEL BOOKING SYSTEM\booking-driver-ticket-request - mongo"
```

Project menggunakan `.env.development` untuk konfigurasi local.

### Menjalankan pertama kali

Build dan jalankan MongoDB, backend, serta frontend:

```bash
docker compose --env-file .env.development up -d --build
```

Cek status service:

```bash
docker compose --env-file .env.development ps
```

Aplikasi tersedia di:

- Frontend: `http://localhost:8080`
- Backend: `http://localhost:8000`
- Health check: `http://localhost:8000/healthz`

### Membuat Super Admin pertama kali

Jika database masih kosong, jalankan:

```bash
docker compose --env-file .env.development exec backend python seed_superadmin.py --email admin@example.com --password admin123
```

Contoh akun awal:

```text
Email: admin@example.com
Password: admin123
```

Ganti password setelah login.

### Menjalankan setelah setup pertama kali

Jika container masih ada tetapi berhenti:

```bash
docker compose --env-file .env.development start
```

Atau gunakan:

```bash
docker compose --env-file .env.development up -d
```

Tidak perlu menggunakan `--build` setiap kali menjalankan ulang. Gunakan `--build` jika ada perubahan source code atau dependency:

```bash
docker compose --env-file .env.development up -d --build
```

### Melihat log

```bash
docker compose --env-file .env.development logs -f
docker compose --env-file .env.development logs -f backend
docker compose --env-file .env.development logs -f frontend
```

Tekan `Ctrl+C` untuk keluar dari tampilan log. Container tetap berjalan.

### Menghentikan project

Menghentikan container tanpa menghapus data MongoDB:

```bash
docker compose --env-file .env.development stop
```

Menurunkan container dan network:

```bash
docker compose --env-file .env.development down
```

Data MongoDB tersimpan di volume Docker `mongo_data`. Jangan gunakan `down -v` kecuali memang ingin menghapus seluruh database local:

```bash
docker compose --env-file .env.development down -v
```

### Docker dengan MongoDB external

Isi `DOCKER_MONGODB_URI` di `.env.development` dengan URI MongoDB external, lalu jalankan:

```bash
docker compose --env-file .env.development up -d --build
```

## Local Setup Tanpa Docker

Mode ini membutuhkan MongoDB yang berjalan langsung di komputer host. Untuk mode ini, gunakan `MONGODB_URI=mongodb://localhost:27017/bdtr_local`.

### Backend

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn main:app --reload
```

Install dependency hanya saat pertama kali atau ketika `requirements.txt` berubah:

```powershell
pip install -r requirements.txt
```

### Frontend

Buka terminal baru:

```powershell
cd frontend
npm install
npm run dev
```

Frontend otomatis membaca konfigurasi melalui Vite. Mode ini biasanya tersedia di `http://localhost:5173`.

## Staging Deploy

## Email Notification dengan Hostinger SMTP

Telegram tambahan khusus Driver tersedia melalui @BookingDriverBot. Email tetap aktif. Panduan token, webhook, dan penghubungan akun ada di [TELEGRAM.md](TELEGRAM.md).

Email dikirim melalui mailbox Hostinger. Buat mailbox di hPanel **Emails → Manage**, lalu lihat **Connect Apps & Devices → Manual Configuration** untuk pengaturan SMTP. Isi `SMTP_USERNAME`, `SMTP_PASSWORD`, dan `SMTP_FROM_EMAIL` pada `.env.development` atau `.env.production` sesuai lingkungan; jangan commit password mailbox. Default Hostinger Email adalah `smtp.hostinger.com` port `465` dengan `SMTP_SECURITY=ssl`. Alternatif port `587` memakai `SMTP_SECURITY=starttls` jika hPanel mengharuskannya.

Jika konfigurasi SMTP belum lengkap atau pengiriman gagal, notifikasi aplikasi tetap tersimpan dan proses booking/travel tidak dibatalkan. Status tersimpan pada koleksi `notifications` lewat `email_status` (`skipped`, `pending`, `sent`, atau `failed`) dan `email_provider_id` berisi Message-ID saat server SMTP menerima pesan.

### Backend (Render)

- Root Directory: `backend`
- Build Command: `pip install -r requirements.txt`
- Start Command: `python -m uvicorn main:app --host 0.0.0.0 --port $PORT`
- Environment Variables:
  - `MONGODB_URI`: MongoDB connection string yang menyertakan nama database
  - `JWT_SECRET`: secret untuk sign access token
  - `JWT_ALGORITHM`: default `HS256`
  - `JWT_EXPIRES_HOURS`: default `8`
  - `CORS_ORIGINS`: daftar origin frontend, dipisah koma
  - `APP_ENV`: gunakan `production` untuk konfigurasi production
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURITY`: pengaturan SMTP mailbox Hostinger
  - `SMTP_USERNAME`: alamat mailbox lengkap
  - `SMTP_PASSWORD`: password mailbox (rahasia)
  - `SMTP_FROM_EMAIL`: nama dan alamat mailbox pengirim
  - `APP_PUBLIC_URL`: URL aplikasi untuk tombol pada email
- Catatan: `MONGODB_URI` juga bisa berisi nama env var lain yang menyimpan URI MongoDB.

### Frontend (Vercel)

- Root Directory: `frontend`
- Environment Variables:
  - `VITE_API_BASE_URL`: URL backend yang sudah ter-deploy

## Deploy Notes

Detail deploy container ada di `DEPLOY.md`.
Konfigurasi environment tersimpan di `.env.development` dan `.env.production`.
