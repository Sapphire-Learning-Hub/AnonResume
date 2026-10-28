import sharp from "sharp";
import { processImage } from "@/lib/resume/assets/processing";

it.each(["jpeg", "png", "webp"] as const)(
  "normalizes real %s pixels, removes metadata and generates a separate thumbnail",
  async (format) => {
    const input = await sharp({
      create: {
        width: 600,
        height: 800,
        channels: 4,
        background: { r: 50, g: 100, b: 150, alpha: 0.5 },
      },
    })
      .withMetadata({ orientation: 6 })
      .toFormat(format)
      .toBuffer();
    const output = await processImage(input);
    const meta = await sharp(output.original).metadata();
    expect([output.width, output.height]).toEqual([800, 600]);
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    if (format !== "jpeg") expect(meta.hasAlpha).toBe(true);
    expect(
      (await sharp(output.thumbnail).metadata()).width,
    ).toBeLessThanOrEqual(320);
  },
);

it("rejects active formats, damaged content, byte limits and pixel bombs before storing anything", async () => {
  for (const input of [
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    Buffer.from("not an image"),
    Buffer.alloc(10 * 1024 * 1024 + 1),
  ]) {
    await expect(processImage(input)).rejects.toMatchObject({
      code: expect.stringMatching(/^image_/),
    });
  }
  const large = await sharp({
    create: { width: 6000, height: 6000, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await expect(processImage(large)).rejects.toMatchObject({
    code: "image_invalid",
  });
});
