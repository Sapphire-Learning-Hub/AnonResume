import { NextResponse } from "next/server";
import { z } from "zod";

import { accountErrorResponse } from "@/lib/auth/account/http";
import {
  listAccountSessions,
  revokeAccountSession,
  revokeOtherAccountSessions,
  updateCurrentAccountSessionDevice,
} from "@/lib/auth/account/security";
import { parseAccountSessionDevice } from "@/lib/auth/account/session-device";
import { getOptionalSession } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/http/request-origin";

const revokeSchema = z.object({
  sessionId: z.string().min(1).max(200),
});

const deviceMetadataFields = {
  platform: z.string().trim().min(1).max(40),
  platformVersion: z.string().trim().regex(/^\d+(?:\.\d+){0,3}$/).max(40),
  model: z.string().trim().max(120).transform((value) => value || null),
};
const deviceMetadataSchema = z.object(deviceMetadataFields);
const optionalDeviceMetadataSchema = z.object({
  platform: deviceMetadataFields.platform.optional(),
  platformVersion: deviceMetadataFields.platformVersion.optional(),
  model: deviceMetadataFields.model.optional(),
});

function readClientHint(request: Request, name: string) {
  const rawValue = request.headers.get(name)?.trim();
  if (!rawValue) return undefined;
  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(rawValue);
      return typeof parsed === "string" ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return rawValue;
}

export async function GET() {
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const sessions = await listAccountSessions({
      userId: session.user.id,
      currentSessionId: session.session.id,
    });
    return NextResponse.json({
      sessions: sessions.map(({
        userAgent,
        platform,
        platformVersion,
        deviceModel,
        ...storedSession
      }) => ({
        ...storedSession,
        device: parseAccountSessionDevice(userAgent, {
          platform,
          platformVersion,
          model: deviceModel,
        }),
      })),
    });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = optionalDeviceMetadataSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const parsed = deviceMetadataSchema.safeParse({
    platform: body.data.platform ?? readClientHint(
      request,
      "sec-ch-ua-platform",
    ),
    platformVersion: body.data.platformVersion ?? readClientHint(
      request,
      "sec-ch-ua-platform-version",
    ),
    model: body.data.model ?? readClientHint(request, "sec-ch-ua-model") ?? "",
  });
  if (!parsed.success) {
    const hasMetadata = body.data.platform || body.data.platformVersion ||
      readClientHint(request, "sec-ch-ua-platform") ||
      readClientHint(request, "sec-ch-ua-platform-version");
    if (!hasMetadata) return new NextResponse(null, { status: 204 });
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    await updateCurrentAccountSessionDevice({
      userId: session.user.id,
      sessionId: session.session.id,
      ...parsed.data,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = revokeSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    await revokeAccountSession({
      userId: session.user.id,
      currentSessionId: session.session.id,
      sessionId: parsed.data.sessionId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    await revokeOtherAccountSessions({
      userId: session.user.id,
      currentSessionToken: session.session.token,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return accountErrorResponse(error);
  }
}
