import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface LocalResumeMarkdownDraft {
  resumeId: string;
  source: string;
  baseVersion: number;
  updatedAt: number;
}

interface ResumeMarkdownDraftDatabase extends DBSchema {
  drafts: {
    key: string;
    value: LocalResumeMarkdownDraft;
  };
}

export interface ResumeMarkdownDraftRepository {
  getDraft: (
    resumeId: string,
  ) => Promise<LocalResumeMarkdownDraft | undefined>;
  saveDraft: (draft: LocalResumeMarkdownDraft) => Promise<void>;
  deleteDraft: (resumeId: string) => Promise<void>;
}

async function createDatabase(databaseName: string) {
  return openDB<ResumeMarkdownDraftDatabase>(databaseName, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains("drafts")) {
        database.createObjectStore("drafts", { keyPath: "resumeId" });
      }
    },
  });
}

export function createResumeMarkdownDraftRepository({
  databaseName = "anonresume-local-markdown-drafts",
}: {
  databaseName?: string;
} = {}): ResumeMarkdownDraftRepository {
  let databasePromise:
    | Promise<IDBPDatabase<ResumeMarkdownDraftDatabase>>
    | undefined;

  const getDatabase = () => {
    databasePromise ??= createDatabase(databaseName);
    return databasePromise;
  };

  return {
    async getDraft(resumeId) {
      return (await getDatabase()).get("drafts", resumeId);
    },
    async saveDraft(draft) {
      const database = await getDatabase();
      const transaction = database.transaction("drafts", "readwrite");
      const existing = await transaction.store.get(draft.resumeId);
      if (!existing || draft.updatedAt >= existing.updatedAt) {
        await transaction.store.put(draft);
      }
      await transaction.done;
    },
    async deleteDraft(resumeId) {
      await (await getDatabase()).delete("drafts", resumeId);
    },
  };
}
