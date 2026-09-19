import { readBootstrapConfig } from "@/lib/config/bootstrap";
import { createConfigKeyring } from "@/lib/config/crypto";
import {
  formatLegacyEnvironmentPlan,
  importLegacyManagedConfig,
} from "@/lib/config/legacy-environment";
import { getDatabasePool } from "@/lib/runtime/database";

const argumentsSet = new Set(process.argv.slice(2));
const knownArguments = new Set(["--apply", "--dry-run", "--replace-active"]);
const unknownArguments = [...argumentsSet].filter(
  (argument) => !knownArguments.has(argument),
);

if (unknownArguments.length > 0) {
  throw new Error(`Unknown arguments: ${unknownArguments.join(", ")}`);
}
if (argumentsSet.has("--apply") && argumentsSet.has("--dry-run")) {
  throw new Error("Use either --dry-run or --apply, not both");
}
if (argumentsSet.has("--replace-active") && !argumentsSet.has("--apply")) {
  throw new Error("--replace-active requires --apply");
}

const bootstrap = readBootstrapConfig();
const keyring = createConfigKeyring({
  current: bootstrap.currentMasterKey,
  previous: bootstrap.previousMasterKey,
});

try {
  const result = await importLegacyManagedConfig({
    actorUserId: "environment-import",
    apply: argumentsSet.has("--apply"),
    environment: process.env,
    keyring,
    replaceActive: argumentsSet.has("--replace-active"),
  });
  console.info(formatLegacyEnvironmentPlan(result.entries));
  console.info(
    result.applied
      ? `published: v${result.activeVersion}`
      : result.changedKeys.length === 0
        ? "result: unchanged"
        : "result: dry-run",
  );
} finally {
  await getDatabasePool().end();
}
