import { SystemStatePage } from "@/components/system/SystemStatePage";
import { getRequestMessages } from "@/i18n/server";

export default async function ConfigurationRecoveryPage() {
  const messages = await getRequestMessages();

  return (
    <SystemStatePage
      actionHref="/sign-in"
      actionLabel={messages["system.configurationRecovery.action"]}
      code="503"
      description={messages["system.configurationRecovery.description"]}
      title={messages["system.configurationRecovery.title"]}
    />
  );
}
