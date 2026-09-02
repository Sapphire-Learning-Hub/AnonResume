import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Metadata } from "next";

import { LegalDocumentPage } from "@/components/legal/LegalDocumentPage";

export const metadata: Metadata = {
  title: "License | AnonResume",
};

export default async function LicensePage() {
  const content = await readFile(join(process.cwd(), "LICENSE"), "utf8");

  return (
    <LegalDocumentPage
      content={content}
      description="AnonResume source code is distributed under the GNU Affero General Public License, version 3 or later."
      title="许可证 / License"
    />
  );
}
