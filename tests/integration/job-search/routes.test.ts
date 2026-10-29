import { randomUUID } from "node:crypto";
import { GET, POST, PATCH } from "@/app/api/job-search/[...path]/route";
import { getOptionalSession, type AppSession } from "@/lib/auth/session";
import { createOpportunity } from "@/lib/job-search/opportunities";
import {
  db,
  jobOpportunities,
  jobApplications,
  jobSearchOperations,
} from "@/db";
import { eq } from "drizzle-orm";
import { getDatabasePool } from "@/lib/runtime/database";
vi.mock("@/lib/auth/session", () => ({ getOptionalSession: vi.fn() }));
const userId = `job-route-${randomUUID()}`;
function session(id: string): AppSession {
  const now = new Date();
  return {
    user: {
      id,
      name: "Test",
      email: `${id}@example.test`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
      image: null,
    },
    session: {
      id: randomUUID(),
      token: "test-session",
      userId: id,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + 60000),
      ipAddress: null,
      userAgent: null,
    },
  };
}
const context = (...path: string[]) => ({ params: Promise.resolve({ path }) });
it("authenticates all routes, rejects cross-origin mutations and prevents guessed IDs or injected ownership", async () => {
  await getDatabasePool().query(
    'INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES ($1,\'Job route\',$2,true,now(),now())',
    [userId, `${userId}@example.test`],
  );
  try {
    vi.mocked(getOptionalSession).mockResolvedValue(null);
    expect(
      (
        await GET(
          new Request("http://localhost/api/job-search/board"),
          context("board"),
        )
      ).status,
    ).toBe(401);
    vi.mocked(getOptionalSession).mockResolvedValue(session(userId));
    const saved = await createOpportunity(userId, {
      operationId: randomUUID(),
      title: "Private role",
      description: "Private JD",
    });
    const denied = await POST(
      new Request("http://localhost/api/job-search/opportunities", {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "content-type": "application/json",
        },
        body: "{}",
      }),
      context("opportunities"),
    );
    expect(denied.status).toBe(403);
    const injected = await POST(
      new Request("http://localhost/api/job-search/opportunities", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          operationId: randomUUID(),
          title: "Role",
          userId: "victim",
        }),
      }),
      context("opportunities"),
    );
    expect(injected.status).toBe(400);
    const response = await GET(
      new Request("http://localhost/api/job-search/board"),
      context("board"),
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).not.toContain("descriptionHash");
    vi.mocked(getOptionalSession).mockResolvedValue(session(randomUUID()));
    const foreign = await GET(
      new Request(
        `http://localhost/api/job-search/opportunities/${saved.opportunity.id}`,
      ),
      context("opportunities", saved.opportunity.id),
    );
    expect(foreign.status).toBe(404);
    expect(await foreign.text()).not.toContain("Private JD");
    expect(
      (
        await PATCH(
          new Request(
            `http://localhost/api/job-search/applications/${saved.applicationId}`,
            {
              method: "PATCH",
              headers: {
                origin: "http://localhost",
                "content-type": "application/json",
              },
              body: JSON.stringify({
                operationId: randomUUID(),
                version: 1,
                notes: "attack",
              }),
            },
          ),
          context("applications", saved.applicationId!),
        )
      ).status,
    ).toBe(403);
  } finally {
    await db.delete(jobApplications).where(eq(jobApplications.userId, userId));
    await db
      .delete(jobSearchOperations)
      .where(eq(jobSearchOperations.userId, userId));
    await db
      .delete(jobOpportunities)
      .where(eq(jobOpportunities.userId, userId));
    await getDatabasePool().query('DELETE FROM "user" WHERE id=$1', [userId]);
  }
});
