import { fireEvent, render, screen } from "@testing-library/react";
import { FindReplaceBar } from "@/components/editor/search/FindReplaceBar";

function props() {
  return {
    query: { text: "one", caseSensitive: false },
    replacement: "two",
    index: 0,
    count: 3,
    mode: "document" as const,
    expanded: true,
    onQuery: vi.fn(),
    onReplacement: vi.fn(),
    onNavigate: vi.fn(),
    onReplace: vi.fn(),
    onReplaceAll: vi.fn(),
    onToggle: vi.fn(),
    onClose: vi.fn(),
  };
}

it("keeps query, case options and replacement actions distinct", () => {
  const callbacks = props();
  render(<FindReplaceBar {...callbacks} />);
  fireEvent.change(screen.getByRole("textbox", { name: "查找" }), {
    target: { value: "other" },
  });
  expect(callbacks.onQuery).toHaveBeenCalledWith({
    text: "other",
    caseSensitive: false,
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "区分大小写" }));
  expect(callbacks.onQuery).toHaveBeenCalledWith({
    text: "one",
    caseSensitive: true,
  });
  fireEvent.change(screen.getByRole("textbox", { name: "替换为" }), {
    target: { value: "" },
  });
  expect(callbacks.onReplacement).toHaveBeenCalledWith("");
  fireEvent.click(screen.getByRole("button", { name: "替换当前" }));
  fireEvent.click(screen.getByRole("button", { name: "全部替换" }));
  expect(callbacks.onReplace).toHaveBeenCalledOnce();
  expect(callbacks.onReplaceAll).toHaveBeenCalledOnce();
});

it("supports keyboard navigation and close without consuming IME confirmation", () => {
  const callbacks = props();
  render(<FindReplaceBar {...callbacks} />);
  const input = screen.getByRole("textbox", { name: "查找" });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  expect(callbacks.onNavigate).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  expect(callbacks.onNavigate.mock.calls).toEqual([[1], [-1]]);
  fireEvent.keyDown(input, { key: "Escape" });
  expect(callbacks.onClose).toHaveBeenCalledOnce();
});

it("prevents replacement and navigation when there are no matches", () => {
  const callbacks = props();
  render(<FindReplaceBar {...callbacks} count={0} index={-1} />);
  for (const name of ["上一个匹配", "下一个匹配", "替换当前", "全部替换"])
    expect(screen.getByRole("button", { name })).toBeDisabled();
});
