import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SavePersonalTemplateDialog } from "@/components/dashboard/templates/SavePersonalTemplateDialog";
import {
  savePersonalTemplateRequest,
  TemplateRequestError,
} from "@/lib/resume/templates/client";

const feedback = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  notification: vi.fn(),
}));
vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({
    toast: { error: feedback.error, success: feedback.success },
    notification: { error: feedback.notification },
  }),
}));
vi.mock("@/lib/resume/templates/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/resume/templates/client")>()),
  savePersonalTemplateRequest: vi.fn(),
}));
beforeEach(() => vi.clearAllMocks());

it("does not create a template when current editor content cannot be saved", async () => {
  render(
    <SavePersonalTemplateDialog
      open
      initialName="A"
      prepareSource={async () => null}
      onClose={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /确\s*认/ }));
  await waitFor(() => expect(feedback.error).toHaveBeenCalled());
  expect(savePersonalTemplateRequest).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

it("keeps one operation identity when retrying an uncertain save, then closes only after success", async () => {
  const close = vi.fn();
  vi.mocked(savePersonalTemplateRequest)
    .mockRejectedValueOnce(new TemplateRequestError("request_failed"))
    .mockResolvedValueOnce({ templateId: "t", version: 1 });
  render(
    <SavePersonalTemplateDialog
      open
      initialName="A"
      prepareSource={async () => ({ resumeId: "r", sourceVersion: 2 })}
      onClose={close}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /确\s*认/ }));
  await waitFor(() => expect(feedback.error).toHaveBeenCalled());
  expect(close).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /确\s*认/ })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: /确\s*认/ }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  const [first, second] = vi.mocked(savePersonalTemplateRequest).mock.calls;
  expect(first[0].operationId).toBe(second[0].operationId);
});
