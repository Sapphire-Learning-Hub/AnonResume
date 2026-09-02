import {
  filterResumeIcons,
  getResumeIcon,
  resumeIconCatalog,
} from "@/domain/resume/icon-catalog";

describe("resume icon catalog", () => {
  it("exposes unique stable icon ids with local svg data", () => {
    const ids = resumeIconCatalog.map((icon) => icon.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(getResumeIcon("lucide:mail")).toMatchObject({
      id: "lucide:mail",
      category: "contact",
      labelZh: "邮箱",
      source: "lucide",
    });
    expect(getResumeIcon("lucide:mail")?.svg.body).toContain("path");
  });

  it("bundles a broad curated catalog without runtime network loading", () => {
    expect(resumeIconCatalog.length).toBeGreaterThanOrEqual(300);
    expect(resumeIconCatalog.some((icon) => icon.source === "lucide")).toBe(true);
    expect(
      resumeIconCatalog.some((icon) => icon.source === "simple-icons"),
    ).toBe(true);
  });

  it("filters by category without changing catalog order", () => {
    const contactIds = filterResumeIcons("", "contact").map((icon) => icon.id);

    expect(contactIds).toContain("lucide:mail");
    expect(contactIds).toContain("lucide:phone");
    expect(contactIds).not.toContain("simple-icons:github");
  });

  it("searches Chinese, English, ids, and aliases", () => {
    expect(filterResumeIcons("邮箱").map((icon) => icon.id)).toContain(
      "lucide:mail",
    );
    expect(filterResumeIcons("github").map((icon) => icon.id)).toContain(
      "simple-icons:github",
    );
    expect(filterResumeIcons("代码仓库").map((icon) => icon.id)).toContain(
      "simple-icons:github",
    );
  });

  it("returns no icon for an unknown id", () => {
    expect(getResumeIcon("unknown:missing")).toBeUndefined();
  });
});
