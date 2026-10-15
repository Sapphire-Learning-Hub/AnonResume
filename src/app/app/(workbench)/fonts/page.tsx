import { FontMarket } from "@/components/fonts/FontMarket";
import { requireSession } from "@/lib/auth/session";
import { parseFontMarketQuery } from "@/domain/resume/fonts/market";
import { listUserFontPreferences } from "@/lib/resume/fonts/preferences";
import { paginateResumeEntries } from "@/lib/resume/repository";

type FontMarketSearchParams = Record<string, string | string[] | undefined>;

function toUrlSearchParams(input: FontMarketSearchParams) {
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  });
  return params;
}

export default async function FontMarketPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<FontMarketSearchParams>;
} = {}) {
  const session = await requireSession();
  const [resolvedSearchParams, initialPreferences, recentResumes] = await Promise.all([
    searchParams,
    listUserFontPreferences(session.user.id).catch(() => []),
    paginateResumeEntries({ userId: session.user.id, page: 1, pageSize: 1 }),
  ]);
  const defaultResumeEntry = recentResumes.items[0];

  return (
    <FontMarket
      defaultResume={defaultResumeEntry}
      initialPreferences={initialPreferences}
      initialQuery={parseFontMarketQuery(toUrlSearchParams(resolvedSearchParams))}
    />
  );
}
