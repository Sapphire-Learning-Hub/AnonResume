import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { createRichTextFromPlainText } from "@/domain/resume/operations";
import { findResumeMatches } from "@/domain/resume/search/document";
import { resolveCanvasSearchRanges } from "@/components/editor/search/canvas-ranges";

function fixture() {
  const document = createDefaultResumeDocument();
  document.sections = [
    {
      id: "section",
      visible: true,
      blocks: [
        {
          id: "block",
          type: "text",
          content: createRichTextFromPlainText("before needle after"),
        },
      ],
    },
  ];
  const match = findResumeMatches(document, {
    text: "needle",
    caseSensitive: true,
  })[0]!;
  return { document, match };
}

it("locates a match through differently formatted DOM text without changing the document markup", () => {
  const { document: value, match } = fixture();
  const root = document.createElement("div");
  root.innerHTML =
    '<section data-resume-section-id="section"><div data-resume-block-path="block"><p><span data-resume-rich-paragraph-index="0" data-resume-rich-node-index="0" data-resume-rich-node-type="text">before <b>nee</b>dle after</span></p></div></section>';
  const before = root.innerHTML;
  expect(
    resolveCanvasSearchRanges(root, value, match)
      .map((range) => range.toString())
      .join(""),
  ).toBe("needle");
  expect(root.innerHTML).toBe(before);
});

it("maps source offsets through paginated fragments and ignores hidden editor placeholders", () => {
  const { document: value, match } = fixture();
  const root = document.createElement("div");
  root.innerHTML =
    '<section data-resume-section-id="section"><div data-resume-block-path="block"><div aria-hidden="true"><span data-resume-rich-paragraph-index="0" data-resume-rich-node-index="0" data-resume-rich-node-type="text">before needle after</span></div></div><div data-resume-block-path="block" data-resume-source-range=\'{"from":{"paragraphIndex":0,"nodeIndex":0,"offset":0},"to":{"paragraphIndex":0,"nodeIndex":0,"offset":10}}\'><span data-resume-rich-paragraph-index="0" data-resume-rich-node-index="0" data-resume-rich-node-type="text">before nee</span></div></section><section data-resume-section-id="section"><div data-resume-block-path="block" data-resume-source-range=\'{"from":{"paragraphIndex":0,"nodeIndex":0,"offset":10},"to":{"paragraphIndex":0,"nodeIndex":0,"offset":19}}\'><span data-resume-rich-paragraph-index="0" data-resume-rich-node-index="0" data-resume-rich-node-type="text">dle after</span></div></section>';
  const ranges = resolveCanvasSearchRanges(root, value, match);
  expect(ranges.map((range) => range.toString())).toEqual(["nee", "dle"]);
});
