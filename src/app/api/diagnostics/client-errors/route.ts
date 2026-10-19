import { handleClientErrors } from "@/lib/observability/browser/receiver";

export const runtime = "nodejs";
export const POST = (request: Request) => handleClientErrors(request);
