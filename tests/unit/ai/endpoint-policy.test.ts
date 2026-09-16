import { assertSafeAiEndpoint } from "@/lib/ai/security/endpoint-policy";

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
});
