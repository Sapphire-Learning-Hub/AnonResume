import { imageResponse } from "@/lib/resume/assets/http";
import { authorizedImage } from "@/lib/resume/assets/authorization";
import { imageIdSchema, readImage } from "@/lib/resume/assets/service";
import { withRequestLogging } from "@/lib/observability/http";
export const GET = withRequestLogging(
  "/pdf-export/[id]/assets/[assetId]",
  (
    _request: Request,
    context: { params: Promise<{ id: string; assetId: string }> },
  ) =>
    imageResponse(async () => {
      const params = await context.params;
      const id = imageIdSchema.parse(params.assetId);
      const jobId = imageIdSchema.parse(params.id);
      const row = await authorizedImage(id, { jobId });
      return new Response(new Uint8Array(await readImage(row, "original")), {
        headers: { "Content-Type": "image/webp" },
      });
    }),
);
