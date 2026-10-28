export interface ImageStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
export function assertImageStorageKey(key: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(original|thumbnail)\.webp$/.test(
      key,
    )
  )
    throw new Error("Invalid image storage key");
}
