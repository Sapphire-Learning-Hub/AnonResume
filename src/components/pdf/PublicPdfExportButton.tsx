"use client";

import { Button } from "antd";
import { useState } from "react";

import { startPublicResumePdfExport } from "@/lib/pdf/export-client";

export function PublicPdfExportButton({
  label,
  slug,
}: {
  label: string;
  slug: string;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <Button
      className="resume-view-action"
      loading={busy}
      onClick={async () => {
        setBusy(true);

        try {
          await startPublicResumePdfExport(slug);
        } finally {
          setBusy(false);
        }
      }}
      type="link"
    >
      {label}
    </Button>
  );
}
