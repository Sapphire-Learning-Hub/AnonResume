"use client";

import { GlobalOutlined } from "@ant-design/icons";
import { Button, Checkbox, DatePicker, Input, Modal, Select, Tooltip } from "antd";
import { createStyles } from "antd-style";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AdminOtpInput } from "@/components/admin/AdminOtpInput";
import {
  AdminIdentity,
  AdminPage,
  AdminStatus,
  AdminTable,
  AdminTableActions,
  AdminToolbar,
} from "@/components/admin/AdminPage";
import { ActionConfirmationModal } from "@/components/ui/ActionConfirmationModal";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";
import type { AnnouncementAudience, AnnouncementTone } from "@/lib/announcements/rules";
import type { PaginationSearchParams } from "@/lib/shared/pagination";

export interface AnnouncementListItem {
  id: string;
  titleZh: string;
  bodyZh: string;
  titleEn: string | null;
  bodyEn: string | null;
  tone: AnnouncementTone;
  audience: AnnouncementAudience;
  dismissible: boolean;
  status: "draft" | "published" | "withdrawn";
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DraftState {
  titleZh: string;
  bodyZh: string;
  titleEn: string;
  bodyEn: string;
  tone: AnnouncementTone;
  audience: AnnouncementAudience;
  dismissible: boolean;
  expiresAt: string;
}

type AnnouncementAction = "publish" | "withdraw" | "delete";

interface TranslationDraft {
  titleEn: string;
  bodyEn: string;
}

const useStyles = createStyles(({ token, css }) => ({
  form: css`
    display: grid;
    gap: 16px;
  `,
  field: css`
    display: grid;
    gap: 7px;
  `,
  fieldLabel: css`
    color: ${token.colorText};
    font-size: 13px;
    font-weight: 600;
  `,
  fieldGrid: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;

    @media (max-width: 640px) {
      grid-template-columns: minmax(0, 1fr);
    }
  `,
  datePicker: css`
    && {
      width: 100%;
    }
  `,
  localeButton: css`
    && {
      color: ${token.colorTextSecondary};

      &[data-configured="true"] {
        color: ${token.colorPrimary};
      }

      &:hover {
        color: ${token.colorPrimary};
        background: ${token.colorPrimaryBg};
      }
    }
  `,
  translationIntro: css`
    margin: 0;
    color: ${token.colorTextSecondary};
    line-height: 1.65;
  `,
  sourcePreview: css`
    display: grid;
    gap: 6px;
    padding: 14px 16px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    background: ${token.colorFillQuaternary};

    strong {
      color: ${token.colorText};
    }

    p {
      margin: 0;
      color: ${token.colorTextSecondary};
      line-height: 1.6;
      white-space: pre-wrap;
    }
  `,
  detailContent: css`
    display: grid;
    gap: 20px;
  `,
  detailSection: css`
    display: grid;
    gap: 8px;

    h3 {
      margin: 0;
      color: ${token.colorText};
      font-size: 15px;
    }
  `,
}));

const emptyDraft: DraftState = {
  titleZh: "",
  bodyZh: "",
  titleEn: "",
  bodyEn: "",
  tone: "info",
  audience: "all",
  dismissible: true,
  expiresAt: "",
};

function toLocalDateTimeValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function effectiveStatus(announcement: AnnouncementListItem) {
  if (
    announcement.status === "published" &&
    announcement.expiresAt &&
    new Date(announcement.expiresAt) <= new Date()
  ) {
    return "expired" as const;
  }
  return announcement.status;
}

export function AdminAnnouncementManager({
  announcements,
  canManage,
  page,
  pageSize,
  query,
  searchParams,
  title,
  total,
  totalPages,
}: {
  announcements: AnnouncementListItem[];
  canManage: boolean;
  page: number;
  pageSize: number;
  query: string;
  searchParams: PaginationSearchParams;
  title: string;
  total: number;
  totalPages: number;
}) {
  const { styles } = useStyles();
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const router = useRouter();
  const { toast } = useAppFeedback();
  const [search, setSearch] = useState(query);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [translationOpen, setTranslationOpen] = useState(false);
  const [translationDraft, setTranslationDraft] = useState<TranslationDraft>({
    titleEn: "",
    bodyEn: "",
  });
  const [detailAnnouncement, setDetailAnnouncement] =
    useState<AnnouncementListItem>();
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    action: AnnouncementAction;
    announcement: AnnouncementListItem;
  }>();
  const [deferredAction, setDeferredAction] = useState<{
    action: AnnouncementAction;
    announcement: AnnouncementListItem;
  }>();
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthCode, setReauthCode] = useState("");

  const englishComplete = Boolean(draft.titleEn.trim()) === Boolean(draft.bodyEn.trim());
  const canSave = Boolean(draft.titleZh.trim() && draft.bodyZh.trim() && englishComplete);
  const translationComplete =
    Boolean(translationDraft.titleEn.trim()) ===
    Boolean(translationDraft.bodyEn.trim());
  const hasEnglishContent = Boolean(draft.titleEn.trim() && draft.bodyEn.trim());

  function openCreate() {
    setEditingId(undefined);
    setDraft(emptyDraft);
    setEditorOpen(true);
  }

  function openTranslations() {
    setTranslationDraft({ titleEn: draft.titleEn, bodyEn: draft.bodyEn });
    setTranslationOpen(true);
  }

  function saveTranslations() {
    if (!translationComplete) return;
    setDraft((current) => ({ ...current, ...translationDraft }));
    setTranslationOpen(false);
  }

  function openEdit(announcement: AnnouncementListItem) {
    setEditingId(announcement.id);
    setDraft({
      titleZh: announcement.titleZh,
      bodyZh: announcement.bodyZh,
      titleEn: announcement.titleEn ?? "",
      bodyEn: announcement.bodyEn ?? "",
      tone: announcement.tone,
      audience: announcement.audience,
      dismissible: announcement.dismissible,
      expiresAt: toLocalDateTimeValue(announcement.expiresAt),
    });
    setEditorOpen(true);
  }

  async function saveDraft() {
    if (!canSave) return;
    setPending(true);
    const response = await fetch(
      editingId
        ? `/api/manage/announcements/${encodeURIComponent(editingId)}`
        : "/api/manage/announcements",
      {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...draft,
          titleEn: draft.titleEn || null,
          bodyEn: draft.bodyEn || null,
          expiresAt: draft.expiresAt
            ? new Date(draft.expiresAt).toISOString()
            : null,
        }),
      },
    );
    setPending(false);
    if (!response.ok) {
      toast.error(t("announcements.failed"));
      return;
    }
    setEditorOpen(false);
    toast.success(t("announcements.saved"));
    router.refresh();
  }

  async function runAction(
    action: AnnouncementAction,
    announcement: AnnouncementListItem,
  ) {
    setPending(true);
    const response = await fetch(
      action === "delete"
        ? `/api/manage/announcements/${encodeURIComponent(announcement.id)}`
        : `/api/manage/announcements/${encodeURIComponent(announcement.id)}/${action}`,
      { method: action === "delete" ? "DELETE" : "POST" },
    );
    setPending(false);
    if (response.status === 428) {
      setDeferredAction({ action, announcement });
      setReauthOpen(true);
      return;
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
      };
      toast.error(
        payload.error === "active_limit"
          ? t("announcements.limitReached")
          : payload.error === "invalid_state"
            ? t("announcements.invalidState")
            : t("announcements.failed"),
      );
      return;
    }
    toast.success(
      action === "publish"
        ? t("announcements.published")
        : action === "withdraw"
          ? t("announcements.withdrawn")
          : t("announcements.deleted"),
    );
    router.refresh();
  }

  async function reauthenticate() {
    setPending(true);
    const response = await fetch("/api/manage/session/reauth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: reauthCode }),
    });
    setPending(false);
    if (!response.ok) {
      toast.error(t("common.invalidCode"));
      return;
    }
    const deferred = deferredAction;
    setReauthOpen(false);
    setReauthCode("");
    setDeferredAction(undefined);
    if (deferred) await runAction(deferred.action, deferred.announcement);
  }

  function submitSearch(value: string) {
    const params = new URLSearchParams();
    if (value.trim()) params.set("q", value.trim());
    params.set("page", "1");
    router.push(`/app/manage/announcements?${params.toString()}`);
  }

  const confirmationText = confirmation
    ? {
        publish: {
          title: t("announcements.publishTitle"),
          description: t("announcements.publishDescription"),
          confirm: t("announcements.publishConfirm"),
        },
        withdraw: {
          title: t("announcements.withdrawTitle"),
          description: t("announcements.withdrawDescription"),
          confirm: t("announcements.withdrawConfirm"),
        },
        delete: {
          title: t("announcements.deleteTitle"),
          description: t("announcements.deleteDescription"),
          confirm: t("announcements.deleteConfirm"),
        },
      }[confirmation.action]
    : null;

  return (
    <AdminPage
      actions={canManage ? <Button onClick={openCreate} type="primary">{t("announcements.create")}</Button> : undefined}
      title={title}
    >
      <AdminToolbar meta={t("announcements.total", { count: total })}>
        <Input.Search
          allowClear
          onChange={(event) => setSearch(event.target.value)}
          onSearch={submitSearch}
          placeholder={t("announcements.search")}
          value={search}
        />
      </AdminToolbar>
      <AdminTable
        actionColumn
        headers={[
          t("announcements.titleZh"),
          t("announcements.audience"),
          t("announcements.tone"),
          t("announcements.status"),
          t("announcements.publishedAt"),
          t("common.actions"),
        ]}
        pagination={{
          basePath: "/app/manage/announcements",
          page,
          pageSize,
          searchParams,
          total,
          totalPages,
        }}
        rows={announcements.map((announcement) => {
          const status = effectiveStatus(announcement);
          return [
            <AdminIdentity
              description={announcement.titleEn || announcement.bodyZh}
              key="title"
              title={announcement.titleZh}
            />,
            t(`announcements.audience.${announcement.audience}`),
            t(`announcements.tone.${announcement.tone}`),
            <AdminStatus
              key="status"
              tone={status === "published" ? "success" : status === "expired" ? "warning" : "default"}
            >
              {t(`announcements.status.${status}`)}
            </AdminStatus>,
            announcement.publishedAt
              ? new Date(announcement.publishedAt).toLocaleString(locale)
              : "-",
            <AdminTableActions key="actions">
              <Button onClick={() => setDetailAnnouncement(announcement)} type="link">
                {t("common.details")}
              </Button>
              {canManage ? (
                <>
                    {announcement.status !== "published" ? (
                      <Button onClick={() => openEdit(announcement)} type="link">{t("common.edit")}</Button>
                    ) : null}
                    {announcement.status !== "published" ? (
                      <Button onClick={() => setConfirmation({ action: "publish", announcement })} type="link">{t("announcements.publish")}</Button>
                    ) : (
                      <Button onClick={() => setConfirmation({ action: "withdraw", announcement })} type="link">{t("announcements.withdraw")}</Button>
                    )}
                    {announcement.status === "draft" ? (
                      <Button danger onClick={() => setConfirmation({ action: "delete", announcement })} type="link">{t("common.delete")}</Button>
                    ) : null}
                </>
              ) : null}
            </AdminTableActions>,
          ];
        })}
      />

      <Modal
        cancelText={t("common.cancel")}
        okButtonProps={{ disabled: !canSave, loading: pending }}
        okText={t("announcements.save")}
        onCancel={() => {
          setEditorOpen(false);
          setTranslationOpen(false);
        }}
        onOk={saveDraft}
        open={editorOpen}
        title={editingId ? t("announcements.edit") : t("announcements.create")}
        width={680}
      >
        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="announcement-title-zh">{t("announcements.titleZh")}</label>
            <Input
              aria-label={t("announcements.titleZh")}
              id="announcement-title-zh"
              maxLength={120}
              onChange={(event) => setDraft((current) => ({ ...current, titleZh: event.target.value }))}
              placeholder={t("announcements.titleZh")}
              suffix={
                <Tooltip title={t("announcements.i18nSettings")}>
                  <Button
                    aria-label={t("announcements.i18nSettings")}
                    className={styles.localeButton}
                    data-configured={hasEnglishContent}
                    icon={<GlobalOutlined />}
                    onClick={openTranslations}
                    size="small"
                    type="text"
                  />
                </Tooltip>
              }
              value={draft.titleZh}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="announcement-body-zh">{t("announcements.bodyZh")}</label>
            <Input.TextArea
              aria-label={t("announcements.bodyZh")}
              id="announcement-body-zh"
              maxLength={1_000}
              onChange={(event) => setDraft((current) => ({ ...current, bodyZh: event.target.value }))}
              placeholder={t("announcements.bodyZh")}
              rows={4}
              value={draft.bodyZh}
            />
          </div>
          <div className={styles.fieldGrid}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t("announcements.tone")}</label>
              <Select
                aria-label={t("announcements.tone")}
                onChange={(tone) => setDraft((current) => ({ ...current, tone }))}
                options={(["info", "warning", "critical"] as const).map((tone) => ({ label: t(`announcements.tone.${tone}`), value: tone }))}
                value={draft.tone}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>{t("announcements.audience")}</label>
              <Select
                aria-label={t("announcements.audience")}
                onChange={(audience) => setDraft((current) => ({ ...current, audience }))}
                options={(["all", "authenticated"] as const).map((audience) => ({ label: t(`announcements.audience.${audience}`), value: audience }))}
                value={draft.audience}
              />
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="announcement-expires-at">{t("announcements.expiresAt")}</label>
            <DatePicker
              aria-label={t("announcements.expiresAt")}
              className={styles.datePicker}
              format="YYYY-MM-DD HH:mm"
              id="announcement-expires-at"
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  expiresAt: value ? value.format("YYYY-MM-DDTHH:mm") : "",
                }))
              }
              placeholder={t("announcements.expiresAt")}
              showTime={{ format: "HH:mm" }}
              value={draft.expiresAt ? dayjs(draft.expiresAt) : null}
            />
          </div>
          <Checkbox checked={draft.dismissible} onChange={(event) => setDraft((current) => ({ ...current, dismissible: event.target.checked }))}>
            {t("announcements.dismissible")}
          </Checkbox>
        </div>
      </Modal>

      <Modal
        cancelText={t("common.cancel")}
        okButtonProps={{ disabled: !translationComplete }}
        okText={t("common.confirm")}
        onCancel={() => setTranslationOpen(false)}
        onOk={saveTranslations}
        open={translationOpen}
        title={t("announcements.i18nSettings")}
        width={620}
      >
        <div className={styles.form}>
          <p className={styles.translationIntro}>{t("announcements.i18nDescription")}</p>
          <div className={styles.sourcePreview}>
            <span className={styles.fieldLabel}>{t("announcements.chineseContent")}</span>
            <strong>{draft.titleZh || t("announcements.titleZh")}</strong>
            <p>{draft.bodyZh || t("announcements.bodyZh")}</p>
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="announcement-title-en">{t("announcements.titleEn")}</label>
            <Input
              aria-label={t("announcements.titleEn")}
              id="announcement-title-en"
              maxLength={160}
              onChange={(event) => setTranslationDraft((current) => ({ ...current, titleEn: event.target.value }))}
              placeholder={t("announcements.titleEn")}
              value={translationDraft.titleEn}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="announcement-body-en">{t("announcements.bodyEn")}</label>
            <Input.TextArea
              aria-label={t("announcements.bodyEn")}
              id="announcement-body-en"
              maxLength={1_200}
              onChange={(event) => setTranslationDraft((current) => ({ ...current, bodyEn: event.target.value }))}
              placeholder={t("announcements.bodyEn")}
              rows={4}
              value={translationDraft.bodyEn}
            />
          </div>
        </div>
      </Modal>

      <Modal
        footer={null}
        onCancel={() => setDetailAnnouncement(undefined)}
        open={Boolean(detailAnnouncement)}
        title={t("announcements.detailTitle")}
        width={680}
      >
        {detailAnnouncement ? (
          <div className={styles.detailContent}>
            <section className={styles.detailSection}>
              <h3>{t("announcements.chineseContent")}</h3>
              <dl className="admin-detail-list">
                <div><dt>{t("announcements.titleZh")}</dt><dd>{detailAnnouncement.titleZh}</dd></div>
                <div><dt>{t("announcements.bodyZh")}</dt><dd className="admin-detail-list__long-text">{detailAnnouncement.bodyZh}</dd></div>
              </dl>
            </section>
            <section className={styles.detailSection}>
              <h3>{t("announcements.englishContent")}</h3>
              <dl className="admin-detail-list">
                <div><dt>{t("announcements.titleEn")}</dt><dd>{detailAnnouncement.titleEn || t("announcements.i18nEmpty")}</dd></div>
                <div><dt>{t("announcements.bodyEn")}</dt><dd className="admin-detail-list__long-text">{detailAnnouncement.bodyEn || t("announcements.i18nEmpty")}</dd></div>
              </dl>
            </section>
            <section className={styles.detailSection}>
              <h3>{t("announcements.basicInfo")}</h3>
              <dl className="admin-detail-list">
                <div>
                  <dt>{t("announcements.status")}</dt>
                  <dd><AdminStatus tone={effectiveStatus(detailAnnouncement) === "published" ? "success" : effectiveStatus(detailAnnouncement) === "expired" ? "warning" : "default"}>{t(`announcements.status.${effectiveStatus(detailAnnouncement)}`)}</AdminStatus></dd>
                </div>
                <div><dt>{t("announcements.audience")}</dt><dd>{t(`announcements.audience.${detailAnnouncement.audience}`)}</dd></div>
                <div><dt>{t("announcements.tone")}</dt><dd>{t(`announcements.tone.${detailAnnouncement.tone}`)}</dd></div>
                <div><dt>{t("announcements.dismissible")}</dt><dd>{t(detailAnnouncement.dismissible ? "announcements.dismissibleYes" : "announcements.dismissibleNo")}</dd></div>
                <div><dt>{t("announcements.publishedAt")}</dt><dd>{detailAnnouncement.publishedAt ? new Date(detailAnnouncement.publishedAt).toLocaleString(locale) : "-"}</dd></div>
                <div><dt>{t("announcements.expiresAt")}</dt><dd>{detailAnnouncement.expiresAt ? new Date(detailAnnouncement.expiresAt).toLocaleString(locale) : "-"}</dd></div>
                <div><dt>{t("announcements.createdAt")}</dt><dd>{new Date(detailAnnouncement.createdAt).toLocaleString(locale)}</dd></div>
                <div><dt>{t("announcements.updatedAt")}</dt><dd>{new Date(detailAnnouncement.updatedAt).toLocaleString(locale)}</dd></div>
              </dl>
            </section>
          </div>
        ) : null}
      </Modal>

      <ActionConfirmationModal
        cancelText={t("common.cancel")}
        confirmText={confirmationText?.confirm ?? ""}
        description={confirmationText?.description ?? ""}
        onCancel={() => setConfirmation(undefined)}
        onConfirm={() => {
          const current = confirmation;
          setConfirmation(undefined);
          if (current) void runAction(current.action, current.announcement);
        }}
        open={Boolean(confirmation)}
        pending={pending}
        title={confirmationText?.title ?? ""}
      />

      <Modal
        cancelText={t("common.cancel")}
        okButtonProps={{ disabled: reauthCode.length !== 6, loading: pending }}
        okText={t("common.verifyContinue")}
        onCancel={() => setReauthOpen(false)}
        onOk={reauthenticate}
        open={reauthOpen}
        title={t("common.reauthTitle")}
      >
        <div className="admin-dialog-form">
          <p className="admin-dialog-description">{t("common.reauthDescription")}</p>
          <AdminOtpInput onChange={setReauthCode} value={reauthCode} />
        </div>
      </Modal>
    </AdminPage>
  );
}
