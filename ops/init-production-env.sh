#!/usr/bin/env bash
set -euo pipefail

project_dir=/opt/booking-app
env_file="$project_dir/.env.production"

if [[ -e "$env_file" ]]; then
  echo ".env.production already exists; leaving it unchanged."
  exit 0
fi

umask 077
jwt_secret=$(openssl rand -hex 32)
cat > "$env_file" <<EOF
JWT_SECRET=$jwt_secret
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURITY=ssl
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
EOF
chmod 600 "$env_file"
echo "Created .env.production with a new JWT secret. Add SMTP and Telegram settings when ready."
