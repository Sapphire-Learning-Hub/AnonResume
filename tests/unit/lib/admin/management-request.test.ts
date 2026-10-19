describe("expired management session recovery", () => {
  beforeEach(() => { vi.resetModules(); window.history.replaceState(null,"","/app/manage/diagnostics"); });
  afterEach(() => vi.unstubAllGlobals());

  it("requests one authentication recovery for concurrent protected 401s, without replaying mutations", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch",async (url: string) => { requests.push(url); return new Response(null,{status:401}); });
    const { managementFetch, subscribeManagementExpiry } = await import("@/lib/admin/client/request");
    let recoveries=0;
    const unsubscribe=subscribeManagementExpiry(() => { recoveries++; });
    await Promise.all([
      managementFetch("/api/manage/diagnostics"),
      managementFetch("/api/manage/configuration",{method:"POST"}),
    ]);
    expect(recoveries).toBe(1);
    expect(requests).toHaveLength(2);
    unsubscribe();
  });

  it("does not treat forbidden, MFA freshness, or login challenges as an expired management session", async () => {
    let status=403;
    vi.stubGlobal("fetch",async () => new Response(null,{status}));
    const { managementFetch, subscribeManagementExpiry } = await import("@/lib/admin/client/request");
    let recoveries=0;
    const unsubscribe=subscribeManagementExpiry(() => { recoveries++; });
    await managementFetch("/api/manage/diagnostics");
    status=428;
    await managementFetch("/api/manage/configuration");
    status=401;
    await managementFetch("/api/manage/session",{method:"POST"});
    await managementFetch("/api/manage/activation/start",{method:"POST"});
    expect(recoveries).toBe(0);
    unsubscribe();
  });
});
