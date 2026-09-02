import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("globals.css", () => {
  it("keeps modal motion centered instead of expanding from the last click", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toMatch(
      /\.ant-modal\s*\{[\s\S]*?transform-origin:\s*center center\s*!important;/,
    );
  });
});
