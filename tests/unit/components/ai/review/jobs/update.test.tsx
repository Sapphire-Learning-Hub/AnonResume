import { App, ConfigProvider } from "antd";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReviewJobCapture } from "@/components/ai/review/jobs/ReviewJobCapture";
import {
  editJobOpportunity,
  saveJobOpportunity,
} from "@/lib/job-search/client";
import type { Opportunity } from "@/domain/job-search/schema";
vi.mock("@/lib/job-search/client", async (original) => ({
  ...(await original<typeof import("@/lib/job-search/client")>()),
  editJobOpportunity: vi.fn(),
  saveJobOpportunity: vi.fn(),
}));
beforeEach(() =>
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
);
afterEach(() => vi.unstubAllGlobals());
it("updates an existing opportunity using all edited form fields without creating another application", async () => {
  const job: Opportunity = {
    id: crypto.randomUUID(),
    title: "Engineer",
    company: "Original company",
    description: "Original JD",
    url: "",
    source: "",
    notes: "",
    archived: false,
    version: 2,
    applicationCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  vi.mocked(editJobOpportunity).mockResolvedValue({
    ...job,
    title: "Senior engineer",
    company: "Corrected company",
    description: "New JD",
    version: 3,
  });
  const saved = vi.fn();
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <App>
        <ReviewJobCapture
          selected={job}
          initial={{ ...job, title: "Senior engineer", description: "New JD" }}
          onCancel={() => undefined}
          onSaved={saved}
          onOnlyReview={() => undefined}
        />
      </App>
    </ConfigProvider>,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "公司名称" }), {
    target: { value: "Corrected company" },
  });
  fireEvent.click(screen.getByRole("button", { name: "更新原岗位并审查" }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(editJobOpportunity).toHaveBeenCalledWith(
    job.id,
    expect.objectContaining({
      title: "Senior engineer",
      description: "New JD",
      company: "Corrected company",
      version: 2,
    }),
  );
  expect(saveJobOpportunity).not.toHaveBeenCalled();
});
