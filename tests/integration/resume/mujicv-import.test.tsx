import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, waitFor } from "@testing-library/react";

import { ResumeRenderer } from "@/components/resume/ResumeRenderer";
import { importResumeMarkdown } from "@/domain/resume/import/markdown";
import { getPlainTextFromRichText } from "@/domain/resume/operations";
import {
  resumeDocumentSchema,
  type ResumeBlock,
} from "@/domain/resume/schema";

const source = readFileSync(
  join(process.cwd(), "tests/fixtures/resume/mujicv-current.md"),
  "utf8",
);
const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

afterEach(() => {
  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: originalGetBoundingClientRect,
  });
  window.document.documentElement.removeAttribute("data-print-ready");
  window.document.documentElement.removeAttribute("data-resume-pagination-ready");
});

function collectBlocks(blocks: ResumeBlock[]): ResumeBlock[] {
  return blocks.flatMap((block) => {
    if (block.type === "group" || block.type === "row") {
      return [block, ...collectBlocks(block.children)];
    }

    if (block.type === "list") {
      return [
        block,
        ...block.items.flatMap((item) => collectBlocks(item.children)),
      ];
    }

    return [block];
  });
}

describe("current Mujicv resume import", () => {
  it("creates the complete editable content structure", () => {
    const result = importResumeMarkdown({
      dialect: "mujicv",
      locale: "zh-CN",
      markdown: source,
    });
    const document = resumeDocumentSchema.parse(result.document);

    expect(document.meta.title).toBe("邹权");
    expect(document.sections.map((section) =>
      section.title ? getPlainTextFromRichText(section.title) : undefined,
    )).toEqual([
      "邹权",
      "技能",
      "开源经历",
      "实习经历",
      "教育背景",
      "项目",
    ]);
    expect(document.sections[0]?.titleStyle).toEqual({ fontSize: 28 });
    expect(result.report.diagnostics).toEqual([]);

    const allBlocks = collectBlocks(
      document.sections.flatMap((section) => section.blocks),
    );
    const icons = allBlocks.flatMap((block) =>
      block.type === "text"
        ? block.content.content.flatMap((paragraph) =>
            paragraph.content.filter((node) => node.type === "resumeIcon"),
          )
        : [],
    );

    expect(icons.map((icon) => icon.attrs.iconId)).toEqual([
      "lucide:info",
      "lucide:phone",
      "simple-icons:wechat",
      "simple-icons:juejin",
      "simple-icons:github",
    ]);

    const skillsSection = document.sections[1]!;
    const skillsList = skillsSection.blocks.find((block) => block.type === "list");

    expect(skillsList?.type).toBe("list");

    if (skillsList?.type !== "list") {
      throw new Error("Expected the skills section to contain a list");
    }

    expect(skillsList.items).toHaveLength(3);
    expect(skillsList.items.every((item) =>
      item.children.some((block) => block.type === "list"),
    )).toBe(true);

    const internshipSection = document.sections[3]!;
    expect(internshipSection.blocks.filter((block) => block.type === "row"))
      .toHaveLength(2);
    expect(allBlocks.some((block) =>
      (block.type === "group" || block.type === "row") && block.children.length === 0,
    )).toBe(false);

    const projectSection = document.sections[5]!;
    const projectTitles = projectSection.blocks.filter(
      (block) => block.type === "text" && block.style?.fontSize === 17,
    );

    expect(projectTitles).toHaveLength(2);
  });

  it("renders imported icons and content in view and print modes", async () => {
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        width: 794,
        height: 40,
        top: 0,
        right: 794,
        bottom: 40,
        left: 0,
        x: 0,
        y: 0,
        toJSON() {
          return {};
        },
      }),
    });
    const resumeDocument = importResumeMarkdown({
      dialect: "mujicv",
      locale: "zh-CN",
      markdown: source,
    }).document;
    const { container, rerender } = render(
      <ResumeRenderer document={resumeDocument} mode="view" />,
    );

    expect(screen.getByText("邹权")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-resume-icon-id]")).toHaveLength(5);

    rerender(<ResumeRenderer document={resumeDocument} mode="print" />);

    expect(container.querySelectorAll("[data-resume-icon-id]")).toHaveLength(5);
    await waitFor(() => {
      expect(window.document.documentElement).toHaveAttribute(
        "data-print-ready",
        "true",
      );
    });
  });

  it("renders standard Markdown ordered lists with decimal markers", () => {
    const resumeDocument = importResumeMarkdown({
      dialect: "standard",
      locale: "zh-CN",
      markdown: "# Name\n\n## Steps\n\n1. First\n2. Second",
    }).document;
    const { container } = render(
      <ResumeRenderer document={resumeDocument} mode="view" />,
    );
    const orderedList = container.querySelector("ol");

    expect(orderedList).toBeInTheDocument();
    expect(orderedList).toHaveStyle({ listStyleType: "decimal" });
  });
});
