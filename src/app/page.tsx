import { connection } from "next/server";

import { MarketingHome } from "@/components/marketing/MarketingHome";
import { getRequestLocale } from "@/i18n/server";
import { getVisibleAnnouncements } from "@/lib/announcements/management";

export default async function HomePage() {
  await connection();
  const locale = await getRequestLocale();
  const announcements = await getVisibleAnnouncements({
    authenticated: false,
    locale,
  });

  return <MarketingHome announcements={announcements} />;
}
