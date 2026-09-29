#!/usr/bin/env bash
set -euo pipefail

project_dir="${BOOKING_APP_DIR:-/opt/booking-app}"
env_file="$project_dir/.env.production"
container_id="$(sudo docker ps --filter 'label=com.docker.compose.project=booking-app' --filter 'label=com.docker.compose.service=mongo' --format '{{.ID}}' | head -n 1)"

if [[ ! -f "$env_file" ]]; then
  echo "Missing $env_file; refusing to continue." >&2
  exit 1
fi

if [[ -z "$container_id" ]]; then
  echo "The running booking-app MongoDB container was not found." >&2
  exit 1
fi

read_env_value() {
  local key="$1"
  sed -n "s/^${key}=//p" "$env_file" | tail -n 1
}

root_user="$(read_env_value MONGO_ROOT_USERNAME)"
root_password="$(read_env_value MONGO_ROOT_PASSWORD)"
app_password="$(read_env_value MONGO_APP_PASSWORD)"
root_user="${root_user:-booking_root}"
root_password="${root_password:-$(openssl rand -hex 32)}"
app_password="${app_password:-$(openssl rand -hex 32)}"

export MONGO_ROOT_USERNAME="$root_user"
export MONGO_ROOT_PASSWORD="$root_password"
export MONGO_APP_PASSWORD="$app_password"
python3 - "$env_file" <<'PY'
import os
import pathlib
import sys
import tempfile

path = pathlib.Path(sys.argv[1])
keys = {
    "MONGO_ROOT_USERNAME": os.environ["MONGO_ROOT_USERNAME"],
    "MONGO_ROOT_PASSWORD": os.environ["MONGO_ROOT_PASSWORD"],
    "MONGO_APP_PASSWORD": os.environ["MONGO_APP_PASSWORD"],
}
lines = path.read_text().splitlines()
found = set()
updated = []
for line in lines:
    key = line.partition("=")[0]
    if key in keys:
        updated.append(f"{key}={keys[key]}")
        found.add(key)
    else:
        updated.append(line)
for key, value in keys.items():
    if key not in found:
        updated.append(f"{key}={value}")

fd, temp_name = tempfile.mkstemp(dir=path.parent, prefix=".env.production.")
try:
    with os.fdopen(fd, "w") as temp:
        temp.write("\n".join(updated) + "\n")
    os.chmod(temp_name, 0o600)
    os.replace(temp_name, path)
finally:
    if os.path.exists(temp_name):
        os.unlink(temp_name)
PY
chmod 600 "$env_file"

sudo docker exec \
  -e MONGO_ROOT_USERNAME="$root_user" \
  -e MONGO_ROOT_PASSWORD="$root_password" \
  -e MONGO_APP_PASSWORD="$app_password" \
  "$container_id" mongosh --quiet --eval '
    const rootUser = process.env.MONGO_ROOT_USERNAME;
    const rootPassword = process.env.MONGO_ROOT_PASSWORD;
    const appPassword = process.env.MONGO_APP_PASSWORD;
    const admin = db.getSiblingDB("admin");
    const currentRoot = admin.getUser(rootUser);
    if (currentRoot) {
      admin.updateUser(rootUser, { pwd: rootPassword, roles: [{ role: "root", db: "admin" }] });
    } else {
      admin.createUser({ user: rootUser, pwd: rootPassword, roles: [{ role: "root", db: "admin" }] });
    }
    const appDb = db.getSiblingDB("bdtr_prod");
    const currentApp = appDb.getUser("booking_app");
    if (currentApp) {
      appDb.updateUser("booking_app", { pwd: appPassword, roles: [{ role: "readWrite", db: "bdtr_prod" }] });
    } else {
      appDb.createUser({ user: "booking_app", pwd: appPassword, roles: [{ role: "readWrite", db: "bdtr_prod" }] });
    }
    print("MongoDB root and least-privilege application users are ready.");
  '

echo "MongoDB credentials were stored in .env.production and provisioned in the current database."
echo "Back up the database before recreating MongoDB with the authenticated production Compose file."
