#!/bin/sh
set -eu

command="${1:-web}"
if [ "$#" -gt 0 ]; then
  shift
fi

case "$command" in
  web)
    exec bun server.js "$@"
    ;;
  ai-worker)
    exec bun run scripts/ai-worker.ts "$@"
    ;;
  pdf-worker)
    exec bun run scripts/pdf-worker.ts "$@"
    ;;
  migrate)
    exec bun run deploy:migrate "$@"
    ;;
  bootstrap-admin)
    exec bun run deploy:bootstrap-admin -- "$@"
    ;;
  config-doctor)
    exec bun run config:doctor -- "$@"
    ;;
  healthcheck)
    exec bun run deploy:healthcheck -- "$@"
    ;;
  init-secrets)
    exec bun run scripts/init-deployment-secrets.ts "$@"
    ;;
  *)
    echo "Unknown AnonResume command: $command" >&2
    exit 64
    ;;
esac
