import { NextResponse } from "next/server";
import { withRequestLogging } from "@/lib/observability/http";
import { templateBody, templateRoute } from "@/lib/resume/templates/http";
import {
  listPersonalTemplates,
  savePersonalTemplate,
} from "@/lib/resume/templates/service";
import { saveTemplateSchema } from "@/lib/resume/templates/types";
import { z } from "zod";

export const GET = withRequestLogging(
  "/api/resume-templates",
  templateRoute(async (userId, request: Request) => {
    const params = new URL(request.url).searchParams;
    const parsed = z
      .object({
        q: z.string().max(100).optional(),
        cursor: z.string().max(2048).optional(),
      })
      .strict()
      .parse(Object.fromEntries(params));
    return NextResponse.json(
      await listPersonalTemplates({
        userId,
        query: parsed.q,
        cursor: parsed.cursor,
      }),
    );
  }),
);
export const POST = withRequestLogging(
  "/api/resume-templates",
  templateRoute(async (userId, request: Request) =>
    NextResponse.json(
      await savePersonalTemplate(
        userId,
        await templateBody(request, saveTemplateSchema),
      ),
      { status: 201 },
    ),
  ),
);
