import type { ResumeSearchMatch, TextSearchMatch } from "./types";

function fieldIdentity(match: ResumeSearchMatch) {
  return JSON.stringify([
    match.sectionId,
    match.field,
    match.blockPath,
    match.badgeItemId,
    match.paragraphIndex,
  ]);
}

/** Follow an original occurrence, skipping any new matches introduced by replacement. */
export function nextMatchAfterReplacement<T extends TextSearchMatch>(
  before: T[],
  after: T[],
  index: number,
  replacement: string,
  identity: (match: T) => string = () => "source",
): number {
  const target = before[index];
  if (!target) return 0;
  const delta = replacement.length - (target.to - target.from);
  for (let step = 1; step < before.length; step += 1) {
    const next = before[(index + step) % before.length]!;
    const shift =
      identity(next) === identity(target) && next.from >= target.to ? delta : 0;
    const found = after.findIndex(
      (match) =>
        identity(match) === identity(next) &&
        match.from === next.from + shift &&
        match.to === next.to + shift &&
        match.text === next.text,
    );
    if (found >= 0) return found;
  }
  return 0;
}

export function nextResumeMatchAfterReplacement(
  before: ResumeSearchMatch[],
  after: ResumeSearchMatch[],
  index: number,
  replacement: string,
) {
  return nextMatchAfterReplacement(
    before,
    after,
    index,
    replacement,
    fieldIdentity,
  );
}
