import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Metadata } from "next";

import { LegalDocumentPage } from "@/components/legal/LegalDocumentPage";

export const metadata: Metadata = {
  title: "Brand Notice | AnonResume",
};

export default async function BrandNoticePage() {
  const content = await readFile(join(process.cwd(), "BRAND-NOTICE.md"), "utf8");

  return (
    <LegalDocumentPage
      content={content}
      description="The brand identity is declared separately from the open-source project code."
      title="品牌声明 / Brand notice"
    />
  );
}
