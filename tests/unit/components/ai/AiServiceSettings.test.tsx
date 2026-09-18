import { fireEvent, render, screen } from "@testing-library/react";

import { AiServiceSettings } from "@/components/ai/AiServiceSettings";
import {
  AiModelEditorModal,
  AiProviderEditorModal,
} from "@/components/ai/AiServiceSettingsDialogs";

const clientMock = vi.hoisted(() => ({
  createModel: vi.fn(),
  createProvider: vi.fn(),
  deleteModel: vi.fn(),
  deleteProvider: vi.fn(),
  fetch: vi.fn(),
  test: vi.fn(),
  updateModel: vi.fn(),
  updateProvider: vi.fn(),
}));

vi.mock("@/lib/ai/settings-client", () => ({
  createPersonalAiModel: clientMock.createModel,
  createPersonalAiProvider: clientMock.createProvider,
  deletePersonalAiModel: clientMock.deleteModel,
  deletePersonalAiProvider: clientMock.deleteProvider,
  fetchAiSettings: clientMock.fetch,
  testPersonalAiModel: clientMock.test,
  updatePersonalAiModel: clientMock.updateModel,
  updatePersonalAiProvider: clientMock.updateProvider,
}));

vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({
    toast: { error: vi.fn(), success: vi.fn() },
  }),
}));

describe("AiServiceSettings", () => {
  beforeAll(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    });
  });

  beforeEach(() => {
    clientMock.fetch.mockResolvedValue({
      platformEnabled: true,
      byokEnabled: true,
      defaultMonthlyPoints: 100_000,
      quota: {
        monthlyLimit: 100_000,
        usedPoints: 8_000,
        reservedPoints: 0,
        availablePoints: 92_000,
        periodStartedAt: "2026-09-01T00:00:00.000Z",
        periodEndsAt: "2026-10-01T00:00:00.000Z",
      },
      providers: [
        {
          id: "149e70e4-7ee1-4dac-b167-16e760de9dc0",
          providerName: "Provider One",
          baseUrl: "https://one.example.com/v1",
          maskedApiKey: "••••-one",
          allowCrossOriginRedirects: false,
          enabled: true,
          models: [
            {
              id: "78ff2bc8-234f-487c-925c-963881bbca32",
              providerId: "149e70e4-7ee1-4dac-b167-16e760de9dc0",
              modelKey: "model-one",
              modelName: "Model One",
              enabled: true,
              supportsStreaming: true,
              supportsToolCalls: true,
              contextWindow: 128_000,
              maxOutputTokens: 4_096,
            },
            {
              id: "65dd9f6e-bbcb-4cdf-997f-731b09bc98d1",
              providerId: "149e70e4-7ee1-4dac-b167-16e760de9dc0",
              modelKey: "model-two",
              modelName: "Model Two",
              enabled: false,
              supportsStreaming: true,
              supportsToolCalls: false,
              contextWindow: 64_000,
              maxOutputTokens: 2_048,
            },
          ],
        },
        {
          id: "9cbe3430-dafe-4028-a307-0771fe777052",
          providerName: "Provider Two",
          baseUrl: "https://two.example.com/v1",
          maskedApiKey: "••••-two",
          allowCrossOriginRedirects: false,
          enabled: true,
          models: [],
        },
      ],
    });
  });

  it("shows every personal provider and its models", async () => {
    render(<AiServiceSettings />);

    expect(await screen.findByText("Provider One")).toBeInTheDocument();
    expect(screen.getByText("Provider Two")).toBeInTheDocument();
    expect(screen.getByText("Model One")).toBeInTheDocument();
    expect(screen.getByText("Model Two")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /添加模型服务/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /添加模型$/ })).toHaveLength(2);
    expect(screen.getByText("仅限聊天")).toBeInTheDocument();
  });

  it("shows a tooltip when a personal model cannot call tools", async () => {
    render(
      <AiModelEditorModal
        busy={false}
        model={{
          id: "65dd9f6e-bbcb-4cdf-997f-731b09bc98d1",
          providerId: "149e70e4-7ee1-4dac-b167-16e760de9dc0",
          modelKey: "model-two",
          modelName: "Model Two",
          enabled: false,
          supportsStreaming: true,
          supportsToolCalls: false,
          contextWindow: 64_000,
          maxOutputTokens: 2_048,
        }}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        open
      />,
    );

    const warning = screen.getByLabelText(
      "该模型不能用于修改简历，仅支持基本聊天功能。",
    );
    fireEvent.mouseEnter(warning);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "该模型不能用于修改简历，仅支持基本聊天功能。",
    );
  });

  it("warns only after cross-origin redirects are enabled", async () => {
    render(
      <AiProviderEditorModal
        busy={false}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        open
      />,
    );

    expect(
      screen.queryByLabelText(/跨域重定向可能会将 API 密钥/),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "允许跨域重定向" }));
    const warning = screen.getByLabelText(/跨域重定向可能会将 API 密钥/);
    fireEvent.mouseEnter(warning);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "跨域重定向可能会将 API 密钥和简历内容发送到其他域名，仅应为完全信任的服务开启。",
    );
  });
});
