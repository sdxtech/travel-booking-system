# Deploy awal di Biznet VPS (Ubuntu 24.04)

Target: `https://booking.pesan.biz`, Docker Compose untuk aplikasi dan MongoDB, Nginx + Certbot di host. Jalankan perintah di VPS sebagai user yang punya `sudo`.

## DNS subdomain di Hostinger

Di hPanel Hostinger, buka **Domains → Domain portfolio → Manage** untuk `pesan.biz`, lalu **DNS / Nameservers → DNS records**. Tambahkan satu record **A** dengan **Name/Host `booking`**, **Points to/Content = IP publik Biznet Gio**, dan TTL default. Periksa apakah sudah ada record A, AAAA, atau CNAME untuk `booking`; hapus atau edit record yang bentrok. Jangan ubah record MX/TXT email untuk langkah ini. Jika nameserver `pesan.biz` dikelola di luar Hostinger, buat record A yang sama pada penyedia DNS yang aktif. Karena aplikasi di-host pada Biznet Gio, yang dibutuhkan di Hostinger adalah DNS record, bukan website/subdomain hosting baru.

Setelah DNS menyebar, cek `getent ahostsv4 booking.pesan.biz` di VPS. Hasil IPv4 harus sama dengan IP publik Biznet Gio sebelum menjalankan Certbot.

## Akses awal lewat Biznet Gio

Di portal Biznet Gio, buka **Compute → NEO Lite / NEO Lite Pro → instance → Open Console**. Tab noVNC yang muncul adalah terminal Ubuntu VPS; login sebagai user dan password OS yang dibuat saat order. Semua perintah di bawah dijalankan di terminal itu. Untuk menempel perintah panjang, gunakan kontrol **Clipboard** noVNC bila tersedia; SSH dari Windows Terminal biasanya lebih mudah untuk copy/paste. Jika ingin SSH, lihat IP publik di detail instance dan gunakan keypair yang dipasang saat order, misalnya `ssh -i <path-private-key> trbookadmin@<IP-PUBLIK>` dari komputer lokal.

Jika SSH belum aktif, jalankan lebih dulu di noVNC:

```bash
sudo apt update
sudo apt install -y openssh-server
sudo systemctl enable --now ssh
sudo systemctl status ssh --no-pager
sudo ss -ltnp | grep ':22'
if command -v ufw >/dev/null; then sudo ufw allow OpenSSH; fi
```

Untuk memakai key lokal `travel-booking-ssh`, tampilkan isi `travel-booking-ssh.pub` di terminal PowerShell komputer Anda dengan `Get-Content .\travel-booking-ssh.pub`. Salin satu baris public key itu. Di noVNC sebagai `trbookadmin`, jalankan `mkdir -p ~/.ssh`, `chmod 700 ~/.ssh`, buka `nano ~/.ssh/authorized_keys`, tambahkan public key pada baris baru, simpan, lalu jalankan `chmod 600 ~/.ssh/authorized_keys`. Jangan pindahkan private key ke VPS. Dari terminal VS Code di folder project lokal, sambungkan dengan `ssh -i ".\travel-booking-ssh" trbookadmin@<IP-PUBLIK>`.

Pada menu **Security Group** NEO Lite, pastikan inbound TCP 80 dan 443 tersedia untuk publik. Jika security group baru di-attach, tambahkan aturan SSH 22 untuk IP komputer Anda sebelum menutup noVNC. MongoDB 27017 dan port aplikasi 8080 tidak perlu dibuka ke publik.

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

Pakai commit yang sudah berisi `compose.production.yml`, `frontend/nginx.conf` terbaru, dan `ops/backup-mongo.sh`. Jika repo private, autentikasi Git di VPS atau salin source dengan SSH/SCP dari komputer lokal. File `.env.production` memang tidak ada dalam Git; buat langsung di VPS. Simpan rahasia hanya dalam file tersebut dan jangan commit.

```bash
sudo mkdir -p /opt/booking-app
sudo chown "$USER:$USER" /opt/booking-app
git clone https://github.com/sdxtech/travel-booking-system.git /opt/booking-app
cd /opt/booking-app
```

File `.env.production` belum ada setelah clone. Jalankan skrip sekali untuk membuat JWT secret acak langsung di VPS tanpa menampilkannya di terminal. Skrip tidak akan mengubah file yang sudah ada. `DOCKER_MONGODB_URI` tidak dipakai Compose production; database berada di volume MongoDB pada VPS dan dimulai kosong.

```bash
cd /opt/booking-app
bash ops/init-production-env.sh
sudo docker compose --env-file .env.production -f compose.production.yml config --quiet
```

Isi awal `.env.production` setelah skrip dijalankan:

```env
JWT_SECRET=<dibuat otomatis oleh skrip>
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURITY=ssl
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
```

Hapus tanda `<` dan `>` saat mengisi nilai nyata. Jika password SMTP mengandung karakter `$` atau `#`, bungkus nilainya dengan tanda petik tunggal di file env agar Docker Compose membacanya secara harfiah.

Untuk menambahkan kredensial SMTP/Telegram nanti, buka `nano .env.production`. Jangan masukkan password atau token ke perintah shell yang tersimpan di history.

Untuk email Hostinger, buat mailbox pengirim di hPanel, lalu isi variabel berikut saat siap:

```env
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURITY=ssl
SMTP_USERNAME=<alamat mailbox lengkap>
SMTP_PASSWORD=<password mailbox>
SMTP_FROM_EMAIL=Booking App <alamat mailbox lengkap>
```

Ambil pengaturan SMTP yang tepat dari hPanel **Emails → Manage → Connect Apps & Devices → Manual Configuration**. Jika hPanel mengarahkan ke port 587, gunakan `SMTP_PORT=587` dan `SMTP_SECURITY=starttls`. Password mailbox berbeda dari password login hPanel. Email otomatis dilewati sampai semua variabel SMTP wajib terisi; notifikasi aplikasi dan alur booking tetap berjalan. Token Telegram juga boleh dikosongkan selama belum siap.

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
sudo tee /etc/nginx/sites-available/booking.pesan.biz >/dev/null <<'EOF'
server {
    listen 80;
    server_name booking.pesan.biz;
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
sudo ln -s /etc/nginx/sites-available/booking.pesan.biz /etc/nginx/sites-enabled/booking.pesan.biz
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
sudo certbot --nginx -d booking.pesan.biz
sudo nginx -t
sudo systemctl reload nginx
sudo certbot renew --dry-run
curl -f https://booking.pesan.biz/api/healthz
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

Untuk update aplikasi, tarik commit yang sudah diverifikasi lalu jalankan `sudo docker compose --env-file .env.production -f compose.production.yml up -d --build`. File `.env.production` tidak dilacak Git sehingga tetap ada saat `git pull`. Jangan jalankan `down -v` karena itu menghapus volume database.
