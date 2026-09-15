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
