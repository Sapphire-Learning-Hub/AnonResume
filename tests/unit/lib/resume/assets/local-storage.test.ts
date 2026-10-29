import { chmod, link, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalImageStorage } from "@/lib/resume/assets/local-storage";
import { validateLocalImageDirectory } from "@/lib/resume/assets/local-directory";

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

it("refuses adopting a directory that contains unrelated files", async () => {
  const root = await mkdtemp(join(tmpdir(), "image-dedicated-"));
  try {
    await writeFile(join(root, "existing-document"), "keep me");
    await expect(validateLocalImageDirectory(root)).rejects.toThrow();
    expect(await readFile(join(root, "existing-document"), "utf8")).toBe("keep me");
    expect(() => createLocalImageStorage(join(process.cwd(), "src"))).toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("bounds local storage and refuses symlink substitution before every operation", async () => {
  const root = await mkdtemp(join(tmpdir(), "image-root-"));
  const outside = await mkdtemp(join(tmpdir(), "image-outside-"));
  const id = crypto.randomUUID();
  const key = `${id}/original.webp`;
  try {
    const storage = createLocalImageStorage(join(root, "photos"));
    await storage.put(key, Buffer.from("inside"));
    expect(await readFile(join(root, "photos", key))).toEqual(Buffer.from("inside"));
    await mkdir(join(outside, id), { mode: 0o700 });
    await writeFile(join(outside, key), "outside");
    await rm(join(root, "photos", id), { recursive: true });
    await symlink(join(outside, id), join(root, "photos", id));
    await expect(storage.get(key)).rejects.toThrow();
    await expect(storage.put(key, Buffer.from("overwrite"))).rejects.toThrow();
    await expect(storage.remove(key)).rejects.toThrow();
    expect(await readFile(join(outside, key), "utf8")).toBe("outside");
    for (const path of ["../outside", "a\\b"])
      expect(() => createLocalImageStorage(path)).toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

it("refuses public roots, unsafe writable roots and symlink files", async () => {
  const root = await mkdtemp(join(tmpdir(), "image-private-"));
  const id = crypto.randomUUID();
  const key = `${id}/original.webp`;
  try {
    expect(() => createLocalImageStorage(join(process.cwd(), "public", "uploads"))).toThrow();
    await chmod(root, 0o777);
    await expect(createLocalImageStorage(root).put(key, Buffer.from("x"))).rejects.toThrow();
    await chmod(root, 0o700);
    await mkdir(join(root, id), { mode: 0o700 });
    await writeFile(join(root, "secret"), "private");
    await symlink(join(root, "secret"), join(root, key));
    await expect(createLocalImageStorage(root).get(key)).rejects.toThrow();
    await expect(createLocalImageStorage(root).remove(key)).rejects.toThrow();
    expect(await readFile(join(root, "secret"), "utf8")).toBe("private");
    await symlink(join(process.cwd(), "public"), join(root, "public-alias"));
    await expect(createLocalImageStorage(join(root, "public-alias")).put(key, Buffer.from("x"))).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("rejects hard-linked reads but can clean an interrupted atomic publication", async () => {
  const root = await mkdtemp(join(tmpdir(), "image-link-"));
  const id = crypto.randomUUID();
  const key = `${id}/original.webp`;
  try {
    const storage = createLocalImageStorage(root);
    await storage.put(key, Buffer.from("pixels"));
    await link(join(root, key), join(root, `${key}.${crypto.randomUUID()}.tmp`));
    await expect(storage.get(key)).rejects.toThrow();
    await storage.remove(key);
    await expect(readFile(join(root, key))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("fails closed when its root disappears or is replaced at the same path", async () => {
  const root = await mkdtemp(join(tmpdir(), "image-mount-"));
  const moved = `${root}-displaced`;
  const key = `${crypto.randomUUID()}/original.webp`;
  try {
    const storage = createLocalImageStorage(root);
    await storage.put(key, Buffer.from("original"));
    await rename(root, moved);
    await expect(storage.remove(key)).rejects.toThrow();
    await mkdir(root, { mode: 0o700 });
    await expect(storage.put(key, Buffer.from("replacement"))).rejects.toThrow();
    expect(await readFile(join(moved, key), "utf8")).toBe("original");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(moved, { recursive: true, force: true });
  }
});
