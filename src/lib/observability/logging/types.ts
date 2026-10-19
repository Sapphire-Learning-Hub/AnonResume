import type { RuntimeIdentity } from "@/lib/runtime/instance-identity";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogServiceRole =
  | RuntimeIdentity["role"]
  | "migrate"
  | "maintenance"
  | "cli";

export interface LogContext {
  method?: string;
  path?: string;
  requestId?: string;
  upstreamRequestId?: string;
}

export type LogScalar = string | number | boolean | null;
export type LogValue =
  | LogScalar
  | readonly LogValue[]
  | { readonly [key: string]: LogValue };

export interface SafeErrorFields {
  causes?: Array<Omit<SafeErrorFields, "causes">>;
  code?: string;
  digest?: string;
  message: string;
  stackTrace?: string;
  type?: string;
}

export interface LogFields {
  details?: Readonly<Record<string, LogValue>>;
  durationNs?: number;
  error?: SafeErrorFields;
  keyId?: string;
  labels?: Readonly<Record<string, LogScalar>>;
  method?: string;
  outcome?: "success" | "failure" | "unknown";
  path?: string;
  requestId?: string;
  statusCode?: number;
  transactionId?: string;
  upstreamRequestId?: string;
}

export interface LogDestination {
  write(line: string): void;
}

export interface ApplicationLogger {
  debug(action: string, fields?: LogFields, message?: string): void;
  error(action: string, fields?: LogFields, message?: string): void;
  info(action: string, fields?: LogFields, message?: string): void;
  warn(action: string, fields?: LogFields, message?: string): void;
}

export interface LoggingConfiguration {
  environment: string;
  format: "json" | "pretty";
  level: LogLevel;
}
