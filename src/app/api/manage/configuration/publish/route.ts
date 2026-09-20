import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApi } from "@/lib/admin/api";
import { configurationApiErrorResponse } from "@/lib/config/admin/api";
import { publishManagedConfiguration } from "@/lib/config/admin/service";
import {
  MAX_ACTION_REQUEST_BYTES,
  parseLimitedJsonRequest,
} from "@/lib/http/request-body";
import { requireSameOrigin } from "@/lib/http/request-origin";

const publishRequestSchema = z
  .object({
    baseVersion: z.number().int().positive(),
    draftRevisionId: z.string().uuid(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const forbiddenResponse = requireSameOrigin(request);
    if (forbiddenResponse) return forbiddenResponse;
    const context = await requireAdminApi({
      permission: "configuration.publish",
      recentMfa: true,
    });
    const input = publishRequestSchema.parse(
      await parseLimitedJsonRequest(request, MAX_ACTION_REQUEST_BYTES),
    );
    return NextResponse.json(
      await publishManagedConfiguration({
        actorUserId: context.userId,
        ...input,
      }),
    );
  } catch (error) {
    return configurationApiErrorResponse(error);
  }
}
