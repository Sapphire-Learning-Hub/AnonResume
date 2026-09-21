type ProcessEnvironment = Record<string, string | undefined>;

export function readRuntimeIdentityEnvironment(
  environment: ProcessEnvironment = process.env,
) {
  return {
    ANONRESUME_DEPLOYMENT_ID: environment.ANONRESUME_DEPLOYMENT_ID,
    ANONRESUME_INSTANCE_ID: environment.ANONRESUME_INSTANCE_ID,
    ANONRESUME_SESSION_ID: environment.ANONRESUME_SESSION_ID,
    INVOCATION_ID: environment.INVOCATION_ID,
  };
}

export function readHealthcheckEnvironment(
  environment: ProcessEnvironment = process.env,
) {
  return {
    ANONRESUME_HEALTHCHECK_URL: environment.ANONRESUME_HEALTHCHECK_URL,
    PORT: environment.PORT,
  };
}

export function readDeploymentSecretEnvironment(
  environment: ProcessEnvironment = process.env,
) {
  return {
    ANONRESUME_SECRET_DIR: environment.ANONRESUME_SECRET_DIR,
    POSTGRES_DB: environment.POSTGRES_DB,
    POSTGRES_HOST: environment.POSTGRES_HOST,
    POSTGRES_USER: environment.POSTGRES_USER,
  };
}
