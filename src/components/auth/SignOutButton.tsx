"use client";

import { LogoutOutlined } from "@ant-design/icons";
import { Button } from "antd";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { useI18n } from "@/i18n/I18nProvider";
import { authClient } from "@/lib/auth/client";

export function SignOutButton({
  className,
  onActivate,
}: {
  className?: string;
  onActivate?: () => void;
} = {}) {
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();
  const { t } = useI18n();

  async function handleSignOut() {
    onActivate?.();
    setIsPending(true);

    try {
      await fetch("/api/manage/session", { method: "DELETE" }).catch(
        () => undefined,
      );
      await authClient.signOut();
      router.push("/sign-in");
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button
      className={className}
      icon={<LogoutOutlined aria-hidden="true" />}
      loading={isPending}
      onClick={handleSignOut}
      type="text"
    >
      {t("common.signOut")}
    </Button>
  );
}
