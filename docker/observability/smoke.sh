#!/bin/sh
set -eu

elasticsearch_url=${ELASTICSEARCH_URL:-http://127.0.0.1:9200}
gelf_host=${GELF_HOST:-127.0.0.1}
gelf_port=${GELF_PORT:-12201}
run_id="$(date +%s)"

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
