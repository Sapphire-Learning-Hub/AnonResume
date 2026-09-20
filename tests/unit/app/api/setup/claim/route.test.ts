import {
  db,
  instanceSetupClaimLimits,
  instanceSetupSessions,
  instanceSetupState,
  instanceSetupTokens,
} from "@/db";
import { POST as claimRoute } from "@/app/api/setup/claim/route";
import { GET as statusRoute } from "@/app/api/setup/status/route";
import { initializePendingInstanceSetup } from "@/lib/admin/setup/startup";

describe("setup claim routes", () => {
  beforeEach(async () => {
    await db.delete(instanceSetupClaimLimits);
    await db.delete(instanceSetupSessions);
    await db.delete(instanceSetupTokens);
    await db.delete(instanceSetupState);
    await db.insert(instanceSetupState).values({
      slot: 1,
      state: "pending_initialization",
    });
  });

  it("returns non-cacheable public setup status", async () => {
    const response = await statusRoute();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      required: true,
      mode: "initialization",
    });
  });

  it("rejects invalid codes without exposing their cause", async () => {
    const response = await claimRoute(claimRequest("invalid", "client-1"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "setup_code_invalid",
    });
  });

  it("sets a strict HttpOnly setup cookie after a valid claim", async () => {
    const issued = await initializePendingInstanceSetup({
      identity: { stableId: "production/web/web-1" },
    });
    if (!issued.generated) throw new Error("setup code was not generated");

    const response = await claimRoute(claimRequest(issued.rawCode, "client-1"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toEqual(
      expect.stringMatching(
        /^anonresume\.setup=.+; Path=\/; Expires=.+; Max-Age=1800; HttpOnly; SameSite=strict$/,
      ),
    );
    await expect(response.json()).resolves.toMatchObject({
      mode: "initialization",
      expiresAt: expect.any(String),
    });
  });

  it("returns 429 after five invalid attempts from one source", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(
        (await claimRoute(claimRequest("invalid", "limited-client"))).status,
      ).toBe(400);
    }

    const response = await claimRoute(
      claimRequest("invalid", "limited-client"),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
  });

  it("rejects cross-origin claims", async () => {
    const request = claimRequest("invalid", "client-1");
    request.headers.set("origin", "https://attacker.example");

    const response = await claimRoute(request);

    expect(response.status).toBe(403);
  });
});

function claimRequest(code: string, source: string) {
  return new Request("http://localhost/api/setup/claim", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      "x-real-ip": source,
    },
    body: JSON.stringify({ code }),
  });
}
