import { NextResponse } from "next/server";
import { z } from "zod";
import { imageRoute } from "@/lib/resume/assets/http";
import { listImages, uploadImage } from "@/lib/resume/assets/service";
import { MAX_IMAGE_INPUT_BYTES } from "@/lib/resume/assets/processing";
import { readLimitedRequestBody } from "@/lib/http/request-body";
import { withRequestLogging } from "@/lib/observability/http";

export const GET = withRequestLogging(
  "/api/resume-assets",
  imageRoute(async (userId, request: Request) => {
    const params = new URL(request.url).searchParams;
    const input = z
      .object({
        q: z.string().max(100).optional(),
        page: z.coerce.number().int().positive().optional(),
      })
      .strict()
      .parse(Object.fromEntries(params));
    return NextResponse.json(
      await listImages(userId, { query: input.q, page: input.page }),
    );
  }),
);
export const POST = withRequestLogging(
  "/api/resume-assets",
  imageRoute(async (userId, request: Request) => {
    const name = decodeURIComponent(request.headers.get("x-image-name") ?? "");
    const input = Buffer.from(
      await readLimitedRequestBody(request, MAX_IMAGE_INPUT_BYTES),
    );
    return NextResponse.json(await uploadImage(userId, name, input), {
      status: 201,
    });
  }),
);
