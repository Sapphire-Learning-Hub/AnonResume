import {
  createDiagnosticContext,
  getDiagnosticContext,
  runWithDiagnosticContext,
  taskDiagnosticContext,
} from "@/lib/observability/diagnostics/context";
import { diagnosticContextSchema } from "@/lib/observability/diagnostics/schema";
import { serializeSafeError } from "@/lib/observability/logging";

it("shares operation context across independently loaded server entry modules", async () => {
  const first = await import("@/lib/observability/diagnostics/context");
  vi.resetModules();
  const second = await import("@/lib/observability/diagnostics/context");
  const diagnostic = first.createDiagnosticContext();
  await first.runWithDiagnosticContext(diagnostic,async () => {
    await Promise.resolve();
    expect(second.getStoredDiagnosticContext()).toEqual(diagnostic);
  });
  expect(second.getStoredDiagnosticContext()).toBeUndefined();
});

it("isolates concurrent operations and safely restores legacy tasks", async () => {
  const first = createDiagnosticContext();
  const second = createDiagnosticContext();
  await Promise.all(
    [first, second].map((context) =>
      runWithDiagnosticContext(context, async () => {
        await Promise.resolve();
        expect(getDiagnosticContext()).toEqual(context);
      }),
    ),
  );
  expect(getDiagnosticContext()).toBeUndefined();
  expect(
    taskDiagnosticContext(first.diagnosticId, { password: "secret" })
      .diagnosticId,
  ).toBe(first.diagnosticId);
  expect(
    diagnosticContextSchema.safeParse({ ...first, userId: "forged" }).success,
  ).toBe(false);
});

it("keeps safe database causes and code positions without arbitrary error content", () => {
  const cause = Object.assign(
    new Error("private-password SELECT personal-data"),
    { code: "23505" },
  );
  cause.stack =
    "Error: private-password\n at private-password (/Users/person/app/src/lib/resume/save.ts:12:4)\n at https://evil.test/private-password:1:2";
  const error = new Error("private-password", { cause });
  error.name = "private-password";
  error.stack =
    "Error: private-password\n at private-password (/app/src/lib/http/route.ts:3:2)\n at private-password (/app/.next/server/chunks/ssr/[root-of-the-server]__abc.js:10:20)";
  cause.cause = error;
  const safe = serializeSafeError(error);
  expect(safe.causes?.[0]?.code).toBe("23505");
  expect(JSON.stringify(safe)).not.toMatch(
    /private-password|personal-data|Users\/person|evil\.test|SELECT/,
  );
  expect(safe.stackTrace).toContain("src/lib/http/route.ts:3:2");
  expect(safe.stackTrace).toContain(".next/server/chunks/ssr/[root-of-the-server]__abc.js:10:20");
  expect(safe.causes!.length).toBeLessThanOrEqual(4);
});
