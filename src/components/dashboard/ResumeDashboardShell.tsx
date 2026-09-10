"use client";

import { ImportOutlined, MoreOutlined } from "@ant-design/icons";
import { Button, Dropdown, Input, Modal } from "antd";
import { createStyles } from "antd-style";
import { useDeferredValue, useEffect, useRef, useState } from "react";

import { NumberedPagination } from "@/components/common/NumberedPagination";
import { useI18n } from "@/i18n/I18nProvider";
import { useEditorViewportAccess } from "@/components/editor/EditorViewportGuard";
import { SearchIcon } from "@/components/ui/InlineIcons";
import { ActionConfirmationModal } from "@/components/ui/ActionConfirmationModal";
import {
  ResumeSummaryEditor,
  type ResumeSummaryUpdateResult,
} from "@/components/resume/ResumeSummaryEditor";
import type { ResumeCatalogEntry } from "@/lib/resume/catalog";
import type { PageResult, PaginationSearchParams } from "@/lib/shared/pagination";
import {
  exportResumePdfDocument,
  publishResume,
  unpublishResume,
  updateResumeSummary,
} from "@/lib/resume/client";

import { ResumeImportPicker } from "./ResumeImportPicker";
import { ResumeTemplatePicker } from "./ResumeTemplatePicker";

