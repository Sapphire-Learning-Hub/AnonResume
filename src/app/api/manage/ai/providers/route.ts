import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/api";
import { aiAdminApiErrorResponse } from "@/lib/ai/admin/api";
import { listAiAdminProviders, saveAiAdminProvider } from "@/lib/ai/admin/service";
import { aiAdminProviderSchema } from "@/lib/ai/admin/validation";
import { resolveAiConfiguration } from "@/lib/ai/config/configuration";
import {
  MAX_ACTION_REQUEST_BYTES,
  parseLimitedJsonRequest,
} from "@/lib/http/request-body";
import { requireSameOrigin } from "@/lib/http/request-origin";
import { parsePageRequest } from "@/lib/shared/pagination";

function requireEncryptionKey() {
  const key = resolveAiConfiguration(process.env).credentialsEncryptionKey;
  if (!key) throw new Error("ai_encryption_key_unavailable");
  return key;
}

export async function GET(request: Request) {
  try {
    await requireAdminApi({ permission: "ai.providers.manage" });
    const params = new URL(request.url).searchParams;
    const result = await listAiAdminProviders({
      ...parsePageRequest({
        page: params.get("page") ?? undefined,
        pageSize: params.get("pageSize") ?? undefined,
      }),
      query: params.get("q") ?? undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return aiAdminApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const forbiddenResponse = requireSameOrigin(request);
    if (forbiddenResponse) return forbiddenResponse;
    const context = await requireAdminApi({
      permission: "ai.providers.manage",
      recentMfa: true,
    });
    const value = aiAdminProviderSchema.parse(
      await parseLimitedJsonRequest(request, MAX_ACTION_REQUEST_BYTES),
    );
    if (!value.apiKey) throw new Error("ai_api_key_required");
    const result = await saveAiAdminProvider({
      actorUserId: context.userId,
      encryptionKey: requireEncryptionKey(),
      value,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return aiAdminApiErrorResponse(error);
  }
}
