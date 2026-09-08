import { FontMarket } from "@/components/fonts/FontMarket";
import { requireSession } from "@/lib/auth-session";
import { listResumeEntries } from "@/lib/resume-repository";

export default async function FontMarketPage() {
  const session = await requireSession();
  return <FontMarket resumes={await listResumeEntries(session.user.id)} />;
}
