import { act, renderHook, waitFor } from "@testing-library/react";

import {
  serializeResumeMarkdown,
  type ResumeMarkdownProjection,
} from "@/domain/resume/markdown";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { createResumeDocumentFromTemplate } from "@/domain/resume/templates";
import type { ResumeDocument } from "@/domain/resume/schema";
import type {
  LocalResumeMarkdownDraft,
  ResumeMarkdownDraftRepository,
} from "@/lib/resume/markdown-drafts";
import { LOCAL_RESUME_MARKDOWN_DRAFT_SCHEMA_VERSION } from "@/lib/resume/markdown-drafts";
import { createResumeEditorStore } from "@/stores/resume-editor";
import { useResumeMarkdownSession } from "@/components/editor/markdown/useResumeMarkdownSession";

function createRepository(
  initial?: LocalResumeMarkdownDraft,
): ResumeMarkdownDraftRepository & {
  saved: LocalResumeMarkdownDraft[];
  deleted: string[];
} {
  let draft = initial;
  const saved: LocalResumeMarkdownDraft[] = [];
  const deleted: string[] = [];
  return {
    saved,
    deleted,
    async getDraft(resumeId) {
      return draft?.resumeId === resumeId ? draft : undefined;
    },
    async saveDraft(next) {
      draft = next;
      saved.push(next);
    },
    async deleteDraft(resumeId) {
      draft = undefined;
      deleted.push(resumeId);
    },
  };
}

function setup(
  initialDraft?: LocalResumeMarkdownDraft,
  commitDelayMs = 10,
  document: ResumeDocument = createDefaultResumeDocument("zh-CN"),
) {
  const store = createResumeEditorStore({
    resumeId: "resume-demo",
    document,
    version: 3,
    updatedAt: 100,
  });
  const repository = createRepository(initialDraft);
  const hook = renderHook(() =>
    useResumeMarkdownSession({
      resumeId: "resume-demo",
      locale: "zh-CN",
      store,
      draftRepository: repository,
      commitDelayMs,
    }),
  );
  return { document, store, repository, ...hook };
}

function createRecoveryDraft(
  overrides: Partial<LocalResumeMarkdownDraft> = {},
) {
  const serialized = serializeResumeMarkdown(
    createDefaultResumeDocument("zh-CN"),
    { baseDocumentVersion: overrides.baseVersion ?? 2 },
  );
  return {
    schemaVersion: LOCAL_RESUME_MARKDOWN_DRAFT_SCHEMA_VERSION,
    resumeId: "resume-demo",
    source: "invalid local source",
    baseVersion: 2,
    updatedAt: 500,
    projection: serialized.projection,
    ...overrides,
  } satisfies LocalResumeMarkdownDraft;
}

