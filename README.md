<<<<<<< HEAD
# booking-driver-mongodb
=======
# booking-driver-ticket-request

## Staging Deploy (Render + Vercel)

### Backend (Render)
- Root Directory: `backend`
- Build Command: `pip install -r requirements.txt`
- Start Command: `python -m uvicorn main:app --host 0.0.0.0 --port $PORT`
- Environment Variables:
  - `MONGODB_URI`: MongoDB connection string (must include database name)
  - `JWT_SECRET`: secret used to sign access tokens
  - `JWT_ALGORITHM`: token algorithm (default `HS256`)
  - `JWT_EXPIRES_HOURS`: access token lifetime in hours (default `8`)
  - `CORS_ORIGINS`: comma-separated, example `https://<your-vercel-domain>`
  - `APP_ENV`: set to `staging` to load `.env.staging` (defaults to `.env.local`)
  - `MONGODB_URI` can point to another env var name (e.g., `BDTR_MONGO_DB`)
- Local env files: `backend/.env.local` (Docker) and `backend/.env.staging` (Atlas)

### Frontend (Vercel)
- Root Directory: `frontend`
- Environment Variables:
  - `VITE_API_BASE_URL`: `https://<your-render-backend-url>`
>>>>>>> 5354d11 (Chroe:init project (MongoDB))
