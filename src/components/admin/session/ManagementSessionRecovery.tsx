"use client";

import { useEffect } from "react";
import { subscribeManagementExpiry } from "@/lib/admin/client/request";

export function ManagementSessionRecovery() {
  useEffect(() => subscribeManagementExpiry(() => {
    // A full navigation clears stale privileged layouts and in-flight UI state.
    window.location.replace("/sign-in");
  }),[]);
  return null;
}
