import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import {
  createGeneratedResumeRecord,
  publishResumeRecord,
  resetResumeRepository,
  saveResumeRecord,
} from "@/lib/resume/repository";

import PublicResumePage, { generateMetadata } from "@/app/resume/[slug]/page";

describe("PublicResumePage", () => {
  beforeEach(async () => {
    await resetResumeRepository();
    await createGeneratedResumeRecord({
      userId: "user-demo",
      templateId: "centered",
      createId: () => "resume-foundation",
    });
    await publishResumeRecord("user-demo", "resume-foundation");
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await resetResumeRepository();
  });

  it("renders a published resume without exposing the internal id", async () => {
    const published = await publishResumeRecord("user-demo", "resume-foundation");
    const page = await PublicResumePage({
      params: Promise.resolve({ slug: published.slug! }),
    });

    render(page);

    expect(screen.getByText("公开简历")).toBeInTheDocument();
    expect(screen.getByText("居中叙事简历")).toBeInTheDocument();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            job: { id: "job-one", accessToken: "token-one", status: "queued" },
          }),
          { status: 202, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "下载 PDF" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/resume/resume-foundation/pdf", {
        method: "POST",
      }),
    );
    expect(screen.getByText("林知夏")).toBeInTheDocument();
    expect(
      screen.getByTestId("responsive-resume-viewport"),
    ).toBeInTheDocument();
    expect(screen.queryByText("resume-foundation")).not.toBeInTheDocument();
  });

  it("generates share metadata only from published resume data", async () => {
    await saveResumeRecord({
      userId: "user-demo",
      resumeId: "resume-foundation",
      version: 1,
      summary: "面向复杂业务的前端平台工程师",
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "resume-foundation" }),
    });

    expect(metadata).toMatchObject({
      title: "居中叙事简历",
      description: "面向复杂业务的前端平台工程师",
      alternates: {
        canonical: "/resume/resume-foundation",
      },
      openGraph: {
        type: "profile",
        url: "/resume/resume-foundation",
        locale: "zh_CN",
        images: [
          expect.objectContaining({
            url: "/opengraph-image",
            width: 1200,
            height: 630,
          }),
        ],
      },
      twitter: {
        card: "summary_large_image",
        images: [
          expect.objectContaining({
            url: "/opengraph-image",
          }),
        ],
      },
    });
  });

  it("marks an unknown public slug as non-indexable", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "missing-resume" }),
    });

    expect(metadata.robots).toEqual({
      index: false,
      follow: false,
    });
  });
});
