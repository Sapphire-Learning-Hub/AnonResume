import { NextResponse } from "next/server";
import { z } from "zod";
import { imageRoute, type ImageRouteContext } from "@/lib/resume/assets/http";
import {
  renameImage,
  removeImage,
  imageNameSchema,
} from "@/lib/resume/assets/service";
import {
  parseLimitedJsonRequest,
  MAX_ACTION_REQUEST_BYTES,
} from "@/lib/http/request-body";
import { withRequestLogging } from "@/lib/observability/http";

export const PATCH = withRequestLogging(
  "/api/resume-assets/[id]",
  imageRoute(async (userId, request: Request, context: ImageRouteContext) => {
    const { name } = z
      .object({ name: imageNameSchema })
      .strict()
      .parse(await parseLimitedJsonRequest(request, MAX_ACTION_REQUEST_BYTES));
    await renameImage(userId, (await context.params).id, name);
    return NextResponse.json({ ok: true });
  }),
);
export const DELETE = withRequestLogging(
  "/api/resume-assets/[id]",
  imageRoute(async (userId, _request: Request, context: ImageRouteContext) => {
    await removeImage(userId, (await context.params).id);
    return NextResponse.json({ ok: true });
  }),
);
