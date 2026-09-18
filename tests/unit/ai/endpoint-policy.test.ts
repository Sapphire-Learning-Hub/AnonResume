import {
  assertSafeAiEndpoint,
  resolveSafeAiEndpoint,
} from "@/lib/ai/security/endpoint-policy";

describe("AI endpoint policy", () => {
  it("accepts HTTPS hosts only when every resolved address is public", async () => {
    const endpoint = await assertSafeAiEndpoint(
      "https://models.example.com/v1/",
      async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
      ],
    );

    expect(endpoint.href).toBe("https://models.example.com/v1/");
  });

  it("returns the validated addresses so the transport can pin the connection", async () => {
    const resolved = await resolveSafeAiEndpoint(
      "https://models.example.com/v1/",
      async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
      ],
    );

    expect(resolved.endpoint.href).toBe("https://models.example.com/v1/");
    expect(resolved.addresses).toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
  });

  it.each([
    "http://models.example.com/v1",
    "https://user:secret@models.example.com/v1",
    "https://127.0.0.1/v1",
    "https://10.0.0.8/v1",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/v1",
    "https://[fc00::1]/v1",
    "https://metadata.google.internal/v1",
  ])("rejects unsafe endpoint %s", async (value) => {
    await expect(
      assertSafeAiEndpoint(value, async () => [
        { address: "93.184.216.34", family: 4 },
      ]),
    ).rejects.toThrow("unsafe_ai_endpoint");
  });

  it("rejects a hostname when any DNS result is private", async () => {
    await expect(
      assertSafeAiEndpoint("https://models.example.com/v1", async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "192.168.1.10", family: 4 },
      ]),
    ).rejects.toThrow("unsafe_ai_endpoint");
  });

  it("allows proxy fake IPs only for explicitly trusted hostnames", async () => {
    const fakeIpResolver = async () => [
      { address: "198.18.3.253", family: 4 },
    ];

    await expect(
      assertSafeAiEndpoint(
        "https://ark.cn-beijing.volces.com/api/v3",
        fakeIpResolver,
      ),
    ).rejects.toThrow("unsafe_ai_endpoint");
    await expect(
      assertSafeAiEndpoint(
        "https://ark.cn-beijing.volces.com/api/v3",
        fakeIpResolver,
        new Set(["ark.cn-beijing.volces.com"]),
      ),
    ).resolves.toHaveProperty(
      "href",
      "https://ark.cn-beijing.volces.com/api/v3",
    );
    await expect(
      assertSafeAiEndpoint(
        "https://untrusted.example.com/v1",
        fakeIpResolver,
        new Set(["ark.cn-beijing.volces.com"]),
      ),
    ).rejects.toThrow("unsafe_ai_endpoint");
  });
});