const useStyles = createStyles(({ token, css }) => ({
  pageHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 64px;

    @media (max-width: 720px) {
      min-height: 58px;
    }
  `,
  heading: css`
    margin: 0;
    color: ${token.colorText};
    font-size: 20px;
    font-weight: 600;
    line-height: 1.4;
  `,
  catalog: css`
    display: grid;
    min-width: 0;
  `,
  catalogToolbar: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 58px;
    gap: 20px;
    padding: 5px 0 21px;

    .ant-btn {
      height: 32px;
    }

    .ant-input-affix-wrapper {
      min-height: 32px;
    }

    @media (max-width: 720px) {
      align-items: stretch;
      flex-direction: column;
      gap: 10px;
      padding: 0 0 16px;
    }
  `,
  toolbarPrimary: css`
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 12px;

    @media (max-width: 720px) {
      align-items: stretch;
      flex-direction: column;
    }
  `,
  catalogCount: css`
    color: ${token.colorTextTertiary};
    font-size: 12px;
    white-space: nowrap;
  `,
  search: css`
    && {
      width: 360px;
      max-width: 100%;
      flex: 0 0 360px;

      @media (max-width: 720px) {
        width: 100%;
        flex: 0 0 auto;
      }
    }
  `,
  tableViewport: css`
    overflow-x: auto;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 4px;
  `,
  table: css`
    width: 100%;
    min-width: 1060px;
    border-collapse: collapse;
    table-layout: fixed;

    th,
    td {
      padding: 0 16px;
      border-bottom: 1px solid ${token.colorBorderSecondary};
      text-align: left;
      vertical-align: middle;
    }

    th {
      height: 43px;
      background: ${token.colorFillQuaternary};
      color: ${token.colorTextSecondary};
      font-size: 13px;
      font-weight: 500;
    }

    td {
      height: 64px;
      color: ${token.colorTextSecondary};
      font-size: 13px;
    }

    tbody tr {
      transition: background 120ms ease;
    }

    tbody tr:hover {
      background: ${token.colorFillQuaternary};
    }

    @media (max-width: 720px) {
      min-width: 0;

      colgroup {
        display: none;
      }

      thead {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
      }

      tbody,
      tr,
      td {
        display: block;
        width: 100%;
      }

      tbody tr {
        box-sizing: border-box;
        padding: 14px 16px;
        border-bottom: 1px solid ${token.colorBorderSecondary};
      }

      tbody tr:last-child {
        border-bottom: 0;
      }

      td {
        display: grid;
        box-sizing: border-box;
        grid-template-columns: 78px minmax(0, 1fr);
        gap: 12px;
        padding: 7px 0;
        border: 0;
        height: auto;
      }

      td::before {
        content: attr(data-label);
        color: ${token.colorTextTertiary};
        font-size: 12px;
      }
    }
  `,
  titleLink: css`
    && {
      justify-content: flex-start;
      height: auto;
      padding: 0;
      color: ${token.colorPrimary};
      font-size: 13px;
      font-weight: 500;
      text-align: left;

      &:hover {
        color: ${token.colorPrimary};
      }
    }
  `,
  desktopOnly: css`
    display: inline-flex;

    @media (max-width: 960px) {
      display: none;
    }
  `,
  mobileOnly: css`
    display: none;

    @media (max-width: 960px) {
      display: inline-flex;
    }
  `,
  resumeIdentity: css`
    display: grid;
    min-width: 0;
    gap: 2px;
  `,
  resumeId: css`
    overflow: hidden;
    color: ${token.colorTextTertiary};
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  status: css`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: ${token.colorTextSecondary};
    white-space: nowrap;
  `,
  statusDot: css`
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: ${token.colorTextQuaternary};

    &[data-published="true"] {
      background: ${token.colorSuccess};
    }
  `,
  summary: css`
    display: -webkit-box;
    overflow: hidden;
    color: ${token.colorTextSecondary};
    font-size: 13px;
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  `,
  updatedAt: css`
    color: ${token.colorTextSecondary};
    font-size: 13px;
    white-space: nowrap;
  `,
  rowActions: css`
    display: flex;
    align-items: center;
    gap: 8px;

    .ant-btn {
      height: auto !important;
      padding-inline: 0 !important;
      border-radius: 0;
    }

  `,
  moreButton: css`
    && {
      width: 30px;
      min-width: 30px;
      height: 30px !important;
      padding: 0 !important;
      border-radius: 6px;
    }
  `,
  moreMenu: css`
    display: grid;
    min-width: 188px;
    padding: 6px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 8px;
    background: ${token.colorBgElevated};
    box-shadow: ${token.boxShadowSecondary};

    .ant-btn,
    form .ant-btn {
      justify-content: flex-start;
      width: 100%;
      min-height: 34px;
      padding: 0 10px !important;
      border-radius: 6px;
      color: ${token.colorText};
      text-align: left;
    }

    .ant-btn-dangerous {
      color: ${token.colorError};
    }

    form {
      display: block;
    }
  `,
  emptyState: css`
    display: grid;
    min-height: 260px;
    padding: 56px 24px;
    place-items: center;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 4px;
    color: ${token.colorTextTertiary};
    text-align: center;
  `,
  emptyStateContent: css`
    display: grid;
    justify-items: center;
    max-width: 360px;
    gap: 8px;
  `,
  emptyStateTitle: css`
    margin: 0;
    color: ${token.colorText};
    font-size: 17px;
    font-weight: 600;
    line-height: 1.4;
  `,
  emptyStateDescription: css`
    margin: 0 0 8px;
    color: ${token.colorTextSecondary};
    font-size: 13px;
    line-height: 1.6;
  `,
}));

export function ResumeDeleteForm({
  onOpenChange,
  open: controlledOpen,
  renderTrigger = true,
  resume,
}: {
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  renderTrigger?: boolean;
  resume: ResumeCatalogEntry;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const { t } = useI18n();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;

  function setOpen(nextOpen: boolean) {
    if (controlledOpen === undefined) {
      setInternalOpen(nextOpen);
    }

    onOpenChange?.(nextOpen);
  }

  return (
    <>
      <form
        action={`/app/resumes/${resume.id}/delete`}
        data-testid={`delete-resume-form-${resume.id}`}
        method="post"
        ref={formRef}
      >
        {renderTrigger ? (
          <Button
            danger
            data-testid="delete-resume-trigger"
            htmlType="button"
            type="link"
            onClick={() => setOpen(true)}
          >
            {t("dashboard.deleteResume")}
          </Button>
        ) : null}
      </form>
      <Modal
        cancelText={t("common.dismiss")}
        destroyOnHidden
        okButtonProps={{ danger: true }}
        okText={t("dashboard.deleteResume")}
        open={open}
        title={t("dashboard.deleteResumeTitle", { title: resume.title })}
        onCancel={() => setOpen(false)}
        onOk={() => formRef.current?.requestSubmit()}
      >
        <p>{t("dashboard.deleteResumeDescription")}</p>
      </Modal>
    </>
  );
}

function ResumePublicActions({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const copiedResetTimerRef = useRef<number | undefined>(undefined);
  const { t } = useI18n();
  const publicHref = `/resume/${slug}`;

  useEffect(
    () => () => {
      if (copiedResetTimerRef.current) {
        window.clearTimeout(copiedResetTimerRef.current);
      }
    },
    [],
  );

  async function handleCopyPublicLink() {
    try {
      await navigator.clipboard.writeText(
        new URL(publicHref, window.location.origin).href,
      );
      setCopied(true);
      window.clearTimeout(copiedResetTimerRef.current);
      copiedResetTimerRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 2_000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <Button href={publicHref} type="link">{t("common.openPublic")}</Button>
      <Button
        data-testid={`copy-public-link-${slug}`}
        onClick={() => void handleCopyPublicLink()}
        type="link"
      >
        {copied ? t("dashboard.publicLinkCopied") : t("dashboard.copyPublicLink")}
      </Button>
    </>
  );
}

type PublicationState = Pick<ResumeCatalogEntry, "published" | "slug">;

function ResumeRowActions({
  editorAccess,
  exportPdfDocument: exportPdf,
  onPublicationChange,
  onSummarySaved,
  publishDocument,
  resume,
  unpublishDocument,
  updateSummary,
}: {
  editorAccess: ReturnType<typeof useEditorViewportAccess>;
  exportPdfDocument: (params: { resumeId: string }) => Promise<void>;
  onPublicationChange: (state: PublicationState) => void;
  onSummarySaved: (result: ResumeSummaryUpdateResult) => void;
  publishDocument: (params: { resumeId: string }) => Promise<{ slug: string }>;
  resume: ResumeCatalogEntry;
  unpublishDocument: (params: { resumeId: string }) => Promise<void>;
  updateSummary: (params: {
    resumeId: string;
    summary: string;
    version: number;
  }) => Promise<ResumeSummaryUpdateResult>;
}) {
  const { styles } = useStyles();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [publicationBusy, setPublicationBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const editorHref = `/app/resumes/${resume.id}`;
  const previewHref = `${editorHref}/preview`;
  const moreLabel = t("dashboard.moreActions", { title: resume.title });

  async function handlePublish() {
    setPublicationBusy(true);

    try {
      const result = await publishDocument({ resumeId: resume.id });

      onPublicationChange({ published: true, slug: result.slug });
      setOpen(false);
    } finally {
      setPublicationBusy(false);
    }
  }

  async function handleUnpublish() {
    setPublicationBusy(true);

    try {
      await unpublishDocument({ resumeId: resume.id });
      onPublicationChange({ published: false, slug: undefined });
      setOpen(false);
    } finally {
      setPublicationBusy(false);
    }
  }

  async function handleExportPdf() {
    setPdfBusy(true);

    try {
      await exportPdf({ resumeId: resume.id });
      setOpen(false);
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className={styles.rowActions}>
      <span className={styles.desktopOnly}>
        <Button
          data-testid="dashboard-resume-primary-desktop"
          href={editorHref}
          type="link"
        >
          {t("dashboard.openResume")}
        </Button>
      </span>
      <span className={styles.mobileOnly}>
        <Button
          data-testid="dashboard-resume-primary-mobile"
          href={previewHref}
          type="link"
        >
          {t("common.preview")}
        </Button>
      </span>
      <Dropdown
        destroyOnHidden
        menu={{ items: [] }}
        open={open}
        popupRender={() => (
          <div aria-label={moreLabel} className={styles.moreMenu} role="menu">
            <Button href={previewHref} type="text">
              {t("common.preview")}
            </Button>
            {resume.published ? (
              <Button
                disabled={publicationBusy}
                loading={publicationBusy}
                type="text"
                onClick={() => {
                  setOpen(false);
                  setUnpublishOpen(true);
                }}
              >
                {t("common.unpublish")}
              </Button>
            ) : (
              <Button
                disabled={publicationBusy}
                loading={publicationBusy}
                type="text"
                onClick={() => void handlePublish()}
              >
                {t("common.publish")}
              </Button>
            )}
            <Button
              disabled={pdfBusy}
              loading={pdfBusy}
              type="text"
              onClick={() => void handleExportPdf()}
            >
              {t("common.pdf")}
            </Button>
            <Button
              type="text"
              onClick={() => {
                setOpen(false);
                setSummaryOpen(true);
              }}
            >
              {t("dashboard.editSummary")}
            </Button>
            <form
              action={`/app/resumes/${resume.id}/duplicate`}
              data-testid={`duplicate-resume-form-${resume.id}`}
              method="post"
            >
              <input
                name="returnTo"
                type="hidden"
                value={editorAccess === "allowed" ? "editor" : "/app"}
              />
              <Button htmlType="submit" type="text">
                {t("dashboard.copyResume")}
              </Button>
            </form>
            {resume.published && resume.slug ? (
              <ResumePublicActions slug={resume.slug} />
            ) : null}
            <Button
              danger
              type="text"
              onClick={() => {
                setOpen(false);
                setDeleteOpen(true);
              }}
            >
              {t("dashboard.deleteResume")}
            </Button>
          </div>
        )}
        trigger={["hover", "click"]}
        onOpenChange={setOpen}
      >
        <Button
          aria-label={moreLabel}
          className={styles.moreButton}
          icon={<MoreOutlined />}
          type="text"
        />
      </Dropdown>
      <ResumeSummaryEditor
        initialSummary={resume.summary}
        open={summaryOpen}
        renderTrigger={false}
        resumeId={resume.id}
        saveSummary={updateSummary}
        version={resume.version}
        onOpenChange={setSummaryOpen}
        onSaved={onSummarySaved}
      />
      <ResumeDeleteForm
        open={deleteOpen}
        renderTrigger={false}
        resume={resume}
        onOpenChange={setDeleteOpen}
      />
      <ActionConfirmationModal
        cancelText={t("common.dismiss")}
        confirmText={t("publication.unpublishConfirm")}
        description={t("publication.unpublishDescription", {
          title: resume.title,
        })}
        onCancel={() => setUnpublishOpen(false)}
        onConfirm={() => {
          setUnpublishOpen(false);
          void handleUnpublish();
        }}
        open={unpublishOpen}
        pending={publicationBusy}
        title={t("publication.unpublishTitle")}
      />
    </div>
  );
}

export function ResumeDashboardShell({
  resumes,
  createAction,
  pagination,
  searchParams = {},
  searchQuery = "",
  exportPdfDocument: exportPdf = exportResumePdfDocument,
  publishDocument = publishResume,
  unpublishDocument = unpublishResume,
  updateSummary = updateResumeSummary,
}: {
  resumes: ResumeCatalogEntry[];
  createAction: string;
  pagination?: PageResult<ResumeCatalogEntry>;
  searchParams?: PaginationSearchParams;
  searchQuery?: string;
  exportPdfDocument?: (params: { resumeId: string }) => Promise<void>;
  publishDocument?: (params: { resumeId: string }) => Promise<{ slug: string }>;
  unpublishDocument?: (params: { resumeId: string }) => Promise<void>;
  updateSummary?: (params: {
    resumeId: string;
    summary: string;
    version: number;
  }) => Promise<ResumeSummaryUpdateResult>;
}) {
  const { styles } = useStyles();
  const { locale, t } = useI18n();
  const editorAccess = useEditorViewportAccess();
  const [activeSearchQuery, setActiveSearchQuery] = useState(searchQuery);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [importPickerOpen, setImportPickerOpen] = useState(false);
  const [summaryUpdates, setSummaryUpdates] = useState<
    Record<string, ResumeSummaryUpdateResult>
  >({});
  const [publicationUpdates, setPublicationUpdates] = useState<
    Record<string, PublicationState>
  >({});
  const catalogResumes = resumes.map((resume) => {
    const update = summaryUpdates[resume.id];
    const publicationUpdate = publicationUpdates[resume.id];
    const updatedResume =
      update && update.version >= resume.version
        ? {
            ...resume,
            summary: update.summary,
            updatedAt: update.updatedAt,
            version: update.version,
          }
        : resume;

    return publicationUpdate
      ? {
          ...updatedResume,
          ...publicationUpdate,
        }
      : updatedResume;
  });

  const deferredSearchQuery = useDeferredValue(activeSearchQuery);
  const normalizedSearchQuery = deferredSearchQuery.trim().toLocaleLowerCase(locale);
  const hasResumes = (pagination?.total ?? catalogResumes.length) > 0;
  const hasSearch = normalizedSearchQuery.length > 0;
  const filteredResumes = normalizedSearchQuery
    ? catalogResumes.filter((resume) =>
        [resume.title, resume.summary].some((value) =>
          value.toLocaleLowerCase(locale).includes(normalizedSearchQuery),
        ),
      )
    : catalogResumes;

  function handleSummarySaved(
    resumeId: string,
    result: ResumeSummaryUpdateResult,
  ) {
    setSummaryUpdates((currentUpdates) => ({
      ...currentUpdates,
      [resumeId]: result,
    }));
  }

  function handlePublicationChange(resumeId: string, state: PublicationState) {
    setPublicationUpdates((currentUpdates) => ({
      ...currentUpdates,
      [resumeId]: state,
    }));
  }

  return (
    <>
      <section className={styles.pageHeader}>
        <h1 className={styles.heading}>{t("dashboard.heading")}</h1>
      </section>

      <section aria-label={t("dashboard.resumeList")} className={styles.catalog}>
          <div
            aria-label={t("dashboard.toolbar")}
            className={styles.catalogToolbar}
            role="toolbar"
          >
            <div className={styles.toolbarPrimary}>
              <Button
                data-testid="open-resume-template-picker"
                onClick={() => setTemplatePickerOpen(true)}
                type="primary"
              >
                {t("common.createResume")}
              </Button>
              <Button
                aria-label={t("dashboard.importPicker.open")}
                data-testid="open-resume-import-picker"
                icon={<ImportOutlined aria-hidden="true" />}
                onClick={() => setImportPickerOpen(true)}
              >
                {t("dashboard.importPicker.open")}
              </Button>
              <form action="/app" method="get">
                <Input
                  allowClear
                  aria-label={t("dashboard.searchResume")}
                  className={styles.search}
                  data-testid="dashboard-search-input"
                  name="q"
                  onChange={(event) => setActiveSearchQuery(event.target.value)}
                  placeholder={t("dashboard.searchResumePlaceholder")}
                  prefix={<SearchIcon size={16} />}
                  type="search"
                  value={activeSearchQuery}
                />
              </form>
            </div>
            <span aria-live="polite" className={styles.catalogCount}>
              {t("dashboard.resumeCount", {
                count:
                  deferredSearchQuery === searchQuery
                    ? pagination?.total ?? filteredResumes.length
                    : filteredResumes.length,
              })}
            </span>
          </div>

          {!hasResumes && !hasSearch ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateContent}>
                <h2 className={styles.emptyStateTitle}>{t("dashboard.empty.title")}</h2>
                <p className={styles.emptyStateDescription}>
                  {t("dashboard.empty.description")}
                </p>
                <Button
                  data-testid="open-empty-resume-template-picker"
                  onClick={() => setTemplatePickerOpen(true)}
                  type="primary"
                >
                  {t("common.createResume")}
                </Button>
              </div>
            </div>
          ) : filteredResumes.length === 0 ? (
            <div className={styles.emptyState}>{t("dashboard.noMatchingResumes")}</div>
          ) : (
            <div className={styles.tableViewport}>
              <table aria-label={t("dashboard.resumeList")} className={styles.table}>
                <colgroup>
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "17%" }} />
                  <col style={{ width: "25%" }} />
                  <col style={{ width: "28%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">{t("dashboard.columnTitle")}</th>
                    <th scope="col">{t("dashboard.columnStatus")}</th>
                    <th scope="col">{t("dashboard.columnUpdatedAt")}</th>
                    <th scope="col">{t("dashboard.columnSummary")}</th>
                    <th scope="col">{t("dashboard.columnActions")}</th>
                  </tr>
                </thead>
                <tbody>
              {filteredResumes.map((resume) => (
                  <tr key={resume.id}>
                    <td data-label={t("dashboard.columnTitle")}>
                      <span className={styles.resumeIdentity}>
                        <span className={styles.desktopOnly}>
                          <Button
                            className={styles.titleLink}
                            data-testid="dashboard-resume-title-desktop"
                            href={`/app/resumes/${resume.id}`}
                            type="link"
                          >
                            {resume.title}
                          </Button>
                        </span>
                        <span className={styles.mobileOnly}>
                          <Button
                            className={styles.titleLink}
                            data-testid="dashboard-resume-title-mobile"
                            href={`/app/resumes/${resume.id}/preview`}
                            type="link"
                          >
                            {resume.title}
                          </Button>
                        </span>
                        <span className={styles.resumeId}>{resume.id}</span>
                      </span>
                    </td>
                    <td data-label={t("dashboard.columnStatus")}>
                      <span className={styles.status}>
                        <span
                          aria-hidden="true"
                          className={styles.statusDot}
                          data-published={resume.published}
                          data-testid="resume-publication-status-dot"
                        />
                        {resume.published ? t("dashboard.published") : t("dashboard.draft")}
                      </span>
                    </td>
                    <td data-label={t("dashboard.columnUpdatedAt")}>
                      <time className={styles.updatedAt} dateTime={new Date(resume.updatedAt).toISOString()}>
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(resume.updatedAt)}
                      </time>
                    </td>
                    <td data-label={t("dashboard.columnSummary")}>
                      <span className={styles.summary}>{resume.summary}</span>
                    </td>
                    <td data-label={t("dashboard.columnActions")}>
                      <ResumeRowActions
                        editorAccess={editorAccess}
                        exportPdfDocument={exportPdf}
                        publishDocument={publishDocument}
                        resume={resume}
                        unpublishDocument={unpublishDocument}
                        updateSummary={updateSummary}
                        onPublicationChange={(state) =>
                          handlePublicationChange(resume.id, state)
                        }
                        onSummarySaved={(result) =>
                          handleSummarySaved(resume.id, result)
                        }
                      />
                    </td>
                  </tr>
              ))}
                </tbody>
              </table>
            </div>
          )}
          {pagination ? (
            <NumberedPagination
              basePath="/app"
              page={pagination.page}
              pageSize={pagination.pageSize}
              searchParams={searchParams}
              total={pagination.total}
              totalPages={pagination.totalPages}
            />
          ) : null}
      </section>
      <ResumeTemplatePicker
        createAction={createAction}
        onClose={() => setTemplatePickerOpen(false)}
        open={templatePickerOpen}
      />
      <ResumeImportPicker
        createAction={createAction}
        onClose={() => setImportPickerOpen(false)}
        open={importPickerOpen}
      />
    </>
  );
}
