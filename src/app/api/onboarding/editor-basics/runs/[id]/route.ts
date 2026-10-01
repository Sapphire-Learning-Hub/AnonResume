import { NextResponse } from "next/server";
import { z } from "zod";

import { editorOnboardingStepIds } from "@/domain/onboarding/editor-basics";
import { getOptionalSession } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/http/request-origin";
import {
  EditorOnboardingTransitionError,
  transitionEditorOnboarding,
} from "@/lib/onboarding/service";

const stepActionSchema = z.object({
  type: z.enum(["complete-step", "skip-step"]),
  stepId: z.enum(editorOnboardingStepIds),
});

const transitionActionSchema = z.union([
  stepActionSchema,
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("dismiss") }),
  z.object({ type: z.literal("complete") }),
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const forbiddenResponse = requireSameOrigin(request);
  if (forbiddenResponse) return forbiddenResponse;

  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = transitionActionSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { id } = await params;
  try {
    const run = await transitionEditorOnboarding({
      userId: session.user.id,
      runId: id,
      action: parsed.data,
    });
    return NextResponse.json({ run });
  } catch (error) {
    if (error instanceof EditorOnboardingTransitionError) {
      return NextResponse.json(
        { error: "transition_rejected" },
        { status: 409 },
      );
    }
    throw error;
  }
}
