import Link from "next/link";
import type { ReactNode } from "react";

import { DocsArticleActions } from "./DocsArticleActions";

export interface DocsTocEntry {
  href: `#${string}`;
  label: string;
}

interface DocsAdjacentPage {
  href: string;
  label: string;
}

export function DocsArticleLayout({
  breadcrumbLabel,
  children,
  currentLabel,
  isRoot = false,
  nextLabel,
  nextPage,
  paginationLabel,
  previousLabel,
  previousPage,
  rootLabel,
  toc,
  tocLabel,
}: {
  breadcrumbLabel: string;
  children: ReactNode;
  currentLabel: string;
  isRoot?: boolean;
  nextLabel: string;
  nextPage?: DocsAdjacentPage;
  paginationLabel: string;
  previousLabel: string;
  previousPage?: DocsAdjacentPage;
  rootLabel: string;
  toc: readonly DocsTocEntry[];
  tocLabel: string;
}) {
  return (
    <div data-docs-article-layout>
      <div data-docs-article-column>
        <div data-docs-article-toolbar>
          <nav aria-label={breadcrumbLabel} data-docs-breadcrumb>
            {isRoot ? (
              <span aria-current="page">{rootLabel}</span>
            ) : (
              <>
                <Link href="/docs">{rootLabel}</Link>
                <span aria-hidden="true">/</span>
                <span aria-current="page">{currentLabel}</span>
              </>
            )}
          </nav>
          <DocsArticleActions />
        </div>

        <article data-docs-article>
          <div data-docs-article-body>{children}</div>
          <nav aria-label={paginationLabel} data-docs-pagination>
            {previousPage ? (
              <Link data-direction="previous" href={previousPage.href}>
                <span>{previousLabel}</span>
                <strong>{previousPage.label}</strong>
              </Link>
            ) : (
              <span />
            )}
            {nextPage ? (
              <Link data-direction="next" href={nextPage.href}>
                <span>{nextLabel}</span>
                <strong>{nextPage.label}</strong>
              </Link>
            ) : null}
          </nav>
        </article>
      </div>

      <aside aria-label={tocLabel} data-docs-toc>
        <nav>
          {toc.map((entry) => (
            <a href={entry.href} key={entry.href}>
              {entry.label}
            </a>
          ))}
        </nav>
      </aside>
    </div>
  );
}
