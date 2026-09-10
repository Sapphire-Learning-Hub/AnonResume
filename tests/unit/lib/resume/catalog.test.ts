import { describe, expect, it } from "vitest";

import { createLocalResumeRecord, createResumeId } from "@/lib/resume/catalog";

describe("resume catalog identifiers", () => {
  it("creates distinct ids for resumes generated in the same second", () => {
    const now = new Date("2026-08-30T08:15:00.000Z");
    const ids = Array.from({ length: 100 }, () => createResumeId(now));

    expect(new Set(ids)).toHaveLength(100);
    expect(ids).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^resume-20260830-081500-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        ),
      ]),
    );
  });

  it("keeps the generated resume title free of its technical identifier", () => {
    const resume = createLocalResumeRecord(
      "user-demo",
      "resume-20260830-081500-00000000-0000-4000-8000-000000000000",
    );

    expect(resume.title).toBe("20260830 081500");
  });
});
