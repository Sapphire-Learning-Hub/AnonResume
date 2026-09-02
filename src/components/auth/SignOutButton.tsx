"use client";

import { Button } from "antd";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/i18n/I18nProvider";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();
  const { t } = useI18n();

  async function handleSignOut() {
    setIsPending(true);

    try {
      await authClient.signOut();
      router.push("/sign-in");
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button onClick={handleSignOut} loading={isPending}>
      {t("common.signOut")}
    </Button>
  );
}
