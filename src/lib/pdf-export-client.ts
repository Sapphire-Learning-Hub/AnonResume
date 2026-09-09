export type PdfExportClientStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface PdfExportClientTask {
  id: string;
  accessToken: string;
  status: PdfExportClientStatus;
  position: number | null;
  queuedCount: number;
  cancelRequested: boolean;
  filename?: string;
  error?: string | null;
  errorCode?: string;
  errorLimit?: number;
  pollAfterMs?: number;
  workerAvailable?: boolean;
  downloaded: boolean;
}

const EMPTY_TASKS: PdfExportClientTask[] = [];
const STORAGE_KEY = "anonresume-pdf-export-tasks";
let tasks = EMPTY_TASKS;
let hydrated = false;
let localErrorId = 0;
const listeners = new Set<() => void>();

class PdfExportRequestError extends Error {
  code: string;
  limit?: number;

  constructor(code: string, limit?: number) {
    super(code);
    this.name = "PdfExportRequestError";
    this.code = code;
    this.limit = limit;
  }
}

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function setTasks(nextTasks: PdfExportClientTask[]) {
  tasks = nextTasks;

  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }

  emit();
}

function hydrateTasks() {
  if (hydrated || typeof window === "undefined") {
    return;
  }

  hydrated = true;

  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);

    if (stored) {
      tasks = JSON.parse(stored) as PdfExportClientTask[];
    }
  } catch {
    window.sessionStorage.removeItem(STORAGE_KEY);
  }
}

function updateTask(
  id: string,
  update: Partial<PdfExportClientTask>,
) {
  setTasks(tasks.map((task) => (task.id === id ? { ...task, ...update } : task)));
}

async function parseJson(response: Response) {
  const payload = await response.json();

  if (!response.ok) {
    throw new PdfExportRequestError(
      typeof payload.error === "string" ? payload.error : "pdf_export_failed",
      typeof payload.limit === "number" ? payload.limit : undefined,
    );
  }

  return payload;
}

async function startPdfExport(endpoint: string) {
  try {
    const response = await fetch(endpoint, { method: "POST" });
    const payload = await parseJson(response);
    const job = payload.job as {
      id: string;
      accessToken: string;
      status: PdfExportClientStatus;
    };

    setTasks([
      ...tasks.filter((task) => task.id !== job.id),
      {
        ...job,
        position: null,
        queuedCount: 0,
        cancelRequested: false,
        downloaded: false,
      },
    ]);

    return job;
  } catch (error) {
    const requestError =
      error instanceof PdfExportRequestError
        ? error
        : new PdfExportRequestError("pdf_export_failed");

    localErrorId += 1;
    setTasks([
      ...tasks,
      {
        id: `local-error-${Date.now()}-${localErrorId}`,
        accessToken: "",
        status: "failed",
        position: null,
        queuedCount: 0,
        cancelRequested: false,
        errorCode: requestError.code,
        errorLimit: requestError.limit,
        downloaded: false,
      },
    ]);

    return undefined;
  }
}

export function startResumePdfExport(resumeId: string) {
  return startPdfExport(`/api/resumes/${encodeURIComponent(resumeId)}/pdf`);
}

export function startPublicResumePdfExport(slug: string) {
  return startPdfExport(`/resume/${encodeURIComponent(slug)}/pdf`);
}

function getJobUrl(task: PdfExportClientTask, suffix = "") {
  return `/api/pdf-exports/${encodeURIComponent(task.id)}${suffix}`;
}

function getAuthorizedRequestInit(
  task: PdfExportClientTask,
  init: RequestInit = {},
): RequestInit {
  const headers = new Headers(init.headers);

  headers.set("authorization", `Bearer ${task.accessToken}`);

  return { ...init, headers: Object.fromEntries(headers.entries()) };
}

async function triggerDownload(task: PdfExportClientTask) {
  const response = await fetch(
    getJobUrl(task, "/download"),
    getAuthorizedRequestInit(task, { cache: "no-store" }),
  );

  if (!response.ok) {
    await parseJson(response);
    return;
  }

  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = task.filename || "resume.pdf";

  try {
    link.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function refreshPdfExportTask(task: PdfExportClientTask) {
  if (["completed", "failed", "cancelled"].includes(task.status)) {
    return;
  }

  const response = await fetch(
    getJobUrl(task),
    getAuthorizedRequestInit(task, { cache: "no-store" }),
  );
  const payload = await parseJson(response);
  const next = payload.job as Omit<
    PdfExportClientTask,
    "accessToken" | "downloaded"
  >;

  updateTask(task.id, next);

  if (next.status === "completed" && !task.downloaded) {
    await triggerDownload({ ...task, ...next });
    updateTask(task.id, { downloaded: true });
  }
}

export async function cancelPdfExportTask(task: PdfExportClientTask) {
  const response = await fetch(
    getJobUrl(task),
    getAuthorizedRequestInit(task, { method: "DELETE" }),
  );
  const payload = await parseJson(response);

  updateTask(task.id, payload.job);
}

export function dismissPdfExportTask(id: string) {
  setTasks(tasks.filter((task) => task.id !== id));
}

export function dismissTerminalPdfExportTasks() {
  setTasks(
    tasks.filter((task) => ["queued", "running"].includes(task.status)),
  );
}

export function subscribePdfExportTasks(listener: () => void) {
  listeners.add(listener);
  hydrateTasks();
  listener();

  return () => listeners.delete(listener);
}

export function getPdfExportTasksSnapshot() {
  return tasks;
}

export function getPdfExportTasksServerSnapshot() {
  return EMPTY_TASKS;
}
