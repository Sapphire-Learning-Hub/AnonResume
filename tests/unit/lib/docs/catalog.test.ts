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
      getAdjacentDocsEntries("/docs/section-templates", false),
    ).toMatchObject({
      next: { href: "/docs/import-export" },
    });
  });

  it("includes the AI guide in navigation and reading order when enabled", () => {
    const groups = getVisibleDocsGroups(true);
    const entries = groups.flatMap((group) => group.entries);

    expect(entries.map((entry) => entry.href)).toContain(
      "/docs/ai-assistant",
    );
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
});
