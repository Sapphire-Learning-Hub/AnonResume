/** Build ranges over visible text without inserting markup into the document. */
export function createDomTextRanges(
  root: Node,
  from: number,
  to: number,
): Range[] {
  const owner = root.ownerDocument;
  if (!owner || from >= to) return [];
  const walker = owner.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const ranges: Range[] = [];
  let offset = 0;
  let node = walker.nextNode();
  while (node) {
    if (!node.parentElement?.closest('[aria-hidden="true"]')) {
      const length = node.textContent?.length ?? 0;
      const start = Math.max(0, from - offset);
      const end = Math.min(length, to - offset);
      if (start < end) {
        const range = owner.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        ranges.push(range);
      }
      offset += length;
    }
    node = walker.nextNode();
  }
  return ranges;
}

export function splitDomTextRange(range: Range): Range[] {
  const root = range.commonAncestorContainer;
  if (root.nodeType === Node.TEXT_NODE) return [range];
  const owner = root.ownerDocument;
  if (!owner) return [];
  const walker = owner.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const result: Range[] = [];
  let node = walker.nextNode();
  while (node) {
    if (
      range.intersectsNode(node) &&
      !node.parentElement?.closest(
        '[aria-hidden="true"], [data-resume-inline-page-break]',
      )
    ) {
      const from = node === range.startContainer ? range.startOffset : 0;
      const to =
        node === range.endContainer
          ? range.endOffset
          : (node.textContent?.length ?? 0);
      if (from < to) {
        const part = owner.createRange();
        part.setStart(node, from);
        part.setEnd(node, to);
        result.push(part);
      }
    }
    node = walker.nextNode();
  }
  return result;
}
