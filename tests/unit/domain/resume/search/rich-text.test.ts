import type { RichTextContent } from "@/domain/resume/schema";
import {
  findRichTextMatches,
  replaceRichTextMatches,
} from "@/domain/resume/search/rich-text";

const query = (text: string, caseSensitive = false) => ({
  text,
  caseSensitive,
});
const doc = (
  content: RichTextContent["content"][number]["content"],
): RichTextContent => ({
  type: "doc",
  content: [{ type: "paragraph", content }],
});

it("matches across formatting nodes and preserves unaffected marks and the first matching style", () => {
  const content = doc([
    { type: "text", text: "使用 " },
    { type: "text", text: "Type", marks: [{ type: "bold" }] },
    {
      type: "text",
      text: "Script",
      marks: [{ type: "textColor", attrs: { color: "#123456" } }],
    },
    { type: "text", text: " 开发", marks: [{ type: "italic" }] },
  ]);
  expect(findRichTextMatches(content, query("typescript"))).toEqual([
    { paragraphIndex: 0, from: 3, to: 13, text: "TypeScript" },
  ]);
  expect(
    replaceRichTextMatches(content, query("typescript"), "JavaScript"),
  ).toEqual({
    count: 1,
    content: doc([
      { type: "text", text: "使用 " },
      { type: "text", text: "JavaScript", marks: [{ type: "bold" }] },
      { type: "text", text: " 开发", marks: [{ type: "italic" }] },
    ]),
  });
  expect(content.content[0]!.content[1]).toMatchObject({ text: "Type" });
});

it("preserves a link only for a match fully inside the same link", () => {
  const link = {
    type: "link" as const,
    attrs: { href: "mailto:hello@example.test", underline: false },
  };
  const content = doc([
    { type: "text", text: "contact", marks: [link] },
    { type: "text", text: " me" },
  ]);
  expect(
    replaceRichTextMatches(content, query("contact"), "联系").content
      .content[0]!.content[0],
  ).toEqual({ type: "text", text: "联系", marks: [link] });
  expect(
    replaceRichTextMatches(content, query("contact me"), "联系我").content
      .content[0]!.content,
  ).toEqual([{ type: "text", text: "联系我" }]);
});

it("treats special characters literally and uses accurate UTF16 offsets", () => {
  const content = doc([{ type: "text", text: "😀C++ $5 C++ c++" }]);
  expect(
    findRichTextMatches(content, query("C++", true)).map(({ from, to }) => [
      from,
      to,
    ]),
  ).toEqual([
    [2, 5],
    [9, 12],
  ]);
  expect(
    replaceRichTextMatches(content, query("C++"), "$&").content.content[0]!
      .content,
  ).toEqual([{ type: "text", text: "😀$& $5 $& $&" }]);
  expect(findRichTextMatches(content, query(""))).toEqual([]);
});

it("never matches through icons, hard breaks or different paragraphs", () => {
  const content = doc([
    { type: "text", text: "a" },
    { type: "resumeIcon", attrs: { iconId: "github" } },
    { type: "text", text: "b" },
    { type: "hardBreak" },
    { type: "text", text: "c" },
  ]);
  content.content.push({
    type: "paragraph",
    content: [{ type: "text", text: "d" }],
  });
  expect(findRichTextMatches(content, query("ab"))).toEqual([]);
  expect(findRichTextMatches(content, query("bc"))).toEqual([]);
  expect(findRichTextMatches(content, query("cd"))).toEqual([]);
  expect(replaceRichTextMatches(content, query("b"), "").content).toEqual({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "a" },
          { type: "resumeIcon", attrs: { iconId: "github" } },
          { type: "hardBreak" },
          { type: "text", text: "c" },
        ],
      },
      { type: "paragraph", content: [{ type: "text", text: "d" }] },
    ],
  });
});

it("supports replacing a single occurrence and leaves a legal empty paragraph", () => {
  const content = doc([{ type: "text", text: "one one" }]);
  expect(
    replaceRichTextMatches(content, query("one"), "", {
      paragraphIndex: 0,
      from: 4,
      to: 7,
    }).content,
  ).toEqual(doc([{ type: "text", text: "one " }]));
  expect(
    replaceRichTextMatches(
      doc([{ type: "text", text: "one" }]),
      query("one"),
      "",
    ).content,
  ).toEqual(doc([]));
  expect(replaceRichTextMatches(content, query("absent"), "x").content).toBe(
    content,
  );
  expect(replaceRichTextMatches(content, query("one"), "one")).toEqual({
    content,
    count: 0,
  });
});

it.each(["[x]", "(x)", "a.b", "a\\b", "$5", "a|b", "a?", "x{2}", "^x$"])(
  "matches the literal search term %s",
  (term) => {
    expect(
      findRichTextMatches(
        doc([{ type: "text", text: `before ${term} after` }]),
        query(term),
      ),
    ).toEqual([
      { paragraphIndex: 0, from: 7, to: 7 + term.length, text: term },
    ]);
  },
);
