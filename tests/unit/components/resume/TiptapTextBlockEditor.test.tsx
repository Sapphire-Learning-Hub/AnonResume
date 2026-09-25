import { createRef } from "react";

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import type { RichTextContent } from "@/domain/resume/schema";

import {
  TiptapTextBlockEditor,
  type TiptapTextBlockEditorFormatState,
  type TiptapTextBlockEditorHandle,
} from "@/components/resume/TiptapTextBlockEditor";

const initialContent: RichTextContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Shared renderer baseline" }],
    },
  ],
};

class MockResizeObserver {
  observe() {}

  unobserve() {}

  disconnect() {}
}

describe("TiptapTextBlockEditor", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows inline formatting controls for a selected text range", async () => {
    const ref = createRef<TiptapTextBlockEditorHandle>();

    render(<TiptapTextBlockEditor ref={ref} content={initialContent} onChange={vi.fn()} />);

    await waitFor(() => expect(ref.current).not.toBeNull());

    act(() => {
      ref.current?.applyCommand({ type: "toggleBold" });
    });

    await waitFor(() =>
      expect(screen.getByRole("toolbar", { name: "文本快捷格式" })).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("局部文字颜色调色板")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "恢复默认颜色" })).toBeInTheDocument();
  });

  it("mounts the inline toolbar outside the transformed resume canvas", async () => {
    const ref = createRef<TiptapTextBlockEditorHandle>();

    render(<TiptapTextBlockEditor ref={ref} content={initialContent} onChange={vi.fn()} />);

    await waitFor(() => expect(ref.current).not.toBeNull());

    act(() => {
      ref.current?.applyCommand({ type: "toggleBold" });
    });

    const toolbar = await screen.findByRole("toolbar", { name: "文本快捷格式" });

    expect(toolbar.parentElement).toBe(document.body);
  });

  it("opens the link field with the platform shortcut", async () => {
    render(<TiptapTextBlockEditor content={initialContent} onChange={vi.fn()} />);

    const editor = await screen.findByRole("textbox", { name: "文本块编辑器" });

    fireEvent.focus(editor);
    fireEvent.keyDown(editor, { key: "k", metaKey: true });

    expect(await screen.findByRole("textbox", { name: "链接" })).toBeInTheDocument();
  });

  it("focuses and closes the floating link field with one apply action", async () => {
    const ref = createRef<TiptapTextBlockEditorHandle>();
    const onChange = vi.fn();

    render(
      <TiptapTextBlockEditor
        ref={ref}
        content={initialContent}
        onChange={onChange}
      />,
    );

    await waitFor(() => expect(ref.current).not.toBeNull());
    const editor = await screen.findByRole("textbox", { name: "文本块编辑器" });

    act(() => {
      ref.current?.applyCommand({ type: "toggleBold" });
    });

    fireEvent.click(await screen.findByRole("button", { name: "链接" }));

    const linkInput = await screen.findByRole("textbox", { name: "链接" });
    await waitFor(() => expect(linkInput).toHaveFocus());

    fireEvent.change(linkInput, {
      target: { value: "https://example.com/floating-link" },
    });
    fireEvent.click(screen.getByRole("button", { name: "应用链接" }));

    await waitFor(() => expect(editor).toHaveFocus());
    expect(onChange).toHaveBeenLastCalledWith({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Shared renderer baseline",
              marks: [
                {
                  type: "link",
                  attrs: { href: "https://example.com/floating-link" },
                },
                { type: "bold" },
              ],
            },
          ],
        },
      ],
    });
  });

  it("applies bold with the standard modifier shortcut", async () => {
    const ref = createRef<TiptapTextBlockEditorHandle>();
    const onChange = vi.fn();

    render(
      <TiptapTextBlockEditor
        ref={ref}
        content={initialContent}
        onChange={onChange}
      />,
    );

    const editor = await screen.findByRole("textbox", { name: "文本块编辑器" });

    await waitFor(() => expect(ref.current).not.toBeNull());

    act(() => {
      ref.current?.applyCommand({ type: "toggleItalic" });
    });
    onChange.mockClear();

    fireEvent.focus(editor);
    fireEvent.keyDown(editor, {
      key: "b",
      ctrlKey: !/Mac/.test(navigator.platform),
      metaKey: /Mac/.test(navigator.platform),
    });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Shared renderer baseline",
                marks: [{ type: "bold" }, { type: "italic" }],
              },
            ],
          },
        ],
      }),
    );
  });

  it("applies an inline tag with the platform shortcut", async () => {
    const ref = createRef<TiptapTextBlockEditorHandle>();
    const onChange = vi.fn();

    render(
      <TiptapTextBlockEditor
        ref={ref}
        content={initialContent}
        onChange={onChange}
      />,
    );

    const editor = await screen.findByRole("textbox", { name: "文本块编辑器" });

    await waitFor(() => expect(ref.current).not.toBeNull());

    act(() => {
      ref.current?.applyCommand({ type: "toggleItalic" });
    });
    onChange.mockClear();

    fireEvent.focus(editor);
    fireEvent.keyDown(editor, {
      key: "e",
      ctrlKey: !/Mac/.test(navigator.platform),
      metaKey: /Mac/.test(navigator.platform),
    });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Shared renderer baseline",
                marks: [{ type: "tag" }, { type: "italic" }],
              },
            ],
          },
        ],
      }),
    );
  });

  it("reports current formatting state to the toolbar bridge", async () => {
    const onChange = vi.fn();
    const onFormattingStateChange = vi.fn<
      (state: TiptapTextBlockEditorFormatState) => void
    >();

    render(
      <TiptapTextBlockEditor
        content={{
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Shared renderer baseline",
                  marks: [
                    { type: "bold" },
                    {
                      type: "link",
                      attrs: { href: "https://example.com" },
                    },
                  ],
                },
              ],
            },
          ],
        }}
        onChange={onChange}
        onFormattingStateChange={onFormattingStateChange}
      />,
    );

    await waitFor(() =>
      expect(onFormattingStateChange).toHaveBeenCalledWith({
        bold: true,
        italic: false,
        underline: false,
        strike: false,
        tag: false,
        textColor: "",
        linkHref: "https://example.com",
      }),
    );
  });

  it("replaces smaller inline color ranges when the whole text receives a new color", async () => {
    const ref = createRef<TiptapTextBlockEditorHandle>();
    const onChange = vi.fn();

    render(
      <TiptapTextBlockEditor
        ref={ref}
        content={{
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "红色",
                  marks: [{ type: "textColor", attrs: { color: "#dc2626" } }],
                },
                {
                  type: "text",
                  text: "绿色",
                  marks: [{ type: "textColor", attrs: { color: "#059669" } }],
                },
              ],
            },
          ],
        }}
        onChange={onChange}
      />,
    );

    await waitFor(() => expect(ref.current).not.toBeNull());

    act(() => {
      ref.current?.applyCommand({ type: "setTextColor", color: "#2563eb" });
    });

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "红色绿色",
                marks: [{ type: "textColor", attrs: { color: "#2563eb" } }],
              },
            ],
          },
        ],
      }),
    );
  });

  it("applies a bold command through the imperative toolbar bridge", async () => {
    const ref = createRef<TiptapTextBlockEditorHandle>();
    const onChange = vi.fn();

    render(
      <TiptapTextBlockEditor
        ref={ref}
        content={initialContent}
        onChange={onChange}
      />,
    );

    await waitFor(() => expect(ref.current).not.toBeNull());

    act(() => {
      ref.current?.applyCommand({ type: "toggleBold" });
    });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Shared renderer baseline",
                marks: [{ type: "bold" }],
              },
            ],
          },
        ],
      }),
    );
  });

  it("persists underline and strike commands through the structured rich-text model", async () => {
    const ref = createRef<TiptapTextBlockEditorHandle>();
    const onChange = vi.fn();

    render(
      <TiptapTextBlockEditor
        ref={ref}
        content={initialContent}
        onChange={onChange}
      />,
    );

    await waitFor(() => expect(ref.current).not.toBeNull());

    act(() => {
      ref.current?.applyCommand({ type: "toggleUnderline" });
      ref.current?.applyCommand({ type: "toggleStrike" });
    });

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Shared renderer baseline",
                marks: [{ type: "strike" }, { type: "underline" }],
              },
            ],
          },
        ],
      }),
    );
  });

  it("persists an inline tag mark through the toolbar bridge", async () => {
    const ref = createRef<TiptapTextBlockEditorHandle>();
    const onChange = vi.fn();

    render(
      <TiptapTextBlockEditor
        ref={ref}
        content={initialContent}
        onChange={onChange}
      />,
    );

    await waitFor(() => expect(ref.current).not.toBeNull());

    act(() => {
      ref.current?.applyCommand({ type: "toggleTag" });
    });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Shared renderer baseline",
                marks: [{ type: "tag" }],
              },
            ],
          },
        ],
      }),
    );
  });

  it("applies and clears a link command through the imperative toolbar bridge", async () => {
    const ref = createRef<TiptapTextBlockEditorHandle>();
    const onChange = vi.fn();
    const onFormattingStateChange = vi.fn<
      (state: TiptapTextBlockEditorFormatState) => void
    >();

    render(
      <TiptapTextBlockEditor
        ref={ref}
        content={initialContent}
        onChange={onChange}
        onFormattingStateChange={onFormattingStateChange}
      />,
    );

    await waitFor(() => expect(ref.current).not.toBeNull());

    act(() => {
      ref.current?.applyCommand({
        type: "setLink",
        href: "https://example.com",
      });
    });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Shared renderer baseline",
                marks: [
                  {
                    type: "link",
                    attrs: { href: "https://example.com" },
                  },
                ],
              },
            ],
          },
        ],
      }),
    );

    await waitFor(() =>
      expect(onFormattingStateChange).toHaveBeenLastCalledWith({
        bold: false,
        italic: false,
        underline: false,
        strike: false,
        tag: false,
        textColor: "",
        linkHref: "https://example.com",
      }),
    );

    act(() => {
      ref.current?.applyCommand({ type: "unsetLink" });
    });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Shared renderer baseline" }],
          },
        ],
      }),
    );

    await waitFor(() =>
      expect(onFormattingStateChange).toHaveBeenLastCalledWith({
        bold: false,
        italic: false,
        underline: false,
        strike: false,
        tag: false,
        textColor: "",
        linkHref: "",
      }),
    );
  });

  it("inserts a new link with display text at the caret without replacing the block", async () => {
    const ref = createRef<TiptapTextBlockEditorHandle>();
    const onChange = vi.fn();

    render(<TiptapTextBlockEditor ref={ref} content={initialContent} onChange={onChange} />);
    await waitFor(() => expect(ref.current).not.toBeNull());

    expect(ref.current?.prepareLink()).toMatchObject({ text: "", href: "" });
    act(() => {
      ref.current?.applyCommand({
        type: "upsertLink",
        text: "作品集",
        href: "https://example.com/portfolio",
        title: "查看作品集",
      });
    });

    const editor = screen.getByRole("textbox", { name: "文本块编辑器" });
    expect(editor).toHaveTextContent("Shared renderer baseline");
    expect(within(editor).getByRole("link", { name: "作品集" })).toHaveAttribute(
      "href",
      "https://example.com/portfolio",
    );
    expect(within(editor).getByRole("link", { name: "作品集" })).toHaveAttribute(
      "title",
      "查看作品集",
    );
  });

  it("edits an existing link's display text and target without duplicating it", async () => {
    const ref = createRef<TiptapTextBlockEditorHandle>();
    const content: RichTextContent = {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{
          type: "text",
          text: "旧名称",
          marks: [{ type: "link", attrs: { href: "https://old.example.com" } }],
        }],
      }],
    };

    render(<TiptapTextBlockEditor ref={ref} content={content} onChange={vi.fn()} />);
    await waitFor(() => expect(ref.current).not.toBeNull());

    expect(ref.current?.prepareLink()).toMatchObject({
      text: "旧名称",
      href: "https://old.example.com",
    });
    act(() => {
      ref.current?.applyCommand({
        type: "upsertLink",
        text: "新名称",
        href: "mailto:team@example.com",
      });
    });

    const editor = screen.getByRole("textbox", { name: "文本块编辑器" });
    expect(within(editor).getByRole("link", { name: "新名称" })).toHaveAttribute(
      "href",
      "mailto:team@example.com",
    );
    expect(within(editor).queryByText("旧名称")).not.toBeInTheDocument();
    expect(within(editor).getAllByRole("link")).toHaveLength(1);
  });

  it("inserts a structured resume icon at the current caret", async () => {
    const ref = createRef<TiptapTextBlockEditorHandle>();
    const onChange = vi.fn();

    render(
      <TiptapTextBlockEditor
        ref={ref}
        content={initialContent}
        onChange={onChange}
      />,
    );

    await waitFor(() => expect(ref.current).not.toBeNull());

    act(() => {
      ref.current?.applyCommand({
        type: "insertIcon",
        iconId: "lucide:mail",
      });
    });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "resumeIcon",
                attrs: { iconId: "lucide:mail" },
              },
              { type: "text", text: " Shared renderer baseline" },
            ],
          },
        ],
      }),
    );
  });
});
