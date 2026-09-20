import { getDatabasePool } from "@/lib/runtime/database";

export class WorkerInstanceAlreadyRunningError extends Error {
  constructor(readonly instanceId: string) {
    super(`Worker instance is already running: ${instanceId}`);
    this.name = "WorkerInstanceAlreadyRunningError";
  }
}

export async function withWorkerInstanceLock<T>(
  instanceId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const client = await getDatabasePool().connect();
  let locked = false;

  try {
    const result = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked",
      [instanceId],
    );
    locked = result.rows[0]?.locked === true;
    if (!locked) throw new WorkerInstanceAlreadyRunningError(instanceId);
    return await operation();
  } finally {
    if (locked) {
      await client.query(
        "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
        [instanceId],
      );
    }
    client.release();
  }
}
