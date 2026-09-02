import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ResumeViewShell } from "@/components/resume/ResumeViewShell";
import { getRequestMessages } from "@/i18n/server";
import { getPublishedResumeBySlug } from "@/lib/resume-repository";

interface PublicResumePageProps {
  params: Promise<{ slug: string }>;
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
}: PublicResumePageProps) {
  const { slug } = await params;
  const messages = await getRequestMessages();
  const resume = await getPublishedResumeBySlug(slug);

  if (!resume) {
    notFound();
  }

  return (
    <ResumeViewShell
      eyebrow={messages["view.publicEyebrow"]}
      title={resume.title}
      description={messages["view.publicDescription"]}
      downloadHref={`/resume/${resume.slug}/pdf`}
      downloadLabel={messages["common.downloadPdf"]}
      document={resume.document}
    />
  );
}
