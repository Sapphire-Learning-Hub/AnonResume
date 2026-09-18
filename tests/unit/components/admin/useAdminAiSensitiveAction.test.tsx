import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/components/admin/AdminOtpInput", () => ({
  AdminOtpInput: ({ onChange }: { onChange: (value: string) => void }) => (
    <button onClick={() => onChange("123456")} type="button">
      填写验证码
    </button>
  ),
}));
vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({
    toast: { error: vi.fn() },
  }),
}));

import { useAdminAiSensitiveAction } from "@/components/admin/ai/useAdminAiSensitiveAction";

function SensitiveActionHarness({
  onComplete,
  request,
}: {
  onComplete: () => void;
  request: () => Promise<Response>;
}) {
  const { reauthModal, runSensitive } = useAdminAiSensitiveAction();

  async function execute() {
    const response = await runSensitive(request);
    if (response) onComplete();
  }

  return (
    <>
      <button onClick={() => void execute()} type="button">执行敏感操作</button>
      {reauthModal}
    </>
  );
}

describe("useAdminAiSensitiveAction", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("resumes the original caller after reauthentication and request replay", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 428 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const onComplete = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    render(<SensitiveActionHarness onComplete={onComplete} request={request} />);

    fireEvent.click(screen.getByRole("button", { name: "执行敏感操作" }));
    await screen.findByRole("dialog", { name: "再次验证管理身份" });
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "填写验证码" }));
    fireEvent.click(screen.getByRole("button", { name: "验证并继续" }));

    await waitFor(() => {
      expect(request).toHaveBeenCalledTimes(2);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });
});
