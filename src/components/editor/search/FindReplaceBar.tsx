"use client";

import {
  CloseOutlined,
  DownOutlined,
  UpOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { Button, Checkbox, Input, Tooltip, type InputRef } from "antd";
import { useEffect, useRef, type KeyboardEvent } from "react";
import type { ResumeSearchQuery } from "@/domain/resume/search/types";
import { useI18n } from "@/i18n/I18nProvider";
import { useFindReplaceBarStyles } from "./FindReplaceBar.style";

export interface FindReplaceBarProps {
  query: ResumeSearchQuery;
  replacement: string;
  index: number;
  count: number;
  mode: "document" | "markdown";
  expanded: boolean;
  focusRequest?: number;
  onQuery: (query: ResumeSearchQuery) => void;
  onReplacement: (value: string) => void;
  onNavigate: (direction: 1 | -1) => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onToggle: () => void;
  onClose: () => void;
}

export function FindReplaceBar(props: FindReplaceBarProps) {
  const { t } = useI18n();
  const { styles } = useFindReplaceBarStyles();
  const inputRef = useRef<InputRef>(null);
  useEffect(() => {
    inputRef.current?.focus({ cursor: "all" });
  }, [props.focusRequest]);
  const disabled = !props.query.text || props.count === 0;
  const count = !props.query.text
    ? t("editor.search.empty")
    : props.count
      ? t("editor.search.position", {
          current: props.index + 1,
          total: props.count,
        })
      : t("editor.search.none");

  function handleKeyDown(event: KeyboardEvent) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      props.onClose();
    }
    if (event.key === "Enter" && event.target === inputRef.current?.input) {
      event.preventDefault();
      event.stopPropagation();
      if (!disabled) props.onNavigate(event.shiftKey ? -1 : 1);
    }
  }

  return (
    <section
      data-resume-search-bar="true"
      aria-label={t("editor.search.open")}
      className={styles.root}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.heading}>
        <span>
          {t(
            props.mode === "markdown"
              ? "editor.search.markdown"
              : "editor.search.document",
          )}
        </span>
        <output
          aria-label={t("editor.search.matches")}
          aria-live="polite"
          className={styles.counter}
        >
          {count}
        </output>
      </div>
      <div className={styles.row}>
        <Tooltip title={t("editor.search.toggle")}>
          <Button
            type="text"
            size="small"
            className={styles.icon}
            aria-label={t("editor.search.toggle")}
            aria-expanded={props.expanded}
            icon={props.expanded ? <DownOutlined /> : <RightOutlined />}
            onClick={props.onToggle}
          />
        </Tooltip>
        <Input
          ref={inputRef}
          size="small"
          className={styles.input}
          aria-label={t("editor.search.find")}
          value={props.query.text}
          onChange={(event) =>
            props.onQuery({ ...props.query, text: event.target.value })
          }
        />
        <Tooltip title={t("editor.search.caseSensitive")}>
          <Checkbox
            className={styles.case}
            aria-label={t("editor.search.caseSensitive")}
            checked={props.query.caseSensitive}
            onChange={(event) =>
              props.onQuery({
                ...props.query,
                caseSensitive: event.target.checked,
              })
            }
          >
            Aa
          </Checkbox>
        </Tooltip>
        <Tooltip title={t("editor.search.previous")}>
          <Button
            type="text"
            size="small"
            className={styles.icon}
            aria-label={t("editor.search.previous")}
            icon={<UpOutlined />}
            disabled={disabled}
            onClick={() => props.onNavigate(-1)}
          />
        </Tooltip>
        <Tooltip title={t("editor.search.next")}>
          <Button
            type="text"
            size="small"
            className={styles.icon}
            aria-label={t("editor.search.next")}
            icon={<DownOutlined />}
            disabled={disabled}
            onClick={() => props.onNavigate(1)}
          />
        </Tooltip>
        <Tooltip title={t("editor.search.close")}>
          <Button
            type="text"
            size="small"
            className={styles.icon}
            aria-label={t("editor.search.close")}
            icon={<CloseOutlined />}
            onClick={props.onClose}
          />
        </Tooltip>
      </div>
      {props.expanded ? (
        <div className={styles.row} data-replacement="true">
          <Input
            size="small"
            className={styles.input}
            aria-label={t("editor.search.replacement")}
            value={props.replacement}
            onChange={(event) => props.onReplacement(event.target.value)}
          />
          <Button size="small" disabled={disabled} onClick={props.onReplace}>
            {t("editor.search.replace")}
          </Button>
          <Button size="small" disabled={disabled} onClick={props.onReplaceAll}>
            {t("editor.search.replaceAll")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
