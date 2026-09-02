import { join } from "node:path";

import { scanStyleArchitecture } from "./style-architecture";

async function main() {
  const issues = await scanStyleArchitecture(join(process.cwd(), "src"));

  if (issues.length === 0) {
    console.log("[check:styles] 0 issues.");
    return;
  }

  for (const issue of issues) {
    console.error(
      `[check:styles] ${issue.filePath}:${issue.line}:${issue.column} ${issue.code} ${issue.message}`,
    );
  }

  process.exitCode = 1;
}

await main();
