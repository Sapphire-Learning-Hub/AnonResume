import { and, asc, eq, isNull } from "drizzle-orm";

import { aiModels, aiProviderCredentials, db } from "@/db";
import { createAiProviderAdapter } from "@/lib/ai/providers/registry";
import {
  decryptAiCredential,
  encryptAiCredential,
  maskAiCredential,
} from "@/lib/ai/security/credentials";
import { assertSafeAiEndpoint } from "@/lib/ai/security/endpoint-policy";

export class PersonalAiResourceNotFoundError extends Error {
  constructor() {
    super("personal_ai_resource_not_found");
    this.name = "PersonalAiResourceNotFoundError";
  }
}

export class PersonalAiStateConflictError extends Error {
  constructor() {
    super("personal_ai_state_conflict");
    this.name = "PersonalAiStateConflictError";
  }
}

export interface PersonalAiProviderInput {
  providerName: string;
  baseUrl: string;
  apiKey?: string;
}

export interface PersonalAiModelInput {
  modelKey: string;
  modelName: string;
  enabled?: boolean;
  supportsStreaming: boolean;
  supportsToolCalls: boolean;
  contextWindow: number;
  maxOutputTokens: number;
}

async function getOwnedProvider(input: { userId: string; providerId: string }) {
  const [provider] = await db
    .select()
    .from(aiProviderCredentials)
    .where(
      and(
        eq(aiProviderCredentials.id, input.providerId),
        eq(aiProviderCredentials.ownerUserId, input.userId),
        eq(aiProviderCredentials.kind, "user"),
        isNull(aiProviderCredentials.deletedAt),
      ),
    )
    .limit(1);
  if (!provider) throw new PersonalAiResourceNotFoundError();
  return provider;
}

async function getOwnedModel(input: {
  userId: string;
  providerId: string;
  modelId: string;
}) {
  const [model] = await db
    .select({
      id: aiModels.id,
      enabled: aiModels.enabled,
      providerEnabled: aiProviderCredentials.enabled,
    })
    .from(aiModels)
    .innerJoin(
      aiProviderCredentials,
      eq(aiProviderCredentials.id, aiModels.providerId),
    )
    .where(
      and(
        eq(aiModels.id, input.modelId),
        eq(aiModels.providerId, input.providerId),
        isNull(aiModels.deletedAt),
        eq(aiProviderCredentials.ownerUserId, input.userId),
        eq(aiProviderCredentials.kind, "user"),
        isNull(aiProviderCredentials.deletedAt),
      ),
    )
    .limit(1);
  if (!model) throw new PersonalAiResourceNotFoundError();
  return model;
}

export async function listPersonalAiProviders(input: {
  userId: string;
  encryptionKey: Buffer;
}) {
  const rows = await db
    .select({
      providerId: aiProviderCredentials.id,
      providerName: aiProviderCredentials.displayName,
      baseUrl: aiProviderCredentials.baseUrl,
      encryptedApiKey: aiProviderCredentials.encryptedApiKey,
      providerEnabled: aiProviderCredentials.enabled,
      modelId: aiModels.id,
      modelKey: aiModels.providerModelKey,
      modelName: aiModels.displayName,
      modelEnabled: aiModels.enabled,
      supportsStreaming: aiModels.supportsStreaming,
      supportsToolCalls: aiModels.supportsToolCalls,
      contextWindow: aiModels.contextWindow,
      maxOutputTokens: aiModels.maxOutputTokens,
    })
    .from(aiProviderCredentials)
    .leftJoin(
      aiModels,
      and(
        eq(aiModels.providerId, aiProviderCredentials.id),
        isNull(aiModels.deletedAt),
      ),
    )
    .where(
      and(
        eq(aiProviderCredentials.ownerUserId, input.userId),
        eq(aiProviderCredentials.kind, "user"),
        isNull(aiProviderCredentials.deletedAt),
      ),
    )
    .orderBy(
      asc(aiProviderCredentials.createdAt),
      asc(aiModels.displayName),
      asc(aiModels.id),
    );

  const providers = new Map<
    string,
    {
      id: string;
      providerName: string;
      baseUrl: string;
      maskedApiKey: string;
      enabled: boolean;
      models: Array<{
        id: string;
        providerId: string;
        modelKey: string;
        modelName: string;
        enabled: boolean;
        supportsStreaming: boolean;
        supportsToolCalls: boolean;
        contextWindow: number;
        maxOutputTokens: number;
      }>;
    }
  >();

  for (const row of rows) {
    let provider = providers.get(row.providerId);
    if (!provider) {
      provider = {
        id: row.providerId,
        providerName: row.providerName,
        baseUrl: row.baseUrl,
        maskedApiKey: maskAiCredential(
          decryptAiCredential(row.encryptedApiKey, input.encryptionKey),
        ),
        enabled: row.providerEnabled,
        models: [],
      };
      providers.set(row.providerId, provider);
    }
    if (row.modelId) {
      provider.models.push({
        id: row.modelId,
        providerId: row.providerId,
        modelKey: row.modelKey!,
        modelName: row.modelName!,
        enabled: row.modelEnabled!,
        supportsStreaming: row.supportsStreaming!,
        supportsToolCalls: row.supportsToolCalls!,
        contextWindow: row.contextWindow!,
        maxOutputTokens: row.maxOutputTokens!,
      });
    }
  }
  return [...providers.values()];
}

