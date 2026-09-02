export interface ResumePageViewport {
  top: number;
  height: number;
}

export interface ResumePagePosition {
  index: number;
  top: number;
  height: number;
}

export function getActiveResumePageIndex(params: {
  pages: ResumePagePosition[];
  viewport: ResumePageViewport;
}) {
  const viewportCenter = params.viewport.top + params.viewport.height / 2;

  return params.pages.reduce<ResumePagePosition | undefined>((closest, page) => {
    if (!closest) {
      return page;
    }

    const pageCenter = page.top + page.height / 2;
    const closestCenter = closest.top + closest.height / 2;

    return Math.abs(pageCenter - viewportCenter) <
      Math.abs(closestCenter - viewportCenter)
      ? page
      : closest;
  }, undefined)?.index;
}
