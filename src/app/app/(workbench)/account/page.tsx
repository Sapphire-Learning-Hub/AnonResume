import type { Metadata } from "next";

import { AccountCenter } from "@/components/account/AccountCenter";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Account | AnonResume",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  await requireSession();
  return <AccountCenter />;
}
