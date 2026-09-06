# syntax=docker/dockerfile:1

# ---- dependencies (all, for building) ------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
# better-sqlite3 is a native module and may need to compile on this platform.
RUN apk add --no-cache libc6-compat python3 make g++
COPY package.json package-lock.json ./
RUN npm ci

# ---- migration CLI -------------------------------------------------------
# The Prisma CLI is installed on its own rather than pulled out of the build
# stage or taken from a full production install. Copying individual packages
# does not work (the CLI has transitive dependencies that would go missing),
# and a full `npm ci --omit=dev` drags in ~900MB, most of it the build-only
# @next/swc binaries and a second copy of Next that the standalone bundle
# already contains. This stage is the CLI and nothing else.
FROM node:22-alpine AS migrate-cli
WORKDIR /cli
RUN npm init -y >/dev/null \
 && npm install --omit=dev --ignore-scripts prisma@7.10.0

# ---- build ---------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Only needs to be a syntactically valid URL; no database is touched here.
ENV DATABASE_URL="file:/data/app.db"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate \
 && npm run build \
 # Bundle the seed to plain JS so the runtime needs no TypeScript loader.
 && npm run build:seed

# ---- runtime -------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache libc6-compat

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL="file:/data/app.db"

# Next's standalone server, its static assets and public files.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Applied at container start, not at build time.
COPY --from=build /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=build /app/prisma/migrations ./prisma/migrations
COPY --from=build /app/prisma.config.mjs ./prisma.config.mjs
COPY --from=build /app/dist/seed.mjs ./dist/seed.mjs
COPY --from=build /app/generated ./generated

# Overlaid on the standalone bundle's traced modules. The bundle already
# carries everything the server needs at runtime; this adds only what the
# migration CLI needs at start-up.
COPY --from=migrate-cli /cli/node_modules ./node_modules

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# The volume must be writable by the non-root user the server runs as.
RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
