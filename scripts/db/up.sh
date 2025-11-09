#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export COMPOSE_PROJECT_NAME=fluxgrid

echo "Starting database containers..."
docker compose -f "${ROOT_DIR}/docker-compose.yml" up -d "$@"
echo "Databases are starting. Use scripts/db/wait.sh to block until ready."
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export COMPOSE_PROJECT_NAME=fluxgrid

echo "Starting database containers..."
docker compose -f "${ROOT_DIR}/docker-compose.yml" up -d "$@"
echo "Databases are starting. Use scripts/db/wait.sh to block until ready."

