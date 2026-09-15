import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigProvider } from "antd";

import { appTheme } from "@/styles/app-theme";
import { FontMarket } from "@/components/fonts/FontMarket";
import { fetchResumeEntriesPage } from "@/lib/resume/client";

const resumes = [
  {
    id: "resume-foundation",
    title: "基础版简历",
    summary: "前端工程师简历",
    updatedAt: Date.UTC(2026, 7, 31, 8, 0, 0),
    version: 1,
    published: false,
  },
];

vi.mock("@/lib/resume/client", () => ({
  fetchResumeEntriesPage: vi.fn(),
}));

function renderFontMarket() {
  return render(
    <ConfigProvider theme={appTheme}>
      <FontMarket />
    </ConfigProvider>,
  );
}

function installEditorViewport(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("FontMarket", () => {
  beforeEach(() => {
    vi.mocked(fetchResumeEntriesPage).mockResolvedValue({
      items: resumes,
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, "fonts");
  });

  it("reveals a preview only after its near-viewport font finishes loading", async () => {
    let observerCallback: IntersectionObserverCallback | undefined;
    let finishFontLoad: (() => void) | undefined;
    const observe = vi.fn();
    const unobserve = vi.fn();
    const load = vi.fn(
      () =>
        new Promise<FontFace[]>((resolve) => {
          finishFontLoad = () => resolve([]);
        }),
    );

    class MockIntersectionObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = "";
      readonly thresholds = [];
      readonly disconnect = vi.fn();
      readonly observe = observe;
      readonly takeRecords = vi.fn(() => []);
      readonly unobserve = unobserve;

      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }
    }

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { load },
    });

    renderFontMarket();

    const ibmPreview = screen.getByTestId("font-preview-ibm-plex-sans");
    const wenKaiPreview = screen.getByTestId("font-preview-lxgw-wenkai");
    expect(ibmPreview).not.toHaveStyle({
      fontFamily:
        "var(--font-ibm-plex-sans), var(--font-noto-sans-sc), sans-serif",
    });
    expect(wenKaiPreview).not.toHaveStyle({
      fontFamily: "var(--font-lxgw-wenkai), var(--font-noto-serif-sc), serif",
    });
    expect(ibmPreview).toHaveAttribute("data-font-ready", "false");
    expect(
      screen.getByTestId("font-preview-loading-ibm-plex-sans"),
    ).toHaveTextContent("正在加载字体");

    act(() => {
      observerCallback?.(
        [
          {
            isIntersecting: true,
            target: ibmPreview,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });

    await waitFor(() => {
      expect(load).toHaveBeenCalledWith(
        expect.stringContaining("IBM Plex Sans Variable"),
        expect.any(String),
      );
    });
    expect(ibmPreview).toHaveStyle({
      fontFamily:
        "var(--font-ibm-plex-sans), var(--font-noto-sans-sc), sans-serif",
    });
    expect(ibmPreview).toHaveAttribute("data-font-ready", "false");
    expect(wenKaiPreview).not.toHaveStyle({
      fontFamily: "var(--font-lxgw-wenkai), var(--font-noto-serif-sc), serif",
    });
    expect(unobserve).toHaveBeenCalledWith(ibmPreview);

    await act(async () => {
      finishFontLoad?.();
      await Promise.resolve();
    });

    expect(ibmPreview).toHaveAttribute("data-font-ready", "true");
    expect(
      screen.queryByTestId("font-preview-loading-ibm-plex-sans"),
    ).not.toBeInTheDocument();
    expect(wenKaiPreview).toHaveAttribute("data-font-ready", "false");
  });

  it("filters bundled fonts and renders editable preview text with the real font", async () => {
    renderFontMarket();

    expect(screen.getByRole("heading", { name: "字体市场" })).toBeInTheDocument();
    expect(
      screen.queryByText(
        "集中预览可商用的开源字体，并将合适的字体直接应用到你的简历。",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getAllByTestId("font-market-card")).toHaveLength(13);
    const fontList = screen.getByTestId("font-market-list");
    expect(getComputedStyle(fontList).overflowY).toBe("auto");
    expect(getComputedStyle(fontList).gridAutoRows).toBe("max-content");
    expect(fontList).not.toContainElement(
      screen.getByRole("searchbox", { name: "搜索字体" }),
    );
    expect(screen.getByRole("textbox", { name: "预览文字" })).toHaveAttribute(
      "rows",
      "1",
    );
    const categoryControl = screen.getByRole("radiogroup", {
      name: "字体市场",
    });
    expect(categoryControl).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索字体" }), {
      target: { value: "中文宋体" },
    });

    await waitFor(() => {
      expect(screen.getAllByTestId("font-market-card")).toHaveLength(1);
    });
    expect(screen.getByRole("heading", { name: "Noto Serif SC" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "预览文字" }), {
      target: { value: "字体决定信息的语气" },
    });

    const preview = screen.getByTestId("font-preview-noto-serif-sc");
    expect(preview).toHaveTextContent("字体决定信息的语气");
    expect(preview).toHaveStyle({
      fontFamily: "var(--font-noto-serif-sc), var(--font-noto-sans-sc), serif",
    });
  });

  it("opens an apply dialog that posts the selected preset to the selected resume", async () => {
    installEditorViewport(true);
    renderFontMarket();

    const card = screen
      .getByRole("heading", { name: "LXGW WenKai" })
      .closest("article");
    expect(card).not.toBeNull();
    fireEvent.click(within(card!).getByRole("button", { name: "应用到简历" }));

    const dialog = await screen.findByRole("dialog", { name: "应用 LXGW WenKai" });
    const form = within(dialog).getByTestId("apply-font-form");

    expect(form).toHaveAttribute(
      "action",
      "/app/resumes/resume-foundation/font",
    );
    expect(within(form).getByDisplayValue("lxgw-wenkai")).toHaveAttribute(
      "name",
      "fontPresetId",
    );
    await waitFor(() => {
      expect(
        within(form).getByDisplayValue("/app/resumes/resume-foundation"),
      ).toHaveAttribute("name", "returnTo");
    });
    expect(within(form).getByRole("button", { name: "确认应用" })).toHaveAttribute(
      "type",
      "submit",
    );
  });

  it("returns mobile font applications to the font market", async () => {
    installEditorViewport(false);
    renderFontMarket();

    const card = screen
      .getByRole("heading", { name: "LXGW WenKai" })
      .closest("article");

    fireEvent.click(within(card!).getByRole("button", { name: "应用到简历" }));

    const form = within(
      await screen.findByRole("dialog", { name: "应用 LXGW WenKai" }),
    ).getByTestId("apply-font-form");

    await waitFor(() => {
      expect(within(form).getByDisplayValue("/app/fonts")).toHaveAttribute(
        "name",
        "returnTo",
      );
    });
  });

  it("loads target resumes page by page inside the apply dialog", async () => {
    vi.mocked(fetchResumeEntriesPage).mockResolvedValueOnce({
      items: resumes,
      page: 1,
      pageSize: 10,
      total: 21,
      totalPages: 3,
    });
    renderFontMarket();
    const card = screen
      .getByRole("heading", { name: "LXGW WenKai" })
      .closest("article");

    fireEvent.click(within(card!).getByRole("button", { name: "应用到简历" }));
    const dialog = await screen.findByRole("dialog", { name: "应用 LXGW WenKai" });
    fireEvent.click(within(dialog).getByTitle("2"));

    await waitFor(() => {
      expect(fetchResumeEntriesPage).toHaveBeenLastCalledWith({
        page: 2,
        pageSize: 10,
        query: "",
      });
    });
  });

  it("searches target resumes from the resume selector", async () => {
    renderFontMarket();
    const card = screen
      .getByRole("heading", { name: "LXGW WenKai" })
      .closest("article");

    fireEvent.click(within(card!).getByRole("button", { name: "应用到简历" }));
    const dialog = await screen.findByRole("dialog", { name: "应用 LXGW WenKai" });
    const selector = within(dialog).getByRole("combobox", { name: "目标简历" });

    expect(
      within(dialog).queryByRole("searchbox", { name: "搜索简历" }),
    ).not.toBeInTheDocument();

    fireEvent.change(selector, { target: { value: "前端" } });

    await waitFor(() => {
      expect(fetchResumeEntriesPage).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 10,
        query: "前端",
      });
    });
  });

  it("keeps the resume selector available when a search has no matches", async () => {
    vi.mocked(fetchResumeEntriesPage)
      .mockResolvedValueOnce({
        items: resumes,
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
      })
      .mockResolvedValueOnce({
        items: [],
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0,
      });
    renderFontMarket();
    const card = screen
      .getByRole("heading", { name: "LXGW WenKai" })
      .closest("article");

    fireEvent.click(within(card!).getByRole("button", { name: "应用到简历" }));
    const dialog = await screen.findByRole("dialog", { name: "应用 LXGW WenKai" });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "目标简历" }), {
      target: { value: "不存在的简历" },
    });

    await waitFor(() => {
      expect(
        within(dialog).getByRole("combobox", { name: "目标简历" }),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole("button", { name: "确认应用" }),
      ).toBeDisabled();
    });
  });
});
