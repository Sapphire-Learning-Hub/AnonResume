import { AsyncLocalStorage } from "node:async_hooks";

import { ecsFormat } from "@elastic/ecs-pino-format";
import pino, { type Logger, type LoggerOptions } from "pino";

import {
  resolveRuntimeIdentity,
  type RuntimeIdentity,
} from "@/lib/runtime/instance-identity";
import { resolveReleaseMetadata } from "@/lib/runtime/release-metadata";
import { applicationBuildId } from "@/lib/config/build-metadata";

import { readLoggingConfiguration } from "./config";
import { redactLogFields } from "./redaction";
import { getDiagnosticContext } from "@/lib/observability/diagnostics/context";
import { captureDiagnosticLog } from "@/lib/observability/diagnostics/store/runtime";
import type {
  ApplicationLogger,
  LogContext,
  LogDestination,
  LogFields,
  LogLevel,
  LogServiceRole,
} from "./types";

const ECS_VERSION = "8.17.0";
const logContext = new AsyncLocalStorage<LogContext>();

interface LoggingState {
  identity: Omit<RuntimeIdentity, "role"> & { role: LogServiceRole };
  logger: Logger;
}

let state: LoggingState | undefined;

function isRuntimeRole(
  role: LogServiceRole,
): role is RuntimeIdentity["role"] {
  return role === "web" || role === "pdf-worker" || role === "ai-worker";
}

function resolveLoggingIdentity(
  role: LogServiceRole,
  identity?: RuntimeIdentity,
): LoggingState["identity"] {
  if (identity) {
    return { ...identity, role };
  }

  const resolved = resolveRuntimeIdentity(isRuntimeRole(role) ? role : "web");
  return { ...resolved, role };
}

function withEcsVersion(options: LoggerOptions): LoggerOptions {
  const bindings = options.formatters?.bindings;

  return {
    ...options,
    formatters: {
      ...options.formatters,
      bindings(input) {
        const formatted: Record<string, unknown> = {
          ...(bindings ? bindings(input) : input),
        };
        delete formatted["event.dataset"];
        formatted["ecs.version"] = ECS_VERSION;
        return formatted;
      },
    },
  };
}

function createLogger(
  role: LogServiceRole,
  identity: LoggingState["identity"],
  destination?: LogDestination,
) {
  const configuration = readLoggingConfiguration();
  const release = resolveReleaseMetadata();
  const options = withEcsVersion(
    ecsFormat({
      apmIntegration: false,
      convertErr: false,
      convertReqRes: false,
      serviceEnvironment: configuration.environment,
      serviceName: `anonresume-${role}`,
      serviceNodeName: identity.instanceId,
      serviceVersion: release.tag,
    }),
  );
  const loggerOptions: LoggerOptions = {
    ...options,
    base: {
      "service.deployment.id": identity.deploymentId,
      "service.session.id": identity.sessionId,
      "service.build.id": applicationBuildId === "development" ? release.commit ?? "unknown" : applicationBuildId,
      "service.commit.id": release.commit,
    },
    level: configuration.level,
  };

  if (destination) {
    return pino(loggerOptions, destination);
  }
  if (configuration.format === "pretty") {
    return pino(
      loggerOptions,
      pino.transport({
        options: { colorize: process.stdout.isTTY, singleLine: true },
        target: "pino-pretty",
      }),
    );
  }

  return pino(loggerOptions);
}

export function initializeLogging(input: {
  role: LogServiceRole;
  identity?: RuntimeIdentity;
  destination?: LogDestination;
}) {
  const identity = resolveLoggingIdentity(input.role, input.identity);
  state = {
    identity,
    logger: createLogger(input.role, identity, input.destination),
  };
}

function getState() {
  if (!state) {
    initializeLogging({ role: "web" });
  }

  if (!state) {
    throw new Error("logging_runtime_unavailable");
  }

  return state;
}

function mapFields(fields: LogFields = {}) {
  const diagnostic = getDiagnosticContext();
  const span = diagnostic?.traceparent?.split("-");
  fields = redactLogFields(fields);
  const activeContext = getLogContext();
  const context = activeContext
    ? redactLogFields({
        method: activeContext.method,
        path: activeContext.path,
        requestId: activeContext.requestId,
        upstreamRequestId: activeContext.upstreamRequestId,
      })
    : undefined;
  const requestId = fields.requestId ?? context?.requestId;
  const upstreamRequestId =
    fields.upstreamRequestId ?? context?.upstreamRequestId;
  const method = fields.method ?? context?.method;
  const path = fields.path ?? context?.path;

  return {
    ...(fields.details ?? {}),
    ...(diagnostic ? { "diagnostic.id": diagnostic.diagnosticId } : {}),
    ...(span ? { "trace.id": span[1], "span.id": span[2] } : {}),
    ...(fields.durationNs === undefined
      ? {}
      : { "event.duration": fields.durationNs }),
    ...(fields.error
      ? {
          "error.code": fields.error.code,
          "error.digest": fields.error.digest,
          "error.message": fields.error.message,
          "error.stack_trace": fields.error.stackTrace,
          "error.type": fields.error.type,
          "error.causes": fields.error.causes,
        }
      : {}),
    ...(fields.keyId === undefined ? {} : { key_id: fields.keyId }),
    ...Object.fromEntries(
      Object.entries(fields.labels ?? {}).map(([key, value]) => [
        `labels.${key}`,
        value,
      ]),
    ),
    ...(fields.outcome === undefined
      ? {}
      : { "event.outcome": fields.outcome }),
    ...(method === undefined ? {} : { "http.request.method": method }),
    ...(fields.statusCode === undefined
      ? {}
      : { "http.response.status_code": fields.statusCode }),
    ...(requestId === undefined ? {} : { "request.id": requestId }),
    ...(fields.transactionId === undefined
      ? {}
      : { "transaction.id": fields.transactionId }),
    ...(upstreamRequestId === undefined
      ? {}
      : { "http.request.id": upstreamRequestId }),
    ...(path === undefined ? {} : { "url.path": path }),
  };
}

function write(
  level: LogLevel,
  dataset: string,
  action: string,
  fields?: LogFields,
  message?: string,
) {
  const { logger } = getState();
  captureDiagnosticLog(level, dataset, action, fields);
  logger[level](
    {
      ...mapFields(fields),
      "event.action": action,
      "event.dataset": dataset,
    },
    message ?? action,
  );
}

export function getLogger(dataset: string): ApplicationLogger {
  return {
    debug: (action, fields, message) =>
      write("debug", dataset, action, fields, message),
    error: (action, fields, message) =>
      write("error", dataset, action, fields, message),
    info: (action, fields, message) =>
      write("info", dataset, action, fields, message),
    warn: (action, fields, message) =>
      write("warn", dataset, action, fields, message),
  };
}

export function writeLocalSensitiveEvent(input: {
  action: string;
  message: string;
}) {
  const { logger } = getState();
  logger.info(
    {
      "event.action": input.action,
      "event.dataset": "anonresume.local",
      "labels.centralize": false,
    },
    input.message,
  );
}

export function runWithLogContext<T>(
  context: LogContext,
  operation: () => T,
): T {
  return logContext.run(Object.freeze({ ...context }), operation);
}

export function getLogContext() {
  return logContext.getStore();
}
