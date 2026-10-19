"use client";

import { createContext, useEffect, type PropsWithChildren } from "react";
import { configureBrowserDiagnostics } from "@/lib/observability/browser/client";

import type { ManagedConfigurationHealthState } from "@/lib/config/health";

export interface PublicRuntimeConfig {
  aiEnabled: boolean;
  clientErrorsEnabled?: boolean;
  configurationHealth: ManagedConfigurationHealthState;
  privacyPolicyUrl: string;
  sourceCodeUrl: string;
  supportUrl: string;
  termsOfServiceUrl: string;
}

export const DEFAULT_PUBLIC_RUNTIME_CONFIG: PublicRuntimeConfig = {
  aiEnabled: false,
  clientErrorsEnabled: false,
  configurationHealth: "healthy",
  privacyPolicyUrl: "",
  sourceCodeUrl: "",
  supportUrl: "",
  termsOfServiceUrl: "",
};

export const PublicRuntimeConfigContext = createContext<PublicRuntimeConfig>(
  DEFAULT_PUBLIC_RUNTIME_CONFIG,
);

export function PublicRuntimeConfigProvider({
  children,
  value,
}: PropsWithChildren<{ value: PublicRuntimeConfig }>) {
  useEffect(() => { configureBrowserDiagnostics(value.clientErrorsEnabled ?? false); }, [value.clientErrorsEnabled]);
  return (
    <PublicRuntimeConfigContext.Provider value={value}>
      {children}
    </PublicRuntimeConfigContext.Provider>
  );
}
