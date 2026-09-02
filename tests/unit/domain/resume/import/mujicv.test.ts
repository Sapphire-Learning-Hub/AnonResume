import { getPlainTextFromRichText } from "@/domain/resume/operations";
import { importResumeMarkdown } from "@/domain/resume/import/markdown";

describe("importResumeMarkdown Mujicv dialect", () => {
  it("auto-detects Mujicv containers and maps paired columns", () => {
    const result = importResumeMarkdown({
      dialect: "auto",
      locale: "zh-CN",
      markdown: [
        "# 邹权",
        "",
        ":::left",
        "",
        "**Ant Design - Contributor**",
        "",
        ":::",
        "",
        "::: right",
        "",
        "**2026.03 - 至今**",
        "",
        ":::",
      ].join("\n"),
    });

    expect(result.report.detectedDialect).toBe("mujicv");
    expect(result.report.diagnostics).toEqual([
      expect.objectContaining({ code: "dialect_auto_detected", line: 3 }),
    ]);

    const row = result.document.sections[0]?.blocks[1];

    expect(row).toMatchObject({
      type: "row",
      justify: "between",
      children: [
        expect.objectContaining({ type: "group" }),
        expect.objectContaining({ type: "group" }),
      ],
    });

    if (row?.type !== "row") {
      throw new Error("Expected paired Mujicv containers to become a row");
    }

    const right = row.children[1];

    expect(right?.type).toBe("group");

    if (right?.type !== "group") {
      throw new Error("Expected a right-side group");
    }

    expect(right.children[0]).toMatchObject({
      type: "text",
      style: { align: "right" },
    });
  });

  it("maps known icons and keeps linked labels editable", () => {
    const result = importResumeMarkdown({
      dialect: "mujicv",
      locale: "zh-CN",
      markdown: [
        "# 邹权",
        "",
        "icon:info 男/2005.12 icon:phone 19824448176",
        "",
        "[icon:weixin L2XZQDesigned](weixin://profile) [icon:juejin ZQDesigned](https://juejin.cn/u) [icon:github GitHub](https://github.com/u)",
      ].join("\n"),
    });
    const blocks = result.document.sections[0]?.blocks ?? [];
    const nodes = blocks.flatMap((block) =>
      block.type === "text"
        ? block.content.content.flatMap((paragraph) => paragraph.content)
        : [],
    );

    expect(nodes.filter((node) => node.type === "resumeIcon")).toEqual([
      { type: "resumeIcon", attrs: { iconId: "lucide:info" } },
      { type: "resumeIcon", attrs: { iconId: "lucide:phone" } },
      { type: "resumeIcon", attrs: { iconId: "simple-icons:wechat" } },
      { type: "resumeIcon", attrs: { iconId: "simple-icons:juejin" } },
      { type: "resumeIcon", attrs: { iconId: "simple-icons:github" } },
    ]);
    expect(nodes).toContainEqual({
      type: "text",
      text: "L2XZQDesigned",
      marks: [{ type: "link", attrs: { href: "weixin://profile" } }],
    });
    expect(result.report.diagnostics).toEqual([]);
  });

  it("drops empty right containers and reports malformed or unknown extensions", () => {
    const result = importResumeMarkdown({
      dialect: "mujicv",
      locale: "zh-CN",
      markdown: [
        "# Name",
        "",
        "::: left",
        "",
        "icon:unknown value",
        "",
        "::: right",
        "",
        ":::",
        "",
        "## Experience",
      ].join("\n"),
    });
    const profile = result.document.sections[0];

    expect(profile?.blocks.some((block) =>
      (block.type === "group" || block.type === "row") && block.children.length === 0,
    )).toBe(false);
    expect(profile?.blocks.some((block) =>
      block.type === "text" && getPlainTextFromRichText(block.content).includes("icon:unknown"),
    )).toBe(true);
    expect(result.report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "mujicv_unknown_icon", line: 5 }),
        expect.objectContaining({ code: "mujicv_unclosed_container", line: 3 }),
      ]),
    );
  });
});
