import { describe, expect, it } from "vitest";

import { createPdfContentDisposition } from "@/lib/download-filename";

describe("PDF download filenames", () => {
  it("keeps an ASCII filename compatible with existing download clients", () => {
    expect(createPdfContentDisposition("resume-foundation")).toBe(
      'attachment; filename="resume-foundation.pdf"',
    );
  });

  it("preserves a Chinese title through RFC 5987 filename encoding", () => {
    expect(createPdfContentDisposition("前端工程师简历")).toBe(
      "attachment; filename=\"resume.pdf\"; filename*=UTF-8''%E5%89%8D%E7%AB%AF%E5%B7%A5%E7%A8%8B%E5%B8%88%E7%AE%80%E5%8E%86.pdf",
    );
  });

  it("removes filename control characters and path separators", () => {
    expect(createPdfContentDisposition("简历/2026\r\n"))
      .toContain("filename*=UTF-8''%E7%AE%80%E5%8E%862026.pdf");
  });
});
