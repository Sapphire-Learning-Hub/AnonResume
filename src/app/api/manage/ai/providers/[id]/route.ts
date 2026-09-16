import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/api";
import { aiAdminApiErrorResponse } from "@/lib/ai/admin/api";
import {
  disableAiAdminProvider,
  saveAiAdminProvider,
} from "@/lib/ai/admin/service";
import { resolveAiConfiguration } from "@/lib/ai/config/configuration";
import { aiAdminProviderSchema } from "@/lib/ai/admin/validation";

function requireEncryptionKey() {
  const key = resolveAiConfiguration(process.env).credentialsEncryptionKey;
  if (!key) throw new Error("ai_encryption_key_unavailable");
  return key;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireAdminApi({
      permission: "ai.providers.manage",
      recentMfa: true,
    });
    const value = aiAdminProviderSchema.parse(await request.json());
    if (!value.model.id) throw new SyntaxError("model id is required");
    const result = await saveAiAdminProvider({
      actorUserId: context.userId,
      providerId: (await params).id,
      encryptionKey: requireEncryptionKey(),
      value,
    });
    return NextResponse.json(result);
  } catch (error) {
    return aiAdminApiErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireAdminApi({
      permission: "ai.providers.manage",
      recentMfa: true,
    });
    await disableAiAdminProvider({
      actorUserId: context.userId,
      providerId: (await params).id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return aiAdminApiErrorResponse(error);
  }
}
