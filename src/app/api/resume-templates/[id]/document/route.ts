import { NextResponse } from "next/server";
import { withRequestLogging } from "@/lib/observability/http";
import {
  templateBody,
  templateRoute,
  type TemplateRouteContext,
} from "@/lib/resume/templates/http";
import { replacePersonalTemplate } from "@/lib/resume/templates/service";
import { replaceTemplateSchema } from "@/lib/resume/templates/types";

export const PUT = withRequestLogging(
  "/api/resume-templates/[id]/document",
  templateRoute(
    async (userId, request: Request, context: TemplateRouteContext) =>
      NextResponse.json(
        await replacePersonalTemplate(userId, {
          templateId: (await context.params).id,
          ...(await templateBody(request, replaceTemplateSchema)),
        }),
      ),
  ),
);
