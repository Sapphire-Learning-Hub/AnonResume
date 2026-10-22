import { NextResponse } from "next/server";
import { withRequestLogging } from "@/lib/observability/http";
import {
  templateBody,
  templateRoute,
  type TemplateRouteContext,
} from "@/lib/resume/templates/http";
import {
  getPersonalTemplate,
  renamePersonalTemplate,
  deletePersonalTemplate,
} from "@/lib/resume/templates/service";
import {
  renameTemplateSchema,
  deleteTemplateSchema,
} from "@/lib/resume/templates/types";

const path = "/api/resume-templates/[id]";
export const GET = withRequestLogging(
  path,
  templateRoute(
    async (userId, _request: Request, context: TemplateRouteContext) =>
      NextResponse.json(
        await getPersonalTemplate(userId, (await context.params).id),
      ),
  ),
);
export const PATCH = withRequestLogging(
  path,
  templateRoute(
    async (userId, request: Request, context: TemplateRouteContext) =>
      NextResponse.json(
        await renamePersonalTemplate({
          userId,
          templateId: (await context.params).id,
          ...(await templateBody(request, renameTemplateSchema)),
        }),
      ),
  ),
);
export const DELETE = withRequestLogging(
  path,
  templateRoute(
    async (userId, request: Request, context: TemplateRouteContext) => {
      await deletePersonalTemplate({
        userId,
        templateId: (await context.params).id,
        ...(await templateBody(request, deleteTemplateSchema)),
      });
      return new Response(null, { status: 204 });
    },
  ),
);
