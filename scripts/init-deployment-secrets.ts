import { initializeDeploymentSecrets } from "@/lib/runtime/deployment-secrets";

const directory = process.env.ANONRESUME_SECRET_DIR?.trim() ||
  "/run/anonresume-secrets";
const result = await initializeDeploymentSecrets({
  directory,
  databaseHost: process.env.POSTGRES_HOST?.trim() || "postgres",
  databaseName: process.env.POSTGRES_DB?.trim() || "anonresume",
  databaseUser: process.env.POSTGRES_USER?.trim() || "anonresume",
});

console.info(`[AnonResume] Deployment secrets: ${result.state}`);
