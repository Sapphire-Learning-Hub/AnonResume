import type { RichTextContent } from "../schema";

export interface RichTextPosition {
  paragraphIndex: number;
  nodeIndex: number;
  offset: number;
}

export interface RichTextRange {
  from: RichTextPosition;
  to: RichTextPosition;
}

type RichTextParagraph = RichTextContent["content"][number];
type RichTextNode = RichTextParagraph["content"][number];

const EMPTY_CONTENT: RichTextContent = {
  type: "doc",
  content: [{ type: "paragraph", content: [] }],
};

export function compareRichTextPositions(
  left: RichTextPosition,
  right: RichTextPosition,
) {
  return (
    left.paragraphIndex - right.paragraphIndex ||
    left.nodeIndex - right.nodeIndex ||
    left.offset - right.offset
  );
}

function getNodeSize(node: RichTextNode) {
  return node.type === "text" ? node.text.length : 1;
}

function normalizePosition(
  content: RichTextContent,
  position: RichTextPosition,
): RichTextPosition {
  const { paragraphIndex, nodeIndex, offset } = position;
  const paragraph = content.content[paragraphIndex];

  if (
    !Number.isInteger(paragraphIndex) ||
    !Number.isInteger(nodeIndex) ||
    !Number.isInteger(offset) ||
    paragraphIndex < 0 ||
    nodeIndex < 0 ||
    offset < 0 ||
    !paragraph
  ) {
    throw new RangeError("rich_text_position_out_of_bounds");
  }

  if (nodeIndex === paragraph.content.length) {
    if (offset !== 0) {
      throw new RangeError("rich_text_position_out_of_bounds");
    }

    return { paragraphIndex, nodeIndex, offset: 0 };
  }

  const node = paragraph.content[nodeIndex];

  if (!node || offset > getNodeSize(node)) {
    throw new RangeError("rich_text_position_out_of_bounds");
  }

  if (offset === getNodeSize(node)) {
    return { paragraphIndex, nodeIndex: nodeIndex + 1, offset: 0 };
  }

  return { paragraphIndex, nodeIndex, offset };
}

function getDocumentStart(): RichTextPosition {
  return { paragraphIndex: 0, nodeIndex: 0, offset: 0 };
}

function getDocumentEnd(content: RichTextContent): RichTextPosition {
  const paragraphIndex = content.content.length - 1;
  const paragraph = content.content[paragraphIndex]!;

  return {
    paragraphIndex,
    nodeIndex: paragraph.content.length,
    offset: 0,
  };
}

function cloneNodeRange(
  node: RichTextNode,
  fromOffset: number,
  toOffset: number,
): RichTextNode | undefined {
  if (fromOffset >= toOffset) {
    return undefined;
  }

  if (node.type !== "text") {
    return fromOffset === 0 && toOffset === 1 ? { ...node } : undefined;
  }

  const text = node.text.slice(fromOffset, toOffset);

  return text ? { ...node, text } : undefined;
}

function sliceParagraphNodes(
  paragraph: RichTextParagraph,
  from: Pick<RichTextPosition, "nodeIndex" | "offset">,
  to: Pick<RichTextPosition, "nodeIndex" | "offset">,
) {
  const nodes: RichTextNode[] = [];

  for (let index = from.nodeIndex; index <= to.nodeIndex; index += 1) {
    const node = paragraph.content[index];

    if (!node) {
      continue;
    }

    const nodeSize = getNodeSize(node);
    const fromOffset = index === from.nodeIndex ? from.offset : 0;
    const toOffset = index === to.nodeIndex ? to.offset : nodeSize;
    const slicedNode = cloneNodeRange(node, fromOffset, toOffset);

    if (slicedNode) {
      nodes.push(slicedNode);
    }
  }

  return nodes;
}

export function sliceRichTextContent(
  content: RichTextContent,
  range: RichTextRange,
): RichTextContent {
  const from = normalizePosition(content, range.from);
  const to = normalizePosition(content, range.to);

  if (compareRichTextPositions(from, to) > 0) {
    throw new RangeError("rich_text_range_reversed");
  }

  if (compareRichTextPositions(from, to) === 0) {
    return EMPTY_CONTENT;
  }

  const paragraphs: RichTextContent["content"] = [];

  for (
    let paragraphIndex = from.paragraphIndex;
    paragraphIndex <= to.paragraphIndex;
    paragraphIndex += 1
  ) {
    const paragraph = content.content[paragraphIndex];

    if (!paragraph) {
      continue;
    }

    const startsHere = paragraphIndex === from.paragraphIndex;
    const endsHere = paragraphIndex === to.paragraphIndex;
    const paragraphFrom = startsHere
      ? { nodeIndex: from.nodeIndex, offset: from.offset }
      : { nodeIndex: 0, offset: 0 };
    const paragraphTo = endsHere
      ? { nodeIndex: to.nodeIndex, offset: to.offset }
      : { nodeIndex: paragraph.content.length, offset: 0 };
    const nodes = sliceParagraphNodes(paragraph, paragraphFrom, paragraphTo);
    const isEmptyBoundaryParagraph =
      nodes.length === 0 &&
      ((endsHere && to.nodeIndex === 0 && to.offset === 0) ||
        (startsHere &&
          from.nodeIndex === paragraph.content.length &&
          from.offset === 0));

    if (!isEmptyBoundaryParagraph) {
      paragraphs.push({ type: "paragraph", content: nodes });
    }
  }

  return paragraphs.length
    ? { type: "doc", content: paragraphs }
    : EMPTY_CONTENT;
}

export function splitRichTextContent(
  content: RichTextContent,
  breakPositions: readonly RichTextPosition[],
) {
  const start = getDocumentStart();
  const end = getDocumentEnd(content);
  const positions: RichTextPosition[] = [];
  let previous = start;

  for (const requestedPosition of breakPositions) {
    const position = normalizePosition(content, requestedPosition);

    if (compareRichTextPositions(position, previous) < 0) {
      throw new RangeError("rich_text_breaks_out_of_order");
    }

    previous = position;

    if (
      compareRichTextPositions(position, start) <= 0 ||
      compareRichTextPositions(position, end) >= 0 ||
      compareRichTextPositions(position, positions.at(-1) ?? start) === 0
    ) {
      continue;
    }

    positions.push(position);
  }

  const boundaries = [start, ...positions, end];

  return boundaries.slice(0, -1).map((from, index) =>
    sliceRichTextContent(content, {
      from,
      to: boundaries[index + 1]!,
    }),
  );
}
