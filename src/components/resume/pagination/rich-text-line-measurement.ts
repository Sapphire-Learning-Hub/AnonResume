import type { RichTextPosition } from "@/domain/resume/page-flow/rich-text-range";
import type { MeasuredRichTextLine } from "@/domain/resume/pagination";

export interface MeasuredInlineSegment {
  from: RichTextPosition;
  to: RichTextPosition;
  rect: { top: number; bottom: number };
}

// Glyph bounds vary with the font and inline icons even on the same baseline.
// Compare their vertical overlap, not their top coordinates. Requiring most of
// the smaller glyph to overlap also separates tightly spaced adjacent lines.
function sharesVisualLine(
  left: MeasuredInlineSegment["rect"],
  right: MeasuredInlineSegment["rect"],
) {
  const overlap = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
  const smallerHeight = Math.min(left.bottom - left.top, right.bottom - right.top);
  return smallerHeight > 0 && overlap > smallerHeight / 2;
}

export function measureInlineSegments(
  segments: readonly MeasuredInlineSegment[],
  scale = 1,
): MeasuredRichTextLine[] {
  const lines: MeasuredRichTextLine[] = [];
  const first = segments[0];
  if (!first) return lines;
  let start = first;
  let end = start.to;
  let bounds = { top: start.rect.top, bottom: start.rect.bottom };

  const finish = () => {
    lines.push({
      from: start.from,
      to: end,
      height: Math.max(1, Math.ceil((bounds.bottom - bounds.top) / scale)),
    });
  };
  for (const current of segments.slice(1)) {
    if (
      current.from.paragraphIndex !== start.from.paragraphIndex ||
      !sharesVisualLine(bounds, current.rect)
    ) {
      finish();
      start = current;
      bounds = { top: current.rect.top, bottom: current.rect.bottom };
    } else {
      bounds.top = Math.min(bounds.top, current.rect.top);
      bounds.bottom = Math.max(bounds.bottom, current.rect.bottom);
    }
    end = current.to;
  }
  finish();
  return lines;
}
