#!/bin/sh
# Bring the database up to date, then hand off to the server.
# Both steps are idempotent, so restarting the container is always safe.
set -e

echo "> Applying database migrations..."
node_modules/.bin/prisma migrate deploy

echo "> Seeding exercise catalogue (idempotent)..."
node dist/seed.mjs

echo "> Starting server on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}"
exec "$@"
