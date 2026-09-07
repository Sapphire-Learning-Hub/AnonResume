import { fireEvent, render, screen } from "@testing-library/react";

import { EditorStatusBar } from "@/components/editor/EditorStatusBar";

describe("EditorStatusBar", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation(() => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        matches: false,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps pagination and zoom controls in a dedicated status bar", () => {
    const onPageChange = vi.fn();
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    const onResetZoom = vi.fn();

    render(
      <EditorStatusBar
        canZoomIn
        canZoomOut
        currentPage={2}
        pageCount={4}
        statusBarLabel="状态栏"
        zoomInLabel="放大"
        zoomLabel="125%"
        zoomOutLabel="缩小"
        zoomResetLabel="重置缩放"
        onPageChange={onPageChange}
        onResetZoom={onResetZoom}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
      />,
    );

    const statusBar = screen.getByRole("region", { name: "状态栏" });
    expect(statusBar).toHaveTextContent("共 4 页");
    expect(statusBar).toHaveTextContent("125%");
    expect(screen.getByLabelText("页面导航")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "缩小" }));
    fireEvent.click(screen.getByRole("button", { name: "重置缩放" }));
    fireEvent.click(screen.getByRole("button", { name: "放大" }));

    expect(onZoomOut).toHaveBeenCalledOnce();
    expect(onResetZoom).toHaveBeenCalledOnce();
    expect(onZoomIn).toHaveBeenCalledOnce();
  });

  it("disables zoom limits and hides redundant page navigation", () => {
    render(
      <EditorStatusBar
        canZoomIn={false}
        canZoomOut={false}
        currentPage={1}
        pageCount={1}
        statusBarLabel="状态栏"
        zoomInLabel="放大"
        zoomLabel="100%"
        zoomOutLabel="缩小"
        zoomResetLabel="重置缩放"
        onPageChange={() => undefined}
        onResetZoom={() => undefined}
        onZoomIn={() => undefined}
        onZoomOut={() => undefined}
      />,
    );

    expect(screen.queryByLabelText("页面导航")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "缩小" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "放大" })).toBeDisabled();
  });
});
