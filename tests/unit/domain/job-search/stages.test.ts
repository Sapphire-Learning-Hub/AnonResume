import {
  jobFieldsSchema,
  createApplicationSchema,
} from "@/domain/job-search/schema";
import { resolveStageChange } from "@/domain/job-search/stages";
const now = new Date("2026-10-29T10:00:00Z");

it("requires an actual application time for submitted stages and supports backdated applications", () => {
  expect(() =>
    resolveStageChange({
      from: "pending",
      to: "interviewing",
      appliedAt: null,
      now,
    }),
  ).toThrow("application_date_required");
  expect(
    resolveStageChange({
      from: "pending",
      to: "applied",
      appliedAt: null,
      nextAppliedAt: "2026-10-20T08:00:00Z",
      now,
    }),
  ).toEqual({ appliedAt: "2026-10-20T08:00:00.000Z" });
  expect(() =>
    resolveStageChange({
      from: "pending",
      to: "applied",
      appliedAt: null,
      nextAppliedAt: "2026-11-01T08:00:00Z",
      now,
    }),
  ).toThrow("invalid_application_date");
});
it("preserves submission time across non-linear progress and explicitly confirms clearing it", () => {
  const appliedAt = "2026-10-20T08:00:00.000Z";
  expect(
    resolveStageChange({
      from: "rejected",
      to: "interviewing",
      appliedAt,
      now,
    }),
  ).toEqual({ appliedAt });
  expect(() =>
    resolveStageChange({ from: "applied", to: "pending", appliedAt, now }),
  ).toThrow("application_reset_confirmation_required");
  expect(
    resolveStageChange({
      from: "applied",
      to: "pending",
      appliedAt,
      confirmReset: true,
      now,
    }),
  ).toEqual({ appliedAt: null });
  expect(
    resolveStageChange({
      from: "pending",
      to: "withdrawn",
      appliedAt: null,
      now,
    }),
  ).toEqual({ appliedAt: null });
});
it("accepts reusable plain job data while rejecting unsafe links, overlong JD and fabricated client state", () => {
  expect(
    jobFieldsSchema.parse({
      title: " Engineer ",
      description: " line1\n\nline2 ",
    }),
  ).toMatchObject({
    title: "Engineer",
    description: "line1\n\nline2",
    company: "",
  });
  expect(
    jobFieldsSchema.safeParse({ title: "Engineer", url: "javascript:alert(1)" })
      .success,
  ).toBe(false);
  expect(
    jobFieldsSchema.safeParse({
      title: "Engineer",
      description: "x".repeat(16001),
    }).success,
  ).toBe(false);
  expect(
    createApplicationSchema.safeParse({
      operationId: crypto.randomUUID(),
      opportunityId: crypto.randomUUID(),
      userId: "someone",
      stage: "offered",
    }).success,
  ).toBe(false);
});
