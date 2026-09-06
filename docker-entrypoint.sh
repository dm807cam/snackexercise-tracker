#!/bin/sh
# Bring the database up to date, then hand off to the server.
# Both steps are idempotent, so a restart is always safe.
set -e

echo "> Applying database migrations..."
node_modules/prisma/build/index.js migrate deploy

echo "> Seeding exercise catalogue (idempotent)..."
node_modules/tsx/dist/cli.mjs prisma/seed.ts

echo "> Starting server on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}"
exec "$@"
