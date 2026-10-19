import { randomUUID } from "node:crypto";
import { getOptionalSession, type AppSession } from "@/lib/auth/session";
import { prepareResumeReviewRun } from "@/lib/ai/review/service";
import { GET as listReviews, POST as createReview } from "@/app/api/ai/reviews/route";
import { GET as getReview, DELETE as deleteReview } from "@/app/api/ai/reviews/[id]/route";
import { createReviewFixture } from "../../../support/ai-review";

vi.mock("@/lib/auth/session", () => ({ getOptionalSession: vi.fn() }));

function session(userId: string): AppSession {
  const now = new Date();
  return {
    user: { id: userId, name: "Review user", email: `${userId}@example.com`, emailVerified: true, createdAt: now, updatedAt: now, image: null },
    session: { id: randomUUID(), token: "fixture-session", userId, createdAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + 60000), ipAddress: null, userAgent: null },
  };
}

it("authenticates report routes and rejects cross-user reads and mutations", async () => {
  const fixture = await createReviewFixture();
  try {
    const prepared = await prepareResumeReviewRun({ userId: fixture.userId, resumeId: fixture.resumeId, input: fixture.input, configuration: fixture.configuration });
    const context = { params: Promise.resolve({ id: prepared.reviewId }) };
    vi.mocked(getOptionalSession).mockResolvedValue(null);
    expect((await listReviews(new Request(`http://localhost/api/ai/reviews?resumeId=${fixture.resumeId}`))).status).toBe(401);
    vi.mocked(getOptionalSession).mockResolvedValue(session(randomUUID()));
    expect((await getReview(new Request(`http://localhost/api/ai/reviews/${prepared.reviewId}`), context)).status).toBe(404);
    expect((await deleteReview(new Request(`http://localhost/api/ai/reviews/${prepared.reviewId}`, { method: "DELETE", headers: { origin: "http://localhost" } }), context)).status).toBe(404);
    vi.mocked(getOptionalSession).mockResolvedValue(session(fixture.userId));
    const response = await getReview(new Request(`http://localhost/api/ai/reviews/${prepared.reviewId}`), context);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("sk-fixture");
    expect(text).not.toContain("encryptedExecutionPayload");
    expect((await createReview(new Request("http://localhost/api/ai/reviews", { method: "POST", headers: { origin: "http://evil.example", "content-type": "application/json" }, body: JSON.stringify({ resumeId: fixture.resumeId, ...fixture.input }) }))).status).toBe(403);
  } finally { await fixture.cleanup(); }
});
