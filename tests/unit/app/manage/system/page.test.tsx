import { render } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  controlProps: vi.fn(),
  getCurrent: vi.fn(),
  getStatus: vi.fn(),
  listWorkers: vi.fn(),
  requireAdminPage: vi.fn(),
}));

vi.mock("@/lib/admin/page", () => ({
  requireAdminPage: mocks.requireAdminPage,
}));
vi.mock("@/lib/admin/query", () => ({
  getAdminSystemStatus: mocks.getStatus,
  listAdminWorkers: mocks.listWorkers,
}));
vi.mock("@/lib/admin/system-restart/service", () => ({
  getCurrentSystemRestartOperation: mocks.getCurrent,
}));
vi.mock("@/lib/runtime/instance-identity", () => ({
  resolveRuntimeIdentity: () => ({ deploymentId: "production" }),
}));
vi.mock("@/components/system/SystemRestartControl", () => ({
  SystemRestartControl: (props: Record<string, unknown>) => {
    mocks.controlProps(props);
    return null;
  },
}));
vi.mock("@/i18n/server", () => ({
  getRequestLocale: () => Promise.resolve("zh-CN"),
}));

import ManagementSystemPage from "@/app/app/(workbench)/manage/system/page";

describe("ManagementSystemPage restart capability", () => {
  it("restores current progress and passes delegated restart permission", async () => {
    const operation = { id: "operation-1", status: "running", targets: [] };
    const configurationInstances = [{
      consumer: "web" as const,
      desiredVersion: 3,
      errorCode: null,
      fallbackVersion: null,
      instanceId: "production/web/web-1",
      lastSeenAt: new Date("2026-10-13T08:00:00.000Z"),
      loadedHotVersion: 3,
      loadedRestartVersion: 2,
      onlineRestartSupported: true,
      release: "test",
      state: "pending_restart" as const,
      supervisorKind: "docker-compose" as const,
    }];
    mocks.requireAdminPage.mockResolvedValue({
      kind: "delegated_admin",
      permissions: ["system.read", "system.restart"],
    });
    mocks.getStatus.mockResolvedValue({
      configurationInstances,
      configurationValid: true,
      desiredConfiguration: null,
      queue: { maxConcurrency: 1 },
      release: "test",
      smtpConfigured: true,
    });
    mocks.listWorkers.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    mocks.getCurrent.mockResolvedValue(operation);

    render(
      await ManagementSystemPage({ searchParams: Promise.resolve({}) }),
    );

    expect(mocks.requireAdminPage).toHaveBeenCalledWith("system.read");
    expect(mocks.getCurrent).toHaveBeenCalledWith({ deploymentId: "production" });
    expect(mocks.controlProps).toHaveBeenCalledWith({
      canRestart: true,
      initialOperation: operation,
      runtimes: configurationInstances,
    });
  });
});
