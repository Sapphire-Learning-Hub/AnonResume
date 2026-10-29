"use client";
import type { ReactNode } from "react";
import { useCallback, useRef, useState, useEffect } from "react";
import { Button, Empty, Select, Spin } from "antd";
import { HolderOutlined } from "@ant-design/icons";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  applicationStages,
  stageSchema,
  type ApplicationStage,
  type JobApplication,
  type JobSearchQuery,
} from "@/domain/job-search/schema";
import {
  fetchJobBoard,
  fetchJobApplications,
  moveJobApplication,
} from "@/lib/job-search/client";
import { useI18n } from "@/i18n/I18nProvider";
import { useJobResource, useJobMutation, useJobFeedback } from "./useJobSearch";
import { StageChangeDialog } from "./forms/StageChangeDialog";
import { useJobSearchStyles } from "./styles";
import { stageLabelKey } from "./inputs";
function ApplicationCard({
  app,
  onSelect,
  onStage,
}: {
  app: JobApplication;
  onSelect: (app: JobApplication) => void;
  onStage: (app: JobApplication, stage: ApplicationStage) => void;
}) {
  const { t, locale } = useI18n();
  const { styles } = useJobSearchStyles();
  const { setNodeRef, isDragging, attributes, listeners } = useDraggable({
    id: app.id,
  });
  return (
    <article
      ref={setNodeRef}
      className={styles.card}
      data-dragging={isDragging}
    >
      <div className={styles.cardTop}>
        <Button
          type="link"
          className={styles.cardTitle}
          onClick={() => onSelect(app)}
        >
          {app.snapshot.title}
        </Button>
        <Button
          className={styles.drag}
          size="small"
          type="text"
          icon={<HolderOutlined />}
          aria-label={`${t("jobs.stageDialog")} ${app.snapshot.title}`}
          {...attributes}
          {...listeners}
        />
      </div>
      <span>{app.snapshot.company || "—"}</span>
      {app.rejectedFromStage ? (
        <span className={styles.muted}>
          {t("jobs.rejectedFrom", {
            stage: t(stageLabelKey(app.rejectedFromStage)),
          })}
        </span>
      ) : null}
      <span className={styles.muted}>
        {app.appliedAt
          ? new Date(app.appliedAt).toLocaleDateString(locale)
          : t("jobs.noDate")}
        {app.channel ? ` · ${app.channel}` : ""}
      </span>
      <span className={styles.muted}>
        {t("jobs.activityAt")} ·{" "}
        {new Date(app.activityAt).toLocaleString(locale)}
      </span>
      <Select
        size="small"
        aria-label={`${t("jobs.stage")} ${app.snapshot.title}`}
        value={app.stage}
        options={applicationStages.map((value) => ({
          value,
          label: t(stageLabelKey(value)),
        }))}
        onChange={(value) => onStage(app, value)}
      />
    </article>
  );
}
function Column({
  stage,
  total,
  children,
}: {
  stage: ApplicationStage;
  total: number;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const { styles } = useJobSearchStyles();
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <section
      ref={setNodeRef}
      className={styles.column}
      data-over={isOver}
      aria-label={t(stageLabelKey(stage))}
    >
      <div className={styles.columnHeader}>
        <span>{t(stageLabelKey(stage))}</span>
        <span>{total}</span>
      </div>
      {children}
    </section>
  );
}
export function ApplicationBoard({
  query,
  onSelect,
}: {
  query: Partial<JobSearchQuery>;
  onSelect: (app: JobApplication) => void;
}) {
  const { t } = useI18n();
  const { styles } = useJobSearchStyles();
  const feedback = useJobFeedback();
  const mutation = useJobMutation();
  const state = useJobResource(
    useCallback((signal: AbortSignal) => fetchJobBoard(query, signal), [query]),
  );
  const [change, setChange] = useState<{
    app: JobApplication;
    stage: ApplicationStage;
  }>();
  const [more, setMore] = useState<ApplicationStage>();
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);
  const moreLock = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  function choose(app: JobApplication, stage: ApplicationStage) {
    if (stage !== app.stage && !mutation.busy) setChange({ app, stage });
  }
  function drop(event: DragEndEvent) {
    const stage = stageSchema.safeParse(event.over?.id);
    if (!stage.success) return;
    const app = Object.values(state.data ?? {})
      .flatMap((column) => column.items)
      .find((item) => item.id === event.active.id);
    if (app) choose(app, stage.data);
  }
  if (state.loading && !state.data)
    return <Spin aria-label={t("jobs.loading")} />;
  if (state.failed)
    return (
      <Empty description={t("jobs.loadError")}>
        <Button onClick={state.reload}>{t("jobs.retry")}</Button>
      </Empty>
    );
  return (
    <>
      {state.loading ? (
        <Spin size="small" aria-label={t("jobs.loading")} />
      ) : null}
      <DndContext sensors={sensors} onDragEnd={drop}>
        <div className={styles.board}>
          {applicationStages.map((stage) => (
            <Column
              key={stage}
              stage={stage}
              total={state.data?.[stage].total ?? 0}
            >
              {state.data?.[stage].items.map((app) => (
                <ApplicationCard
                  key={app.id}
                  app={app}
                  onSelect={onSelect}
                  onStage={choose}
                />
              ))}
              {state.data?.[stage].nextCursor ? (
                <Button
                  loading={more === stage}
                  onClick={async () => {
                    if (moreLock.current) return;
                    moreLock.current = true;
                    setMore(stage);
                    const current = query;
                    try {
                      const next = await fetchJobApplications({
                        ...query,
                        stage,
                        cursor: state.data![stage].nextCursor!,
                      });
                      if (queryRef.current === current)
                        state.setData((old) =>
                          old
                            ? {
                                ...old,
                                [stage]: {
                                  ...next,
                                  items: [
                                    ...old[stage].items,
                                    ...next.items.filter(
                                      (app) =>
                                        !old[stage].items.some(
                                          (item) => item.id === app.id,
                                        ),
                                    ),
                                  ],
                                },
                              }
                            : old,
                        );
                    } catch (error) {
                      feedback.error(error);
                    } finally {
                      moreLock.current = false;
                      setMore(undefined);
                    }
                  }}
                >
                  {t("jobs.more")}
                </Button>
              ) : null}
            </Column>
          ))}
        </div>
      </DndContext>
      {change ? (
        <StageChangeDialog
          key={`${change.app.id}:${change.stage}`}
          open
          application={change.app}
          target={change.stage}
          onCancel={() => setChange(undefined)}
          onSave={async (input) =>
            Boolean(
              await mutation.perform(async () => {
                await moveJobApplication(change.app.id, input);
                state.reload();
                return true;
              }, state.reload),
            )
          }
        />
      ) : null}
    </>
  );
}
