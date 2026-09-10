import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import type { ResumeEditorSelection } from "@/domain/resume/editor-selection";
import { findBlockByPath } from "@/domain/resume/operations";
import { validateResumeDocument } from "@/domain/resume/validation";

import { createResumeEditorStore } from "@/stores/resume-editor";

describe("createResumeEditorStore", () => {
  it("adds a selected component after a nested block and selects its editable leaf", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });

    store.getState().addBlock({
      sectionId: "section-experience",
      blockPath: ["group-experience-anonresume", "text-experience-context"],
      presetId: "badges",
    });

    const state = store.getState();
    const group = state.document.sections[1]?.blocks[0];

    expect(group?.type).toBe("group");
    expect(group?.type === "group" ? group.children[2]?.type : undefined).toBe(
      "badges",
    );
    expect(state.selection.sectionId).toBe("section-experience");
    expect(state.selection.blockPath).toEqual([
      "group-experience-anonresume",
      expect.stringMatching(/^badges-/),
    ]);
    expect(state.selection.badgeItemId).toMatch(/^badge-/);
    expect(state.dirty).toBe(true);
    expect(state.history.past).toHaveLength(1);

    state.undo();

    const restoredGroup = store.getState().document.sections[1]?.blocks[0];
    expect(restoredGroup?.type === "group" ? restoredGroup.children : []).toHaveLength(
      3,
    );
  });

  it("appends a component when only a section is selected", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });
    const before = store.getState().document.sections[0]!.blocks.length;

    store.getState().addBlock({
      sectionId: "section-profile",
      presetId: "row",
    });

    const state = store.getState();
    expect(state.document.sections[0]?.blocks).toHaveLength(before + 1);
    expect(state.document.sections[0]?.blocks.at(-1)?.type).toBe("row");
    expect(state.selection.blockPath).toEqual([
      expect.stringMatching(/^row-/),
      expect.stringMatching(/^text-/),
    ]);
    expect(state.selection.richTextField).toBe("content");
  });

  it("builds the initial runtime state from a resume document", () => {
    const document = createDefaultResumeDocument();
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document,
      version: 1,
      updatedAt: 100,
    });

    const state = store.getState();

    expect(state.resumeId).toBe("resume-demo");
    expect(state.document).toEqual(document);
    expect(state.version).toBe(1);
    expect(state.updatedAt).toBe(100);
    expect(state.saveStatus).toBe("idle");
    expect(state.dirty).toBe(false);
    expect(state.history.past).toHaveLength(0);
    expect(state.history.future).toHaveLength(0);
  });

  it("updates selection without marking the document dirty", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });
    const selection: ResumeEditorSelection = {
      sectionId: "section-profile",
      blockPath: ["block-profile-summary"],
      richTextField: "content",
    };

    store.getState().setSelection(selection);

    const state = store.getState();

    expect(state.selection).toEqual(selection);
    expect(state.dirty).toBe(false);
    expect(state.saveStatus).toBe("idle");
  });

  it("records document edits in history and supports undo and redo", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });

    store.getState().updateDocument((current) => ({
      ...current,
      meta: {
        ...current.meta,
        title: "Edited Resume",
      },
    }));

    let state = store.getState();
    expect(state.document.meta.title).toBe("Edited Resume");
    expect(state.dirty).toBe(true);
    expect(state.saveStatus).toBe("dirty");
    expect(state.history.past).toHaveLength(1);
    expect(state.history.future).toHaveLength(0);

    state.undo();

    state = store.getState();
    expect(state.document.meta.title).toBe("AnonResume 基础简历");
    expect(state.history.future).toHaveLength(1);

    state.redo();

    state = store.getState();
    expect(state.document.meta.title).toBe("Edited Resume");
    expect(state.history.past).toHaveLength(1);
    expect(state.history.future).toHaveLength(0);
  });

  it("updates a text block by section and block path", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });

    store.getState().updateTextBlock({
      sectionId: "section-experience",
      blockPath: ["group-experience-anonresume", "text-experience-context"],
      text: "Updated experience summary",
    });

    const state = store.getState();
    const experienceSection = state.document.sections.find(
      (section) => section.id === "section-experience",
    );
    const groupBlock = experienceSection?.blocks[0];

    expect(state.dirty).toBe(true);
    expect(state.saveStatus).toBe("dirty");
    expect(state.history.past).toHaveLength(1);
    expect(groupBlock?.type).toBe("group");

    if (groupBlock?.type !== "group") {
      throw new Error("Expected experience block to stay a group block");
    }

    const summaryBlock = groupBlock.children[1];

    expect(summaryBlock?.type).toBe("text");

    if (summaryBlock?.type !== "text") {
      throw new Error("Expected summary block to stay a text block");
    }

    const firstNode = summaryBlock.content.content[0]?.content[0];

    expect(firstNode?.type).toBe("text");

    if (firstNode?.type !== "text") {
      throw new Error("Expected updated summary content to start with a text node");
    }

    expect(firstNode.text).toBe("Updated experience summary");
  });

  it("updates a section title by section id", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });

    store.getState().updateSectionTitle({
      sectionId: "section-profile",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Professional Summary" }],
          },
        ],
      },
    });

    const state = store.getState();
    const profileSection = state.document.sections.find(
      (section) => section.id === "section-profile",
    );

    expect(profileSection?.title?.content[0]?.content[0]).toMatchObject({
      type: "text",
      text: "Professional Summary",
    });
    expect(state.history.past).toHaveLength(1);
    expect(state.dirty).toBe(true);
    expect(state.saveStatus).toBe("dirty");
  });

  it("adds and removes an optional section title", () => {
    const document = createDefaultResumeDocument();
    document.sections[0]!.title = undefined;
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document,
      version: 1,
      updatedAt: 100,
    });
    const title = {
      type: "doc" as const,
      content: [
        {
          type: "paragraph" as const,
          content: [{ type: "text" as const, text: "自定义标题" }],
        },
      ],
    };

    store.getState().setSectionTitle({
      sectionId: "section-profile",
      title,
    });
    expect(store.getState().document.sections[0]?.title).toEqual(title);

    store.getState().setSectionTitle({ sectionId: "section-profile" });
    expect(store.getState().document.sections[0]?.title).toBeUndefined();
  });

  it("sets and clears a per-section title color", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });
    store.getState().setSectionTitleColor({
      sectionId: "section-profile",
      color: "#be123c",
    });
    expect(
      (
        store.getState().document.sections[0] as unknown as {
          titleStyle?: { color?: string };
        }
      ).titleStyle,
    ).toEqual({ color: "#be123c" });

    store.getState().setSectionTitleColor({
      sectionId: "section-profile",
      color: undefined,
    });
    expect(
      (
        store.getState().document.sections[0] as unknown as {
          titleStyle?: { color?: string };
        }
      ).titleStyle,
    ).toBeUndefined();
    expect(store.getState().history.past).toHaveLength(2);
  });

  it("updates a text block style by section and block path", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });

    store.getState().updateTextBlockStyle({
      sectionId: "section-profile",
      blockPath: ["block-profile-summary"],
      style: {
        fontSize: 24,
        fontWeight: 800,
        lineHeight: 1.25,
        color: "#123456",
        align: "center",
      },
    });

    const state = store.getState();
    const profileSection = state.document.sections.find(
      (section) => section.id === "section-profile",
    );
    const summaryBlock = profileSection?.blocks[0];

    expect(summaryBlock).toMatchObject({
      type: "text",
      style: {
        fontSize: 24,
        fontWeight: 800,
        lineHeight: 1.25,
        color: "#123456",
        align: "center",
      },
    });
    expect(state.history.past).toHaveLength(1);
    expect(state.dirty).toBe(true);
    expect(state.saveStatus).toBe("dirty");
  });

  it("clears smaller inline colors when applying a color to the whole block", () => {
    const document = createDefaultResumeDocument();
    const summary = document.sections[0]?.blocks[0];

    if (!summary || summary.type !== "text") {
      throw new Error("Expected the profile summary text block");
    }

    summary.content.content[0]!.content = [
      { type: "text", text: "默认" },
      {
        type: "text",
        text: "局部",
        marks: [
          { type: "bold" },
          { type: "textColor", attrs: { color: "#dc2626" } },
        ],
      },
    ];
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document,
      version: 1,
      updatedAt: 100,
    });

    store.getState().setTextBlockColor({
      sectionId: "section-profile",
      blockPath: ["block-profile-summary"],
      color: "#2563eb",
    });

    const nextSummary = store.getState().document.sections[0]?.blocks[0];

    expect(nextSummary).toMatchObject({
      type: "text",
      style: { color: "#2563eb" },
      content: {
        content: [
          {
            content: [
              { type: "text", text: "默认" },
              { type: "text", text: "局部", marks: [{ type: "bold" }] },
            ],
          },
        ],
      },
    });
    expect(store.getState().history.past).toHaveLength(1);
  });

  it("marks a dirty document as saved with the next server version", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });

    store.getState().updateDocument((current) => ({
      ...current,
      meta: { ...current.meta, title: "Autosaved Resume" },
    }));
    store.getState().markSaved({
      version: 2,
      updatedAt: 200,
    });

    const state = store.getState();

    expect(state.saveStatus).toBe("saved");
    expect(state.dirty).toBe(false);
    expect(state.version).toBe(2);
    expect(state.updatedAt).toBe(200);
  });

  it("keeps later edits dirty when an earlier save snapshot succeeds", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });

    store.getState().updateDocument((current) => ({
      ...current,
      meta: { ...current.meta, title: "First edit" },
    }));
    const savedDocument = store.getState().document;

    store.getState().updateSectionTitle({
      sectionId: "section-profile",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "个人简介",
                marks: [
                  {
                    type: "link",
                    attrs: { href: "https://example.com/profile" },
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    store.getState().markSaved({
      version: 2,
      updatedAt: 200,
      document: savedDocument,
    });

    const state = store.getState();

    expect(state.version).toBe(2);
    expect(state.updatedAt).toBe(200);
    expect(state.document.sections[0]?.title?.content[0]?.content[0]).toMatchObject({
      type: "text",
      marks: [
        {
          type: "link",
          attrs: { href: "https://example.com/profile" },
        },
      ],
    });
    expect(state.dirty).toBe(true);
    expect(state.saveStatus).toBe("dirty");
  });

  it("clamps zoom updates into the supported editor range", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });

    store.getState().setZoom(0.2);
    expect(store.getState().zoom).toBe(0.6);

    store.getState().setZoom(1.25);
    expect(store.getState().zoom).toBe(1.25);

    store.getState().setZoom(3);
    expect(store.getState().zoom).toBe(1.6);
  });

  it("adds a new section and selects it for editing", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });

    store.getState().addSection();

    const state = store.getState();
    const newSection = state.document.sections.at(-1);

    expect(state.document.sections).toHaveLength(3);
    expect(state.dirty).toBe(true);
    expect(state.saveStatus).toBe("dirty");
    expect(state.history.past).toHaveLength(1);
    expect(newSection?.title?.content[0]?.content[0]).toMatchObject({
      type: "text",
      text: "新区块",
    });
    expect(newSection?.blocks[0]).toMatchObject({
      type: "text",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "从这里开始编写" }],
          },
        ],
      },
    });
    expect(state.selection).toEqual({ sectionId: newSection?.id });
  });

  it("adds a preset section and selects it for editing", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });

    store.getState().addSection("projects");

    const state = store.getState();
    const newSection = state.document.sections.at(-1);

    expect(state.document.sections).toHaveLength(3);
    expect(newSection?.semantic).toBe("project");
    expect(newSection?.title?.content[0]?.content[0]).toMatchObject({
      type: "text",
      text: "项目",
    });
    expect(newSection?.blocks[0]).toMatchObject({
      type: "group",
      direction: "vertical",
    });
    expect(state.selection).toEqual({ sectionId: newSection?.id });
    expect(state.history.past).toHaveLength(1);
    expect(state.dirty).toBe(true);
  });

  it("updates section layout metadata by section id", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });

    store.getState().updateSectionLayout({
      sectionId: "section-profile",
      layout: {
        direction: "horizontal",
        gap: 28,
      },
    });

    const state = store.getState();
    const profileSection = state.document.sections.find(
      (section) => section.id === "section-profile",
    );

    expect(profileSection?.layout).toMatchObject({
      direction: "horizontal",
      gap: 28,
    });
    expect(state.history.past).toHaveLength(1);
    expect(state.dirty).toBe(true);
    expect(state.saveStatus).toBe("dirty");
  });

  it("updates section pagination and structural block settings", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });

    store.getState().updateSectionPagination({
      sectionId: "section-profile",
      pagination: { keepTogether: false },
    });
    store.getState().updateBlockSettings({
      sectionId: "section-profile",
      blockPath: ["block-profile-highlights"],
      settings: {
        type: "list",
        ordered: true,
        marker: "square",
        gap: 4,
      },
    });

    const state = store.getState();
    const list = findBlockByPath(state.document.sections[0]!.blocks, [
      "block-profile-highlights",
    ]);

    expect(state.document.sections[0]?.pagination?.keepTogether).toBe(false);
    expect(list).toMatchObject({
      type: "list",
      ordered: true,
      marker: "square",
      gap: 4,
    });
    expect(state.history.past).toHaveLength(2);
  });

  it("updates section padding metadata by section id", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });

    store.getState().updateSectionLayout({
      sectionId: "section-profile",
      layout: {
        padding: {
          top: 12,
          right: 16,
          bottom: 20,
          left: 24,
        },
      },
    });

    const state = store.getState();
    const profileSection = state.document.sections.find(
      (section) => section.id === "section-profile",
    );

    expect(profileSection?.layout?.padding).toEqual({
      top: 12,
      right: 16,
      bottom: 20,
      left: 24,
    });
    expect(state.history.past).toHaveLength(1);
    expect(state.dirty).toBe(true);
  });

  it("updates section semantic metadata by section id", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });

    store.getState().updateSectionSemantic({
      sectionId: "section-profile",
      semantic: "opensource",
    });

    const state = store.getState();
    const profileSection = state.document.sections.find(
      (section) => section.id === "section-profile",
    );

    expect(profileSection?.semantic).toBe("opensource");
    expect(state.history.past).toHaveLength(1);
    expect(state.dirty).toBe(true);
    expect(state.saveStatus).toBe("dirty");
  });

  it("toggles a section visibility flag without changing its selection", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });

    store.getState().setSelection({ sectionId: "section-profile" });
    store.getState().setSectionVisibility({
      sectionId: "section-profile",
      visible: false,
    });

    const state = store.getState();
    const profileSection = state.document.sections.find(
      (section) => section.id === "section-profile",
    );

    expect(profileSection?.visible).toBe(false);
    expect(state.selection).toEqual({ sectionId: "section-profile" });
    expect(state.history.past).toHaveLength(1);
  });

  it("deletes a selected section and falls forward to the next remaining section", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });

    store.getState().setSelection({ sectionId: "section-profile" });
    store.getState().deleteSection("section-profile");

    const state = store.getState();

    expect(state.document.sections.map((section) => section.id)).toEqual([
      "section-experience",
    ]);
    expect(state.selection).toEqual({ sectionId: "section-experience" });
    expect(state.history.past).toHaveLength(1);
    expect(state.dirty).toBe(true);
  });

  it("duplicates a section with fresh nested identifiers and selects the copy", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });
    const source = store.getState().document.sections[1]!;

    store.getState().duplicateSection(source.id);

    const state = store.getState();
    const copy = state.document.sections[2];

    expect(copy).toBeDefined();
    expect(copy).not.toBe(source);
    expect(copy?.id).not.toBe(source.id);
    expect(copy?.title).toEqual(source.title);
    expect(copy?.blocks[0]?.id).not.toBe(source.blocks[0]?.id);
    expect(state.selection).toEqual({ sectionId: copy?.id });
    expect(state.history.past).toHaveLength(1);
    expect(state.dirty).toBe(true);
    expect(() => validateResumeDocument(state.document)).not.toThrow();
  });

  it("duplicates a nested content block beside its source with a fresh identifier", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });
    const blockPath = ["group-experience-anonresume", "text-experience-context"];

    store.getState().duplicateBlock({
      sectionId: "section-experience",
      blockPath,
    });

    const state = store.getState();
    const experience = state.document.sections.find(
      (section) => section.id === "section-experience",
    );
    const group = experience?.blocks[0];

    expect(group?.type).toBe("group");

    if (group?.type !== "group") {
      throw new Error("Expected the experience group to remain a group.");
    }

    const copy = group.children[2];

    expect(group.children.map((block) => block.id)).toEqual([
      "row-experience-header",
      "text-experience-context",
      copy?.id,
      "list-experience-highlights",
    ]);
    expect(copy).toMatchObject({
      type: "text",
      content: group.children[1]?.type === "text" ? group.children[1].content : undefined,
    });
    expect(copy?.id).not.toBe("text-experience-context");
    expect(state.selection).toEqual({
      sectionId: "section-experience",
      blockPath: ["group-experience-anonresume", copy?.id],
      richTextField: "content",
    });
    expect(state.history.past).toHaveLength(1);
    expect(() => validateResumeDocument(state.document)).not.toThrow();
  });

  it("duplicates a selected list item instead of adding another line to the same bullet", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });

    store.getState().duplicateBlock({
      sectionId: "section-profile",
      blockPath: [
        "block-profile-highlights",
        "item-foundation-1",
        "item-foundation-1-text",
      ],
    });

    const state = store.getState();
    const list = state.document.sections[0]?.blocks[1];

    expect(list?.type).toBe("list");

    if (list?.type !== "list") {
      throw new Error("Expected profile highlights to remain a list.");
    }

    const copy = list.items[1];
    const copyText = copy?.children[0];

    expect(list.items).toHaveLength(3);
    expect(copy?.id).not.toBe("item-foundation-1");
    expect(copyText?.id).not.toBe("item-foundation-1-text");
    expect(copyText).toMatchObject({
      type: list.items[0]?.children[0]?.type,
      content:
        list.items[0]?.children[0]?.type === "text"
          ? list.items[0].children[0].content
          : undefined,
    });
    expect(state.selection).toEqual({
      sectionId: "section-profile",
      blockPath: ["block-profile-highlights", copy?.id, copyText?.id],
      richTextField: "content",
    });
    expect(() => validateResumeDocument(state.document)).not.toThrow();
  });

  it("removes an empty row after its final child is deleted and restores it through history", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });
    const rowPath = ["group-experience-anonresume", "row-experience-header"];

    store.getState().deleteBlock({
      sectionId: "section-experience",
      blockPath: [...rowPath, "text-experience-role"],
    });
    store.getState().deleteBlock({
      sectionId: "section-experience",
      blockPath: [...rowPath, "text-experience-range"],
    });

    expect(
      findBlockByPath(
        store.getState().document.sections[1]!.blocks,
        rowPath,
      ),
    ).toBeUndefined();
    expect(store.getState().selection).toEqual({
      sectionId: "section-experience",
    });
    expect(() => validateResumeDocument(store.getState().document)).not.toThrow();

    store.getState().undo();
    expect(
      findBlockByPath(
        store.getState().document.sections[1]!.blocks,
        rowPath,
      ),
    ).toMatchObject({
      type: "row",
      children: [{ id: "text-experience-range" }],
    });

    store.getState().undo();
    expect(
      findBlockByPath(
        store.getState().document.sections[1]!.blocks,
        rowPath,
      ),
    ).toMatchObject({
      type: "row",
      children: [
        { id: "text-experience-role" },
        { id: "text-experience-range" },
      ],
    });
  });

  it("deletes a selected list item while retaining a valid fallback selection", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });

    store.getState().deleteBlock({
      sectionId: "section-profile",
      blockPath: [
        "block-profile-highlights",
        "item-foundation-1",
        "item-foundation-1-text",
      ],
    });

    const state = store.getState();
    const list = state.document.sections[0]?.blocks[1];

    expect(list?.type).toBe("list");

    if (list?.type !== "list") {
      throw new Error("Expected profile highlights to remain a list.");
    }

    expect(list.items.map((item) => item.id)).toEqual(["item-foundation-2"]);
    expect(state.selection).toEqual({
      sectionId: "section-profile",
      blockPath: [
        "block-profile-highlights",
        "item-foundation-2",
        "item-foundation-2-text",
      ],
      richTextField: "content",
    });
    expect(() => validateResumeDocument(state.document)).not.toThrow();
  });

  it("deletes the parent list when its last remaining item is deleted", () => {
    const document = createDefaultResumeDocument();
    const list = document.sections[0]?.blocks[1];

    if (list?.type !== "list") {
      throw new Error("Expected profile highlights to remain a list.");
    }

    list.items = [list.items[0]!];
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document,
      version: 1,
      updatedAt: 100,
    });

    store.getState().deleteBlock({
      sectionId: "section-profile",
      blockPath: [
        "block-profile-highlights",
        "item-foundation-1",
        "item-foundation-1-text",
      ],
    });

    const state = store.getState();

    expect(
      findBlockByPath(state.document.sections[0]!.blocks, [
        "block-profile-highlights",
      ]),
    ).toBeUndefined();
    expect(state.selection).toEqual({ sectionId: "section-profile" });
    expect(state.dirty).toBe(true);
    expect(() => validateResumeDocument(state.document)).not.toThrow();
  });

  it("moves a selected section earlier in the document while preserving selection", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });

    store.getState().addSection();
    let state = store.getState();
    const newSectionId = state.selection.sectionId;

    if (!newSectionId) {
      throw new Error("Expected new section to be selected");
    }

    store.getState().moveSection({
      sectionId: newSectionId,
      toIndex: 1,
    });

    state = store.getState();

    expect(state.document.sections.map((section) => getSectionTitle(section.title))).toEqual([
      "个人简介",
      "新区块",
      "经历",
    ]);
    expect(state.selection).toEqual({ sectionId: newSectionId });
    expect(state.history.past).toHaveLength(2);
    expect(state.dirty).toBe(true);
  });

  it("moves a nested text block earlier within its parent while preserving selection", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });

    store.getState().setSelection({
      sectionId: "section-experience",
      blockPath: ["group-experience-anonresume", "text-experience-context"],
      richTextField: "content",
    });
    store.getState().moveBlock({
      sectionId: "section-experience",
      blockPath: ["group-experience-anonresume", "text-experience-context"],
      toIndex: 0,
    });

    const state = store.getState();
    const experienceSection = state.document.sections.find(
      (section) => section.id === "section-experience",
    );
    const groupBlock = experienceSection?.blocks[0];

    expect(groupBlock?.type).toBe("group");

    if (groupBlock?.type !== "group") {
      throw new Error("Expected experience root block to stay a group");
    }

    expect(groupBlock.children.map((block) => block.id)).toEqual([
      "text-experience-context",
      "row-experience-header",
      "list-experience-highlights",
    ]);
    expect(state.selection).toEqual({
      sectionId: "section-experience",
      blockPath: ["group-experience-anonresume", "text-experience-context"],
      richTextField: "content",
    });
    expect(state.history.past).toHaveLength(1);
    expect(state.dirty).toBe(true);
  });

  it("updates a nested list-item text block by section and block path", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });

    store.getState().updateTextBlock({
      sectionId: "section-profile",
      blockPath: [
        "block-profile-highlights",
        "item-foundation-1",
        "item-foundation-1-text",
      ],
      text: "Updated nested profile bullet",
    });

    const state = store.getState();
    const profileSection = state.document.sections.find(
      (section) => section.id === "section-profile",
    );
    const listBlock = profileSection?.blocks[1];

    expect(listBlock?.type).toBe("list");

    if (listBlock?.type !== "list") {
      throw new Error("Expected profile highlights to stay a list block");
    }

    const nestedTextBlock = listBlock.items[0]?.children[0];

    expect(nestedTextBlock?.type).toBe("text");

    if (nestedTextBlock?.type !== "text") {
      throw new Error("Expected the nested list item child to stay a text block");
    }

    expect(nestedTextBlock.content.content[0]?.content[0]).toMatchObject({
      type: "text",
      text: "Updated nested profile bullet",
    });
    expect(state.history.past).toHaveLength(1);
    expect(state.dirty).toBe(true);
    expect(state.saveStatus).toBe("dirty");
  });

  it("replaces local editor state with a restored server version", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 3,
      updatedAt: 100,
    });
    const restoredDocument = createDefaultResumeDocument();

    restoredDocument.meta.title = "Restored version";
    store.getState().updateDocument((document) => ({
      ...document,
      meta: { ...document.meta, title: "Unsaved local edit" },
    }));
    store.getState().setSelection({ sectionId: "section-profile" });
    store.getState().restoreServerVersion({
      document: restoredDocument,
      version: 5,
      updatedAt: 900,
    });

    const state = store.getState();

    expect(state.document.meta.title).toBe("Restored version");
    expect(state.version).toBe(5);
    expect(state.updatedAt).toBe(900);
    expect(state.selection).toEqual({});
    expect(state.history).toEqual({ past: [], future: [] });
    expect(state.dirty).toBe(false);
    expect(state.saveStatus).toBe("saved");
  });

  it("syncs a metadata version without clearing newer document edits", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 3,
      updatedAt: 100,
    });
    store.getState().updateDocument((document) => ({
      ...document,
      meta: { ...document.meta, title: "Unsaved local edit" },
    }));
    store.getState().syncMetadataVersion({ version: 4, updatedAt: 900 });

    expect(store.getState()).toMatchObject({
      version: 4,
      updatedAt: 900,
      dirty: true,
      saveStatus: "dirty",
    });
  });

  it("rebases local edits onto the latest cloud version after a conflict", () => {
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 3,
      updatedAt: 100,
    });

    store.getState().updateDocument((document) => ({
      ...document,
      meta: { ...document.meta, title: "Keep this local edit" },
    }));
    store.getState().setSaveConflict({ currentVersion: 7 });
    store.getState().keepLocalAfterConflict({ version: 7, updatedAt: 900 });

    expect(store.getState()).toMatchObject({
      version: 7,
      updatedAt: 900,
      dirty: true,
      saveStatus: "dirty",
      saveConflict: undefined,
    });
    expect(store.getState().document.meta.title).toBe("Keep this local edit");
  });
});

function getSectionTitle(title: ReturnType<typeof createDefaultResumeDocument>["sections"][number]["title"]) {
  const firstNode = title?.content[0]?.content[0];

  if (firstNode?.type !== "text") {
    return "";
  }

  return firstNode.text;
}
