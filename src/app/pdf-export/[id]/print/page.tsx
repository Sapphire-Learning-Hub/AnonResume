import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { ResumePrintShell } from "@/components/resume/ResumePrintShell";
import {
  getPdfExportDocumentForWorker,
  getPdfExportQueueConfig,
} from "@/lib/pdf/export-queue";
import { PDF_EXPORT_WORKER_COOKIE } from "@/lib/http/request-authorization";
import { getRuntimeConfig } from "@/lib/config/runtime";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function PdfExportPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const token = (await cookies()).get(PDF_EXPORT_WORKER_COOKIE)?.value;

  if (!token) {
    notFound();
  }

  const runtime = await getRuntimeConfig("web");
  const job = await getPdfExportDocumentForWorker(
    {
      jobId: id,
      workerToken: token,
    },
    getPdfExportQueueConfig(runtime.values),
  ).catch(() => null);

  if (!job) {
    notFound();
  }

  return (
    <ResumePrintShell
      eyebrow="AnonResume"
      title={job.filename.replace(/\.pdf$/i, "")}
      document={job.document}
    />
  );
}