export async function createPersonalAiProvider(input: {
  userId: string;
  encryptionKey: Buffer;
  trustedEndpointHostnames?: readonly string[];
  value: PersonalAiProviderInput & { apiKey: string };
}) {
  const endpoint = await assertSafeAiEndpoint(
    input.value.baseUrl,
    undefined,
    new Set(input.trustedEndpointHostnames ?? []),
  );
  const [provider] = await db
    .insert(aiProviderCredentials)
    .values({
      ownerUserId: input.userId,
      kind: "user",
      displayName: input.value.providerName,
      baseUrl: endpoint.href,
      encryptedApiKey: encryptAiCredential(
        input.value.apiKey,
        input.encryptionKey,
      ),
    })
    .returning({ id: aiProviderCredentials.id });
  return (await listPersonalAiProviders(input)).find(
    (candidate) => candidate.id === provider!.id,
  )!;
}

export async function updatePersonalAiProvider(input: {
  userId: string;
  providerId: string;
  encryptionKey: Buffer;
  trustedEndpointHostnames?: readonly string[];
  value: PersonalAiProviderInput & { enabled: boolean };
}) {
  await getOwnedProvider(input);
  const endpoint = await assertSafeAiEndpoint(
    input.value.baseUrl,
    undefined,
    new Set(input.trustedEndpointHostnames ?? []),
  );
  await db.transaction(async (transaction) => {
    await transaction
      .update(aiProviderCredentials)
      .set({
        displayName: input.value.providerName,
        baseUrl: endpoint.href,
        encryptedApiKey: input.value.apiKey
          ? encryptAiCredential(input.value.apiKey, input.encryptionKey)
          : undefined,
        enabled: input.value.enabled,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(aiProviderCredentials.id, input.providerId),
          eq(aiProviderCredentials.ownerUserId, input.userId),
          isNull(aiProviderCredentials.deletedAt),
        ),
      );
    if (!input.value.enabled) {
      await transaction
        .update(aiModels)
        .set({ enabled: false, updatedAt: new Date() })
        .where(
          and(
            eq(aiModels.providerId, input.providerId),
            isNull(aiModels.deletedAt),
          ),
        );
    }
  });
  return (await listPersonalAiProviders(input)).find(
    (candidate) => candidate.id === input.providerId,
  )!;
}

export async function deletePersonalAiProvider(input: {
  userId: string;
  providerId: string;
}) {
  const provider = await getOwnedProvider(input);
  if (provider.enabled) throw new PersonalAiStateConflictError();

  await db.transaction(async (transaction) => {
    const enabledModels = await transaction
      .select({ id: aiModels.id })
      .from(aiModels)
      .where(
        and(
          eq(aiModels.providerId, input.providerId),
          eq(aiModels.enabled, true),
          isNull(aiModels.deletedAt),
        ),
      )
      .limit(1);
    if (enabledModels[0]) throw new PersonalAiStateConflictError();
    const now = new Date();
    await transaction
      .update(aiModels)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(aiModels.providerId, input.providerId),
          isNull(aiModels.deletedAt),
        ),
      );
    await transaction
      .update(aiProviderCredentials)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(aiProviderCredentials.id, input.providerId),
          eq(aiProviderCredentials.ownerUserId, input.userId),
          isNull(aiProviderCredentials.deletedAt),
        ),
      );
  });
}

