"use client";

import { createContext, type PropsWithChildren } from "react";

import type { ManagedConfigurationHealthState } from "@/lib/config/health";

export interface PublicRuntimeConfig {
  configurationHealth: ManagedConfigurationHealthState;
  sourceCodeUrl: string;
}

export const DEFAULT_PUBLIC_RUNTIME_CONFIG: PublicRuntimeConfig = {
  configurationHealth: "healthy",
  sourceCodeUrl: "",
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
