import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalImageStorage } from "@/lib/resume/assets/local-storage";

it("stores immutable private objects and refuses traversal", async () => {
  const dir = await mkdtemp(join(tmpdir(), "resume-images-"));
  try {
    const storage = createLocalImageStorage(dir);
    const key = `${crypto.randomUUID()}/original.webp`;
    await storage.put(key, Buffer.from("pixels"));
    expect(await storage.get(key)).toEqual(Buffer.from("pixels"));
    await expect(
      storage.put(key, Buffer.from("replacement")),
    ).rejects.toThrow();
    for (const key of [
      "../secret",
      "/etc/passwd",
      "x/../../secret",
      "abc/thumbnail.webp",
    ]) {
      await expect(storage.get(key)).rejects.toThrow();
      await expect(storage.put(key, Buffer.from("x"))).rejects.toThrow();
    }
    await storage.remove(key);
    await storage.remove(key);
    await expect(storage.get(key)).rejects.toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
