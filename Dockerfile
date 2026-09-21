ARG BUN_VERSION=1.3.14
FROM oven/bun:${BUN_VERSION}-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get upgrade -y \
  && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS production-dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --omit=peer

FROM dependencies AS builder
ARG ANONRESUME_BUILD_COMMIT=""
ARG ANONRESUME_BUILD_TAG="untagged"
ENV ANONRESUME_BUILD_COMMIT=${ANONRESUME_BUILD_COMMIT}
ENV ANONRESUME_BUILD_TAG=${ANONRESUME_BUILD_TAG}
COPY . .
# Route collection constructs the lazy PostgreSQL pool but does not connect.
# Runtime containers replace this non-secret placeholder through DATABASE_URL_FILE.
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build bun run build

FROM base AS runtime-base
ARG ANONRESUME_BUILD_COMMIT=""
ARG ANONRESUME_BUILD_TAG="untagged"
LABEL org.opencontainers.image.title="AnonResume"
LABEL org.opencontainers.image.source="https://github.com/Sapphire-Learning-Hub/AnonResume"
LABEL org.opencontainers.image.revision=${ANONRESUME_BUILD_COMMIT}
LABEL org.opencontainers.image.version=${ANONRESUME_BUILD_TAG}
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV ANONRESUME_BUILD_COMMIT=${ANONRESUME_BUILD_COMMIT}
ENV ANONRESUME_BUILD_TAG=${ANONRESUME_BUILD_TAG}
RUN groupadd --system --gid 1001 anonresume \
  && useradd --system --uid 1001 --gid anonresume --home-dir /app anonresume
COPY --from=production-dependencies --chown=anonresume:anonresume /app/node_modules ./node_modules
COPY --from=builder --chown=anonresume:anonresume /app/.next/standalone ./
COPY --from=builder --chown=anonresume:anonresume /app/.next/static ./.next/static
COPY --from=builder --chown=anonresume:anonresume /app/public ./public
COPY --from=builder --chown=anonresume:anonresume /app/drizzle ./drizzle
COPY --from=builder --chown=anonresume:anonresume /app/scripts ./scripts
COPY --from=builder --chown=anonresume:anonresume /app/src ./src
COPY --from=builder --chown=anonresume:anonresume /app/package.json /app/tsconfig.json ./
COPY --from=builder --chown=anonresume:anonresume /app/docker/entrypoint.sh /usr/local/bin/anonresume
RUN chmod 0755 /usr/local/bin/anonresume
USER anonresume
EXPOSE 3000
ENTRYPOINT ["anonresume"]
CMD ["web"]

FROM runtime-base AS core-runtime

FROM runtime-base AS pdf-runtime
USER root
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN bun node_modules/playwright/cli.js install --with-deps --only-shell chromium \
  && chmod -R a+rX /ms-playwright
USER anonresume
CMD ["pdf-worker"]
