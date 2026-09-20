import { checkApplicationReadiness } from "@/lib/runtime/health";

describe("application readiness", () => {
  it("does not open the database when bootstrap trust roots are invalid", async () => {
    const checkDatabase = vi.fn();
    const loadRuntime = vi.fn();

    await expect(
      checkApplicationReadiness({
        validateBootstrap: () => ({
          valid: false,
          issues: ["database_url_missing"],
        }),
        checkDatabase,
        loadRuntime,
      }),
    ).resolves.toEqual({ ready: false, reason: "bootstrap_invalid" });
    expect(checkDatabase).not.toHaveBeenCalled();
    expect(loadRuntime).not.toHaveBeenCalled();
  });

  it("reports a readable core configuration as ready", async () => {
    await expect(
      checkApplicationReadiness({
        validateBootstrap: () => ({ valid: true, issues: [] }),
        checkDatabase: vi.fn().mockResolvedValue(undefined),
        loadRuntime: vi.fn().mockResolvedValue({ health: "healthy" }),
      }),
    ).resolves.toEqual({ ready: true });
  });

  it("keeps optional integration configuration out of the readiness contract", async () => {
    await expect(
      checkApplicationReadiness({
        validateBootstrap: () => ({ valid: true, issues: [] }),
        checkDatabase: vi.fn().mockResolvedValue(undefined),
        loadRuntime: vi.fn().mockResolvedValue({ health: "degraded" }),
      }),
    ).resolves.toEqual({ ready: true });
  });

  it("returns a generic unavailable reason when core state cannot be read", async () => {
    await expect(
      checkApplicationReadiness({
        validateBootstrap: () => ({ valid: true, issues: [] }),
        checkDatabase: vi.fn().mockResolvedValue(undefined),
        loadRuntime: vi.fn().mockRejectedValue(new Error("secret detail")),
      }),
    ).resolves.toEqual({ ready: false, reason: "core_unavailable" });
  });
});
