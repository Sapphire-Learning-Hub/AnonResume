import { execFileSync } from "node:child_process";

import nextConfig from "../../../next.config";

function readGit(args: string[]) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

it("embeds the nearest reachable tag and current commit in the build", () => {
  expect(nextConfig).toMatchObject({
    env: {
      ANONRESUME_BUILD_COMMIT: readGit(["rev-parse", "HEAD"]),
      ANONRESUME_BUILD_TAG: readGit([
        "describe",
        "--tags",
        "--abbrev=0",
        "HEAD",
      ]),
    },
  });
});
