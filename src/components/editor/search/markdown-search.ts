import type {
  ResumeSearchQuery,
  TextSearchMatch,
} from "@/domain/resume/search/types";

export interface MarkdownSearchHandle {
  setQuery: (query: ResumeSearchQuery | null) => void;
  selectMatch: (match: TextSearchMatch) => void;
  replaceMatches: (
    query: ResumeSearchQuery,
    replacement: string,
    target?: TextSearchMatch,
  ) => number;
}
