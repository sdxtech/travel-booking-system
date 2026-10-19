# Pembaruan realtime

Aplikasi memakai WebSocket bawaan browser dan dukungan FastAPI/Uvicorn yang sudah tercantum di requirements. Tidak ada paket npm baru atau layanan realtime pihak ketiga.

## Perilaku

- Tugas Driver, history Booking Driver/Travel, kalender Employee/office/Super Admin, notifikasi, dan ketersediaan Driver diperbarui setelah data tersimpan, sebelum menunggu pengiriman email/Telegram.
- Event hanya berisi nama kelompok data yang berubah. Request ID, nama, telepon, rute, dan token tidak dikirim melalui broadcast. Browser mengambil data melalui endpoint yang sudah memeriksa hak akses.
- Driver menerima event tugas miliknya, termasuk ketika penugasan dipindahkan darinya. Employee menerima perubahan permintaannya dan sinyal ketersediaan kalender bersama. Coordinator/Super Admin menerima perubahan operasional sesuai akses API masing-masing.
- Pembaruan tidak mereset tanggal kalender, pilihan Driver, filter pencarian/rentang tanggal, pagination, atau isian form. Respons pengambilan data yang sudah kedaluwarsa dibatalkan.
- Jika koneksi terputus, browser reconnect dengan jeda bertahap sampai 30 detik dan mengambil ulang data setelah tersambung. Saat terputus ada polling cadangan setiap 30 detik; sinkronisasi pengaman setiap 60 detik ketika tersambung. Tab tersembunyi disinkronkan saat dibuka kembali.
- Ini memperbarui aplikasi yang terbuka. Pemberitahuan sistem saat browser ditutup/HP mengistirahatkan aplikasi memerlukan Web Push tersendiri; email/Telegram tetap berjalan.

## Konfigurasi production

Tidak perlu membuka port baru. Jalurnya: `wss://driver.pesan.biz/api/realtime` → Nginx host → frontend Nginx → endpoint backend `/realtime`.

1. Pastikan nilai **efektif di container backend** untuk `APP_PUBLIC_URL` dan `CORS_ORIGINS` mencantumkan `https://driver.pesan.biz`. Konfigurasi deployment yang sudah dipakai di VPS harus dipertahankan; nilai literal pada Compose mengalahkan `.env.production`. WebSocket memeriksa Origin terhadap kedua pengaturan tersebut dan tidak menerima wildcard.
2. Rebuild backend/frontend setelah menarik perubahan:

   ```bash
   docker compose --env-file .env.production -f compose.production.yml up -d --build backend frontend
   ```

3. Pada blok HTTPS `server` Nginx host yang **sudah aktif untuk driver.pesan.biz**, tambahkan lokasi berikut. Frontend Nginx dalam image sudah menyertakan konfigurasi upgrade. Template hostname lama di `ops/nginx-booking.pesan.biz.conf` juga diperbarui untuk referensi; jangan menimpa konfigurasi domain/TLS aktif dengan template lama.

   ```nginx
   location = /api/realtime {
       proxy_pass http://127.0.0.1:8080;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_read_timeout 75s;
       proxy_send_timeout 75s;
       proxy_buffering off;
   }
   ```

4. Validasi konfigurasi, lalu reload:

   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

5. Buka akun Employee dan Driver di browser/profile berbeda. Pada DevTools → Network → WS, koneksi `/api/realtime` harus berstatus `101`. Buat booking approved untuk Driver tersebut; kartu tugas dan jadwal akan diperbarui. Uji Mulai, Selesai, konfirmasi, pembatalan, dan reconnect setelah memutus internet. Filter dan form yang sedang diisi harus tetap dipertahankan.

Redis yang sudah ada digunakan untuk Pub/Sub antarworker backend. Bila Redis bermasalah, event dalam worker yang sama tetap dikirim dan sinkronisasi cadangan memulihkan data antarworker. Session diperiksa saat handshake dan berkala; koneksi ditutup ketika sesi kedaluwarsa/akun dinonaktifkan/role berubah. Batas per worker: 500 koneksi, 8 tab per akun, antrean 32 event per koneksi; kelebihan antrean memicu sinkronisasi ulang. Uvicorn membatasi pesan masuk ke 4 KiB dan menonaktifkan kompresi.

## Pengujian lokal

```bash
cd backend
.venv/Scripts/python.exe -m unittest test_realtime test_driver_localization test_telegram test_booking_conflicts test_cancellation_approval
```

```bash
cd frontend
node --test tests/realtime.test.mjs
npm run build
```
