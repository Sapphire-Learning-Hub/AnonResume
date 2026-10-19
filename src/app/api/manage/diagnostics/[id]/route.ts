import { handleDiagnosticQuery } from "@/lib/observability/diagnostics/store/admin";
import { requireAdminApi } from "@/lib/admin/api";
import { withRequestLogging } from "@/lib/observability/http";

export const dynamic = "force-dynamic";
export const GET = withRequestLogging("/api/manage/diagnostics/[id]", async (request: Request, { params }: { params: Promise<{id:string}> }) => handleDiagnosticQuery(request,(await params).id,() => requireAdminApi({permission:"diagnostics.read"})));
