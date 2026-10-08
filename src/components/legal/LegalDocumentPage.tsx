"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useLegalDocumentPageStyles } from "./LegalDocumentPage.style";

export function LegalPageFrame({
  children,
  description,
  footer,
  title,
}: {
  children: ReactNode;
  description: string;
  footer?: ReactNode;
  title: string;
}) {
  const { styles } = useLegalDocumentPageStyles();

  return (
    <main className={styles.shell}>
      <article className={styles.document}>
        <header className={styles.header}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.description}>{description}</p>
        </header>
        {children}
        {footer ?? (
          <footer className={styles.footer}>
            <Link href="/">AnonResume</Link>
          </footer>
        )}
      </article>
    </main>
  );
}

export function LegalDocumentPage({
  title,
  description,
  content,
}: {
  title: string;
  description: string;
  content: string;
}) {
  const { styles } = useLegalDocumentPageStyles();

  return (
    <LegalPageFrame description={description} title={title}>
      <pre className={styles.preformatted}>{content}</pre>
    </LegalPageFrame>
  );
}
