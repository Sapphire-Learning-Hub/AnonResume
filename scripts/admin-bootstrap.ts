import { bootstrapConfiguredSuperAdmin } from "@/lib/admin-bootstrap";
import { getDatabasePool } from "@/lib/database";
import { closeEmailTransporter } from "@/lib/email";
import { validateRuntimeConfiguration } from "@/lib/runtime-configuration";

const requestedMode = process.argv[2];
if (
  requestedMode !== undefined &&
  requestedMode !== "development" &&
  requestedMode !== "production"
) {
  throw new Error(
    "Admin bootstrap mode must be either development or production",
  );
}

const environment: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV:
    requestedMode ??
    (process.env.NODE_ENV === "production" ? "production" : "development"),
};
const configuration = validateRuntimeConfiguration(environment);
if (!configuration.valid) {
  console.warn(
    `[AnonResume] Admin bootstrap deferred because production configuration is invalid: ${configuration.issues.join(", ")}`,
  );
} else {
  try {
    const result = await bootstrapConfiguredSuperAdmin(environment);
    console.info(`[AnonResume] Admin bootstrap state: ${result.state}`);
  } finally {
    closeEmailTransporter();
    await getDatabasePool().end();
  }
}
