import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { assertImageStorageKey, type ImageStorage } from "./types";

export interface ImageS3Config {
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
}
export function createS3ImageStorage(
  config: ImageS3Config,
  { timeoutMs = 30000 }: { timeoutMs?: number } = {},
): ImageStorage {
  const createClient = () =>
    new S3Client({
      endpoint: config.endpoint || undefined,
      region: config.region,
      forcePathStyle: true,
      maxAttempts: 2,
      requestHandler: new NodeHttpHandler({
        connectionTimeout: 5000,
        requestTimeout: 15000,
        throwOnRequestTimeout: true,
        socketTimeout: 15000,
      }),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  async function operation<T>(
    run: (client: S3Client, signal: AbortSignal) => Promise<T>,
  ) {
    const client = createClient();
    const controller = new AbortController();
    // Also bound response-body consumption: the SDK's header timeout is insufficient.
    const timer = setTimeout(() => {
      controller.abort();
      client.destroy();
    }, timeoutMs);
    try {
      return await run(client, controller.signal);
    } finally {
      clearTimeout(timer);
      client.destroy();
    }
  }
  function key(value: string) {
    assertImageStorageKey(value);
    return `${config.prefix ? `${config.prefix}/` : ""}${value}`;
  }
  return {
    async put(value, data) {
      return operation(async (client, abortSignal) => {
        await client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: key(value),
            Body: data,
            ContentType: "image/webp",
            IfNoneMatch: "*",
          }),
          { abortSignal },
        );
      });
    },
    async get(value) {
      return operation(async (client, abortSignal) => {
        const result = await client.send(
          new GetObjectCommand({ Bucket: config.bucket, Key: key(value) }),
          { abortSignal },
        );
        if (!result.Body || (result.ContentLength ?? 0) > 13 * 1024 * 1024)
          throw new Error("Invalid image object");
        const reader = result.Body.transformToWebStream().getReader();
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > 13 * 1024 * 1024) {
              await reader.cancel();
              throw new Error("Invalid image object");
            }
            chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }
        return Buffer.concat(chunks);
      });
    },
    async remove(value) {
      return operation(async (client, abortSignal) => {
        await client.send(
          new DeleteObjectCommand({ Bucket: config.bucket, Key: key(value) }),
          { abortSignal },
        );
      });
    },
  };
}
