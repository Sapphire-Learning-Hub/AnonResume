import type { ResumeDocument } from "../schema";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function equal(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => equal(item, right[index]))
    );
  }
  if (!record(left) || !record(right)) return false;
  const keys = Object.keys(left).filter((key) => left[key] !== undefined);
  return (
    keys.length ===
      Object.keys(right).filter((key) => right[key] !== undefined).length &&
    keys.every(
      (key) => Object.hasOwn(right, key) && equal(left[key], right[key]),
    )
  );
}

export function resumeMarkdownDocumentsEqual(
  left: ResumeDocument,
  right: ResumeDocument,
) {
  return equal(left, right);
}
