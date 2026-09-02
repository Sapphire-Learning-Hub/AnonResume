"use client";

import { useState } from "react";

import { Input, type InputProps } from "antd";

export function DraftInput<T>({
  onBlur,
  onChange,
  onFocus,
  onValidValueChange,
  parseValue,
  value,
  ...props
}: Omit<InputProps, "value"> & {
  onValidValueChange: (value: T) => void;
  parseValue: (value: string) => T | undefined;
  value: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  return (
    <Input
      {...props}
      value={editing ? draft : value}
      onBlur={(event) => {
        setEditing(false);
        onBlur?.(event);
      }}
      onChange={(event) => {
        const nextDraft = event.target.value;
        const parsedValue = parseValue(nextDraft);

        setEditing(true);
        setDraft(nextDraft);
        onChange?.(event);

        if (parsedValue !== undefined) {
          onValidValueChange(parsedValue);
        }
      }}
      onFocus={(event) => {
        setEditing(true);
        setDraft(value);
        onFocus?.(event);
      }}
    />
  );
}
