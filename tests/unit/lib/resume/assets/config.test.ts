import { CONFIG_REGISTRY, parseManagedConfig } from "@/lib/config/registry";

it("requires complete private S3 settings and bounds upload quotas", () => {
  expect(() => parseManagedConfig({ imageStorage: "s3" })).toThrow();
  expect(() => parseManagedConfig({ imageUploadLimitMiB: 11 })).toThrow();
  expect(() => parseManagedConfig({ imageAccountQuotaMiB: 0 })).toThrow();
  const config = parseManagedConfig({
    imageStorage: "s3",
    imageS3Region: "test",
    imageS3Bucket: "private-images",
    imageS3AccessKeyId: "test",
    imageS3SecretAccessKey: "test",
    imageS3Endpoint: "http://127.0.0.1:9000",
  });
  expect(config.imageStorage).toBe("s3");
  expect(CONFIG_REGISTRY.imageS3SecretAccessKey.sensitive).toBe(true);
  expect(
    Object.entries(CONFIG_REGISTRY)
      .filter(([key]) => key.startsWith("image"))
      .every(([, field]) => !field.public),
  ).toBe(true);
  expect(parseManagedConfig({ imagesEnabled: false }).imageStorage).toBe(
    "local",
  );
  expect(() =>
    parseManagedConfig({ imageS3Endpoint: "file:///tmp/store" }),
  ).toThrow();
});
