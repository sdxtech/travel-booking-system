# Deployment Guide

Project ini sudah disiapkan untuk dua mode:
- local tanpa Docker
- container-based deploy dengan `Dockerfile`

Rekomendasi production:
- deploy `backend` dan `frontend` sebagai container terpisah
- pakai MongoDB external / managed service
- pakai env dari template production agar setup konsisten

## Environment Variables

### Backend

- `MONGODB_URI`
- `JWT_SECRET`
- `JWT_ALGORITHM` (default `HS256`)
- `JWT_EXPIRES_HOURS` (default `8`)
- `CORS_ORIGINS`

### Frontend

- `VITE_API_BASE_URL`

## Deploy Dengan Container Platform

### Backend

- Build context: `backend`
- Dockerfile: `backend/Dockerfile`
- Exposed port: `8000`
- Healthcheck: `GET /healthz`

Set env backend:

```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<database>
JWT_SECRET=<strong-secret>
JWT_ALGORITHM=HS256
JWT_EXPIRES_HOURS=8
CORS_ORIGINS=https://<frontend-domain>
```

### Frontend

- Build context: `frontend`
- Dockerfile: `frontend/Dockerfile`
- Exposed port: `80`
- Healthcheck: `GET /`

Build arg frontend:

```env
VITE_API_BASE_URL=https://<backend-domain>
```

Karena frontend Vite dibuild statis, `VITE_API_BASE_URL` harus diisi saat build image frontend.

Template env production:
- `backend/.env.production.example`
- `frontend/.env.production.example`

## Seed Superadmin

Sesudah backend tersambung ke MongoDB, buat akun awal:

### Jalankan langsung

```bash
cd backend
pip install -r requirements.txt
python seed_superadmin.py --email admin@example.com --password admin123
```

### Dari container

```bash
docker compose exec backend python seed_superadmin.py --email admin@example.com --password admin123
```

Script ini idempotent:
- kalau email belum ada, user dibuat
- kalau email sudah ada, data + password akan diupdate dan role dipaksa jadi `superadmin`

## Docker Compose Untuk Lokal

### Pakai MongoDB lokal di dalam compose

```bash
copy .env.example .env
docker compose up -d --build
```

### Pakai MongoDB external

Ubah `MONGODB_URI` di `.env`, lalu:

```bash
docker compose up -d --build
```

Frontend akan tersedia di `http://localhost:8080` dan backend di `http://localhost:8000`.

## CI

Workflow dasar ada di `.github/workflows/ci.yml` untuk mengecek:
- backend dependency install + compile
- frontend build
- validasi `docker compose config`
