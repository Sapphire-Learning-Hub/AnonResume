"use client";
import { useClosingDialog } from "./useClosingDialog";
import { useCallback, useState } from "react";
import { Button, Drawer, Empty, Modal, Select, Spin, Tag } from "antd";
import { AppRouteLink } from "@/components/ui/AppRouteLoading";
import { ActionConfirmationModal } from "@/components/ui/ActionConfirmationModal";
import { useI18n } from "@/i18n/I18nProvider";
import {
  applicationStages,
  type ApplicationStage,
  type ApplicationEvent,
} from "@/domain/job-search/schema";
import {
  fetchJobApplication,
  fetchApplicationEvents,
  fetchJobOpportunity,
  editJobApplication,
  moveJobApplication,
  syncJobApplication,
  removeJobApplication,
  saveApplicationFollowup,
  editApplicationFollowup,
  removeApplicationFollowup,
} from "@/lib/job-search/client";
import { useJobFeedback, useJobMutation, useJobResource } from "./useJobSearch";
import { StageChangeDialog } from "./forms/StageChangeDialog";
import { ApplicationForm } from "./forms/ApplicationForm";
import { FollowupForm } from "./forms/FollowupForm";
import { ReviewLinks } from "./ReviewLinks";
import { eventLabelKey, stageLabelKey } from "./inputs";
import { useJobSearchStyles } from "./styles";
export function ApplicationDetail({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const dialog = useClosingDialog(onClose);
  const { t, locale } = useI18n();
  const { styles } = useJobSearchStyles();
  const feedback = useJobFeedback();
  const mutation = useJobMutation();
  const state = useJobResource(
    useCallback((signal: AbortSignal) => fetchJobApplication(id, signal), [id]),
  );
  const timeline = useJobResource(
    useCallback(
      (signal: AbortSignal) => fetchApplicationEvents(id, undefined, signal),
      [id],
    ),
  );
  const [editing, setEditing] = useState(false);
  const [stage, setStage] = useState<ApplicationStage>();
  const [followup, setFollowup] = useState<ApplicationEvent | "new">();
  const [deleting, setDeleting] = useState(false);
  const [deleteEvent, setDeleteEvent] = useState<ApplicationEvent>();
  const [loadingMore, setLoadingMore] = useState(false);
  const app = state.data;
  function changed() {
    timeline.reload();
    onChanged();
  }
  return (
    <Drawer
      open={dialog.open}
      afterOpenChange={(visible) => {
        if (!visible) dialog.afterClose();
      }}
      title={t("jobs.application")}
      width={680}
      onClose={() => dialog.close()}
      destroyOnHidden
    >
      {!app ? (
        state.failed ? (
          <Empty description={t("jobs.loadError")}>
            <Button onClick={state.reload}>{t("jobs.retry")}</Button>
          </Empty>
        ) : (
          <Spin />
        )
      ) : editing ? (
        <ApplicationForm
          initial={app}
          onCancel={() => setEditing(false)}
          onSave={async (input) => {
            const next = await mutation.perform(
              () =>
                editJobApplication(id, {
                  channel: input.channel,
                  notes: input.notes,
                  resumeId: input.resumeId,
                  operationId: input.operationId,
                  version: app.version,
                }),
              state.reload,
            );
            if (!next) return false;
            state.setData(next);
            setEditing(false);
            changed();
            return true;
          }}
        />
      ) : (
        <div className={styles.stack}>
          <div className={styles.toolbar}>
            <strong>
              {app.snapshot.company ? `${app.snapshot.company} · ` : ""}
              {app.snapshot.title}
            </strong>
            {app.archived ? <Tag>{t("jobs.archived")}</Tag> : null}
          </div>
          {!app.opportunityId ? (
            <span className={styles.muted}>{t("jobs.jobDeleted")}</span>
          ) : null}
          <label className={styles.stack}>
            <span>{t("jobs.stage")}</span>
            <Select
              className={styles.stage}
              aria-label={t("jobs.stage")}
              value={app.stage}
              options={applicationStages.map((value) => ({
                value,
                label: t(stageLabelKey(value)),
              }))}
              onChange={setStage}
            />
          </label>
          <dl className={styles.details}>
            <dt className={styles.label}>{t("jobs.channel")}</dt>
            <dd className={styles.value}>{app.channel || "—"}</dd>
            <dt className={styles.label}>{t("jobs.appliedAt")}</dt>
            <dd className={styles.value}>
              {app.appliedAt
                ? new Date(app.appliedAt).toLocaleString(locale)
                : t("jobs.noDate")}
            </dd>
            <dt className={styles.label}>{t("jobs.resume")}</dt>
            <dd className={styles.value}>
              {app.resumeAvailable && app.resumeId ? (
                <AppRouteLink
                  href={`/app/resumes/${encodeURIComponent(app.resumeId)}`}
                  type="link"
                >
                  {app.resumeName}
                </AppRouteLink>
              ) : (
                t(app.resumeId ? "jobs.resumeUnavailable" : "jobs.noResume")
              )}
            </dd>
          </dl>
          {app.rejectedFromStage ? (
            <div>
              <strong>{t("jobs.failedAt")} · </strong>
              {t(stageLabelKey(app.rejectedFromStage))}
            </div>
          ) : null}
          <strong>{t("jobs.description")}</strong>
          <p className={styles.prose}>{app.snapshot.description || "—"}</p>
          {app.snapshot.url ? (
            <a
              href={app.snapshot.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("jobs.link")}
            </a>
          ) : null}
          {app.notes ? (
            <>
              <strong>{t("jobs.notes")}</strong>
              <p className={styles.prose}>{app.notes}</p>
            </>
          ) : null}
          <div className={styles.actions}>
            <Button onClick={() => setEditing(true)}>{t("jobs.edit")}</Button>
            {app.stage === "pending" && app.opportunityId ? (
              <Button
                loading={mutation.busy}
                onClick={() =>
                  void mutation.perform(async () => {
                    const job = await fetchJobOpportunity(app.opportunityId!);
                    const next = await syncJobApplication(id, {
                      operationId: crypto.randomUUID(),
                      version: app.version,
                      opportunityVersion: job.version,
                    });
                    state.setData(next);
                    changed();
                  }, state.reload)
                }
              >
                {t("jobs.sync")}
              </Button>
            ) : null}
            <Button
              loading={mutation.busy}
              onClick={() =>
                void mutation.perform(async () => {
                  const next = await editJobApplication(id, {
                    operationId: crypto.randomUUID(),
                    version: app.version,
                    resumeId: app.resumeId,
                    notes: app.notes,
                    channel: app.channel,
                    archived: !app.archived,
                  });
                  state.setData(next);
                  changed();
                }, state.reload)
              }
            >
              {t(app.archived ? "jobs.unarchive" : "jobs.archive")}
            </Button>
            <Button danger onClick={() => setDeleting(true)}>
              {t("jobs.delete")}
            </Button>
          </div>
          <div className={styles.toolbar}>
            <strong>{t("jobs.timeline")}</strong>
            <Button onClick={() => setFollowup("new")}>
              {t("jobs.addFollowup")}
            </Button>
          </div>
          {timeline.loading && !timeline.data ? (
            <Spin />
          ) : timeline.failed ? (
            <Empty description={t("jobs.loadError")}>
              <Button onClick={timeline.reload}>{t("jobs.retry")}</Button>
            </Empty>
          ) : (
            timeline.data?.items.map((event) => (
              <article className={styles.note} key={event.id}>
                <strong>
                  {t(eventLabelKey(event.kind))}
                  {event.fromStage && event.toStage
                    ? ` · ${t(stageLabelKey(event.fromStage))} → ${t(stageLabelKey(event.toStage))}`
                    : ""}
                </strong>
                <time className={styles.muted}>
                  {new Date(event.occurredAt).toLocaleString(locale)}
                </time>
                {event.body ? (
                  <p className={styles.prose}>
                    {event.kind === "stage_changed"
                      ? t("jobs.previousAppliedAt", {
                          date: new Date(event.body).toLocaleString(locale),
                        })
                      : event.body}
                  </p>
                ) : null}
                {event.kind === "followup" ? (
                  <div className={styles.actions}>
                    <Button size="small" onClick={() => setFollowup(event)}>
                      {t("jobs.edit")}
                    </Button>
                    <Button
                      size="small"
                      danger
                      onClick={() => setDeleteEvent(event)}
                    >
                      {t("jobs.delete")}
                    </Button>
                  </div>
                ) : null}
              </article>
            ))
          )}
          {timeline.data?.nextCursor ? (
            <Button
              loading={loadingMore}
              onClick={async () => {
                if (loadingMore) return;
                setLoadingMore(true);
                try {
                  const next = await fetchApplicationEvents(
                    id,
                    timeline.data!.nextCursor!,
                  );
                  timeline.setData((old) =>
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
                  setLoadingMore(false);
                }
              }}
            >
              {t("jobs.more")}
            </Button>
          ) : null}
          {app.opportunityId ? (
            <ReviewLinks opportunityId={app.opportunityId} applicationId={id} />
          ) : null}
          {stage ? (
            <StageChangeDialog
              key={`${app.id}:${stage}`}
              open
              application={app}
              target={stage}
              onCancel={() => setStage(undefined)}
              onSave={async (input) => {
                const next = await mutation.perform(
                  () => moveJobApplication(id, input),
                  state.reload,
                );
                if (!next) return false;
                state.setData(next);
                changed();
                return true;
              }}
            />
          ) : null}
          <Modal
            open={Boolean(followup)}
            title={t(
              followup === "new" ? "jobs.addFollowup" : "jobs.followupEdit",
            )}
            footer={null}
            destroyOnHidden
            onCancel={() => setFollowup(undefined)}
          >
            {followup ? (
              <FollowupForm
                key={followup === "new" ? "new" : followup.id}
                initial={followup === "new" ? undefined : followup}
                onCancel={() => setFollowup(undefined)}
                onSave={async (input) => {
                  const next = await mutation.perform(
                    () =>
                      followup === "new"
                        ? saveApplicationFollowup(id, {
                            ...input,
                            version: app.version,
                          })
                        : editApplicationFollowup(id, followup.id, {
                            ...input,
                            version: app.version,
                            eventVersion: followup.version,
                          }),
                    state.reload,
                  );
                  if (!next) return false;
                  state.setData(next);
                  setFollowup(undefined);
                  changed();
                  return true;
                }}
              />
            ) : null}
          </Modal>
          <ActionConfirmationModal
            open={deleting}
            title={t("jobs.deleteApplicationTitle")}
            description={t("jobs.deleteApplicationBody")}
            confirmText={t("jobs.delete")}
            cancelText={t("jobs.cancel")}
            pending={mutation.busy}
            onCancel={() => setDeleting(false)}
            onConfirm={() =>
              void mutation.perform(async () => {
                await removeJobApplication(id, {
                  operationId: crypto.randomUUID(),
                  version: app.version,
                });
                onChanged();
                dialog.close();
              }, state.reload)
            }
          />
          <ActionConfirmationModal
            open={Boolean(deleteEvent)}
            title={t("jobs.deleteFollowup")}
            description={deleteEvent?.body}
            confirmText={t("jobs.delete")}
            cancelText={t("jobs.cancel")}
            pending={mutation.busy}
            onCancel={() => setDeleteEvent(undefined)}
            onConfirm={() =>
              void mutation.perform(async () => {
                if (!deleteEvent) return;
                const next = await removeApplicationFollowup(
                  id,
                  deleteEvent.id,
                  {
                    operationId: crypto.randomUUID(),
                    version: app.version,
                    eventVersion: deleteEvent.version,
                  },
                );
                state.setData(next);
                setDeleteEvent(undefined);
                changed();
              }, state.reload)
            }
          />
        </div>
      )}
    </Drawer>
  );
}
