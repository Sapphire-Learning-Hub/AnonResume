import { imageConfigFields } from "@/lib/config/images";

// Runtime-only filesystem access: static tracing must not interpret administrator paths as build assets.
export const imageFileSystem = process.getBuiltinModule("fs");
const { join, relative, resolve } = process.getBuiltinModule("path");
const { constants } = imageFileSystem;

export class ImageDirectoryError extends Error {
  constructor() { super("image_directory_unavailable"); }
}

const rootIdentities = new Map<string, string>();

function within(parent: string, child: string) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith("/"));
}

function assertPrivateLocation(path: string) {
  const cwd = process.cwd();
  if (within(path, cwd) || ["public", ".next", ".git", "node_modules", "src", "scripts", "drizzle", "docs", ".agents", ".github"].some((name) => within(join(cwd, name), path)))
    throw new ImageDirectoryError();
}

export function localImageDirectory(directory: string) {
  const base = resolve(imageConfigFields.imageLocalDirectory.parse(directory));
  assertPrivateLocation(base);
  return base;
}

async function privateDirectory(path: string, create: boolean) {
  const { lstat, mkdir, realpath } = imageFileSystem.promises;
  assertPrivateLocation(path);
  try {
    const existing = await lstat(path);
    if (existing.isSymbolicLink()) throw new ImageDirectoryError();
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    if (!create) throw error;
    // Only directories are created here; no pixel or probe is written until
    // canonical location and ownership have been verified.
    await mkdir(path, { recursive: true, mode: 0o700 });
  }
  assertPrivateLocation(await realpath(path));
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o022) !== 0 ||
      (typeof process.getuid === "function" && info.uid !== process.getuid()))
    throw new ImageDirectoryError();
}

/** Rechecked on every I/O. The private root must not be writable by other OS users. */
export async function ensureLocalImageDirectory(directory: string, objectId?: string, create = false) {
  const base = localImageDirectory(directory);
  if (objectId && !/^[0-9a-f-]{36}$/.test(objectId)) throw new ImageDirectoryError();
  const target = objectId ? join(base, objectId) : base;
  await privateDirectory(base, create);
  const { lstat } = imageFileSystem.promises;
  const rootInfo = await lstat(base);
  const identity = `${rootInfo.dev}:${rootInfo.ino}`;
  const bound = rootIdentities.get(base);
  if (bound && bound !== identity) throw new ImageDirectoryError();
  rootIdentities.set(base, identity);
  let current = base;
  for (const part of relative(base, target).split("/").filter(Boolean)) {
    current = join(current, part);
    // Check before mkdir so a symlink cannot be followed into another directory.
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new ImageDirectoryError();
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    }
    await privateDirectory(current, create);
  }
  return target;
}

export async function validateLocalImageDirectory(directory: string) {
  const { access, open, unlink, readdir } = imageFileSystem.promises;
  try {
    const target = await ensureLocalImageDirectory(directory, undefined, true);
    // A newly selected location must be dedicated and empty; never adopt unrelated files.
    if ((await readdir(target)).length) throw new ImageDirectoryError();
    await access(target, constants.R_OK | constants.W_OK | constants.X_OK);
    const probe = join(target, `.probe-${crypto.randomUUID()}`);
    const handle = await open(probe, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile("image-storage-check"); }
    finally { await handle.close(); await unlink(probe); }
  } catch { throw new ImageDirectoryError(); }
}
