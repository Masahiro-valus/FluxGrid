#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export COMPOSE_PROJECT_NAME=fluxgrid

POSTGRES_SERVICE=${1:-postgres}
MYSQL_SERVICE=${2:-mysql}

echo "Waiting for PostgreSQL service (${POSTGRES_SERVICE})..."
until docker compose -f "${ROOT_DIR}/docker-compose.yml" exec -T "${POSTGRES_SERVICE}" pg_isready -U fluxgrid -d fluxgrid >/dev/null 2>&1; do
  sleep 2
done
echo "PostgreSQL is ready."

echo "Waiting for MySQL service (${MYSQL_SERVICE})..."
until docker compose -f "${ROOT_DIR}/docker-compose.yml" exec -T "${MYSQL_SERVICE}" mysqladmin ping -h 127.0.0.1 -uroot -pfluxgrid --silent >/dev/null 2>&1; do
  sleep 2
done
echo "MySQL is ready."

