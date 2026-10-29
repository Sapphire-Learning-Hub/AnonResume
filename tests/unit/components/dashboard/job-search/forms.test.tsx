import { fetchJobCandidates } from "@/lib/job-search/client";
import { App } from "antd";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { OpportunityForm } from "@/components/dashboard/job-search/forms/OpportunityForm";
import { StageChangeDialog } from "@/components/dashboard/job-search/forms/StageChangeDialog";
import type { JobApplication, JobFields } from "@/domain/job-search/schema";
vi.mock("@/lib/job-search/client", () => ({
  fetchJobCandidates: vi.fn(async () => ({
    items: [],
    total: 0,
    nextCursor: null,
  })),
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
it("creates a job with a separately selectable initial pending application and keeps text when saving fails", async () => {
  const onSave = vi
    .fn<
      (
        fields: JobFields,
        pending: boolean,
        operation: string,
      ) => Promise<boolean>
    >()
    .mockResolvedValue(false);
  render(
    <App>
      <OpportunityForm onSave={onSave} onCancel={() => undefined} />
    </App>,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "职位名称" }), {
    target: { value: "Engineer" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "岗位 JD" }), {
    target: { value: "Private description" },
  });
  fireEvent.click(
    screen.getByRole("checkbox", { name: "同时建立第一条待投递记录" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
  expect(onSave.mock.calls[0]?.[0]).toMatchObject({
    title: "Engineer",
    description: "Private description",
  });
  expect(onSave.mock.calls[0]?.[1]).toBe(false);
  expect(screen.getByRole("textbox", { name: "岗位 JD" })).toHaveValue(
    "Private description",
  );
});
it("asks for the actual submission time and confirms resetting a previously submitted record", async () => {
  const application: JobApplication = {
    id: crypto.randomUUID(),
    opportunityId: crypto.randomUUID(),
    snapshot: {
      title: "Engineer",
      company: "Example",
      description: "JD",
      url: "",
      source: "",
    },
    resumeId: null,
    resumeName: null,
    resumeAvailable: false,
    stage: "applied",
    channel: "",
    appliedAt: "2026-10-01T10:00:00.000Z",
    notes: "",
    version: 2,
    archived: false,
    closedAt: null,
    rejectedFromStage: null,
    activityAt: "2026-10-01T10:00:00.000Z",
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
  };
  const onSave = vi.fn(async () => true);
  render(
    <App>
      <StageChangeDialog
        application={application}
        target="pending"
        open
        onSave={onSave}
        onCancel={() => undefined}
      />
    </App>,
  );
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox", { name: /确认更正为待投递/ }));
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "pending", confirmReset: true }),
    ),
  );
});

it("requires an explicit duplicate choice even when the form is submitted from the keyboard", async () => {
  const candidate = {
    id: crypto.randomUUID(),
    title: "Existing",
    company: "",
    description: "Same JD",
    url: "",
    source: "",
    notes: "",
    archived: false,
    version: 1,
    applicationCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  vi.mocked(fetchJobCandidates).mockResolvedValueOnce({
    items: [candidate],
    total: 1,
    nextCursor: null,
  });
  const save = vi.fn(async () => true);
  render(
    <App>
      <OpportunityForm
        onSave={save}
        onCancel={() => undefined}
        onUseExisting={() => undefined}
      />
    </App>,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "职位名称" }), {
    target: { value: "Engineer" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "岗位 JD" }), {
    target: { value: "Same JD" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await screen.findByRole("region", { name: "已有相同 JD 的岗位资料" });
  await act(async () => {
    fireEvent.submit(
      screen.getByRole("textbox", { name: "职位名称" }).closest("form")!,
    );
  });
  expect(save).not.toHaveBeenCalled();
});
