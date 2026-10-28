import { z } from "zod";
import {
  imageResponse,
  type ImageRouteContext,
} from "@/lib/resume/assets/http";
import { authorizedImage } from "@/lib/resume/assets/authorization";
import { imageIdSchema, readImage } from "@/lib/resume/assets/service";
import { withRequestLogging } from "@/lib/observability/http";

export const GET = withRequestLogging(
  "/api/resume-assets/[id]/content",
  (request: Request, context: ImageRouteContext) =>
    imageResponse(async () => {
      const id = imageIdSchema.parse((await context.params).id);
      const input = z
        .object({
          slug: z.string().min(1).max(200).optional(),
          jobId: z.string().uuid().optional(),
          variant: z.enum(["original", "thumbnail"]).default("original"),
        })
        .strict()
        .parse(Object.fromEntries(new URL(request.url).searchParams));
      const row = await authorizedImage(id, input);
      return new Response(new Uint8Array(await readImage(row, input.variant)), {
        headers: {
          "Content-Type": "image/webp",
          "Content-Disposition": "inline",
        },
      });
    }),
);
