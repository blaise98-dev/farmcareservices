#!/usr/bin/env bash
# Start backend with remote MySQL via SSH tunnel (configure DB_REMOTE_HOST in .env).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

REMOTE_HOST="${DB_REMOTE_HOST:?Set DB_REMOTE_HOST in webapp/backend/.env}"
SSH_KEY="${SSH_TUNNEL_KEY:-$HOME/.ssh/moome_tunnel}"
LOCAL_PORT="${DB_PORT:-3307}"
REMOTE_MYSQL_PORT=3306

if ! lsof -i :"${LOCAL_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Starting SSH tunnel → remote MySQL on ${REMOTE_HOST} (localhost:${LOCAL_PORT})..."
  ssh -i "$SSH_KEY" -o ConnectTimeout=10 -f -N \
    -L "${LOCAL_PORT}:127.0.0.1:${REMOTE_MYSQL_PORT}" "root@${REMOTE_HOST}"
  sleep 1
fi

if ! lsof -i :"${LOCAL_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "ERROR: SSH tunnel failed. Remote data will not be reachable."
  echo "Run manually: ssh -i $SSH_KEY -f -N -L ${LOCAL_PORT}:127.0.0.1:${REMOTE_MYSQL_PORT} root@${REMOTE_HOST}"
  exit 1
fi

echo "SSH tunnel active — all DB writes go to remote host ${REMOTE_HOST}"
source venv/bin/activate
uvicorn main:app --reload --port 8000
