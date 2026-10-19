import { fireEvent, render, screen } from "@testing-library/react";

import { AdminPagedSelect } from "@/components/admin/AdminPagedSelect";

describe("AdminPagedSelect", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("loads server-filtered options and exposes numbered pages in the popup", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        matches: false,
        removeEventListener: vi.fn(),
      }),
    });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const page=Number(new URL(String(input),"https://example.com").searchParams.get("page"));
      return Response.json({
        items:[{id:`role-${page}`,label:page===1 ? "Support" : "Auditor"}],
        page,pageSize:10,total:11,totalPages:2,
      });
    });

    render(
      <AdminPagedSelect
        endpoint="/api/manage/roles"
        onChange={() => undefined}
        placeholder="选择角色"
      />,
    );
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "选择角色" }));

    await screen.findByText("Support");
    fireEvent.click(await screen.findByTitle("2"));
    await screen.findByText("Auditor");
  });

  it("supports selecting multiple roles without losing initial labels", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        matches: false,
        removeEventListener: vi.fn(),
      }),
    });
    const onChange = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        items: [{ id: "role-2", label: "Auditor" }],
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
      })),
    ));

    render(
      <AdminPagedSelect
        endpoint="/api/manage/roles"
        initialOptions={[{ id: "role-1", label: "Support" }]}
        mode="multiple"
        onChange={onChange}
        placeholder="选择角色"
        value={["role-1"]}
      />,
    );

    expect(screen.getByText("Support")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "选择角色" }));
    fireEvent.click(await screen.findByText("Auditor"));
    expect(onChange).toHaveBeenCalledWith(["role-1", "role-2"]);
  });
});
