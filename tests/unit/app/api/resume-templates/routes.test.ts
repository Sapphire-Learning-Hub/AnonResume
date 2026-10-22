import { GET, POST } from "@/app/api/resume-templates/route";
import { PATCH, DELETE } from "@/app/api/resume-templates/[id]/route";
import { getOptionalSession } from "@/lib/auth/session";
import { savePersonalTemplate } from "@/lib/resume/templates/service";

vi.mock("@/lib/auth/session", () => ({ getOptionalSession: vi.fn() }));
vi.mock("@/lib/observability/http", () => ({
  withRequestLogging: (_path: string, handler: unknown) => handler,
}));
vi.mock("@/lib/resume/templates/service", () => ({
  savePersonalTemplate: vi.fn(),
  renamePersonalTemplate: vi.fn(),
  deletePersonalTemplate: vi.fn(),
  listPersonalTemplates: vi.fn(async () => ({ items: [], nextCursor: null })),
}));
const context = { params: Promise.resolve({ id: "private-template" }) };
const origin = "http://localhost:3000";
function request(body: unknown, method = "POST") {
  return new Request(`${origin}/api/resume-templates`, {
    method,
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getOptionalSession).mockResolvedValue({
    user: { id: "owner" },
  } as Awaited<ReturnType<typeof getOptionalSession>>);
});

it("returns JSON 401 instead of a redirect for expired sessions", async () => {
  vi.mocked(getOptionalSession).mockResolvedValue(null);
  expect(
    (await GET(new Request(`${origin}/api/resume-templates`))).status,
  ).toBe(401);
  expect((await POST(request({}))).status).toBe(401);
});
it("does not accept owner injection, invalid versions, oversized bodies or cross-origin writes", async () => {
  expect((await POST(request({ userId: "other" }))).status).toBe(400);
  expect(
    (await PATCH(request({ version: 0, name: "x" }, "PATCH"), context)).status,
  ).toBe(400);
  expect(
    (await DELETE(request({ version: 1, userId: "other" }, "DELETE"), context))
      .status,
  ).toBe(400);
  expect((await POST(request({ name: "x".repeat(66_000) }))).status).toBe(413);
  expect(
    (
      await POST(
        new Request(`${origin}/api/resume-templates`, {
          method: "POST",
          headers: { origin: "https://other.example" },
          body: "{}",
        }),
      )
    ).status,
  ).toBe(403);
  expect(savePersonalTemplate).not.toHaveBeenCalled();
});
it("never exposes documents in the list and marks the response private", async () => {
  const response = await GET(new Request(`${origin}/api/resume-templates`));
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ items: [], nextCursor: null });
});
