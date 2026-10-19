import { parseArgs } from "node:util";
import { symbolicatePosition } from "@/lib/observability/diagnostics/sourcemaps/reader";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    manifest: { type: "string" },
    build: { type: "string" },
    asset: { type: "string" },
    digest: { type: "string" },
    line: { type: "string" },
    column: { type: "string" },
  },
});
try {
  if (!values.manifest || !values.build || !values.asset || !values.digest)
    throw new Error("invalid_arguments");
  console.info(
    await symbolicatePosition({
      manifest: values.manifest,
      buildId: values.build,
      asset: values.asset,
      assetDigest: values.digest,
      line: Number(values.line),
      column: Number(values.column),
    }),
  );
} catch {
  console.error(
    "Unable to resolve position. Verify private artifacts, build, asset digest and coordinates.",
  );
  process.exitCode = 1;
}
