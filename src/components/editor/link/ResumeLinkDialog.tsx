"use client";

import { useState, type FormEvent } from "react";

import {
  FileOutlined,
  MailOutlined,
  ProfileOutlined,
} from "@ant-design/icons";
import { Button, Input, Modal } from "antd";

import {
  getResumeSectionHref,
  getSectionIdFromResumeHref,
} from "@/domain/resume/section-links";
import { useI18n } from "@/i18n/I18nProvider";

import { useResumeLinkDialogStyles } from "./ResumeLinkDialog.style";

export interface ResumeLinkDraft {
  text: string;
  href: string;
  title: string;
}

interface ResumeLinkDialogProps {
  initial: ResumeLinkDraft;
  sections: Array<{ id: string; title: string }>;
  onApply: (draft: ResumeLinkDraft) => boolean;
  onCancel: () => void;
  onRemove: () => void;
}

type LinkTarget = "web" | "section" | "email";

function getInitialTarget(href: string, sections: ResumeLinkDialogProps["sections"]): LinkTarget {
  const sectionId = getSectionIdFromResumeHref(href);

  if (sectionId && sections.some((section) => section.id === sectionId)) return "section";
  if (href.startsWith("mailto:")) return "email";
  return "web";
}

function parseMailto(href: string) {
  if (!href.startsWith("mailto:")) return { email: "", subject: "" };

  try {
    const url = new URL(href);

    return {
      email: decodeURIComponent(url.pathname),
      subject: url.searchParams.get("subject") ?? "",
    };
  } catch {
    return { email: "", subject: "" };
  }
}

export function ResumeLinkDialog({
  initial,
  sections,
  onApply,
  onCancel,
  onRemove,
}: ResumeLinkDialogProps) {
  const { t } = useI18n();
  const { styles } = useResumeLinkDialogStyles();
  const mailto = parseMailto(initial.href);
  const [target, setTarget] = useState<LinkTarget>(() => getInitialTarget(initial.href, sections));
  const [text, setText] = useState(initial.text);
  const [title, setTitle] = useState(initial.title);
  const [address, setAddress] = useState(initial.href.startsWith("mailto:") || initial.href.startsWith("#") ? "" : initial.href);
  const [sectionId, setSectionId] = useState(getSectionIdFromResumeHref(initial.href) ?? "");
  const [email, setEmail] = useState(mailto.email);
  const [subject, setSubject] = useState(mailto.subject);
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!text.trim()) {
      setError(t("editor.linkDialog.textRequired"));
      return;
    }

    let href = "";

    if (target === "web") {
      href = address.trim();

      if (/^\s*(?:javascript|data|file):/i.test(href)) {
        setError(t("editor.linkDialog.unsafeAddress"));
        return;
      }
    } else if (target === "section") {
      if (!sections.some((section) => section.id === sectionId)) {
        setError(t("editor.linkDialog.sectionRequired"));
        return;
      }

      href = getResumeSectionHref(sectionId);
    } else {
      const recipient = email.trim();

      if (!/^[^\s@]+@[^\s@]+$/.test(recipient)) {
        setError(t("editor.linkDialog.emailRequired"));
        return;
      }

      href = `mailto:${recipient}${subject.trim() ? `?subject=${encodeURIComponent(subject.trim())}` : ""}`;
    }

    if (!href) {
      setError(t("editor.linkDialog.addressRequired"));
      return;
    }

    if (!onApply({ text, href, title: title.trim() })) {
      setError(t("editor.linkDialog.applyFailed"));
    }
  }

  const categories = [
    { id: "web" as const, icon: <FileOutlined />, label: t("editor.linkDialog.web") },
    { id: "section" as const, icon: <ProfileOutlined />, label: t("editor.linkDialog.section") },
    { id: "email" as const, icon: <MailOutlined />, label: t("editor.linkDialog.email") },
  ];

  return (
    <Modal
      open
      title={initial.href ? t("editor.linkDialog.edit") : t("editor.linkDialog.insert")}
      width={840}
      footer={null}
      onCancel={onCancel}
    >
      <div className={styles.layout}>
        <nav aria-label={t("editor.linkDialog.targetType")} className={styles.categories}>
          {categories.map((category) => (
            <Button
              aria-label={category.label}
              aria-pressed={target === category.id}
              className={styles.category}
              icon={category.icon}
              key={category.id}
              onClick={() => {
                setTarget(category.id);
                setError("");
              }}
            >
              {category.label}
            </Button>
          ))}
        </nav>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            {t("editor.linkDialog.displayText")}
            <Input
              autoFocus
              aria-label={t("editor.linkDialog.displayText")}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </label>

          <div className={styles.target}>
            {target === "web" ? (
              <label className={styles.field}>
                {t("editor.linkDialog.address")}
                <Input
                  aria-label={t("editor.linkDialog.address")}
                  placeholder={t("editor.linkPlaceholder")}
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                />
              </label>
            ) : null}

            {target === "section" ? (
              <>
                <p className={styles.hint}>{t("editor.linkDialog.sectionHint")}</p>
                <div aria-label={t("editor.linkDialog.sectionList")} className={styles.sectionList}>
                  {sections.map((section) => (
                    <Button
                      aria-label={section.title}
                      aria-pressed={sectionId === section.id}
                      className={styles.sectionButton}
                      key={section.id}
                      onClick={() => setSectionId(section.id)}
                    >
                      {section.title}
                    </Button>
                  ))}
                </div>
              </>
            ) : null}

            {target === "email" ? (
              <>
                <label className={styles.field}>
                  {t("editor.linkDialog.emailAddress")}
                  <Input
                    aria-label={t("editor.linkDialog.emailAddress")}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  {t("editor.linkDialog.subject")}
                  <Input
                    aria-label={t("editor.linkDialog.subject")}
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                  />
                </label>
              </>
            ) : null}
          </div>

          <label className={styles.field}>
            {t("editor.linkDialog.screenTip")}
            <Input
              aria-label={t("editor.linkDialog.screenTip")}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}

          <div className={styles.footer}>
            {initial.href ? (
              <Button className={styles.remove} danger onClick={onRemove}>
                {t("editor.clearLink")}
              </Button>
            ) : null}
            <Button onClick={onCancel}>{t("common.cancel")}</Button>
            <Button htmlType="submit" type="primary">
              {t("editor.linkDialog.confirm")}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
