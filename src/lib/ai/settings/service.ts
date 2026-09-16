import { and, eq } from "drizzle-orm";

import { aiModels, aiProviderCredentials, db } from "@/db";
import {
  decryptAiCredential,
  encryptAiCredential,
  maskAiCredential,
} from "@/lib/ai/security/credentials";
import { assertSafeAiEndpoint } from "@/lib/ai/security/endpoint-policy";
import { createAiProviderAdapter } from "@/lib/ai/providers/registry";

export async function getPersonalAiSettings(input: {
  userId: string;
  encryptionKey: Buffer;
}) {
  const [setting] = await db
    .select({
      providerId: aiProviderCredentials.id,
      providerName: aiProviderCredentials.displayName,
      baseUrl: aiProviderCredentials.baseUrl,
      encryptedApiKey: aiProviderCredentials.encryptedApiKey,
      providerEnabled: aiProviderCredentials.enabled,
      modelId: aiModels.id,
      modelKey: aiModels.providerModelKey,
      modelName: aiModels.displayName,
      supportsToolCalls: aiModels.supportsToolCalls,
      modelEnabled: aiModels.enabled,
    })
    .from(aiProviderCredentials)
    .innerJoin(aiModels, eq(aiModels.providerId, aiProviderCredentials.id))
    .where(
      and(
        eq(aiProviderCredentials.ownerUserId, input.userId),
        eq(aiProviderCredentials.kind, "user"),
      ),
    )
    .limit(1);
  if (!setting) return null;

  return {
    providerId: setting.providerId,
    providerName: setting.providerName,
    baseUrl: setting.baseUrl,
    maskedApiKey: maskAiCredential(
      decryptAiCredential(setting.encryptedApiKey, input.encryptionKey),
    ),
    modelId: setting.modelId,
    modelKey: setting.modelKey,
    modelName: setting.modelName,
    supportsToolCalls: setting.supportsToolCalls,
    enabled: setting.providerEnabled && setting.modelEnabled,
  };
}

export async function savePersonalAiSettings(input: {
  userId: string;
  encryptionKey: Buffer;
  trustedEndpointHostnames?: readonly string[];
  providerName: string;
  baseUrl: string;
  apiKey?: string;
  modelKey: string;
  modelName: string;
  supportsToolCalls: boolean;
}) {
  const endpoint = await assertSafeAiEndpoint(
    input.baseUrl,
    undefined,
    new Set(input.trustedEndpointHostnames ?? []),
  );
  const current = await getPersonalAiSettings({
    userId: input.userId,
    encryptionKey: input.encryptionKey,
  });
  if (!current && !input.apiKey) throw new Error("ai_api_key_required");

  return db.transaction(async (transaction) => {
    let providerId = current?.providerId;
    if (providerId) {
      await transaction
        .update(aiProviderCredentials)
        .set({
          displayName: input.providerName,
          baseUrl: endpoint.href,
          encryptedApiKey: input.apiKey
            ? encryptAiCredential(input.apiKey, input.encryptionKey)
            : undefined,
          enabled: true,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(aiProviderCredentials.id, providerId),
            eq(aiProviderCredentials.ownerUserId, input.userId),
          ),
        );
    } else {
      const [provider] = await transaction
        .insert(aiProviderCredentials)
        .values({
          ownerUserId: input.userId,
          kind: "user",
          displayName: input.providerName,
          baseUrl: endpoint.href,
          encryptedApiKey: encryptAiCredential(
            input.apiKey!,
            input.encryptionKey,
          ),
        })
        .returning({ id: aiProviderCredentials.id });
      providerId = provider!.id;
    }

    if (current?.modelId) {
      await transaction
        .update(aiModels)
        .set({
          providerModelKey: input.modelKey,
          displayName: input.modelName,
          supportsToolCalls: input.supportsToolCalls,
          enabled: true,
          updatedAt: new Date(),
        })
        .where(eq(aiModels.id, current.modelId));
    } else {
      await transaction.insert(aiModels).values({
        providerId,
        providerModelKey: input.modelKey,
        displayName: input.modelName,
        supportsToolCalls: input.supportsToolCalls,
        contextWindow: 128_000,
        maxOutputTokens: 4_096,
        inputPointRate: 0,
        cachedInputPointRate: 0,
        outputPointRate: 0,
      });
    }
  });
}

export async function disablePersonalAiSettings(userId: string) {
  await db
    .update(aiProviderCredentials)
    .set({ enabled: false, updatedAt: new Date() })
    .where(
      and(
        eq(aiProviderCredentials.ownerUserId, userId),
        eq(aiProviderCredentials.kind, "user"),
      ),
    );
}

export async function testPersonalAiSettings(input: {
  userId: string;
  encryptionKey: Buffer;
  trustedEndpointHostnames?: readonly string[];
  baseUrl: string;
  apiKey?: string;
  modelKey: string;
}) {
  const endpoint = await assertSafeAiEndpoint(
    input.baseUrl,
    undefined,
    new Set(input.trustedEndpointHostnames ?? []),
  );
  const current = await getPersonalAiSettings({
    userId: input.userId,
    encryptionKey: input.encryptionKey,
  });
  let apiKey = input.apiKey;
  if (!apiKey && current) {
    const [provider] = await db
      .select({ encryptedApiKey: aiProviderCredentials.encryptedApiKey })
      .from(aiProviderCredentials)
      .where(
        and(
          eq(aiProviderCredentials.id, current.providerId),
          eq(aiProviderCredentials.ownerUserId, input.userId),
        ),
      )
      .limit(1);
    if (provider) {
      apiKey = decryptAiCredential(provider.encryptedApiKey, input.encryptionKey);
    }
  }
  if (!apiKey) throw new Error("ai_api_key_required");

  const adapter = createAiProviderAdapter("openai-compatible");
  const signal = AbortSignal.timeout(10_000);
  for await (const event of adapter.start(
    {
      endpoint,
      apiKey,
      model: input.modelKey,
      messages: [{ role: "user", content: "Reply with OK." }],
      maxOutputTokens: 8,
      trustedEndpointHostnames: input.trustedEndpointHostnames,
    },
    signal,
  )) {
    if (event.type === "complete") return;
  }
}
