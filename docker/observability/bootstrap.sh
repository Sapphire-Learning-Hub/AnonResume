#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
elasticsearch_url=${ELASTICSEARCH_URL:-http://127.0.0.1:9200}
kibana_url=${KIBANA_URL:-http://127.0.0.1:5601}

until curl --fail --silent "$elasticsearch_url/_cluster/health?wait_for_status=yellow" >/dev/null; do
  sleep 2
done

curl --fail --silent --show-error \
  -X PUT "$elasticsearch_url/_ilm/policy/anonresume-logs-7d" \
  -H 'Content-Type: application/json' \
  --data-binary "@$root/elasticsearch/ilm-policy.json" >/dev/null
curl --fail --silent --show-error \
  -X PUT "$elasticsearch_url/_index_template/anonresume-logs" \
  -H 'Content-Type: application/json' \
  --data-binary "@$root/elasticsearch/index-template.json" >/dev/null

until curl --fail --silent "$kibana_url/api/status" >/dev/null; do
  sleep 2
done

curl --fail --silent --show-error \
  -X POST "$kibana_url/api/saved_objects/_import?overwrite=true" \
  -H 'kbn-xsrf: true' \
  --form file="@$root/kibana/data-view.ndjson" >/dev/null

printf '%s\n' 'AnonResume observability bootstrap completed.'
