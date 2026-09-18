import { getOptionalSession } from "@/lib/auth/session";
import { resolveAiConfiguration } from "@/lib/ai/config/configuration";
import {
  AiFeatureUnavailableError,
  createAiErrorResponse,
} from "@/lib/ai/http/errors";
import { listPersonalAiProviders } from "@/lib/ai/settings/service";
import { getAiQuotaSnapshot } from "@/lib/ai/usage/ledger";

export async function GET() {
  const session = await getOptionalSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const configuration = resolveAiConfiguration(process.env);
    if (!configuration.enabled || !configuration.credentialsEncryptionKey) {
      throw new AiFeatureUnavailableError();
    }
    const [providers, quota] = await Promise.all([
      configuration.byokEnabled
        ? listPersonalAiProviders({
            userId: session.user.id,
            encryptionKey: configuration.credentialsEncryptionKey,
          })
        : Promise.resolve([]),
      getAiQuotaSnapshot(session.user.id),
    ]);
    return Response.json({
      platformEnabled: configuration.platformEnabled,
      byokEnabled: configuration.byokEnabled,
      defaultMonthlyPoints: configuration.defaultMonthlyPoints,
      quota,
      providers,
    });
  } catch (error) {
    const response = createAiErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
