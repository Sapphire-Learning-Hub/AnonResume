import { act, renderHook, waitFor } from "@testing-library/react";

import { serializeResumeMarkdown } from "@/domain/resume/markdown";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import type {
  LocalResumeMarkdownDraft,
  ResumeMarkdownDraftRepository,
} from "@/lib/resume/markdown-drafts";
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

function setup(initialDraft?: LocalResumeMarkdownDraft, commitDelayMs = 10) {
  const document = createDefaultResumeDocument("zh-CN");
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

describe("useResumeMarkdownSession", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a valid candidate immediately and commits it as one debounced transaction", async () => {
    const { result, store } = setup(undefined, 5);
    await act(async () => result.current.enter());
    const nextSource = result.current.source.replace(
      'title: "AnonResume 基础简历"',
      'title: "Markdown 简历"',
    );

    act(() => result.current.setSource(nextSource));
    expect(result.current.hasSourceChanges).toBe(true);
    await waitFor(() =>
      expect(result.current.previewDocument.meta.title).toBe("Markdown 简历"),
    );
    expect(store.getState().history.past).toHaveLength(0);
    await waitFor(() => expect(store.getState().history.past).toHaveLength(1));
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
    act(() => result.current.setSource("---\nanonresume: 1\n---\n\n:::group\nbroken"));

    await waitFor(() => expect(result.current.isPreviewStale).toBe(true));
    expect(result.current.previewDocument).toBe(lastValidPreview);
    expect(store.getState().history.past).toHaveLength(0);
    await waitFor(() =>
      expect(repository.saved.at(-1)?.source).toContain(":::group\nbroken"),
    );
  });

  it("offers exact local source recovery and marks version mismatches stale", async () => {
    const draft: LocalResumeMarkdownDraft = {
      resumeId: "resume-demo",
      source: "invalid local source",
      baseVersion: 2,
      updatedAt: 500,
    };
    const { result } = setup(draft);
    await act(async () => result.current.enter());

    await waitFor(() => expect(result.current.recoveryDraft).toEqual(draft));
    expect(result.current.recoveryIsStale).toBe(true);
    act(() => result.current.recoverDraft());
    expect(result.current.source).toBe("invalid local source");
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
});
