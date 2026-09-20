# Deploy awal di Biznet VPS (Ubuntu 24.04)

Target: `https://booking.plvpilot.space`, Docker Compose untuk aplikasi dan MongoDB, Nginx + Certbot di host. Jalankan perintah di VPS sebagai user yang punya `sudo`. DNS A record `booking.plvpilot.space` harus menunjuk ke IP publik VPS sebelum langkah HTTPS.

## 1. Sistem dan Docker

```bash
sudo apt update
sudo apt upgrade -y
sudo reboot
```

Login kembali setelah reboot, lalu:

```bash
sudo apt install -y ca-certificates curl git nginx snapd
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker nginx
sudo docker compose version
```

## 2. Source dan rahasia server

Pakai commit yang sudah berisi `compose.production.yml`, `frontend/nginx.conf` terbaru, dan `ops/backup-mongo.sh`. Jika repo private, autentikasi Git di VPS atau salin source dengan SSH/SCP dari komputer lokal. Jangan salin file `.env.production` lokal yang mungkin berisi kunci berbeda. Simpan rahasia hanya dalam `.env.production` pada VPS dan jangan commit.

```bash
sudo mkdir -p /opt/booking-app
sudo chown "$USER:$USER" /opt/booking-app
git clone https://github.com/sdxtech/travel-booking-system.git /opt/booking-app
cd /opt/booking-app
```

Edit `.env.production` di VPS. Isi `JWT_SECRET` dengan nilai acak minimal 32 byte dan API key yang memang sudah siap digunakan. `DOCKER_MONGODB_URI` tidak dipakai Compose production; database berada di volume MongoDB pada VPS dan dimulai kosong. Jangan masukkan password atau token ke perintah shell yang tersimpan di history.

```bash
umask 077
nano .env.production
chmod 600 .env.production
sudo docker compose --env-file .env.production -f compose.production.yml config --quiet
```

Jika `JWT_SECRET` belum tersedia, buat nilai baru dengan `openssl rand -hex 32`, lalu masukkan lewat editor. Pastikan `RESEND_FROM_EMAIL=BDTR <info@notif.plvpilot.space>`. `RESEND_API_KEY` dan token Telegram boleh kosong selama belum siap.

## 3. Jalankan aplikasi

```bash
cd /opt/booking-app
sudo docker compose --env-file .env.production -f compose.production.yml up -d --build
sudo docker compose --env-file .env.production -f compose.production.yml ps
curl -f http://127.0.0.1:8080/
curl -f http://127.0.0.1:8080/api/healthz
```

MongoDB dan backend hanya berada di jaringan internal Docker. Frontend hanya dibuka pada loopback host port 8080.

## 4. Nginx dan HTTPS

```bash
sudo tee /etc/nginx/sites-available/booking.plvpilot.space >/dev/null <<'EOF'
server {
    listen 80;
    server_name booking.plvpilot.space;
    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
sudo ln -s /etc/nginx/sites-available/booking.plvpilot.space /etc/nginx/sites-enabled/booking.plvpilot.space
sudo nginx -t
sudo systemctl reload nginx
```

Pastikan port 80/443 terbuka pada firewall Biznet dan firewall OS. Jika UFW aktif, izinkan SSH dulu sebelum mengubah aturan:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw status
```

Sesudah DNS sudah mengarah ke VPS dan halaman HTTP merespons:

```bash
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/local/bin/certbot
sudo certbot --nginx -d booking.plvpilot.space
sudo nginx -t
sudo systemctl reload nginx
sudo certbot renew --dry-run
curl -f https://booking.plvpilot.space/api/healthz
```

## 5. Akun awal dan backup harian

Perintah seed akan meminta password secara interaktif dari stdin. Jalankan hanya setelah database siap; mengulang seed pada email yang sama akan mengganti password akun tersebut.

```bash
cd /opt/booking-app
read -r -p 'Email Super Admin: ' ADMIN_EMAIL
read -r -s -p 'Password Super Admin: ' ADMIN_PASSWORD; echo
sudo docker compose --env-file .env.production -f compose.production.yml exec -T backend \
  python seed_superadmin.py --email "$ADMIN_EMAIL" --password "$ADMIN_PASSWORD"
unset ADMIN_EMAIL ADMIN_PASSWORD
```

Pasang backup harian pukul 02:00 waktu server. Script menyimpan arsip MongoDB di `/var/backups/booking-app` selama 14 hari. Arsip tetap berada di VPS ini; salin ke lokasi lain bila membutuhkan perlindungan saat seluruh VPS gagal.

```bash
sudo chmod 755 /opt/booking-app/ops/backup-mongo.sh
sudo /opt/booking-app/ops/backup-mongo.sh
sudo crontab -e
```

Tambahkan baris berikut ke crontab root:

```cron
0 2 * * * /opt/booking-app/ops/backup-mongo.sh >> /var/log/booking-app-backup.log 2>&1
```

## Operasional

```bash
cd /opt/booking-app
sudo docker compose --env-file .env.production -f compose.production.yml logs --tail=100 backend
sudo docker compose --env-file .env.production -f compose.production.yml ps
```

Untuk update aplikasi, tarik commit yang sudah diverifikasi lalu jalankan `sudo docker compose --env-file .env.production -f compose.production.yml up -d --build`. Simpan salinan `.env.production` server sebelum `git pull` bila file tersebut berubah lokal, dan jangan jalankan `down -v` karena itu menghapus volume database.
