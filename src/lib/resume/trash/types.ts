export interface ResumeTrashEntry {
  id: string;
  title: string;
  version: number;
  deletedAt: number;
  purgeAfter: number;
  recoverable: boolean;
}

export const RESUME_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
