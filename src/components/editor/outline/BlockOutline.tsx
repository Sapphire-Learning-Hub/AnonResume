"use client";

import {
  useMemo,
  useRef,
  useState,
  useEffect,
  type KeyboardEvent,
} from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  DownOutlined,
  RightOutlined,
  HolderOutlined,
  UpOutlined,
  FileTextOutlined,
  FolderOutlined,
  UnorderedListOutlined,
  TagOutlined,
  ColumnWidthOutlined,
} from "@ant-design/icons";
import {
  findBlockByPath,
  flattenBlockOutlineTree,
  getBlockOutlineTree,
  type FlatBlockOutlineNode,
} from "@/domain/resume/block-tree";
import {
  resolveBlockRange,
  type BlockCompositionCommand,
} from "@/domain/resume/composition/operations";
import type { ResumeEditorSelection } from "@/domain/resume/editor-selection";
import type { ResumeDocument, ResumeSection } from "@/domain/resume/schema";
import { useI18n } from "@/i18n/I18nProvider";
import { CompositionMenu } from "./CompositionMenu";
import { getOutlineLabel } from "./outline-labels";
import { useBlockOutlineStyles } from "./BlockOutline.style";

type Props = {
  document: ResumeDocument;
  section: ResumeSection;
  selection: ResumeEditorSelection;
  layout: boolean;
  onSelect: (selection: ResumeEditorSelection, extend?: boolean) => void;
  onMoveRange: (toIndex: number) => void;
  onMoveBlock: (params: {
    sectionId: string;
    blockPath: string[];
    toIndex: number;
  }) => void;
  onCompose: (command: BlockCompositionCommand) => void;
};
const keyOf = (path: string[]) => JSON.stringify(path);

