import { inspectBootstrapCredentials } from "@/lib/config/bootstrap";
import {
  diagnoseConfiguration,
  diagnoseUnavailableConfiguration,
  formatConfigurationDoctorReport,
  type ConfigurationDoctorReport,
} from "@/lib/config/doctor";

const argumentsSet = new Set(process.argv.slice(2));
const unknownArguments = [...argumentsSet].filter(
  (argument) => argument !== "--json",
);
if (unknownArguments.length > 0) {
  throw new Error(`Unknown arguments: ${unknownArguments.join(", ")}`);
}

const credentials = inspectBootstrapCredentials();
const bootstrapInvalid = credentials.some((credential) =>
  credential.status === "invalid" ||
  (credential.required && credential.status !== "present")
);
let report: ConfigurationDoctorReport;
let databaseOpened = false;

if (bootstrapInvalid) {
  report = diagnoseUnavailableConfiguration(credentials);
} else {
  try {
    databaseOpened = true;
    const { readConfigurationDoctorInput } = await import(
      "@/lib/config/doctor-store"
    );
    report = diagnoseConfiguration(await readConfigurationDoctorInput());
  } catch {
    report = diagnoseUnavailableConfiguration(credentials);
  } finally {
    if (databaseOpened) {
      const { getDatabasePool } = await import("@/lib/runtime/database");
      await getDatabasePool().end().catch(() => undefined);
    }
  }
}

console.info(
  argumentsSet.has("--json")
    ? JSON.stringify(report, null, 2)
    : formatConfigurationDoctorReport(report),
);
process.exitCode = report.exitCode;
