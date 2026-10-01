import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  analyzeStyleArchitectureSource,
  analyzeStyleSelectorScopeSource,
  scanStyleArchitecture,
} from "../../scripts/style-architecture";

describe("style architecture", () => {
  it("rejects conditional generated modifier classes", () => {
    const issues = analyzeStyleArchitectureSource(
      `function Item({ active, collapsed }) {
        return (
          <button
            className={cx(
              styles.item,
              active && styles.itemActive,
              collapsed ? styles.itemCollapsed : "",
            )}
          />
        );
      }`,
      "fixture.tsx",
    );

    expect(issues).toEqual([
      expect.objectContaining({
        code: "conditional-style-modifier",
        filePath: "fixture.tsx",
        styleName: "itemActive",
      }),
      expect.objectContaining({
        code: "conditional-style-modifier",
        filePath: "fixture.tsx",
        styleName: "itemCollapsed",
      }),
    ]);
  });

  it("allows semantic state attributes and unconditional structure classes", () => {
    const issues = analyzeStyleArchitectureSource(
      `function Panel({ active }) {
        return (
          <section
            aria-selected={active}
            className={cx(styles.panel, styles.sidebar)}
          />
        );
      }`,
      "fixture.tsx",
    );

    expect(issues).toEqual([]);
  });

  it("rejects conditional modifiers composed before JSX", () => {
    const issues = analyzeStyleArchitectureSource(
      `function Item({ dragging }) {
        const className = [
          styles.item,
          dragging ? styles.itemDragging : "",
        ].filter(Boolean).join(" ");

        return <button className={className} />;
      }`,
      "fixture.tsx",
    );

    expect(issues).toEqual([
      expect.objectContaining({
        code: "conditional-style-modifier",
        styleName: "itemDragging",
      }),
    ]);
  });

  it("rejects conditionally composed styles regardless of naming convention", () => {
    const issues = analyzeStyleArchitectureSource(
      `function Item({ highlighted }) {
        return <div className={highlighted ? styles.emphasis : styles.standard} />;
      }`,
      "fixture.tsx",
    );

    expect(issues.map((issue) => issue.styleName)).toEqual([
      "emphasis",
      "standard",
    ]);
  });

  it("rejects interactive element selectors that cross an ordinary component boundary", () => {
    const issues = analyzeStyleSelectorScopeSource(
      `const useStyles = createStyles(({ css }) => ({
        layout: css\`
          a,
          button:hover {
            color: red;
          }
        \`,
      }));`,
      "fixture.style.ts",
    );

    expect(issues).toEqual([
      expect.objectContaining({
        code: "unscoped-interactive-descendant",
        filePath: "fixture.style.ts",
        styleName: "layout",
      }),
      expect.objectContaining({
        code: "unscoped-interactive-descendant",
        filePath: "fixture.style.ts",
        styleName: "layout",
      }),
    ]);
  });

  it("allows direct children and descendants inside an explicit content scope", () => {
    const issues = analyzeStyleSelectorScopeSource(
      `const useStyles = createStyles(({ css }) => ({
        navigation: css\`
          > a,
          & > button {
            color: inherit;
          }
        \`,
        article: css\`
          &[data-style-scope="article-prose"] {
            a,
            button {
              color: inherit;
            }
          }
        \`,
      }));`,
      "fixture.style.ts",
    );

    expect(issues).toEqual([]);
  });

  it("rejects nested Ant Design selectors that attempt to raise specificity", () => {
    const issues = analyzeStyleSelectorScopeSource(
      `const useStyles = createStyles(({ css }) => ({
        panel: css\`
          .ant-input-affix-wrapper {
            && {
              margin-bottom: 24px;
            }
          }
        \`,
      }));`,
      "fixture.style.ts",
    );

    expect(issues).toEqual([
      expect.objectContaining({
        code: "nested-antd-override",
        filePath: "fixture.style.ts",
        styleName: "panel",
      }),
    ]);
  });

  it("keeps the production source tree free of unstable style composition", async () => {
    const issues = await scanStyleArchitecture(join(process.cwd(), "src"));

    expect(issues).toEqual([]);
  });
});
