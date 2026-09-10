import { FontMarket } from "@/components/fonts/FontMarket";
import { requireSession } from "@/lib/auth/session";

export default async function FontMarketPage() {
  await requireSession();
  return <FontMarket />;
}
