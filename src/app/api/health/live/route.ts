import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    { status: "alive" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
