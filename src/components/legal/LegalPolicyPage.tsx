"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { LegalPageFrame } from "./LegalDocumentPage";
import { useLegalDocumentPageStyles } from "./LegalDocumentPage.style";

export interface LegalPolicyLabels {
  contact: string;
  effectiveDate: string;
  home: string;
  operator: string;
  support: string;
}

export function LegalPolicyPage({
  children,
  contactEmail,
  effectiveDate,
  labels,
  operatorName,
  title,
}: {
  children: ReactNode;
  contactEmail: string | null;
  effectiveDate: string;
  labels: LegalPolicyLabels;
  operatorName: string;
  title: string;
}) {
  const { styles } = useLegalDocumentPageStyles();

  return (
    <LegalPageFrame
      footer={
        <footer className={styles.footer}>
          <Link href="/">{labels.home}</Link>
          <Link href="/docs/support">{labels.support}</Link>
        </footer>
      }
      title={title}
    >
      <dl className={styles.metadata}>
        <div>
          <dt>{labels.operator}</dt>
          <dd>{operatorName}</dd>
        </div>
        <div>
          <dt>{labels.effectiveDate}</dt>
          <dd>{effectiveDate}</dd>
        </div>
        <div>
          <dt>{labels.contact}</dt>
          <dd>
            {contactEmail ? (
              <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
            ) : (
              <Link href="/docs/support">{labels.support}</Link>
            )}
          </dd>
        </div>
      </dl>
      <div className={styles.policy} data-style-scope="legal-policy">
        {children}
      </div>
    </LegalPageFrame>
  );
}
