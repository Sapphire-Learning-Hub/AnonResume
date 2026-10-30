"use client";
import { InlineMetadata } from "@/components/ui/InlineMetadata";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button, Empty, Spin, Tooltip } from "antd";
import {
  LeftOutlined,
  RightOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  AimOutlined,
} from "@ant-design/icons";
import type {
  JobApplication,
  JobSearchQuery,
} from "@/domain/job-search/schema";
import {
  applicationTimeline,
  timelineScale,
  milestoneViewport,
  timelineWindow,
} from "@/domain/job-search/timeline";
import {
  fetchGanttApplications,
  fetchStageMilestones,
} from "@/lib/job-search/client";
import { useI18n } from "@/i18n/I18nProvider";
import { useJobFeedback, useJobResource } from "./useJobSearch";
import { stageLabelKey, stageMilestoneName, stageCaptionWidth } from "./inputs";
import { useJobSearchStyles } from "./styles";
import { useApplicationGanttStyles } from "./ApplicationGantt.style";
import { ApplicationGanttMilestones } from "./ApplicationGanttMilestones";
export function ApplicationGantt({
  query,
  onSelect,
}: {
  query: Partial<JobSearchQuery>;
  onSelect: (application: JobApplication) => void;
}) {
  const { t, locale } = useI18n();
  const { styles } = useApplicationGanttStyles();
  const shared = useJobSearchStyles().styles;
  const feedback = useJobFeedback();
  const state = useJobResource(
    useCallback(
      (signal: AbortSignal) => fetchGanttApplications(query, signal),
      [query],
    ),
  );
  const [now, setNow] = useState(() => new Date());
  const [more, setMore] = useState(false);
  const lock = useRef(false);
  const stageLock = useRef(false);
  const [moreStages, setMoreStages] = useState<string>();
  const current = useRef(query);
  const viewport = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(760);
  const [manualWindow, setManualWindow] = useState<{
    query: Partial<JobSearchQuery>;
    start: number;
    end: number;
  }>();
  useEffect(() => {
    current.current = query;
  }, [query]);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const entries = useMemo(
    () =>
      state.data?.items.map((app) => ({
        app,
        range: applicationTimeline(app, now),
      })) ?? [],
    [state.data, now],
  );
  const milestoneRows = entries.map((entry) =>
    entry.app.milestones.items.map((stage) => {
      const time = Date.parse(stage.occurredAt);
      const labelWidth = stageCaptionWidth(stageMilestoneName(stage, t));
      return {
        time,
        labelWidth,
        before:
          time === entry.range.start
            ? 0
            : time === entry.range.end
              ? labelWidth
              : labelWidth / 2,
        after:
          time === entry.range.start
            ? labelWidth
            : time === entry.range.end
              ? 0
              : labelWidth / 2,
      };
    }),
  );
  const automatic = milestoneViewport(
    milestoneRows,
    trackWidth,
    timelineScale(
      entries.map((entry) => entry.range),
      now,
      milestoneRows.flatMap((row) => row.map((stage) => stage.time)),
    ),
  );
  const scale =
    manualWindow?.query === query
      ? timelineWindow(manualWindow.start, manualWindow.end)
      : automatic;
  const span = scale.end - scale.start;
  const navigationTimes = milestoneRows.flatMap((row) =>
    row.map((stage) => stage.time),
  );
  const earlier = navigationTimes
    .filter((time) => time < scale.start)
    .sort((a, b) => b - a)[0];
  const later = navigationTimes
    .filter((time) => time > scale.end)
    .sort((a, b) => a - b)[0];
  const hasEntries = Boolean(entries.length);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver((items) => {
      const size = items[0]?.contentRect.width;
      if (size) setTrackWidth(Math.max(760, size - 240));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasEntries, state.failed]);
  function focusTime(time: number, newSpan = span) {
    setManualWindow({
      query,
      start: time - newSpan / 2,
      end: time + newSpan / 2,
    });
  }
  const position = (value: number) =>
    ((value - scale.start) / (scale.end - scale.start)) * 100;
  const today = position(now.getTime());
  const date = (value: number) =>
    new Date(value).toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  if (state.loading && !state.data)
    return <Spin aria-label={t("jobs.loading")} />;
  if (state.failed)
    return (
      <Empty description={t("jobs.loadError")}>
        <Button onClick={state.reload}>{t("jobs.retry")}</Button>
      </Empty>
    );
  return (
    <div className={shared.stack}>
      <div className={shared.toolbar}>
        <span className={shared.muted}>
          {t("jobs.count", { count: state.data?.total ?? 0 })}
        </span>
        <div className={styles.timeControls}>
          <Tooltip title={t("jobs.earlierPeriod")}>
            <Button
              icon={<LeftOutlined />}
              aria-label={t("jobs.earlierPeriod")}
              disabled={earlier === undefined}
              onClick={() => {
                if (earlier !== undefined) focusTime(earlier);
              }}
            />
          </Tooltip>
          <Tooltip title={t("jobs.laterPeriod")}>
            <Button
              icon={<RightOutlined />}
              aria-label={t("jobs.laterPeriod")}
              disabled={later === undefined}
              onClick={() => {
                if (later !== undefined) focusTime(later);
              }}
            />
          </Tooltip>
          <Tooltip title={t("jobs.zoomIn")}>
            <Button
              icon={<ZoomInOutlined />}
              aria-label={t("jobs.zoomIn")}
              disabled={!hasEntries || span <= 1}
              onClick={() =>
                focusTime((scale.start + scale.end) / 2, Math.max(1, span / 2))
              }
            />
          </Tooltip>
          <Tooltip title={t("jobs.zoomOut")}>
            <Button
              icon={<ZoomOutOutlined />}
              aria-label={t("jobs.zoomOut")}
              disabled={!hasEntries || span >= automatic.end - automatic.start}
              onClick={() =>
                focusTime(
                  (scale.start + scale.end) / 2,
                  Math.min(automatic.end - automatic.start, span * 2),
                )
              }
            />
          </Tooltip>
          <Button
            icon={<AimOutlined />}
            disabled={!hasEntries}
            onClick={() => setManualWindow(undefined)}
          >
            {t("jobs.focusLatestStage")}
          </Button>
        </div>
      </div>
      {state.loading ? <Spin size="small" /> : null}
      {!entries.length ? (
        <Empty description={t("jobs.empty")} />
      ) : (
        <div
          ref={viewport}
          className={styles.scroll}
          tabIndex={0}
          role="region"
          aria-label={t("jobs.gantt")}
        >
          <div
            className={styles.table}
            style={{ minWidth: automatic.width + 240 }}
            role="table"
            aria-label={t("jobs.timelineRange")}
          >
            <div className={styles.header} role="row">
              <div className={styles.label} role="columnheader">
                {t("jobs.application")}
              </div>
              <div className={styles.axis} role="columnheader">
                {scale.ticks.map((tick, index) => (
                  <span
                    className={styles.axisTick}
                    key={tick}
                    data-edge={
                      index === 0 ? "start" : index === 5 ? "end" : undefined
                    }
                    style={{ left: `${(index / 5) * 100}%` }}
                  >
                    {span <= 172800000
                      ? new Date(tick).toLocaleString(locale, {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          ...(span <= 300000
                            ? { second: "2-digit" as const }
                            : {}),
                          ...(span <= 1000
                            ? { fractionalSecondDigits: 3 as const }
                            : {}),
                        })
                      : date(tick)}
                  </span>
                ))}
              </div>
            </div>
            {entries.map(({ app, range }) => {
              const stage = app.rejectedFromStage
                ? t("jobs.rejectedFrom", {
                    stage: t(stageLabelKey(app.rejectedFromStage)),
                  })
                : t(stageLabelKey(app.stage));
              const title = app.snapshot.company ? `${app.snapshot.title} (${app.snapshot.company})` : app.snapshot.title;
              const dates = `${date(range.start)} → ${range.ongoing ? t("jobs.today") : date(range.end)}`;
              return (
                <div className={styles.row} role="row" key={app.id}>
                  <div className={styles.label} role="cell">
                    <Button
                      type="link"
                      className={styles.title}
                      onClick={() => onSelect(app)}
                    >
                      <InlineMetadata stacked><span>{app.snapshot.title}</span>{app.snapshot.company ? <span className={styles.muted}>{app.snapshot.company}</span> : null}</InlineMetadata>
                    </Button>
                    <span className={styles.muted}>
                      <InlineMetadata><span>{stage}</span>{app.channel ? <span>{app.channel}</span> : null}</InlineMetadata>
                    </span>
                  </div>
                  <div className={styles.track} role="cell">
                    {today >= 0 && today <= 100 ? (
                      <span
                        className={styles.today}
                        style={{ left: `${today}%` }}
                        aria-hidden
                      />
                    ) : null}
                    <Tooltip
                      title={
                        <Fragment>
                          {title}
                          <br />
                          {stage}
                          <br />
                          {dates}
                        </Fragment>
                      }
                    >
                      <button
                        type="button"
                        className={styles.bar}
                        data-stage={app.stage}
                        style={{
                          left: `${Math.max(0, Math.min(100, position(range.start)))}%`,
                          width: `${Math.max(0, Math.min(100, position(range.end)) - Math.max(0, position(range.start)))}%`,
                          display:
                            range.end < scale.start || range.start > scale.end
                              ? "none"
                              : undefined,
                        }}
                        aria-label={`${title}, ${stage}, ${dates}`}
                        onClick={() => onSelect(app)}
                      >
                        {!app.milestones.items.length ? stage : null}
                      </button>
                    </Tooltip>
                    <ApplicationGanttMilestones
                      page={app.milestones}
                      range={range}
                      width={automatic.width}
                      status={app.stage}
                      scale={scale}
                      busy={moreStages === app.id}
                      onOpen={() => onSelect(app)}
                      onMore={async () => {
                        if (stageLock.current || !app.milestones.nextCursor)
                          return;
                        stageLock.current = true;
                        setMoreStages(app.id);
                        const captured = query;
                        try {
                          const next = await fetchStageMilestones(
                            app.id,
                            app.milestones.nextCursor,
                          );
                          if (current.current === captured)
                            state.setData((old) =>
                              old
                                ? {
                                    ...old,
                                    items: old.items.map((row) =>
                                      row.id === app.id &&
                                      row.version === app.version
                                        ? {
                                            ...row,
                                            milestones: {
                                              ...next,
                                              items: [
                                                ...row.milestones.items,
                                                ...next.items.filter(
                                                  (item) =>
                                                    !row.milestones.items.some(
                                                      (existing) =>
                                                        existing.id === item.id,
                                                    ),
                                                ),
                                              ],
                                            },
                                          }
                                        : row,
                                    ),
                                  }
                                : old,
                            );
                        } catch (error) {
                          feedback.error(error);
                        } finally {
                          stageLock.current = false;
                          setMoreStages(undefined);
                        }
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {state.data?.nextCursor ? (
        <Button
          loading={more}
          onClick={async () => {
            if (lock.current) return;
            lock.current = true;
            setMore(true);
            const captured = query;
            try {
              const next = await fetchGanttApplications({
                ...query,
                cursor: state.data!.nextCursor!,
              });
              if (current.current === captured)
                state.setData((old) =>
                  old
                    ? {
                        ...next,
                        items: [
                          ...old.items,
                          ...next.items.filter(
                            (row) =>
                              !old.items.some((item) => item.id === row.id),
                          ),
                        ],
                      }
                    : next,
                );
            } catch (error) {
              feedback.error(error);
            } finally {
              lock.current = false;
              setMore(false);
            }
          }}
        >
          {t("jobs.more")}
        </Button>
      ) : null}
    </div>
  );
}
