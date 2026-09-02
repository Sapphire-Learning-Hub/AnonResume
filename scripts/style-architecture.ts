import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";

import ts from "typescript";

export type StyleArchitectureIssueCode =
  | "conditional-style-modifier"
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
