import { imageRoute } from "@/lib/resume/assets/http";
import { ImageAssetError } from "@/lib/resume/assets/errors";

let authenticated = false;
vi.mock("@/lib/auth/session", () => ({
  getOptionalSession: async () =>
    authenticated ? { user: { id: "owner" } } : null,
}));
beforeEach(() => {
  authenticated = false;
});
it("rejects unauthenticated and cross-origin mutations before touching image data", async () => {
  const handler = vi.fn(async () => new Response("ok"));
  const route = imageRoute(handler);
  expect(
    (await route(new Request("http://localhost:3000/api/resume-assets")))
      .status,
  ).toBe(401);
  authenticated = true;
  expect(
    (
      await route(
        new Request("http://localhost:3000/api/resume-assets", {
          method: "POST",
          headers: { origin: "https://other.test" },
        }),
      )
    ).status,
  ).toBe(403);
  expect(handler).not.toHaveBeenCalled();
});
it("returns deliberate localized error codes without exposing exceptions or caching private results", async () => {
  authenticated = true;
  const route = imageRoute(async () => {
    throw new ImageAssetError("image_storage_unavailable");
  });
  const response = await route(
    new Request("http://localhost:3000/api/resume-assets"),
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "image_storage_unavailable" });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
