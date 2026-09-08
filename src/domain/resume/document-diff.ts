import type {
  ResumeBlock,
  ResumeDocument,
  RichTextContent,
} from "./schema";

export type ResumeDocumentDiffCategory = "content" | "appearance";
export type ResumeDocumentDiffKind =
  | "added"
  | "removed"
  | "changed"
  | "moved";

export interface ResumeDocumentDiffChange {
  id: string;
  category: ResumeDocumentDiffCategory;
  kind: ResumeDocumentDiffKind;
  nodeId: string;
  nodeType: "document" | "section" | "block" | "listItem" | "badge";
  label: string;
  field: string;
  cloudValue?: string;
  localValue?: string;
}

export interface ResumeDocumentDiffResult {
  changes: ResumeDocumentDiffChange[];
  summary: {
    total: number;
    content: number;
    appearance: number;
    added: number;
    removed: number;
    changed: number;
    moved: number;
  };
}

interface DiffNode {
  id: string;
  type: ResumeDocumentDiffChange["nodeType"];
  label: string;
  parentId?: string;
  content: Record<string, string>;
  appearance: Record<string, string>;
}

interface DocumentSnapshot {
  nodes: Map<string, DiffNode>;
  children: Map<string, string[]>;
}

function richTextToPlainText(content: RichTextContent | undefined) {
  if (!content) return "";

  return content.content
    .map((paragraph) =>
      paragraph.content
        .map((node) => {
          if (node.type === "text") return node.text;
          if (node.type === "hardBreak") return "\n";
          return `[${node.attrs.iconId}]`;
        })
        .join(""),
    )
    .join("\n");
}

