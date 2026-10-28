import {
  link,
  mkdir,
  readFile,
  readdir,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { assertImageStorageKey, type ImageStorage } from "./types";

export function createLocalImageStorage(directory: string): ImageStorage {
  const root = resolve(directory);
  function path(key: string) {
    assertImageStorageKey(key);
    return join(root, key);
  }
  return {
    async put(key, data) {
      const target = path(key);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      const temporary = `${target}.${crypto.randomUUID()}.tmp`;
      try {
        await writeFile(temporary, data, { flag: "wx", mode: 0o600 });
        // Atomic, no-replace publication. Readers never observe a partial image.
        await link(temporary, target);
      } finally {
        await unlink(temporary).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
    },
    async get(key) {
      return readFile(path(key));
    },
    async remove(key) {
      const target = path(key);
      await unlink(target).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
      const folder = dirname(target);
      const files = await readdir(folder).catch((error) => {
        if (error.code === "ENOENT") return [];
        throw error;
      });
      const variant = key.endsWith("original.webp") ? "original" : "thumbnail";
      for (const file of files) {
        if (
          file.startsWith(`${variant}.webp.`) &&
          /\.[0-9a-f-]{36}\.tmp$/.test(file)
        )
          await unlink(join(folder, file)).catch((error) => {
            if (error.code !== "ENOENT") throw error;
          });
      }
      await rmdir(folder).catch((error) => {
        if (!["ENOENT", "ENOTEMPTY"].includes(error.code)) throw error;
      });
    },
  };
}
