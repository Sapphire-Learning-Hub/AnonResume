"use client";
import { useClosingDialog } from "./useClosingDialog";
import { Fragment, useCallback, useState } from "react";
import { Button, Drawer, Empty, Spin, Tag } from "antd";
import { useI18n } from "@/i18n/I18nProvider";
import { ActionConfirmationModal } from "@/components/ui/ActionConfirmationModal";
import type { JobApplication, Opportunity } from "@/domain/job-search/schema";
import {
  fetchJobOpportunity,
  editJobOpportunity,
  removeJobOpportunity,
} from "@/lib/job-search/client";
import { useJobMutation, useJobResource } from "./useJobSearch";
import { OpportunityForm } from "./forms/OpportunityForm";
import { ReviewLinks } from "./ReviewLinks";
import { useJobSearchStyles } from "./styles";
import { ApplicationList } from "./ApplicationList";
import { useMemo } from "react";
export function OpportunityDetail({
  id,
  onClose,
  onChanged,
  onApplication,
  onNewApplication,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
  onApplication: (application: JobApplication) => void;
  onNewApplication: (opportunity: Opportunity) => void;
}) {
  const dialog = useClosingDialog(onClose);
  const { t } = useI18n();
  const { styles } = useJobSearchStyles();
  const mutation = useJobMutation();
  const state = useJobResource(
    useCallback((signal: AbortSignal) => fetchJobOpportunity(id, signal), [id]),
  );
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const query = useMemo(
    () => ({ opportunityId: id, archived: "all" as const }),
    [id],
  );
  const job = state.data;
  return (
    <Drawer
      open={dialog.open}
      afterOpenChange={(visible) => {
        if (!visible) dialog.afterClose();
      }}
      title={t("jobs.job")}
      width={620}
      onClose={() => dialog.close()}
      destroyOnHidden
    >
      {!job ? (
        state.failed ? (
          <Empty description={t("jobs.loadError")}>
            <Button onClick={state.reload}>{t("jobs.retry")}</Button>
          </Empty>
        ) : (
          <Spin />
        )
      ) : editing ? (
        <OpportunityForm
          initial={job}
          editing
          onCancel={() => setEditing(false)}
          onSave={async (fields, _, operationId) => {
            const next = await mutation.perform(
              () =>
                editJobOpportunity(id, {
                  ...fields,
                  operationId,
                  version: job.version,
                }),
              state.reload,
            );
            if (!next) return false;
            state.setData(next);
            setEditing(false);
            onChanged();
            return true;
          }}
        />
      ) : (
        <div className={styles.stack}>
          <div className={styles.toolbar}>
            <strong>{job.title}</strong>
            {job.archived ? <Tag>{t("jobs.archived")}</Tag> : null}
          </div>
          <dl className={styles.details}>
            {(
              [
                ["jobs.company", job.company],
                ["jobs.source", job.source],
                ["jobs.createdAt", new Date(job.createdAt).toLocaleString()],
              ] as const
            ).map(([key, value]) => (
              <Fragment key={key}>
                <dt className={styles.label}>{t(key)}</dt>
                <dd className={styles.value}>{value || "—"}</dd>
              </Fragment>
            ))}
          </dl>
          {job.url ? (
            <a href={job.url} target="_blank" rel="noopener noreferrer">
              {t("jobs.link")}
            </a>
          ) : null}
          <strong>{t("jobs.description")}</strong>
          <p className={styles.prose}>{job.description || "—"}</p>
          {job.notes ? (
            <>
              <strong>{t("jobs.notes")}</strong>
              <p className={styles.prose}>{job.notes}</p>
            </>
          ) : null}
          <div className={styles.actions}>
            <Button onClick={() => setEditing(true)}>{t("jobs.edit")}</Button>
            <Button
              loading={mutation.busy}
              onClick={() =>
                void mutation.perform(async () => {
                  const { title, company, description, url, source, notes } =
                    job;
                  const next = await editJobOpportunity(id, {
                    title,
                    company,
                    description,
                    url,
                    source,
                    notes,
                    operationId: crypto.randomUUID(),
                    version: job.version,
                    archived: !job.archived,
                  });
                  state.setData(next);
                  onChanged();
                }, state.reload)
              }
            >
              {t(job.archived ? "jobs.unarchive" : "jobs.archive")}
            </Button>
            <Button danger onClick={() => setDeleting(true)}>
              {t("jobs.delete")}
            </Button>
            <Button type="primary" onClick={() => onNewApplication(job)}>
              {t("jobs.newApplication")}
            </Button>
          </div>
          <strong>{t("jobs.jobApplications")}</strong>
          <ApplicationList query={query} onSelect={onApplication} />
          <ReviewLinks opportunityId={id} />
          <ActionConfirmationModal
            open={deleting}
            title={t("jobs.deleteJobTitle")}
            description={t("jobs.deleteJobBody", {
              count: job.applicationCount,
            })}
            confirmText={t("jobs.delete")}
            cancelText={t("jobs.cancel")}
            pending={mutation.busy}
            onCancel={() => setDeleting(false)}
            onConfirm={() =>
              void mutation.perform(async () => {
                await removeJobOpportunity(id, {
                  operationId: crypto.randomUUID(),
                  version: job.version,
                });
                onChanged();
                dialog.close();
              }, state.reload)
            }
          />
        </div>
      )}
    </Drawer>
  );
}
