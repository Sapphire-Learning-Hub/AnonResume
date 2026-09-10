import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { ResumeDocument } from "@/domain/resume/schema";

export interface LocalResumeDraft {
  resumeId: string;
  document: ResumeDocument;
  baseVersion: number;
  updatedAt: number;
}

interface ResumeDraftDatabase extends DBSchema {
  drafts: {
    key: string;
    value: LocalResumeDraft;
  };
}

export interface ResumeDraftRepository {
  getDraft: (resumeId: string) => Promise<LocalResumeDraft | undefined>;
  saveDraft: (draft: LocalResumeDraft) => Promise<void>;
  deleteDraft: (resumeId: string) => Promise<void>;
}

async function createDatabase(
  databaseName: string,
): Promise<IDBPDatabase<ResumeDraftDatabase>> {
  return openDB<ResumeDraftDatabase>(databaseName, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains("drafts")) {
        database.createObjectStore("drafts", { keyPath: "resumeId" });
      }
    },
  });
}

export function createResumeDraftRepository({
  databaseName = "anonresume-local-drafts",
}: {
  databaseName?: string;
} = {}): ResumeDraftRepository {
  let databasePromise: Promise<IDBPDatabase<ResumeDraftDatabase>> | undefined;

  const getDatabase = async () => {
    if (!databasePromise) {
      databasePromise = createDatabase(databaseName);
    }

    return databasePromise;
  };

  return {
    async getDraft(resumeId) {
      const database = await getDatabase();

      return database.get("drafts", resumeId);
    },
    async saveDraft(draft) {
      const database = await getDatabase();

      await database.put("drafts", draft);
    },
    async deleteDraft(resumeId) {
      const database = await getDatabase();

      await database.delete("drafts", resumeId);
    },
  };
}
