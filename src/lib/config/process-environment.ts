type ProcessEnvironment = Record<string, string | undefined>;

export function readNodeEnvironment(
  environment: ProcessEnvironment = process.env,
) {
  return environment.NODE_ENV;
}

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

export function readLoggingEnvironment(
  environment: ProcessEnvironment = process.env,
) {
  return {
    ANONRESUME_LOG_ENVIRONMENT: environment.ANONRESUME_LOG_ENVIRONMENT,
    ANONRESUME_LOG_FORMAT: environment.ANONRESUME_LOG_FORMAT,
    ANONRESUME_LOG_LEVEL: environment.ANONRESUME_LOG_LEVEL,
    NODE_ENV: environment.NODE_ENV,
  };
}

export function readRuntimeSupervisorEnvironment(
  environment: ProcessEnvironment = process.env,
) {
  return {
    ANONRESUME_PROCESS_SUPERVISOR:
      environment.ANONRESUME_PROCESS_SUPERVISOR,
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
