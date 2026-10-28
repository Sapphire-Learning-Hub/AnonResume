"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createStyles } from "antd-style";
import { ReloadOutlined } from "@ant-design/icons";
import { useI18n } from "@/i18n/I18nProvider";
import type { ImageBlock } from "@/domain/resume/schema";

type ImageAccess = { slug?: string; jobId?: string };
const ImageAccessContext = createContext<ImageAccess>({});
export function ResumeImageAccess({
  access,
  children,
}: {
  access: ImageAccess;
  children: ReactNode;
}) {
  return <ImageAccessContext value={access}>{children}</ImageAccessContext>;
}
const useStyles = createStyles(({ css, token }) => ({
  frame: css`
    position: relative;
    &[role="button"] {
      cursor: pointer;
    }
    &[data-selected="true"],
    &:focus-visible {
      outline: 1px solid ${token.colorPrimary};
      outline-offset: 2px;
    }
  `,
  retry: css`
    position: absolute;
    inset: 0;
    margin: auto;
    width: 32px;
    height: 32px;
    border: 1px solid ${token.colorBorder};
    border-radius: ${token.borderRadius}px;
    background: ${token.colorBgContainer};
    color: ${token.colorText};
    cursor: pointer;
  `,
}));
export function ResumeImage({
  block,
  onSelect,
  selected,
}: {
  block: ImageBlock;
  onSelect?: () => void;
  selected?: boolean;
}) {
  const { styles } = useStyles();
  const { t } = useI18n();
  const [failedAsset, setFailedAsset] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const access = useContext(ImageAccessContext);
  const query = new URLSearchParams(access);
  const ratio = block.width / block.height;
  return (
    <div
      className={styles.frame}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      data-selected={selected || undefined}
      aria-label={onSelect ? block.alt || t("renderer.imageBlock") : undefined}
      onClick={onSelect}
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
      style={{
        width: `min(100%, ${block.width}px, calc(var(--resume-image-page-height, 1000px) * ${ratio}))`,
        aspectRatio: String(ratio),
        marginLeft: block.align === "left" ? 0 : "auto",
        marginRight: block.align === "right" ? 0 : "auto",
        overflow: "hidden",
        borderRadius: block.radius,
        flexShrink: 1,
      }}
    >
      {/* Asset URLs enforce owner, current publication or export-task authorization. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={attempt}
        data-resume-image="true"
        src={
          access.jobId
            ? `/pdf-export/${access.jobId}/assets/${block.assetId}`
            : `/api/resume-assets/${block.assetId}/content${query.size ? `?${query}` : ""}`
        }
        alt={block.alt}
        width={block.intrinsicWidth}
        height={block.intrinsicHeight}
        draggable={false}
        onError={() => setFailedAsset(block.assetId)}
        onLoad={() => setFailedAsset(undefined)}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          objectFit: block.fit,
          objectPosition: `${block.positionX}% ${block.positionY}%`,
        }}
      />
      {failedAsset === block.assetId ? (
        <button
          type="button"
          data-print-chrome="screen"
          className={styles.retry}
          aria-label={t("images.retry")}
          title={t("images.failed")}
          onClick={(event) => {
            event.stopPropagation();
            setFailedAsset(undefined);
            setAttempt((value) => value + 1);
          }}
        >
          <ReloadOutlined />
        </button>
      ) : null}
    </div>
  );
}
