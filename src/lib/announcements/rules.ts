import type { AppLocale } from "@/i18n/messages";

export const MAX_ACTIVE_ANNOUNCEMENTS = 3;

export type AnnouncementAudience = "all" | "authenticated";
export type AnnouncementStatus = "draft" | "published" | "withdrawn";
export type AnnouncementTone = "info" | "warning" | "critical";

export interface AnnouncementRecord {
  id: string;
  titleZh: string;
  bodyZh: string;
  titleEn: string | null;
  bodyEn: string | null;
  tone: AnnouncementTone;
  audience: AnnouncementAudience;
  dismissible: boolean;
  status: AnnouncementStatus;
  publishedAt: Date | null;
  expiresAt: Date | null;
}

export interface LocalizedAnnouncement {
  id: string;
  title: string;
  body: string;
  tone: AnnouncementTone;
  dismissible: boolean;
}

export class AnnouncementActiveLimitError extends Error {
  constructor() {
    super(`At most ${MAX_ACTIVE_ANNOUNCEMENTS} announcements can be active`);
    this.name = "AnnouncementActiveLimitError";
  }
}

export class AnnouncementStateConflictError extends Error {
  constructor() {
    super("Announcement cannot be published in its current state");
    this.name = "AnnouncementStateConflictError";
  }
}

const tonePriority: Record<AnnouncementTone, number> = {
  critical: 2,
  warning: 1,
  info: 0,
};

export function assertAnnouncementCanPublish(
  announcement: AnnouncementRecord,
  input: { activeCount: number; now?: Date },
) {
  const now = input.now ?? new Date();
  if (
    !["draft", "withdrawn"].includes(announcement.status) ||
    (announcement.expiresAt !== null && announcement.expiresAt <= now)
  ) {
    throw new AnnouncementStateConflictError();
  }
  if (input.activeCount >= MAX_ACTIVE_ANNOUNCEMENTS) {
    throw new AnnouncementActiveLimitError();
  }
}

export function selectVisibleAnnouncements(
  announcements: readonly AnnouncementRecord[],
  input: { authenticated: boolean; now?: Date },
) {
  const now = input.now ?? new Date();

  return announcements
    .filter(
      (announcement) =>
        announcement.status === "published" &&
        announcement.publishedAt !== null &&
        (!announcement.expiresAt || announcement.expiresAt > now) &&
        (announcement.audience === "all" || input.authenticated),
    )
    .sort((left, right) => {
      const toneDifference = tonePriority[right.tone] - tonePriority[left.tone];
      if (toneDifference !== 0) return toneDifference;
      return right.publishedAt!.getTime() - left.publishedAt!.getTime();
    })
    .slice(0, MAX_ACTIVE_ANNOUNCEMENTS);
}

export function localizeAnnouncement(
  announcement: AnnouncementRecord,
  locale: AppLocale,
): LocalizedAnnouncement {
  const hasCompleteEnglishCopy = Boolean(
    announcement.titleEn?.trim() && announcement.bodyEn?.trim(),
  );
  const useEnglish = locale === "en-US" && hasCompleteEnglishCopy;

  return {
    id: announcement.id,
    title: useEnglish ? announcement.titleEn! : announcement.titleZh,
    body: useEnglish ? announcement.bodyEn! : announcement.bodyZh,
    tone: announcement.tone,
    dismissible: announcement.dismissible,
  };
}
