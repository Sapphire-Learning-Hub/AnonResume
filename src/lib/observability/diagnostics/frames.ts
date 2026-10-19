export function safeServerFrames(stack?: string): string | undefined {
  const frames = (stack ?? "")
    .slice(0, 32_768)
    .split("\n")
    .slice(1)
    .flatMap((line) => {
      const match = line.replaceAll("\\", "/").match(
        /(?:^|[/ (])((?:src|scripts|node_modules|\.next)\/[A-Za-z0-9_./@+()[\]-]+\.(?:[cm]?[jt]sx?)):(\d{1,9}):(\d{1,7})(?:\)|$)/,
      );
      return match ? [`at ${match[1]}:${match[2]}:${match[3]}`] : [];
    })
    .slice(0, 16);
  return frames.length ? frames.join("\n").slice(0, 4096) : undefined;
}
