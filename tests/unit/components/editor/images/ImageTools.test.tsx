import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useStore } from "zustand";
import { ConfigProvider } from "antd";
import { ImageTools } from "@/components/editor/images/ImageTools";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { createImageBlock } from "@/domain/resume/images/model";
import type { ImageBlock } from "@/domain/resume/schema";
import { createResumeEditorStore } from "@/stores/resume-editor";

beforeEach(() => {
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  }));
});
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const document = createDefaultResumeDocument();
  const image = {
    ...createImageBlock({
      id: crypto.randomUUID(),
      width: 600,
      height: 800,
      name: "Portrait",
    }),
    radius: 12,
  };
  document.schemaVersion = 2;
  document.sections[0]!.blocks = [image];
  const store = createResumeEditorStore({
    resumeId: "image-tools",
    version: 1,
    updatedAt: 1,
    document,
  });
  const current = () =>
    store.getState().document.sections[0]!.blocks[0] as ImageBlock;
  function Harness() {
    const block = useStore(
      store,
      (state) => state.document.sections[0]!.blocks[0],
    ) as ImageBlock;
    return (
      <ImageTools
        block={block}
        onReplace={() => {}}
        onChange={(value) =>
          store.getState().updateBlockSettings({
            sectionId: document.sections[0]!.id,
            blockPath: [image.id],
            settings: value,
          })
        }
      />
    );
  }
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <Harness />
    </ConfigProvider>,
  );
  return { store, current, image };
}

it("edits dimensions without a dialog, keeps locked proportions and ignores incomplete values", () => {
  const { current, store, image } = setup();
  const width = screen.getByLabelText("宽度");
  fireEvent.focus(width);
  fireEvent.change(width, { target: { value: "120" } });
  expect(current()).toMatchObject({ width: 120, height: 160 });
  fireEvent.change(width, { target: { value: "" } });
  expect(current()).toMatchObject({ width: 120, height: 160 });
  fireEvent.blur(width);
  expect(width).toHaveValue(120);
  act(() => store.getState().undo());
  expect(current()).toEqual(image);
});

it("changes unlocked size, appearance and description immediately through the editor history", () => {
  const { current, store } = setup();
  fireEvent.click(screen.getByRole("button", { name: "锁定比例" }));
  fireEvent.change(screen.getByLabelText("高度"), { target: { value: "200" } });
  expect(current()).toMatchObject({ width: 160, height: 200 });
  fireEvent.change(screen.getByLabelText("圆角"), { target: { value: "24" } });
  fireEvent.click(screen.getByRole("button", { name: "居中对齐" }));
  fireEvent.change(screen.getByLabelText("替代文字"), {
    target: { value: "Updated portrait" },
  });
  expect(current()).toMatchObject({
    radius: 24,
    align: "center",
    alt: "Updated portrait",
  });
  act(() => store.getState().undo());
  expect(current()).toMatchObject({
    radius: 24,
    align: "center",
    alt: "Portrait",
  });
});

it("discards cancelled crop drafts and commits the confirmed crop as a single undoable change", async () => {
  const { current, store, image } = setup();
  fireEvent.click(screen.getByRole("button", { name: /裁\s*剪/ }));
  const dialog = await screen.findByRole("dialog");
  const horizontal = within(dialog).getByRole("slider", { name: "水平焦点" });
  fireEvent.keyDown(horizontal, {
    key: "ArrowRight",
    code: "ArrowRight",
    keyCode: 39,
  });
  expect(current()).toEqual(image);
  fireEvent.click(within(dialog).getByRole("button", { name: /取\s*消/ }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(current()).toEqual(image);
  fireEvent.click(screen.getByRole("button", { name: /裁\s*剪/ }));
  const reopened = await screen.findByRole("dialog");
  expect(
    within(reopened).getByRole("slider", { name: "水平焦点" }),
  ).toHaveAttribute("aria-valuenow", "50");
  fireEvent.keyDown(
    within(reopened).getByRole("slider", { name: "水平焦点" }),
    { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
  );
  fireEvent.click(within(reopened).getByRole("button", { name: /保\s*存/ }));
  expect(current()).toMatchObject({
    positionX: 51,
    radius: 12,
    alt: "Portrait",
    align: "left",
  });
  act(() => store.getState().undo());
  expect(current()).toEqual(image);
});
