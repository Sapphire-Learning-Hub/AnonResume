export interface ProviderModelItem {
  modelId: string;
  providerId: string;
  modelKey: string;
  modelName: string;
  modelEnabled: boolean;
  supportsToolCalls: boolean;
  contextWindow: number;
  maxOutputTokens: number;
  inputPointRate: string;
  cachedInputPointRate: string;
  outputPointRate: string;
  rateCardVersion: number;
}

export interface ProviderItem {
  providerId: string;
  providerName: string;
  baseUrl: string;
  providerEnabled: boolean;
  models: ProviderModelItem[];
}

export interface QuotaItem {
  userId: string;
  userName: string;
  email: string;
  monthlyLimit: string;
  customLimit: boolean;
  usedPoints: string;
  reservedPoints: string;
  periodStartedAt: string | null;
  periodEndsAt: string | null;
}

export interface UsageItem {
  runId: string;
  userId: string;
  userName: string;
  email: string;
  resumeId: string;
  resumeName: string;
  modelId: string;
  modelName: string;
  keySource: string;
  status: string;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  reservedPoints: string;
  finalPoints: string | null;
  hasEvidence: boolean;
  createdAt: string;
  completedAt: string | null;
}

export interface LedgerItem {
  ledgerId: string;
  runId: string | null;
  userId: string;
  userName: string;
  email: string;
  resumeId: string | null;
  resumeName: string | null;
  modelId: string | null;
  modelName: string | null;
  entryType: string;
  pointsDelta: string;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
}
