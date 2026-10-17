import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import {
  decodeResumeMarkdownProjection,
  type ResumeMarkdownProjection,
} from "@/domain/resume/markdown";

export const LOCAL_RESUME_MARKDOWN_DRAFT_SCHEMA_VERSION = 1 as const;
const LOCAL_RESUME_MARKDOWN_DATABASE_VERSION = 2;

export interface LocalResumeMarkdownDraft {
  schemaVersion: typeof LOCAL_RESUME_MARKDOWN_DRAFT_SCHEMA_VERSION;
  resumeId: string;
  source: string;
  baseVersion: number;
  updatedAt: number;
  projection: ResumeMarkdownProjection;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function decodeLocalResumeMarkdownDraft(
  value: unknown,
): LocalResumeMarkdownDraft | undefined {
  if (!isRecord(value)) return undefined;
  switch (value.schemaVersion) {
    case LOCAL_RESUME_MARKDOWN_DRAFT_SCHEMA_VERSION: {
      const projection = decodeResumeMarkdownProjection(value.projection);
      if (
        typeof value.resumeId !== "string" ||
        !value.resumeId ||
        typeof value.source !== "string" ||
        typeof value.baseVersion !== "number" ||
        !Number.isInteger(value.baseVersion) ||
        value.baseVersion < 0 ||
        typeof value.updatedAt !== "number" ||
        !Number.isFinite(value.updatedAt) ||
        !projection
      ) {
        return undefined;
      }
      return {
        schemaVersion: LOCAL_RESUME_MARKDOWN_DRAFT_SCHEMA_VERSION,
        resumeId: value.resumeId,
        source: value.source,
        baseVersion: value.baseVersion,
        updatedAt: value.updatedAt,
        projection,
      };
    }
    default:
      return undefined;
  }
}

async function createDatabase(databaseName: string) {
  return openDB<ResumeMarkdownDraftDatabase>(
    databaseName,
    LOCAL_RESUME_MARKDOWN_DATABASE_VERSION,
    {
      upgrade(database, oldVersion, _newVersion, transaction) {
        if (!database.objectStoreNames.contains("drafts")) {
          database.createObjectStore("drafts", { keyPath: "resumeId" });
          return;
        }
        if (oldVersion < LOCAL_RESUME_MARKDOWN_DATABASE_VERSION) {
          transaction.objectStore("drafts").clear();
        }
      },
    },
  );
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
      const database = await getDatabase();
      const value = await database.get("drafts", resumeId);
      const draft = decodeLocalResumeMarkdownDraft(value);
      if (value !== undefined && !draft) {
        await database.delete("drafts", resumeId);
      }
      return draft;
    },
    async saveDraft(value) {
      const draft = decodeLocalResumeMarkdownDraft(value);
      if (!draft) return;
      const database = await getDatabase();
      const transaction = database.transaction("drafts", "readwrite");
      const existingValue = await transaction.store.get(draft.resumeId);
      const existing = decodeLocalResumeMarkdownDraft(existingValue);
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
