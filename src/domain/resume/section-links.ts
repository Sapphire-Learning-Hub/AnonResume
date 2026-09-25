const SECTION_ANCHOR_PREFIX = "resume-section-";

export function getResumeSectionAnchorId(sectionId: string) {
  return `${SECTION_ANCHOR_PREFIX}${sectionId}`;
}

export function getResumeSectionHref(sectionId: string) {
  return `#${encodeURIComponent(getResumeSectionAnchorId(sectionId))}`;
}

export function getSectionIdFromResumeHref(href: string) {
  if (!href.startsWith("#")) return undefined;

  try {
    const anchorId = decodeURIComponent(href.slice(1));
    return anchorId.startsWith(SECTION_ANCHOR_PREFIX)
      ? anchorId.slice(SECTION_ANCHOR_PREFIX.length)
      : undefined;
  } catch {
    return undefined;
  }
}
