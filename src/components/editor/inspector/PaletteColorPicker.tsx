"use client";

import { ColorPicker } from "antd";

const RESUME_COLOR_PALETTE = [
  "#0f62fe",
  "#2563eb",
  "#0f766e",
  "#059669",
  "#ca8a04",
  "#ea580c",
  "#dc2626",
  "#be123c",
  "#7c3aed",
  "#0f172a",
  "#475569",
];

function isHexColor(value: string) {
  return /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value);
}

export function PaletteColorPicker({
  className,
  label,
  paletteLabel,
  onChange,
  placeholder,
  value,
}: {
  className: string;
  label: string;
  paletteLabel: string;
  onChange: (color: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div className={className}>
      <ColorPicker
        aria-label={`${label}${paletteLabel}`}
        disabledAlpha
        disabledFormat
        format="hex"
        placement="bottomRight"
        presets={[{ label: paletteLabel, colors: RESUME_COLOR_PALETTE }]}
        styles={{
          root: {
            width: "100%",
            height: 28,
            padding: 0,
            border: "none",
            borderRadius: 6,
            background: "transparent",
            boxShadow: "none",
          },
          body: {
            width: "100%",
            height: "100%",
            borderRadius: 6,
          },
          content: {
            borderRadius: 6,
          },
        }}
        value={isHexColor(value) ? value : placeholder}
        onChangeComplete={(color) => onChange(color.toHexString())}
      />
    </div>
  );
}
