import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

import {
  createGeneratedResumeRecord,
  publishResumeRecord,
  resetResumeRepository,
} from "@/lib/resume-repository";

import PublicResumePrintPage from "@/app/resume/[slug]/print/page";

describe("PublicResumePrintPage", () => {
  beforeEach(async () => {
    await resetResumeRepository();
    await createGeneratedResumeRecord({
      userId: "user-demo",
      templateId: "foundation",
      createId: () => "resume-foundation",
    });
    await publishResumeRecord("user-demo", "resume-foundation");
  });

  afterEach(async () => {
    await resetResumeRepository();
  });

  it("renders a published resume in print mode without exposing the internal id", async () => {
    const published = await publishResumeRecord("user-demo", "resume-foundation");
    const page = await PublicResumePrintPage({
      params: Promise.resolve({ slug: published.slug! }),
    });

    render(page);

    expect(screen.getByText("打印简历")).toBeInTheDocument();
    expect(screen.getByText("基础版简历")).toBeInTheDocument();
    expect(screen.getByText("个人简介")).toBeInTheDocument();
    expect(screen.queryByText("resume-foundation")).not.toBeInTheDocument();
  });
});
