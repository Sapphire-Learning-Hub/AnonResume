import packageMetadata from "../../../../package.json";
import { resolveReleaseMetadata } from "@/lib/runtime/release-metadata";

it("uses the package release version when production Git tags are unavailable", () => {
  expect(
    resolveReleaseMetadata({
      env: { NODE_ENV: "production" },
      readGit: () => null,
    }),
  ).toEqual({
    tag: `v${packageMetadata.version}`,
    commit: null,
  });
});

it("does not report an ancestor tag for an untagged production commit", () => {
  expect(
    resolveReleaseMetadata({
      env: { NODE_ENV: "production" },
      readGit: (args) => {
        if (args[0] === "rev-parse") return "94d8db689a9e";
        if (args.includes("--exact-match")) return null;
        return "v1.6.0-beta.2";
      },
    }),
  ).toEqual({
    tag: `v${packageMetadata.version}`,
    commit: "94d8db689a9e",
  });
});
