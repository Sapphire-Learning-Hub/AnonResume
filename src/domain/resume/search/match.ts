import type { ResumeSearchQuery, TextSearchMatch } from "./types";

export function findTextMatches(
  text: string,
  query: ResumeSearchQuery,
): TextSearchMatch[] {
  if (!query.text) return [];
  const escaped = query.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(escaped, query.caseSensitive ? "gu" : "giu");
  return Array.from(text.matchAll(pattern), (match) => ({
    from: match.index,
    to: match.index + match[0].length,
    text: match[0],
  }));
}
