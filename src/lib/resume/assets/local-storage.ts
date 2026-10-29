import { assertImageStorageKey, type ImageStorage } from "./types";
import { ensureLocalImageDirectory, ImageDirectoryError, imageFileSystem, localImageDirectory } from "./local-directory";

const { constants } = imageFileSystem;
const { dirname, join } = process.getBuiltinModule("path");
const { link, lstat, open, readdir, rmdir, unlink } = imageFileSystem.promises;

export function createLocalImageStorage(directory: string): ImageStorage {
  localImageDirectory(directory);
  async function path(key: string, create = false) {
    assertImageStorageKey(key);
    const folder = await ensureLocalImageDirectory(directory, key.split("/")[0]!, create);
    return join(folder, key.split("/")[1]!);
  }
  async function regularFile(target: string, removing = false) {
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink() || (!removing && info.nlink !== 1)) throw new ImageDirectoryError();
  }
  return {
    async put(key, data) {
      const target = await path(key, true);
      const temporary = `${target}.${crypto.randomUUID()}.tmp`;
      const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try {
        await handle.writeFile(data);
        await handle.close();
        await path(key);
        await link(temporary, target);
      } finally {
        await handle.close();
        await unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; });
      }
    },
    async get(key) {
      const target = await path(key);
      await regularFile(target);
      const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const info = await handle.stat();
        if (!info.isFile() || info.nlink !== 1) throw new ImageDirectoryError();
        return await handle.readFile();
      } finally { await handle.close(); }
    },
    async remove(key) {
      // A missing storage root is an outage, not a missing object.
      await ensureLocalImageDirectory(directory);
      let target: string;
      try { target = await path(key); }
      catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
        throw error;
      }
      try { await regularFile(target, true); await unlink(target); }
      catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
      }
      const folder = dirname(target);
      const files = await readdir(folder);
      const variant = key.endsWith("original.webp") ? "original" : "thumbnail";
      for (const file of files) {
        if (file.startsWith(`${variant}.webp.`) && /\.[0-9a-f-]{36}\.tmp$/.test(file)) {
          await regularFile(join(folder, file), true);
          await unlink(join(folder, file));
        }
      }
      await rmdir(folder).catch((error) => { if (!["ENOENT", "ENOTEMPTY"].includes(error.code)) throw error; });
    },
  };
}
