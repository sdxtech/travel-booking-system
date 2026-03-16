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

## Local Setup

### Backend

1. Isi env di `backend/.env.local` atau `backend/.env`.
2. Minimal env yang wajib:
   - `MONGODB_URI`
   - `JWT_SECRET`
   - `CORS_ORIGINS`
3. Jalankan backend:

```bash
cd backend
python -m uvicorn main:app --reload
```

### Frontend

1. Isi `frontend/.env`:

```bash
VITE_API_BASE_URL=http://localhost:8000
```

2. Jalankan frontend:

```bash
cd frontend
npm install
npm run dev
```

## Staging Deploy

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
  - `APP_ENV`: set `staging` untuk load `.env.staging`
- Catatan: `MONGODB_URI` juga bisa berisi nama env var lain yang menyimpan URI MongoDB.

### Frontend (Vercel)

- Root Directory: `frontend`
- Environment Variables:
  - `VITE_API_BASE_URL`: URL backend yang sudah ter-deploy
