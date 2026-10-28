import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { ManagedConfig } from "@/lib/config/registry";
import { readImageStorageDirectory } from "@/lib/config/process-environment";
import { createLocalImageStorage } from "./local-storage";
import { createS3ImageStorage } from "./s3-storage";

export function imageStorageLocation(config: ManagedConfig) {
  const location =
    config.imageStorage === "local"
      ? ["local", resolve(readImageStorageDirectory())]
      : [
          "s3",
          config.imageS3Endpoint,
          config.imageS3Region,
          config.imageS3Bucket,
          config.imageS3Prefix,
        ];
  return createHash("sha256").update(JSON.stringify(location)).digest("hex");
}
export function imageStorage(config: ManagedConfig) {
  return config.imageStorage === "local"
    ? createLocalImageStorage(readImageStorageDirectory())
    : createS3ImageStorage({
        endpoint: config.imageS3Endpoint,
        region: config.imageS3Region,
        bucket: config.imageS3Bucket,
        prefix: config.imageS3Prefix,
        accessKeyId: config.imageS3AccessKeyId,
        secretAccessKey: config.imageS3SecretAccessKey,
      });
}
