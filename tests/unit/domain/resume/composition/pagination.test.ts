import {
  paginateMeasuredSections,
  type MeasuredResumeNode,
} from "@/domain/resume/pagination";
import { createResumePageBreakMap } from "@/domain/resume/page-flow/break-map";

function columns(): MeasuredResumeNode {
  return {
    id: "row",
    path: ["row"],
    type: "row",
    columnLayout: "image-right",
    direction: "horizontal",
    height: 250,
    children: [
      {
        id: "text",
        path: ["row", "text"],
        type: "text",
        height: 250,
        textLines: Array.from({ length: 10 }, (_, i) => ({
          height: 25,
          from: { paragraphIndex: 0, nodeIndex: 0, offset: i },
          to: { paragraphIndex: 0, nodeIndex: 0, offset: i + 1 },
        })),
      },
      { id: "photo", path: ["row", "photo"], type: "image", height: 80 },
    ],
  };
}
function run(blocks = [columns()]) {
  const sections = [
    { id: "section", titleHeight: 0, height: 300, topLevelGap: 0, blocks },
  ];
  return {
    sections,
    ...paginateMeasuredSections({ pageHeight: 100, sectionGap: 0, sections }),
  };
}
function countPath(value: unknown, path: string): number {
  if (!value || typeof value !== "object") return 0;
  if (Array.isArray(value))
    return value.reduce((total, item) => total + countPath(item, path), 0);
  const obj = value as Record<string, unknown>;
  return (
    (Array.isArray(obj.path) && obj.path.join("/") === path ? 1 : 0) +
    Object.entries(obj)
      .filter(([key]) => key !== "path")
      .reduce((total, [, child]) => total + countPath(child, path), 0)
  );
}

it("splits text at a fixed column width and emits the image only once", () => {
  const { pages } = run();
  expect(pages.map((page) => page.totalHeight)).toEqual([100, 100, 50]);
  expect(pages[0]?.sections[0]?.blocks[0]).toMatchObject({ continues: true });
  expect(countPath(pages, "row/photo")).toBe(1);
  expect(pages[1]?.sections[0]?.blocks[0]).toMatchObject({
    path: ["row"],
    continuation: true,
    columnLayout: "image-right",
    children: [{ path: ["row", "text"], textRange: { from: { offset: 4 } } }],
  });
});

it("relaxes impossible keep-with-next inside the text column while keeping the photo on its first page", () => {
  const row = columns();
  row.children![0] = {
    id: "group",
    path: ["row", "group"],
    type: "group",
    direction: "vertical",
    height: 220,
    childGap: 10,
    children: [
      { id: "lead", path: ["row", "group", "lead"], type: "row", height: 90 },
      {
        id: "list",
        path: ["row", "group", "list"],
        type: "list",
        height: 120,
        childGap: 0,
        children: [0, 1, 2].map((i) => ({
          id: `item-${i}`,
          path: ["row", "group", "list", `item-${i}`],
          type: "listItem",
          height: 40,
          wrapperHeight: 40,
        })),
      },
    ],
  };
  row.height = 220;
  const { pages } = run([row]);
  expect(pages.map((page) => page.totalHeight)).toEqual([90, 80, 40]);
  expect(countPath(pages, "row/photo")).toBe(1);
  expect(pages[0]?.sections[0]?.blocks[0]).toMatchObject({ continues: true });
  expect(pages[1]?.sections[0]?.blocks[0]).toMatchObject({
    columnLayout: "image-right",
    continuation: true,
  });
});

it("moves the whole column start when remaining space cannot hold the photo", () => {
  const { pages, sections } = run([
    { id: "before", path: ["before"], type: "text", height: 50 },
    columns(),
  ]);
  expect(pages.map((page) => page.totalHeight)).toEqual([50, 100, 100, 50]);
  const map = createResumePageBreakMap({
    pages,
    sections,
    pageHeight: 100,
    sectionGap: 0,
    pageGap: 20,
    pagePadding: { top: 10, right: 10, bottom: 10, left: 10 },
    revision: "1",
  });
  expect(map.breaks[0]).toMatchObject({
    kind: "structural",
    path: ["row"],
    spacerHeight: 90,
  });
  expect(map.breaks[1]).toMatchObject({
    kind: "text",
    path: ["row", "text"],
    textPosition: { offset: 4 },
  });
});

it("paginates nested vertical content and retains following blocks after a column continuation", () => {
  const row = columns();
  row.children![0] = {
    id: "group",
    path: ["row", "group"],
    type: "group",
    direction: "vertical",
    height: 250,
    children: [{ ...row.children![0]!, path: ["row", "group", "text"] }],
  };
  const { pages } = run([
    row,
    { id: "after", path: ["after"], type: "text", height: 30 },
  ]);
  expect(pages.map((page) => page.totalHeight)).toEqual([100, 100, 80]);
  expect(countPath(pages, "row/photo")).toBe(1);
  expect(countPath(pages, "after")).toBe(1);
});

it("accounts for unused left-column space when an indivisible photo is taller than the text fragment", () => {
  const row = columns();
  row.children![1]!.height = 95;
  row.children![0]!.textLines = row.children![0]!.textLines!.map((line) => ({
    ...line,
    height: 30,
  }));
  row.children![0]!.height = row.height = 300;
  const { pages, sections } = run([row]);
  const map = createResumePageBreakMap({
    pages,
    sections,
    pageHeight: 100,
    sectionGap: 0,
    pageGap: 20,
    pagePadding: { top: 10, right: 10, bottom: 10, left: 10 },
    revision: "1",
  });
  expect(map.breaks[0]?.spacerHeight).toBe(50);
  expect(map.columns?.[0]).toMatchObject({
    firstHeight: 95,
    leftHeight: 90,
    rightHeight: 95,
  });
});
