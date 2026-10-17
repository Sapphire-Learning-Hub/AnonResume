import {
  getAdjacentDocsEntries,
  getVisibleDocsGroups,
} from "@/lib/docs/catalog";

describe("documentation catalog", () => {
  it("hides the AI guide everywhere when AI is disabled", () => {
    const groups = getVisibleDocsGroups(false);
    const entries = groups.flatMap((group) => group.entries);

    expect(entries.map((entry) => entry.href)).not.toContain(
      "/docs/ai-assistant",
    );
    expect(
      getAdjacentDocsEntries("/docs/markdown-editor", false),
    ).toMatchObject({
      previous: { href: "/docs/editor" },
      next: { href: "/docs/section-templates" },
    });
    expect(
      getAdjacentDocsEntries("/docs/section-templates", false),
    ).toMatchObject({ next: { href: "/docs/import-export" } });
  });

  it("includes the AI guide in navigation and reading order when enabled", () => {
    const groups = getVisibleDocsGroups(true);
    const entries = groups.flatMap((group) => group.entries);

    expect(entries.map((entry) => entry.href)).toContain(
      "/docs/ai-assistant",
    );
    expect(entries.map((entry) => entry.href)).toEqual(
      expect.arrayContaining(["/docs/editor", "/docs/markdown-editor"]),
    );
    expect(
      getAdjacentDocsEntries("/docs/editor", true),
    ).toMatchObject({ next: { href: "/docs/markdown-editor" } });
    expect(
      getAdjacentDocsEntries("/docs/section-templates", true),
    ).toMatchObject({
      next: { href: "/docs/ai-assistant" },
    });
  });

  it("keeps every visible article in a stable adjacent reading order", () => {
    expect(getAdjacentDocsEntries("/docs", false)).toEqual({
      next: expect.objectContaining({ href: "/docs/editor" }),
      previous: undefined,
    });
    expect(getAdjacentDocsEntries("/docs/support", false)).toEqual({
      next: undefined,
      previous: expect.objectContaining({ href: "/docs/troubleshooting" }),
    });
  });

  it("registers localized metadata and search fields for Markdown editing", () => {
    const markdown = getVisibleDocsGroups(false)
      .flatMap((group) => group.entries)
      .find((entry) => entry.id === "markdown-editor");

    expect(markdown).toEqual({
      href: "/docs/markdown-editor",
      id: "markdown-editor",
      searchTermsKey: "docs.searchTerms.markdownEditor",
      summaryKey: "docs.summary.markdownEditor",
      titleKey: "docs.navigation.markdownEditor",
    });
  });
});
