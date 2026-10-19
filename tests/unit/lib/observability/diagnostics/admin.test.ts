import { AdminPermissionError } from "@/lib/admin/authorization";
const auth = vi.hoisted(() => ({ require: vi.fn() }));
vi.mock("@/lib/admin/api", () => ({ requireAdminApi: auth.require, adminApiErrorResponse: (error: unknown) => error instanceof AdminPermissionError ? Response.json({ error: "forbidden" }, { status: 403 }) : null }));
import { handleDiagnosticQuery } from "@/lib/observability/diagnostics/store/admin";

describe("management diagnostics authorization", () => {
  it("denies direct list and detail reads before accessing diagnostics", async () => {
    auth.require.mockRejectedValue(new AdminPermissionError("diagnostics.read"));
    expect((await handleDiagnosticQuery(new Request("https://example.com/api/manage/diagnostics"))).status).toBe(403);
    expect((await handleDiagnosticQuery(new Request("https://example.com/api/manage/diagnostics/x"), crypto.randomUUID())).status).toBe(403);
  });
});
