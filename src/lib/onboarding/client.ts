import type {
  EditorOnboardingRun,
  EditorOnboardingTransitionAction,
} from "./types";

export class EditorOnboardingClientError extends Error {
  constructor() {
    super("editor_onboarding_request_failed");
    this.name = "EditorOnboardingClientError";
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new EditorOnboardingClientError();
  return response.json() as Promise<T>;
}

export async function restartEditorOnboardingClient() {
  const response = await fetch("/api/onboarding/editor-basics/restart", {
    method: "POST",
  });
  return readJson<{ editorHref: string; run: EditorOnboardingRun }>(response);
}

export async function updateEditorOnboardingRunClient(
  runId: string,
  action: EditorOnboardingTransitionAction,
) {
  const response = await fetch(
    `/api/onboarding/editor-basics/runs/${encodeURIComponent(runId)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action),
    },
  );
  return (await readJson<{ run: EditorOnboardingRun }>(response)).run;
}
