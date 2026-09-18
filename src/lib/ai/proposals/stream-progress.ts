function decodePartialJsonString(value: string) {
  let decoded = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (character !== "\\") {
      decoded += character;
      continue;
    }

    const escaped = value[index + 1];
    if (!escaped) break;
    index += 1;
    if (escaped === "u") {
      const codePoint = value.slice(index + 1, index + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(codePoint)) break;
      decoded += String.fromCharCode(Number.parseInt(codePoint, 16));
      index += 4;
      continue;
    }
    decoded +=
      escaped === "n"
        ? "\n"
        : escaped === "r"
          ? "\r"
          : escaped === "t"
            ? "\t"
            : escaped === "b"
              ? "\b"
              : escaped === "f"
                ? "\f"
                : escaped;
  }
  return decoded;
}

function partialStringProperty(source: string, property: string) {
  const match = new RegExp(`"${property}"\\s*:\\s*"`).exec(source);
  if (!match) return "";
  const start = match.index + match[0].length;
  let escaped = false;
  let end = source.length;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      end = index;
      break;
    }
  }
  return decodePartialJsonString(source.slice(start, end));
}

function countCompletedChanges(source: string) {
  const match = /"changes"\s*:\s*\[/.exec(source);
  if (!match) return 0;
  let depth = 0;
  let completed = 0;
  let inString = false;
  let escaped = false;

  for (let index = match.index + match[0].length; index < source.length; index += 1) {
    const character = source[index]!;
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) completed += 1;
    } else if (character === "]" && depth === 0) {
      break;
    }
  }
  return completed;
}

export function getAiProposalStreamProgress(source: string) {
  return {
    summary: partialStringProperty(source, "summary"),
    completedChanges: countCompletedChanges(source),
  };
}
