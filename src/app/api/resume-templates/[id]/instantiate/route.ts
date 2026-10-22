import { NextResponse } from "next/server";
import { getRequestLocale } from "@/i18n/server";
import { withRequestLogging } from "@/lib/observability/http";
import {
  templateBody,
  templateRoute,
  type TemplateRouteContext,
} from "@/lib/resume/templates/http";
import { instantiatePersonalTemplate } from "@/lib/resume/templates/service";
import { instantiateTemplateSchema } from "@/lib/resume/templates/types";

export const POST = withRequestLogging(
  "/api/resume-templates/[id]/instantiate",
  templateRoute(
    async (userId, request: Request, context: TemplateRouteContext) =>
      NextResponse.json(
        await instantiatePersonalTemplate(userId, {
          templateId: (await context.params).id,
          locale: await getRequestLocale(),
          ...(await templateBody(request, instantiateTemplateSchema)),
        }),
        { status: 201 },
      ),
  ),
);