export async function createPersonalAiModel(input: {
  userId: string;
  providerId: string;
  value: PersonalAiModelInput;
}) {
  const provider = await getOwnedProvider(input);
  if (!provider.enabled) throw new PersonalAiStateConflictError();
  const [model] = await db
    .insert(aiModels)
    .values({
      providerId: input.providerId,
      providerModelKey: input.value.modelKey,
      displayName: input.value.modelName,
      enabled: input.value.enabled ?? true,
      supportsStreaming: input.value.supportsStreaming,
      supportsToolCalls: input.value.supportsToolCalls,
      contextWindow: input.value.contextWindow,
      maxOutputTokens: input.value.maxOutputTokens,
      inputPointRate: 0,
      cachedInputPointRate: 0,
      outputPointRate: 0,
    })
    .returning();
  return {
    id: model!.id,
    providerId: model!.providerId,
    modelKey: model!.providerModelKey,
    modelName: model!.displayName,
    enabled: model!.enabled,
    supportsStreaming: model!.supportsStreaming,
    supportsToolCalls: model!.supportsToolCalls,
    contextWindow: model!.contextWindow,
    maxOutputTokens: model!.maxOutputTokens,
  };
}

export async function updatePersonalAiModel(input: {
  userId: string;
  providerId: string;
  modelId: string;
  value: PersonalAiModelInput & { enabled: boolean };
}) {
  const current = await getOwnedModel(input);
  if (input.value.enabled && !current.providerEnabled) {
    throw new PersonalAiStateConflictError();
  }
  const [model] = await db
    .update(aiModels)
    .set({
      providerModelKey: input.value.modelKey,
      displayName: input.value.modelName,
      enabled: input.value.enabled,
      supportsStreaming: input.value.supportsStreaming,
      supportsToolCalls: input.value.supportsToolCalls,
      contextWindow: input.value.contextWindow,
      maxOutputTokens: input.value.maxOutputTokens,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(aiModels.id, input.modelId),
        eq(aiModels.providerId, input.providerId),
        isNull(aiModels.deletedAt),
      ),
    )
    .returning();
  if (!model) throw new PersonalAiResourceNotFoundError();
  return {
    id: model.id,
    providerId: model.providerId,
    modelKey: model.providerModelKey,
    modelName: model.displayName,
    enabled: model.enabled,
    supportsStreaming: model.supportsStreaming,
    supportsToolCalls: model.supportsToolCalls,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens,
  };
}

export async function deletePersonalAiModel(input: {
  userId: string;
  providerId: string;
  modelId: string;
}) {
  const model = await getOwnedModel(input);
  if (model.enabled) throw new PersonalAiStateConflictError();
  await db
    .update(aiModels)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(aiModels.id, input.modelId),
        eq(aiModels.providerId, input.providerId),
        eq(aiModels.enabled, false),
        isNull(aiModels.deletedAt),
      ),
    );
}

export async function testPersonalAiProvider(input: {
  userId: string;
  providerId: string;
  modelKey: string;
  encryptionKey: Buffer;
  trustedEndpointHostnames?: readonly string[];
}) {
  const provider = await getOwnedProvider(input);
  const endpoint = await assertSafeAiEndpoint(
    provider.baseUrl,
    undefined,
    new Set(input.trustedEndpointHostnames ?? []),
  );
  const adapter = createAiProviderAdapter("openai-compatible");
  const signal = AbortSignal.timeout(10_000);
  for await (const event of adapter.start(
    {
      endpoint,
      apiKey: decryptAiCredential(
        provider.encryptedApiKey,
        input.encryptionKey,
      ),
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
