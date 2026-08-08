#!/usr/bin/env bash
# GameDeck pipeline bootstrap (run on your Mac).
# Brings up n8n + FlareSolverr and imports the workflow. Everything that needs
# your accounts (Supabase project, credential, Vercel, Anthropic) is still done
# in the browser - this just stands up the local half in one command.
#
#   cd deploy && ./setup.sh
set -euo pipefail

cd "$(dirname "$0")"
WF="../n8n/gamedeck-exophase-sync.json"

echo "== GameDeck pipeline setup =="

# 1. Docker present?
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker isn't installed. Install Docker Desktop (free) first:"
  echo "  https://www.docker.com/products/docker-desktop/"
  echo "Then re-run ./setup.sh"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed but not running. Open Docker Desktop, then re-run ./setup.sh"
  exit 1
fi

# 2. .env
if [ ! -f .env ]; then
  cp .env.example .env
fi
if grep -q "YOUR-PROJECT" .env; then
  read -r -p "Your Supabase project URL (https://xxxx.supabase.co): " SUPA
  # macOS/BSD sed needs the empty backup arg
  sed -i.bak "s#^SUPABASE_URL=.*#SUPABASE_URL=${SUPA%/}#" .env && rm -f .env.bak
  echo "Saved SUPABASE_URL to .env"
fi

# 3. Bring up the stack
echo "Starting n8n + FlareSolverr..."
docker compose up -d

# 4. Wait for n8n to answer
echo -n "Waiting for n8n"
for _ in $(seq 1 60); do
  if curl -sf http://localhost:5678/healthz >/dev/null 2>&1; then break; fi
  echo -n "."; sleep 2
done
echo

# 5. Best-effort: import the workflow so it shows up in the list (credentials
#    are still attached in the GUI). Safe to fail - you can import by hand.
CID="$(docker compose ps -q n8n || true)"
if [ -n "${CID:-}" ] && [ -f "$WF" ]; then
  if docker cp "$WF" "$CID":/tmp/wf.json >/dev/null 2>&1 \
     && docker compose exec -T n8n n8n import:workflow --input=/tmp/wf.json >/dev/null 2>&1; then
    echo "Imported workflow into n8n."
    docker compose restart n8n >/dev/null 2>&1 || true
  else
    echo "Auto-import skipped - import ../n8n/gamedeck-exophase-sync.json by hand in the UI."
  fi
fi

cat <<'EOF'

Local stack is up:  http://localhost:5678

Finish in the n8n UI (needs your service_role key, one-time):
  1. Create the owner account.
  2. Credentials > New > "Supabase API", name it exactly:
       GameDeck Supabase (service role)
     Host = your project URL, Service Role Secret = service_role key.
  3. Open the workflow "GameDeck | Exophase ...". On the 4 HTTP nodes,
     set the credential dropdown to that Supabase credential.
  4. Click "Execute Workflow" once (backfills ~830 games).
  5. Toggle the workflow Active. It runs every 6 hours whenever your Mac is on.

To stop:   docker compose down      (data is kept)
To update: docker compose pull && docker compose up -d
EOF
