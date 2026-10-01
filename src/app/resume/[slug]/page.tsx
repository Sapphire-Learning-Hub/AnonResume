import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ResumeViewShell } from "@/components/resume/ResumeViewShell";
import { parsePublicResumeAppearance } from "@/domain/resume/public-appearance";
import { getRequestMessages } from "@/i18n/server";
import { getRuntimeConfig } from "@/lib/config/runtime";
import { getPdfExportQueueConfig } from "@/lib/pdf/export-queue";
import { getPublishedResumeBySlug } from "@/lib/resume/repository";

interface PublicResumePageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: PublicResumePageProps): Promise<Metadata> {
  const { slug } = await params;
  const resume = await getPublishedResumeBySlug(slug);

  if (!resume) {
    return {
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const canonicalPath = `/resume/${resume.slug}`;
  const shareImage = {
    url: "/opengraph-image",
    width: 1200,
    height: 630,
    alt: "AnonResume",
  };

  return {
    title: resume.title,
    description: resume.summary,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: "profile",
      title: resume.title,
      description: resume.summary,
      url: canonicalPath,
      locale: resume.document.meta.locale === "en-US" ? "en_US" : "zh_CN",
      images: [shareImage],
    },
    twitter: {
      card: "summary_large_image",
      title: resume.title,
      description: resume.summary,
      images: [shareImage],
    },
  };
}

export default async function PublicResumePage({
  params,
  searchParams,
}: PublicResumePageProps) {
  const { slug } = await params;
  const appearance = parsePublicResumeAppearance(
    searchParams ? await searchParams : {},
  );
  const messages = await getRequestMessages();
  const resume = await getPublishedResumeBySlug(slug);

  if (!resume) {
    notFound();
  }

  const runtime = await getRuntimeConfig("web");
  const allowAnonymousPdfExport = getPdfExportQueueConfig(
    runtime.values,
  ).allowAnonymous;

  return (
    <ResumeViewShell
      title={resume.title}
      appearance={appearance}
      downloadHref={
        allowAnonymousPdfExport
          ? `/resume/${resume.slug}/pdf`
          : undefined
      }
      downloadLabel={
        allowAnonymousPdfExport ? messages["common.downloadPdf"] : undefined
      }
      document={resume.document}
    />
  );
}
