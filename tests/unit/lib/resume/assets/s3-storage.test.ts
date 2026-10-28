import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createS3ImageStorage } from "@/lib/resume/assets/s3-storage";

it("aborts an S3 response that stalls after its headers", async () => {
  let headersSent!: () => void;
  const started = new Promise<void>((resolve) => {
    headersSent = resolve;
  });
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      "Content-Type": "image/webp",
      "Content-Length": "100",
    });
    response.flushHeaders();
    response.write("partial");
    headersSent();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  vi.useFakeTimers();
  try {
    const storage = createS3ImageStorage(
      {
        endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        region: "us-east-1",
        bucket: "test-images",
        prefix: "",
        accessKeyId: "test-key",
        secretAccessKey: "test-secret",
      },
      { timeoutMs: 100 },
    );
    const outcome = storage.get(`${crypto.randomUUID()}/original.webp`).then(
      () => "completed",
      () => "aborted",
    );
    await started;
    await vi.advanceTimersByTimeAsync(100);
    expect(await outcome).toBe("aborted");
  } finally {
    vi.useRealTimers();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
