"use client";
import { InlineMetadata } from "@/components/ui/InlineMetadata";
import { UploadOutlined, MoreOutlined } from "@ant-design/icons";
import {
  Button,
  Dropdown,
  Empty,
  Image,
  Input,
  Modal,
  Pagination,
  Popconfirm,
  Progress,
  Result,
  Space,
  Spin,
  Typography,
} from "antd";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import {
  fetchImageLibrary,
  mutateImage,
  uploadImageRequest,
  ImageRequestError,
  type ImageLibraryResult,
  type ImageSummary,
} from "@/lib/resume/assets/client";
import { createImageBlock } from "@/domain/resume/images/model";
import { serializeImageMarkdown } from "@/domain/resume/images/markdown";
import { useImageLibraryStyles } from "./styles";

const errorKeys: Record<string, MessageKey> = {
  image_invalid: "images.invalid",
  image_too_large: "images.tooLarge",
  image_quota_exceeded: "images.quotaExceeded",
  image_busy: "images.busy",
  image_not_found: "images.notFound",
  image_storage_unavailable: "images.storageUnavailable",
  image_upload_disabled: "images.disabled",
  unauthorized: "personalTemplates.signIn",
};
export function ImageLibrary({
  onSelect,
}: {
  onSelect?: (image: ImageSummary) => void;
}) {
  const { t } = useI18n();
  const { styles } = useImageLibraryStyles();
  const { toast, notification, failure } = useAppFeedback();
  const [filter, setFilter] = useState({ query: "", page: 1, refresh: 0 });
  const [data, setData] = useState<ImageLibraryResult>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [upload, setUpload] = useState<{ name: string; percent: number }>();
  const [failedFiles, setFailedFiles] = useState<File[]>([]);
  const [rename, setRename] = useState<ImageSummary>();
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const activeUpload = useRef<AbortController | null>(null);
  const refresh = () =>
    setFilter((previous) => ({ ...previous, refresh: previous.refresh + 1 }));
  function report(error: unknown) {
    const key =
      error instanceof ImageRequestError
        ? (errorKeys[error.code] ?? "images.error")
        : "images.error";
    if (error instanceof ImageRequestError && error.code === "unauthorized")
      notification.error({
        key: "image-auth",
        title: t(key),
        duration: false,
        actions: (
          <Button href="/sign-in">{t("personalTemplates.signInAction")}</Button>
        ),
      });
    else
      failure(error, {
        key: "image-operation",
        title: t(key),
        actions: <Button onClick={refresh}>{t("images.retry")}</Button>,
      });
  }
  useEffect(() => {
    const controller = new AbortController();
    void fetchImageLibrary(filter.query, filter.page, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setData(value);
          setFailed(false);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setFailed(true);
          if (
            error instanceof ImageRequestError &&
            error.code === "unauthorized"
          )
            notification.error({
              key: "image-auth",
              title: t("personalTemplates.signIn"),
              duration: false,
              actions: (
                <Button href="/sign-in">
                  {t("personalTemplates.signInAction")}
                </Button>
              ),
            });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filter, notification, t]);
  useEffect(() => () => activeUpload.current?.abort(), []);
  async function uploadFiles(files: File[]) {
    if (activeUpload.current) return;
    const controller = new AbortController();
    activeUpload.current = controller;
    try {
      for (const file of files.slice(0, 10)) {
        if (controller.signal.aborted) break;
        setUpload({ name: file.name, percent: 0 });
        setFailedFiles((previous) => previous.filter((item) => item !== file));
        try {
          if (data && file.size > data.uploadLimitBytes)
            throw new ImageRequestError("image_too_large");
          await uploadImageRequest(
            file,
            (percent) => setUpload({ name: file.name, percent }),
            controller.signal,
          );
          if (!controller.signal.aborted)
            toast.success({
              key: "image-upload",
              content: t("images.uploaded"),
            });
        } catch (error) {
          if (!controller.signal.aborted) {
            setFailedFiles((previous) => [...previous, file]);
            report(error);
          }
        }
      }
    } finally {
      activeUpload.current = null;
      if (!controller.signal.aborted) {
        setUpload(undefined);
        refresh();
      }
    }
  }
  return (
    <section className={styles.root}>
      <div className={styles.toolbar}>
        <Input.Search
          className={styles.search}
          placeholder={t("images.search")}
          aria-label={t("images.search")}
          allowClear
          maxLength={100}
          onSearch={(query) => {
            setLoading(true);
            setFilter((previous) => ({ ...previous, query, page: 1 }));
          }}
        />
        <Space wrap>
          {data ? (
            <span className={styles.hint}>
              {t("images.quota", {
                used: (data.usedBytes / 1048576).toFixed(1),
                total: (data.quotaBytes / 1048576).toFixed(0),
              })}
            </span>
          ) : null}
          <Button
            type="primary"
            icon={<UploadOutlined />}
            disabled={!data?.uploadEnabled || Boolean(upload)}
            onClick={() => fileInput.current?.click()}
          >
            {t("images.upload")}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void uploadFiles(files);
            }}
          />
        </Space>
      </div>
      {data ? (
        <span className={styles.hint}>
          {data.uploadEnabled
            ? t("images.limits", { limit: data.uploadLimitBytes / 1048576 })
            : t("images.disabled")}
        </span>
      ) : null}
      {upload ? (
        <div className={styles.progress}>
          <span>{upload.name}</span>
          <Progress percent={upload.percent} status="active" />
        </div>
      ) : null}
      {failedFiles.map((file, index) => (
        <div key={`${file.name}-${index}`} className={styles.toolbar}>
          <span>{file.name}</span>
          <Button
            disabled={Boolean(upload)}
            onClick={() => void uploadFiles([file])}
          >
            {t("images.retry")}
          </Button>
        </div>
      ))}
      {failed ? (
        <Result
          status="warning"
          title={t("images.failed")}
          extra={<Button onClick={refresh}>{t("images.retry")}</Button>}
        />
      ) : (
        <Spin spinning={loading}>
          {data?.items.length ? (
            <div className={styles.grid}>
              {data.items.map((image) => (
                <article key={image.id} className={styles.card}>
                  <div className={styles.preview}>
                    <Image
                      src={`/api/resume-assets/${image.id}/content?variant=thumbnail`}
                      alt={image.name}
                      style={{ maxHeight: 180, objectFit: "contain" }}
                      preview={{
                        src: `/api/resume-assets/${image.id}/content`,
                      }}
                    />
                  </div>
                  <Typography.Text className={styles.name} title={image.name}>
                    {image.name}
                  </Typography.Text>
                  <span className={styles.hint}>
                    <InlineMetadata><span>{image.width} × {image.height}</span><span>{(image.bytes / 1024).toFixed(0)} KiB</span></InlineMetadata>
                  </span>
                  <div className={styles.actions}>
                    {onSelect ? (
                      <Button type="primary" onClick={() => onSelect(image)}>
                        {t("images.select")}
                      </Button>
                    ) : null}
                    <Dropdown
                      menu={{
                        items: [
                          {
                            key: "rename",
                            label: t("images.rename"),
                            onClick: () => {
                              setRename(image);
                              setName(image.name);
                              setRenameOpen(true);
                            },
                          },
                          {
                            key: "copy",
                            label: t("images.copyMarkdown"),
                            onClick: () => {
                              void navigator.clipboard
                                .writeText(
                                  serializeImageMarkdown(
                                    createImageBlock(image),
                                  ),
                                )
                                .then(
                                  () =>
                                    toast.success({
                                      key: "image-copy",
                                      content: t("images.copied"),
                                    }),
                                  report,
                                );
                            },
                          },
                        ],
                      }}
                    >
                      <Button
                        icon={<MoreOutlined />}
                        aria-label={t("images.rename")}
                      />
                    </Dropdown>
                    <Popconfirm
                      title={t("images.remove")}
                      description={t("images.removeNotice")}
                      onConfirm={async () => {
                        try {
                          await mutateImage(image.id);
                          toast.success({
                            key: "image-remove",
                            content: t("images.removed"),
                          });
                          refresh();
                        } catch (error) {
                          report(error);
                        }
                      }}
                    >
                      <Button danger>{t("images.remove")}</Button>
                    </Popconfirm>
                  </div>
                </article>
              ))}
            </div>
          ) : !loading ? (
            <Empty description={t("images.empty")} />
          ) : (
            <div style={{ minHeight: 180 }} />
          )}
        </Spin>
      )}
      {data && data.total > 20 ? (
        <Pagination
          current={filter.page}
          pageSize={20}
          total={data.total}
          showSizeChanger={false}
          onChange={(page) => {
            setLoading(true);
            setFilter((previous) => ({ ...previous, page }));
          }}
        />
      ) : null}
      <Modal
        open={renameOpen}
        title={t("images.rename")}
        confirmLoading={busy}
        okText={t("images.save")}
        cancelText={t("images.cancel")}
        onCancel={() => setRenameOpen(false)}
        onOk={async () => {
          if (!rename || !name.trim() || busy) return;
          setBusy(true);
          try {
            await mutateImage(rename.id, name.trim());
            setRenameOpen(false);
            refresh();
            toast.success({
              key: "image-rename",
              content: t("images.updated"),
            });
          } catch (error) {
            report(error);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input
          aria-label={t("images.name")}
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Modal>
    </section>
  );
}
