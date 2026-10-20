import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { ResumeTrashShell } from "@/components/dashboard/trash/ResumeTrashShell";
import type { ResumeTrashEntry } from "@/lib/resume/trash/types";
import type { PageResult } from "@/lib/shared/pagination";

const feedback = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({
    toast: { success: feedback.success },
    notification: { error: feedback.error, destroy: vi.fn() },
  }),
}));
const entry: ResumeTrashEntry = {
  id: "example",
  title: "可恢复的简历",
  version: 2,
  deletedAt: Date.now(),
  purgeAfter: Date.now() + 86_400_000,
  recoverable: true,
};
const page = (items: ResumeTrashEntry[]): PageResult<ResumeTrashEntry> => ({
  items,
  page: 1,
  pageSize: 20,
  total: items.length,
  totalPages: items.length ? 1 : 0,
});

describe("resume trash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => false,
      })),
    });
  });

  it("requires explicit confirmation before permanent deletion and refreshes after success", async () => {
    const purge = vi.fn(async () => {});
    render(
      <ResumeTrashShell
        initialPage={page([entry])}
        loadPage={async () => page([])}
        purgeResume={purge}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "彻底删除" }));
    const dialog = await screen.findByRole("dialog");
    expect(purge).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "彻底删除" }));
    await waitFor(() => expect(purge).toHaveBeenCalledWith(entry.id));
    await waitFor(() =>
      expect(screen.queryByText(entry.title)).not.toBeInTheDocument(),
    );
  });

  it("restores a resume and keeps failed data loading local and retryable", async () => {
    const restore = vi.fn(async () => {});
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(page([entry]))
      .mockResolvedValue(page([]));
    render(<ResumeTrashShell loadPage={load} restoreResume={restore} />);
    fireEvent.click(await screen.findByRole("button", { name: /重\s*试/ }));
    expect(
      screen.getByRole("heading", { name: "简历回收站" }),
    ).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /恢\s*复/ }));
    await waitFor(() => expect(restore).toHaveBeenCalledWith(entry.id));
    await waitFor(() =>
      expect(screen.queryByText(entry.title)).not.toBeInTheDocument(),
    );
  });

  it("does not offer restoration for expired entries", () => {
    render(
      <ResumeTrashShell
        initialPage={page([{ ...entry, recoverable: false }])}
      />,
    );
    expect(screen.getByRole("button", { name: /恢\s*复/ })).toBeDisabled();
  });
});
