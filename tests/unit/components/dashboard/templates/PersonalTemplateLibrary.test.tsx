import { act, fireEvent, render, screen } from "@testing-library/react";
import { PersonalTemplateLibrary } from "@/components/dashboard/templates/PersonalTemplateLibrary";
import { fetchPersonalTemplatePage } from "@/lib/resume/templates/client";
import type { TemplatePage } from "@/lib/resume/templates/types";
vi.mock("@/lib/resume/templates/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/resume/templates/client")>()),
  fetchPersonalTemplatePage: vi.fn(),
}));
vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({
    toast: { error: vi.fn(), success: vi.fn() },
    notification: { error: vi.fn() },
  }),
}));
it("does not allow an older search response to replace newer results", async () => {
  let resolveOld!: (value: TemplatePage) => void;
  vi.mocked(fetchPersonalTemplatePage).mockImplementation((query) =>
    query === "old"
      ? new Promise((resolve) => {
          resolveOld = resolve;
        })
      : Promise.resolve({ items: [], nextCursor: null }),
  );
  const view = render(<PersonalTemplateLibrary query="old" />);
  view.rerender(<PersonalTemplateLibrary query="new" />);
  await screen.findByText("没有找到匹配的模板");
  await act(async () =>
    resolveOld({
      items: [
        {
          id: "old",
          name: "OLD-PRIVATE",
          version: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      nextCursor: null,
    }),
  );
  expect(screen.queryByText("OLD-PRIVATE")).not.toBeInTheDocument();
});
it("keeps failed loading local and supports retry", async () => {
  vi.mocked(fetchPersonalTemplatePage)
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ items: [], nextCursor: null });
  render(<PersonalTemplateLibrary query="" />);
  fireEvent.click(await screen.findByRole("button", { name: /重\s*试/ }));
  expect(await screen.findByText("还没有个人模板")).toBeInTheDocument();
});
