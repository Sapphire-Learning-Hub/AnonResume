import { createRef } from "react";

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
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
        linkHref: "https://example.com",
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
        linkHref: "",
      }),
    );
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
