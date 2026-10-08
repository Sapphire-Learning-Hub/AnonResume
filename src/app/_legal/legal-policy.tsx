import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ComponentType } from "react";

import { LegalPolicyPage } from "@/components/legal/LegalPolicyPage";
import { getMessages, type MessageKey } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/server";
import { getLegalPageConfiguration } from "@/lib/public-info/legal-page";
import { resolvePublicInformationDestinations } from "@/lib/public-info/destinations";

export interface LegalPolicyDefinition {
  content: {
    "en-US": ComponentType;
    "zh-CN": ComponentType;
  };
  descriptionKey: MessageKey;
  kind: "privacy" | "terms";
  titleKey: MessageKey;
}

export async function createLegalPolicyMetadata(
  definition: LegalPolicyDefinition,
): Promise<Metadata> {
  const messages = getMessages(await getRequestLocale());
  return {
    description: messages[definition.descriptionKey],
    title: messages[definition.titleKey],
  };
}

function formatEffectiveDate(
  value: string,
  locale: "en-US" | "zh-CN",
  fallback: string,
) {
  if (!value) return fallback;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return fallback;

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(date);
}

export async function renderLegalPolicy(definition: LegalPolicyDefinition) {
  const [locale, configuration] = await Promise.all([
    getRequestLocale(),
    getLegalPageConfiguration(),
  ]);
  const destinations = resolvePublicInformationDestinations(configuration);
  const destination = destinations[definition.kind];
  if (destination.external) redirect(destination.href);

  const messages = getMessages(locale);
  const Content = definition.content[locale];

  return (
    <LegalPolicyPage
      contactEmail={configuration.legalContactEmail || null}
      description={messages[definition.descriptionKey]}
      effectiveDate={formatEffectiveDate(
        configuration.legalEffectiveDate,
        locale,
        messages["legal.notSpecified"],
      )}
      labels={{
        contact: messages["legal.contact"],
        effectiveDate: messages["legal.effectiveDate"],
        home: messages["legal.home"],
        operator: messages["legal.operator"],
        support: messages["legal.support"],
      }}
      operatorName={
        configuration.legalOperatorName || messages["legal.defaultOperator"]
      }
      title={messages[definition.titleKey]}
    >
      <Content />
    </LegalPolicyPage>
  );
}
