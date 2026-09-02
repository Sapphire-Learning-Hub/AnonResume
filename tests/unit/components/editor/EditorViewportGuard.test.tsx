import { render, screen, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";

import {
  EditorViewportGuard,
  useEditorViewportAccess,
} from "@/components/editor/EditorViewportGuard";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

function installMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function CapabilityProbe() {
  return <span>{useEditorViewportAccess()}</span>;
}

describe("EditorViewportGuard", () => {
  const replace = vi.fn();

  beforeEach(() => {
    replace.mockReset();
    vi.mocked(useRouter).mockReturnValue({ replace } as never);
  });

  it("redirects a narrow viewport without mounting editor content", async () => {
    installMatchMedia(false);

    render(
      <EditorViewportGuard>
        <div>desktop editor</div>
      </EditorViewportGuard>,
    );

    expect(screen.queryByText("desktop editor")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/app");
    });
    expect(screen.queryByText("desktop editor")).not.toBeInTheDocument();
  });

  it("mounts editor content when the viewport is wider than 960px", async () => {
    installMatchMedia(true);

    render(
      <EditorViewportGuard>
        <div>desktop editor</div>
      </EditorViewportGuard>,
    );

    expect(await screen.findByText("desktop editor")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("exposes the resolved capability to workbench controls", async () => {
    installMatchMedia(false);

    render(<CapabilityProbe />);

    expect(await screen.findByText("blocked")).toBeInTheDocument();
  });
});
