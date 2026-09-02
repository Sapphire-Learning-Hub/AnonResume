import { getDatabasePool } from "@/lib/database";
import { runPdfExportWorker } from "@/lib/pdf-export-worker";

const controller = new AbortController();
const stop = () => controller.abort();

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

try {
  await runPdfExportWorker({ signal: controller.signal });
} finally {
  await getDatabasePool().end();
}
