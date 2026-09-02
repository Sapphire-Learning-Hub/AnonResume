import { render } from "@testing-library/react";

import { createDefaultResumeDocument } from "@/domain/resume/default-document";

import { ResumePrintShell } from "@/components/resume/ResumePrintShell";

describe("ResumePrintShell", () => {
  it("marks the outer shell and content wrapper for print layout resets", () => {
    const { container } = render(
      <ResumePrintShell
        eyebrow="打印简历"
        title="Foundation Resume"
        document={createDefaultResumeDocument()}
      />,
    );

    expect(
      container.querySelector('[data-resume-print-shell="true"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-resume-print-content="true"]'),
    ).not.toBeNull();
  });
});
