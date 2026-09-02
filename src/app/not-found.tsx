import { SystemStatePage } from "@/components/system/SystemStatePage";
import { getRequestMessages } from "@/i18n/server";

export default async function NotFound() {
  const messages = await getRequestMessages();

  return (
    <SystemStatePage
      actionHref="/app"
      actionLabel={messages["common.back"]}
      code="404"
      description={messages["system.notFound.description"]}
      title={messages["system.notFound.title"]}
    />
  );
}
