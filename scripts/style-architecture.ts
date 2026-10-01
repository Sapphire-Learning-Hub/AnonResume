import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";

import ts from "typescript";

export type StyleArchitectureIssueCode =
  | "conditional-style-modifier"
  | "nested-antd-override"
  | "unscoped-interactive-descendant"
  | "unstable-antd-override";

export interface StyleArchitectureIssue {
  filePath: string;
  line: number;
  column: number;
  code: StyleArchitectureIssueCode;
  message: string;
  styleName: string;
}

export interface DirectAntStyleUsage {
  styleName: string;
  line: number;
  column: number;
}

const antdImportPattern = /import\s*\{([^}]*)\}\s*from\s*["']antd["']/g;
const interactiveElementPattern =
  /(^|[\s>+~])(a|button|input|select|textarea)(?=[:.\[#\s>+~]|$)/g;
const nestedAntOverridePattern = /\.ant-[^{]+\{\s*&&\s*\{/g;

function getAntComponentNames(source: string) {
  const componentNames = new Set<string>();

  for (const match of source.matchAll(antdImportPattern)) {
    for (const importedName of match[1].split(",")) {
      const normalizedName = importedName.trim().replace(/^type\s+/, "");
      const [exportedName, localName] = normalizedName.split(/\s+as\s+/);
      const componentName = localName || exportedName;

      if (/^[A-Z][A-Za-z0-9]*$/.test(componentName)) {
        componentNames.add(componentName);
      }
    }
  }

  return componentNames;
}

function getRootTagName(tagName: ts.JsxTagNameExpression): string | null {
  if (ts.isJsxNamespacedName(tagName)) {
    return null;
  }

  let expression: ts.Expression = tagName;

  while (ts.isPropertyAccessExpression(expression)) {
    expression = expression.expression;
  }

  return ts.isIdentifier(expression) ? expression.text : null;
}

function getSourcePosition(sourceFile: ts.SourceFile, node: ts.Node) {
  const position = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );

  return {
    line: position.line + 1,
    column: position.character + 1,
  };
}

function getStyleName(node: ts.Node): string | null {
  if (
    !ts.isPropertyAccessExpression(node) ||
    !ts.isIdentifier(node.expression) ||
    node.expression.text !== "styles"
  ) {
    return null;
  }

  return node.name.text;
}

function getStyleDefinitionName(node: ts.TaggedTemplateExpression) {
  const parent = node.parent;

  if (!ts.isPropertyAssignment(parent)) {
    return null;
  }

  if (ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name)) {
    return parent.name.text;
  }

  return null;
}

function getTemplateText(template: ts.TemplateLiteral) {
  if (ts.isNoSubstitutionTemplateLiteral(template)) {
    return template.text;
  }

  return [
    template.head.text,
    ...template.templateSpans.flatMap((span) => [
      " __style_expression__ ",
      span.literal.text,
    ]),
  ].join("");
}

function selectorHasUnscopedInteractiveDescendant(selector: string) {
  interactiveElementPattern.lastIndex = 0;

  for (const match of selector.matchAll(interactiveElementPattern)) {
    const prefix = selector.slice(0, match.index ?? 0).trimEnd();

    if (prefix.endsWith(">")) {
      continue;
    }

    return true;
  }

  return false;
}

function findUnscopedInteractiveSelectors(cssText: string) {
  const selectors: string[] = [];
  const scopeStack: boolean[] = [];
  let segmentStart = 0;

  for (let index = 0; index < cssText.length; index += 1) {
    const character = cssText[index];

    if (character === ";") {
      segmentStart = index + 1;
      continue;
    }

    if (character === "}") {
      scopeStack.pop();
      segmentStart = index + 1;
      continue;
    }

    if (character !== "{") {
      continue;
    }

    const prelude = cssText.slice(segmentStart, index).trim();
    const parentHasExplicitScope = scopeStack.at(-1) ?? false;
    const hasExplicitScope =
      parentHasExplicitScope || prelude.includes("[data-style-scope");

    if (!prelude.startsWith("@") && !hasExplicitScope) {
      for (const selector of prelude.split(",")) {
        const normalizedSelector = selector.trim();

        if (selectorHasUnscopedInteractiveDescendant(normalizedSelector)) {
          selectors.push(normalizedSelector);
        }
      }
    }

    scopeStack.push(hasExplicitScope);
    segmentStart = index + 1;
  }

  return selectors;
}

export function analyzeStyleSelectorScopeSource(
  source: string,
  filePath: string,
): StyleArchitectureIssue[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const issues: StyleArchitectureIssue[] = [];

  function visit(node: ts.Node) {
    if (
      ts.isTaggedTemplateExpression(node) &&
      ts.isIdentifier(node.tag) &&
      node.tag.text === "css"
    ) {
      const styleName = getStyleDefinitionName(node);

      if (styleName) {
        const templateText = getTemplateText(node.template);

        for (const match of templateText.matchAll(nestedAntOverridePattern)) {
          issues.push({
            ...getSourcePosition(sourceFile, node),
            code: "nested-antd-override",
            filePath,
            styleName,
            message: `Nested Ant Design override "${match[0].split("{")[0].trim()}" must be replaced with a class applied directly to the component.`,
          });
        }

        for (const selector of findUnscopedInteractiveSelectors(
          templateText,
        )) {
          issues.push({
            ...getSourcePosition(sourceFile, node),
            code: "unscoped-interactive-descendant",
            filePath,
            styleName,
            message: `Interactive selector "${selector}" must use a direct-child boundary or an explicit data-style-scope content root.`,
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return issues;
}

function getStyleMembers(node: ts.Node) {
  const members: Array<{ node: ts.Node; styleName: string }> = [];

  function visit(candidate: ts.Node) {
    const styleName = getStyleName(candidate);

    if (styleName) {
      members.push({ node: candidate, styleName });
      return;
    }

    ts.forEachChild(candidate, visit);
  }

  visit(node);
  return members;
}

function isClassNameAttribute(node: ts.Node): node is ts.JsxAttribute {
  return (
    ts.isJsxAttribute(node) &&
    ["className", "rootClassName"].includes(node.name.getText())
  );
}

function collectConditionalStyleMembers(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  filePath: string,
  issues: StyleArchitectureIssue[],
  conditional = false,
) {
  const styleName = getStyleName(node);

  if (conditional && styleName) {
    const position = getSourcePosition(sourceFile, node);

    issues.push({
      ...position,
      code: "conditional-style-modifier",
      filePath,
      styleName,
      message: `Conditional style "${styleName}" must be expressed with aria-* or data-* on its base element.`,
    });
    return;
  }

  if (ts.isConditionalExpression(node)) {
    collectConditionalStyleMembers(
      node.condition,
      sourceFile,
      filePath,
      issues,
      conditional,
    );
    collectConditionalStyleMembers(
      node.whenTrue,
      sourceFile,
      filePath,
      issues,
      true,
    );
    collectConditionalStyleMembers(
      node.whenFalse,
      sourceFile,
      filePath,
      issues,
      true,
    );
    return;
  }

  if (
    ts.isBinaryExpression(node) &&
    [
      ts.SyntaxKind.AmpersandAmpersandToken,
      ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.QuestionQuestionToken,
    ].includes(node.operatorToken.kind)
  ) {
    collectConditionalStyleMembers(
      node.left,
      sourceFile,
      filePath,
      issues,
      conditional,
    );
    collectConditionalStyleMembers(
      node.right,
      sourceFile,
      filePath,
      issues,
      true,
    );
    return;
  }

  ts.forEachChild(node, (child) =>
    collectConditionalStyleMembers(
      child,
      sourceFile,
      filePath,
      issues,
      conditional,
    ),
  );
}

export function analyzeStyleArchitectureSource(
  source: string,
  filePath: string,
): StyleArchitectureIssue[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.TSX,
  );
  const issues: StyleArchitectureIssue[] = [];
  const variableInitializers = new Map<string, ts.Expression>();

  function collectVariableInitializers(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      variableInitializers.set(node.name.text, node.initializer);
    }

    ts.forEachChild(node, collectVariableInitializers);
  }

  collectVariableInitializers(sourceFile);

  function inspectClassNameExpression(
    expression: ts.Expression,
    visitedVariables = new Set<string>(),
  ) {
    collectConditionalStyleMembers(
      expression,
      sourceFile,
      filePath,
      issues,
    );

    function followReferencedVariables(node: ts.Node) {
      if (ts.isIdentifier(node)) {
        const initializer = variableInitializers.get(node.text);

        if (initializer && !visitedVariables.has(node.text)) {
          const nextVisitedVariables = new Set(visitedVariables).add(node.text);
          inspectClassNameExpression(initializer, nextVisitedVariables);
        }
      }

      ts.forEachChild(node, followReferencedVariables);
    }

    followReferencedVariables(expression);
  }

  function visit(node: ts.Node) {
    if (
      isClassNameAttribute(node) &&
      node.initializer &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression
    ) {
      inspectClassNameExpression(node.initializer.expression);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return [
    ...new Map(
      issues.map((issue) => [
        `${issue.filePath}:${issue.line}:${issue.column}:${issue.styleName}`,
        issue,
      ]),
    ).values(),
  ];
}

export function getDirectAntStyleNames(
  source: string,
  filePath: string,
): DirectAntStyleUsage[] {
  const componentNames = getAntComponentNames(source);
  const usages: DirectAntStyleUsage[] = [];

  if (componentNames.size === 0) {
    return usages;
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = getRootTagName(node.tagName);

      if (tagName && componentNames.has(tagName)) {
        for (const property of node.attributes.properties) {
          if (
            !isClassNameAttribute(property) ||
            !property.initializer ||
            !ts.isJsxExpression(property.initializer) ||
            !property.initializer.expression
          ) {
            continue;
          }

          for (const { node: styleNode, styleName } of getStyleMembers(
            property.initializer.expression,
          )) {
            usages.push({
              ...getSourcePosition(sourceFile, styleNode),
              styleName,
            });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return usages;
}

async function listSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);

      return entry.isDirectory() ? listSourceFiles(path) : [path];
    }),
  );

  return nestedFiles
    .flat()
    .filter(
      (path) =>
        [".ts", ".tsx"].includes(extname(path)) && !path.endsWith(".d.ts"),
    );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function scanStyleArchitecture(
  sourceRoot: string,
): Promise<StyleArchitectureIssue[]> {
  const sourceFiles = await listSourceFiles(sourceRoot);
  const sourceByFile = new Map(
    await Promise.all(
      sourceFiles.map(
        async (path) => [path, await readFile(path, "utf8")] as const,
      ),
    ),
  );
  const issues: StyleArchitectureIssue[] = [];

  for (const [path, source] of sourceByFile) {
    const displayPath = relative(process.cwd(), path) || path;
    issues.push(...analyzeStyleArchitectureSource(source, displayPath));
    issues.push(...analyzeStyleSelectorScopeSource(source, displayPath));

    const localStyleSources = [...sourceByFile]
      .filter(([candidatePath]) => dirname(candidatePath) === dirname(path))
      .map(([, content]) => content)
      .join("\n");

    for (const usage of getDirectAntStyleNames(source, displayPath)) {
      const stableDefinitionPattern = new RegExp(
        `\\b${escapeRegExp(usage.styleName)}:\\s*css\\x60\\s*&&`,
      );

      if (!stableDefinitionPattern.test(localStyleSources)) {
        issues.push({
          ...usage,
          code: "unstable-antd-override",
          filePath: displayPath,
          message: `Ant Design override "${usage.styleName}" must use a stable scoped selector beginning with &&.`,
        });
      }
    }
  }

  return issues.sort(
    (left, right) =>
      left.filePath.localeCompare(right.filePath) ||
      left.line - right.line ||
      left.column - right.column ||
      left.code.localeCompare(right.code),
  );
}
