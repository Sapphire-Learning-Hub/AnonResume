import { fireEvent, render, screen } from "@testing-library/react";
import { DiagnosticsManager } from "@/components/admin/diagnostics/DiagnosticsManager";

describe("diagnostic query recovery", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", () => ({ matches:false, addListener:()=>undefined, removeListener:()=>undefined, addEventListener:()=>undefined, removeEventListener:()=>undefined, dispatchEvent:()=>false }));
    const original = window.getComputedStyle.bind(window);
    vi.spyOn(window,"getComputedStyle").mockImplementation((element) => original(element));
  });
  afterEach(() => vi.unstubAllGlobals());
  it("keeps the search controls available on failure and retries the same filter", async () => {
    let failing = true;
    vi.stubGlobal("fetch", vi.fn(async () => failing ? new Response(null, { status: 503 }) : Response.json({ items: [], nextCursor: null, enabled: true, retentionDays: 7, localHealth: { degraded: false, dropped: 0, pending: 0 } })));
    render(<DiagnosticsManager locale="en-US" />);
    await screen.findByRole("button", { name: "Retry" });
    expect(screen.getByPlaceholderText("Diagnostic, request or task ID")).toBeEnabled();
    failing = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("No matching fault records");
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
});
