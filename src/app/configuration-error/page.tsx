import { notFound } from "next/navigation";

import { SystemStatePage } from "@/components/system/SystemStatePage";
import { getRequestMessages } from "@/i18n/server";
import { validateRuntimeConfiguration } from "@/lib/runtime-configuration";

export default async function ConfigurationErrorPage() {
  const configuration = validateRuntimeConfiguration(process.env);

  if (configuration.valid) {
    notFound();
  }

  const messages = await getRequestMessages();

  return (
    <SystemStatePage
      code="503"
      description={messages["system.configuration.description"]}
      title={messages["system.configuration.title"]}
    />
  );
}
