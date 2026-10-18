#!/bin/sh
set -eu

elasticsearch_url=${ELASTICSEARCH_URL:-http://127.0.0.1:9200}
gelf_host=${GELF_HOST:-127.0.0.1}
gelf_port=${GELF_PORT:-12201}
mode=${1:---collector-only}
run_id="$(date +%s)-$$"
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_root=$(CDPATH= cd -- "$root/../.." && pwd)

case "$mode" in
  --collector-only|--application) ;;
  *)
    printf '%s\n' "Usage: $0 [--collector-only|--application]" >&2
    exit 2
    ;;
esac

json_string() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/^/"/; s/$/"/'
}

send_gelf() {
  short_message=$1
  extra_fields=${2:-}
  printf '{"version":"1.1","host":"anonresume-smoke","short_message":%s%s}' \
    "$(json_string "$short_message")" "$extra_fields" \
    | nc -u -w 1 "$gelf_host" "$gelf_port"
}

transaction_count() {
  transaction_id=$1
  response=$(curl --fail --silent \
    -H 'Content-Type: application/json' \
    "$elasticsearch_url/logs-anonresume.application-development/_count" \
    --data-binary "{\"query\":{\"term\":{\"transaction.id\":\"$transaction_id\"}}}" \
    2>/dev/null || true)
  count=$(printf '%s' "$response" | sed -n 's/.*"count":\([0-9][0-9]*\).*/\1/p')
  printf '%s\n' "${count:-0}"
}

stream_count() {
  data_stream=$1
  response=$(curl --fail --silent "$elasticsearch_url/$data_stream/_count" 2>/dev/null || true)
  count=$(printf '%s' "$response" | sed -n 's/.*"count":\([0-9][0-9]*\).*/\1/p')
  printf '%s\n' "${count:-0}"
}

wait_for_transaction() {
  transaction_id=$1
  attempt=0
  while [ "$attempt" -lt 30 ]; do
    if [ "$(transaction_count "$transaction_id")" -gt 0 ]; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
  printf '%s\n' "Timed out waiting for transaction $transaction_id." >&2
  exit 1
}

event_json() {
  transaction_id=$1
  centralize=$2
  printf '{"@timestamp":"%s","ecs.version":"8.17.0","event.action":"smoke_test","event.dataset":"anonresume.runtime","event.outcome":"success","labels.centralize":%s,"log.level":"info","message":"smoke_test","service.name":"anonresume-smoke","transaction.id":"%s"}' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$centralize" "$transaction_id"
}

visible_id="smoke-visible-$run_id"
send_gelf "$(event_json "$visible_id" true)"
wait_for_transaction "$visible_id"

suppressed_id="smoke-suppressed-$run_id"
barrier_id="smoke-barrier-$run_id"
send_gelf "$(event_json "$suppressed_id" false)"
send_gelf "$(event_json "$barrier_id" true)"
wait_for_transaction "$barrier_id"
if [ "$(transaction_count "$suppressed_id")" -ne 0 ]; then
  printf '%s\n' "Sensitive local event $suppressed_id was centralized." >&2
  exit 1
fi

dead_letter_stream=logs-anonresume.dead_letter-development
dead_letter_before=$(stream_count "$dead_letter_stream")
unsafe_value="unsafe-gelf-value-$run_id"
send_gelf "malformed-$run_id" ",\"_unsafe_value\":\"$unsafe_value\""

attempt=0
while [ "$attempt" -lt 30 ]; do
  if [ "$(stream_count "$dead_letter_stream")" -gt "$dead_letter_before" ]; then
    break
  fi
  attempt=$((attempt + 1))
  sleep 1
done
if [ "$attempt" -eq 30 ]; then
  printf '%s\n' "Timed out waiting for a dead-letter event." >&2
  exit 1
fi

dead_letter=$(curl --fail --silent \
  -H 'Content-Type: application/json' \
  "$elasticsearch_url/$dead_letter_stream/_search" \
  --data-binary '{"size":1,"sort":[{"@timestamp":"desc"}],"query":{"match_all":{}}}')
