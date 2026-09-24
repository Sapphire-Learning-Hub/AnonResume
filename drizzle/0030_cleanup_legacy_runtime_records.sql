DO $$
DECLARE
  removed_runtime_states integer;
  removed_worker_heartbeats integer;
BEGIN
  -- Before stable instance IDs, config runtimes used bare UUIDs.
  DELETE FROM system_config_runtime_states
  WHERE instance_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND last_seen_at < now() - interval '5 minutes';
  GET DIAGNOSTICS removed_runtime_states = ROW_COUNT;

  -- Before stable worker IDs, workers used hostname:pid:UUID.
  DELETE FROM worker_heartbeats
  WHERE worker_id ~* '^[^:]+:[0-9]+:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND last_seen_at < now() - interval '5 minutes';
  GET DIAGNOSTICS removed_worker_heartbeats = ROW_COUNT;

  RAISE NOTICE 'legacy_runtime_cleanup runtime_states=% worker_heartbeats=%',
    removed_runtime_states, removed_worker_heartbeats;
END $$;