function OutlineRow({
  node,
  selected,
  locked,
  layout,
  collapsed,
  drop,
  onToggle,
  onSelect,
  onMove,
  onKeyDown,
  canMoveUp,
  canMoveDown,
  children,
}: {
  node: FlatBlockOutlineNode;
  selected: boolean;
  locked: boolean;
  layout: boolean;
  collapsed: boolean;
  drop?: string;
  onToggle: () => void;
  onSelect: (extend: boolean) => void;
  onMove: (direction: -1 | 1) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  children?: React.ReactNode;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const { styles } = useBlockOutlineStyles();
  const { t } = useI18n();
  const id = keyOf(node.path);
  const disabled = !layout || locked || node.siblingCount < 2;
  const {
    isDragging,
    attributes,
    listeners,
    setNodeRef: setDragRef,
  } = useDraggable({
    id,
    disabled,
    data: { parent: keyOf(node.path.slice(0, -1)) },
  });
  const { setNodeRef: setDropRef } = useDroppable({
    id,
    disabled,
    data: { parent: keyOf(node.path.slice(0, -1)) },
  });
  const label = getOutlineLabel(node, t, node.index);
  const Icon =
    node.kind === "item"
      ? UnorderedListOutlined
      : node.block?.type === "group"
        ? FolderOutlined
        : node.block?.type === "row"
          ? ColumnWidthOutlined
          : node.block?.type === "badges"
            ? TagOutlined
            : FileTextOutlined;
  return (
    <div
      ref={setDropRef}
      className={styles.row}
      role="treeitem"
      aria-level={node.depth + 1}
      aria-posinset={node.index + 1}
      aria-setsize={node.siblingCount}
      aria-selected={selected}
      aria-expanded={node.children.length ? !collapsed : undefined}
      data-outline-path={id}
      data-drop={drop}
      data-dragging={isDragging}
      style={{ paddingInlineStart: node.depth * 12 }}
    >
      {layout ? (
        <button
          ref={setDragRef}
          {...attributes}
          {...listeners}
          onKeyDown={onKeyDown}
          disabled={disabled}
          className={styles.handle}
          type="button"
          title={locked ? t("outline.fixed") : undefined}
          aria-label={t("outline.drag", { label })}
        >
          <HolderOutlined />
        </button>
      ) : null}
      {node.children.length ? (
        <button
          className={styles.control}
          type="button"
          aria-label={t(collapsed ? "outline.expand" : "outline.collapse", {
            label,
          })}
          onClick={onToggle}
        >
          {collapsed ? <RightOutlined /> : <DownOutlined />}
        </button>
      ) : (
        <span className={styles.toggleSpace} />
      )}
      <button
        className={styles.select}
        data-outline-select="true"
        type="button"
        aria-label={t("outline.select", { label })}
        aria-pressed={selected}
        onClick={(event) => onSelect(event.shiftKey)}
        onKeyDown={onKeyDown}
      >
        {/* Private, normalized thumbnails use the authenticated asset endpoint. */}
        {node.block?.type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={styles.thumbnail}
            src={`/api/resume-assets/${node.block.assetId}/content?variant=thumbnail`}
            alt=""
            draggable={false}
          />
        ) : (
          <Icon aria-hidden />
        )}
        <span className={styles.label}>{label}</span>
        {node.children.length ? (
          <span className={styles.count}>{node.children.length}</span>
        ) : null}
      </button>
      {layout ? (
        <div className={styles.actions} data-outline-actions="true">
          <button
            className={styles.control}
            type="button"
            aria-label={t("renderer.moveUp", { title: label })}
            disabled={locked || !canMoveUp}
            onClick={() => onMove(-1)}
          >
            <UpOutlined />
          </button>
          <button
            className={styles.control}
            type="button"
            aria-label={t("renderer.moveDown", { title: label })}
            disabled={locked || !canMoveDown}
            onClick={() => onMove(1)}
          >
            <DownOutlined />
          </button>
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function BlockOutline(props: Props) {
  const {
    document,
    section,
    selection,
    layout,
    onSelect,
    onMoveBlock,
    onMoveRange,
    onCompose,
  } = props;
  const { styles } = useBlockOutlineStyles();
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const selectionKey = keyOf([
    selection.sectionId ?? "",
    ...(selection.blockPath ?? []),
  ]);
  const [folds, setFolds] = useState({
    key: selectionKey,
    collapsed: new Set<string>(),
  });
  if (folds.key !== selectionKey) {
    const collapsed = new Set(folds.collapsed);
    if (selection.sectionId === section.id)
      for (
        let length = 1;
        length < (selection.blockPath?.length ?? 0);
        length++
      )
        collapsed.delete(keyOf(selection.blockPath!.slice(0, length)));
    setFolds({ key: selectionKey, collapsed });
  }
  const nodes = useMemo(
    () =>
      flattenBlockOutlineTree(
        getBlockOutlineTree(section.blocks),
        folds.collapsed,
      ),
    [section.blocks, folds.collapsed],
  );
  const [dragState, setDragState] = useState<{
    id: string;
    over?: string;
    source: ResumeDocument;
  }>();
  const active =
    dragState?.source === document && layout ? dragState : undefined;
  const [announcement, setAnnouncement] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const range =
    selection.sectionId === section.id
      ? resolveBlockRange(document, selection)
      : undefined;

  useEffect(() => {
    const selected = Array.from(
      root.current?.querySelectorAll<HTMLElement>("[data-outline-path]") ?? [],
    ).find(
      (element) =>
        element.dataset.outlinePath === keyOf(selection.blockPath ?? []),
    );
    selected?.scrollIntoView?.({ block: "nearest" });
  }, [selectionKey, selection.blockPath]);

  function select(node: FlatBlockOutlineNode, extend = false) {
    const path = node.kind === "item" ? node.children[0]?.path : node.path;
    if (path)
      onSelect(
        { sectionId: section.id, blockPath: path },
        layout && node.kind === "block" && extend,
      );
  }
  function isSelected(node: FlatBlockOutlineNode) {
    return (
      selection.sectionId === section.id &&
      (keyOf(selection.blockPath ?? []) === keyOf(node.path) ||
        Boolean(
          range?.parentPath &&
          keyOf(range.parentPath) === keyOf(node.path.slice(0, -1)) &&
          range.blocks.some((block) => block.id === node.path.at(-1)),
        ))
    );
  }
  function move(node: FlatBlockOutlineNode, direction: -1 | 1) {
    const parent = findBlockByPath(section.blocks, node.path.slice(0, -1));
    if (!layout || (parent?.type === "row" && parent.columnLayout)) return;
    const label = getOutlineLabel(node, t, node.index);
    if (node.kind === "block" && isSelected(node) && range) {
      const to = range.start + direction;
      if (to < 0 || to > range.siblings.length - range.blocks.length) return;
      onMoveRange(to);
    } else {
      const to = node.index + direction;
      if (to < 0 || to >= node.siblingCount) return;
      select(node);
      onMoveBlock({ sectionId: section.id, blockPath: node.path, toIndex: to });
    }
    setAnnouncement(t("outline.moved", { label }));
  }
  function finishDrag(event: DragEndEvent) {
    setDragState(undefined);
    if (!active || !event.over) return;
    const node = nodes.find(
      (node) => keyOf(node.path) === String(event.active.id),
    );
    const target = nodes.find(
      (node) => keyOf(node.path) === String(event.over!.id),
    );
    if (
      !node ||
      !target ||
      keyOf(node.path.slice(0, -1)) !== keyOf(target.path.slice(0, -1)) ||
      node.index === target.index
    )
      return;
    if (node.kind === "block" && isSelected(node) && range) {
      if (range.blocks.some((block) => block.id === target.path.at(-1))) return;
      onMoveRange(
        target.index > range.start
          ? target.index - range.blocks.length + 1
          : target.index,
      );
    } else {
      select(node);
      onMoveBlock({
        sectionId: section.id,
        blockPath: node.path,
        toIndex: target.index,
      });
    }
    setAnnouncement(
      t("outline.moved", { label: getOutlineLabel(node, t, node.index) }),
    );
  }
  function toggle(node: FlatBlockOutlineNode) {
    const collapsed = new Set(folds.collapsed);
    const key = keyOf(node.path);
    if (!collapsed.delete(key)) collapsed.add(key);
    setFolds({ key: selectionKey, collapsed });
  }
  function keyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    node: FlatBlockOutlineNode,
  ) {
    if (event.altKey && ["ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      move(node, event.key === "ArrowUp" ? -1 : 1);
      return;
    }
    if (
      event.key === "ArrowRight" &&
      node.children.length &&
      folds.collapsed.has(keyOf(node.path))
    ) {
      event.preventDefault();
      toggle(node);
      return;
    }
    if (
      event.key === "ArrowLeft" &&
      node.children.length &&
      !folds.collapsed.has(keyOf(node.path))
    ) {
      event.preventDefault();
      toggle(node);
      return;
    }
    const index = nodes.indexOf(node);
    const target =
      event.key === "ArrowDown"
        ? nodes[index + 1]
        : event.key === "ArrowUp"
          ? nodes[index - 1]
          : event.key === "ArrowLeft"
            ? nodes.find(
                (candidate) =>
                  keyOf(candidate.path) === keyOf(node.path.slice(0, -1)),
              )
            : event.key === "ArrowRight"
              ? node.children.length
                ? nodes[index + 1]
                : undefined
              : event.key === "Home"
                ? nodes[0]
                : event.key === "End"
                  ? nodes.at(-1)
                  : undefined;
    if (!target) return;
    event.preventDefault();
    const row = Array.from(
      root.current?.querySelectorAll<HTMLElement>("[data-outline-path]") ?? [],
    ).find((element) => element.dataset.outlinePath === keyOf(target.path));
    row?.querySelector<HTMLButtonElement>("[data-outline-select]")?.focus();
  }
  const activeNode = active
    ? nodes.find((node) => keyOf(node.path) === active.id)
    : undefined;
  const overNode = active
    ? nodes.find((node) => keyOf(node.path) === active.over)
    : undefined;
  function dragLabel(id: string | number) {
    const node = nodes.find(
      (candidate) => keyOf(candidate.path) === String(id),
    );
    return node ? getOutlineLabel(node, t, node.index) : t("editor.outline");
  }
  return (
    <DndContext
      id={`block-outline-${section.id}`}
      sensors={sensors}
      accessibility={{
        screenReaderInstructions: { draggable: t("outline.sortHelp") },
        announcements: {
          onDragStart: ({ active }) =>
            t("outline.dragging", { label: dragLabel(active.id) }),
          onDragOver: ({ over }) =>
            over
              ? t("outline.destination", { label: dragLabel(over.id) })
              : undefined,
          onDragEnd: () => undefined,
          onDragCancel: () => t("outline.cancelled"),
        },
      }}
      collisionDetection={(args) =>
        (args.pointerCoordinates ? pointerWithin : closestCenter)({
          ...args,
          droppableContainers: args.droppableContainers.filter(
            (container) =>
              container.data.current?.parent ===
              args.active.data.current?.parent,
          ),
        })
      }
      onDragStart={({ active }) =>
        setDragState({ id: String(active.id), source: document })
      }
      onDragOver={({ over }) =>
        setDragState((state) =>
          state
            ? { ...state, over: over ? String(over.id) : undefined }
            : undefined,
        )
      }
      onDragCancel={() => setDragState(undefined)}
      onDragEnd={finishDrag}
    >
      <div
        ref={root}
        role="tree"
        aria-label={t("editor.outline")}
        aria-multiselectable={layout}
        className={styles.tree}
      >
        {nodes.map((node) => {
          const parent = findBlockByPath(
            section.blocks,
            node.path.slice(0, -1),
          );
          const locked = Boolean(parent?.type === "row" && parent.columnLayout);
          const selected = isSelected(node);
          return (
            <OutlineRow
              key={keyOf(node.path)}
              node={node}
              selected={selected}
              layout={layout}
              locked={locked}
              collapsed={folds.collapsed.has(keyOf(node.path))}
              canMoveUp={selected && range ? range.start > 0 : node.index > 0}
              canMoveDown={
                selected && range
                  ? range.start + range.blocks.length < range.siblings.length
                  : node.index < node.siblingCount - 1
              }
              drop={
                overNode === node && activeNode && activeNode !== node
                  ? node.index > activeNode.index
                    ? "after"
                    : "before"
                  : undefined
              }
              onToggle={() => toggle(node)}
              onSelect={(extend) => select(node, extend)}
              onMove={(direction) => move(node, direction)}
              onKeyDown={(event) => keyDown(event, node)}
            >
              {selected &&
              keyOf(node.path) === keyOf(selection.blockPath ?? []) &&
              node.kind === "block" ? (
                <CompositionMenu
                  className={styles.control}
                  document={document}
                  selection={selection}
                  onCompose={onCompose}
                />
              ) : null}
            </OutlineRow>
          );
        })}
      </div>
      <div className={styles.live} role="status" aria-live="polite">
        {announcement}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeNode ? (
          <div className={styles.overlay}>
            {getOutlineLabel(activeNode, t, activeNode.index)}
            {range && range.blocks.length > 1 && isSelected(activeNode)
              ? ` · ${t("outline.multi", { count: range.blocks.length })}`
              : ""}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
