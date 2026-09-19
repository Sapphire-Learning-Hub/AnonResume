"use client";

import { useContext } from "react";

import { PublicRuntimeConfigContext } from "@/components/config/PublicRuntimeConfigProvider";

export function usePublicRuntimeConfig() {
  return useContext(PublicRuntimeConfigContext);
}
