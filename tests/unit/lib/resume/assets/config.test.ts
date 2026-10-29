import { CONFIG_REGISTRY, parseManagedConfig } from "@/lib/config/registry";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { imageStorageLocation } from "@/lib/resume/assets/storage";

it("keeps legacy local image identities when the new setting is absent", () => {
  const root = ".anonresume/images";
  const oldIdentity = createHash("sha256").update(JSON.stringify(["local", resolve(root)])).digest("hex");
  expect(imageStorageLocation(parseManagedConfig({}))).toBe(oldIdentity);
  expect(imageStorageLocation(parseManagedConfig({ imageLocalDirectory: "/var/lib/other-images" }))).not.toBe(oldIdentity);
});

it("accepts one complete directory rather than combining independently configured paths", () => {
  expect(parseManagedConfig({}).imageLocalDirectory).toBe(".anonresume/images");
  expect(parseManagedConfig({ imageLocalDirectory: "/var/lib/resume-photos" }).imageLocalDirectory).toBe("/var/lib/resume-photos");
  for (const path of ["", "../images", "/photos/../images", "C:\\images", "a\\b", "a//b", "./photos", "a\u0000b"])
    expect(() => parseManagedConfig({ imageLocalDirectory: path })).toThrow();
});

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
