export function LegalDocumentPage({
  title,
  description,
  content,
}: {
  title: string;
  description: string;
  content: string;
}) {
  return (
    <main className="legal-document-shell">
      <article className="legal-document">
        <h1 className="legal-document-title">{title}</h1>
        <p className="legal-document-description">{description}</p>
        <pre className="legal-document-content">{content}</pre>
      </article>
    </main>
  );
}
