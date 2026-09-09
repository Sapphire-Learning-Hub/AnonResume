import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { AdminPagedSelect } from "@/components/admin/AdminPagedSelect";

describe("AdminPagedSelect", () => {
  it("loads server-filtered options and exposes numbered pages in the popup", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        matches: false,
        removeEventListener: vi.fn(),
      }),
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [{ id: "role-1", label: "Support" }],
          page: 1,
          pageSize: 10,
          total: 11,
          totalPages: 2,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdminPagedSelect
        endpoint="/api/manage/roles"
        onChange={() => undefined}
        placeholder="选择角色"
      />,
    );
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "选择角色" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/manage/roles?page=1&pageSize=10",
      );
    });
    fireEvent.click(await screen.findByTitle("2"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/manage/roles?page=2&pageSize=10",
      );
    });
    vi.unstubAllGlobals();
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
    vi.unstubAllGlobals();
  });
});
