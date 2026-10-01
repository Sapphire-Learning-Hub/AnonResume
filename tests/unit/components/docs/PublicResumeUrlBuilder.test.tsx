import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfigProvider } from "antd";
import type { ComponentType } from "react";

import { PublicResumeUrlBuilder } from "@/components/docs/PublicResumeUrlBuilder";
import { fetchResumeEntriesPage } from "@/lib/resume/client";
import { appTheme } from "@/styles/app-theme";

const feedback = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@/lib/resume/client", () => ({
  fetchResumeEntriesPage: vi.fn(),
}));

vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({
    toast: feedback,
  }),
}));

const TestablePublicResumeUrlBuilder = PublicResumeUrlBuilder as ComponentType<{
  viewerMode: "product" | "signed-out" | "super-admin";
}>;

function renderBuilder(
  viewerMode: "product" | "signed-out" | "super-admin" = "product",
) {
  return render(
    <ConfigProvider theme={appTheme}>
      <TestablePublicResumeUrlBuilder viewerMode={viewerMode} />
    </ConfigProvider>,
  );
}

describe("PublicResumeUrlBuilder", () => {
  beforeEach(() => {
    feedback.error.mockReset();
    feedback.success.mockReset();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prompts signed-out readers to sign in without hiding the guide", async () => {
    renderBuilder("signed-out");

    expect(
      screen.getByRole("link", { name: "登录后选择简历" }),
    ).toHaveAttribute("href", "/sign-in");
    expect(fetchResumeEntriesPage).not.toHaveBeenCalled();
    expect(feedback.error).not.toHaveBeenCalled();
  });

  it("directs the management-only super administrator away from resume tools", () => {
    renderBuilder("super-admin");

    expect(
      screen.getByText("当前管理员账号不提供简历功能。"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "进入管理后台" }),
    ).toHaveAttribute("href", "/app/manage");
    expect(fetchResumeEntriesPage).not.toHaveBeenCalled();
  });

  it("builds a URL from an owned published resume and copies it", async () => {
    vi.mocked(fetchResumeEntriesPage).mockResolvedValue({
      items: [
        {
          id: "resume-one",
          title: "前端工程师简历",
          summary: "公开简历",
          version: 2,
          updatedAt: 1,
          published: true,
          slug: "frontend-engineer",
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderBuilder();

    const output = await screen.findByRole("textbox", {
      name: "分享链接",
    });
    expect(output).toHaveValue(
      "http://localhost:3000/resume/frontend-engineer",
    );
    expect(fetchResumeEntriesPage).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      publication: "published",
      query: "",
    });

    fireEvent.click(screen.getByRole("button", { name: "复制链接" }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "http://localhost:3000/resume/frontend-engineer",
      );
    });
    expect(feedback.success).toHaveBeenCalledWith("链接已复制");
  });

  it("searches published resumes from the selector without a separate action", async () => {
    vi.mocked(fetchResumeEntriesPage).mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });

    renderBuilder();

    const selector = await screen.findByRole("combobox", {
      name: "已发布简历",
    });
    fireEvent.mouseDown(selector);
    fireEvent.change(
      screen.getByRole("combobox", { name: "已发布简历" }),
      { target: { value: "产品" } },
    );

    await waitFor(() => {
      expect(fetchResumeEntriesPage).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 20,
        publication: "published",
        query: "产品",
      });
    });
    expect(
      screen.queryByRole("button", { name: /搜\s*索/ }),
    ).not.toBeInTheDocument();
  });

  it("loads the next page when the resume selector reaches the end", async () => {
    vi.mocked(fetchResumeEntriesPage)
      .mockResolvedValueOnce({
        items: [
          {
            id: "resume-one",
            title: "前端工程师简历",
            summary: "公开简历",
            version: 2,
            updatedAt: 1,
            published: true,
            slug: "frontend-engineer",
          },
        ],
        page: 1,
        pageSize: 20,
        total: 21,
        totalPages: 2,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "resume-two",
            title: "产品经理简历",
            summary: "第二页公开简历",
            version: 1,
            updatedAt: 2,
            published: true,
            slug: "product-manager",
          },
        ],
        page: 2,
        pageSize: 20,
        total: 21,
        totalPages: 2,
      });

    renderBuilder();

    const selector = await screen.findByRole("combobox", {
      name: "已发布简历",
    });
    fireEvent.mouseDown(selector);
    await screen.findByRole("listbox");
    const popupList = document.querySelector(
      ".ant-select-dropdown-list-holder",
    );
    expect(popupList).not.toBeNull();
    fireEvent.scroll(popupList!);

    await waitFor(() => {
      expect(fetchResumeEntriesPage).toHaveBeenLastCalledWith({
        page: 2,
        pageSize: 20,
        publication: "published",
        query: "",
      });
    });
    expect(await screen.findByText("产品经理简历")).toBeInTheDocument();
  });
});
