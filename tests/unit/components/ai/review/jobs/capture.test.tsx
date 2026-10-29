import { App, ConfigProvider } from "antd";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { AiReviewForm } from "@/components/ai/review/AiReviewForm";
import type { AiModelOption } from "@/lib/ai/client";
import { saveJobOpportunity } from "@/lib/job-search/client";
vi.mock("@/lib/job-search/client", async (original) => ({
  ...(await original<typeof import("@/lib/job-search/client")>()),
  fetchJobOpportunities: vi.fn(async () => ({
    items: [],
    total: 0,
    nextCursor: null,
  })),
  fetchJobCandidates: vi.fn(async () => ({
    items: [],
    total: 0,
    nextCursor: null,
  })),
  saveJobOpportunity: vi.fn(),
}));
const models: AiModelOption[] = [
  {
    id: crypto.randomUUID(),
    displayName: "Test model",
    providerModelKey: "model",
    supportsToolCalls: true,
    supportsStreaming: true,
    maxOutputTokens: 4096,
    keySource: "platform",
    providerName: "Test",
  },
];
beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  vi.mocked(saveJobOpportunity).mockReset();
});
afterEach(() => vi.unstubAllGlobals());
it("asks before saving a new JD, permits review-only, and keeps the original inputs when cancelled", async () => {
  const start = vi.fn();
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <App>
        <AiReviewForm models={models} busy={false} onStart={start} />
      </App>
    </ConfigProvider>,
  );
  fireEvent.change(screen.getByLabelText("目标岗位（选填）"), {
    target: { value: "Engineer" },
  });
  fireEvent.change(screen.getByLabelText("职位描述（选填）"), {
    target: { value: "A JD" },
  });
  fireEvent.click(screen.getByRole("button", { name: "发起审查" }));
  const dialog = await screen.findByRole("dialog");
  expect(start).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: /取\s*消/ }));
  expect(screen.getByLabelText("职位描述（选填）")).toHaveValue("A JD");
  fireEvent.click(screen.getByRole("button", { name: "发起审查" }));
  fireEvent.click(await screen.findByRole("button", { name: "仅审查" }));
  expect(start).toHaveBeenCalledWith(
    expect.objectContaining({ jobDescription: "A JD" }),
  );
  expect(saveJobOpportunity).not.toHaveBeenCalled();
});
it("keeps a saved opportunity linked when review admission is retried instead of saving it twice", async () => {
  const start = vi.fn();
  const id = crypto.randomUUID();
  vi.mocked(saveJobOpportunity).mockResolvedValue({
    opportunity: {
      id,
      title: "Engineer",
      company: "Example",
      description: "A JD",
      url: "",
      source: "",
      notes: "",
      archived: false,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      applicationCount: 1,
    },
    applicationId: crypto.randomUUID(),
  });
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <App>
        <AiReviewForm models={models} busy={false} onStart={start} />
      </App>
    </ConfigProvider>,
  );
  fireEvent.change(screen.getByLabelText("目标岗位（选填）"), {
    target: { value: "Engineer" },
  });
  fireEvent.change(screen.getByLabelText("职位描述（选填）"), {
    target: { value: "A JD" },
  });
  fireEvent.click(screen.getByRole("button", { name: "发起审查" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(
    within(dialog).getByRole("button", { name: "保存并继续审查" }),
  );
  await waitFor(() => expect(start).toHaveBeenCalledOnce());
  expect(start).toHaveBeenCalledWith(
    expect.objectContaining({
      jobContext: expect.objectContaining({ opportunityId: id }),
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "发起审查" }));
  expect(start).toHaveBeenCalledTimes(2);
  expect(saveJobOpportunity).toHaveBeenCalledOnce();
});
