import { AiServiceSettings } from "@/components/ai/AiServiceSettings";
import { requireSession } from "@/lib/auth/session";

export default async function AiSettingsPage() {
  await requireSession();
  return <AiServiceSettings />;
}
