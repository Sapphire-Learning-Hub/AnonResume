import { randomUUID } from "node:crypto";

import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import type { ResumeDocument } from "@/domain/resume/schema";
import { defaultLocale, getMessages, type AppLocale } from "@/i18n/messages";

export interface ResumeCatalogEntry {
  id: string;
  title: string;
  summary: string;
  version: number;
  updatedAt: number;
  published: boolean;
  slug?: string;
}

export interface ResumeRecord extends ResumeCatalogEntry {
  userId: string;
  customSummary?: string;
  document: ResumeDocument;
  slug?: string;
}

function formatTitleFromResumeId(resumeId: string) {
  const generatedResumeId = /^resume-(\d{8})-(\d{6})(?:-[0-9a-f-]{36})?$/i.exec(
    resumeId,
  );

  if (generatedResumeId) {
    return `${generatedResumeId[1]} ${generatedResumeId[2]}`;
  }

  return resumeId
    .replace(/^resume-/, "")
    .split("-")
    .filter(Boolean)
    .map((segment) => segment[0]!.toUpperCase() + segment.slice(1))
    .join(" ")
    .trim();
}

export function createLocalResumeRecord(
  userId: string,
  resumeId: string,
  locale: AppLocale = defaultLocale,
): ResumeRecord {
  const messages = getMessages(locale);
  const document = createDefaultResumeDocument(locale);
  const derivedTitle = formatTitleFromResumeId(resumeId) || messages["catalog.untitledResume"];

  document.meta.title = derivedTitle;

  return {
    id: resumeId,
    userId,
    title: derivedTitle,
    summary: messages["catalog.localDraftSummary"],
    document,
    version: 1,
    updatedAt: Date.now(),
    published: false,
  };
}

export function createResumeId(now = new Date()) {
  const compactDate = now.toISOString().slice(0, 10).replaceAll("-", "");
  const compactTime = now.toISOString().slice(11, 19).replaceAll(":", "");

  return `resume-${compactDate}-${compactTime}-${randomUUID()}`;
}
