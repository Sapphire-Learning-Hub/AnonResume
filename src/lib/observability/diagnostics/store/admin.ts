import { requireAdminApi, adminApiErrorResponse } from "@/lib/admin/api";
import { writeAdminAuditEvent } from "@/lib/admin/audit";
import { getRuntimeConfig } from "@/lib/config/runtime";
import { getDatabasePool } from "@/lib/runtime/database";
import { getDatabaseSchemaName } from "@/db/schema";
import { diagnosticFilterSchema } from "./schema";
import { DiagnosticRepository } from "./repository";
import { configureDiagnosticStore, diagnosticStorePolicy, diagnosticStoreHealth, suppressDiagnosticCollection } from "./runtime";
import { z } from "zod";
import { getLogger, serializeSafeError } from "@/lib/observability/logging";
import { diagnosticSymbolicator } from "@/lib/observability/diagnostics/sourcemaps/symbolicator";

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

export async function handleDiagnosticQuery(request: Request, id?: string, authorize = () => requireAdminApi({ permission: "diagnostics.read" })) {
  suppressDiagnosticCollection();
  try {
    const context = await authorize();
    const filter = diagnosticFilterSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!filter.success || (id !== undefined && !z.string().uuid().safeParse(id).success)) return json({ error: "invalid_request" },400);
    const values = (await getRuntimeConfig("web")).values;
    configureDiagnosticStore(values,"web");
    const policy = diagnosticStorePolicy(values);
    const repository = new DiagnosticRepository(getDatabasePool(),getDatabaseSchemaName());
    if (id) {
      const result = await repository.details(id,policy);
      if (!result) return json({ error: "not_found" },404);
      const fault = await diagnosticSymbolicator().enrich(result.fault);
      if (JSON.stringify(fault.locations) !== JSON.stringify(result.fault.locations)) await repository.saveLocations(fault).catch(() => undefined);
      result.fault = fault;
      await writeAdminAuditEvent({ actorUserId: context.userId, action: "diagnostics.read", targetType: "diagnostic", targetId: id, outcome: "success" });
      return json(result);
    }
    return json({ ...await repository.list(filter.data,policy), enabled: policy.enabled, retentionDays: policy.retentionDays, localHealth: diagnosticStoreHealth() });
  } catch (error) {
    const response = adminApiErrorResponse(error);
    if (response) return response;
    getLogger("anonresume.diagnostics.store").warn("diagnostic_query_failed",{error:serializeSafeError(error),outcome:"failure"});
    return json({ error: "diagnostics_unavailable" },503);
  }
}
