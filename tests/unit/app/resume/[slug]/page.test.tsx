import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import { getManagedConfigDefaults } from "@/lib/config/registry";
import { getRuntimeConfig } from "@/lib/config/runtime";
import {
  createGeneratedResumeRecord,
  publishResumeRecord,
  resetResumeRepository,
  saveResumeRecord,
} from "@/lib/resume/repository";

import PublicResumePage, { generateMetadata } from "@/app/resume/[slug]/page";

vi.mock("@/lib/config/runtime", () => ({
  getRuntimeConfig: vi.fn(),
}));

describe("PublicResumePage", () => {
  beforeEach(async () => {
    vi.mocked(getRuntimeConfig).mockResolvedValue({
      values: getManagedConfigDefaults(),
    } as never);
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

  it("renders a published resume without unavailable export actions", async () => {
    const published = await publishResumeRecord("user-demo", "resume-foundation");
    const page = await PublicResumePage({
      params: Promise.resolve({ slug: published.slug! }),
    });

    render(page);

    expect(
      screen.getByRole("heading", { level: 1, name: "居中叙事简历" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "下载 PDF" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("林知夏")).toBeInTheDocument();
    expect(
      screen.getByTestId("responsive-resume-viewport"),
    ).toBeInTheDocument();
    expect(screen.queryByText("resume-foundation")).not.toBeInTheDocument();
  });

  it("shows PDF export only when anonymous exports are enabled", async () => {
    vi.mocked(getRuntimeConfig).mockResolvedValue({
      values: {
        ...getManagedConfigDefaults(),
        pdfAllowAnonymous: true,
      },
    } as never);
    const published = await publishResumeRecord("user-demo", "resume-foundation");
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
    const page = await PublicResumePage({
      params: Promise.resolve({ slug: published.slug! }),
    });

    render(page);

    fireEvent.click(screen.getByRole("button", { name: "下载 PDF" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/resume/resume-foundation/pdf", {
        method: "POST",
      }),
    );
  });

  it("applies safe appearance parameters only to the public page shell", async () => {
    const published = await publishResumeRecord("user-demo", "resume-foundation");
    const page = await PublicResumePage({
      params: Promise.resolve({ slug: published.slug! }),
      searchParams: Promise.resolve({
        "view-theme": "dark",
        "view-surface": "plain",
        "view-header": "none",
        "view-labels": "hide",
        "view-frame": "border",
        "view-align": "left",
        "view-background": "112233",
        "view-accent": "abcdef",
        "view-padding": "32",
        "view-width": "1200",
        "view-gap": "12",
      }),
    });

    const { container } = render(page);
    const shell = container.querySelector(".resume-view-shell");

    expect(shell).toHaveAttribute("data-view-theme", "dark");
    expect(shell).toHaveAttribute("data-view-surface", "plain");
    expect(shell).toHaveAttribute("data-view-header", "none");
    expect(shell).toHaveAttribute("data-view-labels", "hide");
    expect(shell).toHaveAttribute("data-view-frame", "border");
    expect(shell).toHaveAttribute("data-view-align", "left");
    expect(shell).toHaveStyle({
      "--public-view-background": "#112233",
      "--public-view-accent": "#abcdef",
      "--public-view-padding": "32px",
      "--public-view-width": "1200px",
      "--public-view-gap": "12px",
    });
    expect(
      screen.queryByRole("heading", { level: 1, name: "居中叙事简历" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("林知夏")).toBeInTheDocument();
  });

  it("does not let appearance parameters enable anonymous PDF export", async () => {
    const published = await publishResumeRecord("user-demo", "resume-foundation");
    const page = await PublicResumePage({
      params: Promise.resolve({ slug: published.slug! }),
      searchParams: Promise.resolve({
        "view-header": "full",
        "view-download": "show",
      }),
    });

    render(page);

    expect(
      screen.queryByRole("button", { name: "下载 PDF" }),
    ).not.toBeInTheDocument();
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
