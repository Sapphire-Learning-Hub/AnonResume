"use client";

import { createContext, type PropsWithChildren } from "react";

import type { ManagedConfigurationHealthState } from "@/lib/config/health";

export interface PublicRuntimeConfig {
  aiEnabled: boolean;
  configurationHealth: ManagedConfigurationHealthState;
  privacyPolicyUrl: string;
  sourceCodeUrl: string;
  supportUrl: string;
  termsOfServiceUrl: string;
}

export const DEFAULT_PUBLIC_RUNTIME_CONFIG: PublicRuntimeConfig = {
  aiEnabled: false,
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
  return (
    <PublicRuntimeConfigContext.Provider value={value}>
      {children}
    </PublicRuntimeConfigContext.Provider>
  );
}
