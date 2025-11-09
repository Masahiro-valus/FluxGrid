#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export COMPOSE_PROJECT_NAME=fluxgrid

echo "Stopping database containers..."
docker compose -f "${ROOT_DIR}/docker-compose.yml" down "$@"

