"use client";
import { Tooltip, Button } from "antd";
import type {
  ApplicationStage,
  StageMilestonePage,
} from "@/domain/job-search/schema";
import { useI18n } from "@/i18n/I18nProvider";
import { fitTimelineLabel } from "@/domain/job-search/timeline";
import { stageMilestoneName, stageCaptionWidth } from "./inputs";
import { useApplicationGanttStyles } from "./ApplicationGantt.style";
export function ApplicationGanttMilestones({
  page,
  scale,
  range,
  width,
  status,
  busy,
  onMore,
  onOpen,
}: {
  page: StageMilestonePage;
  scale: { start: number; end: number };
  range: { start: number; end: number };
  width: number;
  status: ApplicationStage;
  busy: boolean;
  onMore: () => void;
  onOpen: () => void;
}) {
  const { t, locale } = useI18n();
  const { styles } = useApplicationGanttStyles();
  const items = [...page.items]
    .filter(
      (item) =>
        Date.parse(item.occurredAt) >= scale.start &&
        Date.parse(item.occurredAt) <= scale.end,
    )
    .sort(
      (a, b) =>
        Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
        Date.parse(a.recordedAt) - Date.parse(b.recordedAt) ||
        a.id.localeCompare(b.id),
    );
  return (
    <div
      className={styles.milestoneLayer}
      role="list"
      aria-label={t("jobs.stageHistory")}
    >
      {items.map((stage) => {
        const label = stageMilestoneName(stage, t),
          date = new Date(stage.occurredAt).toLocaleString(locale);
        const position =
          ((Date.parse(stage.occurredAt) - scale.start) /
            (scale.end - scale.start)) *
          100;
        const pixel = (position / 100) * width;
        const barStart = Math.max(
          0,
          Math.min(
            width,
            ((range.start - scale.start) / (scale.end - scale.start)) * width,
          ),
        );
        const barEnd = Math.min(
          width,
          Math.max(
            barStart + 10,
            ((range.end - scale.start) / (scale.end - scale.start)) * width,
          ),
        );
        const layout = fitTimelineLabel(pixel, stageCaptionWidth(label), {
          start: pixel < barStart || pixel > barEnd ? 0 : barStart,
          end: pixel < barStart || pixel > barEnd ? width : barEnd,
        });
        return (
          <div
            className={styles.milestonePoint}
            key={stage.id}
            role="listitem"
            style={{ left: `${position}%` }}
          >
            <Tooltip
              title={
                <>
                  <strong>{label}</strong>
                  <br />
                  {date}
                </>
              }
            >
              <button
                type="button"
                className={styles.milestoneName}
                style={{ left: layout.offset, width: layout.width }}
                data-status={status}
                aria-label={t("jobs.stageAt", { stage: label, date })}
                onClick={onOpen}
              >
                {label}
              </button>
            </Tooltip>
          </div>
        );
      })}
      {page.nextCursor ? (
        <Button
          className={styles.olderMilestones}
          size="small"
          loading={busy}
          onClick={onMore}
        >
          {t("jobs.olderStages", {
            loaded: page.items.length,
            total: page.total,
          })}
        </Button>
      ) : null}
    </div>
  );
}
