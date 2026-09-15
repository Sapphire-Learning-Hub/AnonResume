import { execFileSync } from "node:child_process";

import packageMetadata from "../../../package.json";

const RELEASE_COMMIT_LENGTH = 12;

export interface ReleaseMetadata {
  tag: string;
  commit: string | null;
}

type GitReader = (args: readonly string[]) => string | null;

function normalize(value: string | undefined | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function readGit(args: readonly string[]) {
  try {
    return normalize(
      execFileSync("git", [...args], {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    return null;
  }
}

export function resolveReleaseMetadata(options?: {
  env?: NodeJS.ProcessEnv;
  readGit?: GitReader;
}): ReleaseMetadata {
  const env = options?.env ?? process.env;
  const git = options?.readGit ?? readGit;
  const embeddedTag = normalize(env.ANONRESUME_BUILD_TAG);
  const embeddedCommit = normalize(env.ANONRESUME_BUILD_COMMIT);
  const tag = embeddedTag ?? git(["describe", "--tags", "--abbrev=0", "HEAD"]);
  const commit = embeddedCommit ?? git(["rev-parse", "HEAD"]);
  const packageVersion = normalize(packageMetadata.version);

  return {
    tag:
      tag ??
      normalize(env.ANONRESUME_RELEASE) ??
      (env.NODE_ENV === "development"
        ? "development"
        : packageVersion
          ? `v${packageVersion}`
          : "untagged"),
    commit,
  };
}

export function formatReleaseMetadata(metadata: ReleaseMetadata) {
  if (!metadata.commit) {
    return metadata.tag;
  }

  return `${metadata.tag} · ${metadata.commit.slice(0, RELEASE_COMMIT_LENGTH)}`;
}

export function getApplicationRelease() {
  return formatReleaseMetadata(
    resolveReleaseMetadata({
      env: {
        ANONRESUME_BUILD_COMMIT: process.env.ANONRESUME_BUILD_COMMIT,
        ANONRESUME_BUILD_TAG: process.env.ANONRESUME_BUILD_TAG,
        ANONRESUME_RELEASE: process.env.ANONRESUME_RELEASE,
        NODE_ENV: process.env.NODE_ENV,
      },
    }),
  );
}
