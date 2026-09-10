const UNSAFE_FILENAME_CHARACTER_PATTERN = /[\\/:*?"<>|\u0000-\u001F\u007F]+/g;
const ASCII_FILENAME_PATTERN = /^[\x20-\x7E]+$/;

function normalizeDownloadFilename(value: string) {
  return value
    .normalize("NFKC")
    .replace(UNSAFE_FILENAME_CHARACTER_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function createPdfFilename(filenameBase?: string) {
  const normalizedBase = normalizeDownloadFilename(filenameBase || "resume");

  return `${normalizedBase || "resume"}.pdf`;
}

export function createDownloadContentDisposition(filename: string) {
  const normalizedFilename = normalizeDownloadFilename(filename) || "download";

  if (ASCII_FILENAME_PATTERN.test(normalizedFilename)) {
    return `attachment; filename="${normalizedFilename}"`;
  }

  return `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(normalizedFilename)}`;
}

export function createPdfContentDisposition(filenameBase?: string) {
  const filename = createPdfFilename(filenameBase);
  const disposition = createDownloadContentDisposition(filename);

  return disposition.replace('filename="download"', 'filename="resume.pdf"');
}
