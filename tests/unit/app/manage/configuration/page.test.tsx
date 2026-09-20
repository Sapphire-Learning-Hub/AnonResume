import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  getConfiguration: vi.fn(),
  managerProps: vi.fn(),
  requireAdminPage: vi.fn(),
}));

vi.mock("@/lib/admin/page", () => ({
  requireAdminPage: mocks.requireAdminPage,
}));

vi.mock("@/lib/config/admin/service", () => ({
  getManagedConfiguration: mocks.getConfiguration,
}));

vi.mock("@/components/admin/config/AdminConfigurationManager", () => ({
  AdminConfigurationManager: (props: Record<string, unknown>) => {
    mocks.managerProps(props);
    const state = props.initialState as { fields: Array<{ group: string }> };
    return <div>{state.fields.map((field) => field.group).join(",")}</div>;
  },
}));

vi.mock("@/i18n/server", () => ({
  getRequestLocale: () => Promise.resolve("zh-CN"),
}));

import ManagementConfigurationPage from "@/app/app/(workbench)/manage/configuration/page";

const state = {
  activeRevision: { id: "active-1", version: 1 },
  draftRevision: {
    baseVersion: 1,
    id: "draft-1",
    updatedAt: "2026-09-20T00:00:00.000Z",
  },
  fields: [
    {
      applyMode: "restart",
      changed: false,
      configured: false,
      consumers: ["web"],
      group: "email",
      key: "smtpHost",
      public: false,
      sensitive: false,
      value: "",
    },
    {
      applyMode: "hot",
      changed: false,
      configured: true,
      consumers: ["ai-worker"],
      group: "ai",
      key: "aiEnabled",
      public: false,
      sensitive: false,
      value: false,
    },
  ],
  pendingRestartConsumers: [],
};

describe("ManagementConfigurationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfiguration.mockResolvedValue(state);
  });

  it("requires read access and passes grouped state with explicit capabilities", async () => {
    mocks.requireAdminPage.mockResolvedValue({
      kind: "delegated_admin",
      permissions: [
        "configuration.read",
        "configuration.edit",
        "configuration.history",
      ],
    });

    render(await ManagementConfigurationPage());

    expect(mocks.requireAdminPage).toHaveBeenCalledWith("configuration.read", {
      allowRecoveryRequired: true,
    });
    expect(mocks.getConfiguration).toHaveBeenCalledOnce();
    expect(screen.getByText("email,ai")).toBeInTheDocument();
    expect(mocks.managerProps).toHaveBeenCalledWith(expect.objectContaining({
      canEdit: true,
      canPublish: false,
      canReadHistory: true,
      canRollback: false,
      initialState: state,
    }));
  });

  it("keeps editing controls disabled for read-only administrators", async () => {
    mocks.requireAdminPage.mockResolvedValue({
      kind: "delegated_admin",
      permissions: ["configuration.read"],
    });

    render(await ManagementConfigurationPage());

    expect(mocks.managerProps).toHaveBeenCalledWith(expect.objectContaining({
      canEdit: false,
      canPublish: false,
      canReadHistory: false,
      canRollback: false,
    }));
  });
});
