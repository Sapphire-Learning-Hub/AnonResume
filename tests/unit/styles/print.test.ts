import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("print.css", () => {
  it("removes screen-only spacing from the print shell", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/print.css"), "utf8");

    expect(css).toContain('[data-resume-print-shell="true"]');
    expect(css).toContain('[data-resume-print-content="true"]');
    expect(css).toContain('[data-resume-mode="print"]');
    expect(css).toContain("padding: 0 !important;");
    expect(css).toContain("gap: 0 !important;");
    expect(css).toContain("margin: 0 !important;");
  });
});
