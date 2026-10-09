import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { accountSocialLinkAttempts, db } from "@/db";
import {
  createSocialLinkResultProof,
  SOCIAL_LINK_ATTEMPT_COOKIE,
  SOCIAL_LINK_RESULT_PROOF_COOKIE,
} from "@/lib/auth/account/merge/link-attempts";
import { getDatabasePool } from "@/lib/runtime/database";

const sessionMocks = vi.hoisted(() => ({ getOptionalSession: vi.fn() }));

vi.mock("@/lib/auth/session", () => sessionMocks);
vi.mock("@/lib/http/request-origin", () => ({
  requireSameOrigin: () => null,
}));

import { POST as createAttempt } from "@/app/api/account/social-link/attempt/route";
import { GET as resolveAttempt } from "@/app/api/account/social-link/result/route";

const collisionCode = "account_already_linked_to_different_user";

function request(
  url: string,
  options: { method?: string; body?: unknown; cookies?: Record<string, string> } = {},
) {
  const cookie = Object.entries(options.cookies ?? {})
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  return new NextRequest(url, {
    method: options.method,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

describe("social account link attempt routes", () => {
  const createdUsers: string[] = [];
  const createdAccounts: string[] = [];

  async function createUser(label: string) {
    const id = `${label}-${randomUUID()}`;
    createdUsers.push(id);
    await getDatabasePool().query(
      `INSERT INTO "user"
        (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, now(), now())`,
      [id, label, `${id}@example.com`],
    );
    return id;
  }

  async function bindGitHub(userId: string, accountId: string) {
    const id = randomUUID();
    createdAccounts.push(id);
    await getDatabasePool().query(
      `INSERT INTO "account"
        (id, "accountId", "providerId", "userId", "createdAt", "updatedAt", issuer)
       VALUES ($1, $2, 'github', $3, now(), now(), 'github')`,
      [id, accountId, userId],
    );
  }

  async function start(userId: string, sessionToken = `session-${randomUUID()}`) {
    sessionMocks.getOptionalSession.mockResolvedValue({
      user: { id: userId, email: `${userId}@example.com`, name: "User" },
      session: { id: randomUUID(), token: sessionToken },
    });
    const response = await createAttempt(request(
      "https://resume.example.com/api/account/social-link/attempt",
      { method: "POST", body: { provider: "github" } },
    ));
    const rawToken = response.cookies.get(SOCIAL_LINK_ATTEMPT_COOKIE)?.value;
    expect(response.status).toBe(200);
    expect(rawToken).toBeTruthy();
    return { response, rawToken: rawToken!, sessionToken };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await db.delete(accountSocialLinkAttempts);
    if (createdAccounts.length) {
      await getDatabasePool().query(
        `DELETE FROM "account" WHERE id = ANY($1::text[])`,
        [createdAccounts.splice(0)],
      );
    }
    if (createdUsers.length) {
      await getDatabasePool().query(
        `DELETE FROM "user" WHERE id = ANY($1::text[])`,
        [createdUsers.splice(0)],
      );
    }
  });

  it("creates a short-lived HttpOnly attempt without storing the raw token", async () => {
    const userId = await createUser("link-initiator");
    const { response, rawToken } = await start(userId);
    const rows = await db.select().from(accountSocialLinkAttempts);

    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(response.headers.get("set-cookie")).toContain("Path=/api");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      initiatingUserId: userId,
      providerId: "github",
      providerAccountId: null,
      state: "started",
    });
    expect(rows[0]!.tokenHash).not.toBe(rawToken);
    expect(await response.json()).toEqual({
      callbackURL: "/api/account/social-link/result?provider=github&outcome=success",
      errorCallbackURL: "/api/account/social-link/result?provider=github&outcome=error",
    });
  });

  it("rejects a forged collision URL without an auth-callback proof", async () => {
    const currentUserId = await createUser("link-current");
    const targetUserId = await createUser("link-target");
    await bindGitHub(targetUserId, "github-42");
    const { rawToken } = await start(currentUserId);

    const response = await resolveAttempt(request(
      `https://resume.example.com/api/account/social-link/result?provider=github&outcome=error&error=${collisionCode}`,
      { cookies: { [SOCIAL_LINK_ATTEMPT_COOKIE]: rawToken } },
    ));

    expect(response.headers.get("location")).toContain("linkError=github");
    expect(response.cookies.get("anonresume_account_merge_intent")).toBeUndefined();
  });

  it("promotes only a captured, proven collision and rejects replay", async () => {
    const currentUserId = await createUser("link-current");
    const targetUserId = await createUser("link-target");
    await bindGitHub(targetUserId, "github-42");
    const { rawToken } = await start(currentUserId);
    const { captureSocialLinkProviderSubject } = await import(
      "@/lib/auth/account/merge/link-attempts"
    );
    await expect(captureSocialLinkProviderSubject({
      providerId: "github",
      providerAccountId: "github-42",
      rawToken,
    })).resolves.toBe(true);
    const proof = createSocialLinkResultProof(rawToken, collisionCode);
    const collisionRequest = () => request(
      `https://resume.example.com/api/account/social-link/result?provider=github&outcome=error&error=${collisionCode}`,
      { cookies: {
        [SOCIAL_LINK_ATTEMPT_COOKIE]: rawToken,
        [SOCIAL_LINK_RESULT_PROOF_COOKIE]: proof,
      } },
    );

    const response = await resolveAttempt(collisionRequest());
    expect(response.headers.get("location")).toContain("merge=github");
    expect(response.cookies.get("anonresume_account_merge_intent")?.value)
      .toBeTruthy();

    const replay = await resolveAttempt(collisionRequest());
    expect(replay.headers.get("location")).toContain("linkError=github");
    expect(replay.cookies.get("anonresume_account_merge_intent")).toBeUndefined();
  });

  it("rejects an attempt from a different current session", async () => {
    const currentUserId = await createUser("link-current");
    const targetUserId = await createUser("link-target");
    await bindGitHub(targetUserId, "github-42");
    const { rawToken } = await start(currentUserId, "original-session");
    const { captureSocialLinkProviderSubject } = await import(
      "@/lib/auth/account/merge/link-attempts"
    );
    await captureSocialLinkProviderSubject({
      providerId: "github",
      providerAccountId: "github-42",
      rawToken,
    });
    sessionMocks.getOptionalSession.mockResolvedValue({
      user: { id: currentUserId },
      session: { token: "different-session" },
    });

    const response = await resolveAttempt(request(
      `https://resume.example.com/api/account/social-link/result?provider=github&outcome=error&error=${collisionCode}`,
      { cookies: {
        [SOCIAL_LINK_ATTEMPT_COOKIE]: rawToken,
        [SOCIAL_LINK_RESULT_PROOF_COOKIE]: createSocialLinkResultProof(
          rawToken,
          collisionCode,
        ),
      } },
    ));

    expect(response.headers.get("location")).toContain("linkError=github");
  });

  it("rejects an expired attempt", async () => {
    const currentUserId = await createUser("link-current");
    const targetUserId = await createUser("link-target");
    await bindGitHub(targetUserId, "github-42");
    const { rawToken } = await start(currentUserId);
    await db.update(accountSocialLinkAttempts).set({
      providerAccountId: "github-42",
      state: "captured",
      expiresAt: new Date(0),
    }).where(eq(accountSocialLinkAttempts.initiatingUserId, currentUserId));

    const response = await resolveAttempt(request(
      `https://resume.example.com/api/account/social-link/result?provider=github&outcome=error&error=${collisionCode}`,
      { cookies: {
        [SOCIAL_LINK_ATTEMPT_COOKIE]: rawToken,
        [SOCIAL_LINK_RESULT_PROOF_COOKIE]: createSocialLinkResultProof(
          rawToken,
          collisionCode,
        ),
      } },
    ));

    expect(response.headers.get("location")).toContain("linkError=github");
  });
});
