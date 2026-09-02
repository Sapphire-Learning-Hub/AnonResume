import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ResumePrintShell } from "@/components/resume/ResumePrintShell";
import { getRequestMessages } from "@/i18n/server";
import { getPublishedResumeBySlug } from "@/lib/resume-repository";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function PublicResumePrintPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const messages = await getRequestMessages();
  const resume = await getPublishedResumeBySlug(slug);

  if (!resume) {
    notFound();
  }

  return (
    <ResumePrintShell
      eyebrow={messages["print.eyebrow"]}
      title={resume.title}
      document={resume.document}
    />
  );
}
