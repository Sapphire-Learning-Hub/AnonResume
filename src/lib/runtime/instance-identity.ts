import { randomUUID } from "node:crypto";
import { hostname as readHostname } from "node:os";

import type { ConfigConsumer } from "@/lib/config/types";

type RuntimeEnvironment = Record<string, string | undefined>;

export interface RuntimeIdentity {
  deploymentId: string;
  instanceId: string;
  role: ConfigConsumer;
  sessionId: string;
  stableId: string;
}

interface RuntimeIdentityOptions {
  environment?: RuntimeEnvironment;
  hostname?: () => string;
  randomSessionId?: () => string;
}

const IDENTITY_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function resolveSegment(
  value: string | undefined,
  fallback: string,
  environmentKey: string,
) {
  const resolved = value?.trim() || fallback.trim();
  if (!IDENTITY_SEGMENT.test(resolved)) {
    throw new Error(`${environmentKey} must be a simple identifier`);
  }
  return resolved;
}

export function resolveRuntimeIdentity(
  role: ConfigConsumer,
  options: RuntimeIdentityOptions = {},
): RuntimeIdentity {
  const environment = options.environment ?? process.env;
  const hostname = options.hostname ?? readHostname;
  const randomSessionId = options.randomSessionId ?? randomUUID;
  const deploymentId = resolveSegment(
    environment.ANONRESUME_DEPLOYMENT_ID,
    "default",
    "ANONRESUME_DEPLOYMENT_ID",
  );
  const instanceId = resolveSegment(
    environment.ANONRESUME_INSTANCE_ID,
    hostname(),
    "ANONRESUME_INSTANCE_ID",
  );
  const sessionId = resolveSegment(
    environment.ANONRESUME_SESSION_ID ?? environment.INVOCATION_ID,
    randomSessionId(),
    "ANONRESUME_SESSION_ID",
  );

  return Object.freeze({
    deploymentId,
    instanceId,
    role,
    sessionId,
    stableId: `${deploymentId}/${role}/${instanceId}`,
  });
}

export function createLeaseOwner(
  identity: Pick<RuntimeIdentity, "stableId" | "sessionId">,
) {
  return `${identity.stableId}/${identity.sessionId}`;
}
