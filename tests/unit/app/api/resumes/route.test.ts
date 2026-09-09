import { getOptionalSession } from "@/lib/auth-session";
import {
  createResumeRecord,
  resetResumeRepository,
} from "@/lib/resume-repository";

import { GET } from "@/app/api/resumes/route";

vi.mock("@/lib/auth-session", () => ({
  getOptionalSession: vi.fn(),
}));

describe("resume catalog route", () => {
  beforeEach(async () => {
    await resetResumeRepository();
    vi.mocked(getOptionalSession).mockResolvedValue({
      session: { id: "session-demo", userId: "user-demo" },
      user: { id: "user-demo", name: "Demo", email: "demo@example.com" },
    } as never);
  });

  afterEach(async () => {
    await resetResumeRepository();
  });

  it("rejects unauthenticated catalog reads", async () => {
    vi.mocked(getOptionalSession).mockResolvedValueOnce(null);

    const response = await GET(new Request("http://localhost/api/resumes"));

    expect(response.status).toBe(401);
  });

  it("returns only the requested page for the signed-in user", async () => {
    for (let index = 0; index < 3; index += 1) {
      await createResumeRecord("user-demo", `resume-demo-${index}`);
    }
    await createResumeRecord("user-other", "resume-other");

    const response = await GET(
      new Request("http://localhost/api/resumes?page=2&pageSize=2"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toMatch(/^resume-demo-/);
  });

  it("clamps invalid pagination parameters", async () => {
    await createResumeRecord("user-demo", "resume-demo");

    const response = await GET(
      new Request("http://localhost/api/resumes?page=bad&pageSize=500"),
    );

    expect(await response.json()).toMatchObject({ page: 1, pageSize: 100 });
  });
});
