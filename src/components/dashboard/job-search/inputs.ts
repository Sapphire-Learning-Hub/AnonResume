import type { useI18n } from "@/i18n/I18nProvider";
import type { StageMilestone } from "@/domain/job-search/schema";
import type {
  ApplicationStage,
  ApplicationEventKind,
} from "@/domain/job-search/schema";
export const stageLabelKey = (stage: ApplicationStage) =>
  `jobs.stage.${stage}` as const;
export const eventLabelKey = (kind: ApplicationEventKind) =>
  `jobs.event.${kind}` as const;
export function localDateInput(value: string | Date = new Date()) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function fromLocalDateInput(value: string) {
  const time = new Date(value);
  return Number.isFinite(time.getTime()) ? time.toISOString() : undefined;
}

export function stageMilestoneName(
  stage: StageMilestone,
  t: ReturnType<typeof useI18n>["t"],
) {
  return stage.stage === "rejected" && stage.fromStage
    ? t("jobs.rejectedFrom", { stage: t(stageLabelKey(stage.fromStage)) })
    : t(stageLabelKey(stage.stage));
}
export function stageCaptionWidth(label: string) {
  return Math.min(
    180,
    Array.from(label).reduce(
      (size, char) => size + ((char.codePointAt(0) ?? 0) > 255 ? 12 : 7),
      16,
    ),
  );
}
