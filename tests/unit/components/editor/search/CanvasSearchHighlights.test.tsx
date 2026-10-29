import { createRef } from "react";
import { act, render } from "@testing-library/react";
import { CanvasSearchHighlights } from "@/components/editor/search/CanvasSearchHighlights";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { createRichTextFromPlainText } from "@/domain/resume/operations";
import { findResumeMatches } from "@/domain/resume/search/document";
import type { TiptapTextBlockEditorHandle } from "@/components/resume/TiptapTextBlockEditor";

it("waits for settled pagination before navigating to the actual text location", () => {
  const document = createDefaultResumeDocument();
  document.sections = [
    {
      id: "section",
      visible: true,
      blocks: [
        {
          id: "block",
          type: "text",
          content: createRichTextFromPlainText("needle"),
        },
      ],
    },
  ];
  const matches = findResumeMatches(document, {
    text: "needle",
    caseSensitive: true,
  });
  const viewport = window.document.createElement("div");
  viewport.innerHTML =
    '<section data-resume-section-id="section"><div data-resume-block-path="block"><span data-resume-rich-node-type="text" data-resume-rich-paragraph-index="0" data-resume-rich-node-index="0">needle</span></div></section>';
  window.document.body.append(viewport);
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 100, 800, 500),
  );
  vi.spyOn(Range.prototype, "getClientRects").mockImplementation(() => {
    const rect = new DOMRect(50, 1000 - viewport.scrollTop, 50, 20);
    return {
      0: rect,
      length: 1,
      item: () => rect,
      [Symbol.iterator]: () => [rect][Symbol.iterator](),
    };
  });
  const props = {
    viewportRef: { current: viewport },
    document,
    matches,
    currentKey: matches[0]!.key,
    selection: {},
    editorRef: createRef<TiptapTextBlockEditorHandle>(),
    navigationRequest: 1,
  };
  const { rerender, unmount } = render(
    <CanvasSearchHighlights {...props} paginationReady={false} />,
  );
  act(() => {
    frames.splice(0).forEach((frame) => frame(0));
  });
  expect(viewport.scrollTop).toBe(0);
  rerender(<CanvasSearchHighlights {...props} paginationReady />);
  act(() => {
    frames.splice(0).forEach((frame) => frame(0));
  });
  expect(viewport.scrollTop).toBeGreaterThan(0);
  expect(1000 - viewport.scrollTop).toBeGreaterThanOrEqual(100);
  expect(1000 - viewport.scrollTop).toBeLessThan(600);
  unmount();
  viewport.remove();
  vi.restoreAllMocks();
});
