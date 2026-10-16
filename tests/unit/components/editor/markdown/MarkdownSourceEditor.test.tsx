import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { MarkdownSourceEditor } from "@/components/editor/markdown/MarkdownSourceEditor";

describe("MarkdownSourceEditor", () => {
  it("provides an accessible controlled CodeMirror editor", async () => {
    const { rerender } = render(
      <MarkdownSourceEditor
        value="# First"
        diagnostics={[]}
        ariaLabel="Markdown source"
        onChange={() => undefined}
        onFocusDiagnostic={() => undefined}
      />,
    );

    const editor = await screen.findByRole("textbox", { name: "Markdown source" });
    expect(editor).toHaveTextContent("# First");

    rerender(
      <MarkdownSourceEditor
        value="# Second"
        diagnostics={[]}
        ariaLabel="Markdown source"
        onChange={() => undefined}
        onFocusDiagnostic={() => undefined}
      />,
    );
    await waitFor(() => expect(editor).toHaveTextContent("# Second"));
  });

  it("moves focus to an externally selected diagnostic without exposing EditorView", async () => {
    const diagnostic = {
      severity: "error" as const,
      code: "test_error",
      parameters: {},
      line: 2,
      column: 2,
    };
    const { rerender } = render(
      <MarkdownSourceEditor
        value={"first\nsecond"}
        diagnostics={[diagnostic]}
        ariaLabel="Markdown source"
        onChange={() => undefined}
        onFocusDiagnostic={() => undefined}
      />,
    );

    const editor = await screen.findByRole("textbox", { name: "Markdown source" });
    expect(editor).not.toHaveFocus();

    rerender(
      <MarkdownSourceEditor
        value={"first\nsecond"}
        diagnostics={[diagnostic]}
        focusRequest={{ diagnostic, requestId: 1 }}
        ariaLabel="Markdown source"
        onChange={() => undefined}
        onFocusDiagnostic={() => undefined}
      />,
    );

    await waitFor(() => expect(editor).toHaveFocus());
  });

  it("renders source diagnostics and keeps editor undo shortcuts local", async () => {
    const parentKeyDown = vi.fn();
    const onChange = vi.fn();
    const onFocusDiagnostic = vi.fn();
    render(
      <div onKeyDown={parentKeyDown}>
        <MarkdownSourceEditor
          value={"first\nsecond"}
          diagnostics={[
            {
              severity: "error",
              code: "test_error",
              parameters: {},
              line: 2,
              column: 1,
            },
          ]}
          ariaLabel="Markdown source"
          onChange={onChange}
          onFocusDiagnostic={onFocusDiagnostic}
        />
      </div>,
    );
    const editor = await screen.findByRole("textbox", { name: "Markdown source" });

    await waitFor(() =>
      expect(document.querySelector(".cm-lintRange-error")).toBeInTheDocument(),
    );
    fireEvent.keyDown(editor, { key: "z", metaKey: true });
    expect(parentKeyDown).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();

    const diagnosticMarker = document.querySelector(".cm-lint-marker-error");
    expect(diagnosticMarker).toBeInTheDocument();
    fireEvent.mouseOver(diagnosticMarker!);
    const diagnosticAction = await screen.findByRole("button", {
      name: /Action: test_error/,
    });
    fireEvent.click(diagnosticAction);
    expect(onFocusDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ code: "test_error", line: 2 }),
    );
  });

  it("destroys every CodeMirror instance under React Strict Mode", async () => {
    const { EditorView } = await import("@codemirror/view");
    const destroy = vi.spyOn(EditorView.prototype, "destroy");
    const { unmount } = render(
      <StrictMode>
        <MarkdownSourceEditor
          value="text"
          diagnostics={[]}
          ariaLabel="Markdown source"
          onChange={() => undefined}
          onFocusDiagnostic={() => undefined}
        />
      </StrictMode>,
    );

    await screen.findByRole("textbox", { name: "Markdown source" });
    unmount();
    expect(destroy).toHaveBeenCalledTimes(2);
    destroy.mockRestore();
  });
});
