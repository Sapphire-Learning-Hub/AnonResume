export interface ResumeSearchQuery {
  text: string;
  caseSensitive: boolean;
}

export interface TextSearchMatch {
  from: number;
  to: number;
  text: string;
}

export interface RichTextSearchMatch extends TextSearchMatch {
  paragraphIndex: number;
}

export interface ResumeSearchMatch extends RichTextSearchMatch {
  key: string;
  sectionId: string;
  blockPath: string[];
  badgeItemId?: string;
  field: "title" | "content" | "badge";
}
