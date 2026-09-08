import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AdminActivationError,
  startAdminActivation,
} from "@/lib/admin-activation";

const bodySchema = z.object({
  token: z.string().min(32).max(256),
  password: z.string().min(12).max(128),
  deviceName: z.string().trim().min(1).max(60),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const enrollment = await startAdminActivation(parsed.data);
    if (enrollment.completed) {
      return NextResponse.json({ completed: true });
    }
    return NextResponse.json({
      completed: false,
      deviceId: enrollment.deviceId,
      uri: enrollment.uri,
      secret: enrollment.secret,
    });
  } catch (error) {
    const status = error instanceof AdminActivationError ? 400 : 500;
    return NextResponse.json(
      { error: status === 400 ? "activation_invalid" : "internal_error" },
      { status },
    );
  }
}