function serializeValue(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(serializeValue).join(", ");
  }

  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${key}: ${serializeValue(entryValue)}`)
      .join("; ");
  }

  return String(value);
}

function addChild(snapshot: DocumentSnapshot, parentId: string, childId: string) {
  const children = snapshot.children.get(parentId) ?? [];
  children.push(childId);
  snapshot.children.set(parentId, children);
}

function addBlock(
  snapshot: DocumentSnapshot,
  block: ResumeBlock,
  parentId: string,
) {
  const content: Record<string, string> = {};
  const appearance: Record<string, string> = {};
  let label: string = block.type;

  if (block.type === "text") {
    const text = richTextToPlainText(block.content);
    content.text = text;
    appearance.style = serializeValue(block.style);
    label = text || "Text block";
  } else if (block.type === "badges") {
    appearance.layout = serializeValue({ wrap: block.wrap, gap: block.gap });
    label = "Badges";
  } else if (block.type === "list") {
    appearance.layout = serializeValue({
      ordered: block.ordered,
      marker: block.marker,
      gap: block.gap,
    });
    label = "List";
  } else if (block.type === "group") {
    appearance.layout = serializeValue({
      direction: block.direction,
      gap: block.gap,
      align: block.align,
    });
    label = "Group";
  } else {
    appearance.layout = serializeValue({
      gap: block.gap,
      align: block.align,
      justify: block.justify,
    });
    label = "Row";
  }

  snapshot.nodes.set(block.id, {
    id: block.id,
    type: "block",
    label,
    parentId,
    content,
    appearance,
  });
  addChild(snapshot, parentId, block.id);

  if (block.type === "group" || block.type === "row") {
    for (const child of block.children) {
      addBlock(snapshot, child, block.id);
    }
  }

  if (block.type === "list") {
    for (const item of block.items) {
      const itemLabel = item.children
        .filter((child) => child.type === "text")
        .map((child) =>
          child.type === "text" ? richTextToPlainText(child.content) : "",
        )
        .join(" ");

      snapshot.nodes.set(item.id, {
        id: item.id,
        type: "listItem",
        label: itemLabel || "List item",
        parentId: block.id,
        content: {},
        appearance: {},
      });
      addChild(snapshot, block.id, item.id);

      for (const child of item.children) {
        addBlock(snapshot, child, item.id);
      }
    }
  }

  if (block.type === "badges") {
    for (const item of block.items) {
      snapshot.nodes.set(item.id, {
        id: item.id,
        type: "badge",
        label: item.text,
        parentId: block.id,
        content: { text: item.text },
        appearance: {},
      });
      addChild(snapshot, block.id, item.id);
    }
  }
}

function createSnapshot(document: ResumeDocument): DocumentSnapshot {
  const snapshot: DocumentSnapshot = {
    nodes: new Map(),
    children: new Map(),
  };

  snapshot.nodes.set("document", {
    id: "document",
    type: "document",
    label: document.meta.title,
    content: {
      title: document.meta.title,
      locale: document.meta.locale ?? "",
    },
    appearance: {
      "page.margin": serializeValue(document.settings.page.margin),
      "typography.fontFamily": document.settings.typography.fontFamily,
      "typography.baseFontSize": String(
        document.settings.typography.baseFontSize,
      ),
      "typography.lineHeight": String(document.settings.typography.lineHeight),
      "theme.accent": document.settings.theme.accent,
      "theme.textColor": document.settings.theme.textColor,
      "theme.mutedColor": document.settings.theme.mutedColor,
    },
  });

  for (const section of document.sections) {
    const title = richTextToPlainText(section.title);

    snapshot.nodes.set(section.id, {
      id: section.id,
      type: "section",
      label: title || section.semantic || "Section",
      parentId: "document",
      content: {
        title,
        semantic: section.semantic ?? "",
      },
      appearance: {
        visible: String(section.visible),
        "titleStyle.color": section.titleStyle?.color ?? "",
        layout: serializeValue(section.layout),
      },
    });
    addChild(snapshot, "document", section.id);

    for (const block of section.blocks) {
      addBlock(snapshot, block, section.id);
    }
  }

  return snapshot;
}

function createChange(params: Omit<ResumeDocumentDiffChange, "id">) {
  return {
    ...params,
    id: [params.category, params.kind, params.nodeId, params.field].join(":"),
  } satisfies ResumeDocumentDiffChange;
}

function compareFields(
  changes: ResumeDocumentDiffChange[],
  cloudNode: DiffNode,
  localNode: DiffNode,
  category: ResumeDocumentDiffCategory,
) {
  const cloudFields = cloudNode[category];
  const localFields = localNode[category];
  const fields = new Set([
    ...Object.keys(cloudFields),
    ...Object.keys(localFields),
  ]);

  for (const field of fields) {
    if (cloudFields[field] === localFields[field]) continue;

    changes.push(
      createChange({
        category,
        kind: "changed",
        nodeId: localNode.id,
        nodeType: localNode.type,
        label: localNode.label || cloudNode.label,
        field,
        cloudValue: cloudFields[field],
        localValue: localFields[field],
      }),
    );
  }
}

function compareOrder(
  changes: ResumeDocumentDiffChange[],
  cloud: DocumentSnapshot,
  local: DocumentSnapshot,
) {
  const parentIds = new Set([
    ...cloud.children.keys(),
    ...local.children.keys(),
  ]);

  for (const parentId of parentIds) {
    const cloudChildren = cloud.children.get(parentId) ?? [];
    const localChildren = local.children.get(parentId) ?? [];
    const sharedIds = new Set(
      cloudChildren.filter((id) => local.nodes.has(id)),
    );
    const cloudShared = cloudChildren.filter((id) => sharedIds.has(id));
    const localShared = localChildren.filter((id) => sharedIds.has(id));

    if (cloudShared.join("\0") === localShared.join("\0")) continue;

    for (const [index, nodeId] of localShared.entries()) {
      const cloudIndex = cloudShared.indexOf(nodeId);
      if (cloudIndex === index) continue;

      const node = local.nodes.get(nodeId);
      if (!node) continue;

      changes.push(
        createChange({
          category: "content",
          kind: "moved",
          nodeId,
          nodeType: node.type,
          label: node.label,
          field: "order",
          cloudValue: String(cloudIndex + 1),
          localValue: String(index + 1),
        }),
      );
    }
  }
}

export function compareResumeDocuments(
  cloudDocument: ResumeDocument,
  localDocument: ResumeDocument,
): ResumeDocumentDiffResult {
  const cloud = createSnapshot(cloudDocument);
  const local = createSnapshot(localDocument);
  const changes: ResumeDocumentDiffChange[] = [];
  const nodeIds = new Set([...cloud.nodes.keys(), ...local.nodes.keys()]);

  for (const nodeId of nodeIds) {
    const cloudNode = cloud.nodes.get(nodeId);
    const localNode = local.nodes.get(nodeId);

    if (!cloudNode && localNode) {
      changes.push(
        createChange({
          category: "content",
          kind: "added",
          nodeId,
          nodeType: localNode.type,
          label: localNode.label,
          field: "node",
          localValue: localNode.label,
        }),
      );
      continue;
    }

    if (cloudNode && !localNode) {
      changes.push(
        createChange({
          category: "content",
          kind: "removed",
          nodeId,
          nodeType: cloudNode.type,
          label: cloudNode.label,
          field: "node",
          cloudValue: cloudNode.label,
        }),
      );
      continue;
    }

    if (!cloudNode || !localNode) continue;

    compareFields(changes, cloudNode, localNode, "content");
    compareFields(changes, cloudNode, localNode, "appearance");
  }

  compareOrder(changes, cloud, local);

  return {
    changes,
    summary: {
      total: changes.length,
      content: changes.filter((change) => change.category === "content").length,
      appearance: changes.filter((change) => change.category === "appearance")
        .length,
      added: changes.filter((change) => change.kind === "added").length,
      removed: changes.filter((change) => change.kind === "removed").length,
      changed: changes.filter((change) => change.kind === "changed").length,
      moved: changes.filter((change) => change.kind === "moved").length,
    },
  };
}
