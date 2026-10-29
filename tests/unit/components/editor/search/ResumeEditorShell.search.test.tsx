import { App } from "antd";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { createRichTextFromPlainText } from "@/domain/resume/operations";
import { ResumeEditorShell } from "@/components/editor/ResumeEditorShell";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function fixture() {
  const document = createDefaultResumeDocument();
  document.sections = [
    {
      id: "section",
      visible: true,
      title: createRichTextFromPlainText("needle heading"),
      blocks: [
        {
          id: "body",
          type: "text",
          content: createRichTextFromPlainText("needle body needle"),
        },
      ],
    },
  ];
  return document;
}

it("finds and replaces across the resume and undoes the whole action once", async () => {
  render(
    <App>
      <ResumeEditorShell
        resumeId="find-replace-test"
        initialDocument={fixture()}
      />
    </App>,
  );
  fireEvent.click(screen.getByRole("button", { name: "查找与替换" }));
  const bar = within(screen.getByRole("region", { name: "查找与替换" }));
  fireEvent.change(bar.getByRole("textbox", { name: "查找" }), {
    target: { value: "needle" },
  });
  expect(bar.getByRole("status")).toHaveTextContent("1 / 3");
  fireEvent.click(bar.getByRole("button", { name: "下一个匹配" }));
  expect(bar.getByRole("status")).toHaveTextContent("2 / 3");
  fireEvent.click(bar.getByRole("button", { name: "展开或收起替换" }));
  fireEvent.change(bar.getByRole("textbox", { name: "替换为" }), {
    target: { value: "changed" },
  });
  fireEvent.click(bar.getByRole("button", { name: "全部替换" }));
  expect(
    screen.getByRole("button", { name: "changed body changed" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "撤销" }));
  expect(
    screen.getByRole("button", { name: "needle body needle" }),
  ).toBeInTheDocument();
  expect(bar.getByRole("status")).toHaveTextContent("2 / 3");
});

it("continues after inserted matches instead of replacing the same occurrence repeatedly", () => {
  render(
    <App>
      <ResumeEditorShell
        resumeId="find-replace-next"
        initialDocument={fixture()}
      />
    </App>,
  );
  fireEvent.click(screen.getByRole("button", { name: "查找与替换" }));
  const bar = within(screen.getByRole("region", { name: "查找与替换" }));
  fireEvent.change(bar.getByRole("textbox", { name: "查找" }), {
    target: { value: "needle" },
  });
  fireEvent.click(bar.getByRole("button", { name: "展开或收起替换" }));
  fireEvent.change(bar.getByRole("textbox", { name: "替换为" }), {
    target: { value: "needle needle" },
  });
  fireEvent.click(bar.getByRole("button", { name: "替换当前" }));
  expect(bar.getByRole("status")).toHaveTextContent("3 / 4");
  fireEvent.click(bar.getByRole("button", { name: "替换当前" }));
  expect(
    screen.getByRole("button", { name: "needle needle body needle" }),
  ).toBeInTheDocument();
});

it("scopes keyboard search to the editor and ignores IME confirmation", () => {
  render(
    <App>
      <input aria-label="Outside editor" />
      <ResumeEditorShell
        resumeId="find-replace-keys"
        initialDocument={fixture()}
      />
    </App>,
  );
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Outside editor" }), {
    key: "f",
    ctrlKey: true,
  });
  expect(
    screen.queryByRole("region", { name: "查找与替换" }),
  ).not.toBeInTheDocument();
  const heading = screen.getByRole("button", { name: "needle body needle" });
  fireEvent.keyDown(heading, { key: "f", ctrlKey: true, isComposing: true });
  expect(
    screen.queryByRole("region", { name: "查找与替换" }),
  ).not.toBeInTheDocument();
  heading.focus();
  fireEvent.keyDown(heading, { key: "f", ctrlKey: true });
  const query = screen.getByRole("textbox", { name: "查找" });
  expect(query).toHaveFocus();
  fireEvent.change(query, { target: { value: "needle" } });
  fireEvent.keyDown(query, { key: "F3" });
  expect(screen.getByRole("status", { name: "匹配结果" })).toHaveTextContent(
    "2 / 3",
  );
  fireEvent.keyDown(query, { key: "Escape" });
  expect(
    screen.queryByRole("region", { name: "查找与替换" }),
  ).not.toBeInTheDocument();
});

it("commits the active badge before searching and preserves that edit through replacement undo", () => {
  const document = fixture();
  document.sections[0]!.blocks.push({
    id: "badges",
    type: "badges",
    wrap: true,
    items: [{ id: "tag", text: "original" }],
  });
  render(
    <App>
      <ResumeEditorShell
        resumeId="find-replace-badge"
        initialDocument={document}
      />
    </App>,
  );
  fireEvent.click(screen.getByRole("button", { name: "编辑标签 original" }));
  const editor = screen.getByRole("textbox", { name: "标签文本" });
  fireEvent.input(editor, { target: { textContent: "needle badge" } });
  fireEvent.keyDown(editor, { key: "f", ctrlKey: true });
  const bar = within(screen.getByRole("region", { name: "查找与替换" }));
  fireEvent.change(bar.getByRole("textbox", { name: "查找" }), {
    target: { value: "needle" },
  });
  expect(bar.getByRole("status")).toHaveTextContent("1 / 4");
  fireEvent.click(bar.getByRole("button", { name: "展开或收起替换" }));
  fireEvent.change(bar.getByRole("textbox", { name: "替换为" }), {
    target: { value: "updated" },
  });
  fireEvent.click(bar.getByRole("button", { name: "全部替换" }));
  expect(screen.getByRole("textbox", { name: "标签文本" })).toHaveTextContent(
    "updated badge",
  );
  fireEvent.click(screen.getByRole("button", { name: "撤销" }));
  expect(screen.getByRole("textbox", { name: "标签文本" })).toHaveTextContent(
    "needle badge",
  );
});

it("retains the search query when switching to source and searches directive text only there", async () => {
  render(
    <App>
      <ResumeEditorShell
        resumeId="find-replace-mode"
        initialDocument={fixture()}
      />
    </App>,
  );
  fireEvent.click(screen.getByRole("button", { name: "查找与替换" }));
  const input = screen.getByRole("textbox", { name: "查找" });
  fireEvent.change(input, { target: { value: "anonresume:" } });
  expect(screen.getByRole("status", { name: "匹配结果" })).toHaveTextContent(
    "未找到匹配",
  );
  fireEvent.click(screen.getByRole("button", { name: "Markdown 编辑" }));
  await screen.findByRole("textbox", { name: "Markdown 源码" });
  expect(input).toHaveValue("anonresume:");
  expect(screen.getByRole("status", { name: "匹配结果" })).toHaveTextContent(
    "1 / 1",
  );
  fireEvent.click(screen.getByRole("button", { name: "大纲" }));
  expect(
    await screen.findByRole("button", { name: "needle body needle" }),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("status", { name: "匹配结果" })).toHaveTextContent(
      "未找到匹配",
    ),
  );
});
