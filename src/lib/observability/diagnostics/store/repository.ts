import type { Pool } from "pg";
import { diagnosticEventSchema, type DiagnosticBatch, type DiagnosticDetails, type DiagnosticFilter, type DiagnosticListItem, type DiagnosticPolicy } from "./schema";

export class DiagnosticRepository {
  readonly prefix: string;
  constructor(readonly pool: Pool, schema: string) { this.prefix = `"${schema.replaceAll('"', '""')}"`; }
  async write(batch: DiagnosticBatch, policy: DiagnosticPolicy) {
    if (!policy.enabled) return;
    const events = batch.events.map((event) => diagnosticEventSchema.parse(event));
    const faulted = events.some((event) => event.kind === "fault");
    const client = await this.pool.connect();
    let destroyed = false;
    const deadline = setTimeout(() => { destroyed=true; client.release(true); },2500);
    deadline.unref();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = '1500ms'");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`diagnostic:${batch.diagnosticId}`]);
      const existing = await client.query(`SELECT id FROM ${this.prefix}.diagnostic_operations WHERE id=$1`,[batch.diagnosticId]);
      const newFaults = events.filter((event) => event.kind === "fault");
      if (!existing.rowCount || newFaults.length) {
        // Bound admission across replicas, without waiting behind a storage flood.
        const lock = await client.query<{locked:boolean}>("SELECT pg_try_advisory_xact_lock(hashtext('anonresume:diagnostic-admission')) AS locked");
        if (!lock.rows[0]?.locked) throw new Error("diagnostic_store_busy");
        if (!existing.rowCount) {
          const size = await client.query<{n:number}>(`SELECT count(*)::int AS n FROM ${this.prefix}.diagnostic_operations`);
          if ((size.rows[0]?.n ?? 0)>=policy.maxRecords+10_000) throw new Error("diagnostic_store_full");
        }
      }
      await client.query(`INSERT INTO ${this.prefix}.diagnostic_operations (id,expires_at,faulted,truncated) VALUES ($1,$2,$3,$4)
        ON CONFLICT (id) DO UPDATE SET faulted=diagnostic_operations.faulted OR EXCLUDED.faulted,
          truncated=diagnostic_operations.truncated OR EXCLUDED.truncated,
          expires_at=GREATEST(diagnostic_operations.expires_at,EXCLUDED.expires_at)`,
      [batch.diagnosticId, new Date(Date.now() + (faulted ? policy.retentionDays * 86_400_000 : policy.pendingTtlMs)), faulted, batch.truncated]);
      for (const event of events) {
        await client.query(`INSERT INTO ${this.prefix}.diagnostic_events (id,diagnostic_id,at,fault,fingerprint,source,request_id,task_id,payload)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload ||
            CASE WHEN diagnostic_events.payload->'locations' @> '[{"status":"mapped"}]'::jsonb
              OR diagnostic_events.payload->'locations' @> '[{"status":"source"}]'::jsonb
              THEN jsonb_build_object('locations',diagnostic_events.payload->'locations') ELSE '{}'::jsonb END
          WHERE diagnostic_events.diagnostic_id=EXCLUDED.diagnostic_id
            AND (diagnostic_events.payload->>'outcome'='running' OR EXCLUDED.payload->>'outcome'<>'running')`,
        [event.id,batch.diagnosticId,event.at,event.kind === "fault",event.error?.fingerprint ?? null,event.source,event.requestId,event.taskId,JSON.stringify(event)]);
      }
      if (batch.task) await client.query(`INSERT INTO ${this.prefix}.diagnostic_tasks (diagnostic_id,task_id,state,updated_at) VALUES ($1,$2,$3,now())
        ON CONFLICT (diagnostic_id,task_id) DO UPDATE SET state=EXCLUDED.state,updated_at=now()
        WHERE diagnostic_tasks.state='active' OR EXCLUDED.state='failure'`, [batch.diagnosticId,batch.task.id,batch.task.state]);
      if (newFaults.length) await client.query(`DELETE FROM ${this.prefix}.diagnostic_events WHERE id IN (
        SELECT id FROM ${this.prefix}.diagnostic_events WHERE fault=true ORDER BY at DESC,id DESC OFFSET $1 LIMIT 500)`,[policy.maxRecords]);
      const trimmed = await client.query(`DELETE FROM ${this.prefix}.diagnostic_events WHERE id IN (
        SELECT id FROM ${this.prefix}.diagnostic_events WHERE diagnostic_id=$1 ORDER BY fault DESC,at DESC,id DESC OFFSET 256)`, [batch.diagnosticId]);
      if (trimmed.rowCount) await client.query(`UPDATE ${this.prefix}.diagnostic_operations SET truncated=true WHERE id=$1`, [batch.diagnosticId]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { clearTimeout(deadline); if (!destroyed) client.release(); }
  }
  async prune(policy: DiagnosticPolicy) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = '1500ms'");
      const lock = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_xact_lock(hashtext('anonresume:diagnostic-prune')) AS locked");
      if (!lock.rows[0]?.locked) { await client.query("ROLLBACK"); return; }
      await client.query(`DELETE FROM ${this.prefix}.diagnostic_operations WHERE id IN (
        SELECT id FROM ${this.prefix}.diagnostic_operations o WHERE expires_at<now()
          OR (NOT faulted AND EXISTS (SELECT 1 FROM ${this.prefix}.diagnostic_tasks t WHERE t.diagnostic_id=o.id)
            AND NOT EXISTS (SELECT 1 FROM ${this.prefix}.diagnostic_tasks t WHERE t.diagnostic_id=o.id AND state='active')
            AND NOT EXISTS (SELECT 1 FROM ${this.prefix}.diagnostic_tasks t WHERE t.diagnostic_id=o.id AND updated_at>now()-interval '1 minute'))
        LIMIT 500)`);
      await client.query(`DELETE FROM ${this.prefix}.diagnostic_events WHERE id IN (
        SELECT id FROM ${this.prefix}.diagnostic_events WHERE fault=true ORDER BY at DESC,id DESC OFFSET $1 LIMIT 500)`, [policy.maxRecords]);
      // Deleting an over-capacity occurrence must not leave unlimited phase-only fault records.
      await client.query(`DELETE FROM ${this.prefix}.diagnostic_operations WHERE id IN (
        SELECT id FROM ${this.prefix}.diagnostic_operations o WHERE faulted
          AND NOT EXISTS (SELECT 1 FROM ${this.prefix}.diagnostic_events e WHERE e.diagnostic_id=o.id AND fault=true) LIMIT 500)`);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { client.release(); }
  }
  async list(filter: DiagnosticFilter, policy: DiagnosticPolicy) {
    const days = Math.min(filter.days, policy.retentionDays);
    const result = await this.pool.query<{ diagnostic_id: string; payload: unknown; occurrences: string; first_seen: Date; last_seen: Date }>(`
      WITH visible AS (
        SELECT e.* FROM ${this.prefix}.diagnostic_events e JOIN ${this.prefix}.diagnostic_operations o ON o.id=e.diagnostic_id
        WHERE e.fault=true AND o.expires_at>now() AND e.at>now()-($1::int*interval '1 day')
          AND ($2::uuid IS NULL OR e.diagnostic_id=$2 OR EXISTS (SELECT 1 FROM ${this.prefix}.diagnostic_events r WHERE r.diagnostic_id=e.diagnostic_id AND (r.request_id=$2 OR r.task_id=$2)))
          AND ($3::text IS NULL OR e.source=$3) AND ($4::text IS NULL OR e.payload->'error'->>'category'=$4)
          AND ($5::text IS NULL OR e.payload->'identity'->>'role'=$5)
          AND ($6::text IS NULL OR e.payload->'identity'->>'instance'=$6)
          AND ($7::text IS NULL OR e.payload->'identity'->>'build'=$7)
      ), grouped AS (
        SELECT *, count(*) OVER w AS occurrences,min(at) OVER w AS first_seen,max(at) OVER w AS last_seen
        FROM visible WINDOW w AS (PARTITION BY fingerprint,source,payload->'identity'->>'build')
      ) SELECT diagnostic_id,payload,occurrences,first_seen,last_seen FROM grouped
      WHERE ($8::uuid IS NULL OR (at,id)<(SELECT at,id FROM ${this.prefix}.diagnostic_events WHERE id=$8))
      ORDER BY at DESC,id DESC LIMIT $9`,
    [days,filter.q || null,filter.source ?? null,filter.category ?? null,filter.role ?? null,filter.instance ?? null,filter.build ?? null,filter.cursor ?? null,filter.limit+1]);
    const items: DiagnosticListItem[] = result.rows.slice(0,filter.limit).map((row) => ({
      ...diagnosticEventSchema.parse(row.payload), diagnosticId: row.diagnostic_id,
      occurrences: Number(row.occurrences), firstSeen: row.first_seen.toISOString(), lastSeen: row.last_seen.toISOString(),
    }));
    return { items, nextCursor: result.rows.length>filter.limit ? items.at(-1)?.id ?? null : null };
  }
  async details(id: string, policy: DiagnosticPolicy): Promise<DiagnosticDetails | null> {
    const selected = await this.pool.query<{ diagnostic_id: string; payload: unknown; truncated: boolean }>(`
      SELECT e.diagnostic_id,e.payload,o.truncated FROM ${this.prefix}.diagnostic_events e JOIN ${this.prefix}.diagnostic_operations o ON o.id=e.diagnostic_id
      WHERE e.id=$1 AND e.fault=true AND o.expires_at>now() AND e.at>now()-($2::int*interval '1 day')`, [id,policy.retentionDays]);
    const row = selected.rows[0];
    if (!row) return null;
    const events = await this.pool.query<{ payload: unknown }>(`SELECT payload FROM ${this.prefix}.diagnostic_events WHERE diagnostic_id=$1 ORDER BY at,id LIMIT 256`, [row.diagnostic_id]);
    return { diagnosticId: row.diagnostic_id, fault: diagnosticEventSchema.parse(row.payload), events: events.rows.map((event) => diagnosticEventSchema.parse(event.payload)), truncated: row.truncated, completeness: "unknown" };
  }
  async saveLocations(event: DiagnosticDetails["fault"]) {
    if (!event.locations) return;
    await this.pool.query(`UPDATE ${this.prefix}.diagnostic_events SET payload=jsonb_set(payload,'{locations}',$2::jsonb)
      WHERE id=$1 AND fault=true AND (NOT (COALESCE(payload->'locations','[]'::jsonb) @> '[{"status":"mapped"}]'::jsonb)
        OR $2::jsonb @> '[{"status":"mapped"}]'::jsonb)`, [event.id, JSON.stringify(event.locations)]);
  }
}
