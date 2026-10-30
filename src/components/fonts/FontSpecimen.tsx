import { InlineMetadata } from "@/components/ui/InlineMetadata";
import type { ResumeFontPreset } from "@/domain/resume/font-presets";

export function FontSpecimen({
  preset,
  previewText,
}: {
  preset: ResumeFontPreset;
  previewText: string;
}) {
  return (
    <div data-font-specimen={preset.id} style={{ fontFamily: preset.resolvedFontFamily }}>
      <strong style={{ display: "block", fontSize: 28, lineHeight: 1.25 }}>
        林知远 Lin Zhiyuan
      </strong>
      <span style={{ display: "block", fontSize: 16, marginTop: 8 }}>
        <InlineMetadata><span>产品设计师</span><span>Product Designer</span><span>2026</span></InlineMetadata>
      </span>
      <p style={{ fontSize: 15, lineHeight: 1.65, marginBottom: 0 }}>
        {previewText}
      </p>
    </div>
  );
}
