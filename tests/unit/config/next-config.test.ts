import { execFileSync } from "node:child_process";

import packageMetadata from "../../../package.json";
import nextConfig from "../../../next.config";

function readGit(args: string[]) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function readExactTag() {
  try {
    return readGit(["describe", "--tags", "--exact-match", "HEAD"]);
  } catch {
    return `v${packageMetadata.version}`;
  }
}

it("embeds the exact release tag or package version and current commit", () => {
  expect(nextConfig).toMatchObject({
    env: {
      ANONRESUME_BUILD_COMMIT: readGit(["rev-parse", "HEAD"]),
      ANONRESUME_BUILD_TAG:
        process.env.ANONRESUME_BUILD_TAG ?? readExactTag(),
    },
  });
});
