import { readBootstrapConfig } from "@/lib/config/bootstrap";
import { createConfigKeyring } from "@/lib/config/crypto";
import { migrateLegacySecrets } from "@/lib/config/secret-migration";
import { getDatabasePool } from "@/lib/runtime/database";

const argumentsSet = new Set(process.argv.slice(2));
const knownArguments = new Set(["--apply", "--dry-run", "--worker-stopped"]);
const unknownArguments = [...argumentsSet].filter(
  (argument) => !knownArguments.has(argument),
);

if (unknownArguments.length > 0) {
  throw new Error(`Unknown arguments: ${unknownArguments.join(", ")}`);
}
if (argumentsSet.has("--apply") && argumentsSet.has("--dry-run")) {
  throw new Error("Use either --dry-run or --apply, not both");
}
if (argumentsSet.has("--worker-stopped") && !argumentsSet.has("--apply")) {
  throw new Error("--worker-stopped requires --apply");
}

const bootstrap = readBootstrapConfig();

try {
  const result = await migrateLegacySecrets({
    apply: argumentsSet.has("--apply"),
    keyring: createConfigKeyring({
      current: bootstrap.currentMasterKey,
      previous: bootstrap.previousMasterKey,
    }),
    legacyAdminMfaKey: bootstrap.legacyAdminMfaKey,
    legacyAiCredentialsKey: bootstrap.legacyAiCredentialsKey,
    workerStopped: argumentsSet.has("--worker-stopped"),
  });
  for (const [name, value] of Object.entries(result.counts)) {
    console.info(`${name}: ${value}`);
  }
  console.info(`result: ${result.applied ? "applied" : "dry-run"}`);
} finally {
  await getDatabasePool().end();
}
