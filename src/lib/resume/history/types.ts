import type { ResumeDocument } from "@/domain/resume/schema";
import type { PageResult } from "@/lib/shared/pagination";

export type ResumeSnapshotKind = "retained" | "autosave";
export interface ResumeVersionSnapshotSummary {
  id: string;
  version: number;
  createdAt: number;
  kind: ResumeSnapshotKind;
}
export interface ResumeVersionSnapshotDetail extends ResumeVersionSnapshotSummary {
  document: ResumeDocument;
}
export type ResumeVersionHistoryPage = PageResult<ResumeVersionSnapshotSummary> & {
  autosave: ResumeVersionSnapshotSummary | null;
};
