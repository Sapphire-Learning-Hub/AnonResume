import { fireEvent, render, screen, within } from "@testing-library/react";

import { SectionPresetCommands } from "@/components/editor/section-presets/SectionPresetCommands";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { listSectionPresets } from "@/domain/resume/presets";

async function dialogContaining(text: string) {
  const content = await screen.findByText(text);
  const dialog = content.closest<HTMLElement>('[role="dialog"]');
  if (!dialog) throw new Error("Expected template content inside a dialog");
  return within(dialog);
}

it("replaces the previewed template without inserting until explicitly confirmed", async () => {
  const onInsert = vi.fn();
  render(
    <SectionPresetCommands
      locale="zh-CN"
      onInsert={onInsert}
      presets={listSectionPresets("zh-CN").filter((preset) =>
        ["projects", "education"].includes(preset.id),
      )}
      settings={createDefaultResumeDocument().settings}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "选择章节模板…" }));
  const chooser = await dialogContaining("章节模板");
  fireEvent.click(chooser.getByRole("button", { name: "预览项目章节" }));

  const projectDialog = await dialogContaining("项目名称");
  expect(projectDialog.getByText("项目名称")).toBeInTheDocument();
  expect(onInsert).not.toHaveBeenCalled();
  fireEvent.click(projectDialog.getByRole("button", { name: /取\s*消/ }));

  const reopenedChooser = await dialogContaining("章节模板");
  fireEvent.click(reopenedChooser.getByRole("button", { name: "预览教育章节" }));

  const educationDialog = await dialogContaining("学校 / 专业");
  expect(educationDialog.getByText("学校 / 专业")).toBeInTheDocument();
  expect(educationDialog.queryByText("项目名称")).not.toBeInTheDocument();
  expect(onInsert).not.toHaveBeenCalled();

  fireEvent.click(educationDialog.getByRole("button", { name: "使用此模板" }));
  expect(onInsert).toHaveBeenCalledExactlyOnceWith("education");
});
