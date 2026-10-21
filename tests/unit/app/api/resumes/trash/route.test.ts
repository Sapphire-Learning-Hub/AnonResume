import { getOptionalSession } from "@/lib/auth/session";
import {
  createResumeRecord,
  deleteResumeRecord,
  getResumeRecord,
  resetResumeRepository,
} from "@/lib/resume/repository";
import { GET } from "@/app/api/resumes/trash/route";
import { POST as restore } from "@/app/api/resumes/[id]/restore/route";
import { POST as purge } from "@/app/api/resumes/[id]/purge/route";
import { restoreTrashedResumeClient } from "@/lib/resume/trash/client";

vi.mock("@/lib/auth/session", () => ({ getOptionalSession: vi.fn() }));
const context = { params: Promise.resolve({ id: "trash-test" }) };
const request = (action: string, origin = "http://localhost") =>
  new Request(`http://localhost/api/resumes/trash-test/${action}`, {
    method: "POST",
    headers: { origin },
  });

describe("resume trash routes", () => {
  beforeEach(async () => {
    await resetResumeRepository();
    await createResumeRecord("owner", "trash-test");
    await deleteResumeRecord("owner", "trash-test");
    vi.mocked(getOptionalSession).mockResolvedValue({
      user: { id: "owner" },
      session: { id: "test", userId: "owner" },
    } as never);
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await resetResumeRepository();
  });

  it("restores through the browser client's real HTTP payload boundary", async () => {
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) =>
      restore(
        new Request(new URL(url, "http://localhost"), {
          ...init,
          headers: {
            ...Object.fromEntries(new Headers(init?.headers)),
            origin: "http://localhost",
          },
          // Next exposes a body stream for POST even when the payload is empty.
          body: init?.body ?? "",
        }),
        context,
      ),
    );
    await restoreTrashedResumeClient("trash-test");
    expect(await getResumeRecord("owner", "trash-test")).toMatchObject({
      published: false,
    });
  });

  it("lists only owner metadata, restores unpublished and refuses active-record purge", async () => {
    const listed = await GET(new Request("http://localhost/api/resumes/trash"));
    const payload = await listed.json();
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).not.toHaveProperty("document");
    expect((await restore(request("restore"), context)).status).toBe(200);
    expect(await getResumeRecord("owner", "trash-test")).toMatchObject({
      published: false,
    });
    expect((await purge(request("purge"), context)).status).toBe(404);
    await deleteResumeRecord("owner", "trash-test");
    expect((await purge(request("purge"), context)).status).toBe(204);
  });

  it("does not reveal or mutate another user's trash and enforces session and same-origin", async () => {
    vi.mocked(getOptionalSession).mockResolvedValue({
      user: { id: "other" },
      session: { id: "other", userId: "other" },
    } as never);
    expect(
      (
        await (
          await GET(new Request("http://localhost/api/resumes/trash"))
        ).json()
      ).items,
    ).toEqual([]);
    expect((await restore(request("restore"), context)).status).toBe(404);
    expect(
      (await purge(request("purge", "https://evil.invalid"), context)).status,
    ).toBe(403);
    vi.mocked(getOptionalSession).mockResolvedValue(null);
    expect(
      (await GET(new Request("http://localhost/api/resumes/trash"))).status,
    ).toBe(401);
    expect((await restore(request("restore"), context)).status).toBe(401);
  });
});
