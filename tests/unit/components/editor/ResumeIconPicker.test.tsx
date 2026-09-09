import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigProvider } from "antd";

import { ResumeIconPicker } from "@/components/editor/ResumeIconPicker";
import { appTheme } from "@/styles/app-theme";

function renderPicker(onSelect = vi.fn()) {
  return {
    onSelect,
    ...render(
      <ConfigProvider theme={appTheme}>
        <ResumeIconPicker open onCancel={vi.fn()} onSelect={onSelect} />
      </ConfigProvider>,
    ),
  };
}

describe("ResumeIconPicker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders the icon catalog in viewport-sized batches", async () => {
    const observers: MockIntersectionObserver[] = [];
    let nextFrame: FrameRequestCallback | undefined;

    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      nextFrame = callback;
      return 1;
    });

    class MockIntersectionObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = "";
      readonly thresholds = [];
      readonly disconnect = vi.fn();
      readonly observe = vi.fn();
      readonly takeRecords = vi.fn(() => []);
      readonly unobserve = vi.fn();
      readonly callback: IntersectionObserverCallback;

      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
        observers.push(this);
      }
    }

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    renderPicker();
    const dialog = await screen.findByRole("dialog", { name: "图标库" });
    const grid = within(dialog).getByTestId("resume-icon-grid");

    expect(within(grid).getAllByRole("button")).toHaveLength(72);
    expect(within(dialog).getByText("共 454 枚图标")).toBeInTheDocument();

    const loadMore = within(grid).getByTestId("resume-icon-load-more");
    const gridObserver = observers.find((observer) =>
      observer.observe.mock.calls.some(([target]) => target === loadMore),
    );
    expect(gridObserver).toBeDefined();
    act(() => {
      gridObserver?.callback(
        [
          {
            isIntersecting: true,
            target: loadMore,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });

    expect(loadMore).toHaveAttribute("data-loading", "true");
    expect(within(grid).getAllByRole("button")).toHaveLength(72);

    act(() => {
      nextFrame?.(0);
    });

    expect(within(grid).getAllByRole("button")).toHaveLength(144);
  });

  it("searches the local catalog and inserts the chosen icon", async () => {
    const { onSelect } = renderPicker();
    const dialog = await screen.findByRole("dialog", { name: "图标库" });

    fireEvent.change(within(dialog).getByRole("searchbox", { name: "搜索图标" }), {
      target: { value: "邮箱" },
    });

    const insertButton = await within(dialog).findByRole("button", {
      name: "插入 邮箱",
    });

    expect(within(dialog).queryByRole("button", { name: "插入 电话" })).not.toBeInTheDocument();
    fireEvent.click(insertButton);

    expect(onSelect).toHaveBeenCalledWith("lucide:mail");
  });

  it("filters icons by category and exposes an empty result", async () => {
    renderPicker();
    const dialog = await screen.findByRole("dialog", { name: "图标库" });

    fireEvent.click(within(dialog).getByText("联系方式"));

    await waitFor(() => {
      expect(
        within(dialog).getByRole("button", { name: "插入 邮箱" }),
      ).toBeInTheDocument();
    });
    expect(
      within(dialog).queryByRole("button", { name: "插入 GitHub" }),
    ).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByRole("searchbox", { name: "搜索图标" }), {
      target: { value: "not-a-real-resume-icon" },
    });

    expect(await within(dialog).findByText("没有匹配的图标")).toBeInTheDocument();
  });
});
