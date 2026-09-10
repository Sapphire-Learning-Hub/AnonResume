import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";

import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import {
  ResumeValidationClientError,
  ResumeVersionConflictClientError,
} from "@/lib/resume/client";
import type { LocalResumeDraft } from "@/lib/resume/drafts";
import { createResumeEditorStore } from "@/stores/resume-editor";

import { useResumePersistence } from "@/components/editor/useResumePersistence";

function createDeferredPromise<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

describe("useResumePersistence", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces autosave, writes a local draft, and marks the store as saved", async () => {
    vi.useFakeTimers();

    const draftRepository = {
      getDraft: vi.fn().mockResolvedValue(undefined),
      saveDraft: vi.fn().mockResolvedValue(undefined),
      deleteDraft: vi.fn().mockResolvedValue(undefined),
    };
    const saveDocument = vi.fn().mockResolvedValue({
      version: 2,
      updatedAt: 800,
    });
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });

    renderHook(() =>
      useResumePersistence({
        store,
        draftRepository,
        saveDocument,
        debounceMs: 800,
        initialUpdatedAt: 100,
      }),
    );

    act(() => {
      store.getState().updateTextBlock({
        sectionId: "section-profile",
        blockPath: ["block-profile-summary"],
        text: "Autosave test",
      });
    });

    expect(saveDocument).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(saveDocument).toHaveBeenCalledTimes(1);
    expect(draftRepository.saveDraft).toHaveBeenCalledTimes(1);
    expect(draftRepository.deleteDraft).toHaveBeenCalledWith("resume-demo");
    expect(store.getState().saveStatus).toBe("saved");
    expect(store.getState().dirty).toBe(false);
    expect(store.getState().version).toBe(2);
  });

  it("persists a link when another text block changes during its save", async () => {
    vi.useFakeTimers();

    const firstSave = createDeferredPromise<{
      version: number;
      updatedAt: number;
    }>();
    const draftRepository = {
      getDraft: vi.fn().mockResolvedValue(undefined),
      saveDraft: vi.fn().mockResolvedValue(undefined),
      deleteDraft: vi.fn().mockResolvedValue(undefined),
    };
    const saveDocument = vi
      .fn()
      .mockImplementationOnce(() => firstSave.promise)
      .mockResolvedValueOnce({
        version: 3,
        updatedAt: 900,
      });
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 1,
      updatedAt: 100,
    });

    renderHook(() =>
      useResumePersistence({
        store,
        draftRepository,
        saveDocument,
        debounceMs: 800,
        initialUpdatedAt: 100,
      }),
    );

    act(() => {
      store.getState().updateSectionTitle({
        sectionId: "section-profile",
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "个" },
                {
                  type: "text",
                  text: "人简介",
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
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(saveDocument).toHaveBeenCalledTimes(1);

    act(() => {
      store.getState().updateTextBlock({
        sectionId: "section-experience",
        blockPath: ["group-experience-anonresume", "text-experience-context"],
        text: "继续编辑另一段内容",
      });
    });

    await act(async () => {
      firstSave.resolve({
        version: 2,
        updatedAt: 800,
      });
      await Promise.resolve();
    });

    expect(store.getState().dirty).toBe(true);
    expect(store.getState().version).toBe(2);
    expect(draftRepository.deleteDraft).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(saveDocument).toHaveBeenCalledTimes(2);
    expect(saveDocument).toHaveBeenLastCalledWith(
      expect.objectContaining({
        version: 2,
        document: expect.objectContaining({
          sections: expect.arrayContaining([
            expect.objectContaining({
              id: "section-profile",
              title: expect.objectContaining({
                content: expect.arrayContaining([
                  expect.objectContaining({
                    content: expect.arrayContaining([
                      expect.objectContaining({
                        marks: [
                          {
                            type: "link",
                            attrs: { href: "https://example.com/profile" },
                          },
                        ],
                      }),
                    ]),
                  }),
                ]),
              }),
            }),
          ]),
        }),
      }),
    );
    expect(store.getState().dirty).toBe(false);
    expect(draftRepository.deleteDraft).toHaveBeenCalledTimes(1);
  });

  it("loads a newer local draft into recovery state", async () => {
    const recoveryDocument = createDefaultResumeDocument();
    recoveryDocument.meta.title = "Recovered Local Draft";

    const draft: LocalResumeDraft = {
      resumeId: "resume-demo",
      document: recoveryDocument,
      baseVersion: 3,
      updatedAt: 900,
    };
    const draftRepository = {
      getDraft: vi.fn().mockResolvedValue(draft),
      saveDraft: vi.fn().mockResolvedValue(undefined),
      deleteDraft: vi.fn().mockResolvedValue(undefined),
    };
    const saveDocument = vi.fn().mockResolvedValue({
      version: 4,
      updatedAt: 1000,
    });
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 3,
      updatedAt: 100,
    });

    renderHook(() =>
      useResumePersistence({
        store,
        draftRepository,
        saveDocument,
        debounceMs: 800,
        initialUpdatedAt: 100,
      }),
    );

    await waitFor(() =>
      expect(store.getState().recoveryDraft?.updatedAt).toBe(900),
    );
  });

  it("stores version conflict state when autosave hits a stale document", async () => {
    vi.useFakeTimers();

    const draftRepository = {
      getDraft: vi.fn().mockResolvedValue(undefined),
      saveDraft: vi.fn().mockResolvedValue(undefined),
      deleteDraft: vi.fn().mockResolvedValue(undefined),
    };
    const saveDocument = vi
      .fn()
      .mockRejectedValue(new ResumeVersionConflictClientError(7));
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 3,
      updatedAt: 100,
    });

    renderHook(() =>
      useResumePersistence({
        store,
        draftRepository,
        saveDocument,
        debounceMs: 800,
        initialUpdatedAt: 100,
      }),
    );

    act(() => {
      store.getState().updateTextBlock({
        sectionId: "section-profile",
        blockPath: ["block-profile-summary"],
        text: "Conflict test",
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(store.getState().saveStatus).toBe("error");
    expect(store.getState().saveConflict).toEqual({
      currentVersion: 7,
    });
    expect(draftRepository.deleteDraft).not.toHaveBeenCalled();
  });

  it("stores validation issues when autosave payload is rejected by the server", async () => {
    vi.useFakeTimers();

    const draftRepository = {
      getDraft: vi.fn().mockResolvedValue(undefined),
      saveDraft: vi.fn().mockResolvedValue(undefined),
      deleteDraft: vi.fn().mockResolvedValue(undefined),
    };
    const saveDocument = vi.fn().mockRejectedValue(
      new ResumeValidationClientError([
        {
          code: "invalid_color",
          path: "settings.theme.accent",
          message: "Accent color must be a valid hex color.",
        },
      ]),
    );
    const store = createResumeEditorStore({
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      version: 3,
      updatedAt: 100,
    });

    renderHook(() =>
      useResumePersistence({
        store,
        draftRepository,
        saveDocument,
        debounceMs: 800,
        initialUpdatedAt: 100,
      }),
    );

    act(() => {
      store.getState().updateTextBlock({
        sectionId: "section-profile",
        blockPath: ["block-profile-summary"],
        text: "Validation test",
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(store.getState().saveStatus).toBe("error");
    expect(store.getState().saveValidation).toEqual({
      issues: [
        {
          code: "invalid_color",
          path: "settings.theme.accent",
          message: "Accent color must be a valid hex color.",
        },
      ],
    });
    expect(draftRepository.deleteDraft).not.toHaveBeenCalled();
  });
});
