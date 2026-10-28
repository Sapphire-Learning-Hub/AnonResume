import { createHash } from "node:crypto";
import sharp from "sharp";
import { ImageAssetError } from "./errors";

export const MAX_IMAGE_INPUT_BYTES = 10 * 1024 * 1024;
export const IMAGE_RESERVATION_BYTES = 13 * 1024 * 1024;
export async function processImage(input: Buffer) {
  if (input.length > MAX_IMAGE_INPUT_BYTES)
    throw new ImageAssetError("image_too_large");
  const png = input
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = input[0] === 255 && input[1] === 216 && input[2] === 255;
  const webp =
    input.toString("ascii", 0, 4) === "RIFF" &&
    input.toString("ascii", 8, 12) === "WEBP";
  if (!png && !jpeg && !webp) throw new ImageAssetError("image_invalid");
  try {
    const image = sharp(input, {
      limitInputPixels: 32_000_000,
      failOn: "warning",
    });
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      Math.max(metadata.width, metadata.height) > 16384 ||
      (metadata.pages ?? 1) !== 1 ||
      !["png", "jpeg", "webp"].includes(metadata.format ?? "")
    )
      throw new ImageAssetError("image_invalid");
    const { data: original, info } = await image
      .rotate()
      .resize({
        width: 4096,
        height: 4096,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .timeout({ seconds: 15 })
      .toBuffer({ resolveWithObject: true });
    const thumbnail = await sharp(original)
      .resize({
        width: 320,
        height: 320,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .timeout({ seconds: 5 })
      .toBuffer();
    if (original.length + thumbnail.length > IMAGE_RESERVATION_BYTES)
      throw new ImageAssetError("image_too_large");
    return {
      original,
      thumbnail,
      width: info.width,
      height: info.height,
      digest: createHash("sha256").update(original).digest("hex"),
    };
  } catch (error) {
    if (error instanceof ImageAssetError) throw error;
    throw new ImageAssetError("image_invalid");
  }
}
