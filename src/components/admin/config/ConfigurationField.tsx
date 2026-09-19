"use client";

import { Button, Checkbox, Form, Input, InputNumber, Select, Space, Tag } from "antd";
import { createStyles } from "antd-style";

import type { ManagedConfigFieldView } from "@/lib/config/admin/types";

import {
  configurationNumberBounds,
  type ConfigurationFieldChange,
} from "./types";

const useStyles = createStyles(({ css, token }) => ({
  field: css`
    min-width: 0;
    padding: 14px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    background: ${token.colorBgContainer};
  `,
  metadata: css`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  `,
  secret: css`
    display: grid;
    gap: 10px;
  `,
}));

export function ConfigurationField({
  change,
  disabled,
  field,
  label,
  onChange,
  text,
}: {
  change?: ConfigurationFieldChange;
  disabled: boolean;
  field: ManagedConfigFieldView;
  label: string;
  onChange: (change?: ConfigurationFieldChange) => void;
  text: {
    cancelReplacement: string;
    clear: string;
    configured: string;
    hot: string;
    replace: string;
    restart: string;
    pendingClear: string;
  };
}) {
  const { styles } = useStyles();
  const replacementActive = field.sensitive && change?.operation === "set";
  const value = change?.operation === "set" ? change.value : field.value;
  const bounds = configurationNumberBounds[field.key];

  function metadata() {
    return (
      <div className={styles.metadata}>
        <Tag color={field.applyMode === "hot" ? "green" : "gold"}>
          {field.applyMode === "hot" ? text.hot : text.restart}
        </Tag>
        {field.consumers.map((consumer) => <Tag key={consumer}>{consumer}</Tag>)}
        {bounds ? (
          <Tag>
            {bounds.max === undefined
              ? `≥ ${bounds.min}`
              : `${bounds.min}–${bounds.max}`}
          </Tag>
        ) : null}
      </div>
    );
  }

  if (field.sensitive) {
    return (
      <div className={styles.field}>
        <Form.Item label={label}>
          <div className={styles.secret}>
            <Space wrap>
              <Tag color={field.configured ? "green" : "default"}>
                {change?.operation === "clear" ? text.pendingClear : text.configured}
              </Tag>
              {!replacementActive ? (
                <Button
                  disabled={disabled}
                  onClick={() => onChange({ operation: "set", value: "" })}
                  size="small"
                  type="link"
                >
                  {text.replace} {label}
                </Button>
              ) : null}
              <Button
                danger
                disabled={disabled || !field.configured}
                onClick={() => onChange({ operation: "clear" })}
                size="small"
                type="link"
              >
                {text.clear} {label}
              </Button>
            </Space>
            {replacementActive ? (
              <Space.Compact block>
                <Input.Password
                  aria-label={label}
                  autoComplete="new-password"
                  disabled={disabled}
                  value={typeof value === "string" ? value : ""}
                  onChange={(event) => onChange({
                    operation: "set",
                    value: event.target.value,
                  })}
                />
                <Button onClick={() => onChange(undefined)}>
                  {text.cancelReplacement}
                </Button>
              </Space.Compact>
            ) : null}
          </div>
        </Form.Item>
        {metadata()}
      </div>
    );
  }

  let control;
  if (typeof field.value === "boolean") {
    control = (
      <Checkbox
        aria-label={label}
        checked={Boolean(value)}
        disabled={disabled}
        onChange={(event) => onChange({ operation: "set", value: event.target.checked })}
      >
        {label}
      </Checkbox>
    );
  } else if (typeof field.value === "number") {
    control = (
      <InputNumber
        aria-label={label}
        disabled={disabled}
        max={bounds?.max}
        min={bounds?.min}
        precision={0}
        value={typeof value === "number" ? value : undefined}
        onChange={(next) => {
          if (next !== null) onChange({ operation: "set", value: next });
        }}
      />
    );
  } else if (Array.isArray(field.value)) {
    control = (
      <Select
        aria-label={label}
        disabled={disabled}
        mode="tags"
        open={false}
        tokenSeparators={[",", " "]}
        value={Array.isArray(value) ? value : []}
        onChange={(next) => onChange({ operation: "set", value: next })}
      />
    );
  } else {
    control = (
      <Input
        aria-label={label}
        disabled={disabled}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange({ operation: "set", value: event.target.value })}
      />
    );
  }

  return (
    <div className={styles.field}>
      <Form.Item label={typeof field.value === "boolean" ? undefined : label}>
        {control}
      </Form.Item>
      {metadata()}
    </div>
  );
}
