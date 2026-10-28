"use client";
import { z } from "zod";
import {
  attachErrorDiagnostic,
  DIAGNOSTIC_HEADER,
  readResponseDiagnostic,
} from "@/lib/observability/diagnostics/schema";

export const imageSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  bytes: z.number().nonnegative(),
  createdAt: z.string(),
});
export type ImageSummary = z.infer<typeof imageSummarySchema>;
const librarySchema = z.object({
  items: z.array(imageSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().positive(),
  usedBytes: z.number().nonnegative(),
  quotaBytes: z.number().positive(),
  uploadLimitBytes: z.number().positive(),
  uploadEnabled: z.boolean(),
});
export type ImageLibraryResult = z.infer<typeof librarySchema>;
export class ImageRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
async function result(response: Response) {
  const body: unknown = await response.json();
  if (!response.ok) {
    const parsed = z.object({ error: z.string() }).safeParse(body);
    throw attachErrorDiagnostic(
      new ImageRequestError(parsed.success ? parsed.data.error : "unknown"),
      readResponseDiagnostic(response),
    );
  }
  return body;
}
export async function fetchImageLibrary(
  query: string,
  page: number,
  signal?: AbortSignal,
) {
  return librarySchema.parse(
    await result(
      await fetch(
        `/api/resume-assets?${new URLSearchParams({ q: query, page: String(page) })}`,
        { signal, cache: "no-store" },
      ),
    ),
  );
}
export async function mutateImage(id: string, name?: string) {
  return result(
    await fetch(`/api/resume-assets/${id}`, {
      method: name === undefined ? "DELETE" : "PATCH",
      headers: { "Content-Type": "application/json" },
      ...(name === undefined ? {} : { body: JSON.stringify({ name }) }),
    }),
  );
}
export function uploadImageRequest(
  file: File,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<ImageSummary> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const finish = () => signal.removeEventListener("abort", abort);
    xhr.open("POST", "/api/resume-assets");
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );
    xhr.setRequestHeader(
      "X-Image-Name",
      encodeURIComponent(
        file.name.slice(0, 100).replace(/[\uD800-\uDBFF]$/, ""),
      ),
    );
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      finish();
      try {
        const value: unknown = JSON.parse(xhr.responseText);
        if (xhr.status < 200 || xhr.status >= 300) {
          const parsed = z.object({ error: z.string() }).safeParse(value);
          reject(
            attachErrorDiagnostic(
              new ImageRequestError(
                parsed.success ? parsed.data.error : "unknown",
              ),
              xhr.getResponseHeader(DIAGNOSTIC_HEADER) ?? undefined,
            ),
          );
        } else resolve(imageSummarySchema.parse(value));
      } catch {
        reject(new ImageRequestError("unknown"));
      }
    };
    xhr.onerror = () => {
      finish();
      reject(new ImageRequestError("unknown"));
    };
    xhr.onabort = () => {
      finish();
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      finish();
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    xhr.send(file);
  });
}