describe("useResumeMarkdownSession", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retains structure across an autosave acknowledgement and further typing", async () => {
    vi.useFakeTimers();
    const document = createResumeDocumentFromTemplate("blank", "en-US");
    document.sections[0]!.blocks.push({
      id: "skills",
      type: "badges",
      wrap: false,
      gap: 5,
      items: [
        { id: "skill-a", text: "TypeScript" },
        { id: "skill-b", text: "React" },
      ],
    });
    const { result, store } = setup(undefined, 5, document);
    await act(async () => result.current.enter());
    const source = result.current.source.replace(
      "Name · Target role",
      "Taylor · Target role",
    );
    act(() => result.current.setSource(source));
    await act(async () => vi.advanceTimersByTimeAsync(5));
    act(() =>
      store
        .getState()
        .markSaved({
          version: 4,
          updatedAt: 200,
          document: store.getState().document,
        }),
    );

    act(() =>
      result.current.setSource(source.replace("Taylor ·", "Taylor Chen ·")),
    );
    await act(async () => vi.advanceTimersByTimeAsync(5));

    expect(result.current.diagnostics).toEqual([]);
    expect(store.getState().document.sections[0]).toMatchObject({
      id: document.sections[0]!.id,
      blocks: [
        { id: document.sections[0]!.blocks[0]!.id },
        document.sections[0]!.blocks[1]!,
      ],
    });
    expect(store.getState().document.sections[1]).toEqual(document.sections[1]);
  });

  it("shows a valid candidate immediately and commits it as one debounced transaction", async () => {
    vi.useFakeTimers();
    const { result, store } = setup(undefined, 5);
    await act(async () => result.current.enter());
    const nextSource = result.current.source.replace(
      'title: "AnonResume 基础简历"',
      'title: "Markdown 简历"',
    );

    act(() => result.current.setSource(nextSource));
    expect(result.current.hasSourceChanges).toBe(true);
    expect(result.current.previewDocument.meta.title).toBe("Markdown 简历");

    await act(async () => vi.advanceTimersByTimeAsync(4));
    expect(store.getState().history.past).toHaveLength(0);

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(store.getState().history.past).toHaveLength(1);
    expect(store.getState().document.meta.title).toBe("Markdown 简历");
    await act(async () => {
      await expect(result.current.exit()).resolves.toBe(true);
    });
    expect(result.current.hasSourceChanges).toBe(false);
  });

  it("does not commit a semantic no-op", async () => {
    vi.useFakeTimers();
    const { result, store } = setup();
    await act(async () => result.current.enter());
    act(() => result.current.setSource(`${result.current.source}\n\n`));

    expect(result.current.diagnostics).toEqual([]);
    await act(async () => vi.advanceTimersByTimeAsync(20));
    expect(store.getState().history.past).toHaveLength(0);
  });

  it("does not cancel a pending edit when the next input only adds whitespace", async () => {
    vi.useFakeTimers();
    const { result, store } = setup(undefined, 5);
    await act(async () => result.current.enter());
    const source = result.current.source.replace("共享渲染器基础", "连续输入");
    act(() => result.current.setSource(source));
    act(() => result.current.setSource(`${source}\n\n`));
    await act(async () => vi.advanceTimersByTimeAsync(5));
    expect(JSON.stringify(store.getState().document)).toContain("连续输入");
    expect(store.getState().history.past).toHaveLength(1);
  });

  it("does not overwrite an external restore while a Markdown commit is pending", async () => {
    vi.useFakeTimers();
    const { result, store, document } = setup(undefined, 5);
    await act(async () => result.current.enter());
    act(() =>
      result.current.setSource(
        result.current.source.replace("共享渲染器基础", "待写入"),
      ),
    );
    const restored = {
      ...document,
      meta: { ...document.meta, title: "restored" },
    };
    act(() =>
      store
        .getState()
        .replaceDocument({ document: restored, history: "record" }),
    );
    await act(async () => vi.advanceTimersByTimeAsync(5));
    expect(store.getState().document).toEqual(restored);
    expect(result.current.isPreviewStale).toBe(true);
    await act(async () => {
      await expect(result.current.flush()).resolves.toBe(false);
    });
    expect(store.getState().document).toEqual(restored);
  });

  it("recovers a pending draft against its own mapping baseline", async () => {
    const first = setup(undefined, 60_000);
    await act(async () => first.result.current.enter());
    const source = first.result.current.source.replace(
      "共享渲染器基础",
      "恢复后连续编辑",
    );
    act(() => first.result.current.setSource(source));
    const draft = first.repository.saved.at(-1)!;
    first.unmount();
    const second = setup(draft, 60_000);
    await act(async () => second.result.current.enter());
    act(() => second.result.current.recoverDraft());
    act(() =>
      second.result.current.setSource(
        source.replace("恢复后连续编辑", "恢复完成"),
      ),
    );
    await act(async () => {
      await expect(second.result.current.flush()).resolves.toBe(true);
    });
    expect(second.result.current.diagnostics).toEqual([]);
    expect(JSON.stringify(second.store.getState().document)).toContain(
      "恢复完成",
    );
    expect(
      second.store.getState().document.sections.map((section) => section.id),
    ).toEqual(second.document.sections.map((section) => section.id));
  });

  it("flushes a valid pending source change before the debounce expires", async () => {
    const { result, store } = setup(undefined, 60_000);
    await act(async () => result.current.enter());
    const nextSource = result.current.source.replace(
      'title: "AnonResume 基础简历"',
      'title: "即时预览简历"',
    );

    act(() => result.current.setSource(nextSource));
    expect(store.getState().document.meta.title).toBe("AnonResume 基础简历");

    await act(async () => {
      await expect(result.current.flush()).resolves.toBe(true);
    });

    expect(store.getState().document.meta.title).toBe("即时预览简历");
    expect(store.getState().history.past).toHaveLength(1);
  });

  it("keeps the last valid preview and persists invalid source locally", async () => {
    const { result, repository, store } = setup();
    await act(async () => result.current.enter());
    await waitFor(() => expect(result.current.diagnostics).toEqual([]));
    const lastValidPreview = result.current.previewDocument;
    act(() =>
      result.current.setSource("---\nanonresume: 1\n---\n\n:::group\nbroken"),
    );

    await waitFor(() => expect(result.current.isPreviewStale).toBe(true));
    expect(result.current.previewDocument).toBe(lastValidPreview);
    expect(store.getState().history.past).toHaveLength(0);
    await waitFor(() =>
      expect(repository.saved.at(-1)?.source).toContain(":::group\nbroken"),
    );
  });

  it("offers exact local source recovery and marks version mismatches stale", async () => {
    const draft = createRecoveryDraft();
    const { result } = setup(draft);
    await act(async () => result.current.enter());

    await waitFor(() => expect(result.current.recoveryDraft).toEqual(draft));
    expect(result.current.recoveryIsStale).toBe(true);
    act(() => result.current.recoverDraft());
    expect(result.current.source).toBe("invalid local source");
  });

  it("does not turn an unverified legacy draft into a trusted draft after another refresh", async () => {
    const draft = createRecoveryDraft({
      source: serializeResumeMarkdown(
        createDefaultResumeDocument("zh-CN"),
      ).source.replace("共享渲染器基础", "old draft"),
    });
    const first = setup(draft, 60_000);
    await act(async () => first.result.current.enter());
    act(() => first.result.current.recoverDraft());
    act(() => first.result.current.setSource(`${draft.source}\n`));
    const persisted = first.repository.saved.at(-1)!;
    first.unmount();
    const second = setup(persisted, 60_000);
    await act(async () => second.result.current.enter());
    act(() => second.result.current.recoverDraft());
    await act(async () => {
      await expect(second.result.current.flush()).resolves.toBe(false);
    });
    expect(second.store.getState().document).toEqual(second.document);
    expect(second.result.current.source).toContain("old draft");
  });

  it("blocks invalid exit and clears the source draft after valid exit or discard", async () => {
    const { result, repository } = setup();
    await act(async () => result.current.enter());
    act(() => result.current.setSource("---\nanonresume: 1"));
    await waitFor(() => expect(result.current.isPreviewStale).toBe(true));

    await expect(result.current.exit()).resolves.toBe(false);
    expect(repository.deleted).toEqual([]);

    await act(async () => result.current.discard());
    expect(repository.deleted).toEqual(["resume-demo"]);
    expect(result.current.source).toBe(
      serializeResumeMarkdown(result.current.previewDocument).source,
    );
  });

  it("keeps the last valid projection when an invalid edit is saved for recovery", async () => {
    const { result, repository } = setup(undefined, 60_000);
    await act(async () => result.current.enter());
    const validSource = result.current.source.replace(
      "共享渲染器基础",
      "投影重排基础",
    );

    act(() => result.current.setSource(validSource));
    await waitFor(() =>
      expect(repository.saved.at(-1)?.source).toBe(validSource),
    );
    const validProjection = repository.saved.at(-1)?.projection;
    expect(validProjection).toBeDefined();

    const invalidSource = `${validSource}\n:::group\nbroken`;
    act(() => result.current.setSource(invalidSource));
    await waitFor(() =>
      expect(repository.saved.at(-1)?.source).toBe(invalidSource),
    );
    expect(repository.saved.at(-1)?.projection).toEqual(validProjection);
  });

  it("keeps user-authored source spelling when exiting Markdown mode", async () => {
    const { result } = setup(undefined, 60_000);
    await act(async () => result.current.enter());
    const sourceWithComment = result.current.source.replace(
      "## 个人简介",
      "<!-- keep my note -->\n## 个人简介",
    );

    act(() => result.current.setSource(sourceWithComment));
    await act(async () => {
      await expect(result.current.exit()).resolves.toBe(true);
    });

    expect(result.current.source).toContain("<!-- keep my note -->");
  });

  it("rebases the saved projection after every valid edit", async () => {
    const { result, repository } = setup(undefined, 60_000);
    await act(async () => result.current.enter());
    const firstSource = result.current.source.replace(
      "共享渲染器基础",
      "第一次编辑",
    );

    act(() => result.current.setSource(firstSource));
    await waitFor(() =>
      expect(repository.saved.at(-1)?.source).toBe(firstSource),
    );
    const firstProjection = repository.saved.at(-1)
      ?.projection as ResumeMarkdownProjection;
    expect(
      firstProjection.nodes.some((entry) =>
        entry.fingerprint.includes("第一次编辑"),
      ),
    ).toBe(true);

    const secondSource = firstSource.replace("第一次编辑", "第二次编辑");
    act(() => result.current.setSource(secondSource));
    await waitFor(() =>
      expect(repository.saved.at(-1)?.source).toBe(secondSource),
    );
    expect(
      repository.saved
        .at(-1)
        ?.projection.nodes.some((entry) =>
          entry.fingerprint.includes("第二次编辑"),
        ),
    ).toBe(true);
  });
});
