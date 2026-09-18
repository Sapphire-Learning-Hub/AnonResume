function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`).join(",")}}`;
}

function seededFnv1a(value: string, seed: number) {
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function hashAiContent(value: unknown) {
  const canonical = canonicalize(value);
  return Array.from({ length: 8 }, (_, index) =>
    seededFnv1a(canonical, Math.imul(index + 1, 0x9e3779b1)),
  ).join("");
}
