import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PersonalTemplatePreview } from "@/components/dashboard/templates/PersonalTemplatePreview";
import { fetchPersonalTemplate } from "@/lib/resume/templates/client";
import { createResumeDocumentFromTemplate } from "@/domain/resume/templates";

vi.mock("@/lib/resume/templates/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/resume/templates/client")>()),
  fetchPersonalTemplate: vi.fn(),
}));
vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({
    toast: { error: vi.fn(), success: vi.fn() },
    notification: { error: vi.fn() },
  }),
}));
it("uses the version actually previewed when a template changed since the list was loaded", async () => {
  const summary = {
    id: "t",
    version: 1,
    name: "Old name",
    createdAt: 1,
    updatedAt: 1,
  };
  const current = {
    ...summary,
    version: 2,
    name: "Updated template",
    document: createResumeDocumentFromTemplate("blank", "en-US"),
  };
  vi.mocked(fetchPersonalTemplate).mockResolvedValue(current);
  const use = vi.fn();
  render(
    <PersonalTemplatePreview
      template={summary}
      onClose={vi.fn()}
      onUse={use}
      busy={false}
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /使\s*用/ })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: /使\s*用/ }));
  expect(use).toHaveBeenCalledWith(current);
});