if printf '%s' "$dead_letter" | grep --quiet "$unsafe_value"; then
  printf '%s\n' "Unsafe GELF metadata was copied to the dead-letter stream." >&2
  exit 1
fi

printf '%s\n' "AnonResume observability smoke checks passed."

if [ "$mode" = "--collector-only" ]; then
  exit 0
fi

: "${ANONRESUME_SMOKE_COOKIE_FILE:?Set ANONRESUME_SMOKE_COOKIE_FILE to a mode-0600 cookie jar}"
: "${ANONRESUME_SMOKE_RESUME_ID:?Set ANONRESUME_SMOKE_RESUME_ID to a disposable local resume}"

app_url=${ANONRESUME_SMOKE_APP_URL:-http://127.0.0.1:3000}
cookie_file=$ANONRESUME_SMOKE_COOKIE_FILE
resume_id=$ANONRESUME_SMOKE_RESUME_ID

if [ ! -f "$cookie_file" ]; then
  printf '%s\n' "Smoke-test cookie jar does not exist: $cookie_file" >&2
  exit 1
fi
cookie_mode=$(stat -f '%Lp' "$cookie_file" 2>/dev/null || stat -c '%a' "$cookie_file")
if [ "$cookie_mode" != "600" ]; then
  printf '%s\n' "Smoke-test cookie jar must have mode 0600." >&2
  exit 1
fi

temporary_directory=$(mktemp -d)
postgres_paused=false

app_compose() {
  ANONRESUME_VERSION=${ANONRESUME_VERSION:-development} \
  BETTER_AUTH_URL=${BETTER_AUTH_URL:-$app_url} \
    docker compose \
      -f "$repository_root/compose.yaml" \
      -f "$repository_root/compose.build.yaml" \
      -f "$repository_root/compose.observability.yaml" \
      "$@"
}

observability_compose() {
  docker compose -f "$root/compose.yaml" "$@"
}

cleanup() {
  if [ "$postgres_paused" = "true" ]; then
    app_compose unpause postgres >/dev/null 2>&1 || true
  fi
  rm -rf "$temporary_directory"
}
trap cleanup EXIT HUP INT TERM

capture_request() {
  method=$1
  url=$2
  authentication=$3
  headers_file="$temporary_directory/headers"
  body_file="$temporary_directory/body"
  if [ "$authentication" = "authenticated" ]; then
    status=$(curl --silent --show-error \
      --max-time 15 \
      --request "$method" \
      --cookie "$cookie_file" \
      --header "Origin: $app_url" \
      --dump-header "$headers_file" \
      --output "$body_file" \
      --write-out '%{http_code}' \
      "$url")
  else
    status=$(curl --silent --show-error \
      --max-time 15 \
      --request "$method" \
      --dump-header "$headers_file" \
      --output "$body_file" \
      --write-out '%{http_code}' \
      "$url")
  fi
  request_id=$(awk '
    tolower($1) == "x-request-id:" { gsub(/\r/, "", $2); value = $2 }
    END { print value }
  ' "$headers_file")
  request_id=${request_id:-missing}
  printf '%s %s\n' "$status" "$request_id"
}

assert_status() {
  actual=$1
  expected=$2
  operation=$3
  if [ "$actual" != "$expected" ]; then
    printf '%s\n' "$operation returned HTTP $actual; expected $expected." >&2
    exit 1
  fi
}

assert_request_id() {
  request_id=$1
  operation=$2
  if [ "$request_id" = "missing" ]; then
    printf '%s\n' "$operation did not return x-request-id." >&2
    exit 1
  fi
}

wait_for_request_log() {
  request_id=$1
  attempt=0
  while [ "$attempt" -lt 30 ]; do
    response=$(curl --fail --silent \
      --max-time 5 \
      -H 'Content-Type: application/json' \
      "$elasticsearch_url/logs-anonresume.application-development/_count" \
      --data-binary "{\"query\":{\"bool\":{\"filter\":[{\"term\":{\"request.id\":\"$request_id\"}},{\"exists\":{\"field\":\"service.name\"}},{\"exists\":{\"field\":\"service.version\"}},{\"exists\":{\"field\":\"service.node.name\"}},{\"exists\":{\"field\":\"event.action\"}},{\"exists\":{\"field\":\"event.outcome\"}},{\"exists\":{\"field\":\"http.response.status_code\"}},{\"exists\":{\"field\":\"event.duration\"}}]}}}" \
      2>/dev/null || true)
    count=$(printf '%s' "$response" | sed -n 's/.*"count":\([0-9][0-9]*\).*/\1/p')
    if [ "${count:-0}" -gt 0 ]; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
  printf '%s\n' "Timed out waiting for request log $request_id." >&2
  exit 1
}

set -- $(capture_request GET "$app_url/api/setup/status" anonymous)
assert_status "$1" 200 "Setup status"
assert_request_id "$2" "Setup status"
setup_request_id=$2

set -- $(capture_request GET "$app_url/api/resumes/$resume_id" anonymous)
assert_status "$1" 401 "Unauthenticated resume request"
assert_request_id "$2" "Unauthenticated resume request"
unauthenticated_request_id=$2

set -- $(capture_request POST "$app_url/api/resumes/$resume_id/pdf" authenticated)
assert_status "$1" 202 "Authenticated PDF export"
assert_request_id "$2" "Authenticated PDF export"
pdf_request_id=$2

wait_for_request_log "$setup_request_id"
wait_for_request_log "$unauthenticated_request_id"
wait_for_request_log "$pdf_request_id"

app_compose pause postgres >/dev/null
postgres_paused=true
attempt=0
readiness_request_id=
while [ "$attempt" -lt 20 ]; do
  set -- $(capture_request GET "$app_url/api/health/ready" anonymous)
  if [ "$1" = "503" ]; then
    readiness_request_id=$2
    break
  fi
  attempt=$((attempt + 1))
  sleep 1
done
if [ -z "$readiness_request_id" ]; then
  printf '%s\n' "Readiness did not report HTTP 503 while PostgreSQL was paused." >&2
  exit 1
fi
app_compose unpause postgres >/dev/null
postgres_paused=false
wait_for_request_log "$readiness_request_id"

attempt=0
while [ "$attempt" -lt 20 ]; do
  set -- $(capture_request GET "$app_url/api/health/ready" anonymous)
  if [ "$1" = "200" ]; then
    break
  fi
  attempt=$((attempt + 1))
  sleep 1
done
if [ "$attempt" -eq 20 ]; then
  printf '%s\n' "Readiness did not recover after PostgreSQL resumed." >&2
  exit 1
fi

observability_compose stop logstash >/dev/null
set -- $(capture_request GET "$app_url/api/setup/status" anonymous)
assert_status "$1" 200 "Request while Logstash is stopped"
assert_request_id "$2" "Request while Logstash is stopped"
observability_compose up -d --wait logstash >/dev/null

set -- $(capture_request GET "$app_url/api/setup/status" anonymous)
assert_status "$1" 200 "Request after Logstash recovery"
assert_request_id "$2" "Request after Logstash recovery"
wait_for_request_log "$2"

local_event_count=$(curl --fail --silent \
  -H 'Content-Type: application/json' \
  "$elasticsearch_url/logs-anonresume.application-development/_count" \
  --data-binary '{"query":{"term":{"labels.centralize":false}}}' \
  | sed -n 's/.*"count":\([0-9][0-9]*\).*/\1/p')
if [ "${local_event_count:-0}" -ne 0 ]; then
  printf '%s\n' "Local-sensitive events were found in Elasticsearch." >&2
  exit 1
fi

printf '%s\n' "AnonResume application observability checks passed."
