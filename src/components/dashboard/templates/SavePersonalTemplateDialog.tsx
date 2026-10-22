"use client";
import { Button, Input, Modal, Radio, Select } from "antd";
import { useId, useRef, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import {
  replacePersonalTemplateRequest,
  savePersonalTemplateRequest,
} from "@/lib/resume/templates/client";
import type {
  ReplaceTemplateInput,
  TemplateSource,
  TemplateSummary,
} from "@/lib/resume/templates/types";
import { usePersonalTemplates } from "./usePersonalTemplates";
import { useTemplateStyles } from "./styles";
import { useTemplateFeedback } from "./useTemplateFeedback";

export function SavePersonalTemplateDialog({
  open,
  initialName,
  prepareSource,
  onClose,
  onSaved,
}: {
  open: boolean;
  initialName: string;
  prepareSource: () => Promise<TemplateSource | null>;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { t } = useI18n();
  const { styles } = useTemplateStyles();
  const { report, toast } = useTemplateFeedback();
  const [mode, setMode] = useState<"new" | "replace">("new");
  const [name, setName] = useState(initialName);
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<TemplateSummary>();
  const [pending, setPending] = useState<ReplaceTemplateInput>();
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [previousOpen, setPreviousOpen] = useState(open);
  const library = usePersonalTemplates(search, open && mode === "replace");
  const requestIdentity = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );
  const nameId = useId();
  const selectId = useId();
  function reset() {
    setName(initialName);
    setMode("new");
    setTarget(undefined);
    setPending(undefined);
    setInvalid(false);
    setSearch("");
  }
  if (open !== previousOpen) {
    setPreviousOpen(open);
    if (open) reset();
  }
  const validName =
    name.trim().length > 0 && Array.from(name.trim()).length <= 100;
  function operationId(fingerprint: string) {
    if (requestIdentity.current?.fingerprint !== fingerprint)
      requestIdentity.current = { fingerprint, key: crypto.randomUUID() };
    return requestIdentity.current.key;
  }
  function complete(replaced: boolean) {
    toast.success({
      content: t(
        replaced ? "personalTemplates.updated" : "personalTemplates.saved",
      ),
      key: "personal-template-operation",
    });
    setPending(undefined);
    requestIdentity.current = null;
    onSaved?.();
    onClose();
  }
  async function submit() {
    if (busy) return;
    if (mode === "new" && !validName) {
      setInvalid(true);
      return;
    }
    if (mode === "replace" && !target) return;
    setBusy(true);
    try {
      const source = await prepareSource();
      if (!source) {
        toast.error({
          content: t("personalTemplates.saveBlocked"),
          key: "personal-template-operation",
        });
        return;
      }
      if (mode === "replace" && target) {
        const input = {
          ...source,
          templateId: target.id,
          templateVersion: target.version,
        };
        setPending({
          ...input,
          operationId: operationId(JSON.stringify(input)),
        });
      } else {
        const input = { ...source, name: name.trim() };
        await savePersonalTemplateRequest({
          ...input,
          operationId: operationId(JSON.stringify(input)),
        });
        complete(false);
      }
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }
  async function replace() {
    if (!pending || busy) return;
    setBusy(true);
    try {
      await replacePersonalTemplateRequest(pending);
      complete(true);
    } catch (error) {
      report(error);
      library.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Modal
        open={open}
        centered
        title={t("personalTemplates.save")}
        onCancel={() => {
          if (!busy) {
            requestIdentity.current = null;
            onClose();
          }
        }}
        onOk={() => void submit()}
        confirmLoading={busy}
        okText={t("personalTemplates.confirm")}
        cancelText={t("personalTemplates.cancel")}
        okButtonProps={{ disabled: mode === "replace" && !target }}
        cancelButtonProps={{ disabled: busy }}
      >
        <div className={styles.form}>
          <Radio.Group
            value={mode}
            disabled={busy}
            onChange={(event) => {
              setMode(event.target.value);
              setTarget(undefined);
            }}
            options={[
              { label: t("personalTemplates.new"), value: "new" },
              { label: t("personalTemplates.replace"), value: "replace" },
            ]}
          />
          {mode === "new" ? (
            <div className={styles.field}>
              <label htmlFor={nameId}>{t("personalTemplates.name")}</label>
              <Input
                id={nameId}
                value={name}
                disabled={busy}
                status={invalid && !validName ? "error" : undefined}
                aria-invalid={invalid && !validName}
                aria-describedby={
                  invalid && !validName ? `${nameId}-error` : undefined
                }
                onChange={(event) => setName(event.target.value)}
                onPressEnter={() => void submit()}
              />
              {invalid && !validName ? (
                <span id={`${nameId}-error`} role="alert">
                  {t("personalTemplates.nameInvalid")}
                </span>
              ) : null}
            </div>
          ) : (
            <div className={styles.field}>
              <label htmlFor={selectId}>{t("personalTemplates.target")}</label>
              <Select
                id={selectId}
                className={styles.control}
                showSearch={{ filterOption: false, onSearch: setSearch }}
                loading={library.busy}
                value={target?.id}
                disabled={busy}
                options={library.page.items.map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
                onChange={(value) =>
                  setTarget(
                    library.page.items.find((item) => item.id === value),
                  )
                }
              />
              {library.error ? (
                <Button onClick={library.refresh}>
                  {t("personalTemplates.retry")}
                </Button>
              ) : library.page.nextCursor ? (
                <Button onClick={() => void library.more()}>
                  {t("personalTemplates.more")}
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </Modal>
      <Modal
        open={Boolean(pending)}
        centered
        title={t("personalTemplates.confirmReplace")}
        onCancel={() => {
          if (!busy) setPending(undefined);
        }}
        onOk={() => void replace()}
        confirmLoading={busy}
        okText={t("personalTemplates.confirm")}
        cancelText={t("personalTemplates.cancel")}
        cancelButtonProps={{ disabled: busy }}
      >
        {t("personalTemplates.replaceNotice")}
      </Modal>
    </>
  );
}
