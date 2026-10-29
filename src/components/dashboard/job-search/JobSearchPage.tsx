"use client";
import { useMemo, useState } from "react";
import { Button, Input, Modal, Segmented, Select } from "antd";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useI18n } from "@/i18n/I18nProvider";
import {
  applicationStages,
  type ApplicationStage,
  type JobApplication,
  type JobSearchQuery,
  type Opportunity,
} from "@/domain/job-search/schema";
import {
  saveJobOpportunity,
  saveJobApplication,
} from "@/lib/job-search/client";
import { useJobMutation } from "./useJobSearch";
import { OpportunityLibrary } from "./OpportunityLibrary";
import { OpportunityDetail } from "./OpportunityDetail";
import { ApplicationDetail } from "./ApplicationDetail";
import { JobPicker } from "./JobPicker";
import { OpportunityForm } from "./forms/OpportunityForm";
import { ApplicationForm } from "./forms/ApplicationForm";
import { ApplicationBoard } from "./ApplicationBoard";
import { ApplicationGantt } from "./ApplicationGantt";
import { ApplicationList } from "./ApplicationList";
import { useJobSearchStyles } from "./styles";
import { stageLabelKey } from "./inputs";
export function JobSearchPage({
  initialOpportunityId,
}: {
  initialOpportunityId?: string;
}) {
  const { t } = useI18n();
  const { styles } = useJobSearchStyles();
  const mutation = useJobMutation();
  const [section, setSection] = useState<"board" | "library">("board");
  const [view, setView] = useState<"gantt" | "board" | "list">("gantt");
  const [search, setSearch] = useState("");
  const [archived, setArchived] =
    useState<JobSearchQuery["archived"]>("active");
  const [jobFilter, setJobFilter] = useState<Opportunity>();
  const [stageFilter, setStageFilter] = useState<ApplicationStage>();
  const [revision, setRevision] = useState(0);
  const [jobId, setJobId] = useState(initialOpportunityId);
  const [applicationId, setApplicationId] = useState<string>();
  const [newJob, setNewJob] = useState(false);
  const [newApplication, setNewApplication] = useState<{ job?: Opportunity }>();
  const query = useMemo(
    () => ({
      q: search,
      archived,
      ...(section === "board" && jobFilter
        ? { opportunityId: jobFilter.id }
        : {}),
      ...(section === "board" && view !== "board" && stageFilter
        ? { stage: stageFilter }
        : {}),
    }),
    [search, archived, section, jobFilter, view, stageFilter],
  );
  const changed = () => setRevision((value) => value + 1);
  const selectApp = (app: JobApplication) => {
    setJobId(undefined);
    setApplicationId(app.id);
  };
  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <h1 className={styles.heading}>{t("jobs.title")}</h1>
      </div>
      <Segmented
        value={section}
        options={[
          { value: "board", label: t("jobs.board") },
          { value: "library", label: t("jobs.library") },
        ]}
        onChange={setSection}
      />
      <div className={styles.filters}>
        <Input
          className={styles.search}
          aria-label={t("jobs.search")}
          placeholder={t("jobs.search")}
          prefix={<SearchOutlined />}
          value={search}
          allowClear
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          aria-label={t("jobs.archived")}
          value={archived}
          options={(["active", "archived", "all"] as const).map((value) => ({
            value,
            label: t(`jobs.${value}`),
          }))}
          onChange={setArchived}
        />
        {section === "board" ? (
          <>
            <div className={styles.picker}>
              <JobPicker value={jobFilter} onChange={setJobFilter} />
            </div>
            <Segmented
              aria-label={t("jobs.view")}
              value={view}
              options={[
                { value: "gantt", label: t("jobs.gantt") },
                { value: "board", label: t("jobs.kanban") },
                { value: "list", label: t("jobs.list") },
              ]}
              onChange={setView}
            />
            {view !== "board" ? (
              <Select
                allowClear
                aria-label={t("jobs.stage")}
                value={stageFilter}
                placeholder={t("jobs.all")}
                options={applicationStages.map((value) => ({
                  value,
                  label: t(stageLabelKey(value)),
                }))}
                onChange={setStageFilter}
              />
            ) : null}
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setNewApplication({})}
            >
              {t("jobs.newApplication")}
            </Button>
          </>
        ) : null}
        <Button
          type={section === "library" ? "primary" : "default"}
          icon={<PlusOutlined />}
          onClick={() => setNewJob(true)}
        >
          {t("jobs.newJob")}
        </Button>
      </div>
      {section === "library" ? (
        <OpportunityLibrary
          key={revision}
          query={query}
          onSelect={(job) => setJobId(job.id)}
        />
      ) : view === "gantt" ? (
        <ApplicationGantt key={revision} query={query} onSelect={selectApp} />
      ) : view === "list" ? (
        <ApplicationList key={revision} query={query} onSelect={selectApp} />
      ) : (
        <>
          <div className={styles.mobile}>
            <ApplicationBoard
              key={revision}
              query={query}
              onSelect={selectApp}
            />
          </div>
          <div className={styles.mobileOnly}>
            <ApplicationList
              key={revision}
              query={query}
              onSelect={selectApp}
            />
          </div>
        </>
      )}
      {jobId ? (
        <OpportunityDetail
          key={jobId}
          id={jobId}
          onClose={() => setJobId(undefined)}
          onChanged={changed}
          onApplication={selectApp}
          onNewApplication={(job) => setNewApplication({ job })}
        />
      ) : null}
      {applicationId ? (
        <ApplicationDetail
          key={applicationId}
          id={applicationId}
          onClose={() => setApplicationId(undefined)}
          onChanged={changed}
        />
      ) : null}
      <Modal
        open={newJob}
        title={t("jobs.newJob")}
        footer={null}
        destroyOnHidden
        width={620}
        onCancel={() => setNewJob(false)}
      >
        {newJob ? (
          <OpportunityForm
            onCancel={() => setNewJob(false)}
            onUseExisting={(job) => {
              setNewJob(false);
              setJobId(job.id);
            }}
            onSave={async (fields, createApplication, operationId) => {
              const result = await mutation.perform(() =>
                saveJobOpportunity({
                  ...fields,
                  createApplication,
                  operationId,
                }),
              );
              if (!result) return false;
              setNewJob(false);
              changed();
              setJobId(result.opportunity.id);
              return true;
            }}
          />
        ) : null}
      </Modal>
      <Modal
        open={Boolean(newApplication)}
        title={t("jobs.newApplication")}
        footer={null}
        destroyOnHidden
        width={580}
        onCancel={() => setNewApplication(undefined)}
      >
        {newApplication ? (
          <ApplicationForm
            opportunity={newApplication.job}
            onCancel={() => setNewApplication(undefined)}
            onSave={async (input) => {
              if (!input.opportunityId) return false;
              const result = await mutation.perform(() =>
                saveJobApplication({
                  ...input,
                  opportunityId: input.opportunityId!,
                }),
              );
              if (!result) return false;
              setNewApplication(undefined);
              setJobId(undefined);
              changed();
              setApplicationId(result.id);
              return true;
            }}
          />
        ) : null}
      </Modal>
    </div>
  );
}
