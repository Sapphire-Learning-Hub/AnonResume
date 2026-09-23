import { NextResponse } from "next/server";
import { z } from "zod";

import {
  acceptUserInvitation,
  InvalidUserInvitationError,
} from "@/lib/invitations/acceptance";

const bodySchema = z.object({
  token: z.string().min(1).max(512),
  name: z.string().trim().min(1).max(80),
  password: z.string().min(12).max(128),
}).strict();

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    const accepted = await acceptUserInvitation(parsed.data);
    return NextResponse.json({ email: accepted.email }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidUserInvitationError) {
      return NextResponse.json(
        { error: "INVALID_INVITATION" },
        { status: 410 },
      );
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
