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

## Email Notification dengan Resend

Email dikirim otomatis bersama notifikasi aplikasi jika `RESEND_API_KEY` dan `RESEND_FROM_EMAIL` terisi. Jika salah satunya kosong atau Resend gagal, notifikasi aplikasi tetap tersimpan dan proses bisnis tidak dibatalkan.

1. Tambahkan dan verifikasi domain pengirim di Resend. Untuk production, alamat default proyek adalah `no-reply@notify.plvpilot.space`.
2. Buat API key development baru dengan izin mengirim email.
3. Di Windows, jalankan script setup berikut dari root project. Key diminta secara tersembunyi dan disimpan pada environment user Windows, bukan di file Git:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-resend-development.ps1
```

Setelah setup, terminal baru akan membaca key secara otomatis. Nilai `RESEND_API_KEY` di `.env.development` dan `.env.production` harus tetap kosong agar secret tidak pernah ikut commit:

```env
RESEND_API_KEY=
RESEND_FROM_EMAIL=BDTR <no-reply@notify.plvpilot.space>
APP_PUBLIC_URL=http://localhost:5173
```

Untuk Docker Compose, jalankan perintah ini dari terminal baru setelah setup:

```powershell
docker compose --env-file .env.development up -d --build backend
```

Untuk mengganti key, jalankan kembali script setup. Untuk menghapus key development dari Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-resend-development.ps1 -Clear
```

Status pengiriman tersimpan pada koleksi `notifications` melalui field `email_status` (`skipped`, `pending`, `sent`, atau `failed`) dan `email_provider_id` jika berhasil.

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
  - `RESEND_API_KEY`: API key rahasia dari Resend
  - `RESEND_FROM_EMAIL`: nama dan alamat pengirim dari domain yang sudah diverifikasi
  - `APP_PUBLIC_URL`: URL aplikasi untuk tombol pada email
- Catatan: `MONGODB_URI` juga bisa berisi nama env var lain yang menyimpan URI MongoDB.

### Frontend (Vercel)

- Root Directory: `frontend`
- Environment Variables:
  - `VITE_API_BASE_URL`: URL backend yang sudah ter-deploy

## Deploy Notes

Detail deploy container ada di `DEPLOY.md`.
Konfigurasi environment tersimpan di `.env.development` dan `.env.production`.
