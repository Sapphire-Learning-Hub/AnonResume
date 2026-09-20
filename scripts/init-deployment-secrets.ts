import { readDeploymentSecretEnvironment } from "@/lib/config/process-environment";
import { initializeDeploymentSecrets } from "@/lib/runtime/deployment-secrets";

const environment = readDeploymentSecretEnvironment();
const directory = environment.ANONRESUME_SECRET_DIR?.trim() ||
  "/run/anonresume-secrets";
const result = await initializeDeploymentSecrets({
  directory,
  databaseHost: environment.POSTGRES_HOST?.trim() || "postgres",
  databaseName: environment.POSTGRES_DB?.trim() || "anonresume",
  databaseUser: environment.POSTGRES_USER?.trim() || "anonresume",
});

console.info(`[AnonResume] Deployment secrets: ${result.state}`);
